import { describe, expect, it } from "bun:test";
import { MemoryRepository } from "../src/storage/memoryRepository.js";
import { AdminAccountService } from "../src/services/adminAccountService.js";
import type { AppConfig } from "../src/config.js";

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
    adminBootstrapEmail: "founder@example.com",
    adminSessionSecret: "01234567890123456789012345678901",
    ...overrides
  };
}

describe("AdminAccountService", () => {
  it("bootstraps the first super admin by email then password login", async () => {
    const repository = new MemoryRepository();
    const service = new AdminAccountService(repository, config());

    expect(await service.checkEmail("founder@example.com")).toEqual({
      step: "set_password",
      email: "founder@example.com"
    });

    const created = await service.setPassword("founder@example.com", "long-password-here");
    expect(created.user.role).toBe("super_admin");

    expect(await service.checkEmail("founder@example.com")).toEqual({
      step: "password",
      email: "founder@example.com"
    });

    const loggedIn = await service.login("founder@example.com", "long-password-here");
    expect(loggedIn.user.email).toBe("founder@example.com");
  });

  it("lets super admins invite teammates without passwords", async () => {
    const repository = new MemoryRepository();
    const service = new AdminAccountService(repository, config());
    await service.setPassword("founder@example.com", "long-password-here");
    const founder = (await service.login("founder@example.com", "long-password-here")).user;
    const actor = (await repository.getAdminUserById(founder.id))!;

    const invite = await service.inviteUser("ops@example.com", "admin");
    expect(invite.hasPassword).toBe(false);
    expect((await service.checkEmail("ops@example.com")).step).toBe("set_password");

    await service.removeUser(invite.id, actor);
    expect(await repository.getAdminUserByEmail("ops@example.com")).toBeNull();
  });
});
