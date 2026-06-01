# BNancy Exit-Safety List (`/bnancy`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a treasury-aware, exit-safety ranked list (`/bnancy`) that re-scores elizaOK's BSC trending feed through BNancy's own liquidity lens, with eliza-1 (4B, self-hosted) writing the per-token "why."

**Architecture:** A deterministic pipeline (ingest elizaOK → enrich with two-sided PancakeSwap v2 depth + GoPlus LP/safety → `computeExitSafetyScore` pure function → rank/gate) drives everything. eliza-1 only turns the already-decided numbers into prose, behind a one-method `ExplanationService` interface with a templated fallback. BSC chainId 56 throughout. Non-custodial: any actual trade still goes through the existing `tradeService → Safe` flow that owners sign.

**Tech Stack:** Bun, TypeScript (strict, NodeNext, `.js` import extensions), Zod, viem, grammy, `bun:test`. Self-hosted eliza-1 4B GGUF via llama.cpp (OpenAI-compatible) on a DO CPU droplet.

**Spec:** `docs/superpowers/specs/2026-05-29-bnancy-exit-safety-list-design.md`

**Branch:** `bnancy-exit-safety-list` (already checked out).

**Conventions to honor (read first):**
- Env is read ONLY in `src/config.ts`. New services take a plain typed config object in their constructor (like `TokenRiskService`), so unit tests pass config directly.
- `exactOptionalPropertyTypes`: build optional object fields with spreads (`...(x === undefined ? {} : { key: x })`), never assign `undefined`.
- All relative imports use `.js` extensions even though files are `.ts`.
- Services throw `UserInputError` (shown to user) or `AppError` (operational). Never catch-and-swallow.
- Run `bun run verify` after each task (typecheck + tests + static acceptance).

**Implementation note (refinement of spec §5 thresholds):** The spec listed `MIN_LP_LOCK_DAYS` and `MAX_LP_HOLDER_CONCENTRATION_BPS`. GoPlus exposes LP **locked percentage** and LP **holder percentages** reliably, but lock *duration* requires brittle `locked_detail` unlock-time parsing. This plan uses **`MIN_LP_LOCKED_PERCENT`** and **`MAX_LP_HOLDER_TOP_PERCENT`** (percent-based, reliable) for v1; lock-duration is deferred to phase 2. Same intent (LP lock + concentration safety), simpler and deterministic.

---

## Task 1: Config — add watchlist env vars

**Files:**
- Modify: `src/config.ts`

- [ ] **Step 1: Add fields to `EnvSchema`**

In `src/config.ts`, inside the `z.object({...})` (after the `MAX_SELL_TAX_BPS` line, before the closing `})`), add:

```ts
    ELIZAOK_TRENDING_URL: z.string().url().default("https://elizatest.com/api/elizaok/trending"),
    ELIZA_MODEL_URL: z.preprocess((value) => (value === "" ? undefined : value), z.string().url().optional()),
    ELIZA_MODEL_NAME: z.string().min(1).default("eliza-1"),
    ELIZA_MODEL_API_KEY: z.preprocess((value) => (value === "" ? undefined : value), z.string().min(1).optional()),
    WATCHLIST_MAX_TOKENS: z.coerce.number().int().min(1).max(50).default(10),
    WATCHLIST_CACHE_SECONDS: z.coerce.number().int().min(0).max(3600).default(60),
    WATCHLIST_DEFAULT_SIZE_BNB: z.coerce.number().min(0).default(0.1),
    MAX_EXIT_SLIPPAGE_BPS: z.coerce.number().int().min(0).max(10000).default(1500),
    MIN_LP_LOCKED_PERCENT: z.coerce.number().min(0).max(100).default(50),
    MAX_LP_HOLDER_TOP_PERCENT: z.coerce.number().min(0).max(100).default(50)
```

- [ ] **Step 2: Add fields to the `AppConfig` type**

In the `export type AppConfig = {...}` (after `maxSellTaxBps: number;`), add:

```ts
  elizaOkTrendingUrl: string;
  elizaModelUrl?: string;
  elizaModelName: string;
  elizaModelApiKey?: string;
  watchlistMaxTokens: number;
  watchlistCacheSeconds: number;
  watchlistDefaultSizeBnb: number;
  maxExitSlippageBps: number;
  minLpLockedPercent: number;
  maxLpHolderTopPercent: number;
```

- [ ] **Step 3: Map them in `loadConfig`**

In the returned object (after `maxSellTaxBps: env.MAX_SELL_TAX_BPS`), add a comma and:

```ts
    elizaOkTrendingUrl: env.ELIZAOK_TRENDING_URL,
    ...(env.ELIZA_MODEL_URL === undefined ? {} : { elizaModelUrl: env.ELIZA_MODEL_URL }),
    elizaModelName: env.ELIZA_MODEL_NAME,
    ...(env.ELIZA_MODEL_API_KEY === undefined ? {} : { elizaModelApiKey: env.ELIZA_MODEL_API_KEY }),
    watchlistMaxTokens: env.WATCHLIST_MAX_TOKENS,
    watchlistCacheSeconds: env.WATCHLIST_CACHE_SECONDS,
    watchlistDefaultSizeBnb: env.WATCHLIST_DEFAULT_SIZE_BNB,
    maxExitSlippageBps: env.MAX_EXIT_SLIPPAGE_BPS,
    minLpLockedPercent: env.MIN_LP_LOCKED_PERCENT,
    maxLpHolderTopPercent: env.MAX_LP_HOLDER_TOP_PERCENT
```

- [ ] **Step 4: Verify typecheck**

Run: `bun run typecheck`
Expected: PASS (no errors).

- [ ] **Step 5: Commit**

```bash
git add src/config.ts
git commit -m "feat(config): add watchlist + eliza-1 env vars"
```

---

## Task 2: Domain types

**Files:**
- Modify: `src/domain/types.ts`

- [ ] **Step 1: Add the trending candidate + LP fields + watchlist types**

In `src/domain/types.ts`, extend `TokenRiskReport` (add the LP fields before `checkedAt: Date;`):

```ts
  lpLocked?: boolean;
  lpLockedPercent?: number;     // 0–100, locked + burned share of LP
  lpHolderTopPercent?: number;  // 0–100, largest single LP holder (excl. lock/burn)
  lpHolderCount?: number;
  holderCount?: number;
```

Then append these new types at the end of the file:

```ts
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
```

- [ ] **Step 2: Verify typecheck**

Run: `bun run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/domain/types.ts
git commit -m "feat(types): trending candidate, LP report fields, watchlist entry"
```

---

## Task 3: `pancakeSwapService.quoteTokenSell` (two-sided depth)

**Files:**
- Modify: `src/chain/pancakeSwapService.ts`
- Test: `tests/pancakeSwapService.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `tests/pancakeSwapService.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { PancakeSwapService } from "../src/chain/pancakeSwapService.js";
import { getBscContractAddresses } from "../src/chain/addresses.js";

function serviceWithQuote(out: bigint[]): PancakeSwapService {
  const service = new PancakeSwapService(getBscContractAddresses(56), "https://bsc-dataseed.binance.org", 56);
  // Override the viem client's readContract with a deterministic stub.
  (service.publicClient as unknown as { readContract: () => Promise<bigint[]> }).readContract = async () => out;
  return service;
}

describe("PancakeSwapService.quoteTokenSell", () => {
  it("returns the last amount from getAmountsOut for token->WBNB", async () => {
    const service = serviceWithQuote([1000n, 950n]);
    const out = await service.quoteTokenSell("0x2222222222222222222222222222222222222222", 1000n);
    expect(out).toBe(950n);
  });

  it("throws when the quote returns no output", async () => {
    const service = serviceWithQuote([1000n, 0n]);
    await expect(service.quoteTokenSell("0x2222222222222222222222222222222222222222", 1000n)).rejects.toThrow(
      "PancakeSwap V2 quote returned no output"
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/pancakeSwapService.test.ts`
Expected: FAIL with "quoteTokenSell is not a function".

- [ ] **Step 3: Implement `quoteTokenSell`**

In `src/chain/pancakeSwapService.ts`, add this method right after `quoteNativeBuy` (before `buildNativeBuyTransaction`):

```ts
  async quoteTokenSell(tokenAddress: Address, inputAmountWei: bigint): Promise<bigint> {
    this.assertConfigured();
    const amounts = await this.publicClient.readContract({
      address: this.addresses.pancakeV2Router,
      abi: pancakeV2RouterAbi,
      functionName: "getAmountsOut",
      args: [inputAmountWei, [tokenAddress, this.addresses.wbnb]]
    });
    const outputAmount = amounts.at(-1);
    if (outputAmount === undefined || outputAmount <= 0n) {
      throw new UserInputError("PancakeSwap V2 quote returned no output");
    }
    return outputAmount;
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/pancakeSwapService.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/chain/pancakeSwapService.ts tests/pancakeSwapService.test.ts
git commit -m "feat(chain): quoteTokenSell for two-sided exit slippage"
```

---

## Task 4: `tokenRiskService` — surface GoPlus LP fields

**Files:**
- Modify: `src/services/tokenRiskService.ts`
- Test: `tests/tokenRiskService.test.ts` (extend)

- [ ] **Step 1: Write the failing test**

Append this `it(...)` inside the existing `describe("TokenRiskService", ...)` block in `tests/tokenRiskService.test.ts`:

```ts
  it("surfaces GoPlus LP lock and holder fields", async () => {
    const token = "0x3333333333333333333333333333333333333333";
    const fakeFetch = async (input: string | URL | Request) => {
      const url = input.toString();
      if (url.includes("dexscreener")) {
        return response([{ url: "https://dexscreener.com/bsc/pair", liquidity: { usd: 50000 } }]);
      }
      return response({
        result: {
          [token]: {
            is_honeypot: "0",
            buy_tax: "0.01",
            sell_tax: "0.01",
            holder_count: "1200",
            lp_holder_count: "3",
            lp_holders: [
              { address: "0x000000000000000000000000000000000000dead", percent: "0.6", is_locked: 1, tag: "Burn" },
              { address: "0xabc", percent: "0.3", is_locked: 0 },
              { address: "0xdef", percent: "0.1", is_locked: 0 }
            ]
          }
        }
      });
    };
    Object.defineProperty(globalThis, "fetch", { configurable: true, value: fakeFetch });
    const service = new TokenRiskService({ mode: "warn", minLiquidityUsd: 1000, maxBuyTaxBps: 1500, maxSellTaxBps: 1500 });

    const report = await service.checkBscToken(token);

    expect(report.lpLockedPercent).toBeCloseTo(60, 0);   // burned LP counts as locked
    expect(report.lpHolderTopPercent).toBeCloseTo(30, 0); // largest non-locked holder
    expect(report.lpHolderCount).toBe(3);
    expect(report.holderCount).toBe(1200);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/tokenRiskService.test.ts`
Expected: FAIL (`report.lpLockedPercent` is `undefined`).

- [ ] **Step 3: Implement the LP-field extraction**

In `src/services/tokenRiskService.ts`:

(a) Extend the `GoPlusTokenSecurity` type:

```ts
type GoPlusLpHolder = {
  address?: string;
  percent?: string;
  is_locked?: number;
  tag?: string;
};

type GoPlusTokenSecurity = {
  is_honeypot?: string;
  cannot_sell_all?: string;
  is_blacklisted?: string;
  is_open_source?: string;
  buy_tax?: string;
  sell_tax?: string;
  holder_count?: string;
  lp_holder_count?: string;
  lp_holders?: GoPlusLpHolder[];
};
```

(b) Add these helpers at the bottom of the file (next to `parseTaxBps`):

```ts
const BURN_ADDRESSES = new Set([
  "0x0000000000000000000000000000000000000000",
  "0x000000000000000000000000000000000000dead"
]);

function parsePercent(value: string | undefined): number | undefined {
  if (value === undefined || value.length === 0) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  return parsed * 100; // GoPlus reports fractions (0.6 => 60%)
}

function summarizeLpHolders(holders: GoPlusLpHolder[] | undefined): {
  lpLockedPercent?: number;
  lpHolderTopPercent?: number;
} {
  if (holders === undefined || holders.length === 0) return {};
  let locked = 0;
  let topUnlocked = 0;
  for (const holder of holders) {
    const pct = parsePercent(holder.percent) ?? 0;
    const isBurn = holder.address !== undefined && BURN_ADDRESSES.has(holder.address.toLowerCase());
    if (holder.is_locked === 1 || isBurn) {
      locked += pct;
    } else if (pct > topUnlocked) {
      topUnlocked = pct;
    }
  }
  return { lpLockedPercent: locked, lpHolderTopPercent: topUnlocked };
}

function parseCount(value: string | undefined): number | undefined {
  if (value === undefined || value.length === 0) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : undefined;
}
```

(c) In `checkBscToken`, after `const sellTaxBps = parseTaxBps(tokenSecurity?.sell_tax);`, add:

```ts
    const lp = summarizeLpHolders(tokenSecurity?.lp_holders);
    const lpHolderCount = parseCount(tokenSecurity?.lp_holder_count);
    const holderCount = parseCount(tokenSecurity?.holder_count);
    const lpLocked = lp.lpLockedPercent === undefined ? undefined : lp.lpLockedPercent >= 50;
```

(d) In the returned report object, add these spreads alongside the existing optional spreads (before `checkedAt: new Date()`):

```ts
      ...(lpLocked === undefined ? {} : { lpLocked }),
      ...(lp.lpLockedPercent === undefined ? {} : { lpLockedPercent: lp.lpLockedPercent }),
      ...(lp.lpHolderTopPercent === undefined ? {} : { lpHolderTopPercent: lp.lpHolderTopPercent }),
      ...(lpHolderCount === undefined ? {} : { lpHolderCount }),
      ...(holderCount === undefined ? {} : { holderCount }),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/tokenRiskService.test.ts`
Expected: PASS (existing test + new one).

- [ ] **Step 5: Commit**

```bash
git add src/services/tokenRiskService.ts tests/tokenRiskService.test.ts
git commit -m "feat(risk): surface GoPlus LP lock/holder/count fields"
```

---

## Task 5: `computeExitSafetyScore` (the deterministic heart)

**Files:**
- Create: `src/services/exitSafetyScore.ts`
- Test: `tests/exitSafetyScore.test.ts` (create)

- [ ] **Step 1: Write the failing tests**

Create `tests/exitSafetyScore.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { computeExitSafetyScore, type ExitSafetySignals, type ExitSafetyThresholds } from "../src/services/exitSafetyScore.js";

const thresholds: ExitSafetyThresholds = {
  mode: "block",
  minLiquidityUsd: 1000,
  maxSellTaxBps: 1500,
  maxExitSlippageBps: 1500,
  minLpLockedPercent: 50,
  maxLpHolderTopPercent: 50
};

function base(): ExitSafetySignals {
  return {
    momentumScore: 80,
    liquidityUsd: 150000,
    roundTripLossBps: 300,
    honeypot: false,
    cannotSellAll: false,
    buyTaxBps: 100,
    sellTaxBps: 100,
    lpLockedPercent: 80,
    lpHolderTopPercent: 10,
    isBlacklisted: false,
    isOpenSource: true
  };
}

describe("computeExitSafetyScore", () => {
  it("passes a clean, deep, locked token", () => {
    const r = computeExitSafetyScore(base(), thresholds);
    expect(r.gate).toBe("pass");
    expect(r.grade).toBe("A");
  });

  it("blocks a honeypot", () => {
    const r = computeExitSafetyScore({ ...base(), honeypot: true }, thresholds);
    expect(r.gate).toBe("block");
    expect(r.grade).toBe("F");
    expect(r.reasons.join(" ")).toContain("honeypot");
  });

  it("blocks when exit cost at size is too high", () => {
    const r = computeExitSafetyScore({ ...base(), roundTripLossBps: 4000 }, thresholds);
    expect(r.gate).toBe("block");
  });

  it("blocks unlocked liquidity in block mode", () => {
    const r = computeExitSafetyScore({ ...base(), lpLockedPercent: 5 }, thresholds);
    expect(r.gate).toBe("block");
  });

  it("blocks the elizaOK misfire token (tiny FDV, dumping, unlocked, unknown depth)", () => {
    const misfire: ExitSafetySignals = {
      momentumScore: 100,
      priceChangeH1: -99.987,
      liquidityUsd: undefined,   // depth unknown (quote failed)
      roundTripLossBps: undefined,
      honeypot: false,
      cannotSellAll: false,
      lpLockedPercent: 0,
      lpHolderTopPercent: 90,
      isBlacklisted: false,
      isOpenSource: false
    };
    const r = computeExitSafetyScore(misfire, thresholds);
    expect(r.gate).toBe("block");
    expect(r.grade).toBe("F");
  });

  it("warns (not block) on a short-ish but exitable token in warn mode", () => {
    const r = computeExitSafetyScore({ ...base(), lpLockedPercent: 30, sellTaxBps: 800 }, { ...thresholds, mode: "warn" });
    expect(r.gate).toBe("warn");
  });

  it("is reproducible: same input -> same output", () => {
    const a = computeExitSafetyScore(base(), thresholds);
    const b = computeExitSafetyScore(base(), thresholds);
    expect(a).toEqual(b);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test tests/exitSafetyScore.test.ts`
Expected: FAIL with "Cannot find module exitSafetyScore".

- [ ] **Step 3: Implement the pure function**

Create `src/services/exitSafetyScore.ts`:

```ts
import type { ExitSafetyGate, ExitSafetyGrade } from "../domain/types.js";

export type ExitSafetySignals = {
  momentumScore: number; // 0–100 from elizaOK
  priceChangeH1?: number;
  liquidityUsd?: number; // undefined = unknown depth
  roundTripLossBps?: number; // combined enter+exit cost at treasury size; undefined = unknown
  honeypot: boolean;
  cannotSellAll: boolean;
  buyTaxBps?: number;
  sellTaxBps?: number;
  lpLockedPercent?: number; // 0–100
  lpHolderTopPercent?: number; // 0–100
  isBlacklisted: boolean;
  isOpenSource?: boolean;
};

export type ExitSafetyThresholds = {
  mode: "warn" | "block";
  minLiquidityUsd: number;
  maxSellTaxBps: number;
  maxExitSlippageBps: number;
  minLpLockedPercent: number;
  maxLpHolderTopPercent: number;
};

export type ExitSafetyResult = {
  score: number; // 0–100, higher = safer to enter/exit
  grade: ExitSafetyGrade;
  gate: ExitSafetyGate;
  reasons: string[];
};

// Deterministic. No time, no randomness, no I/O. Same input => same output.
export function computeExitSafetyScore(signals: ExitSafetySignals, t: ExitSafetyThresholds): ExitSafetyResult {
  const hardBlocks: string[] = [];
  const warns: string[] = [];

  // --- Hard safety failures (cannot exit / will lose funds) ---
  if (signals.honeypot) hardBlocks.push("Flagged as honeypot — you may not be able to sell");
  if (signals.cannotSellAll) hardBlocks.push("Cannot-sell-all risk flagged");
  if (signals.isBlacklisted) hardBlocks.push("Blacklist mechanism present");
  if (signals.sellTaxBps !== undefined && signals.sellTaxBps > t.maxSellTaxBps) {
    hardBlocks.push(`Sell tax ${(signals.sellTaxBps / 100).toFixed(1)}% exceeds the exit-safety limit`);
  }
  if (signals.roundTripLossBps !== undefined && signals.roundTripLossBps > t.maxExitSlippageBps) {
    hardBlocks.push(`Round-trip cost ${(signals.roundTripLossBps / 100).toFixed(1)}% at your size — too thin to exit cleanly`);
  }
  if (signals.liquidityUsd !== undefined && signals.liquidityUsd < t.minLiquidityUsd) {
    hardBlocks.push(`Liquidity below $${t.minLiquidityUsd}`);
  }
  if (signals.liquidityUsd === undefined || signals.roundTripLossBps === undefined) {
    hardBlocks.push("Depth unknown — could not confirm you can exit at your size");
  }
  if (signals.lpLockedPercent !== undefined && signals.lpLockedPercent < t.minLpLockedPercent) {
    hardBlocks.push(`Only ${signals.lpLockedPercent.toFixed(0)}% of liquidity locked/burned — rug risk`);
  }

  // --- Softer concerns (downgrade, not block) ---
  if (signals.lpLockedPercent === undefined) warns.push("Liquidity lock status unknown");
  if (signals.lpHolderTopPercent !== undefined && signals.lpHolderTopPercent > t.maxLpHolderTopPercent) {
    warns.push(`One LP holder controls ${signals.lpHolderTopPercent.toFixed(0)}% of unlocked liquidity`);
  }
  if (signals.isOpenSource === false) warns.push("Contract source not verified");
  if (signals.priceChangeH1 !== undefined && Math.abs(signals.priceChangeH1) > 50) {
    warns.push(`Volatile: ${signals.priceChangeH1.toFixed(0)}% in 1h (chase risk)`);
  }
  if (signals.sellTaxBps !== undefined && signals.sellTaxBps > 300 && signals.sellTaxBps <= t.maxSellTaxBps) {
    warns.push(`Sell tax ${(signals.sellTaxBps / 100).toFixed(1)}% eats into exits`);
  }

  // --- Score (0–100). Start high, subtract for risk. Momentum is a small secondary nudge. ---
  let score = 100;
  score -= Math.min(40, (signals.roundTripLossBps ?? 2000) / 50); // exit cost dominates
  if (signals.lpLockedPercent !== undefined) score -= Math.max(0, (t.minLpLockedPercent - signals.lpLockedPercent) * 0.5);
  if (signals.lpHolderTopPercent !== undefined) score -= Math.min(15, signals.lpHolderTopPercent * 0.2);
  score -= hardBlocks.length * 20;
  score -= warns.length * 5;
  score += Math.min(5, signals.momentumScore / 20); // small secondary nudge
  score = Math.max(0, Math.min(100, Math.round(score)));

  const gate: ExitSafetyGate = hardBlocks.length > 0 ? (t.mode === "block" ? "block" : "warn") : warns.length > 0 ? "warn" : "pass";
  const reasons = [...hardBlocks, ...warns];
  const grade = gradeFor(score, gate);
  return { score, grade, gate, reasons };
}

function gradeFor(score: number, gate: ExitSafetyGate): ExitSafetyGrade {
  if (gate === "block") return "F";
  if (score >= 85) return "A";
  if (score >= 70) return "B";
  if (score >= 55) return "C";
  return "D";
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test tests/exitSafetyScore.test.ts`
Expected: PASS (7 tests). If a warn/block boundary test fails, adjust the *test's* input to clearly fall in the intended band — do not weaken the gate logic.

- [ ] **Step 5: Commit**

```bash
git add src/services/exitSafetyScore.ts tests/exitSafetyScore.test.ts
git commit -m "feat(score): deterministic exit-safety score + gate"
```

---

## Task 6: `elizaOkFeedService` (zod-validated ingest)

**Files:**
- Create: `src/services/elizaOkFeedService.ts`
- Test: `tests/elizaOkFeedService.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `tests/elizaOkFeedService.test.ts`:

```ts
import { afterEach, describe, expect, it } from "bun:test";
import { ElizaOkFeedService } from "../src/services/elizaOkFeedService.js";

const SAMPLE = {
  generatedAt: "2026-05-29T23:00:33.254Z",
  count: 1,
  tokens: [
    {
      rank: 1,
      score: 100,
      conviction: "high",
      tokenAddress: "0xAB1B1b4e82EA28a3e4D2D8513aAA9C1e42ed493f",
      tokenSymbol: "OpenHuman",
      poolAddress: "0x1097313fe77ab707097e73c5f61cc8d1c3d4d02a",
      dexId: "pancakeswap_v2",
      fdvUsd: 80.27,
      reserveUsd: 173130.9,
      volumeUsdH1: 67417.99,
      priceChangeH1: -99.987,
      poolAgeMinutes: 2,
      thesis: ["x"],
      risks: ["y"]
    }
  ]
};

describe("ElizaOkFeedService", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => Object.defineProperty(globalThis, "fetch", { configurable: true, value: originalFetch }));

  function withFetch(value: unknown): void {
    Object.defineProperty(globalThis, "fetch", { configurable: true, value });
  }

  it("validates and normalizes the trending feed", async () => {
    withFetch(async () => ({ ok: true, json: async () => SAMPLE }) as Response);
    const service = new ElizaOkFeedService({ url: "https://example.com/feed", cacheSeconds: 0 });
    const candidates = await service.getCandidates();
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.tokenSymbol).toBe("OpenHuman");
    expect(candidates[0]?.momentumScore).toBe(100);
    expect(candidates[0]?.tokenAddress).toBe("0xab1b1b4e82ea28a3e4d2d8513aaa9c1e42ed493f");
  });

  it("throws AppError on a non-200 response", async () => {
    withFetch(async () => ({ ok: false, status: 503, json: async () => ({}) }) as Response);
    const service = new ElizaOkFeedService({ url: "https://example.com/feed", cacheSeconds: 0 });
    await expect(service.getCandidates()).rejects.toThrow("elizaOK trending feed unavailable");
  });

  it("throws AppError on a malformed payload", async () => {
    withFetch(async () => ({ ok: true, json: async () => ({ tokens: [{ rank: "nope" }] }) }) as Response);
    const service = new ElizaOkFeedService({ url: "https://example.com/feed", cacheSeconds: 0 });
    await expect(service.getCandidates()).rejects.toThrow("elizaOK trending feed");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/elizaOkFeedService.test.ts`
Expected: FAIL ("Cannot find module elizaOkFeedService").

- [ ] **Step 3: Implement the service**

Create `src/services/elizaOkFeedService.ts`:

```ts
import { z } from "zod";
import { AppError } from "../domain/errors.js";
import type { TrendingCandidate } from "../domain/types.js";
import { parseAddress } from "../utils/evm.js";

const TokenSchema = z.object({
  rank: z.number(),
  score: z.number(),
  conviction: z.string().default("unknown"),
  tokenAddress: z.string(),
  tokenSymbol: z.string(),
  poolAddress: z.string(),
  dexId: z.string().default("unknown"),
  fdvUsd: z.number().nullish(),
  reserveUsd: z.number().nullish(),
  volumeUsdH1: z.number().nullish(),
  priceChangeH1: z.number().nullish(),
  poolAgeMinutes: z.number().nullish(),
  thesis: z.array(z.string()).default([]),
  risks: z.array(z.string()).default([])
});

const FeedSchema = z.object({ tokens: z.array(TokenSchema) });

export type ElizaOkFeedConfig = { url: string; cacheSeconds: number };

export class ElizaOkFeedService {
  private cache: { at: number; candidates: TrendingCandidate[] } | null = null;

  constructor(private readonly config: ElizaOkFeedConfig) {}

  async getCandidates(): Promise<TrendingCandidate[]> {
    const now = Date.now();
    if (this.cache !== null && now - this.cache.at < this.config.cacheSeconds * 1000) {
      return this.cache.candidates;
    }
    let response: Response;
    try {
      response = await fetch(this.config.url, { headers: { Accept: "application/json" } });
    } catch (error) {
      throw new AppError("elizaOK trending feed unavailable", { cause: String(error) });
    }
    if (!response.ok) {
      throw new AppError("elizaOK trending feed unavailable", { status: response.status });
    }
    const parsed = FeedSchema.safeParse(await response.json());
    if (!parsed.success) {
      throw new AppError("elizaOK trending feed returned an unexpected shape", { issues: parsed.error.message });
    }
    const candidates = parsed.data.tokens.map(normalize);
    this.cache = { at: now, candidates };
    return candidates;
  }
}

function normalize(token: z.infer<typeof TokenSchema>): TrendingCandidate {
  return {
    rank: token.rank,
    tokenAddress: parseAddress(token.tokenAddress),
    tokenSymbol: token.tokenSymbol,
    poolAddress: parseAddress(token.poolAddress),
    dexId: token.dexId,
    momentumScore: token.score,
    conviction: token.conviction,
    thesis: token.thesis,
    risks: token.risks,
    ...(token.fdvUsd == null ? {} : { fdvUsd: token.fdvUsd }),
    ...(token.reserveUsd == null ? {} : { reserveUsd: token.reserveUsd }),
    ...(token.volumeUsdH1 == null ? {} : { volumeUsdH1: token.volumeUsdH1 }),
    ...(token.priceChangeH1 == null ? {} : { priceChangeH1: token.priceChangeH1 }),
    ...(token.poolAgeMinutes == null ? {} : { poolAgeMinutes: token.poolAgeMinutes })
  };
}
```

> Note: `parseAddress` lowercases/validates via viem (`src/utils/evm.ts`). If a candidate address is invalid, `normalize` throws and `getCandidates` rejects — acceptable (the whole feed is suspect). If you prefer per-token resilience, wrap `normalize` in try/catch and `.filter(Boolean)`; not required for v1.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/elizaOkFeedService.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/services/elizaOkFeedService.ts tests/elizaOkFeedService.test.ts
git commit -m "feat(feed): zod-validated elizaOK trending ingest"
```

---

## Task 7: `explanationService` (eliza-1 client + templated fallback)

**Files:**
- Create: `src/services/explanationService.ts`
- Test: `tests/explanationService.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `tests/explanationService.test.ts`:

```ts
import { afterEach, describe, expect, it } from "bun:test";
import { ElizaExplanationService, TemplatedExplanationService } from "../src/services/explanationService.js";
import type { WatchlistEntry } from "../src/domain/types.js";

function entry(): WatchlistEntry {
  return {
    candidate: {
      rank: 1, tokenAddress: "0x3333333333333333333333333333333333333333", tokenSymbol: "FOO",
      poolAddress: "0x4444444444444444444444444444444444444444", dexId: "pancakeswap_v2",
      momentumScore: 80, conviction: "high", thesis: [], risks: []
    },
    riskReport: { tokenAddress: "0x3333333333333333333333333333333333333333", level: "low", blocked: false, reasons: [], checkedAt: new Date() },
    treasurySizeBnb: 1, score: 88, grade: "A", gate: "pass", reasons: []
  };
}

describe("explanationService", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => Object.defineProperty(globalThis, "fetch", { configurable: true, value: originalFetch }));

  it("templated explanation is deterministic and mentions the grade", async () => {
    const svc = new TemplatedExplanationService();
    const a = await svc.explain(entry());
    const b = await svc.explain(entry());
    expect(a).toBe(b);
    expect(a).toContain("A");
  });

  it("eliza explanation falls back to template when the model errors", async () => {
    Object.defineProperty(globalThis, "fetch", { configurable: true, value: async () => { throw new Error("down"); } });
    const svc = new ElizaExplanationService({ url: "https://model.example/v1/chat/completions", model: "eliza-1", timeoutMs: 50 });
    const text = await svc.explain(entry());
    expect(text.length).toBeGreaterThan(0); // never throws; returns the templated fallback
    expect(text).toContain("FOO");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/explanationService.test.ts`
Expected: FAIL ("Cannot find module explanationService").

- [ ] **Step 3: Implement the interface + both impls**

Create `src/services/explanationService.ts`:

```ts
import type { WatchlistEntry } from "../domain/types.js";

export interface ExplanationService {
  explain(entry: WatchlistEntry): Promise<string>;
}

// Deterministic, no I/O. Also the fallback when the model is unavailable.
export class TemplatedExplanationService implements ExplanationService {
  async explain(entry: WatchlistEntry): Promise<string> {
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

  constructor(private readonly config: ElizaConfig) {}

  async explain(entry: WatchlistEntry): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs ?? 10000);
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
          messages: [
            {
              role: "system",
              content:
                "You explain a token's exit-safety verdict for a group treasury on BNB Chain. Use ONLY the numbers given. Do NOT invent data and do NOT tell anyone to buy. 2 sentences max."
            },
            { role: "user", content: prompt(entry) }
          ],
          max_tokens: 160,
          temperature: 0.2
        })
      });
      if (!response.ok) return this.fallback.explain(entry);
      const body = (await response.json()) as { choices?: { message?: { content?: string } }[] };
      const text = body.choices?.[0]?.message?.content?.trim();
      return text && text.length > 0 ? text : this.fallback.explain(entry);
    } catch {
      return this.fallback.explain(entry);
    } finally {
      clearTimeout(timer);
    }
  }
}

function prompt(entry: WatchlistEntry): string {
  return [
    `Token: ${entry.candidate.tokenSymbol} (${entry.candidate.tokenAddress})`,
    `BNancy grade: ${entry.grade}; gate: ${entry.gate}; score: ${entry.score}/100`,
    `Treasury size used: ${entry.treasurySizeBnb} BNB`,
    entry.roundTripLossBps === undefined ? "Round-trip exit cost: unknown" : `Round-trip exit cost: ${(entry.roundTripLossBps / 100).toFixed(1)}%`,
    entry.liquidityUsd === undefined ? "Liquidity: unknown" : `Liquidity: $${Math.round(entry.liquidityUsd)}`,
    `elizaOK momentum: ${entry.candidate.momentumScore}/100 (${entry.candidate.conviction})`,
    `Flags: ${entry.reasons.length > 0 ? entry.reasons.join("; ") : "none"}`
  ].join("\n");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/explanationService.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/services/explanationService.ts tests/explanationService.test.ts
git commit -m "feat(explain): eliza-1 client with templated fallback (prose only)"
```

---

## Task 8: `watchlistService` (orchestrator)

**Files:**
- Create: `src/services/watchlistService.ts`
- Test: `tests/watchlistService.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `tests/watchlistService.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { WatchlistService } from "../src/services/watchlistService.js";
import type { TrendingCandidate, TokenRiskReport } from "../src/domain/types.js";

const cleanCandidate: TrendingCandidate = {
  rank: 1, tokenAddress: "0x1111111111111111111111111111111111111111", tokenSymbol: "GOOD",
  poolAddress: "0xaaaa111111111111111111111111111111111111", dexId: "pancakeswap_v2",
  momentumScore: 80, conviction: "high", thesis: [], risks: [], reserveUsd: 150000
};
const misfireCandidate: TrendingCandidate = {
  rank: 2, tokenAddress: "0x2222222222222222222222222222222222222222", tokenSymbol: "RUG",
  poolAddress: "0xbbbb222222222222222222222222222222222222", dexId: "pancakeswap_v2",
  momentumScore: 100, conviction: "high", thesis: [], risks: [], priceChangeH1: -99.987
};

function report(over: Partial<TokenRiskReport>): TokenRiskReport {
  return { tokenAddress: "0x0", level: "low", blocked: false, reasons: [], checkedAt: new Date(), ...over };
}

function buildService() {
  const feed = { getCandidates: async () => [cleanCandidate, misfireCandidate] };
  const pancake = {
    quoteNativeBuy: async (token: string) => (token === cleanCandidate.tokenAddress ? 1000n : 0n),
    quoteTokenSell: async (token: string) => {
      if (token === cleanCandidate.tokenAddress) return 995n; // ~0.5% round trip
      throw new Error("no liquidity");
    }
  };
  const risk = {
    checkBscToken: async (token: string) =>
      token === cleanCandidate.tokenAddress
        ? report({ tokenAddress: cleanCandidate.tokenAddress, liquidityUsd: 150000, lpLockedPercent: 80, lpHolderTopPercent: 10 })
        : report({ tokenAddress: misfireCandidate.tokenAddress, lpLockedPercent: 0, lpHolderTopPercent: 90, level: "high" })
  };
  return new WatchlistService(feed as never, pancake as never, risk as never, {
    maxTokens: 10,
    defaultSizeBnb: 1,
    thresholds: { mode: "block", minLiquidityUsd: 1000, maxSellTaxBps: 1500, maxExitSlippageBps: 1500, minLpLockedPercent: 50, maxLpHolderTopPercent: 50 }
  });
}

describe("WatchlistService", () => {
  it("scores both, passing the clean token and blocking the misfire", async () => {
    const list = await buildService().getList(1);
    const good = list.find((e) => e.candidate.tokenSymbol === "GOOD");
    const rug = list.find((e) => e.candidate.tokenSymbol === "RUG");
    expect(good?.gate).toBe("pass");
    expect(rug?.gate).toBe("block"); // unlocked LP + unknown depth (sell quote threw)
  });

  it("ranks safer entries first", async () => {
    const list = await buildService().getList(1);
    expect(list[0]?.candidate.tokenSymbol).toBe("GOOD");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/watchlistService.test.ts`
Expected: FAIL ("Cannot find module watchlistService").

- [ ] **Step 3: Implement the orchestrator**

Create `src/services/watchlistService.ts`:

```ts
import { parseEther } from "viem";
import type { TrendingCandidate, WatchlistEntry } from "../domain/types.js";
import { computeExitSafetyScore, type ExitSafetyThresholds } from "./exitSafetyScore.js";

// Structural interfaces so this service is unit-testable with fakes.
interface FeedLike { getCandidates(): Promise<TrendingCandidate[]>; }
interface QuoteLike {
  quoteNativeBuy(token: `0x${string}`, amountWei: bigint): Promise<bigint>;
  quoteTokenSell(token: `0x${string}`, amountWei: bigint): Promise<bigint>;
}
interface RiskLike { checkBscToken(token: `0x${string}`): Promise<WatchlistEntry["riskReport"]>; }

export type WatchlistConfig = { maxTokens: number; defaultSizeBnb: number; thresholds: ExitSafetyThresholds };

export class WatchlistService {
  constructor(
    private readonly feed: FeedLike,
    private readonly quotes: QuoteLike,
    private readonly risk: RiskLike,
    private readonly config: WatchlistConfig
  ) {}

  async getList(_chatId: number, treasurySizeBnb?: number): Promise<WatchlistEntry[]> {
    const size = treasurySizeBnb && treasurySizeBnb > 0 ? treasurySizeBnb : this.config.defaultSizeBnb;
    const sizeWei = parseEther(size.toString());
    const candidates = await this.feed.getCandidates();
    const entries = await Promise.all(candidates.map((c) => this.enrich(c, size, sizeWei)));
    return entries.sort((a, b) => b.score - a.score).slice(0, this.config.maxTokens);
  }

  private async enrich(candidate: TrendingCandidate, size: number, sizeWei: bigint): Promise<WatchlistEntry> {
    const riskReport = await this.safeRisk(candidate.tokenAddress);
    const roundTripLossBps = await this.roundTrip(candidate.tokenAddress, sizeWei);
    const liquidityUsd = riskReport.liquidityUsd ?? candidate.reserveUsd;

    const result = computeExitSafetyScore(
      {
        momentumScore: candidate.momentumScore,
        honeypot: riskReport.reasons.some((r) => r.toLowerCase().includes("honeypot")),
        cannotSellAll: riskReport.reasons.some((r) => r.toLowerCase().includes("cannot-sell")),
        isBlacklisted: riskReport.reasons.some((r) => r.toLowerCase().includes("blacklist")),
        ...(candidate.priceChangeH1 === undefined ? {} : { priceChangeH1: candidate.priceChangeH1 }),
        ...(liquidityUsd === undefined ? {} : { liquidityUsd }),
        ...(roundTripLossBps === undefined ? {} : { roundTripLossBps }),
        ...(riskReport.buyTaxBps === undefined ? {} : { buyTaxBps: riskReport.buyTaxBps }),
        ...(riskReport.sellTaxBps === undefined ? {} : { sellTaxBps: riskReport.sellTaxBps }),
        ...(riskReport.lpLockedPercent === undefined ? {} : { lpLockedPercent: riskReport.lpLockedPercent }),
        ...(riskReport.lpHolderTopPercent === undefined ? {} : { lpHolderTopPercent: riskReport.lpHolderTopPercent })
      },
      this.config.thresholds
    );

    return {
      candidate,
      riskReport,
      treasurySizeBnb: size,
      score: result.score,
      grade: result.grade,
      gate: result.gate,
      reasons: result.reasons,
      ...(roundTripLossBps === undefined ? {} : { roundTripLossBps }),
      ...(liquidityUsd === undefined ? {} : { liquidityUsd })
    };
  }

  // Round-trip cost in bps at the treasury size: buy sizeWei -> tokens -> sell back -> bnb.
  // Stateless quotes (an approximation; ignores intra-trade reserve shift). undefined = unknown.
  private async roundTrip(token: `0x${string}`, sizeWei: bigint): Promise<number | undefined> {
    try {
      const tokensOut = await this.quotes.quoteNativeBuy(token, sizeWei);
      if (tokensOut <= 0n) return undefined;
      const bnbBack = await this.quotes.quoteTokenSell(token, tokensOut);
      if (bnbBack <= 0n) return undefined;
      const lossBps = Number(((sizeWei - bnbBack) * 10000n) / sizeWei);
      return Math.max(0, lossBps);
    } catch {
      return undefined; // depth unknown -> scorer treats conservatively (block in block mode)
    }
  }

  private async safeRisk(token: `0x${string}`): Promise<WatchlistEntry["riskReport"]> {
    try {
      return await this.risk.checkBscToken(token);
    } catch {
      return { tokenAddress: token, level: "unknown", blocked: false, reasons: ["Safety check unavailable"], checkedAt: new Date() };
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/watchlistService.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/services/watchlistService.ts tests/watchlistService.test.ts
git commit -m "feat(watchlist): treasury-aware orchestrator (ingest+enrich+score+rank)"
```

---

## Task 9: Wire services into `app.ts` + `BotDependencies`

**Files:**
- Modify: `src/app.ts`
- Modify: `src/bot/bot.ts` (the `BotDependencies` type + `createBot` call args are passed from `app.ts`)

- [ ] **Step 1: Construct the services in `buildApp`**

In `src/app.ts`, add imports near the other service imports:

```ts
import { ElizaOkFeedService } from "./services/elizaOkFeedService.js";
import { WatchlistService } from "./services/watchlistService.js";
import { ElizaExplanationService, TemplatedExplanationService, type ExplanationService } from "./services/explanationService.js";
```

After `const tradeService = ...` (line ~73), add:

```ts
  const elizaOkFeedService = new ElizaOkFeedService({
    url: config.elizaOkTrendingUrl,
    cacheSeconds: config.watchlistCacheSeconds
  });
  const watchlistService = new WatchlistService(elizaOkFeedService, pancakeSwapService, tokenRiskService, {
    maxTokens: config.watchlistMaxTokens,
    defaultSizeBnb: config.watchlistDefaultSizeBnb,
    thresholds: {
      mode: config.riskCheckMode,
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
      : new ElizaExplanationService({
          url: config.elizaModelUrl,
          model: config.elizaModelName,
          ...(config.elizaModelApiKey === undefined ? {} : { apiKey: config.elizaModelApiKey })
        });
```

- [ ] **Step 2: Pass them to `createBot`**

In the `createBot({...})` call args, add:

```ts
    watchlistService,
    explanationService,
```

- [ ] **Step 3: Extend `BotDependencies`**

In `src/bot/bot.ts`, add to the `BotDependencies` type (after `poolService: PoolService;`):

```ts
  watchlistService: WatchlistService;
  explanationService: ExplanationService;
```

And add the imports at the top of `bot.ts`:

```ts
import type { WatchlistService } from "../services/watchlistService.js";
import type { ExplanationService } from "../services/explanationService.js";
```

- [ ] **Step 4: Verify typecheck**

Run: `bun run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app.ts src/bot/bot.ts
git commit -m "feat(app): wire watchlist + explanation services into the bot"
```

---

## Task 10: `/bnancy` command + keyboard + callbacks + formatting

**Files:**
- Modify: `src/bot/keyboards.ts`
- Create: `src/bot/watchlistView.ts` (formatting helpers — keeps the handler thin)
- Modify: `src/bot/bot.ts` (register command + callbacks)
- Test: `tests/watchlistView.test.ts` (create)

- [ ] **Step 1: Write the failing test (formatting)**

Create `tests/watchlistView.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { formatWatchlist, formatWatchlistEntry } from "../src/bot/watchlistView.js";
import type { WatchlistEntry } from "../src/domain/types.js";

function entry(over: Partial<WatchlistEntry> = {}): WatchlistEntry {
  return {
    candidate: { rank: 1, tokenAddress: "0x1111111111111111111111111111111111111111", tokenSymbol: "GOOD", poolAddress: "0x2", dexId: "pancakeswap_v2", momentumScore: 80, conviction: "high", thesis: [], risks: [] },
    riskReport: { tokenAddress: "0x1111111111111111111111111111111111111111", level: "low", blocked: false, reasons: [], checkedAt: new Date() },
    treasurySizeBnb: 1, score: 88, grade: "A", gate: "pass", reasons: [],
    ...over
  };
}

describe("watchlistView", () => {
  it("renders a header and a line per entry with grade + symbol", () => {
    const text = formatWatchlist([entry(), entry({ candidate: { ...entry().candidate, tokenSymbol: "BAR" }, grade: "F", gate: "block" })], 1);
    expect(text).toContain("not financial advice");
    expect(text).toContain("GOOD");
    expect(text).toContain("BAR");
  });

  it("entry detail shows the gate and the token address", () => {
    const text = formatWatchlistEntry(entry(), "FOO explanation");
    expect(text).toContain("FOO explanation");
    expect(text).toContain("0x1111111111111111111111111111111111111111");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/watchlistView.test.ts`
Expected: FAIL ("Cannot find module watchlistView").

- [ ] **Step 3: Implement the formatting helpers**

Create `src/bot/watchlistView.ts`:

```ts
import type { WatchlistEntry } from "../domain/types.js";

const GATE_ICON: Record<WatchlistEntry["gate"], string> = { pass: "🟢", warn: "🟡", block: "🔴" };

export function formatWatchlist(entries: WatchlistEntry[], treasurySizeBnb: number): string {
  const lines = [
    "💛 *BNancy's watch* — elizaOK finds them, I check if your group can get *out*.",
    `_Exit-safety at ${treasurySizeBnb} BNB. Not financial advice._`,
    ""
  ];
  if (entries.length === 0) {
    lines.push("Nothing to show right now — the discovery feed is empty or unavailable.");
    return lines.join("\n");
  }
  entries.forEach((e, i) => {
    lines.push(`${i + 1}. ${GATE_ICON[e.gate]} *${e.candidate.tokenSymbol}* — grade ${e.grade} · momentum ${e.candidate.momentumScore}`);
  });
  lines.push("", "Tap a token for the full read.");
  return lines.join("\n");
}

export function formatWatchlistEntry(entry: WatchlistEntry, explanation: string): string {
  const lines = [
    `${GATE_ICON[entry.gate]} *${entry.candidate.tokenSymbol}* — grade ${entry.grade} (${entry.gate})`,
    explanation,
    "",
    entry.liquidityUsd === undefined ? "Liquidity: unknown" : `Liquidity: $${Math.round(entry.liquidityUsd).toLocaleString()}`,
    entry.roundTripLossBps === undefined ? "Exit cost at your size: unknown" : `Exit cost at your size: ${(entry.roundTripLossBps / 100).toFixed(1)}%`,
    `Token: \`${entry.candidate.tokenAddress}\``
  ];
  if (entry.reasons.length > 0) lines.push("", "Flags: " + entry.reasons.join("; "));
  if (entry.gate !== "pass") lines.push("", "_BNancy would not enter this at your size._");
  return lines.join("\n");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/watchlistView.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Add keyboards**

In `src/bot/keyboards.ts`, add:

```ts
export function bnancyListKeyboard(entries: { candidate: { tokenSymbol: string; tokenAddress: string } }[]): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  entries.slice(0, 10).forEach((e, i) => {
    keyboard.text(`🔎 ${e.candidate.tokenSymbol}`, `bnancy_detail:${e.candidate.tokenAddress}`);
    if (i % 2 === 1) keyboard.row();
  });
  return keyboard;
}

export function bnancyDetailKeyboard(tokenAddress: string, gatePassed: boolean): InlineKeyboard {
  const keyboard = new InlineKeyboard().text("⬅️ Back to list", "bnancy_list");
  if (gatePassed) keyboard.text("Trade this", `bnancy_buy:${tokenAddress}`);
  return keyboard;
}
```

- [ ] **Step 6: Register the `/bnancy` command and callbacks in `bot.ts`**

Add the imports in `bot.ts` (with the other keyboard/format imports):

```ts
import { bnancyListKeyboard, bnancyDetailKeyboard } from "./keyboards.js";
import { formatWatchlist, formatWatchlistEntry } from "./watchlistView.js";
```

Register the command near the other `bot.command(...)` registrations (e.g. after `buy`):

```ts
  bot.command("bnancy", async (ctx) => {
    await handleUserCommand(ctx, "bnancy", async () => {
      const chatId = requireChatId(ctx.chat?.id);
      const fromId = requireTelegramUserId(ctx.from?.id);
      const treasuryBnb = await groupTreasuryBnb(dependencies, chatId, fromId);
      const list = await dependencies.watchlistService.getList(Number(chatId), treasuryBnb);
      await ctx.reply(formatWatchlist(list, treasuryBnb ?? dependencies.config.watchlistDefaultSizeBnb), {
        parse_mode: "Markdown",
        reply_markup: bnancyListKeyboard(list)
      });
    });
  });
```

Register the callbacks near the other `bot.callbackQuery(...)` handlers:

```ts
  bot.callbackQuery("bnancy_list", async (ctx) => {
    await handleCallback(ctx, async () => {
      const chatId = requireChatId(ctx.chat?.id);
      const fromId = requireTelegramUserId(ctx.from?.id);
      const treasuryBnb = await groupTreasuryBnb(dependencies, chatId, fromId);
      const list = await dependencies.watchlistService.getList(Number(chatId), treasuryBnb);
      await ctx.editMessageText(formatWatchlist(list, treasuryBnb ?? dependencies.config.watchlistDefaultSizeBnb), {
        parse_mode: "Markdown",
        reply_markup: bnancyListKeyboard(list)
      });
    });
  });

  bot.callbackQuery(/^bnancy_detail:(.+)$/, async (ctx) => {
    await handleCallback(ctx, async () => {
      const chatId = requireChatId(ctx.chat?.id);
      const fromId = requireTelegramUserId(ctx.from?.id);
      const tokenAddress = ctx.match[1] ?? "";
      const treasuryBnb = await groupTreasuryBnb(dependencies, chatId, fromId);
      const list = await dependencies.watchlistService.getList(Number(chatId), treasuryBnb);
      const entry = list.find((e) => e.candidate.tokenAddress.toLowerCase() === tokenAddress.toLowerCase());
      if (entry === undefined) {
        await ctx.answerCallbackQuery({ text: "That token rolled off the list — refreshing.", show_alert: false });
        return;
      }
      const explanation = await dependencies.explanationService.explain(entry);
      await ctx.editMessageText(formatWatchlistEntry(entry, explanation), {
        parse_mode: "Markdown",
        reply_markup: bnancyDetailKeyboard(entry.candidate.tokenAddress, entry.gate === "pass")
      });
    });
  });

  bot.callbackQuery(/^bnancy_buy:(.+)$/, async (ctx) => {
    await handleCallback(ctx, async () => {
      const tokenAddress = ctx.match[1] ?? "";
      await ctx.answerCallbackQuery();
      await ctx.reply(
        `To trade this, a trader runs:\n\`/buy ${tokenAddress} <bnbAmount>\`\n\nBNancy re-checks risk, builds the Safe transaction, and the owners sign — she never moves funds herself.`,
        { parse_mode: "Markdown" }
      );
    });
  });
```

Add this private helper near the bottom of `bot.ts` (with the other module-level helpers). It uses the membership-gated `getAnalytics`, so it never leaks treasury size to non-members:

```ts
async function groupTreasuryBnb(deps: BotDependencies, chatId: string, fromId: string): Promise<number | undefined> {
  try {
    const analytics = await deps.poolService.getAnalytics(chatId, fromId);
    return Number(analytics.liquidWei) / 1e18;
  } catch {
    return undefined; // no pool yet or caller not a member -> use the default notional size
  }
}
```

> **Confirmed against `bot.ts`:** the callback wrapper is `handleCallback(ctx, async () => {...})` (defined at `bot.ts:428`, used by the `/^help:/` handler at `:377`); regex callbacks expose the capture as `ctx.match[1]` (grammy). `requireChatId` / `requireTelegramUserId` / `handleUserCommand` come from `./commandUtils.js`. Follow the `/^help:/` handler as the reference shape.

- [ ] **Step 7: Run the full gate**

Run: `bun run verify`
Expected: PASS (all tests, including the new ones).

- [ ] **Step 8: Commit**

```bash
git add src/bot/keyboards.ts src/bot/watchlistView.ts src/bot/bot.ts tests/watchlistView.test.ts
git commit -m "feat(bot): /bnancy command, detail view, and trade bridge"
```

---

## Task 11: Inference infra (eliza-1 4B droplet) + docs + final verify

**Files:**
- Create: `docs/ops/eliza-1-inference.md`
- Modify: `.do/app.yaml` (document the new env keys as comments)
- Modify: `README.md` (one line: the `/bnancy` command + the eliza-1 dependency)

> This task is **ops + docs**, not unit-tested code. The feature already works without the droplet (templated fallback). Do it after Task 10 so the bot is functional, then point `ELIZA_MODEL_URL` at the droplet to upgrade the prose.

- [ ] **Step 1: License due-diligence (BLOCKING)**

Open `https://huggingface.co/elizaos/eliza-1`, read the license file. Confirm it permits self-hosted/commercial inference. If it does not, **stop** and set `ELIZA_MODEL_URL` empty (the bot uses the templated fallback) and raise it with the owner. Record the finding in `docs/ops/eliza-1-inference.md`.

- [ ] **Step 2: Write the ops runbook**

Create `docs/ops/eliza-1-inference.md` documenting:
- Provision a DO **CPU droplet** (≥8 vCPU / 16 GB; region near the app, e.g. `sfo`).
- Install Docker; run llama.cpp's server image with the eliza-1 4B GGUF (Q4_K_M), e.g.:
  ```bash
  # On the droplet:
  mkdir -p /opt/eliza && cd /opt/eliza
  # Download the 4B Q4_K_M GGUF from the HF bundle (see model card for exact file path under bundles/4b/).
  docker run -d --restart unless-stopped -p 127.0.0.1:8080:8080 \
    -v /opt/eliza:/models ghcr.io/ggml-org/llama.cpp:server \
    -m /models/eliza-1-4b-Q4_K_M.gguf -c 8192 --host 0.0.0.0 --port 8080 --api-key "$ELIZA_KEY"
  ```
- Put it behind the DO firewall: allow inbound only from the App Platform egress (or require the API key). Expose via a private URL / reverse proxy with TLS.
- Set on the **App Platform app** (not committed): `ELIZA_MODEL_URL=https://<droplet-or-proxy>/v1/chat/completions`, `ELIZA_MODEL_NAME=eliza-1`, `ELIZA_MODEL_API_KEY=<key>`.
- Note the ~$84/mo cost and that latency is acceptable because verdicts are generated lazily per token.

- [ ] **Step 3: Document the env keys in `.do/app.yaml`**

In `.do/app.yaml`, extend the existing "set in the dashboard" comment block to list the new optional keys: `ELIZA_MODEL_URL`, `ELIZA_MODEL_NAME`, `ELIZA_MODEL_API_KEY`, and the watchlist tuning keys (`WATCHLIST_MAX_TOKENS`, `WATCHLIST_DEFAULT_SIZE_BNB`, `MAX_EXIT_SLIPPAGE_BPS`, `MIN_LP_LOCKED_PERCENT`, `MAX_LP_HOLDER_TOP_PERCENT`). No code change — comments only.

- [ ] **Step 4: README line**

Add `/bnancy` to the command list in `README.md` with a one-line description ("exit-safety reality check on elizaOK's trending list — due diligence, not buy calls").

- [ ] **Step 5: Final full verify + commit**

Run: `bun run verify`
Expected: PASS.

```bash
git add docs/ops/eliza-1-inference.md .do/app.yaml README.md
git commit -m "docs(ops): eliza-1 inference droplet runbook + /bnancy docs"
```

- [ ] **Step 6: Open a PR (do NOT auto-deploy to main mid-feature)**

```bash
git push -u origin bnancy-exit-safety-list
gh pr create --base main --title "BNancy exit-safety list (/bnancy)" --body "Implements docs/superpowers/specs/2026-05-29-bnancy-exit-safety-list-design.md"
```

---

## Self-Review

**1. Spec coverage:**
- §2 deterministic line → Task 5 (pure scorer), Task 7 (LLM prose-only behind interface), Task 8 (LLM not in scoring path). ✓
- §3 decisions → exit-safety lens (Task 5/8), elizaOK universe (Task 6/8), eliza-1 4B in v1 (Task 7/11), lazy verdict (Task 10 detail callback), `/bnancy` (Task 10), framing (Task 10 copy), v2 only (Task 3). ✓
- §4 components → config (T1), feed (T6), pancake (T3), risk LP (T4), watchlist (T8), explanation (T7), bot (T10), no new storage (none added). ✓
- §5 scorer gate conditions → Task 5 tests (honeypot, sell tax, unlocked LP, exit slippage, min liquidity, unknown-depth, misfire→F). ✓
- §7 error handling → feed AppError (T6), per-token "unknown" downgrade (T8 `safeRisk`/`roundTrip`), eliza fallback (T7). ✓
- §8 testing incl. misfire→block → Task 5 + Task 8. ✓
- §9 infra + license blocker → Task 11. ✓

**2. Placeholder scan:** No "TBD/TODO". Two explicit *verification* notes (Task 6 normalize resilience option; Task 10 `handleCallback`/`ctx.match` name confirmation) — these are real "confirm against the file" checks, not deferred work, because callback-wrapper naming must match the existing `bot.ts`.

**3. Type consistency:** `ExitSafetySignals`/`ExitSafetyThresholds`/`ExitSafetyResult` (T5) are reused verbatim in T8 and the app wiring (T9). `WatchlistEntry` (T2) fields (`gate`, `grade`, `score`, `roundTripLossBps?`, `liquidityUsd?`, `treasurySizeBnb`) are produced in T8 and consumed in T7/T10. `TokenRiskReport` LP fields (T2/T4) feed the scorer signals (T8). `quoteTokenSell` (T3) is called by T8's `roundTrip`. Names align.

**Known follow-up (not v1):** the `bnancy_buy` bridge currently replies with the prefilled `/buy` command rather than seeding the prompt flow — intentional v1 simplicity (reuses the existing risk-gated, owner-signed trade path); a one-tap prompt-seeded flow is a later nicety.
