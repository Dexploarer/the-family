import { afterEach, describe, expect, it } from "bun:test";
import { VoiceService, voiceSupported } from "../src/services/voiceService.js";

describe("voiceService", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => Object.defineProperty(globalThis, "fetch", { configurable: true, value: originalFetch }));

  it("voiceSupported returns true for supported language", () => {
    expect(voiceSupported("en")).toBe(true);
  });

  it("voiceSupported returns false for unsupported language", () => {
    expect(voiceSupported("ru")).toBe(false);
  });

  it("synthesize for supported language posts to the URL with correct voice and returns a Buffer", async () => {
    let capturedUrl = "";
    let capturedBody: { model: string; input: string; voice: string; response_format: string } | undefined;
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      value: async (url: string, init: { body: string }) => {
        capturedUrl = url;
        capturedBody = JSON.parse(init.body);
        return {
          ok: true,
          arrayBuffer: async () => new TextEncoder().encode("audiobytes").buffer
        } as Response;
      }
    });
    const svc = new VoiceService({ url: "https://tts.example/synthesize" });
    const result = await svc.synthesize("Hello BNancy", "en");
    expect(capturedUrl).toBe("https://tts.example/synthesize");
    expect(capturedBody?.voice).toBe("af_bella");
    expect(result).not.toBeNull();
    expect(result instanceof Buffer).toBe(true);
  });

  it("synthesize for unsupported language returns null without fetching", async () => {
    let fetched = false;
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      value: async () => {
        fetched = true;
        return { ok: true, arrayBuffer: async () => new ArrayBuffer(0) } as Response;
      }
    });
    const svc = new VoiceService({ url: "https://tts.example/synthesize" });
    const result = await svc.synthesize("Привет", "ru");
    expect(result).toBeNull();
    expect(fetched).toBe(false);
  });

  it("synthesize returns null on non-ok response", async () => {
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      value: async () => ({ ok: false, status: 503 } as Response)
    });
    const svc = new VoiceService({ url: "https://tts.example/synthesize" });
    const result = await svc.synthesize("Hello", "en");
    expect(result).toBeNull();
  });
});
