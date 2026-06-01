# BNancy — Group Trading Guide

BNancy lets a Telegram group run a **shared BSC trading wallet**: a Safe multisig the group's owners control. The group pools BNB into a share-based ledger, proposes trades and token launches that become Safe transactions the owners sign and execute, and tracks everyone's share and PnL. **BNancy never holds your keys** — it prepares transactions; funds stay in the group Safe.

> Add [@bnancy_bsc_bot](https://t.me/bnancy_bsc_bot) to your group, then send `/start` for the button menu. Generating or linking a wallet happens in a **DM** with BNancy (so your key stays private); everything else happens in the group.

---

## 1. Get an owner wallet (each owner, in a DM)

Every Safe owner needs a BSC wallet linked to their Telegram account. Two ways — both non-custodial:

- **Generate wallet** — BNancy creates a fresh wallet and shows the private key **once** in the DM. It is never stored. Save it in your own wallet app (MetaMask/Rabby/etc.).
- **Link wallet** — connect an existing wallet (WalletConnect or an injected wallet) and sign a one-time message to prove you control it. No address typing.

In a group, tapping **Generate/Link wallet** sends you a one-tap link into the DM where the secure flow runs.

## 2. Create the group Safe (admin)

1. A group admin runs **`/safe_group <threshold>`** (e.g. `/safe_group 2` = 2-of-N signatures required).
2. Owners join from the inline buttons (**Generate + join** or **Join linked wallet**).
3. Once enough owners have joined, an admin taps **Deploy Safe** — the Safe is deployed **from an owner's own wallet** (they pay gas; BNancy holds no key).

Already have a Safe? Link it with `/wallet_set <safeAddress> <threshold> <owner1> [owner2 …]`.

## 3. Initialize the pool (admin)

Run **Init pool** (`/pool_init`). This starts the share ledger for the group. Owners/traders can set roles with **Set role** (`/pool_role`): `owner`, `trader`, or `member`.

## 4. Deposit BNB

1. Send BNB from your **linked wallet** to the group **Safe address**.
2. BNancy's deposit watcher auto-credits it (or use **Deposit** and paste the tx hash). It verifies the transfer on-chain, then mints your pool shares.
   - First deposit mints shares 1:1 with wei; later deposits mint proportionally to the pool's current value.

## 5. Trade & launch (owners/traders)

- **Buy token** (`/buy <token> <bnbAmount> [slippageBps]`) — creates a trade proposal (routed through PancakeSwap V2 / Flap), after an automated token risk check. A small platform fee leg is added.
- **Launch Flap** (`/flap_launch …`) — creates a Flap token-launch proposal. **Flap metadata** (`/flap_metadata`) optionally uploads token metadata to IPFS first.

Each proposal becomes a **Safe transaction** when you tap **Prepare Safe tx**.

## 6. Sign & execute a Safe transaction

1. From a prepared submission, owners tap **Open & sign** — connect a wallet and sign (the signature is verified to recover to a configured owner).
2. When enough owners have signed to meet the threshold, tap **Execute** — the transaction is sent **from an owner's own wallet**; BNancy verifies on-chain that the executed transaction matches the approved one.

## 7. Withdraw

1. **Withdraw** (`/pool_withdraw <basisPoints> <recipient>`) locks your shares and queues a claim at the current share price (a withdrawal fee applies).
2. An owner/trader prepares it as a Safe transaction; owners sign and execute it like any other Safe tx. You can **Cancel withdrawal** while it's still queued to restore your shares.

## 8. See your position

- **Pool analytics** (`/pool`) — opens the Mini App with NAV, members, ownership %, and queued withdrawals for the group.
- **My status** — your role and share in the current group.
- **My portfolio** (`/portfolio`, DM) — your position across **all** your groups.

---

## Roles at a glance

| Role | Can |
|------|-----|
| **owner** | everything: set roles, update NAV, trade/launch, sign + execute Safe txs |
| **trader** | create trade/launch proposals and prepare Safe txs |
| **member** | deposit, view analytics, request/cancel their own withdrawal |

## Safety model

- **Non-custodial:** BNancy never stores Safe-owner private keys. It prepares Safe transactions; owners sign and execute from their own wallets, and the Safe contract enforces the signature threshold on-chain.
- **Verified deposits:** shares are only minted after the BNB transfer is confirmed on-chain from a wallet you've proven you control.
- **No guarantees:** BNancy is infrastructure only — no profit, token, or execution guarantees.
