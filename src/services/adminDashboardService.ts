import type { ChatId, UsageEvent } from "../domain/types.js";
import type { Repository } from "../storage/repository.js";
import type { PoolRepository } from "../storage/poolRepository.js";
import { buildPoolAnalytics } from "./poolAnalyticsBuilder.js";
import type { PoolService, PlatformStats } from "./poolService.js";
import type { PlatformSettingsService } from "./platformSettings.js";
import { serializePoolAnalytics, type PoolAnalyticsResponse } from "../http/poolAnalyticsResponse.js";
import { formatBnb } from "../utils/evm.js";
import { buildAdminGroupReportView, type AdminGroupReportView } from "./adminGroupReportView.js";

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

export type SafeQueueItem = {
  stage: "awaiting_prepare" | "awaiting_signatures" | "submitted";
  kind: "trade" | "flap-launch" | "withdrawal";
  id: string;
  sourceId: string;
  chatId: string;
  label: string;
  detail: string;
  status: string;
  createdAt: string;
  signUrl?: string;
  executeUrl?: string;
};

export class AdminDashboardService {
  constructor(
    private readonly repository: Repository,
    private readonly poolRepository: PoolRepository,
    private readonly poolService: PoolService,
    private readonly platformSettings: PlatformSettingsService,
    private readonly withdrawalFeeBps: number,
    private readonly publicBaseUrl?: string
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

  async getGroupReportView(chatId: ChatId): Promise<AdminGroupReportView> {
    const report = await this.getGroupReport(chatId);
    return buildAdminGroupReportView(report, this.publicBaseUrl);
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

  async listSafeQueue(limit = 80): Promise<SafeQueueItem[]> {
    const base = this.publicBaseUrl?.replace(/\/+$/, "") ?? "";
    const submissions = await this.repository.listSafeSubmissions(limit);
    const submittedSourceIds = new Set(submissions.map((row) => `${row.sourceType}:${row.sourceId}`));
    const items: SafeQueueItem[] = [];

    for (const submission of submissions) {
      const signUrl = base.length > 0 ? `${base}/sign/${encodeURIComponent(submission.id)}` : undefined;
      const executeUrl = base.length > 0 ? `${base}/execute/${encodeURIComponent(submission.id)}` : undefined;
      items.push({
        stage: submission.status === "submitted" ? "submitted" : "awaiting_signatures",
        kind: submission.sourceType,
        id: submission.id,
        sourceId: submission.sourceId,
        chatId: submission.chatId,
        label: `${submission.sourceType} · ${submission.id}`,
        detail: `Safe ${submission.safeAddress} · tx ${submission.safeTxHash}`,
        status: submission.status,
        createdAt: submission.createdAt.toISOString(),
        ...(signUrl === undefined ? {} : { signUrl }),
        ...(executeUrl === undefined ? {} : { executeUrl })
      });
    }

    const trades = await this.repository.listTradeProposals(50);
    for (const trade of trades) {
      const key = `trade:${trade.id}`;
      if (submittedSourceIds.has(key)) {
        continue;
      }
      items.push({
        stage: "awaiting_prepare",
        kind: "trade",
        id: trade.id,
        sourceId: trade.id,
        chatId: trade.chatId,
        label: `Trade ${trade.id}`,
        detail: `${trade.route} · ${formatBnb(trade.inputAmountWei)} · ${trade.tokenAddress}`,
        status: trade.status,
        createdAt: trade.createdAt.toISOString()
      });
    }

    const launches = await this.repository.listFlapLaunches(50);
    for (const launch of launches) {
      const key = `flap-launch:${launch.id}`;
      if (submittedSourceIds.has(key)) {
        continue;
      }
      items.push({
        stage: "awaiting_prepare",
        kind: "flap-launch",
        id: launch.id,
        sourceId: launch.id,
        chatId: launch.chatId,
        label: `Flap ${launch.symbol}`,
        detail: `${launch.name} · initial ${formatBnb(launch.initialBuyWei)}`,
        status: "created",
        createdAt: launch.createdAt.toISOString()
      });
    }

    const wallets = await this.repository.listGroupWallets();
    for (const wallet of wallets) {
      const withdrawals = await this.poolRepository.listPoolWithdrawalRequests(wallet.chatId, "queued");
      for (const withdrawal of withdrawals) {
        if (withdrawal.safeSubmissionId !== undefined) {
          continue;
        }
        items.push({
          stage: "awaiting_prepare",
          kind: "withdrawal",
          id: withdrawal.id,
          sourceId: withdrawal.id,
          chatId: withdrawal.chatId,
          label: `Withdrawal ${withdrawal.id}`,
          detail: `${formatBnb(withdrawal.grossAmountWei)} gross → ${withdrawal.recipientAddress}`,
          status: withdrawal.status,
          createdAt: withdrawal.requestedAt.toISOString()
        });
      }
    }

    return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
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
