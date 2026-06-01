import { randomUUID } from "node:crypto";
import { readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConcurrencyGate } from "../concurrencyGate.js";
import { Logger } from "../logger.js";

// The waveform band: gold (BNB brand) cline, placed over BNancy's jacket so it
// reads clearly and clears the wordmark. asplit feeds the audio to BOTH the
// waveform filter and the output map — without it ffmpeg silently drops the
// audio (it gets consumed by showwaves). scale=720:-2 keeps the avatar's aspect
// with even dimensions (libx264 + yuv420p require it).
const FILTER_COMPLEX =
  "[0:v]scale=720:-2,setsar=1[bg];" +
  "[1:a]asplit=2[aw][ao];" +
  "[aw]showwaves=s=720x210:mode=cline:colors=0xF3BA2F:rate=25:draw=full[wv];" +
  "[bg][wv]overlay=x=0:y=400:format=auto[v]";

// Pure: builds the ffmpeg argv. Kept separate from render() so the command can be
// asserted without spawning ffmpeg.
export function buildFfmpegArgs(opts: { avatarPath: string; audioPath: string; outPath: string }): string[] {
  return [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-loop",
    "1",
    "-i",
    opts.avatarPath,
    "-i",
    opts.audioPath,
    "-filter_complex",
    FILTER_COMPLEX,
    "-map",
    "[v]",
    "-map",
    "[ao]",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-r",
    "25",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-movflags",
    "+faststart",
    "-shortest",
    opts.outPath
  ];
}

export type VoiceVideoConfig = {
  avatarPath: string;
  ffmpegPath?: string;
  timeoutMs?: number;
  // ffmpeg is CPU-heavy and shares the single process with money mutations, so
  // cap simultaneous renders and bound the wait queue (extra taps back off).
  maxConcurrent?: number;
  maxQueued?: number;
};

// Renders a BNancy avatar + waveform MP4 from a voice-note audio buffer (the same
// opus/ogg bytes VoiceService produces). Returns null on any failure (caller
// degrades gracefully — no video note), mirroring VoiceService's contract.
export class VoiceVideoService {
  private readonly gate: ConcurrencyGate;

  constructor(private readonly config: VoiceVideoConfig) {
    this.gate = new ConcurrencyGate(config.maxConcurrent ?? 2, config.maxQueued ?? 8);
  }

  async render(audio: Buffer): Promise<Buffer | null> {
    if (!(await this.gate.acquire())) {
      Logger.warn("[VoiceVideo] render rejected — too many in flight");
      return null;
    }
    const ffmpeg = this.config.ffmpegPath ?? "ffmpeg";
    const id = randomUUID();
    const audioPath = join(tmpdir(), `bnancy-voice-${id}.ogg`);
    const outPath = join(tmpdir(), `bnancy-video-${id}.mp4`);
    const startedAt = performance.now();
    try {
      await writeFile(audioPath, audio);
      const proc = Bun.spawn([ffmpeg, ...buildFfmpegArgs({ avatarPath: this.config.avatarPath, audioPath, outPath })], {
        stdout: "ignore",
        stderr: "pipe"
      });
      const timer = setTimeout(() => proc.kill(), this.config.timeoutMs ?? 60000);
      const exitCode = await proc.exited;
      clearTimeout(timer);
      const ms = Math.round(performance.now() - startedAt);
      if (exitCode !== 0) {
        const stderr = (await new Response(proc.stderr).text()).slice(0, 500);
        Logger.warn("[VoiceVideo] ffmpeg non-zero", { exitCode, stderr, ms });
        return null;
      }
      const out = await readFile(outPath);
      Logger.info("[VoiceVideo] render ok", { bytes: out.length, ms });
      return out.length > 0 ? out : null;
    } catch (error) {
      Logger.warn("[VoiceVideo] render failed", {
        err: error instanceof Error ? error.message : String(error),
        ms: Math.round(performance.now() - startedAt)
      });
      return null;
    } finally {
      await rm(audioPath, { force: true }).catch(() => {});
      await rm(outPath, { force: true }).catch(() => {});
      this.gate.release();
    }
  }
}
