# BNancy — Exit-Safety List (`/bnancy`) — Design Spec

- **Date:** 2026-05-29
- **Status:** Approved (design); pending implementation plan
- **Owner:** BNancy (BSC group-trading Telegram bot)

## 1. Summary

Add a ranked, treasury-aware **exit-safety reality check** to BNancy, surfaced by the
`/bnancy` command. It ingests elizaOK's trending list (BSC discovery feed), runs each
candidate through BNancy's own **liquidity-pool lens** (two-sided exit depth, LP
lock/holder safety, MEV exposure) plus her existing safety research, and produces a
**deterministic grade + pass/warn/block gate + ranking**. The self-hosted **eliza-1
(4B)** model writes the human-readable *"why"* for each token — and only that. Positioned
as the sister/complement to elizaOK: **"elizaOK finds it; BNancy checks if your group can
get out."** Not financial advice.

## 2. The non-negotiable architectural line

**The score and the safety gate are deterministic; eliza-1 only writes prose.**

- A pure function `computeExitSafetyScore(signals)` decides the grade, rank, and
  pass/warn/block gate. It is reproducible, unit-tested, and `bun run verify`-gated.
- eliza-1 receives the *already-decided* numbers and turns them into a short
  explanation. It **never** feeds back into the score, the rank, or the gate, and it
  never decides a trade. No model ever implicitly recommends a buy.
- The existing deterministic risk gate (`tokenRiskService` + new LP checks) remains the
  only thing that can block or allow. Humans still sign every Safe transaction.

If any change puts the LLM in the scoring or gating path, the design is wrong.

## 3. Decisions (locked)

| # | Decision | Choice |
|---|----------|--------|
| 1 | Lens role | eliza-1 = research **combiner/synthesizer** for the *explanation* only |
| 2 | LP lens anchor | **Exit-safety**: two-sided slippage at the group's treasury size + LP lock/holder safety; momentum is a secondary input |
| 3 | Candidate universe (v1) | **elizaOK's candidates only**, re-scored. BNancy hunting her own = phase 3 |
| 4 | Model tier | **eliza-1 4B** GGUF (Q4_K_M), self-hosted on a DO **CPU droplet**, included **in v1** |
| 5 | Verdict generation | **Lazy** — only when a user opens a token; templated fallback if model down |
| 6 | Command name | **`/bnancy`** |
| 7 | Framing | **Exit-safety reality check** (due diligence), not buy recommendations |
| 8 | DEX scope (v1) | **PancakeSwap v2** reserves; Infinity CL depth/hooks = phase 2 |

## 4. Architecture & components

Follows existing conventions: env only in `config.ts`; services hold logic; bot handlers
are thin; throw `UserInputError`/`AppError`; update both repositories for any persisted
entity (none new in v1).

1. **`src/config.ts`** *(extend)* — add (Zod-validated):
   - `ELIZAOK_TRENDING_URL` (default `https://elizatest.com/api/elizaok/trending`)
   - `ELIZA_MODEL_URL`, `ELIZA_MODEL_NAME`, optional `ELIZA_MODEL_API_KEY`
   - `WATCHLIST_MAX_TOKENS` (default 10), `WATCHLIST_CACHE_SECONDS` (default 60)
   - `WATCHLIST_DEFAULT_SIZE_BNB` (notional size when a group has no pooled BNB yet)
   - Score thresholds: `MAX_EXIT_SLIPPAGE_BPS`, `MIN_LP_LOCK_DAYS`,
     `MAX_LP_HOLDER_CONCENTRATION_BPS` (reuse existing `MIN_LIQUIDITY_USD`,
     `MAX_BUY_TAX_BPS`, `MAX_SELL_TAX_BPS`, `RISK_CHECK_MODE`).

2. **`src/services/elizaOkFeedService.ts`** *(new)* — fetch + **Zod-validate** elizaOK's
   JSON (untrusted external data), normalize to a domain `TrendingCandidate`
   (tokenAddress, symbol, poolAddress, dexId, momentum score, conviction, thesis/risks,
   volume/flow, poolAgeMinutes, priceChangeH1). In-memory cache (`WATCHLIST_CACHE_SECONDS`).
   On non-200/timeout/parse-failure → `AppError`; caller degrades gracefully (serves last
   good cache or an "unavailable" state). Never crashes.

3. **`src/chain/pancakeSwapService.ts`** *(extend)* — add `quoteTokenSell(token, amountWei)`
   (token→native via `getAmountsOut`) to complement the existing `quoteNativeBuy`, so the
   pipeline can compute slippage to **enter** and to **exit** at a given size, plus the
   pool's effective depth. v2 only in v1.

4. **`src/services/tokenRiskService.ts`** *(extend)* — surface GoPlus fields already in the
   response we fetch but currently discarded: **LP lock status, lock duration, LP-holder
   concentration (top holder %), holder count**, alongside the existing honeypot /
   cannot_sell_all / blacklist / open-source / buy_tax / sell_tax. Extend `TokenRiskReport`
   accordingly (and any serialization if persisted — not persisted in v1).

5. **`src/services/watchlistService.ts`** *(new — orchestrator)*:
   - `getList(chatId)`: pull candidates → for each, **parallel deterministic enrichment**:
     two-sided depth at this group's treasury size (`pancakeSwapService`), LP/safety report
     (`tokenRiskService`), MEV-exposure heuristic.
   - Call `computeExitSafetyScore(signals)` (§5) → `{ grade, gate, score, reasons }`.
   - Rank by score, cap to `WATCHLIST_MAX_TOKENS`, return `WatchlistEntry[]`.
   - **Treasury-aware:** read the group's pooled BNB from `poolService`; if none yet, use
     `WATCHLIST_DEFAULT_SIZE_BNB` and label the list "sized at N BNB (no pool yet)".
   - Short in-memory cache keyed by `chatId + treasurySizeBucket`.

6. **`src/services/explanationService.ts`** *(new — separable prose layer)*:
   - Interface `ExplanationService { explain(entry: WatchlistEntry): Promise<string> }`.
   - `ElizaExplanationService` → POST to `ELIZA_MODEL_URL` (OpenAI-compatible
     `/v1/chat/completions`). Prompt: *explain only the provided numbers; state whether a
     group could enter and exit safely and why; do NOT invent data or recommend buying.*
     ~10s timeout.
   - `TemplatedExplanationService` → deterministic string from the signals. Used as the
     **fallback** when the model errors/times out, and as the impl in tests.
   - Generated **lazily** (per token, on detail-open), so the 4B box is never asked to
     narrate the whole list on each refresh.

7. **`src/bot/`** *(new command)* — `/bnancy`:
   - Renders the deterministic list: `symbol · BNancy grade · key flags · elizaOK momentum ·
     one-line headline`. Per-token inline button → detail view (lazy eliza-1 "why").
   - If `gate === "pass"`, a clearly-labeled **"Prepare proposal"** button deep-links into
     the **existing** `tradeService` → `safeSubmissionService` → Safe flow (which re-runs
     its own deterministic gate; owners sign; chain pinned to 56 by `ensureChain`).
   - Header copy: *"Exit-safety check — not financial advice. elizaOK discovery × BNancy
     due-diligence."* Thin handler; logic stays in `watchlistService`.

8. **Storage** — none new in v1 (computed on demand + in-memory cache). LP-flow-over-time
   persistence is phase 3 and will touch both repositories + `postgresSerialization.ts`.

## 5. `computeExitSafetyScore` (the deterministic heart)

Pure function. **Inputs** (per candidate): elizaOK momentum (score, conviction,
poolAgeMinutes, priceChangeH1, buy/sell flow); exit depth (enterSlippageBps,
exitSlippageBps at treasury size, liquidityUsd); LP/safety (honeypot, cannotSellAll,
buyTaxBps, sellTaxBps, lpLocked, lpLockDays, lpBurned, lpHolderTopPct, holderCount,
isOpenSource, isBlacklisted); mevExposure (derived from depth vs size).

**Output:** `{ score: 0-100, grade: A|B|C|D|F, gate: "pass"|"warn"|"block", reasons: string[] }`.

**Gate — BLOCK (hard; any one):**
- `honeypot` or `cannotSellAll` true.
- `sellTaxBps > MAX_SELL_TAX_BPS` (can't exit cleanly).
- liquidity unlocked **and** not burned (rug risk), in `block` mode.
- `liquidityUsd < MIN_LIQUIDITY_USD`, or depth unknown (quote failed).
- `exitSlippageBps > MAX_EXIT_SLIPPAGE_BPS` at treasury size (can't get out at size).
- `isBlacklisted` true.

**Gate — WARN (downgrade, not block):** moderate sell tax; `lpLockDays < MIN_LP_LOCK_DAYS`
(2026 norm ≥180d); `lpHolderTopPct > MAX_LP_HOLDER_CONCENTRATION_BPS`; elevated
`priceChangeH1` (chase risk); thin-but-exitable depth; `isOpenSource` false; depth/safety
field "unknown" (treated conservatively).

**Score:** weighted blend of exit-safety signals (exit slippage, lock, concentration,
taxes, depth) with elizaOK momentum as a **secondary** term, used to order pass/warn
entries. Block entries sort last (or are hidden behind a "blocked" fold). Conservative
default: any "unknown" signal lowers the score rather than being ignored.

**Reproducibility contract:** same inputs → same output, every run. No time-of-day, no
randomness, no network inside the function (enrichment happens before it).

## 6. Data flow

`/bnancy` → `watchlistService.getList(chatId)` → elizaOK feed → parallel enrich (depth +
safety + MEV at treasury size) → `computeExitSafetyScore` → rank/cap → bot renders fast →
user taps token → `explanationService.explain` (lazy eliza-1, template fallback) → if
`gate==="pass"`, "Prepare proposal" → existing Safe flow (own gate, owner signatures, chain 56).

## 7. Error handling (BNancy's convention)

- elizaOK down/malformed → `AppError`; list shows "discovery feed unavailable" or last
  cache; never crashes.
- Per-token quote/safety failure → that token flagged **"unknown" and conservatively
  downgraded**, not silently dropped.
- GoPlus/DexScreener failure → that token's safety read = "unknown" (gate treats
  conservatively).
- eliza-1 endpoint down/slow → `TemplatedExplanationService` fallback; the list works
  fully without the model.
- `UserInputError` for misuse (e.g., command where group context is required).
- All money-affecting decisions live in the deterministic gate; LLM failure can never
  affect safety.

## 8. Testing (`bun run verify`)

- `computeExitSafetyScore` — pure unit tests pinning grade/gate for representative signal
  sets, **including the elizaOK misfire case** ($80 FDV, −99.99% 1h, unlocked) → must
  grade **block / F**.
- `elizaOkFeedService` — Zod parse tests on a real sample + malformed/empty payloads.
- `tokenRiskService` — LP-field extraction tests from GoPlus sample payloads
  (locked / unlocked / concentrated / honeypot).
- `pancakeSwapService` — two-sided quote math tests (mocked RPC).
- `explanationService` — `ElizaExplanationService` timeout → falls back to template;
  templated output is deterministic. **The LLM is never in a test path** — tests use the
  templated impl, preserving reproducibility.

## 9. Inference infra (v1)

- A separate **DigitalOcean CPU Droplet** (≈8 vCPU / 16 GB, ~$84/mo) running **llama.cpp
  server** with **eliza-1 4B GGUF (Q4_K_M)**, exposing the OpenAI-compatible
  `/v1/chat/completions`. Set up once (Docker + model pull); **not** push-to-deploy.
- Firewalled to accept requests only from the App Platform app (or gated by
  `ELIZA_MODEL_API_KEY`). The bot (App Platform, unchanged `basic-xxs`) calls it via
  `ELIZA_MODEL_URL`.
- **License due-diligence (blocking before ship):** eliza-1's HF license shows as
  "Other / non-standard" — confirm it permits hosted/commercial use before deploying on it.

## 10. Phasing

- **v1 (this build):** elizaOK ingest + v2 two-sided depth + GoPlus LP fields + MEV
  heuristic + `computeExitSafetyScore` gate + `/bnancy` command + eliza-1 4B lazy prose
  (templated fallback) + the CPU droplet + trade bridge.
- **Phase 2:** PancakeSwap Infinity CL depth + hook inspection (singleton PoolManager, tick
  math) — richer, forward-looking depth and exit-trap detection.
- **Phase 3:** LP add/remove flow over time (needs persistence; both repositories +
  serialization); BNancy hunting her own candidates beyond elizaOK.

## 11. Risks & open items

- **Unreliable input feed:** elizaOK's list includes stale/misfiring entries (the design
  *relies* on BNancy's gate to catch these — see test in §8).
- **Positioning:** verdicts on a real-money product; mitigated by the exit-safety framing
  ("not financial advice"), elizaOK attribution, visible deterministic gate, and
  non-custodial owner-signing.
- **eliza-1 license** (see §9) — must clear before ship.
- **CPU latency:** 4B on CPU is slow; mitigated by lazy per-token generation + templated
  fallback. Revisit a small GPU if latency hurts UX.
- **MEV heuristic** is a v1 approximation (depth vs size); refine in phase 2.

## 12. Out of scope (v1)

Infinity CL/hook reads; LP time-series/flow; BNancy's own pool discovery; auto-execution
(humans always sign); multichain (BSC only — chainId 56).
