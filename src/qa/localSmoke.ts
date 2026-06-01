import { privateKeyToAccount } from "viem/accounts";
import type { AppConfig } from "../config.js";
import { buildApp } from "../app.js";
import { createFetchHandler } from "../http/server.js";
import { AppError } from "../domain/errors.js";
import { Logger } from "../logger.js";
import { buildWalletLinkMessage } from "../services/walletLinkService.js";

// Boots a real Bun HTTP server (no Telegram, no chain) and drives the public
// routes over localhost to smoke-test the one-click link flow end to end.

function smokeConfig(): AppConfig {
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
    httpPort: 0,
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

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new AppError(`[LocalSmoke] ${message}`);
  }
}

const config = smokeConfig();
const app = buildApp(config);
const server = Bun.serve({ port: 0, fetch: createFetchHandler(app, config) });
const base = `http://localhost:${server.port}`;

try {
  // 1. health
  const health = await fetch(`${base}/health`);
  assert(health.status === 200, "health did not return 200");
  assert(((await health.json()) as { ok: boolean }).ok === true, "health body not ok");

  // 2. unknown route
  assert((await fetch(`${base}/does-not-exist`)).status === 404, "unknown route did not 404");

  // 3. one-click link flow
  const account = privateKeyToAccount("0x59c6995e998f97a5a004497e5da5cf9e7ae6b36f10a0edbb1d5828dce3f2b0b5");
  const { link } = await app.walletLinkService.beginLink("777", account.address);

  const page = await fetch(`${base}/link/${encodeURIComponent(link.nonce)}`);
  const pageHtml = await page.text();
  assert(page.status === 200, "link page did not return 200");
  assert(pageHtml.includes(account.address), "link page missing the wallet address");
  assert(pageHtml.includes("/api/wallet-links/"), "link page missing the submit endpoint");

  const signature = await account.signMessage({ message: buildWalletLinkMessage(link) });
  const submit = await fetch(`${base}/api/wallet-links/${encodeURIComponent(link.nonce)}/signatures`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ signature })
  });
  const submitBody = (await submit.json()) as { status: string; address: string };
  assert(submit.status === 200, `link submit did not return 200 (got ${submit.status})`);
  assert(submitBody.status === "linked", "wallet link was not completed");
  assert(submitBody.address === account.address, "linked address mismatch");

  // 4. a wrong-key signature is rejected
  const wrong = privateKeyToAccount("0x0000000000000000000000000000000000000000000000000000000000000abc");
  const { link: link2 } = await app.walletLinkService.beginLink("778", wrong.address);
  const badSig = await account.signMessage({ message: buildWalletLinkMessage(link2) });
  const rejected = await fetch(`${base}/api/wallet-links/${encodeURIComponent(link2.nonce)}/signatures`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ signature: badSig })
  });
  assert(rejected.status === 400, "wrong-key signature was not rejected");

  // 4b. connect-first link: create the link from the connected wallet (no typed address), then sign
  const connectAccount = privateKeyToAccount("0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a");
  const createResponse = await fetch(`${base}/api/wallet-links`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ telegramUserId: "779", address: connectAccount.address })
  });
  const createBody = (await createResponse.json()) as { nonce: string; message: string };
  assert(createResponse.status === 200, `create wallet link did not return 200 (got ${createResponse.status})`);
  const connectSignature = await connectAccount.signMessage({ message: createBody.message });
  const connectComplete = await fetch(`${base}/api/wallet-links/${encodeURIComponent(createBody.nonce)}/signatures`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ signature: connectSignature })
  });
  const connectCompleteBody = (await connectComplete.json()) as { status: string };
  assert(connectComplete.status === 200, "connect-first link submit did not return 200");
  assert(connectCompleteBody.status === "linked", "connect-first wallet link was not completed");

  // 5. pool analytics over HTTP
  await app.repository.saveGroupWallet({
    chatId: "smoke",
    safeAddress: "0x1111111111111111111111111111111111111111",
    threshold: 1,
    owners: ["0x2222222222222222222222222222222222222222"],
    createdAt: new Date()
  });
  await app.poolService.initializePool("smoke", "777");
  const analytics = await fetch(`${base}/api/pools/smoke/analytics?telegramUserId=777`);
  const analyticsBody = (await analytics.json()) as { member: { role: string } };
  assert(analytics.status === 200, "pool analytics did not return 200");
  assert(analyticsBody.member.role === "owner", "pool analytics role mismatch");

  Logger.info("[LocalSmoke] All local HTTP smoke checks passed", { port: server.port });
} finally {
  server.stop(true);
}
