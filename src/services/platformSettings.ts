import type { AppConfig } from "../config.js";
import type { Repository } from "../storage/repository.js";

export const PLATFORM_FLAG_KEYS = {
  video: "video_enabled",
  voice: "voice_enabled"
} as const;

export type PlatformFlagKey = (typeof PLATFORM_FLAG_KEYS)[keyof typeof PLATFORM_FLAG_KEYS];

export type PlatformFlagDefinition = {
  key: PlatformFlagKey;
  label: string;
  description: string;
  envDefault: boolean;
  runtimeConfigured: boolean;
};

export type PlatformFlagState = PlatformFlagDefinition & {
  effective: boolean;
  source: "env" | "remote";
};

function parseBool(value: string | null | undefined): boolean | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (value === "true" || value === "1" || value === "on") {
    return true;
  }
  if (value === "false" || value === "0" || value === "off") {
    return false;
  }
  return null;
}

function formatBool(value: boolean): string {
  return value ? "true" : "false";
}

// Runtime feature flags stored in Postgres (or memory) with env fallbacks.
export class PlatformSettingsService {
  constructor(
    private readonly repository: Repository,
    private readonly config: AppConfig
  ) {}

  flagDefinitions(): PlatformFlagDefinition[] {
    return [
      {
        key: PLATFORM_FLAG_KEYS.video,
        label: "Video notes",
        description: "Nancy avatar + waveform MP4 on /nancy token detail (requires Kokoro TTS + ffmpeg).",
        envDefault: this.config.videoEnabledDefault,
        runtimeConfigured: this.config.kokoroTtsUrl !== undefined
      },
      {
        key: PLATFORM_FLAG_KEYS.voice,
        label: "Voice notes",
        description: "Telegram voice verdicts on /nancy token detail (requires Kokoro TTS URL).",
        envDefault: this.config.voiceEnabledDefault,
        runtimeConfigured: this.config.kokoroTtsUrl !== undefined
      }
    ];
  }

  async getFlag(key: PlatformFlagKey): Promise<PlatformFlagState> {
    const definition = this.flagDefinitions().find((flag) => flag.key === key);
    if (definition === undefined) {
      throw new Error(`Unknown platform flag: ${key}`);
    }
    const remote = parseBool(await this.repository.getPlatformSetting(key));
    if (remote !== null) {
      return { ...definition, effective: remote, source: "remote" };
    }
    return { ...definition, effective: definition.envDefault, source: "env" };
  }

  async listFlags(): Promise<PlatformFlagState[]> {
    const definitions = this.flagDefinitions();
    const remote = await this.repository.listPlatformSettings();
    return definitions.map((definition) => {
      const parsed = parseBool(remote[definition.key]);
      if (parsed !== null) {
        return { ...definition, effective: parsed, source: "remote" as const };
      }
      return { ...definition, effective: definition.envDefault, source: "env" as const };
    });
  }

  async setFlag(key: PlatformFlagKey, enabled: boolean): Promise<void> {
    await this.repository.setPlatformSetting(key, formatBool(enabled));
  }

  async clearFlag(key: PlatformFlagKey): Promise<void> {
    await this.deletePlatformSetting(key);
  }

  async isVideoEnabled(): Promise<boolean> {
    return (await this.getFlag(PLATFORM_FLAG_KEYS.video)).effective;
  }

  async isVoiceEnabled(): Promise<boolean> {
    return (await this.getFlag(PLATFORM_FLAG_KEYS.voice)).effective;
  }

  private async deletePlatformSetting(key: string): Promise<void> {
    await this.repository.deletePlatformSetting(key);
  }
}
