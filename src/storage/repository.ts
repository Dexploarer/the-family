import type {
  AdminSession,
  AdminUser,
  ChatId,
  FlapLaunchProposal,
  GroupWallet,
  PendingPrompt,
  SafeCreationSession,
  SafeSubmission,
  TradeProposal,
  UsageEvent,
  WalletLink
} from "../domain/types.js";

export interface Repository {
  getGroupWallet(chatId: ChatId): Promise<GroupWallet | null>;
  listGroupWallets(): Promise<GroupWallet[]>;
  saveGroupWallet(wallet: GroupWallet): Promise<void>;
  deleteGroupWallet(chatId: ChatId): Promise<void>;
  getPendingPrompt(chatId: ChatId, telegramUserId: string): Promise<PendingPrompt | null>;
  savePendingPrompt(prompt: PendingPrompt): Promise<void>;
  deletePendingPrompt(chatId: ChatId, telegramUserId: string): Promise<void>;
  getWalletLink(telegramUserId: string, address: string): Promise<WalletLink | null>;
  getWalletLinkByNonce(nonce: string): Promise<WalletLink | null>;
  getLinkedWalletsByTelegramUserId(telegramUserId: string): Promise<WalletLink[]>;
  getLinkedWalletsByAddress(address: string): Promise<WalletLink[]>;
  saveWalletLink(link: WalletLink): Promise<void>;
  getSafeCreationSession(id: string): Promise<SafeCreationSession | null>;
  saveSafeCreationSession(session: SafeCreationSession): Promise<void>;
  getTradeProposal(id: string): Promise<TradeProposal | null>;
  saveTradeProposal(proposal: TradeProposal): Promise<void>;
  getFlapLaunch(id: string): Promise<FlapLaunchProposal | null>;
  saveFlapLaunch(proposal: FlapLaunchProposal): Promise<void>;
  getSafeSubmission(id: string): Promise<SafeSubmission | null>;
  saveSafeSubmission(submission: SafeSubmission): Promise<void>;
  saveUsageEvent(event: UsageEvent): Promise<void>;
  listUsageEventsSince(since: Date): Promise<UsageEvent[]>;
  listUsageEvents(options?: { since?: Date; chatId?: ChatId; limit?: number }): Promise<UsageEvent[]>;
  getGroupLanguages(chatId: ChatId): Promise<string[] | null>;
  setGroupLanguages(chatId: ChatId, languages: string[]): Promise<void>;
  getPlatformSetting(key: string): Promise<string | null>;
  setPlatformSetting(key: string, value: string): Promise<void>;
  deletePlatformSetting(key: string): Promise<void>;
  listPlatformSettings(): Promise<Record<string, string>>;
  countAdminUsers(): Promise<number>;
  getAdminUserByEmail(email: string): Promise<AdminUser | null>;
  getAdminUserById(id: string): Promise<AdminUser | null>;
  listAdminUsers(): Promise<AdminUser[]>;
  saveAdminUser(user: AdminUser): Promise<void>;
  deleteAdminUser(id: string): Promise<void>;
  getAdminSession(id: string): Promise<AdminSession | null>;
  saveAdminSession(session: AdminSession): Promise<void>;
  deleteAdminSession(id: string): Promise<void>;
  deleteExpiredAdminSessions(now: Date): Promise<void>;
}
