import type { WatchlistEntry } from "../domain/types.js";
import { languageByCode } from "../domain/languages.js";
import type { ModelInferenceLogService, ModelInferenceTrace } from "./modelInferenceLogService.js";

export interface ExplanationService {
  explain(entry: WatchlistEntry, languages: string[], trace?: ModelInferenceTrace): Promise<string>;
}

const SYSTEM_PROMPT =
  "You are BNancy, the Golden Girl of Binance — a sharp, warm, protective BSC trading-desk veteran. In 2-3 sentences give YOUR read on this token: interpret the order flow and pool structure, name the pattern you see (fresh-launch trap, dump in progress, thin/illiquid, healthy, etc.), and what you'd watch. Keep a little personality. Two hard rules: the VERDICT (grade and gate) is FINAL — it comes from your risk engine, so explain and interpret it, do not contradict or second-guess it; and do not tell anyone to buy or sell. Use only the data given. Write 2-3 plain sentences only — no headings, no bullet lists, and do not restate the grade or the word 'Verdict' (the user already sees it).";

// Deterministic, no I/O. Also the fallback when the model is unavailable.
export class TemplatedExplanationService implements ExplanationService {
  async explain(entry: WatchlistEntry, _languages: string[], _trace?: ModelInferenceTrace): Promise<string> {
    const verdict =
      entry.gate === "pass" ? "looks exitable" : entry.gate === "warn" ? "is risky to exit" : "is unsafe to enter";
    const head = `${entry.candidate.tokenSymbol} — grade ${entry.grade} (${entry.gate}). At ${entry.treasurySizeBnb} BNB it ${verdict}.`;
    const why = entry.reasons.length > 0 ? ` ${entry.reasons.join("; ")}.` : "";
    return head + why;
  }
}

export type ElizaConfig = { url: string; model: string; timeoutMs?: number; apiKey?: string };

// Turns the ALREADY-DECIDED numbers into prose. Never affects score/gate.
// Falls back to the templated explanation on any error/timeout.
export class ElizaExplanationService implements ExplanationService {
  private readonly fallback = new TemplatedExplanationService();

  constructor(
    private readonly config: ElizaConfig,
    private readonly inferenceLog?: ModelInferenceLogService
  ) {}

  async explain(entry: WatchlistEntry, languages: string[], trace?: ModelInferenceTrace): Promise<string> {
    const langs = languages.length > 0 ? languages : ["en"];
    const first = langs[0] ?? "en";
    if (langs.length === 1) return this.generate(entry, first, trace);
    const parts: string[] = [];
    for (const code of langs) {
      const lang = languageByCode(code);
      const text = await this.generate(entry, code, trace); // one language at a time (CPU is sequential)
      parts.push(lang ? `${lang.flag} ${text}` : text);
    }
    return parts.join("\n\n");
  }

  private async generate(entry: WatchlistEntry, code: string, trace?: ModelInferenceTrace): Promise<string> {
    const lang = languageByCode(code);
    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs ?? 20000);
    try {
      const response = await fetch(this.config.url, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          ...(this.config.apiKey === undefined ? {} : { Authorization: `Bearer ${this.config.apiKey}` })
        },
        body: JSON.stringify({
          model: this.config.model,
          // eliza-1 is a Qwen3 reasoning model; without this it spends all tokens in
          // reasoning_content and returns empty content (→ we'd always fall back).
          chat_template_kwargs: { enable_thinking: false },
          messages: [
            {
              role: "system",
              content: lang && lang.code !== "en" ? `${SYSTEM_PROMPT} Respond entirely in ${lang.label}.` : SYSTEM_PROMPT
            },
            { role: "user", content: prompt(entry) }
          ],
          max_tokens: 160,
          temperature: 0.2
        })
      });
      if (!response.ok) {
        const fallbackText = await this.fallback.explain(entry, [code]);
        await this.logInference(trace, entry, code, "fallback", Date.now() - started, fallbackText, `HTTP ${response.status}`);
        return fallbackText;
      }
      const body = (await response.json()) as { choices?: { message?: { content?: string } }[] };
      const text = stripThink(body.choices?.[0]?.message?.content ?? "").trim();
      if (text.length > 0) {
        await this.logInference(trace, entry, code, "ok", Date.now() - started, text);
        return text;
      }
      const fallbackText = await this.fallback.explain(entry, [code]);
      await this.logInference(trace, entry, code, "fallback", Date.now() - started, fallbackText, "empty model content");
      return fallbackText;
    } catch (error) {
      const fallbackText = await this.fallback.explain(entry, [code]);
      await this.logInference(
        trace,
        entry,
        code,
        "error",
        Date.now() - started,
        fallbackText,
        error instanceof Error ? error.message : "request failed"
      );
      return fallbackText;
    } finally {
      clearTimeout(timer);
    }
  }

  private async logInference(
    trace: ModelInferenceTrace | undefined,
    entry: WatchlistEntry,
    language: string,
    status: "ok" | "fallback" | "error",
    latencyMs: number,
    responsePreview: string,
    errorMessage?: string
  ): Promise<void> {
    if (this.inferenceLog === undefined || trace === undefined) {
      return;
    }
    await this.inferenceLog.record({
      trace,
      entry,
      language,
      model: this.config.model,
      status,
      latencyMs,
      responsePreview: responsePreview.slice(0, 400),
      ...(errorMessage === undefined ? {} : { errorMessage })
    });
  }
}

// Qwen3 reasoning models can still emit <think>…</think>; strip it defensively.
function stripThink(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

function prompt(entry: WatchlistEntry): string {
  const c = entry.candidate;
  const r = entry.riskReport;
  const meaning =
    entry.gate === "pass" ? "safe to enter and exit at this size"
      : entry.gate === "warn" ? "risky to exit at this size"
        : "unsafe to exit at this size";
  const lines = [
    `Verdict (FINAL, from the risk engine): ${entry.gate.toUpperCase()}, grade ${entry.grade} (${meaning}).`,
    `Token ${c.tokenSymbol}, treasury size ${entry.treasurySizeBnb} BNB.`,
    entry.roundTripLossBps === undefined
      ? "Round-trip exit cost: unknown"
      : entry.roundTripLossBps >= 9000
        ? "PancakeSwap-v2 exit: none at this size (liquidity is on a launchpad curve or Infinity, not the v2 pair)"
        : `Round-trip exit cost: ${(entry.roundTripLossBps / 100).toFixed(1)}%`,
    entry.liquidityUsd === undefined ? "Liquidity: unknown" : `Liquidity: $${Math.round(entry.liquidityUsd)}`,
    c.poolAgeMinutes === undefined ? "" : `Pool age: ${c.poolAgeMinutes} min.`,
    c.priceChangeH1 === undefined ? "" : `1h price change: ${c.priceChangeH1.toFixed(0)}%.`,
    c.buysM5 === undefined && c.sellsM5 === undefined
      ? ""
      : `5m flow: ${c.buysM5 ?? "?"} buys / ${c.sellsM5 ?? "?"} sells, ${c.buyersM5 ?? "?"} buyers / ${c.sellersM5 ?? "?"} sellers.`,
    r.lpLockedPercent === undefined ? "LP locked/burned: unknown" : `LP locked/burned: ${r.lpLockedPercent.toFixed(0)}%.`,
    r.lpHolderTopPercent === undefined ? "" : `Top LP holder: ${r.lpHolderTopPercent.toFixed(0)}%.`,
    `elizaOK momentum: ${c.momentumScore}/100 (${c.conviction}).`,
    c.thesis.length > 0 ? `elizaOK thesis: ${c.thesis.slice(0, 2).join(" ")}` : "",
    `Risk-engine flags: ${entry.reasons.length > 0 ? entry.reasons.join("; ") : "none"}`
  ].filter((line) => line.length > 0);
  return lines.join("\n");
}
