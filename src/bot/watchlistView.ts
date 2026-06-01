import type { WatchlistEntry } from "../domain/types.js";

const GATE_ICON: Record<WatchlistEntry["gate"], string> = { pass: "🟢", warn: "🟡", block: "🔴" };

// Telegram legacy Markdown has no reliable escape; strip the significant characters from
// externally-supplied strings so a crafted value can't break rendering (→ Telegram 400).
function stripMarkdown(s: string): string {
  return s.replace(/[_*`\[\]]/g, "");
}

export function formatWatchlist(entries: WatchlistEntry[], treasurySizeBnb: number): string {
  const lines = [
    "💛 *BNancy's watch* — elizaOK finds them, I check if your group can get *out*.",
    `_Exit-safety at ${treasurySizeBnb} BNB · verdicts ran by eliza-1 · Not financial advice._`,
    ""
  ];
  if (entries.length === 0) {
    lines.push("Nothing to show right now — the discovery feed is empty or unavailable.");
    return lines.join("\n");
  }
  entries.forEach((e, i) => {
    lines.push(`${i + 1}. ${GATE_ICON[e.gate]} *${stripMarkdown(e.candidate.tokenSymbol)}* — grade ${e.grade} · momentum ${e.candidate.momentumScore}`);
  });
  lines.push("", "Tap a token for the full read.");
  return lines.join("\n");
}

export function formatWatchlistEntry(entry: WatchlistEntry, explanation: string): string {
  const lines = [
    `${GATE_ICON[entry.gate]} *${stripMarkdown(entry.candidate.tokenSymbol)}* — grade ${entry.grade} (${entry.gate})`,
    stripMarkdown(explanation),
    "",
    entry.liquidityUsd === undefined ? "Liquidity: unknown" : `Liquidity: $${Math.round(entry.liquidityUsd).toLocaleString()}`,
    entry.roundTripLossBps === undefined
      ? "Exit cost at your size: unknown"
      : entry.roundTripLossBps >= 9000
        ? "PancakeSwap-v2 exit: none at your size (liquidity isn't in the v2 pair)"
        : `Exit cost at your size: ${(entry.roundTripLossBps / 100).toFixed(1)}%`,
    `Token: \`${entry.candidate.tokenAddress}\``
  ];
  if (entry.reasons.length > 0) lines.push("", "Flags: " + entry.reasons.join("; "));
  if (entry.gate !== "pass") lines.push("", "_BNancy would not enter this at your size._");
  return lines.join("\n");
}
