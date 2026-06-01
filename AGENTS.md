# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## What this is

BNancy is a Telegram bot for BSC group trading. Telegram groups link a Safe multisig wallet, pool native BNB into a share-based ledger, and create trade/launch proposals that become Safe transactions owners sign and execute. The bot never takes custody: it stores the accounting ledger and *prepares* Safe transactions; funds stay in the group Safe. There is no custom vault contract.

## Runtime & toolchain

- **Bun** (>=1.3.13) is the runtime, test runner, and HTTP server. Not Node.
- TypeScript is strict with `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, and `noPropertyAccessFromIndexSignature`. Module mode is `NodeNext`, so **all relative imports use `.js` extensions even though the files are `.ts`** (e.g. `import { buildApp } from "./app.js"`).
- `exactOptionalPropertyTypes` is why `config.ts` builds optional fields with spreads like `...(x === undefined ? {} : { key: x })` instead of assigning `undefined`.

## Commands

```bash
bun install
bun run dev                 # watch mode (src/index.ts)
bun start                   # run once
bun run typecheck           # tsc --noEmit
bun run build               # tsc -> dist/
bun run migrate             # apply db/schema.sql (postgres)

bun test tests/*.test.ts                  # full test suite
bun test tests/poolAccounting.test.ts     # single test file
bun test -t "queued withdrawal"           # filter by test name

bun run verify              # typecheck + test + acceptance:static  (the standard gate)
bun run verify:full         # verify + build + sim:full + acceptance:live + smoke:live
bun run sim:full            # deterministic, no-spend end-to-end simulation
bun run smoke:live          # live external checks (needs RPC/Telegram creds)
bun run telegram:setup      # push bot name/description/commands to BotFather
```

Run `bun run verify` after any change. `bun run sim:full` is the fastest way to exercise the whole pool + Safe lifecycle without touching the network.

## Architecture

The flow is `index.ts` → `loadConfig()` → `buildApp()` → `startHttpRuntime()`.

- **`src/config.ts`** — the *only* place env vars are read. A Zod schema validates everything at startup and produces a typed `AppConfig`. Add new config here, never read `process.env` elsewhere.
- **`src/app.ts`** — the composition root. It instantiates every service and wires dependencies by constructor injection, then builds the bot. This is the map of how the system fits together; read it first when orienting.
- **`src/bot/`** — grammy command handlers. Handlers are thin: parse args, enforce access (`requireGroupAdmin`, `poolService.requireTraderAccess`), call a service, format the reply. Business logic does **not** live here.
- **`src/services/`** — all business logic. Services depend on a `Repository`/`PoolRepository` and on `src/chain/` services.
- **`src/chain/`** — viem-based wrappers for external contracts (Flap Portal/VaultPortal, PancakeSwap V2, Safe + Safe Transaction Service). `addresses.ts` returns per-chain contract addresses keyed by chain id (56 mainnet / 97 testnet); testnet leaves PancakeSwap/WBNB zeroed.
- **`src/http/`** — `server.ts` runs `Bun.serve` and routes `/health`, the Telegram webhook, `/sign/<id>` (Safe signing page), `/pool/<chatId>` (Mini App), and the `/api/...` JSON endpoints. The HTML pages are rendered as strings by `signingPage.ts` / `poolPage.ts`.
- **`src/domain/`** — shared `types.ts` and the two error classes.

### Storage: two repositories, two drivers

There are **two** repository interfaces — `Repository` (wallets, sessions, proposals, submissions) and `PoolRepository` (members, ledger, NAV snapshots, withdrawals). Each has a memory and a postgres implementation, selected by `STORAGE_DRIVER` (`memory` for local/tests, `postgres` for production; schema in `db/schema.sql`). When you add a persisted entity, update the interface and **both** implementations.

Monetary values are `bigint` wei throughout the domain. Postgres cannot store bigints, so `postgresSerialization.ts` converts them to/from strings on the way in and out. Any new bigint field on a stored type needs serialize/deserialize handling there.

### Error handling convention

Throw `UserInputError` (bad user input, shown verbatim to the user) or `AppError` (operational error with structured context) from services. The bot's `handleUserCommand`/`handleCallback` and the HTTP `route()` wrapper catch these and return the message; any *other* thrown error is logged and replaced with a generic "Command failed" / 500. Don't catch-and-swallow in services — let these propagate.

### Telegram delivery mode

`startHttpRuntime` picks the mode automatically: if both `PUBLIC_BASE_URL` and `TELEGRAM_WEBHOOK_SECRET` are set it registers a webhook at `/telegram/<secret>`; otherwise it deletes any webhook and falls back to long-polling (`bot.start()`). Local dev runs in polling mode with no public URL.

### QA scripts

Files in `src/qa/` are standalone Bun entry points, not test files — they run top-level code and `throw` on failure (see `staticAcceptance.ts`). `fullSimulation.ts` runs the real service code against fakes in `fullSimulationFakes.ts` for deployment, Safe Transaction Service, and BSC receipts, so it's deterministic and spends nothing. `liveAcceptance`/`liveSmoke` hit real external services and need credentials.

## Key flows (where to look)

- **Safe creation** — `safeGroupSetupService` (inline-button group collection) and `safeDeploymentService` (proxy deploy via SafeProxyFactory).
- **Pool accounting** — `poolAccounting.ts` holds the share math (first deposit 1:1 with wei, later deposits `deposit * totalShares / activeNav`, withdrawals lock shares at active NAV into a queued claim). `poolService` orchestrates; `poolAnalyticsBuilder` derives the Mini App view.
- **Trade/launch → Safe** — `tradeService`/`flapLaunchService` build proposals; `safeSubmissionService` turns a proposal into a Safe transaction, collects owner signatures (validated to recover to a configured owner), proposes/confirms to Safe Transaction Service, and executes. It also injects the platform fee leg.
- **Deposits** — `depositVerificationService` verifies a real BNB transfer (success, correct Safe recipient, amount, sender linked to the Telegram user) before `poolService` mints shares.

See `README.md` for the full command list and `docs/` for the production checklist and QA matrix.
