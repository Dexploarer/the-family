# Production Checklist

## Required external services

- Telegram bot token from BotFather.
- BSC RPC URL with reliable `eth_call`, transaction submission, and log support.
- Safe Transaction Service access for BNB Chain.
- Postgres database.
- Public HTTPS base URL for Telegram webhooks and signing pages.
- Public HTTPS base URL for Telegram Mini Apps.
- Optional Pinata JWT when using `/flap_metadata` instead of supplying an existing metadata URI.

## Required environment

```text
APP_ENV=production
STORAGE_DRIVER=postgres
TELEGRAM_BOT_TOKEN=...
BSC_CHAIN_ID=56
BSC_RPC_URL=...
PLATFORM_FEE_RECIPIENT=...
PLATFORM_COMMISSION_RECEIVER=...
POOL_WITHDRAWAL_FEE_BPS=25
DATABASE_URL=...
PUBLIC_BASE_URL=https://...
TELEGRAM_WEBHOOK_SECRET=<random-32-byte-string>
RISK_CHECK_MODE=warn
SAFE_TRANSACTION_SERVICE_URL=https://api.safe.global/tx-service/bnb
WALLETCONNECT_PROJECT_ID=<WalletConnect cloud project id>
```

Nancy is non-custodial: it never stores private keys. Safe deploy and execute are sent from owner wallets via `/deploy/<sessionId>` and `/execute/<safeSubmissionId>`. `/wallet_generate` (DM only) creates a keypair, shows the private key once, and stores only the public key.

## Launch steps

1. Run `bun install`.
2. Run `bun run migrate`.
3. Run `bun run verify`.
4. Run `bun run build`.
5. Run `bun run acceptance:live` with production credentials. Add `PINATA_JWT` only if testing `/flap_metadata`.
6. Start with `bun start`.
7. Confirm `GET /health` returns `{ "ok": true }`.
8. Add the bot to a Telegram group. IMPORTANT: disable privacy mode in BotFather (`/setprivacy` → Disable) so the bot receives plain-text replies — the guided inline-button prompts collect each value from a normal message, which a privacy-enabled bot will not see. Slash commands work either way.
9. Generate non-custodial wallets with `/wallet_generate` (DM only) or link external owners with `/link_start` and `/link_submit`.
10. Use `/safe_group <threshold>`, have owners tap `Generate + join` or `Join linked wallet`, then deploy from the inline button.
11. Run `/pool_init`, assign one trader with `/pool_role`, verify a real BNB deposit with `/pool_deposit`, and open `/pool` from Telegram.
12. Create a small test proposal, prepare it, sign from `/sign/<safeSubmissionId>` with a linked owner wallet, and verify it appears in Safe Wallet before funding the Safe materially.

## Mainnet release gates

- Test one BSC Safe proposal with no value.
- Test one PancakeSwap buy with the smallest practical value.
- Test one Flap bonding-curve buy with the smallest practical value.
- Test one Flap metadata upload if using Pinata-hosted metadata.
- Test one Flap launch on testnet or with explicitly approved mainnet spend.
- Review GoPlus/DexScreener risk output for at least five known tokens.
- Confirm Telegram group admin checks block a non-admin.
- Confirm a non-linked Telegram user cannot submit a Safe owner signature.
- Confirm generated wallet private keys are delivered only by DM and never stored, and that a linked owner's signature recovers to the Safe owner address.
- Confirm `/safe_group` only accepts linked wallets and the deploy receipt contains the expected `ProxyCreation` event.
- Confirm `/pool_deposit` rejects a reused transaction hash, a sender that is not linked to the Telegram user, and a transfer that did not go to the Safe.
- Confirm `/pool_withdraw` locks shares, reserves the gross claim, applies the configured withdrawal fee, and `/safe_prepare withdrawal <id>` produces the Safe payout batch.
- Confirm `/pool` opens as a Telegram Mini App over HTTPS and rejects analytics API calls without valid Telegram Web App init data in production.
