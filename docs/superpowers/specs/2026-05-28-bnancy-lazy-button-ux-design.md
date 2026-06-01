# BNancy lazy/button-first UX

**Date:** 2026-05-28
**Status:** Approved (design)
**Builds on:** [2026-05-28-bnancy-noncustodial-wallet-redesign-design.md](2026-05-28-bnancy-noncustodial-wallet-redesign-design.md)

## Problem

After the non-custodial redesign the bot is button-*reachable* (every command has a menu button and guided prompts), but a lazy user still has to:

1. **Copy-paste a URL** — `link_start` and `safe_prepare` reply with a plain-text link to the connect/sign page.
2. **Copy-paste an ID** — `proposal`, `safe_prepare`, `safe_status`, `safe_execute`, `pool_cancel` make the user type/paste a proposal / submission / withdrawal ID that was just shown in a previous message.
3. **Type a value that could be a tap** — role (`owner|trader|member`), withdrawal basis points, buy amount, withdrawal recipient address.
4. **Sign with no easy mobile path** — pages assume an injected wallet, which a phone's in-Telegram webview does not have.

Target audience is explicitly **lazy users**: maximise tapping, minimise typing and copy-paste.

## Decisions (locked with user)

- **Mobile signing: WalletConnect (Reown).** Requires a free `WALLETCONNECT_PROJECT_ID`. Injected `window.ethereum` stays the primary path on desktop; WalletConnect is the fallback that deep-links to the user's wallet app on mobile.
- **Pages open from buttons, never text URLs.** Prefer Telegram **WebApp** buttons (open in-Telegram, auto-fill identity via verified `initData`); fall back to a **URL button** where WebApp buttons are not allowed (see constraint below).
- **Context action buttons** on result messages carry the relevant ID in `callback_data`; their handlers reuse the exact service calls the slash commands/prompts already use.
- **Prompt engine gains a "choice" field type** (static or context-derived button choices), with a "Custom" escape hatch that falls back to typing.
- **`pool_deposit` takes only the tx hash** — the amount and sender are read from the on-chain transaction.
- **"Link wallet" can capture the address from the connected wallet** (link-by-connect); typing the address stays as a fallback.
- **Slash commands are unchanged** (power-user fallback). Nothing is removed.

## Telegram button constraints & risk (validate in Phase 1)

`web_app` inline-keyboard buttons are supported in **private chats**; in **group chats** they are not reliably allowed. Many flows happen in the group. Chosen handling:

- **DM context:** use `web_app` buttons → in-Telegram page with `initData` identity.
- **Group context:** use either a **`https://t.me/<bot>/<app>?startapp=<token>` deep-link button** (opens the bot's Main Mini App with `initData`) or a plain **URL button** to the page. If a plain URL button is used, the page has no `initData`, so identity comes from the Telegram Login Widget or by routing the action into the user's DM.

Phase 1 picks and verifies one mechanism end-to-end before the rest is built on it. The HTML pages already verify `initData` server-side (`telegramInitData.ts`); signature normalization (`safeSignatures.ts`) is unchanged.

## Design

### Area 1 — Buttons for pages + WalletConnect

- `config.ts`: add optional `WALLETCONNECT_PROJECT_ID` (zod) → `AppConfig.walletConnectProjectId`; thread to the HTML renderers.
- `keyboards.ts`: `linkKeyboard(nonce, publicBaseUrl)` and update `safeSubmissionKeyboard` / `poolAppKeyboard` to emit a WebApp button (+ URL fallback). Replace the text-URL replies in `bot.ts` `link_start` and `prompts.ts` `link_start`/`safe_prepare`.
- `linkPage.ts` + `signingPage.ts`: load WalletConnect v2 (Reown) from a CDN ESM build when `walletConnectProjectId` is set; flow = injected provider first, else WalletConnect modal → `personal_sign`. No bundler / no Next.js (keeps the lightweight decision).

### Area 2 — Action buttons on results (removes ID copy-paste)

New keyboards + callback handlers (each handler reuses the existing service and enforces the same access checks):

| Result message | Buttons (callback) |
| --- | --- |
| Trade proposal | `[Prepare Safe tx]` → `prepare:trade:<id>` |
| Flap launch | `[Prepare Safe tx]` → `prepare:flap:<id>` |
| Withdrawal request | `[Prepare Safe tx]` → `prepare:withdrawal:<id>`, `[Cancel]` → `wd_cancel:<id>` |
| Safe submission | `[Open & sign]` (WebApp/URL), `[Check status]` → `safe_status:<id>`, `[Execute]` → `safe_execute:<id>` |
| Pool analytics | `[Deposit]` → `menu:pool_deposit`, `[Withdraw]` → `menu:pool_withdraw`, `[Open app]` (WebApp/URL) |

`callback_data` stays ≤64 bytes (IDs are short, e.g. `trade_…`, `safe_…`, `wd_…`).

### Area 3 — Choice-button prompts (removes typing)

`PromptField` gains an optional `choices?: PromptChoice[] | (ctx) => Promise<PromptChoice[]>` (`PromptChoice = { label, value }`). When a field has choices, `askField` renders them as `choice:<value>` callback buttons alongside Back/Cancel; `promptController` handles `choice:<value>` by routing the value through the same validate/advance path as typed input. A "Custom" choice (where present) falls back to text entry.

- `pool_role` → `[Owner] [Trader] [Member]`
- `pool_withdraw` → `[25%] [50%] [100%] [Custom]` + recipient picker (buttons from `walletLinkService.getLinkedWallets`)
- `buy` → `[0.05] [0.1] [0.25] [Custom]`

### Area 4 — Fewer fields

- **`pool_deposit` → one field (tx hash).** `depositVerificationService` reads the BNB value + sender from the transaction and returns the amount; it still asserts success, recipient = group Safe, and sender ∈ the user's linked wallets. `poolService.creditDeposit` uses the read amount.
- **Link-by-connect.** New `POST /api/wallet-links` (identity from `initData`, body `{ address }`) creates a pending link and returns its nonce/message; the page signs and POSTs to the existing `/api/wallet-links/<nonce>/signatures`. The "Link wallet" button opens `/link` with no nonce; the page connects the wallet, then runs both steps. Typing the address in the prompt stays as the fallback.

### Area 5 — Slash commands & menu

Slash commands unchanged. Main menu wiring unchanged (no menu redesign in this spec).

## Phasing (each phase leaves `bun run verify` green)

- **P1** — buttons for pages + WalletConnect + the group/DM button mechanism (validated end-to-end).
- **P2** — action buttons on result messages + their callback handlers.
- **P3** — choice-button prompt engine + role / withdraw% / buy-amount / recipient-picker.
- **P4** — `pool_deposit` by tx hash; link-by-connect.

## Testing

- Unit tests: new keyboards (callback-data shape), prompt-engine choice handling (validate/advance/Custom), deposit-by-hash verification against a fake tx, link-by-connect endpoint.
- `staticAcceptance` / `httpServer` tests assert the WalletConnect script is present when `walletConnectProjectId` is set, and the page renders the connect button.
- `localSmoke` extended to drive the new `POST /api/wallet-links` + signature path.
- `bun run verify` green at every phase boundary; live smoke/acceptance still pass.

## Out of scope

- Natural-language command parsing.
- Next.js / React / heavyweight wallet SDKs (stay lightweight per the prior decision).
- Any custodial signing (wallets remain non-custodial; the user always signs).
- Changes to the Safe deployment / PancakeSwap / Flap on-chain integrations.
- Main-menu visual redesign beyond wiring the buttons above.
