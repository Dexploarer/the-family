# Phase 1 — Non-custodial wallet model — Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Remove all custodial ("managed") wallet code so BNancy never stores a private key; `/wallet_generate` creates a keypair, DMs the key once, and stores only the public key as a linked wallet.

**Architecture:** Collapse `ManagedWallet` into the existing `WalletLink` concept. A new `WalletLinkService.generateLinkedWallet()` generates a keypair, persists a `linked` `WalletLink`, and returns the private key for one-time DM delivery (never persisted). Delete `ManagedWalletService` and `WalletEncryptionService`. The gas-only executor key is untouched.

**Tech Stack:** Bun, TypeScript (NodeNext, strict), viem, grammy, zod, pg.

**Verification gate:** `bun run verify` (typecheck + tests + static acceptance) must pass at the end of every task that changes code. `bun run sim:full` must pass after Task 8.

---

### Task 1: Add `generateLinkedWallet` to WalletLinkService (TDD)

**Files:**
- Modify: `src/services/walletLinkService.ts`
- Test: `tests/walletLinkService.test.ts`

- [ ] **Step 1: Write the failing test** — append to `tests/walletLinkService.test.ts`:

```ts
it("generates a non-custodial linked wallet and returns the key once without storing it", async () => {
  const repository = new MemoryRepository();
  const service = new WalletLinkService(repository);
  const result = await service.generateLinkedWallet("123");
  // private key is returned but never persisted
  expect(result.privateKey).toMatch(/^0x[0-9a-fA-F]{64}$/);
  expect(privateKeyToAccount(result.privateKey).address).toBe(result.link.address);
  const stored = await repository.getWalletLink("123", result.link.address);
  expect(stored?.status).toBe("linked");
  // repository must expose no way to read a private key
  expect((stored as Record<string, unknown>)["encryptedPrivateKey"]).toBeUndefined();
});
```

Ensure the test file imports `privateKeyToAccount` from `viem/accounts` and `MemoryRepository`.

- [ ] **Step 2: Run it, expect FAIL** — `bun test tests/walletLinkService.test.ts` → fails (`generateLinkedWallet` undefined).

- [ ] **Step 3: Implement** — in `src/services/walletLinkService.ts` add imports and method:

```ts
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
// ...
async generateLinkedWallet(telegramUserId: string): Promise<{ link: WalletLink; privateKey: Hex }> {
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);
  const now = new Date();
  const link: WalletLink = {
    telegramUserId,
    address: account.address,
    nonce: randomBytes(16).toString("hex"),
    status: "linked",
    createdAt: now,
    linkedAt: now
  };
  await this.repository.saveWalletLink(link);
  return { link, privateKey };
}
```

- [ ] **Step 4: Run it, expect PASS** — `bun test tests/walletLinkService.test.ts`.

---

### Task 2: Delete ManagedWalletService and WalletEncryptionService

**Files:**
- Delete: `src/services/managedWalletService.ts`
- Delete: `src/services/walletEncryptionService.ts`
- Delete: `tests/managedWalletService.test.ts`

- [ ] **Step 1:** `git rm src/services/managedWalletService.ts src/services/walletEncryptionService.ts tests/managedWalletService.test.ts` (typecheck will now fail at consumers; fixed in Tasks 3-8).

---

### Task 3: Remove ManagedWallet from domain + repository (interface + both drivers + schema)

**Files:**
- Modify: `src/domain/types.ts` (remove `EncryptedPrivateKey`, `ManagedWallet`)
- Modify: `src/storage/repository.ts` (remove `getManagedWallet`, `saveManagedWallet`)
- Modify: `src/storage/memoryRepository.ts` (remove the managed map + methods)
- Modify: `src/storage/postgresRepository.ts` (remove managed methods)
- Modify: `src/storage/postgresRows.ts` (remove managed row mapping)
- Modify: `db/schema.sql` (remove `managed_wallets` table)

- [ ] **Step 1:** Delete the `ManagedWallet` and `EncryptedPrivateKey` types from `domain/types.ts`.
- [ ] **Step 2:** Delete the two managed methods from the `Repository` interface.
- [ ] **Step 3:** Delete the managed storage + methods from `MemoryRepository`.
- [ ] **Step 4:** Delete the managed methods + any managed row type from `PostgresRepository` and `postgresRows.ts`.
- [ ] **Step 5:** Remove the `create table ... managed_wallets (...)` block from `db/schema.sql`.
- [ ] **Step 6:** `bun run typecheck` — expect remaining errors only in `app.ts`, `safeGroupSetupService.ts`, `bot/*`, `poolCommands.ts`, `qa/*` (fixed next).

---

### Task 4: Rework SafeGroupSetupService to use generateLinkedWallet (TDD)

**Files:**
- Modify: `src/services/safeGroupSetupService.ts`
- Test: `tests/safeGroupSetupService.test.ts`

- [ ] **Step 1:** Drop the `ManagedWalletService` constructor dependency and its import. Replace it with `WalletLinkService`.
- [ ] **Step 2:** Replace `generateManagedWalletAndJoin` with:

```ts
async generateWalletAndJoin(sessionId: string, telegramUserId: string): Promise<{
  generated: { link: WalletLink; privateKey: Hex };
  session: SafeCreationSession;
}> {
  await this.getCollectingSession(sessionId);
  const generated = await this.walletLinkService.generateLinkedWallet(telegramUserId);
  const session = await this.joinWithWallet(sessionId, telegramUserId, generated.link.address);
  return { generated, session };
}
```

- [ ] **Step 3:** Update `joinWithDefaultWallet`'s error text from `/link_start and /link_submit` to `Generate one with /wallet_generate (in a DM) or link one with /link_start`.
- [ ] **Step 4:** Update `tests/safeGroupSetupService.test.ts` to construct the service with `WalletLinkService` and assert `generateWalletAndJoin` links + joins and returns a private key. Remove any managed-wallet assertions.
- [ ] **Step 5:** `bun test tests/safeGroupSetupService.test.ts` → PASS.

---

### Task 5: Update formatters

**Files:**
- Modify: `src/bot/formatters.ts`

- [ ] **Step 1:** Remove `formatManagedWallet` and the `ManagedWallet` import. Replace `formatGeneratedManagedWallet` with:

```ts
export function formatGeneratedWallet(generated: { link: WalletLink; privateKey: Hex }): string {
  return [
    "New non-custodial wallet",
    `Address: ${generated.link.address}`,
    "BNancy does NOT store this key. Save it now — it will not be shown again.",
    "Import it into your own wallet (MetaMask/Rabby/etc.) to sign.",
    generated.privateKey
  ].join("\n");
}
```

Add `WalletLink` and `Hex` imports; remove the `GeneratedManagedWallet` import.

- [ ] **Step 2:** In `formatSafeSubmission`, change the owner-flow lines (remove "Approve with managed wallet"):

```ts
"Owner flow:",
`1. Open ${signingUrl}, connect your linked owner wallet, and sign.`,
`2. The first valid owner signature proposes the transaction; later signatures confirm it.`
```

---

### Task 6: Rewire app.ts and bot dependencies

**Files:**
- Modify: `src/app.ts`
- Modify: `src/bot/bot.ts` (`BotDependencies`, `/wallet_generate`, remove `/wallet_managed`)
- Modify: `src/bot/poolCommands.ts` (`PoolCommandDependencies`, `getAllowedDepositSenders`)
- Modify: `src/bot/safeCallbacks.ts` (remove `safe_approve` + managed `managed_join`)
- Modify: `src/bot/keyboards.ts` (button label)
- Modify: `src/bot/telegramCommands.ts` (command list)

- [ ] **Step 1 (app.ts):** Remove imports + construction of `WalletEncryptionService` and `ManagedWalletService`. Construct `safeGroupSetupService` with `(repository, safeDeploymentService, walletLinkService)`. Remove `managedWalletService` from the `App` type, the `createBot` deps, and the returned object.

- [ ] **Step 2 (bot.ts deps):** Remove `managedWalletService` from `BotDependencies` and its import.

- [ ] **Step 3 (bot.ts `/wallet_generate`):** Replace the handler body with:

```ts
const fromId = requireTelegramUserId(ctx.from?.id);
if (ctx.chat?.type !== "private") {
  await ctx.reply("DM me to generate a wallet so your private key stays private. Open a chat with me and run /wallet_generate there.");
  return;
}
const generated = await dependencies.walletLinkService.generateLinkedWallet(fromId);
await ctx.reply(formatGeneratedWallet(generated));
```

Update the formatter import to `formatGeneratedWallet`; remove `formatGeneratedManagedWallet`/`formatManagedWallet` imports.

- [ ] **Step 4 (bot.ts):** Delete the entire `/wallet_managed` command handler.

- [ ] **Step 5 (poolCommands.ts):** Remove `ManagedWalletService` from `PoolCommandDependencies` + import. Simplify `getAllowedDepositSenders` to:

```ts
async function getAllowedDepositSenders(dependencies: PoolCommandDependencies, telegramUserId: string): Promise<Address[]> {
  const linkedWallets = await dependencies.walletLinkService.getLinkedWallets(telegramUserId);
  return linkedWallets.map((wallet) => wallet.address);
}
```

(Generated wallets are now linked wallets, so they are already included.)

- [ ] **Step 6 (safeCallbacks.ts):** Delete the `safe_approve` callback entirely. Rename the `managed_join` callback to a "generate + join" flow that calls `dependencies.safeGroupSetupService.generateWalletAndJoin` and DMs `formatGeneratedWallet(result.generated)`. Remove `managedWalletService` usage and the `formatGeneratedManagedWallet` import (use `formatGeneratedWallet`). Keep `safe_join` (join with existing linked wallet), `safe_refresh`, `safe_deploy`.

- [ ] **Step 7 (keyboards.ts):** In `safeGroupKeyboard`, relabel `Generate + join` → `Generate wallet + join` (callback `managed_join:` stays as the route key) and keep `Join linked wallet` (`safe_join:`). Remove `safeSubmissionKeyboard`'s "Approve with managed wallet" button — replace the keyboard with a single URL/webApp button to the signing page (built from `submission.id` + `publicBaseUrl`), or drop the keyboard and rely on the `formatSafeSubmission` link. Choose the URL-button form.

- [ ] **Step 8 (telegramCommands.ts):** Remove the `wallet_managed` entry from `BOT_COMMANDS`. Change `wallet_generate` description to `Generate a non-custodial wallet (DM only)`.

- [ ] **Step 9:** `bun run typecheck` → expect only `qa/*` errors remaining.

---

### Task 7: Update config — remove WALLET_ENCRYPTION_KEY

**Files:**
- Modify: `src/config.ts`
- Modify: `.env.example`
- Modify: `docs/production-checklist.md`

- [ ] **Step 1:** Remove `WALLET_ENCRYPTION_KEY` from the zod schema, the `AppConfig` type, and `loadConfig`.
- [ ] **Step 2:** Remove `WALLET_ENCRYPTION_KEY=` from `.env.example`.
- [ ] **Step 3:** Remove the `WALLET_ENCRYPTION_KEY` line and its explanation from `docs/production-checklist.md`; update step 9 wording to "Generate non-custodial wallets with /wallet_generate (DM) or link external owners with /link_start and /link_submit."

---

### Task 8: Update the QA simulation to the non-custodial path

**Files:**
- Modify: `src/qa/fullSimulationFakes.ts`
- Modify: `src/qa/fullSimulation.ts`
- Modify: `src/qa/liveAcceptance.ts`

- [ ] **Step 1 (fullSimulationFakes.ts):** Remove managed-wallet construction. Replace `submitManagedSignature` with a `submitOwnerSignature` helper that signs the Safe tx hash with a known simulation private key (the linked owner's key) via `privateKeyToAccount(pk).signMessage({ message: { raw: safeTxHash } })`, then calls `safeSubmissionService.submitOwnerSignature(...)`. Keep `createSimulationWallet` (known keypair).
- [ ] **Step 2 (fullSimulation.ts):** Build the group via linked wallets: for each simulated owner, `walletLinkService` links their known address (use `beginLink` + sign with the known key + `completeLink`, or directly `generateLinkedWallet` is not usable since we need known keys — use the begin/complete link path with the simulation key). Then `safeGroupSetupService.joinWithWallet` and `deploy`. Replace managed signing in the trade + withdrawal approval steps with the new `submitOwnerSignature` helper. Construct `SafeGroupSetupService` with `WalletLinkService` (no managed service).
- [ ] **Step 3 (liveAcceptance.ts):** Remove any managed-wallet / encryption references; if it only referenced `WALLET_ENCRYPTION_KEY`, drop that check.
- [ ] **Step 4:** `bun run verify` → PASS. Then `bun run sim:full` → PASS (deterministic, no-spend).

---

### Task 9: Final verification

- [ ] **Step 1:** `grep -rin "managed\|encryption\|WALLET_ENCRYPTION" src/ tests/` → expect no remaining references (except incidental words).
- [ ] **Step 2:** `bun run verify` → PASS.
- [ ] **Step 3:** `bun run sim:full` → PASS.
- [ ] **Step 4:** Report Phase 1 complete; offer to commit.

## Self-review notes

- **Spec coverage:** removes ManagedWallet/encryption/WALLET_ENCRYPTION_KEY (Tasks 2,3,7); `/wallet_generate` non-custodial DM (Task 6.3); generated = linked wallet (Task 1); group join uses linked wallet, managed "approve"/"generate+join" reworked (Tasks 4,6); gas executor key untouched (not referenced). ✓
- **Type consistency:** `generateLinkedWallet` returns `{ link: WalletLink; privateKey: Hex }` used identically in Tasks 1, 4, 5, 6. `formatGeneratedWallet` takes that shape in Task 5 and is called in Task 6.3 and 6.6. ✓
- **Deferred to later phases:** the one-click `/link/<id>` page (Phase 2) — Phase 1 keeps the existing text link flow working. Button-driven menu (Phase 3). Cancel/unlink (Phase 4).
