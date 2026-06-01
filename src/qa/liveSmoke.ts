import { Bot } from "grammy";
import { createPublicClient, http, parseEther, type Address } from "viem";
import { bsc, bscTestnet } from "viem/chains";
import { Pool } from "pg";
import { getBscContractAddresses, NATIVE_TOKEN_ADDRESS } from "../chain/addresses.js";
import { PancakeSwapService } from "../chain/pancakeSwapService.js";
import type { AppConfig } from "../config.js";
import { loadConfig } from "../config.js";
import { AppError } from "../domain/errors.js";
import { Logger } from "../logger.js";
import {
  BOT_COMMANDS,
  BOT_DESCRIPTION,
  BOT_NAME,
  BOT_SHORT_DESCRIPTION
} from "../bot/telegramCommands.js";
import { parseAddress } from "../utils/evm.js";
import { buildPgPoolConfig } from "../storage/pgPoolConfig.js";
import { assertHttpOk } from "./httpChecks.js";

const BSC_USDT: Address = "0x55d398326f99059fF775485246999027B3197955";

type SmokeCheck = {
  name: string;
  status: "passed" | "skipped";
  detail: string;
};

const config = loadConfig();
const checks: SmokeCheck[] = [];
const addresses = getBscContractAddresses(config.bscChainId);
const publicClient = createPublicClient({
  chain: config.bscChainId === 56 ? bsc : bscTestnet,
  transport: http(config.bscRpcUrl)
});

await checkTelegramMetadata(config);
await checkBscRpc(config);
await checkContractCode("Safe singleton", addresses.safeSingleton);
await checkContractCode("Safe proxy factory", addresses.safeProxyFactory);
await checkContractCode("Safe fallback handler", addresses.safeFallbackHandler);
await checkContractCode("Safe MultiSendCallOnly", addresses.multiSendCallOnly);
await checkContractCode("Flap portal", addresses.portal);
await checkContractCode("Flap vault portal", addresses.vaultPortal);
await checkContractCode("Flap Split Vault factory", addresses.splitVaultFactory);
await checkOptionalContractCode("PancakeSwap V2 router", addresses.pancakeV2Router);
await checkOptionalContractCode("WBNB", addresses.wbnb);
await checkSafeTransactionService(config);
await checkPancakeQuote(config);
await checkPublicHttp(config);
await checkPostgres(config);
await checkPinata(config);
skip("funded Safe deployment", "requires an owner wallet deploy via /deploy/<sessionId> and approved mainnet/testnet gas spend");
skip("funded Safe execution", "requires a prepared Safe tx with threshold owner confirmations and an owner wallet execution");
skip("funded PancakeSwap buy", "quote/build is tested; live swap spend is intentionally not run by smoke");
skip("funded Flap launch", "transaction builder is tested; live token launch requires approved spend and metadata");
skip("Telegram group inline button flow", "requires a real group chat/admin interaction; Bot API metadata is tested live");

Logger.info("[LiveSmoke] Live smoke checks completed", { checks: JSON.stringify(checks) });

async function checkTelegramMetadata(input: AppConfig): Promise<void> {
  const bot = new Bot(input.telegramBotToken);
  const me = await bot.api.getMe();
  const name = await bot.api.getMyName();
  const description = await bot.api.getMyDescription();
  const shortDescription = await bot.api.getMyShortDescription();
  const commands = await bot.api.getMyCommands();
  if (name.name !== BOT_NAME) {
    throw new AppError("Telegram bot name mismatch", { actual: name.name });
  }
  if (description.description !== BOT_DESCRIPTION) {
    throw new AppError("Telegram bot description mismatch");
  }
  if (shortDescription.short_description !== BOT_SHORT_DESCRIPTION) {
    throw new AppError("Telegram bot short description mismatch");
  }
  const commandMismatch = commands.find((command, index) => {
    const expected = BOT_COMMANDS[index];
    return expected === undefined || command.command !== expected.command || command.description !== expected.description;
  });
  if (commands.length !== BOT_COMMANDS.length || commandMismatch !== undefined) {
    throw new AppError("Telegram bot command metadata mismatch", {
      commandCount: commands.length,
      expectedCommandCount: BOT_COMMANDS.length,
      mismatch: commandMismatch?.command ?? ""
    });
  }
  pass("Telegram bot metadata", `${me.username} / ${name.name} / ${commands.length} commands`);
}

async function checkBscRpc(input: AppConfig): Promise<void> {
  const chainId = await publicClient.getChainId();
  if (chainId !== input.bscChainId) {
    throw new AppError("BSC RPC returned the wrong chain ID", { expected: input.bscChainId, actual: chainId });
  }
  const blockNumber = await publicClient.getBlockNumber();
  pass("BSC RPC", `chainId=${chainId} block=${blockNumber.toString()}`);
}

async function checkContractCode(name: string, address: Address): Promise<void> {
  const code = await publicClient.getBytecode({ address });
  if (code === undefined || code === "0x") {
    throw new AppError("Contract code missing", { name, address });
  }
  pass(name, address);
}

async function checkOptionalContractCode(name: string, address: Address): Promise<void> {
  if (address === NATIVE_TOKEN_ADDRESS) {
    skip(name, "not configured for this chain");
    return;
  }
  await checkContractCode(name, address);
}

async function checkSafeTransactionService(input: AppConfig): Promise<void> {
  if (input.safeTransactionServiceUrl === undefined) {
    skip("Safe Transaction Service", "SAFE_TRANSACTION_SERVICE_URL is not configured");
    return;
  }
  await assertHttpOk({
    url: `${input.safeTransactionServiceUrl.replace(/\/$/, "")}/api/v1/about/`,
    label: "Safe Transaction Service",
    errorMessage: "HTTP smoke check failed"
  });
  pass("Safe Transaction Service", input.safeTransactionServiceUrl);
}

async function checkPancakeQuote(input: AppConfig): Promise<void> {
  if (input.bscChainId !== 56) {
    skip("PancakeSwap quote", "default smoke quote is only configured for BSC mainnet");
    return;
  }
  const token = parseAddress(process.env["LIVE_SMOKE_PANCAKE_TOKEN"] ?? BSC_USDT);
  const service = new PancakeSwapService(addresses, input.bscRpcUrl, input.bscChainId);
  const quote = await service.quoteNativeBuy(token, parseEther("0.001"));
  if (quote <= 0n) {
    throw new AppError("PancakeSwap quote returned no output", { token });
  }
  pass("PancakeSwap quote", `${token} output=${quote.toString()}`);
}

async function checkPublicHttp(input: AppConfig): Promise<void> {
  if (input.publicBaseUrl === undefined) {
    skip("HTTP runtime", "PUBLIC_BASE_URL is not configured");
    return;
  }
  const baseUrl = input.publicBaseUrl.replace(/\/$/, "");
  const parsed = new URL(baseUrl);
  if (input.appEnv === "production" && parsed.protocol !== "https:") {
    throw new AppError("Production PUBLIC_BASE_URL must be HTTPS for Telegram Mini Apps", { publicBaseUrl: baseUrl });
  }
  await assertHttpOk({
    url: `${baseUrl}/health`,
    label: "HTTP health",
    errorMessage: "HTTP smoke check failed"
  });
  const poolPage = await fetch(`${baseUrl}/pool/live-smoke`);
  if (!poolPage.ok) {
    throw new AppError("Pool mini app page failed", { status: poolPage.status });
  }
  const html = await poolPage.text();
  if (!html.includes("BNancy Pool") || !html.includes("/api/pools/")) {
    throw new AppError("Pool mini app page is missing analytics bindings");
  }
  pass("HTTP runtime", `${baseUrl}/health and /pool/live-smoke`);
}

async function checkPostgres(input: AppConfig): Promise<void> {
  if (input.storageDriver !== "postgres") {
    skip("Postgres", "STORAGE_DRIVER is not postgres");
    return;
  }
  if (input.databaseUrl === undefined) {
    throw new AppError("DATABASE_URL is required for Postgres smoke");
  }
  const pool = new Pool(buildPgPoolConfig(input.databaseUrl));
  await pool.query("select 1");
  await pool.end();
  pass("Postgres", "select 1");
}

async function checkPinata(input: AppConfig): Promise<void> {
  if (input.pinataJwt === undefined) {
    skip("Pinata auth", "PINATA_JWT is not configured");
    skip("Pinata metadata upload", "upload smoke is not run without PINATA_JWT and explicit upload approval");
    return;
  }
  await assertHttpOk({
    url: "https://api.pinata.cloud/data/testAuthentication",
    label: "Pinata auth",
    errorMessage: "HTTP smoke check failed",
    headers: {
      Authorization: `Bearer ${input.pinataJwt}`
    }
  });
  pass("Pinata auth", "JWT accepted");
  skip("Pinata metadata upload", "auth is checked; upload is not run to avoid creating third-party artifacts");
}

function pass(name: string, detail: string): void {
  checks.push({ name, status: "passed", detail });
}

function skip(name: string, detail: string): void {
  checks.push({ name, status: "skipped", detail });
}
