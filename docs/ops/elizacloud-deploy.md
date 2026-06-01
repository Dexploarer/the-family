# Deploy BNancy on ElizaCloud Agents

BNancy is a **standalone Bun Telegram bot**, not an elizaOS agent runtime. On ElizaCloud it runs as a **custom Docker image** on the **Agents** product (Hetzner Docker sandboxes behind `https://<agent-id>.elizacloud.ai`).

The legacy **Containers** API (`/api/v1/containers`) was removed upstream; use **Agents** (`/api/v1/eliza/agents`) instead.

## Image

| Field | Value |
|-------|-------|
| Registry | `ghcr.io` |
| Image | `ghcr.io/dexploarer/bnancy:latest` |
| Digest pin | Prefer `:sha-<commit>` or `@sha256:…` for production |
| Platform | **linux/amd64** (built by `.github/workflows/publish.yml`) |
| Published on | Push to `main` (when Docker/source paths change) or manual **workflow_dispatch** |

After the first CI push, open **GitHub → Packages → bnancy → Package settings → Change visibility → Public** so ElizaCloud can pull without private-registry credentials.

## Agent settings (dashboard / API)

| Setting | Value | Notes |
|---------|-------|-------|
| **Flavor** | Custom Docker image | Dashboard: paste `ghcr.io/dexploarer/bnancy:latest` |
| **Listen port** | `3000` | ElizaCloud maps host ports to container `PORT` (3000). BNancy reads `HTTP_PORT` — deploy script sets **`HTTP_PORT=3000`**. |
| **Health** | `/health` or `/api/health` | Both return `{"ok":true}`. Eliza's internal probe also accepts `/` (landing page). |
| **Instances** | `1` | **Never scale horizontally** — pool accounting uses an in-process mutex. |

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
HTTP_PORT=3000
PUBLIC_BASE_URL=https://<agent-id>.elizacloud.ai
TELEGRAM_WEBHOOK_SECRET=<random-32+-char-string>
RISK_CHECK_MODE=warn
MIN_LIQUIDITY_USD=1000
MAX_BUY_TAX_BPS=1500
MAX_SELL_TAX_BPS=1500
DEPOSIT_WATCH=on
```

Mark as **secret** in ElizaCloud: `TELEGRAM_BOT_TOKEN`, `DATABASE_URL`, `TELEGRAM_WEBHOOK_SECRET`, `SAFE_API_KEY`, `PINATA_JWT`, `ELIZA_MODEL_API_KEY`, `KOKORO_TTS_API_KEY`, `ADMIN_SESSION_SECRET`, `PLATFORM_OPS_TOKEN`.

### Strongly recommended

```text
SAFE_TRANSACTION_SERVICE_URL=https://api.safe.global/tx-service/bnb
WALLETCONNECT_PROJECT_ID=<WalletConnect cloud project id>
PLATFORM_ADMIN_IDS=<comma-separated Telegram user ids>
```

### Operator dashboard (`/admin`)

Email login, analytics, per-group reports, feature flags, and whitelabel (super admins only).

```text
ADMIN_BOOTSTRAP_EMAIL=dexploarer@gmail.com
ADMIN_SESSION_SECRET=<random-string-at-least-32-chars>
ADMIN_SESSION_TTL_DAYS=7
VIDEO_ENABLED=off
VOICE_ENABLED=off
```

Mark as **secret**: `ADMIN_SESSION_SECRET`, optional legacy `PLATFORM_OPS_TOKEN`.

**First login:** open `https://<agent-id>.elizacloud.ai/admin`, enter `ADMIN_BOOTSTRAP_EMAIL`, set your password (becomes **super_admin**). Then invite **admin** or **super_admin** teammates from the **Team** tab.

**Telegram (optional):** `PLATFORM_ADMIN_IDS` enables `/flags` and `/video` in DM for remote toggles without the web UI.

### Optional

```text
RUN_MIGRATE_ON_START=true
ELIZA_MODEL_URL=https://...
KOKORO_TTS_URL=https://...
PINATA_JWT=...
LOG_LEVEL=info
```

### `PUBLIC_BASE_URL`

Set to **`https://<agent-uuid>.elizacloud.ai`** (the public URL ElizaCloud assigns each agent). BNancy uses it for Telegram webhooks, wallet pages, and Mini App links.

The deploy script sets this automatically from the agent id after create/provision.

## Deploy

1. **Postgres ready** — Supabase or any Postgres; `DATABASE_URL` must be reachable with TLS (Supabase CA is bundled at `certs/supabase-root-2021-ca.crt`).
2. **API key** — [elizacloud.ai](https://www.elizacloud.ai) → Settings → API keys.
3. **Fill `.env`** with production values (see `.env.example`).
4. **Run** (from repo root):

```bash
ELIZACLOUD_API_KEY=eliza_... bun run deploy:elizacloud
```

Target an existing dashboard agent:

```bash
ELIZACLOUD_AGENT_ID=e597a229-... ELIZACLOUD_API_KEY=eliza_... bun run deploy:elizacloud
```

The script creates an agent named `bnancy` (or reuses by name/id), enqueues **provision**, polls until `status=running`, and verifies `https://<id>.elizacloud.ai/health`.

**Env updates:** the public API only accepts `environmentVars` on **create**. To rotate secrets on an existing agent, use the ElizaCloud dashboard or delete the agent and re-run the script.

**Dashboard alternative:** Agents → Create → Custom Docker image → `ghcr.io/dexploarer/bnancy:latest` → paste env vars → Start.

## First-boot checklist

1. `GET https://<agent-id>.elizacloud.ai/health` → `{"ok":true}`.
2. BotFather: `/setprivacy` → **Disable** (bot must see plain-text replies).
3. Logs should show: `[HttpRuntime] Telegram webhook configured`.
4. Smoke: DM `/start`, link wallet, create a test group Safe.

## Local smoke (before ElizaCloud)

```bash
docker build -t bnancy:local .
docker run --rm -p 8080:8080 --env-file .env.production bnancy:local
curl -s http://127.0.0.1:8080/health
```

On Apple Silicon:

```bash
docker buildx build --platform linux/amd64 -t bnancy:local .
```

## Graceful shutdown

SIGTERM/SIGINT stops the deposit watcher, HTTP server, and Telegram bot cleanly.

## See also

- [production-checklist.md](../production-checklist.md)
- [eliza-1-inference.md](./eliza-1-inference.md)
