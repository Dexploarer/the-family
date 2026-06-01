# NANCY

<p align="center">
  <img src="assets/nancy.png" alt="Nancy, the Golden Girl of Binance" width="320" />
</p>

Nancy, the Golden Girl of Binance — a production Telegram bot for BSC group trading wallets and Flap token launches.

**New here?** Group admins and members should start with the **[Nancy Guide](docs/guide.md)** — a step-by-step walkthrough from creating a group Safe to depositing, trading, and withdrawing.

## Capabilities

- Link one Safe-style group wallet per Telegram group.
- Generate non-custodial owner wallets (key shown once by DM, never stored) or link external Safe owner wallets with signed nonces.
- Restrict group wallet setup, Flap metadata, Flap launches, and execution to Telegram group admins.
- Collect linked owner wallets from Telegram group members with inline buttons, then deploy a BSC Safe from an owner's own wallet — the bot holds no key.
- Create group trade proposals for Flap bonding-curve tokens.
- Route migrated Flap tokens and regular BSC tokens through PancakeSwap V2.
- Run token risk checks before buy proposals.
- Add a minimal platform fee leg to bot-built trade proposals.
- Track pool ownership with deterministic shares, NAV snapshots, queued withdrawal claims, and role-gated trading.
- Verify native BNB deposit transaction hashes before minting pool shares.
- Serve a Telegram Mini App at `/pool/<chatId>` for per-user analytics and group breakdowns.
- Optionally upload Flap token metadata to IPFS through Pinata.
- Launch Flap `TOKEN_TAXED_V3` tokens through `VaultPortal` with the official Split Vault.
- Route Flap launch commission to the configured platform wallet through Flap's existing `commissionReceiver`.
- Prepare Safe transactions, collect owner signatures, and submit proposals/confirmations to Safe Transaction Service.

Nancy does not deploy a custom vault contract. Custody remains in the group Safe; the bot stores the accounting ledger and prepares Safe transactions.

## Setup

```bash
bun install
cp .env.example .env
bun run verify
bun run sim:full
bun run dev
```

For production, set `PUBLIC_BASE_URL` and `TELEGRAM_WEBHOOK_SECRET`. The process starts an HTTP server with `/health`, `/telegram/<secret>`, `/sign/<safeSubmissionId>`, `/link/<nonce>` (one-click wallet linking), and `/pool/<chatId>`.

Guided inline-button flows collect each value from a normal chat message, so in a group the bot's Telegram privacy mode must be disabled (BotFather `/setprivacy`). Slash commands work regardless.

See [docs/production-checklist.md](docs/production-checklist.md) for deployment gates.
See [docs/qa-test-matrix.md](docs/qa-test-matrix.md) for automated, live-smoke, and manually gated coverage.

## Telegram commands

```text
/start
/wallet_generate
/link_start <ownerAddress>
/link_submit <ownerAddress> <signature>
/safe_group <threshold>
/safe_group_join <setupId> <ownerAddress>
/safe_create <threshold> <owner1> [owner2 ...]
/wallet_set <safeAddress> <threshold> <owner1> [owner2 ...]
/safe_unlink
/wallet
/pool_init
/pool
/pool_nav <navBnb> <liquidBnb> <positionsBnb>
/pool_role <telegramUserId> <owner|trader|member>
/pool_deposit <bnbAmount> <txHash>
/pool_withdraw <basisPoints> <recipientAddress>
/pool_cancel <withdrawalRequestId>
/buy <tokenAddress> <bnbAmount> [slippageBps]
/proposal <proposalId>
/flap_metadata <name>|<symbol>|<description>|<imageUri>|[website]|[telegram]|[x]
/flap_launch <name>|<symbol>|<metadataCid>|<buyTaxBps>|<sellTaxBps>|<taxDays>|<recipient:bps,recipient:bps>|<initialBuyBnb>
/safe_prepare trade <proposalId>
/safe_prepare flap <launchId>
/safe_prepare withdrawal <withdrawalRequestId>
/safe_status <safeSubmissionId>
/safe_execute <safeSubmissionId>
/nancy
```

`/nancy` — exit-safety reality check on elizaOK's trending list — due diligence, not buy calls.

Example:

```text
/wallet_generate
/safe_group 2
/pool_init
/pool_deposit 1.0 0x...
/pool_nav 1.2 0.7 0.5
/buy 0x4444444444444444444444444444444444444444 0.25 150
/flap_metadata Family Coin|FAM|Group token launched through Flap|ipfs://bafy-image...
/flap_launch Family Coin|FAM|ipfs://bafy...|200|200|30|0x2222222222222222222222222222222222222222:5000,0x3333333333333333333333333333333333333333:5000|0.1
/safe_prepare trade trade_...
/safe_execute safe_...
```

## Pool accounting

`/pool_init` creates the group accounting ledger and makes the caller a pool owner. Owners can use `/pool_role` to assign `owner`, `trader`, or `member`.

Members deposit by sending native BNB directly to the group Safe, then running `/pool_deposit <bnbAmount> <txHash>`. The bot verifies the transaction succeeded, went to the Safe, matches the amount, and came from a wallet linked to that Telegram user before minting shares.

Pool ownership is share-based:

- First deposit mints shares one-to-one with deposited wei.
- Later deposits mint `deposit * totalShares / activeNav`, rounded down.
- Withdrawals lock shares at current active NAV and create a queued claim.
- Active NAV is `NAV - queued/prepared withdrawal gross`.
- Withdrawal payout is `gross - POOL_WITHDRAWAL_FEE_BPS`.

Owners update mark-to-market accounting with `/pool_nav <navBnb> <liquidBnb> <positionsBnb>`. `navBnb` must equal `liquidBnb + positionsBnb`. If a withdrawal is queued while positions are open, it stays reserved until the Safe has enough liquid BNB and an owner prepares `/safe_prepare withdrawal <withdrawalRequestId>`.

`/pool` opens the Telegram Mini App analytics page. In local development, the same page is available at `http://localhost:3000/pool/<chatId>?telegramUserId=<id>`. Telegram Mini Apps require HTTPS for real in-client deployment, so localhost is only a browser/local testing path.

## Flap metadata

Pinata is only needed for `/flap_metadata`, which uploads token metadata JSON and returns an `ipfs://` URI. `/flap_launch` accepts any metadata URI you already have, so Pinata is not required for trading or launching when metadata is hosted elsewhere.

## Safe creation flow

`/wallet_generate` (DM only) creates a non-custodial owner wallet, links its public key to the Telegram user, and shows the private key once. Nancy never stores the private key. Users can also link an external wallet with `/link_start` and `/link_submit`.

`/safe_group <threshold>` starts a group-member collection flow with inline buttons. Each owner taps `Generate wallet + join` to create a non-custodial wallet (private key sent by DM) or `Join linked wallet` for a wallet they already linked. When enough owners have joined, a group admin taps `Deploy Safe` and sends `createProxyWithNonce` from their own wallet (they pay gas; Nancy holds no deploy key).

`/safe_create` is deprecated. Use `/safe_group` for wallet-based deployment, or `/wallet_set <safeAddress> <threshold> <owner1> [owner2 ...]` if you already have a Safe.

If you already have a Safe, use `/wallet_set <safeAddress> <threshold> <owner1> [owner2 ...]`.

## Safe owner signing flow

1. Create a trade or Flap launch proposal.
2. Run `/safe_prepare trade <proposalId>` or `/safe_prepare flap <launchId>`.
3. The bot returns the Safe transaction hash, transaction service URL, and signing page URL.
4. A linked owner opens `/sign/<safeSubmissionId>`, connects the owner wallet, signs, and submits from the page. Telegram Web App init data is verified when present; wallet-browser fallback accepts a manually entered Telegram user ID.
5. The first valid owner signature proposes the transaction to Safe Transaction Service. Later signatures are added as confirmations.
6. Use `/safe_status <safeSubmissionId>` to inspect confirmations and execution state.
7. When threshold is met, tap **Execute** (or run `/safe_execute <safeSubmissionId>`) to open `/execute/<safeSubmissionId>` and send `execTransaction` from an owner wallet.

## Important limitations

- Flap tokens in the bonding-curve phase route through Flap `Portal`.
- Flap tokens already migrated to DEX and regular BSC tokens route through PancakeSwap V2.
- Safe Transaction Service submission requires a real Safe owner signature. The bot validates that the signature recovers to a configured owner before submitting it.
- Nancy is non-custodial and never stores private keys. `/wallet_generate` shows a freshly generated key once by DM; the user imports it into their own wallet to sign.
- Safe deploy and execute are **owner-wallet only**: an admin deploys from `/deploy/<sessionId>`, and any owner executes from `/execute/<safeSubmissionId>`. Nancy never holds a gas key.
- `STORAGE_DRIVER=memory` is for local testing. Use the schema in `db/schema.sql` before production.
