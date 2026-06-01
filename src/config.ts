import { z } from "zod";
import { parseAddress } from "./utils/evm.js";

const EnvSchema = z
  .object({
    APP_ENV: z.enum(["development", "test", "production"]),
    STORAGE_DRIVER: z.enum(["memory", "postgres"]),
    TELEGRAM_BOT_TOKEN: z.string().min(1),
    BSC_CHAIN_ID: z.coerce.number().int().refine((value) => value === 56 || value === 97, {
      message: "BSC_CHAIN_ID must be 56 or 97"
    }),
    BSC_RPC_URL: z.string().url(),
    PLATFORM_FEE_RECIPIENT: z.string().min(1),
    PLATFORM_COMMISSION_RECEIVER: z.string().min(1),
    TRADE_FEE_BPS: z.coerce.number().int().min(0).max(100),
    POOL_WITHDRAWAL_FEE_BPS: z.coerce.number().int().min(0).max(100).default(25),
    DATABASE_URL: z.string().url().optional(),
    SAFE_TRANSACTION_SERVICE_URL: z.preprocess((value) => (value === "" ? undefined : value), z.string().url().optional()),
    SAFE_API_KEY: z.preprocess((value) => (value === "" ? undefined : value), z.string().min(1).optional()),
    DEX_DEADLINE_SECONDS: z.coerce.number().int().min(60).max(604800),
    HTTP_PORT: z.coerce.number().int().min(1).max(65535),
    PUBLIC_BASE_URL: z.preprocess((value) => (value === "" ? undefined : value), z.string().url().optional()),
    WALLETCONNECT_PROJECT_ID: z.preprocess((value) => (value === "" ? undefined : value), z.string().min(1).optional()),
    TELEGRAM_WEBHOOK_SECRET: z.preprocess((value) => (value === "" ? undefined : value), z.string().min(16).optional()),
    PINATA_JWT: z.preprocess((value) => (value === "" ? undefined : value), z.string().min(1).optional()),
    DEPOSIT_WATCH: z.enum(["on", "off"]).default("off"),
    PLATFORM_ADMIN_IDS: z.preprocess((value) => (value === "" ? undefined : value), z.string().optional()),
    RISK_CHECK_MODE: z.enum(["warn", "block"]),
    MIN_LIQUIDITY_USD: z.coerce.number().min(0),
    MAX_BUY_TAX_BPS: z.coerce.number().int().min(0).max(10000),
    MAX_SELL_TAX_BPS: z.coerce.number().int().min(0).max(10000),
    ELIZAOK_TRENDING_URL: z.string().url().default("https://elizatest.com/api/elizaok/trending"),
    ELIZA_MODEL_URL: z.preprocess((value) => (value === "" ? undefined : value), z.string().url().optional()),
    ELIZA_MODEL_NAME: z.string().min(1).default("eliza-1"),
    ELIZA_MODEL_API_KEY: z.preprocess((value) => (value === "" ? undefined : value), z.string().min(1).optional()),
    KOKORO_TTS_URL: z.preprocess((value) => (value === "" ? undefined : value), z.string().url().optional()),
    KOKORO_TTS_API_KEY: z.preprocess((value) => (value === "" ? undefined : value), z.string().min(1).optional()),
    WATCHLIST_MAX_TOKENS: z.coerce.number().int().min(1).max(50).default(10),
    WATCHLIST_CACHE_SECONDS: z.coerce.number().int().min(0).max(3600).default(60),
    WATCHLIST_DEFAULT_SIZE_BNB: z.coerce.number().min(0.0001).default(0.1),
    MAX_EXIT_SLIPPAGE_BPS: z.coerce.number().int().min(0).max(10000).default(1500),
    MIN_LP_LOCKED_PERCENT: z.coerce.number().min(0).max(100).default(50),
    MAX_LP_HOLDER_TOP_PERCENT: z.coerce.number().min(0).max(100).default(50),
    VIDEO_ENABLED: z.enum(["on", "off"]).default("off"),
    VOICE_ENABLED: z.enum(["on", "off"]).default("off"),
    PLATFORM_OPS_TOKEN: z.preprocess((value) => (value === "" ? undefined : value), z.string().min(16).optional()),
    ADMIN_BOOTSTRAP_EMAIL: z.preprocess((value) => (value === "" ? undefined : value), z.string().email().optional()),
    ADMIN_SESSION_SECRET: z.preprocess((value) => (value === "" ? undefined : value), z.string().min(32).optional()),
    ADMIN_SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(7),
    AGENTMAIL_API_KEY: z.preprocess((value) => (value === "" ? undefined : value), z.string().min(1).optional()),
    AGENTMAIL_INBOX_ID: z.preprocess((value) => (value === "" ? undefined : value), z.string().min(1).optional())
  })
  .superRefine((env, ctx) => {
    if (env.STORAGE_DRIVER === "postgres" && env.DATABASE_URL === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["DATABASE_URL"],
        message: "DATABASE_URL is required when STORAGE_DRIVER=postgres"
      });
    }
  });

export type AppConfig = {
  appEnv: "development" | "test" | "production";
  storageDriver: "memory" | "postgres";
  telegramBotToken: string;
  bscChainId: 56 | 97;
  bscRpcUrl: string;
  platformFeeRecipient: ReturnType<typeof parseAddress>;
  platformCommissionReceiver: ReturnType<typeof parseAddress>;
  tradeFeeBps: number;
  poolWithdrawalFeeBps: number;
  databaseUrl?: string;
  safeTransactionServiceUrl?: string;
  safeApiKey?: string;
  dexDeadlineSeconds: number;
  httpPort: number;
  publicBaseUrl?: string;
  walletConnectProjectId?: string;
  telegramWebhookSecret?: string;
  pinataJwt?: string;
  depositWatchEnabled: boolean;
  platformAdminIds: string[];
  riskCheckMode: "warn" | "block";
  minLiquidityUsd: number;
  maxBuyTaxBps: number;
  maxSellTaxBps: number;
  elizaOkTrendingUrl: string;
  elizaModelUrl?: string;
  elizaModelName: string;
  elizaModelApiKey?: string;
  kokoroTtsUrl?: string;
  kokoroTtsApiKey?: string;
  watchlistMaxTokens: number;
  watchlistCacheSeconds: number;
  watchlistDefaultSizeBnb: number;
  maxExitSlippageBps: number;
  minLpLockedPercent: number;
  maxLpHolderTopPercent: number;
  videoEnabledDefault: boolean;
  voiceEnabledDefault: boolean;
  platformOpsToken?: string;
  adminBootstrapEmail?: string;
  adminSessionSecret?: string;
  adminSessionTtlDays: number;
  agentMailApiKey?: string;
  agentMailInboxId?: string;
};

export function loadConfig(): AppConfig {
  const env = EnvSchema.parse(process.env);
  return {
    appEnv: env.APP_ENV,
    storageDriver: env.STORAGE_DRIVER,
    telegramBotToken: env.TELEGRAM_BOT_TOKEN,
    bscChainId: env.BSC_CHAIN_ID,
    bscRpcUrl: env.BSC_RPC_URL,
    platformFeeRecipient: parseAddress(env.PLATFORM_FEE_RECIPIENT),
    platformCommissionReceiver: parseAddress(env.PLATFORM_COMMISSION_RECEIVER),
    tradeFeeBps: env.TRADE_FEE_BPS,
    poolWithdrawalFeeBps: env.POOL_WITHDRAWAL_FEE_BPS,
    ...(env.DATABASE_URL === undefined ? {} : { databaseUrl: env.DATABASE_URL }),
    ...(env.SAFE_TRANSACTION_SERVICE_URL === undefined ? {} : { safeTransactionServiceUrl: env.SAFE_TRANSACTION_SERVICE_URL }),
    ...(env.SAFE_API_KEY === undefined ? {} : { safeApiKey: env.SAFE_API_KEY }),
    dexDeadlineSeconds: env.DEX_DEADLINE_SECONDS,
    httpPort: env.HTTP_PORT,
    ...(env.PUBLIC_BASE_URL === undefined ? {} : { publicBaseUrl: env.PUBLIC_BASE_URL }),
    ...(env.WALLETCONNECT_PROJECT_ID === undefined ? {} : { walletConnectProjectId: env.WALLETCONNECT_PROJECT_ID }),
    ...(env.TELEGRAM_WEBHOOK_SECRET === undefined ? {} : { telegramWebhookSecret: env.TELEGRAM_WEBHOOK_SECRET }),
    ...(env.PINATA_JWT === undefined ? {} : { pinataJwt: env.PINATA_JWT }),
    depositWatchEnabled: env.DEPOSIT_WATCH === "on",
    platformAdminIds:
      env.PLATFORM_ADMIN_IDS === undefined
        ? []
        : env.PLATFORM_ADMIN_IDS.split(",")
            .map((id) => id.trim())
            .filter((id) => id.length > 0),
    riskCheckMode: env.RISK_CHECK_MODE,
    minLiquidityUsd: env.MIN_LIQUIDITY_USD,
    maxBuyTaxBps: env.MAX_BUY_TAX_BPS,
    maxSellTaxBps: env.MAX_SELL_TAX_BPS,
    elizaOkTrendingUrl: env.ELIZAOK_TRENDING_URL,
    ...(env.ELIZA_MODEL_URL === undefined ? {} : { elizaModelUrl: env.ELIZA_MODEL_URL }),
    elizaModelName: env.ELIZA_MODEL_NAME,
    ...(env.ELIZA_MODEL_API_KEY === undefined ? {} : { elizaModelApiKey: env.ELIZA_MODEL_API_KEY }),
    ...(env.KOKORO_TTS_URL === undefined ? {} : { kokoroTtsUrl: env.KOKORO_TTS_URL }),
    ...(env.KOKORO_TTS_API_KEY === undefined ? {} : { kokoroTtsApiKey: env.KOKORO_TTS_API_KEY }),
    watchlistMaxTokens: env.WATCHLIST_MAX_TOKENS,
    watchlistCacheSeconds: env.WATCHLIST_CACHE_SECONDS,
    watchlistDefaultSizeBnb: env.WATCHLIST_DEFAULT_SIZE_BNB,
    maxExitSlippageBps: env.MAX_EXIT_SLIPPAGE_BPS,
    minLpLockedPercent: env.MIN_LP_LOCKED_PERCENT,
    maxLpHolderTopPercent: env.MAX_LP_HOLDER_TOP_PERCENT,
    videoEnabledDefault: env.VIDEO_ENABLED === "on",
    voiceEnabledDefault: env.VOICE_ENABLED === "on",
    ...(env.PLATFORM_OPS_TOKEN === undefined ? {} : { platformOpsToken: env.PLATFORM_OPS_TOKEN }),
    ...(env.ADMIN_BOOTSTRAP_EMAIL === undefined ? {} : { adminBootstrapEmail: env.ADMIN_BOOTSTRAP_EMAIL }),
    ...(env.ADMIN_SESSION_SECRET === undefined ? {} : { adminSessionSecret: env.ADMIN_SESSION_SECRET }),
    adminSessionTtlDays: env.ADMIN_SESSION_TTL_DAYS,
    ...(env.AGENTMAIL_API_KEY === undefined ? {} : { agentMailApiKey: env.AGENTMAIL_API_KEY }),
    ...(env.AGENTMAIL_INBOX_ID === undefined ? {} : { agentMailInboxId: env.AGENTMAIL_INBOX_ID })
  };
}
