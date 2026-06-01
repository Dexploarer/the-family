# BNancy non-custodial wallet & UX redesign

**Date:** 2026-05-28
**Status:** Approved (design)

## Problem

BNancy currently supports **custodial "managed" wallets**: the bot generates a keypair, encrypts the private key with `WALLET_ENCRYPTION_KEY`, stores it, and signs Safe transactions on the user's behalf ("Approve with managed wallet"). This holds custody of user keys.

Three problems to fix:

1. **Custody must go.** Every wallet should be non-custodial — BNancy must never persist a private key.
2. **Signing/linking is clumsy.** Linking and Safe approvals require the user to copy a message, sign it in another app, and paste a signature back (`/link_start` → `/link_submit`). It should be one click, like the Dialect EVM blink starter.
3. **The bot is hard to drive.** Only 5 inline buttons exist; most actions are slash-commands with terse failures. There is no way to cancel Safe creation, unlink a Safe, or cancel a queued withdrawal.

## Decisions (locked with user)

- **Signing UX:** Build a lightweight in-browser wallet-connect page (viem + injected provider / optional WalletConnect; **no** Next.js) that handles **both** proving wallet ownership when linking **and** approving Safe transactions in one click. Keep text commands as a fallback.
- **Link proof:** Linking an existing wallet **requires a one-click signature proof** of control. No blind address claims (linked wallets gate who can deposit and where withdrawals go).
- **Gas key:** **Keep** the optional gas-only executor key. It is never a Safe owner and never holds user funds; it only pays gas to deploy Safes and submit `/safe_execute`.
- **Scope (all in):** cancel an in-progress Safe creation; unlink/replace the group's Safe (off-chain); cancel a queued withdrawal; make every menu action button-driven with guided prompts and Back/Cancel.

## Key architectural choice: guided input for buttons — **in-house prompt state**

A button tap cannot carry arguments, so arg-taking commands launch a guided prompt. We store a **pending prompt** per `(chatId, telegramUserId)` in the existing repository: `{ command, step, collected }`.

- A button sets the pending prompt and asks for the first value.
- A generic message handler routes the user's next message into the active prompt, validating each field with the existing parsers (reusing `InvalidInputError` + `COMMAND_USAGE`).
- **Cancel** clears the prompt; **Back** decrements the step; a final step shows a confirm button.

Chosen over `@grammyjs/conversations` because it fits the codebase's explicit service+repository+deterministic-test style, persists in both memory and postgres for free, adds no dependency, and is fully unit-testable.

## Design by phase

Each phase is shippable and must leave `bun run verify` green.

### Phase 1 — Non-custodial wallet model (foundation)

- Delete `ManagedWalletService`, `WalletEncryptionService`, the `ManagedWallet` type, the `WALLET_ENCRYPTION_KEY` config, and the `getManagedWallet`/`saveManagedWallet` methods from the `Repository` interface and both the memory and postgres implementations (and the postgres schema/migration).
- `/wallet_generate` (DM-only): create a keypair, DM the **private key + address once**, and store **only the public key** as a `linked` `WalletLink` for that Telegram ID. BNancy never persists the key. In a group chat it replies "DM me to generate a wallet."
- Collapse to a single concept — a user's **linked wallet(s)** (`WalletLink`). A generated wallet is linked-by-construction; a brought-your-own wallet is linked via the Phase 2 signature proof.
- `/safe_group` join: members join with a linked wallet. The "Generate + join" (managed) button becomes "Use my wallet" → if the user has no linked wallet, route them to generate (DM) or link.
- Remove the "Approve with managed wallet" button and the `safe_approve` / `managed_join` managed code paths from `safeCallbacks.ts` and `safeGroupSetupService.ts`.
- Keep the gas-only executor key for deploy + `/safe_execute`.

**Touches:** `config.ts`, `app.ts`, `services/managedWalletService.ts` (delete), `services/walletEncryptionService.ts` (delete), `services/safeGroupSetupService.ts`, `storage/repository.ts` + memory/postgres repos, `db/schema.sql`, `bot/bot.ts`, `bot/safeCallbacks.ts`, `bot/keyboards.ts`, `bot/formatters.ts`, `bot/telegramCommands.ts`, related tests, `qa/fullSimulation*`.

### Phase 2 — One-click link + approve pages

- New `/link/<linkId>` page mirroring the existing `/sign/<id>` page: shows the link message, connects a wallet, `personal_sign`s the message, and POSTs to a new `POST /api/wallet-links/<id>/signatures` endpoint → `WalletLinkService.completeLink`. This replaces the copy-paste `/link_start` → `/link_submit` (text path kept as fallback).
- `/link_start <address>` now returns a one-click link to `/link/<id>` instead of a message to copy.
- **Auto-identity:** both pages read the Telegram Web App `initData` (already verified server-side via `telegramInitData.ts`) so the user ID is not typed when opened from a button.
- **Wallet connection:** injected provider (`window.ethereum`) is the primary path. **Optional WalletConnect v2** is enabled when a new `WALLETCONNECT_PROJECT_ID` env is set, for mobile browsers without an injected wallet. If unset, injected-only.
- **Caveat (documented):** opened as a pure Telegram Mini App there is no injected wallet, so WalletConnect — or opening in a wallet's in-app browser — is what makes mobile truly one-click. Recommend configuring `WALLETCONNECT_PROJECT_ID` in production.
- The Safe approve page already does injected `personal_sign` of the `safeTxHash` and posts to `/api/safe-submissions/<id>/signatures`; refine it for shared wallet-connect code and auto-identity. Signature normalization (`safeSignatures.ts`) is unchanged.

**Touches:** `http/signingPage.ts`, new `http/linkPage.ts`, `http/server.ts` (new route + endpoint), `storage/repository.ts` (lookup a wallet link by id), `services/walletLinkService.ts`, `bot/bot.ts` (`/link_start` reply), tests.

### Phase 3 — Button-driven menu + guided prompts

- Expand the inline menu so every command is reachable by button, grouped: **Wallet**, **Safe**, **Pool**, **Trade**, **Flap**.
- Arg-taking commands launch a guided prompt (in-house prompt state): one field at a time, inline **Back** and **Cancel** on each step, and a final confirm step that runs the same service call the slash command uses.
- Raw slash commands keep working unchanged for power users.

**Touches:** new `bot/prompts/` (prompt definitions + runner), `storage/repository.ts` + repos (pending-prompt persistence), `bot/keyboards.ts`, `bot/bot.ts`, `bot/poolCommands.ts`, `bot/safeCallbacks.ts`, tests.

### Phase 4 — Cancel / unlink / delete

- **Cancel Safe creation:** add a `cancelled` status to `SafeCreationSession`; a Cancel button/command (creator or group admin) ends the session and guards join/deploy against cancelled sessions.
- **Unlink / replace group Safe:** admin-only, behind a confirm button. **Blocked by default** if the pool still has member shares `> 0` or any `queued`/`prepared` withdrawals (re-linking a different Safe would orphan the ledger); overridable only with an explicit "force" confirm.
- **Cancel queued withdrawal:** the requesting member, or a pool owner, can cancel a `queued` request (not once `prepared`/`executed`). Restores the locked shares to the member and clears the reserved amount; recompute active NAV.

**Touches:** `domain/types.ts` (`SafeCreationSession` status), `services/safeGroupSetupService.ts`, `services/groupWalletService.ts` (unlink), `services/poolService.ts` (cancel withdrawal + guards), `bot/*`, repos, tests.

## Testing

- Each phase adds unit tests in the existing `bun:test` style.
- `qa/fullSimulation.ts` is updated to drive the **non-custodial** join + sign path (no managed signing) and remains deterministic / no-spend.
- `bun run verify` (typecheck + tests + static acceptance) stays green at every phase boundary; `staticAcceptance.ts` is updated for the new signing/link page assertions.

## Out of scope

- Adopting Next.js / React / ConnectKit (kept lightweight per decision).
- On-chain Safe deletion (impossible; "delete" = off-chain unlink only).
- Changing the Safe deployment, PancakeSwap, or Flap on-chain integrations.
- Migrating existing stored managed wallets (none in production; memory driver for dev). The schema change simply drops the managed-wallet table.
