# Deploy Nancy on ElizaCloud Containers

Nancy is a **standalone Bun Telegram bot**, not an elizaOS agent runtime. On ElizaCloud it uses the **Containers** product (arbitrary Docker workloads on the Hetzner pool), not agent sandboxes.

## Image

| Field | Value |
|-------|-------|
| Registry | `ghcr.io` |
| Image | `ghcr.io/dexploarer/nancy:latest` |
| Digest pin | Prefer `:sha-<commit>` or `@sha256:…` for production |
| Platform | **linux/amd64** (built by `.github/workflows/publish.yml`) |
| Published on | Push to `main` (when Docker/source paths change) or manual **workflow_dispatch** |

After the first CI push, open **GitHub → Packages → nancy → Package settings → Change visibility → Public** so ElizaCloud can pull without private-registry credentials. If the package stays private, configure registry username/token on the container in ElizaCloud.

## Container settings (ElizaCloud dashboard / API)

| Setting | Value | Notes |
|---------|-------|-------|
| **Port** | `8080` | Default ElizaCloud port is 3000 — **must override** |
| **Health check path** | `/health` | Expects `200` + `{"ok":true}` |
| **Desired count** | `1` | **Never scale horizontally** — pool accounting uses an in-process mutex; multiple replicas will corrupt ledger state without DB-level locking |
| **CPU / memory** | ≥ 1 vCPU / 1792 MB recommended | Voice→video ffmpeg renders are CPU-heavy; baseline bot is light |

## Environment variables

### Required

```text
APP_ENV=production
STORAGE_DRIVER=postgres
TELEGRAM_BOT_TOKEN=<from BotFather>
BSC_CHAIN_ID=56
BSC_RPC_URL=https://...
PLATFORM_FEE_RECIPIENT=0x...
PLATFORM_COMMISSION_RECEIVER=0x...
TRADE_FEE_BPS=10
POOL_WITHDRAWAL_FEE_BPS=25
DATABASE_URL=postgres://...
HTTP_PORT=8080
PUBLIC_BASE_URL=https://<your-elizacloud-hostname>
TELEGRAM_WEBHOOK_SECRET=<random-32+-char-string>
RISK_CHECK_MODE=warn
MIN_LIQUIDITY_USD=1000
MAX_BUY_TAX_BPS=1500
MAX_SELL_TAX_BPS=1500
DEPOSIT_WATCH=on
```

Mark as **secret** in ElizaCloud: `TELEGRAM_BOT_TOKEN`, `DATABASE_URL`, `TELEGRAM_WEBHOOK_SECRET`, `SAFE_API_KEY`, `SAFE_EXECUTOR_PRIVATE_KEY`, `PINATA_JWT`, `ELIZA_MODEL_API_KEY`, `KOKORO_TTS_API_KEY`.

### Strongly recommended

```text
SAFE_TRANSACTION_SERVICE_URL=https://api.safe.global/tx-service/bnb
SAFE_EXECUTOR_PRIVATE_KEY=0x...   # gas-only deployer/executor, NOT a Safe owner
WALLETCONNECT_PROJECT_ID=<WalletConnect cloud project id>
PLATFORM_ADMIN_IDS=<comma-separated Telegram user ids>
```

### Optional

```text
RUN_MIGRATE_ON_START=true          # default; applies db/schema.sql on boot (idempotent)
ELIZA_MODEL_URL=https://...        # self-hosted eliza-1 inference; templated fallback when unset
ELIZA_MODEL_NAME=eliza-1
KOKORO_TTS_URL=https://...         # voice notes; skipped when unset
PINATA_JWT=...                     # only if using /flap_metadata
LOG_LEVEL=info
```

### `PUBLIC_BASE_URL`

Set to the **HTTPS URL ElizaCloud assigns** the container (e.g. `https://abc123.containers.elizacloud.ai`). Nancy uses it for:

- Telegram webhook registration (`/telegram/<TELEGRAM_WEBHOOK_SECRET>`)
- Wallet link / Safe sign / deploy / execute / pool Mini App pages
- Chat menu Web App button

Webhook registration is **non-fatal and retried** on startup (DNS may lag behind the container going healthy).

## First-boot checklist

1. **Postgres ready** — Supabase or any Postgres; `DATABASE_URL` must be reachable with TLS (Supabase CA is bundled in the image at `certs/supabase-root-2021-ca.crt`).
2. **Create container** in ElizaCloud with image `ghcr.io/dexploarer/nancy:latest`, port **8080**, health **`/health`**.
3. **Paste env vars** — bulk-paste from production `.env`; set `PUBLIC_BASE_URL` to the container's public URL once assigned.
4. **Wait for healthy** — `GET https://<host>/health` → `{"ok":true}`.
5. **Telegram** — In BotFather: `/setprivacy` → **Disable** (bot must see plain-text replies for guided prompts). Confirm webhook in logs: `[HttpRuntime] Telegram webhook configured`.
6. **Smoke test** — DM `/start`, link a wallet, create a test group Safe with minimal BNB.

## Local smoke (before ElizaCloud)

```bash
docker build -t nancy:local .
docker run --rm -p 8080:8080 --env-file .env.production nancy:local
curl -s http://127.0.0.1:8080/health
```

On Apple Silicon, build amd64 explicitly (matches CI):

```bash
docker buildx build --platform linux/amd64 -t nancy:local .
```

## Graceful shutdown

The container handles **SIGTERM** / **SIGINT**: stops the deposit watcher, HTTP server, and Telegram bot cleanly. ElizaCloud rolling restarts rely on this.

## Relationship to DigitalOcean deploy

`.github/workflows/deploy.yml` still pushes to **DigitalOcean Container Registry** and triggers App Platform. That path was blocked by DOCR's 500 MB free-tier quota. **ElizaCloud + GHCR is the intended production path** until DO registry space is resolved or upgraded.

## See also

- [production-checklist.md](../production-checklist.md) — full launch gates and mainnet QA
- [eliza-1-inference.md](./eliza-1-inference.md) — optional self-hosted LLM for `/nancy` verdict copy
