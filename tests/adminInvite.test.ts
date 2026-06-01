import { afterEach, describe, expect, it } from "bun:test";
import type { AppConfig } from "../src/config.js";
import type { AdminUser } from "../src/domain/types.js";
import { AdminInviteService } from "../src/services/adminInviteService.js";
import { MemoryRepository } from "../src/storage/memoryRepository.js";

const actor: AdminUser = {
  id: "admin_founder",
  email: "founder@example.com",
  passwordHash: "hash",
  role: "super_admin",
  createdAt: new Date("2026-06-01T00:00:00.000Z"),
  updatedAt: new Date("2026-06-01T00:00:00.000Z"),
  lastLoginAt: null
};

describe("AdminInviteService", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => Object.defineProperty(globalThis, "fetch", { configurable: true, value: originalFetch }));

  it("reports when AgentMail is not configured", async () => {
    const service = new AdminInviteService(new MemoryRepository(), config());

    const result = await service.createInvite("ops@example.com", "admin", actor);

    expect(result.emailDeliveryStatus).toBe("agentmail_not_configured");
  });

  it("reports AgentMail delivery failures separately from missing config", async () => {
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      value: async () => new Response("bad gateway", { status: 502, statusText: "Bad Gateway" })
    });
    const service = new AdminInviteService(
      new MemoryRepository(),
      config({ agentMailApiKey: "agentmail_test_key", agentMailInboxId: "inbox_test" })
    );

    const result = await service.createInvite("ops@example.com", "admin", actor);

    expect(result.emailDeliveryStatus).toBe("agentmail_send_failed");
  });

  it("reports successful AgentMail invite delivery", async () => {
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      value: async () => new Response(null, { status: 200 })
    });
    const service = new AdminInviteService(
      new MemoryRepository(),
      config({ agentMailApiKey: "agentmail_test_key", agentMailInboxId: "inbox_test" })
    );

    const result = await service.createInvite("ops@example.com", "admin", actor);

    expect(result.emailDeliveryStatus).toBe("sent");
  });
});

function config(overrides?: Partial<AppConfig>): AppConfig {
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
