import { describe, expect, it } from "bun:test";
import { adminDashboardEnabled, extractAdminToken } from "../src/http/adminAuth.js";
import type { AppConfig } from "../src/config.js";

function configWith(overrides?: Partial<AppConfig>): AppConfig {
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
    adminSessionTtlDays: 7,
    ...overrides
  };
}

describe("admin auth", () => {
  it("is disabled without ops token or session secret", () => {
    expect(adminDashboardEnabled(configWith())).toBe(false);
  });

  it("enables dashboard with PLATFORM_OPS_TOKEN or ADMIN_SESSION_SECRET", () => {
    expect(adminDashboardEnabled(configWith({ platformOpsToken: "super-secret-ops-token" }))).toBe(true);
    expect(
      adminDashboardEnabled(
        configWith({ adminSessionSecret: "01234567890123456789012345678901" })
      )
    ).toBe(true);
  });

  it("accepts legacy bearer tokens", () => {
    const config = configWith({ platformOpsToken: "super-secret-ops-token" });
    expect(
      extractAdminToken(
        new Request("http://test/api/admin/overview", { headers: { Authorization: "Bearer abc" } })
      )
    ).toBe("abc");
  });
});
