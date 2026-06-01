import { fileURLToPath } from "node:url";
import type { AppConfig } from "./config.js";
import { getBscContractAddresses } from "./chain/addresses.js";
import { FlapService } from "./chain/flapService.js";
import { SafeService } from "./chain/safeService.js";
import { PancakeSwapService } from "./chain/pancakeSwapService.js";
import { createBot } from "./bot/bot.js";
import { GroupWalletService } from "./services/groupWalletService.js";
import { TradeService } from "./services/tradeService.js";
import { ElizaOkFeedService } from "./services/elizaOkFeedService.js";
import { WatchlistService } from "./services/watchlistService.js";
import { ElizaExplanationService, TemplatedExplanationService, type ExplanationService } from "./services/explanationService.js";
import { VoiceService } from "./services/voiceService.js";
import { VoiceVideoService } from "./services/voiceVideoService.js";
import { FlapLaunchService } from "./services/flapLaunchService.js";
import { SafeSubmissionService } from "./services/safeSubmissionService.js";
import { WalletLinkService } from "./services/walletLinkService.js";
import { TokenRiskService } from "./services/tokenRiskService.js";
import { FlapMetadataService } from "./services/flapMetadataService.js";
import { SafeDeploymentService } from "./services/safeDeploymentService.js";
import { SafeGroupSetupService } from "./services/safeGroupSetupService.js";
import { DepositWatcher } from "./services/depositWatcher.js";
import { notifyGroup } from "./services/notify.js";
import { PoolService } from "./services/poolService.js";
import { PlatformSettingsService } from "./services/platformSettings.js";
import { AdminDashboardService } from "./services/adminDashboardService.js";
import { AdminAccountService } from "./services/adminAccountService.js";
import { AdminInviteService } from "./services/adminInviteService.js";
import { ModelInferenceLogService } from "./services/modelInferenceLogService.js";
import { BrandingService } from "./services/brandingService.js";
import { DepositVerificationService } from "./services/depositVerificationService.js";
import { MemoryRepository } from "./storage/memoryRepository.js";
import { MemoryPoolRepository } from "./storage/memoryPoolRepository.js";
import { PostgresRepository } from "./storage/postgresRepository.js";
import { PostgresPoolRepository } from "./storage/postgresPoolRepository.js";
import type { Repository } from "./storage/repository.js";
import type { PoolRepository } from "./storage/poolRepository.js";
import { AppError } from "./domain/errors.js";
import type { Bot } from "grammy";

export type App = {
  bot: Bot;
  repository: Repository;
  safeSubmissionService: SafeSubmissionService;
  safeDeploymentService: SafeDeploymentService;
  safeGroupSetupService: SafeGroupSetupService;
  poolService: PoolService;
  depositVerificationService: DepositVerificationService;
  walletLinkService: WalletLinkService;
  flapMetadataService: FlapMetadataService;
  depositWatcher: DepositWatcher;
  platformSettings: PlatformSettingsService;
  adminDashboard: AdminDashboardService;
  adminAccount: AdminAccountService;
  adminInvite: AdminInviteService;
  modelInferenceLog: ModelInferenceLogService;
  branding: BrandingService;
};

export function buildApp(config: AppConfig): App {
  const repository = createRepository(config);
  const poolRepository = createPoolRepository(config);
  const addresses = getBscContractAddresses(config.bscChainId);
  const flapService = new FlapService(addresses, config.bscRpcUrl, config.bscChainId);
  const pancakeSwapService = new PancakeSwapService(addresses, config.bscRpcUrl, config.bscChainId);
  const safeService = new SafeService(
    addresses,
    config.bscRpcUrl,
    config.bscChainId,
    config.safeTransactionServiceUrl,
    config.safeApiKey
  );
  const groupWalletService = new GroupWalletService(repository);
  const walletLinkService = new WalletLinkService(repository);
  const poolService = new PoolService(repository, poolRepository, config.poolWithdrawalFeeBps);
  const platformSettings = new PlatformSettingsService(repository, config);
  const adminDashboard = new AdminDashboardService(
    repository,
    poolRepository,
    poolService,
    platformSettings,
    config.poolWithdrawalFeeBps,
    config.publicBaseUrl
  );
  const adminAccount = new AdminAccountService(repository, config);
  const adminInvite = new AdminInviteService(repository, config);
  const modelInferenceLog = new ModelInferenceLogService(repository, config.elizaModelName);
  const branding = new BrandingService(repository);
  const depositVerificationService = new DepositVerificationService(config.bscRpcUrl, config.bscChainId);
  const safeDeploymentService = new SafeDeploymentService(addresses, config.bscRpcUrl, config.bscChainId);
  const safeGroupSetupService = new SafeGroupSetupService(repository, safeDeploymentService, walletLinkService);
  const tokenRiskService = new TokenRiskService({
    mode: config.riskCheckMode,
    minLiquidityUsd: config.minLiquidityUsd,
    maxBuyTaxBps: config.maxBuyTaxBps,
    maxSellTaxBps: config.maxSellTaxBps
  });
  const tradeService = new TradeService(repository, flapService, pancakeSwapService, tokenRiskService);
  const elizaOkFeedService = new ElizaOkFeedService({
    url: config.elizaOkTrendingUrl,
    cacheSeconds: config.watchlistCacheSeconds
  });
  const watchlistService = new WatchlistService(elizaOkFeedService, pancakeSwapService, tokenRiskService, {
    maxTokens: config.watchlistMaxTokens,
    defaultSizeBnb: config.watchlistDefaultSizeBnb,
    thresholds: {
      // The watchlist gate is informational and always block-grades, so genuinely
      // unsafe tokens show 🔴 instead of a sea of identical 🟡 warns. (The /buy trade
      // gate still uses RISK_CHECK_MODE for whether to hard-block a real trade.)
      mode: "block",
      minLiquidityUsd: config.minLiquidityUsd,
      maxSellTaxBps: config.maxSellTaxBps,
      maxExitSlippageBps: config.maxExitSlippageBps,
      minLpLockedPercent: config.minLpLockedPercent,
      maxLpHolderTopPercent: config.maxLpHolderTopPercent
    }
  });
  const explanationService: ExplanationService =
    config.elizaModelUrl === undefined
      ? new TemplatedExplanationService()
      : new ElizaExplanationService(
          {
            url: config.elizaModelUrl,
            model: config.elizaModelName,
            ...(config.elizaModelApiKey === undefined ? {} : { apiKey: config.elizaModelApiKey })
          },
          modelInferenceLog
        );
  const voiceService =
    config.kokoroTtsUrl === undefined
      ? undefined
      : new VoiceService({
          url: config.kokoroTtsUrl,
          ...(config.kokoroTtsApiKey === undefined ? {} : { apiKey: config.kokoroTtsApiKey })
        });
  // Video reuses the voice synth, so it's only available when voice is.
  const voiceVideoService =
    voiceService === undefined
      ? undefined
      : new VoiceVideoService({ avatarPath: fileURLToPath(new URL("../assets/nancy.png", import.meta.url)) });
  const flapLaunchService = new FlapLaunchService(repository, flapService);
  const flapMetadataService = new FlapMetadataService(config.pinataJwt);
  const safeSubmissionService = new SafeSubmissionService(
    repository,
    safeService,
    walletLinkService,
    poolService,
    config.platformFeeRecipient
  );
  const bot = createBot({
    repository,
    groupWalletService,
    walletLinkService,
    tradeService,
    flapLaunchService,
    flapMetadataService,
    safeDeploymentService,
    safeGroupSetupService,
    poolService,
    depositVerificationService,
    safeSubmissionService,
    watchlistService,
    explanationService,
    ...(voiceService === undefined ? {} : { voiceService }),
    ...(voiceVideoService === undefined ? {} : { voiceVideoService }),
    platformSettings,
    config
  });
  const depositWatcher = new DepositWatcher(
    repository,
    poolService,
    (chatId, text) => notifyGroup(bot, chatId, text),
    config.bscRpcUrl,
    config.bscChainId
  );
  return {
    bot,
    repository,
    safeSubmissionService,
    safeDeploymentService,
    safeGroupSetupService,
    poolService,
    depositVerificationService,
    walletLinkService,
    flapMetadataService,
    depositWatcher,
    platformSettings,
    adminDashboard,
    adminAccount,
    adminInvite,
    modelInferenceLog,
    branding
  };
}

function createRepository(config: AppConfig): Repository {
  if (config.storageDriver === "memory") {
    return new MemoryRepository();
  }
  if (config.databaseUrl === undefined) {
    throw new AppError("DATABASE_URL is required when STORAGE_DRIVER=postgres");
  }
  return new PostgresRepository(config.databaseUrl);
}

function createPoolRepository(config: AppConfig): PoolRepository {
  if (config.storageDriver === "memory") {
    return new MemoryPoolRepository();
  }
  if (config.databaseUrl === undefined) {
    throw new AppError("DATABASE_URL is required when STORAGE_DRIVER=postgres");
  }
  return new PostgresPoolRepository(config.databaseUrl);
}
