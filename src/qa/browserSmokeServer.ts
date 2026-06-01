import { privateKeyToAccount } from "viem/accounts";
import type { AppConfig } from "../config.js";
import { buildApp } from "../app.js";
import { createFetchHandler } from "../http/server.js";
import { buildWalletLinkMessage } from "../services/walletLinkService.js";
import type { WalletLink } from "../domain/types.js";

// Long-running, offline server used to browser-drive the one-click link page.
// Seeds a deterministic pending wallet link and prints the URL, the wallet
// address, and a valid precomputed signature so a headless browser can inject
// a fake `window.ethereum` and complete the real one-click flow.

const PORT = 3999;

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
    httpPort: PORT,
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

const config = smokeConfig();
const app = buildApp(config);
const account = privateKeyToAccount("0x59c6995e998f97a5a004497e5da5cf9e7ae6b36f10a0edbb1d5828dce3f2b0b5");

const link: WalletLink = {
  telegramUserId: "9001",
  address: account.address,
  nonce: "browsersmoke0001",
  status: "pending",
  createdAt: new Date("2026-05-28T00:00:00.000Z")
};
await app.repository.saveWalletLink(link);
const signature = await account.signMessage({ message: buildWalletLinkMessage(link) });

Bun.serve({ port: PORT, fetch: createFetchHandler(app, config) });

// eslint-disable-next-line no-console
console.log(
  JSON.stringify({
    ready: true,
    url: `http://localhost:${PORT}/link/${link.nonce}`,
    address: account.address,
    signature
  })
);

// Expose a tiny status endpoint isn't needed; the test verifies via the link
// becoming "linked". Keep the process alive until killed.
await new Promise(() => {});
