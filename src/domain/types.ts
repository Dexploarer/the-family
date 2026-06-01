import type { Address, Hex } from "viem";

export type ChatId = string;

export type ChainTransaction = {
  to: Address;
  value: bigint;
  data: Hex;
  label: string;
};

export type SafeOperation = 0 | 1;

export type SafeTransactionData = {
  to: Address;
  value: bigint;
  data: Hex;
  operation: SafeOperation;
  safeTxGas: bigint;
  baseGas: bigint;
  gasPrice: bigint;
  gasToken: Address;
  refundReceiver: Address;
  nonce: bigint;
};

export type GroupWallet = {
  chatId: ChatId;
  safeAddress: Address;
  threshold: number;
  owners: Address[];
  createdAt: Date;
};

export type WalletLink = {
  telegramUserId: string;
  address: Address;
  nonce: string;
  status: "pending" | "linked";
  createdAt: Date;
  linkedAt?: Date;
};

export type PendingPrompt = {
  chatId: ChatId;
  telegramUserId: string;
  command: string;
  collected: string[];
  createdAt: Date;
  updatedAt: Date;
};

export type SafeCreationSessionStatus = "collecting" | "deployed" | "cancelled";

export type SafeCreationOwner = {
  telegramUserId: string;
  address: Address;
  joinedAt: Date;
};

export type SafeCreationSession = {
  id: string;
  chatId: ChatId;
  creatorTelegramId: string;
  threshold: number;
  owners: SafeCreationOwner[];
  status: SafeCreationSessionStatus;
  createdAt: Date;
  deployedSafeAddress?: Address;
  deploymentTxHash?: Hex;
};

export type FlapTokenStatus = "invalid" | "staged" | "tradable" | "dex" | "unknown";

export type TradeRoute = "flap-portal" | "pancakeswap-v2";

export type TradeProposalStatus = "created";

export type TradeProposal = {
  id: string;
  chatId: ChatId;
  proposerTelegramId: string;
  tokenAddress: Address;
  inputAmountWei: bigint;
  minOutputAmount: bigint;
  feeAmountWei: bigint;
  route: TradeRoute;
  status: TradeProposalStatus;
  riskReport: TokenRiskReport;
  transactions: ChainTransaction[];
  createdAt: Date;
};

export type RiskLevel = "low" | "medium" | "high" | "unknown";

export type TokenRiskReport = {
  tokenAddress: Address;
  level: RiskLevel;
  blocked: boolean;
  reasons: string[];
  liquidityUsd?: number;
  pairUrl?: string;
  buyTaxBps?: number;
  sellTaxBps?: number;
  lpLocked?: boolean;
  lpLockedPercent?: number;     // 0–100, locked + burned share of LP
  lpHolderTopPercent?: number;  // 0–100, largest single LP holder (excl. lock/burn)
  lpHolderCount?: number;
  holderCount?: number;
  checkedAt: Date;
};

export type VaultRecipient = {
  address: Address;
  bps: number;
};

export type FlapLaunchProposal = {
  id: string;
  chatId: ChatId;
  proposerTelegramId: string;
  name: string;
  symbol: string;
  metadataUri: string;
  buyTaxBps: number;
  sellTaxBps: number;
  taxDurationSeconds: number;
  initialBuyWei: bigint;
  recipients: VaultRecipient[];
  salt: Hex;
  transactions: ChainTransaction[];
  createdAt: Date;
};

export type SafeSubmissionSourceType = "trade" | "flap-launch" | "withdrawal";

export type SafeSubmissionStatus = "prepared" | "submitted";

export type SafeSubmission = {
  id: string;
  chatId: ChatId;
  sourceType: SafeSubmissionSourceType;
  sourceId: string;
  safeAddress: Address;
  safeTxHash: Hex;
  safeTransaction: SafeTransactionData;
  transactionServiceUrl: string;
  status: SafeSubmissionStatus;
  senderAddress?: Address;
  submittedAt?: Date;
  createdAt: Date;
};

export type PoolRole = "owner" | "trader" | "member";

export type PoolMember = {
  chatId: ChatId;
  telegramUserId: string;
  role: PoolRole;
  shares: bigint;
  depositedWei: bigint;
  withdrawnWei: bigint;
  createdAt: Date;
  updatedAt: Date;
};

export type UsageEvent = {
  id: string;
  command: string;
  telegramUserId: string;
  createdAt: Date;
  chatId?: ChatId;
};

export type AdminRole = "super_admin" | "admin";

export type AdminUser = {
  id: string;
  email: string;
  passwordHash: string | null;
  role: AdminRole;
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt: Date | null;
};

export type AdminSession = {
  id: string;
  userId: string;
  expiresAt: Date;
  createdAt: Date;
};

export type PoolLedgerEntryType =
  | "deposit"
  | "withdrawal-request"
  | "withdrawal-cancel"
  | "withdrawal-execution"
  | "nav-update"
  | "role-update";

export type PoolLedgerEntry = {
  id: string;
  chatId: ChatId;
  telegramUserId: string;
  type: PoolLedgerEntryType;
  amountWei: bigint;
  sharesDelta: bigint;
  navWei: bigint;
  totalSharesAfter: bigint;
  createdAt: Date;
  transactionHash?: Hex;
};

export type PoolNavSnapshot = {
  id: string;
  chatId: ChatId;
  navWei: bigint;
  liquidWei: bigint;
  positionsWei: bigint;
  totalShares: bigint;
  capturedAt: Date;
};

export type PoolWithdrawalStatus = "queued" | "prepared" | "executed" | "cancelled";

export type PoolWithdrawalRequest = {
  id: string;
  chatId: ChatId;
  telegramUserId: string;
  recipientAddress: Address;
  shares: bigint;
  grossAmountWei: bigint;
  feeAmountWei: bigint;
  netAmountWei: bigint;
  navWei: bigint;
  totalSharesAtRequest: bigint;
  status: PoolWithdrawalStatus;
  requestedAt: Date;
  preparedAt?: Date;
  executedAt?: Date;
  cancelledAt?: Date;
  safeSubmissionId?: string;
  executionTransactionHash?: Hex;
};

export type PoolMemberBreakdown = {
  telegramUserId: string;
  role: PoolRole;
  shares: bigint;
  ownershipBps: number;
  activeValueWei: bigint;
  depositedWei: bigint;
  withdrawnWei: bigint;
  queuedWithdrawalWei: bigint;
  unrealizedPnlWei: bigint;
};

export type PoolAnalytics = {
  chatId: ChatId;
  telegramUserId: string;
  safeAddress?: Address;
  navWei: bigint;
  liquidWei: bigint;
  positionsWei: bigint;
  activeNavWei: bigint;
  reservedWithdrawalWei: bigint;
  totalShares: bigint;
  withdrawalFeeBps: number;
  member: PoolMemberBreakdown;
  members: PoolMemberBreakdown[];
  withdrawals: PoolWithdrawalRequest[];
  ledger: PoolLedgerEntry[];
  capturedAt: Date;
};

export type TrendingCandidate = {
  rank: number;
  tokenAddress: Address;
  tokenSymbol: string;
  poolAddress: Address;
  dexId: string;
  momentumScore: number; // elizaOK score 0–100
  conviction: string;
  thesis: string[];
  risks: string[];
  fdvUsd?: number;
  reserveUsd?: number;
  volumeUsdH1?: number;
  priceChangeH1?: number;
  poolAgeMinutes?: number;
  buysM5?: number;
  sellsM5?: number;
  buyersM5?: number;
  sellersM5?: number;
  volumeUsdM5?: number;
};

export type ExitSafetyGate = "pass" | "warn" | "block";
export type ExitSafetyGrade = "A" | "B" | "C" | "D" | "F";

export type WatchlistEntry = {
  candidate: TrendingCandidate;
  riskReport: TokenRiskReport;
  roundTripLossBps?: number; // combined enter+exit cost at treasury size; undefined = unknown
  liquidityUsd?: number;
  treasurySizeBnb: number;
  score: number; // 0–100 (higher = safer to enter/exit)
  grade: ExitSafetyGrade;
  gate: ExitSafetyGate;
  reasons: string[];
};
