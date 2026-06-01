import type { ChatId, UsageEvent } from "../domain/types.js";
import type { Repository } from "../storage/repository.js";
import type { PoolRepository } from "../storage/poolRepository.js";
import { buildPoolAnalytics } from "./poolAnalyticsBuilder.js";
import type { PoolService, PlatformStats } from "./poolService.js";
import type { PlatformSettingsService } from "./platformSettings.js";
import { serializePoolAnalytics, type PoolAnalyticsResponse } from "../http/poolAnalyticsResponse.js";

export type GroupSummary = {
  chatId: string;
  safeAddress: string;
  threshold: number;
  ownerCount: number;
  memberCount: number;
  navWei: string | null;
  liquidWei: string | null;
  lastActivityAt: string | null;
};

export type GroupReport = {
  summary: GroupSummary;
  analytics: PoolAnalyticsResponse | null;
  usage: SerializedUsageEvent[];
  ledgerPreview: Array<{
    id: string;
    type: string;
    telegramUserId: string;
    amountWei: string;
    createdAt: string;
  }>;
};

export type SerializedUsageEvent = {
  id: string;
  command: string;
  telegramUserId: string;
  chatId?: string;
  createdAt: string;
};

export type AdminOverview = {
  platform: PlatformStats;
  flags: Awaited<ReturnType<PlatformSettingsService["listFlags"]>>;
  recentUsage: SerializedUsageEvent[];
};

export class AdminDashboardService {
  constructor(
    private readonly repository: Repository,
    private readonly poolRepository: PoolRepository,
    private readonly poolService: PoolService,
    private readonly platformSettings: PlatformSettingsService,
    private readonly withdrawalFeeBps: number
  ) {}

  async getOverview(): Promise<AdminOverview> {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [platform, flags, usage] = await Promise.all([
      this.poolService.buildPlatformStats(),
      this.platformSettings.listFlags(),
      this.repository.listUsageEvents({ since, limit: 50 })
    ]);
    return {
      platform,
      flags,
      recentUsage: usage.map(serializeUsageEvent)
    };
  }

  async listGroups(): Promise<GroupSummary[]> {
    const wallets = await this.repository.listGroupWallets();
    const summaries: GroupSummary[] = [];
    for (const wallet of wallets) {
      summaries.push(await this.buildGroupSummary(wallet.chatId, wallet.safeAddress, wallet.threshold, wallet.owners.length));
    }
    return summaries.sort((a, b) => (b.lastActivityAt ?? "").localeCompare(a.lastActivityAt ?? ""));
  }

  async getGroupReport(chatId: ChatId): Promise<GroupReport> {
    const wallet = await this.repository.getGroupWallet(chatId);
    if (wallet === null) {
      throw new Error("Group not found");
    }
    const summary = await this.buildGroupSummary(chatId, wallet.safeAddress, wallet.threshold, wallet.owners.length);
    const members = await this.poolRepository.listPoolMembers(chatId);
    const viewer = members[0]?.telegramUserId ?? wallet.owners[0] ?? "admin";
    let analytics: PoolAnalyticsResponse | null = null;
    try {
      const built = await buildPoolAnalytics({
        repository: this.repository,
        poolRepository: this.poolRepository,
        withdrawalFeeBps: this.withdrawalFeeBps,
        chatId,
        telegramUserId: viewer
      });
      analytics = serializePoolAnalytics(built);
    } catch {
      analytics = null;
    }
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const usage = await this.repository.listUsageEvents({ chatId, since, limit: 100 });
    const ledger = await this.poolRepository.listPoolLedgerEntries(chatId, 40);
    return {
      summary,
      analytics,
      usage: usage.map(serializeUsageEvent),
      ledgerPreview: ledger.map((entry) => ({
        id: entry.id,
        type: entry.type,
        telegramUserId: entry.telegramUserId,
        amountWei: entry.amountWei.toString(),
        createdAt: entry.createdAt.toISOString()
      }))
    };
  }

  async listUsage(options?: { chatId?: ChatId; hours?: number; limit?: number }): Promise<SerializedUsageEvent[]> {
    const hours = options?.hours ?? 24;
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    const events = await this.repository.listUsageEvents({
      since,
      ...(options?.chatId === undefined ? {} : { chatId: options.chatId }),
      limit: options?.limit ?? 200
    });
    return events.map(serializeUsageEvent);
  }

  private async buildGroupSummary(
    chatId: ChatId,
    safeAddress: string,
    threshold: number,
    ownerCount: number
  ): Promise<GroupSummary> {
    const members = await this.poolRepository.listPoolMembers(chatId);
    const snapshot = await this.poolRepository.getLatestPoolNavSnapshot(chatId);
    const ledger = await this.poolRepository.listPoolLedgerEntries(chatId, 1);
    const lastActivityAt = ledger[0]?.createdAt.toISOString() ?? null;
    return {
      chatId,
      safeAddress,
      threshold,
      ownerCount,
      memberCount: members.length,
      navWei: snapshot === null ? null : snapshot.navWei.toString(),
      liquidWei: snapshot === null ? null : snapshot.liquidWei.toString(),
      lastActivityAt
    };
  }
}

function serializeUsageEvent(event: UsageEvent): SerializedUsageEvent {
  return {
    id: event.id,
    command: event.command,
    telegramUserId: event.telegramUserId,
    createdAt: event.createdAt.toISOString(),
    ...(event.chatId === undefined ? {} : { chatId: event.chatId })
  };
}
