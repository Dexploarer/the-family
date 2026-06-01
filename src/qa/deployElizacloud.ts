/**
 * Create or update BNancy on ElizaCloud **Agents** (Docker sandbox) via the public API.
 * Requires ELIZACLOUD_API_KEY (or ELIZAOS_CLOUD_API_KEY / ELIZA_CLOUD_API_KEY).
 *
 * Usage:
 *   ELIZACLOUD_API_KEY=eliza_... bun src/qa/deployElizacloud.ts
 *   ELIZACLOUD_AGENT_ID=e597a229-... ELIZACLOUD_API_KEY=eliza_... bun src/qa/deployElizacloud.ts
 *   ELIZACLOUD_IMAGE=ghcr.io/dexploarer/bnancy:latest bun src/qa/deployElizacloud.ts
 *
 * ElizaCloud maps host ports to container PORT (default 3000). BNancy must listen on that
 * port — the script sets HTTP_PORT=3000 and expects /api/health (see server.ts).
 */

const API_BASE = process.env["ELIZACLOUD_API_URL"]?.replace(/\/+$/, "") ?? "https://www.elizacloud.ai/api/v1";
const AGENT_NAME = process.env["ELIZACLOUD_AGENT_NAME"] ?? "bnancy";
const AGENT_ID_OVERRIDE = process.env["ELIZACLOUD_AGENT_ID"];
const AGENT_DOMAIN = process.env["ELIZACLOUD_AGENT_DOMAIN"] ?? "elizacloud.ai";
const IMAGE = process.env["ELIZACLOUD_IMAGE"] ?? "ghcr.io/dexploarer/bnancy:latest";

const DEPLOY_ENV_KEYS = [
  "APP_ENV",
  "STORAGE_DRIVER",
  "TELEGRAM_BOT_TOKEN",
  "BSC_CHAIN_ID",
  "BSC_RPC_URL",
  "PLATFORM_FEE_RECIPIENT",
  "PLATFORM_COMMISSION_RECEIVER",
  "TRADE_FEE_BPS",
  "POOL_WITHDRAWAL_FEE_BPS",
  "DATABASE_URL",
  "SAFE_TRANSACTION_SERVICE_URL",
  "SAFE_API_KEY",
  "DEX_DEADLINE_SECONDS",
  "PUBLIC_BASE_URL",
  "WALLETCONNECT_PROJECT_ID",
  "TELEGRAM_WEBHOOK_SECRET",
  "PINATA_JWT",
  "DEPOSIT_WATCH",
  "PLATFORM_ADMIN_IDS",
  "RISK_CHECK_MODE",
  "MIN_LIQUIDITY_USD",
  "MAX_BUY_TAX_BPS",
  "MAX_SELL_TAX_BPS",
  "ELIZAOK_TRENDING_URL",
  "ELIZA_MODEL_URL",
  "ELIZA_MODEL_NAME",
  "ELIZA_MODEL_API_KEY",
  "KOKORO_TTS_URL",
  "KOKORO_TTS_API_KEY",
  "WATCHLIST_MAX_TOKENS",
  "WATCHLIST_CACHE_SECONDS",
  "WATCHLIST_DEFAULT_SIZE_BNB",
  "MAX_EXIT_SLIPPAGE_BPS",
  "MIN_LP_LOCKED_PERCENT",
  "MAX_LP_HOLDER_TOP_PERCENT",
  "WALLET_ENCRYPTION_KEY",
  "RUN_MIGRATE_ON_START",
  "LOG_LEVEL",
  "PLATFORM_OPS_TOKEN",
  "VIDEO_ENABLED",
  "VOICE_ENABLED",
  "ADMIN_BOOTSTRAP_EMAIL",
  "ADMIN_SESSION_SECRET",
  "ADMIN_SESSION_TTL_DAYS"
] as const;

type AgentListItem = {
  id: string;
  agentName: string;
  status: string;
  errorMessage: string | null;
};

type AgentDetail = AgentListItem & {
  bridgeUrl: string | null;
  adminDetails?: { dockerImage: string | null } | null;
};

type ProvisionResponse = {
  success: boolean;
  created?: boolean;
  alreadyInProgress?: boolean;
  data?: {
    id?: string;
    status?: string;
    bridgeUrl?: string;
    healthUrl?: string;
    jobId?: string;
  };
  error?: string;
  code?: string;
  retryable?: boolean;
};

type JobRecord = {
  id: string;
  status: string;
  error: string | null;
  result: unknown;
};

function resolveApiKey(): string {
  const key =
    process.env["ELIZACLOUD_API_KEY"] ??
    process.env["ELIZAOS_CLOUD_API_KEY"] ??
    process.env["ELIZA_CLOUD_API_KEY"];
  if (!key) {
    throw new Error(
      "Set ELIZACLOUD_API_KEY (or ELIZAOS_CLOUD_API_KEY / ELIZA_CLOUD_API_KEY) from elizacloud.ai → Settings → API keys"
    );
  }
  return key;
}

function agentPublicUrl(agentId: string): string {
  return `https://${agentId}.${AGENT_DOMAIN}`.replace(/\/+$/, "");
}

function buildEnvironmentVars(publicBaseUrl: string): Record<string, string> {
  const out: Record<string, string> = {
    APP_ENV: "production",
    HTTP_PORT: "3000",
    RUN_MIGRATE_ON_START: "true",
    PUBLIC_BASE_URL: publicBaseUrl
  };

  for (const name of DEPLOY_ENV_KEYS) {
    const value = process.env[name];
    if (value !== undefined && value !== "") {
      out[name] = value;
    }
  }

  out["APP_ENV"] = "production";
  out["HTTP_PORT"] = "3000";
  out["PUBLIC_BASE_URL"] = publicBaseUrl;

  if (!out["TELEGRAM_WEBHOOK_SECRET"]) {
    throw new Error(
      "TELEGRAM_WEBHOOK_SECRET is required for ElizaCloud (webhook mode). Generate with: openssl rand -hex 24"
    );
  }

  if (out["STORAGE_DRIVER"] === "postgres" && !out["DATABASE_URL"]) {
    throw new Error("DATABASE_URL is required when STORAGE_DRIVER=postgres");
  }

  return out;
}

async function api<T>(
  apiKey: string,
  method: string,
  path: string,
  body?: unknown
): Promise<{ status: number; body: T }> {
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });

  const text = await response.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`${method} ${path} returned non-JSON (${response.status}): ${text.slice(0, 400)}`);
  }

  if (!response.ok) {
    const err = json as { error?: string; message?: string; code?: string };
    const detail = err.error ?? err.message ?? text;
    const code = err.code ? ` [${err.code}]` : "";
    throw new Error(`${method} ${path} failed (${response.status})${code}: ${detail}`);
  }

  return { status: response.status, body: json as T };
}

async function assertAgentsApi(apiKey: string): Promise<void> {
  const { body } = await api<{ success: boolean }>(apiKey, "GET", "/eliza/agents");
  if (!body.success) {
    throw new Error("GET /eliza/agents did not return success=true");
  }
}

async function listAgents(apiKey: string): Promise<AgentListItem[]> {
  const { body } = await api<{ success: boolean; data: AgentListItem[] }>(apiKey, "GET", "/eliza/agents");
  return body.data;
}

async function getAgent(apiKey: string, agentId: string): Promise<AgentDetail> {
  const { body } = await api<{ success: boolean; data: AgentDetail }>(
    apiKey,
    "GET",
    `/eliza/agents/${encodeURIComponent(agentId)}`
  );
  return body.data;
}

async function createAgent(
  apiKey: string,
  agentName: string,
  environmentVars: Record<string, string>
): Promise<string> {
  const { body } = await api<{ success: boolean; data: { id: string } }>(apiKey, "POST", "/eliza/agents", {
    agentName,
    environmentVars,
    // Sent for dashboard parity; production API may ignore until dockerImage is in the Zod schema.
    dockerImage: IMAGE
  });
  return body.data.id;
}

async function provisionAgent(apiKey: string, agentId: string): Promise<ProvisionResponse & { httpStatus: number }> {
  const response = await fetch(`${API_BASE}/eliza/agents/${encodeURIComponent(agentId)}/provision`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json"
    }
  });

  const text = await response.text();
  let body: ProvisionResponse;
  try {
    body = (text ? JSON.parse(text) : {}) as ProvisionResponse;
  } catch {
    throw new Error(`POST provision returned non-JSON (${response.status}): ${text.slice(0, 400)}`);
  }

  if (response.status === 502) {
    throw new Error(
      `Provisioning worker unavailable (502): ${body.error ?? text}. The Agents platform is live but the background worker may be restarting — retry in a minute.`
    );
  }

  if (!response.ok && response.status !== 409) {
    throw new Error(`POST provision failed (${response.status}): ${body.error ?? text}`);
  }

  return { ...body, httpStatus: response.status };
}

async function waitForJob(apiKey: string, jobId: string): Promise<void> {
  const deadline = Date.now() + 15 * 60 * 1000;
  while (Date.now() < deadline) {
    const { body } = await api<{ success: boolean; data: JobRecord }>(
      apiKey,
      "GET",
      `/jobs/${encodeURIComponent(jobId)}`
    );
    const job = body.data;
    process.stdout.write(`  job ${jobId.slice(0, 8)}… status=${job.status}\n`);

    if (job.status === "completed") {
      return;
    }
    if (job.status === "failed" || job.status === "cancelled") {
      throw new Error(`Provisioning job ${job.status}: ${job.error ?? "unknown error"}`);
    }
    await Bun.sleep(5_000);
  }
  throw new Error(`Timed out waiting for job ${jobId}`);
}

async function waitForRunning(apiKey: string, agentId: string): Promise<AgentDetail> {
  const deadline = Date.now() + 15 * 60 * 1000;
  while (Date.now() < deadline) {
    const agent = await getAgent(apiKey, agentId);
    const dockerImage = agent.adminDetails?.dockerImage;
    process.stdout.write(
      `  agent status=${agent.status}${dockerImage ? ` image=${dockerImage}` : ""}${agent.errorMessage ? ` err=${agent.errorMessage}` : ""}\n`
    );

    if (agent.status === "error" || agent.status === "failed") {
      throw new Error(`Agent provisioning failed: ${agent.errorMessage ?? "unknown error"}`);
    }
    if (agent.status === "running") {
      return agent;
    }
    await Bun.sleep(10_000);
  }
  throw new Error("Timed out waiting for agent status=running");
}

async function waitForHealth(publicUrl: string): Promise<void> {
  const paths = ["/health", "/api/health", "/"];
  const deadline = Date.now() + 5 * 60 * 1000;
  while (Date.now() < deadline) {
    for (const path of paths) {
      try {
        const response = await fetch(`${publicUrl}${path}`, { signal: AbortSignal.timeout(15_000) });
        if (path === "/health" && response.ok) {
          const body = (await response.json()) as { ok?: boolean };
          if (body.ok === true) {
            return;
          }
        } else if (path === "/api/health" && response.ok) {
          return;
        } else if (path === "/" && response.ok) {
          return;
        }
      } catch {
        // DNS / boot lag
      }
    }
    await Bun.sleep(5_000);
  }
  throw new Error(`Health check did not pass at ${publicUrl} within 5 minutes`);
}

const apiKey = resolveApiKey();
await assertAgentsApi(apiKey);

console.log(`ElizaCloud API: ${API_BASE}`);
console.log(`Image: ${IMAGE}`);
console.log(`Agent name: ${AGENT_NAME}`);

let agentId = AGENT_ID_OVERRIDE;
if (!agentId) {
  const agents = await listAgents(apiKey);
  const existing = agents.find((a) => a.agentName === AGENT_NAME);
  agentId = existing?.id;
}

const publicUrlPreview = agentId ? agentPublicUrl(agentId) : agentPublicUrl("(new-agent-id)");
const environmentVars = buildEnvironmentVars(publicUrlPreview);

if (!agentId) {
  console.log("Creating new Eliza agent…");
  agentId = await createAgent(apiKey, AGENT_NAME, environmentVars);
  console.log(`Created agent ${agentId}`);
  environmentVars["PUBLIC_BASE_URL"] = agentPublicUrl(agentId);
} else {
  console.log(`Using existing agent ${agentId}`);
  const detail = await getAgent(apiKey, agentId);
  if (detail.status === "running") {
    console.log("Agent already running — skipping provision (env vars are only applied at create time via API).");
  }
  environmentVars["PUBLIC_BASE_URL"] = agentPublicUrl(agentId);
}

console.log(`Public URL (expected): ${environmentVars["PUBLIC_BASE_URL"]}`);

const detailBefore = await getAgent(apiKey, agentId);
if (detailBefore.status !== "running") {
  console.log("Requesting provision…");
  const provision = await provisionAgent(apiKey, agentId);

  if (provision.data?.jobId) {
    console.log(`Provision job ${provision.data.jobId} (${provision.alreadyInProgress ? "already in progress" : "created"})`);
    await waitForJob(apiKey, provision.data.jobId);
  } else if (provision.data?.status === "running") {
    console.log("Agent provisioned synchronously (already running).");
  } else if (!provision.success) {
    throw new Error(provision.error ?? "Provision request failed");
  }

  await waitForRunning(apiKey, agentId);
}

const publicUrl = agentPublicUrl(agentId);
console.log("Checking public health…");
await waitForHealth(publicUrl);

console.log("\n✅ BNancy is live on ElizaCloud Agents");
console.log(`   URL:     ${publicUrl}`);
console.log(`   Health:  ${publicUrl}/health`);
console.log(`   Webhook: ${publicUrl}/telegram/<secret>`);
console.log(`   Agent:   ${agentId}`);
console.log(
  "\nNote: POST /eliza/agents only accepts environmentVars at create time. " +
    "To change secrets later, use the ElizaCloud dashboard or delete and re-run this script."
);
