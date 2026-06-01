import type { ChatId, ModelInferenceLog, ModelInferenceSource, ModelInferenceStatus, WatchlistEntry } from "../domain/types.js";
import type { Repository } from "../storage/repository.js";
import { createId } from "../utils/ids.js";

export type ModelInferenceTrace = {
  source: ModelInferenceSource;
  telegramUserId?: string;
  chatId?: ChatId;
};

export type ModelInferenceRecordInput = {
  trace: ModelInferenceTrace;
  entry: WatchlistEntry;
  language: string;
  model: string;
  status: ModelInferenceStatus;
  latencyMs: number;
  responsePreview: string | null;
  errorMessage?: string;
};

// Persists eliza-1 call metadata for the operator dashboard (no full prompts).
export class ModelInferenceLogService {
  constructor(
    private readonly repository: Repository,
    private readonly modelName: string
  ) {}

  async record(input: ModelInferenceRecordInput): Promise<void> {
    const { entry, trace } = input;
    const log: ModelInferenceLog = {
      id: createId("infer"),
      source: trace.source,
      model: input.model || this.modelName,
      status: input.status,
      telegramUserId: trace.telegramUserId ?? null,
      chatId: trace.chatId ?? null,
      tokenSymbol: entry.candidate.tokenSymbol,
      tokenAddress: entry.candidate.tokenAddress,
      language: input.language,
      latencyMs: input.latencyMs,
      promptPreview: buildPromptPreview(entry),
      responsePreview: input.responsePreview,
      errorMessage: input.errorMessage ?? null,
      createdAt: new Date()
    };
    await this.repository.saveModelInferenceLog(log);
  }

  async listRecent(options?: { hours?: number; limit?: number }) {
    const hours = options?.hours ?? 24;
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    return this.repository.listModelInferenceLogs({ since, limit: options?.limit ?? 200 });
  }

  async getAnalytics(options?: { hours?: number }) {
    const hours = options?.hours ?? 24;
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    const logs = await this.repository.listModelInferenceLogs({ since, limit: 5000 });
    const byStatus: Record<string, number> = { ok: 0, fallback: 0, error: 0 };
    const bySource: Record<string, number> = {};
    const byToken = new Map<string, { symbol: string; count: number }>();
    const callers = new Map<string, number>();
    let latencyTotal = 0;
    for (const log of logs) {
      byStatus[log.status] = (byStatus[log.status] ?? 0) + 1;
      bySource[log.source] = (bySource[log.source] ?? 0) + 1;
      latencyTotal += log.latencyMs;
      if (log.telegramUserId !== null) {
        callers.set(log.telegramUserId, (callers.get(log.telegramUserId) ?? 0) + 1);
      }
      if (log.tokenAddress !== null) {
        const key = log.tokenAddress.toLowerCase();
        const existing = byToken.get(key);
        if (existing === undefined) {
          byToken.set(key, { symbol: log.tokenSymbol ?? key.slice(0, 10), count: 1 });
        } else {
          existing.count += 1;
        }
      }
    }
    const topTokens = [...byToken.entries()]
      .map(([address, value]) => ({ tokenAddress: address, tokenSymbol: value.symbol, count: value.count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 15);
    const topCallers = [...callers.entries()]
      .map(([telegramUserId, count]) => ({ telegramUserId, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 15);
    return {
      hours,
      total: logs.length,
      avgLatencyMs: logs.length === 0 ? 0 : Math.round(latencyTotal / logs.length),
      byStatus,
      bySource,
      topTokens,
      topCallers,
      recent: logs.slice(0, 100).map(serializeLog)
    };
  }
}

function buildPromptPreview(entry: WatchlistEntry): string {
  const c = entry.candidate;
  return `${c.tokenSymbol} gate=${entry.gate} grade=${entry.grade} treasury=${entry.treasurySizeBnb}BNB momentum=${c.momentumScore}`;
}

function serializeLog(log: ModelInferenceLog) {
  return {
    id: log.id,
    source: log.source,
    model: log.model,
    status: log.status,
    telegramUserId: log.telegramUserId,
    chatId: log.chatId,
    tokenSymbol: log.tokenSymbol,
    tokenAddress: log.tokenAddress,
    language: log.language,
    latencyMs: log.latencyMs,
    promptPreview: log.promptPreview,
    responsePreview: log.responsePreview,
    errorMessage: log.errorMessage,
    createdAt: log.createdAt.toISOString()
  };
}
