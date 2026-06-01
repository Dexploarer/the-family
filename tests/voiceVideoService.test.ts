import { describe, expect, it } from "bun:test";
import { fileURLToPath } from "node:url";
import { readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { buildFfmpegArgs, VoiceVideoService } from "../src/services/voiceVideoService.js";

const hasTools = Bun.which("ffmpeg") !== null && Bun.which("ffprobe") !== null;
const avatarPath = fileURLToPath(new URL("../assets/bnancy.png", import.meta.url));

async function makeOpusOgg(durationSec: number): Promise<Buffer> {
  const out = join(tmpdir(), `vv-test-${randomUUID()}.ogg`);
  const proc = Bun.spawn(
    [
      "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
      "-f", "lavfi", "-i", `sine=frequency=330:duration=${durationSec}`,
      "-af", "tremolo=f=3:d=0.9", "-c:a", "libopus", "-b:a", "32k", out
    ],
    { stdout: "ignore", stderr: "ignore" }
  );
  await proc.exited;
  const buf = await readFile(out);
  await rm(out, { force: true });
  return buf;
}

async function ffprobe(buf: Buffer): Promise<{ codecs: string[]; duration: number }> {
  const f = join(tmpdir(), `vv-probe-${randomUUID()}.mp4`);
  await writeFile(f, buf);
  try {
    const proc = Bun.spawn(
      ["ffprobe", "-v", "error", "-print_format", "json", "-show_streams", "-show_format", f],
      { stdout: "pipe", stderr: "ignore" }
    );
    const json = JSON.parse(await new Response(proc.stdout).text()) as {
      streams: { codec_type: string }[];
      format: { duration: string };
    };
    return {
      codecs: json.streams.map((s) => s.codec_type),
      duration: Number(json.format.duration)
    };
  } finally {
    await rm(f, { force: true });
  }
}

describe("voiceVideoService buildFfmpegArgs", () => {
  const args = buildFfmpegArgs({
    avatarPath: "/assets/bnancy.png",
    audioPath: "/tmp/in.ogg",
    outPath: "/tmp/out.mp4"
  });

  it("loops the avatar as the first input and reads the audio as the second", () => {
    const loopIdx = args.indexOf("-loop");
    expect(loopIdx).toBeGreaterThanOrEqual(0);
    expect(args[loopIdx + 1]).toBe("1");
    // first -i is the looped avatar
    const firstI = args.indexOf("-i");
    expect(args[firstI + 1]).toBe("/assets/bnancy.png");
    // second -i is the audio
    const secondI = args.indexOf("-i", firstI + 1);
    expect(args[secondI + 1]).toBe("/tmp/in.ogg");
  });

  it("splits the audio so it both drives the waveform and survives to the output", () => {
    const fc = args[args.indexOf("-filter_complex") + 1] ?? "";
    expect(fc).toContain("asplit"); // audio fed to BOTH waveform and output (no silent-audio drop)
    expect(fc).toContain("showwaves");
    expect(fc).toContain("overlay");
    // the passthrough audio leg and composited video leg are both mapped out
    const maps = args.filter((a, i) => args[i - 1] === "-map");
    expect(maps).toContain("[v]");
    expect(maps).toContain("[ao]");
  });

  it("encodes a Telegram/web-friendly MP4 cut to the audio length", () => {
    expect(args).toContain("libx264");
    expect(args).toContain("yuv420p");
    expect(args).toContain("-shortest");
    expect(args).toContain("+faststart");
    expect(args[args.length - 1]).toBe("/tmp/out.mp4");
  });
});

describe("voiceVideoService render (needs ffmpeg)", () => {
  it.skipIf(!hasTools)("renders an MP4 that keeps the audio and matches its duration", async () => {
    const audio = await makeOpusOgg(2);
    const svc = new VoiceVideoService({ avatarPath });
    const video = await svc.render(audio);

    expect(video).not.toBeNull();
    const probe = await ffprobe(video!);
    // both legs survived: composited video AND the passthrough audio
    expect(probe.codecs).toContain("video");
    expect(probe.codecs).toContain("audio");
    // cut to the audio length, not infinite (the -loop 1 image) or truncated
    expect(probe.duration).toBeGreaterThan(1.5);
    expect(probe.duration).toBeLessThan(2.5);
  });

  it.skipIf(!hasTools)("returns null when ffmpeg cannot read the avatar", async () => {
    const audio = await makeOpusOgg(1);
    const svc = new VoiceVideoService({ avatarPath: "/no/such/avatar.png" });
    expect(await svc.render(audio)).toBeNull();
  });
});
