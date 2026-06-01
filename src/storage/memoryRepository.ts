import type {
  AdminInvite,
  AdminSession,
  AdminUser,
  ChatId,
  FlapLaunchProposal,
  GroupWallet,
  ModelInferenceLog,
  PendingPrompt,
  SafeCreationSession,
  SafeSubmission,
  TradeProposal,
  UsageEvent,
  WalletLink
} from "../domain/types.js";
import type { Repository } from "./repository.js";

export class MemoryRepository implements Repository {
  private readonly groupWallets = new Map<ChatId, GroupWallet>();
  private readonly walletLinks = new Map<string, WalletLink>();
  private readonly pendingPrompts = new Map<string, PendingPrompt>();
  private readonly safeCreationSessions = new Map<string, SafeCreationSession>();
  private readonly tradeProposals = new Map<string, TradeProposal>();
  private readonly flapLaunches = new Map<string, FlapLaunchProposal>();
  private readonly safeSubmissions = new Map<string, SafeSubmission>();
  private readonly usageEvents: UsageEvent[] = [];
  private readonly groupLanguages = new Map<ChatId, string[]>();
  private readonly platformSettings = new Map<string, string>();
  private readonly adminUsers = new Map<string, AdminUser>();
  private readonly adminUsersByEmail = new Map<string, string>();
  private readonly adminSessions = new Map<string, AdminSession>();
  private readonly adminInvites = new Map<string, AdminInvite>();
  private readonly adminInvitesByToken = new Map<string, string>();
  private readonly modelInferenceLogs: ModelInferenceLog[] = [];

  async getGroupWallet(chatId: ChatId): Promise<GroupWallet | null> {
    return this.groupWallets.get(chatId) ?? null;
  }

  async listGroupWallets(): Promise<GroupWallet[]> {
    return [...this.groupWallets.values()];
  }

  async saveGroupWallet(wallet: GroupWallet): Promise<void> {
    this.groupWallets.set(wallet.chatId, wallet);
  }

  async deleteGroupWallet(chatId: ChatId): Promise<void> {
    this.groupWallets.delete(chatId);
  }

  async getPendingPrompt(chatId: ChatId, telegramUserId: string): Promise<PendingPrompt | null> {
    return this.pendingPrompts.get(promptKey(chatId, telegramUserId)) ?? null;
  }

  async savePendingPrompt(prompt: PendingPrompt): Promise<void> {
    this.pendingPrompts.set(promptKey(prompt.chatId, prompt.telegramUserId), prompt);
  }

  async deletePendingPrompt(chatId: ChatId, telegramUserId: string): Promise<void> {
    this.pendingPrompts.delete(promptKey(chatId, telegramUserId));
  }

  async getWalletLink(telegramUserId: string, address: string): Promise<WalletLink | null> {
    return this.walletLinks.get(walletLinkKey(telegramUserId, address)) ?? null;
  }

  async getWalletLinkByNonce(nonce: string): Promise<WalletLink | null> {
    return [...this.walletLinks.values()].find((link) => link.nonce === nonce) ?? null;
  }

  async saveWalletLink(link: WalletLink): Promise<void> {
    this.walletLinks.set(walletLinkKey(link.telegramUserId, link.address), link);
  }

  async getLinkedWalletsByTelegramUserId(telegramUserId: string): Promise<WalletLink[]> {
    return [...this.walletLinks.values()].filter((link) => link.telegramUserId === telegramUserId && link.status === "linked");
  }

  async getLinkedWalletsByAddress(address: string): Promise<WalletLink[]> {
    return [...this.walletLinks.values()].filter(
      (link) => link.address.toLowerCase() === address.toLowerCase() && link.status === "linked"
    );
  }

  async getSafeCreationSession(id: string): Promise<SafeCreationSession | null> {
    return this.safeCreationSessions.get(id) ?? null;
  }

  async saveSafeCreationSession(session: SafeCreationSession): Promise<void> {
    this.safeCreationSessions.set(session.id, session);
  }

  async getTradeProposal(id: string): Promise<TradeProposal | null> {
    return this.tradeProposals.get(id) ?? null;
  }

  async saveTradeProposal(proposal: TradeProposal): Promise<void> {
    this.tradeProposals.set(proposal.id, proposal);
  }

  async getFlapLaunch(id: string): Promise<FlapLaunchProposal | null> {
    return this.flapLaunches.get(id) ?? null;
  }

  async saveFlapLaunch(proposal: FlapLaunchProposal): Promise<void> {
    this.flapLaunches.set(proposal.id, proposal);
  }

  async getSafeSubmission(id: string): Promise<SafeSubmission | null> {
    return this.safeSubmissions.get(id) ?? null;
  }

  async saveSafeSubmission(submission: SafeSubmission): Promise<void> {
    this.safeSubmissions.set(submission.id, submission);
  }

  async saveUsageEvent(event: UsageEvent): Promise<void> {
    this.usageEvents.push(event);
  }

  async listUsageEventsSince(since: Date): Promise<UsageEvent[]> {
    return this.usageEvents.filter((event) => event.createdAt >= since);
  }

  async listUsageEvents(options?: { since?: Date; chatId?: ChatId; limit?: number }): Promise<UsageEvent[]> {
    let rows = [...this.usageEvents].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    if (options?.since !== undefined) {
      rows = rows.filter((event) => event.createdAt >= options.since!);
    }
    if (options?.chatId !== undefined) {
      rows = rows.filter((event) => event.chatId === options.chatId);
    }
    const limit = options?.limit ?? 200;
    return rows.slice(0, limit);
  }

  async getGroupLanguages(chatId: ChatId): Promise<string[] | null> {
    return this.groupLanguages.get(chatId) ?? null;
  }

  async setGroupLanguages(chatId: ChatId, languages: string[]): Promise<void> {
    this.groupLanguages.set(chatId, languages);
  }

  async getPlatformSetting(key: string): Promise<string | null> {
    return this.platformSettings.get(key) ?? null;
  }

  async setPlatformSetting(key: string, value: string): Promise<void> {
    this.platformSettings.set(key, value);
  }

  async deletePlatformSetting(key: string): Promise<void> {
    this.platformSettings.delete(key);
  }

  async listPlatformSettings(): Promise<Record<string, string>> {
    return Object.fromEntries(this.platformSettings.entries());
  }

  async countAdminUsers(): Promise<number> {
    return this.adminUsers.size;
  }

  async getAdminUserByEmail(email: string): Promise<AdminUser | null> {
    const id = this.adminUsersByEmail.get(normalizeAdminEmail(email));
    return id === undefined ? null : (this.adminUsers.get(id) ?? null);
  }

  async getAdminUserById(id: string): Promise<AdminUser | null> {
    return this.adminUsers.get(id) ?? null;
  }

  async listAdminUsers(): Promise<AdminUser[]> {
    return [...this.adminUsers.values()].sort((a, b) => a.email.localeCompare(b.email));
  }

  async saveAdminUser(user: AdminUser): Promise<void> {
    this.adminUsers.set(user.id, user);
    this.adminUsersByEmail.set(user.email, user.id);
  }

  async deleteAdminUser(id: string): Promise<void> {
    const user = this.adminUsers.get(id);
    if (user !== undefined) {
      this.adminUsersByEmail.delete(user.email);
    }
    this.adminUsers.delete(id);
    for (const [sessionId, session] of this.adminSessions.entries()) {
      if (session.userId === id) {
        this.adminSessions.delete(sessionId);
      }
    }
  }

  async getAdminSession(id: string): Promise<AdminSession | null> {
    return this.adminSessions.get(id) ?? null;
  }

  async saveAdminSession(session: AdminSession): Promise<void> {
    this.adminSessions.set(session.id, session);
  }

  async deleteAdminSession(id: string): Promise<void> {
    this.adminSessions.delete(id);
  }

  async deleteExpiredAdminSessions(now: Date): Promise<void> {
    for (const [sessionId, session] of this.adminSessions.entries()) {
      if (session.expiresAt <= now) {
        this.adminSessions.delete(sessionId);
      }
    }
  }

  async saveAdminInvite(invite: AdminInvite): Promise<void> {
    this.adminInvites.set(invite.id, invite);
    this.adminInvitesByToken.set(invite.tokenHash, invite.id);
  }

  async getAdminInviteByTokenHash(tokenHash: string): Promise<AdminInvite | null> {
    const id = this.adminInvitesByToken.get(tokenHash);
    return id === undefined ? null : (this.adminInvites.get(id) ?? null);
  }

  async markAdminInviteAccepted(id: string, acceptedAt: Date): Promise<void> {
    const invite = this.adminInvites.get(id);
    if (invite !== undefined) {
      this.adminInvites.set(id, { ...invite, acceptedAt });
    }
  }

  async deleteExpiredAdminInvites(now: Date): Promise<void> {
    for (const [id, invite] of this.adminInvites.entries()) {
      if (invite.expiresAt <= now) {
        this.adminInvites.delete(id);
        this.adminInvitesByToken.delete(invite.tokenHash);
      }
    }
  }

  async saveModelInferenceLog(log: ModelInferenceLog): Promise<void> {
    this.modelInferenceLogs.push(log);
  }

  async listModelInferenceLogs(options?: {
    since?: Date;
    chatId?: ChatId;
    tokenAddress?: string;
    limit?: number;
  }): Promise<ModelInferenceLog[]> {
    const limit = options?.limit ?? 200;
    let rows = [...this.modelInferenceLogs];
    if (options?.since !== undefined) {
      rows = rows.filter((row) => row.createdAt >= options.since!);
    }
    if (options?.chatId !== undefined) {
      rows = rows.filter((row) => row.chatId === options.chatId);
    }
    if (options?.tokenAddress !== undefined) {
      const needle = options.tokenAddress.toLowerCase();
      rows = rows.filter((row) => row.tokenAddress?.toLowerCase() === needle);
    }
    return rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, limit);
  }

  async listSafeSubmissions(limit = 100): Promise<SafeSubmission[]> {
    return [...this.safeSubmissions.values()]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }

  async listTradeProposals(limit = 100): Promise<TradeProposal[]> {
    return [...this.tradeProposals.values()]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }

  async listFlapLaunches(limit = 100): Promise<FlapLaunchProposal[]> {
    return [...this.flapLaunches.values()]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }
}

function walletLinkKey(telegramUserId: string, address: string): string {
  return `${telegramUserId}:${address.toLowerCase()}`;
}

function normalizeAdminEmail(email: string): string {
  return email.trim().toLowerCase();
}

function promptKey(chatId: ChatId, telegramUserId: string): string {
  return `${chatId}:${telegramUserId}`;
}
