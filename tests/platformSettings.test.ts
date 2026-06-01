import { describe, expect, it } from "bun:test";
import { MemoryRepository } from "../src/storage/memoryRepository.js";
import { PlatformSettingsService, PLATFORM_FLAG_KEYS } from "../src/services/platformSettings.js";
import type { AppConfig } from "../src/config.js";

function baseConfig(overrides?: Partial<AppConfig>): AppConfig {
  return {
    appEnv: "test",
    storageDriver: "memory",
    telegramBotToken: "123:test",
    bscChainId: 56,
    bscRpcUrl: "https://bsc-dataseed.bnbchain.org",
    platformFeeRecipient: "0x3333333333333333333333333333333333333333",
    platformCommissionReceiver: "0x4444444444444444444444444444444444444444",
    tradeFeeBps: 10,
    poolWithdrawalFeeBps: 25,
    dexDeadlineSeconds: 86400,
    httpPort: 3000,
    depositWatchEnabled: false,
    platformAdminIds: [],
    riskCheckMode: "warn",
    minLiquidityUsd: 1000,
    maxBuyTaxBps: 1500,
    maxSellTaxBps: 1500,
    elizaOkTrendingUrl: "https://elizatest.com/api/elizaok/trending",
    elizaModelName: "eliza-1",
    watchlistMaxTokens: 10,
    watchlistCacheSeconds: 60,
    watchlistDefaultSizeBnb: 0.1,
    maxExitSlippageBps: 1500,
    minLpLockedPercent: 50,
    maxLpHolderTopPercent: 50,
    videoEnabledDefault: false,
    voiceEnabledDefault: true,
    adminSessionTtlDays: 7,
    kokoroTtsUrl: "http://kokoro.test",
    ...overrides
  };
}

describe("PlatformSettingsService", () => {
  it("uses env defaults until a remote override is stored", async () => {
    const service = new PlatformSettingsService(new MemoryRepository(), baseConfig());
    expect(await service.isVoiceEnabled()).toBe(true);
    expect(await service.isVideoEnabled()).toBe(false);

    await service.setFlag(PLATFORM_FLAG_KEYS.video, true);
    expect(await service.isVideoEnabled()).toBe(true);
    expect((await service.getFlag(PLATFORM_FLAG_KEYS.video)).source).toBe("remote");

    await service.clearFlag(PLATFORM_FLAG_KEYS.video);
    expect(await service.isVideoEnabled()).toBe(false);
    expect((await service.getFlag(PLATFORM_FLAG_KEYS.video)).source).toBe("env");
  });
});
