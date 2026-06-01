import { describe, expect, it } from "bun:test";
import { parseEther } from "viem";
import { buildApp } from "../src/app.js";
import type { AppConfig } from "../src/config.js";

describe("buildApp integration", () => {
  it("wires memory storage, pool accounting, and analytics without external services", async () => {
    const app = buildApp(testConfig());
    await app.repository.saveGroupWallet({
      chatId: "chat",
      safeAddress: "0x1111111111111111111111111111111111111111",
      threshold: 1,
      owners: ["0x2222222222222222222222222222222222222222"],
      createdAt: new Date("2026-05-27T00:00:00.000Z")
    });

    await app.poolService.initializePool("chat", "owner");
    await app.poolService.creditDeposit({
      chatId: "chat",
      telegramUserId: "owner",
      amountWei: parseEther("3"),
      transactionHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    });
    const analytics = await app.poolService.getAnalytics("chat", "owner");

    expect(analytics.safeAddress).toBe("0x1111111111111111111111111111111111111111");
    expect(analytics.member.role).toBe("owner");
    expect(analytics.member.activeValueWei).toBe(parseEther("3"));
  });
});

function testConfig(): AppConfig {
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
    voiceEnabledDefault: false,
    adminSessionTtlDays: 7
  };
}
