import type { Repository } from "../storage/repository.js";

export type VideoSettingSource = "env" | "remote";

export type VideoFeatureState = {
  enabled: boolean;
  source: VideoSettingSource;
  envDefault: boolean;
};

const SETTING_KEY = "video_enabled";

// BNancy video notes (avatar + waveform MP4) are gated separately from voice/TTS.
// Env sets the boot default; platform admins or the ops HTTP API can override
// at runtime without redeploying (stored in platform_settings).
export class VideoFeatureService {
  constructor(
    private readonly envDefault: boolean,
    private readonly repository: Repository
  ) {}

  async getState(): Promise<VideoFeatureState> {
    const override = await this.repository.getPlatformSetting(SETTING_KEY);
    if (override === "true") {
      return { enabled: true, source: "remote", envDefault: this.envDefault };
    }
    if (override === "false") {
      return { enabled: false, source: "remote", envDefault: this.envDefault };
    }
    return { enabled: this.envDefault, source: "env", envDefault: this.envDefault };
  }

  async isEnabled(): Promise<boolean> {
    return (await this.getState()).enabled;
  }

  async setRemoteEnabled(enabled: boolean): Promise<void> {
    await this.repository.setPlatformSetting(SETTING_KEY, enabled ? "true" : "false");
  }

  async clearRemoteOverride(): Promise<void> {
    await this.repository.deletePlatformSetting(SETTING_KEY);
  }
}
