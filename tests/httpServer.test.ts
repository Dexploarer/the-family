import { describe, expect, it } from "bun:test";
import { parseEther, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { buildApp, type App } from "../src/app.js";
import type { AppConfig } from "../src/config.js";
import { createFetchHandler } from "../src/http/server.js";
import { buildWalletLinkMessage, WalletLinkService } from "../src/services/walletLinkService.js";
import { SafeSubmissionService } from "../src/services/safeSubmissionService.js";
import { PoolService } from "../src/services/poolService.js";
import { MemoryRepository } from "../src/storage/memoryRepository.js";
import { MemoryPoolRepository } from "../src/storage/memoryPoolRepository.js";
import { SimulatedSafeService } from "../src/qa/fullSimulationFakes.js";

const ownerKey = "0x59c6995e998f97a5a004497e5da5cf9e7ae6b36f10a0edbb1d5828dce3f2b0b5";

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

describe("HTTP fetch handler", () => {
  it("serves /health and /api/health", async () => {
    const handler = createFetchHandler(buildApp(testConfig()), testConfig());
    for (const path of ["/health", "/api/health"]) {
      const response = await handler(new Request(`http://test${path}`));
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ok: true });
    }
  });

  it("returns 404 for unknown routes", async () => {
    const handler = createFetchHandler(buildApp(testConfig()), testConfig());
    const response = await handler(new Request("http://test/nope"));
    expect(response.status).toBe(404);
  });

  it("renders the wallet link page for a pending link", async () => {
    const app = buildApp(testConfig());
    const handler = createFetchHandler(app, testConfig());
    const account = privateKeyToAccount(ownerKey);
    const { link } = await app.walletLinkService.beginLink("111", account.address);

    const response = await handler(new Request(`http://test/link/${encodeURIComponent(link.nonce)}`));
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(html).toContain(account.address);
    expect(html).toContain("/api/wallet-links/");
  });

  it("links a wallet end-to-end through the signature endpoint", async () => {
    const app = buildApp(testConfig());
    const handler = createFetchHandler(app, testConfig());
    const account = privateKeyToAccount(ownerKey);
    const { link } = await app.walletLinkService.beginLink("111", account.address);
    const signature = await account.signMessage({ message: buildWalletLinkMessage(link) });

    const response = await handler(
      new Request(`http://test/api/wallet-links/${encodeURIComponent(link.nonce)}/signatures`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signature })
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ address: account.address, status: "linked" });
    const stored = await app.repository.getWalletLink("111", account.address);
    expect(stored?.status).toBe("linked");
  });

  it("rejects a wallet-link signature from the wrong key", async () => {
    const app = buildApp(testConfig());
    const handler = createFetchHandler(app, testConfig());
    const account = privateKeyToAccount(ownerKey);
    const { link } = await app.walletLinkService.beginLink("111", account.address);
    const wrongKey = privateKeyToAccount("0x0000000000000000000000000000000000000000000000000000000000000abc");
    const signature = await wrongKey.signMessage({ message: buildWalletLinkMessage(link) });

    const response = await handler(
      new Request(`http://test/api/wallet-links/${encodeURIComponent(link.nonce)}/signatures`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signature })
      })
    );

    expect(response.status).toBe(400);
    const stored = await app.repository.getWalletLink("111", account.address);
    expect(stored?.status).toBe("pending");
  });

  it("creates and completes a wallet link from the connected wallet without a typed address or nonce", async () => {
    const app = buildApp(testConfig());
    const handler = createFetchHandler(app, testConfig());
    const account = privateKeyToAccount(ownerKey);

    const createResponse = await handler(
      new Request("http://test/api/wallet-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telegramUserId: "222", address: account.address })
      })
    );
    expect(createResponse.status).toBe(200);
    const created = (await createResponse.json()) as { nonce: string; message: string };

    const signature = await account.signMessage({ message: created.message });
    const completeResponse = await handler(
      new Request(`http://test/api/wallet-links/${encodeURIComponent(created.nonce)}/signatures`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signature })
      })
    );
    expect(completeResponse.status).toBe(200);
    const stored = await app.repository.getWalletLink("222", account.address);
    expect(stored?.status).toBe("linked");
  });

  it("rejects creating a wallet link with no Telegram identity", async () => {
    const handler = createFetchHandler(buildApp(testConfig()), testConfig());
    const account = privateKeyToAccount(ownerKey);
    const response = await handler(
      new Request("http://test/api/wallet-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: account.address })
      })
    );
    expect(response.status).toBe(400);
  });

  it("returns pool analytics JSON for a member", async () => {
    const app = buildApp(testConfig());
    const handler = createFetchHandler(app, testConfig());
    await app.repository.saveGroupWallet({
      chatId: "chat",
      safeAddress: "0x1111111111111111111111111111111111111111",
      threshold: 1,
      owners: ["0x2222222222222222222222222222222222222222"],
      createdAt: new Date("2026-05-27T00:00:00.000Z")
    });
    await app.poolService.initializePool("chat", "111");

    const response = await handler(new Request("http://test/api/pools/chat/analytics?telegramUserId=111"));
    const body = (await response.json()) as { member: { role: string } };

    expect(response.status).toBe(200);
    expect(body.member.role).toBe("owner");
  });

  it("proposes a Safe transaction through the signature endpoint", async () => {
    const repository = new MemoryRepository();
    const poolRepository = new MemoryPoolRepository();
    const walletLinkService = new WalletLinkService(repository);
    const poolService = new PoolService(repository, poolRepository, 25);
    const safeService = new SimulatedSafeService(1);
    const platformFeeRecipient: Address = "0x8888888888888888888888888888888888888888";
    const safeSubmissionService = new SafeSubmissionService(repository, safeService as never, walletLinkService, poolService, platformFeeRecipient);

    const account = privateKeyToAccount(ownerKey);
    await repository.saveGroupWallet({
      chatId: "chat",
      safeAddress: "0x9999999999999999999999999999999999999999",
      threshold: 1,
      owners: [account.address],
      createdAt: new Date("2026-05-27T00:00:00.000Z")
    });
    // Link the owner wallet via the real proof path.
    const { link } = await walletLinkService.beginLink("111", account.address);
    await walletLinkService.completeLink("111", account.address, await account.signMessage({ message: buildWalletLinkMessage(link) }));
    await repository.saveTradeProposal({
      id: "trade_http",
      chatId: "chat",
      proposerTelegramId: "111",
      tokenAddress: "0x7777777777777777777777777777777777777777",
      inputAmountWei: parseEther("1"),
      minOutputAmount: 1n,
      feeAmountWei: parseEther("0.001"),
      route: "pancakeswap-v2",
      status: "created",
      riskReport: { tokenAddress: "0x7777777777777777777777777777777777777777", level: "low", blocked: false, reasons: [], checkedAt: new Date("2026-05-27T00:00:00.000Z") },
      transactions: [{ to: "0x7777777777777777777777777777777777777777", value: parseEther("1"), data: "0x", label: "buy" }],
      createdAt: new Date("2026-05-27T00:00:00.000Z")
    });
    await poolService.initializePool("chat", "111");
    const submission = await safeSubmissionService.prepareTradeSubmission("chat", "trade_http", "111");
    const signature = await account.signMessage({ message: { raw: submission.safeTxHash } });

    const appState = { walletLinkService, safeSubmissionService, poolService } as unknown as App;
    const handler = createFetchHandler(appState, testConfig());
    const response = await handler(
      new Request(`http://test/api/safe-submissions/${encodeURIComponent(submission.id)}/signatures`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telegramUserId: "111", ownerAddress: account.address, signature })
      })
    );
    const body = (await response.json()) as { status: string };

    expect(response.status).toBe(200);
    expect(body.status).toBe("submitted");
  });

  it("serves the operator dashboard shell", async () => {
    const handler = createFetchHandler(buildApp(testConfig()), testConfig());
    const response = await handler(new Request("http://test/admin"));
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(html).toContain("Operator Control");
    expect(html).toContain("/api/admin/overview");
    expect(html).toContain("AgentMail is not configured");
    expect(html).toContain("AgentMail delivery failed");
  });

  it("protects admin APIs when dashboard is not configured", async () => {
    const handler = createFetchHandler(buildApp(testConfig()), testConfig());
    const response = await handler(new Request("http://test/api/admin/overview"));
    expect(response.status).toBe(503);
  });

  it("returns admin overview for legacy ops token", async () => {
    const config = { ...testConfig(), platformOpsToken: "test-ops-token-secret" };
    const handler = createFetchHandler(buildApp(config), config);
    const response = await handler(
      new Request("http://test/api/admin/overview", {
        headers: { Authorization: "Bearer test-ops-token-secret" }
      })
    );
    expect(response.status).toBe(200);
  });

  it("bootstraps email admin login with cookie session", async () => {
    const config = {
      ...testConfig(),
      adminBootstrapEmail: "founder@example.com",
      adminSessionSecret: "01234567890123456789012345678901"
    };
    const app = buildApp(config);
    const handler = createFetchHandler(app, config);

    const setPassword = await handler(
      new Request("http://test/api/admin/auth/set-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "founder@example.com", password: "long-password-here" })
      })
    );
    expect(setPassword.status).toBe(200);
    const cookie = setPassword.headers.get("set-cookie");
    expect(cookie).toContain("bnancy_admin_session=");

    const overview = await handler(
      new Request("http://test/api/admin/overview", {
        headers: { Cookie: cookie!.split(";")[0]! }
      })
    );
    expect(overview.status).toBe(200);
  });
});
