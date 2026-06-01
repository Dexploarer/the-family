import { webhookCallback } from "grammy";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import type { App } from "../app.js";
import type { AppConfig } from "../config.js";
import { AppError, UserInputError } from "../domain/errors.js";
import { Logger } from "../logger.js";
import { parseAddress, parseHex } from "../utils/evm.js";
import { renderSigningPage } from "./signingPage.js";
import { renderLinkPage, renderLinkStartPage } from "./linkPage.js";
import { renderDeployPage } from "./deployPage.js";
import { renderExecutePage } from "./executePage.js";
import { saltNonceForSession } from "../services/safeDeploymentService.js";
import { notifyGroup } from "../services/notify.js";
import { renderPoolPage } from "./poolPage.js";
import { renderLandingPage } from "./landingPage.js";
import { renderAdminPage } from "./adminPage.js";
import {
  handleAdminBrandingGet,
  handleAdminBrandingPatch,
  handleAdminBrandingPublic,
  handleAdminFlagsGet,
  handleAdminFlagsPatch,
  handleAdminGroupReport,
  handleAdminGroups,
  handleAdminOverview,
  handleAdminUsage,
  handleAdminUsersDelete,
  handleAdminUsersInvite,
  handleAdminUsersList
} from "./adminApi.js";
import {
  handleAdminAuthCheckEmail,
  handleAdminAuthLogin,
  handleAdminAuthLogout,
  handleAdminAuthMe,
  handleAdminAuthSetPassword
} from "./adminAuthApi.js";
import { adminDashboardEnabled } from "./adminAuth.js";
import { verifyTelegramInitData } from "./telegramInitData.js";
import { serializePoolAnalytics } from "./poolAnalyticsResponse.js";
import { configureTelegramBot } from "../bot/telegramCommands.js";
import { FixedWindowRateLimiter, clientKeyFromHeaders } from "./rateLimiter.js";
import { setOgBaseUrl } from "./brand.js";

// Bundled brand image served at /og-image.png for social-share previews.
const OG_IMAGE_PATH = fileURLToPath(new URL("../../assets/nancy.png", import.meta.url));

const SignaturePayloadSchema = z.object({
  telegramUserId: z.string().regex(/^\d+$/).optional(),
  telegramInitData: z.string().optional(),
  ownerAddress: z.string().min(1),
  signature: z.string().regex(/^0x[0-9a-fA-F]+$/)
});

const WalletLinkPayloadSchema = z.object({
  signature: z.string().regex(/^0x[0-9a-fA-F]+$/)
});

const CreateWalletLinkPayloadSchema = z.object({
  telegramUserId: z.string().regex(/^\d+$/).optional(),
  telegramInitData: z.string().optional(),
  address: z.string().min(1)
});

const SafeDeploymentPayloadSchema = z.object({
  telegramUserId: z.string().regex(/^\d+$/).optional(),
  telegramInitData: z.string().optional(),
  transactionHash: z.string().regex(/^0x[0-9a-fA-F]+$/)
});

export function createFetchHandler(appState: App, config: AppConfig): (request: Request) => Response | Promise<Response> {
  const webhookPath = config.telegramWebhookSecret === undefined ? undefined : `/telegram/${config.telegramWebhookSecret}`;
  const webhookHandler = webhookPath === undefined ? undefined : webhookCallback(appState.bot, "bun");

  // 60 req/min per client and 600 req/min across all clients (backstop against
  // spoofed client headers) on the unauthenticated /api/* surface.
  const perClientApiLimiter = new FixedWindowRateLimiter(60, 60_000);
  const globalApiLimiter = new FixedWindowRateLimiter(600, 60_000);

  return function fetch(request: Request): Response | Promise<Response> {
    const url = new URL(request.url);
    // The Telegram webhook response goes straight back to Telegram, so it skips the
    // browser security headers applied to every other (user-facing) response.
    if (request.method === "POST" && webhookPath !== undefined && url.pathname === webhookPath && webhookHandler !== undefined) {
      return webhookHandler(request);
    }
    return withSecurityHeaders(dispatch(request, url));
  };

  async function dispatch(request: Request, url: URL): Promise<Response> {
    if (request.method === "GET" && url.pathname === "/") {
      return route(async () => {
        const branding = await appState.branding.getSnapshot();
        return new Response(renderLandingPage(undefined, { showAdminLink: adminDashboardEnabled(config), branding }), {
          headers: { "Content-Type": "text/html; charset=utf-8" }
        });
      });
    }
    if (request.method === "GET" && url.pathname === "/admin") {
      return route(async () => {
        const branding = await appState.branding.getSnapshot();
        return new Response(renderAdminPage(branding), { headers: { "Content-Type": "text/html; charset=utf-8" } });
      });
    }
    if (request.method === "GET" && (url.pathname === "/health" || url.pathname === "/api/health")) {
      return Response.json({ ok: true });
    }
    if (request.method === "GET" && url.pathname === "/og-image.png") {
      // Brand image for social-share previews (og:image). Bundled in the repo/image.
      return new Response(Bun.file(OG_IMAGE_PATH), {
        headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=86400" }
      });
    }
    if (url.pathname.startsWith("/api/")) {
      // Per-client first so one throttled client short-circuits before touching the
      // global counter — otherwise a single noisy IP drains the global budget and
      // 429s everyone. A key-rotating spoofer still hits the global backstop.
      const allowed = perClientApiLimiter.allow(clientKeyFromHeaders(request.headers)) && globalApiLimiter.allow("*");
      if (!allowed) {
        return Response.json({ error: "Too many requests" }, { status: 429 });
      }
    }
    if (request.method === "GET" && url.pathname.startsWith("/sign/")) {
      return route(async () => renderSafeSigningPage(appState, url.pathname, config.walletConnectProjectId, config.bscChainId));
    }
    if (request.method === "GET" && url.pathname === "/link") {
      return route(async () =>
        new Response(renderLinkStartPage(config.walletConnectProjectId, config.bscChainId), {
          headers: { "Content-Type": "text/html; charset=utf-8" }
        })
      );
    }
    if (request.method === "GET" && url.pathname.startsWith("/link/")) {
      return route(async () => renderWalletLinkPage(appState, url.pathname, config.walletConnectProjectId, config.bscChainId));
    }
    if (request.method === "GET" && url.pathname.startsWith("/deploy/")) {
      return route(async () => renderDeploySafePage(appState, config, url.pathname));
    }
    if (request.method === "GET" && url.pathname.startsWith("/execute/")) {
      return route(async () => renderExecuteSafePage(appState, config, url.pathname));
    }
    if (request.method === "GET" && url.pathname.startsWith("/pool/")) {
      return route(async () => renderPoolAnalyticsPage(url.pathname));
    }
    if (request.method === "GET" && url.pathname.startsWith("/api/pools/") && url.pathname.endsWith("/analytics")) {
      return route(async () => getPoolAnalytics(appState, config, url));
    }
    if (request.method === "POST" && url.pathname === "/api/wallet-links") {
      return route(async () => createWalletLink(appState, config, request));
    }
    if (request.method === "POST" && url.pathname.startsWith("/api/wallet-links/")) {
      return route(async () => submitWalletLinkSignature(appState, request, url.pathname));
    }
    if (request.method === "POST" && url.pathname.startsWith("/api/safe-submissions/")) {
      return route(async () => submitSafeSignature(appState, config, request, url.pathname));
    }
    if (request.method === "POST" && url.pathname.startsWith("/api/safe-deployments/")) {
      return route(async () => submitSafeDeployment(appState, config, request, url.pathname));
    }
    if (request.method === "POST" && url.pathname.startsWith("/api/safe-executions/")) {
      return route(async () => submitSafeExecution(appState, request, url.pathname));
    }
    if (url.pathname.startsWith("/api/admin/")) {
      if (request.method === "POST" && url.pathname === "/api/admin/auth/check-email") {
        return route(async () => handleAdminAuthCheckEmail(appState, config, request));
      }
      if (request.method === "POST" && url.pathname === "/api/admin/auth/login") {
        return route(async () => handleAdminAuthLogin(appState, config, request));
      }
      if (request.method === "POST" && url.pathname === "/api/admin/auth/set-password") {
        return route(async () => handleAdminAuthSetPassword(appState, config, request));
      }
      if (request.method === "POST" && url.pathname === "/api/admin/auth/logout") {
        return route(async () => handleAdminAuthLogout(appState, config, request));
      }
      if (request.method === "GET" && url.pathname === "/api/admin/auth/me") {
        return route(async () => handleAdminAuthMe(appState, config, request));
      }
      if (request.method === "GET" && url.pathname === "/api/admin/branding/public") {
        return route(async () => handleAdminBrandingPublic(appState));
      }
      if (request.method === "GET" && url.pathname === "/api/admin/overview") {
        return route(async () => handleAdminOverview(appState, config, request));
      }
      if (request.method === "GET" && url.pathname === "/api/admin/groups") {
        return route(async () => handleAdminGroups(appState, config, request));
      }
      if (request.method === "GET" && url.pathname.startsWith("/api/admin/groups/")) {
        const chatId = requiredPathSuffix(url.pathname, "/api/admin/groups/");
        return route(async () => handleAdminGroupReport(appState, config, request, chatId));
      }
      if (request.method === "GET" && url.pathname === "/api/admin/usage") {
        return route(async () => handleAdminUsage(appState, config, request, url));
      }
      if (request.method === "GET" && url.pathname === "/api/admin/flags") {
        return route(async () => handleAdminFlagsGet(appState, config, request));
      }
      if (request.method === "PATCH" && url.pathname === "/api/admin/flags") {
        return route(async () => handleAdminFlagsPatch(appState, config, request));
      }
      if (request.method === "GET" && url.pathname === "/api/admin/branding") {
        return route(async () => handleAdminBrandingGet(appState, config, request));
      }
      if (request.method === "PATCH" && url.pathname === "/api/admin/branding") {
        return route(async () => handleAdminBrandingPatch(appState, config, request));
      }
      if (request.method === "GET" && url.pathname === "/api/admin/users") {
        return route(async () => handleAdminUsersList(appState, config, request));
      }
      if (request.method === "POST" && url.pathname === "/api/admin/users") {
        return route(async () => handleAdminUsersInvite(appState, config, request));
      }
      if (request.method === "DELETE" && url.pathname.startsWith("/api/admin/users/")) {
        const userId = requiredPathSuffix(url.pathname, "/api/admin/users/");
        return route(async () => handleAdminUsersDelete(appState, config, request, userId));
      }
    }
    return Response.json({ error: "Not found" }, { status: 404 });
  }
}

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'none'",
  "object-src 'none'",
  "img-src 'self' data:",
  // Google Fonts (landing page: Cormorant Garamond + Manrope).
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  // Pages use inline bootstrap scripts and load the Telegram + WalletConnect + Lenis
  // SDKs from these CDNs; viem/WalletConnect may use eval/wasm, hence 'unsafe-eval'.
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://telegram.org https://esm.sh",
  // Same-origin analytics fetch, JSON-RPC over https, WalletConnect relay over wss.
  "connect-src 'self' https: wss:",
  "frame-src https:"
].join("; ");

// Apply defense-in-depth headers to every user-facing response. The CSP is
// permissive on inline/eval scripts (the pages rely on them) but still blocks
// plugins, base-tag hijacking, and constrains script/connect origins; output is
// already HTML-escaped, so this is hardening rather than the primary XSS defense.
async function withSecurityHeaders(result: Response | Promise<Response>): Promise<Response> {
  const response = await result;
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("Content-Security-Policy", CONTENT_SECURITY_POLICY);
  return response;
}

export type HttpRuntime = {
  stop: () => Promise<void>;
};

export async function startHttpRuntime(appState: App, config: AppConfig): Promise<HttpRuntime> {
  // Fill the absolute og:image URL for social-share tags (no-op if no public URL).
  setOgBaseUrl(config.publicBaseUrl);
  await configureTelegramBot(appState.bot);
  Logger.info("[HttpRuntime] Telegram commands configured");

  // Persistent Mini App launcher: the bot DM's menu button opens Nancy's web app.
  // (Per-group pool analytics still open from the group's "Pool analytics" button,
  // which carries the chat id; the menu button has no group context.)
  if (config.publicBaseUrl?.startsWith("https://")) {
    try {
      await appState.bot.api.setChatMenuButton({
        menu_button: { type: "web_app", text: "Open Nancy", web_app: { url: config.publicBaseUrl } }
      });
      Logger.info("[HttpRuntime] Chat menu button set to Mini App", { url: config.publicBaseUrl });
    } catch (error) {
      Logger.warn("[HttpRuntime] setChatMenuButton skipped", { err: error instanceof Error ? error : undefined });
    }
  }

  const server = Bun.serve({
    port: config.httpPort,
    fetch: createFetchHandler(appState, config)
  });

  Logger.info("[HttpRuntime] HTTP server listening", { port: config.httpPort });

  if (config.depositWatchEnabled) {
    appState.depositWatcher.start();
  }

  if (config.publicBaseUrl !== undefined && config.telegramWebhookSecret !== undefined) {
    const webhookUrl = `${config.publicBaseUrl.replace(/\/$/, "")}/telegram/${config.telegramWebhookSecret}`;
    // Non-fatal + retried: on a fresh deploy the app's own host may not resolve yet
    // (its DNS goes live only once the deploy is healthy), and a thrown setWebhook
    // would crash startup → the deploy never gets healthy → the host never resolves.
    // That deadlock is exactly what bricked the first DigitalOcean deploys.
    void registerWebhookWithRetry(appState.bot, webhookUrl);
  } else {
    await appState.bot.api.deleteWebhook();
    Logger.info("[HttpRuntime] Telegram webhook cleared for local polling");
    void appState.bot.start();
  }

  return {
    stop: async () => {
      Logger.info("[HttpRuntime] Shutting down");
      if (config.depositWatchEnabled) {
        appState.depositWatcher.stop();
      }
      server.stop(true);
      await appState.bot.stop();
      Logger.info("[HttpRuntime] Shutdown complete");
    }
  };
}

// Register the Telegram webhook with backoff. A fresh PaaS host often isn't
// resolvable by Telegram until the deploy is healthy and DNS propagates, so a
// single setWebhook can fail; retrying without crashing lets it succeed once live.
async function registerWebhookWithRetry(bot: App["bot"], webhookUrl: string): Promise<void> {
  // A brand-new PaaS host can be negatively-cached by Telegram's DNS for many
  // minutes (it remembers the NXDOMAIN from before the deploy went live), so retry
  // well past that window — ramp to 60s, then steady ~60s for ~35 min total.
  const maxAttempts = 40;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, Math.min(60_000, 5_000 * attempt)));
    }
    try {
      await bot.api.setWebhook(webhookUrl);
      Logger.info("[HttpRuntime] Telegram webhook configured", { webhookUrl, attempt: attempt + 1 });
      return;
    } catch (error) {
      Logger.warn("[HttpRuntime] setWebhook failed; retrying", {
        attempt: attempt + 1,
        err: error instanceof Error ? error : undefined
      });
    }
  }
  Logger.error("[HttpRuntime] setWebhook gave up — updates won't arrive until the next deploy", { webhookUrl });
}

async function renderSafeSigningPage(appState: App, pathname: string, walletConnectProjectId?: string, chainId?: number): Promise<Response> {
  const submission = await appState.safeSubmissionService.getSubmission(requiredPathSuffix(pathname, "/sign/"));
  if (submission === null) {
    return new Response("Safe submission not found", { status: 404 });
  }
  return new Response(renderSigningPage(submission, walletConnectProjectId, chainId), {
    headers: { "Content-Type": "text/html; charset=utf-8" }
  });
}

async function renderWalletLinkPage(appState: App, pathname: string, walletConnectProjectId?: string, chainId?: number): Promise<Response> {
  const nonce = requiredPathSuffix(pathname, "/link/");
  const link = await appState.walletLinkService.getPendingLinkByNonce(nonce);
  return new Response(renderLinkPage(link, walletConnectProjectId, chainId), {
    headers: { "Content-Type": "text/html; charset=utf-8" }
  });
}

async function renderDeploySafePage(appState: App, config: AppConfig, pathname: string): Promise<Response> {
  const sessionId = requiredPathSuffix(pathname, "/deploy/");
  const session = await appState.safeGroupSetupService.getSession(sessionId);
  if (session.status !== "collecting") {
    throw new UserInputError("This Safe setup is no longer collecting owners");
  }
  const owners = session.owners.map((owner) => owner.address);
  const deployment = appState.safeDeploymentService.buildDeploymentTransaction(owners, session.threshold, saltNonceForSession(sessionId));
  return new Response(
    renderDeployPage({
      sessionId,
      owners,
      threshold: session.threshold,
      to: deployment.to,
      data: deployment.data,
      ...(config.walletConnectProjectId === undefined ? {} : { walletConnectProjectId: config.walletConnectProjectId }),
      chainId: config.bscChainId
    }),
    { headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

async function submitWalletLinkSignature(appState: App, request: Request, pathname: string): Promise<Response> {
  const nonce = requiredApiWalletLinkNonce(pathname);
  const payload = await parseWalletLinkBody(request);
  const link = await appState.walletLinkService.completeLinkByNonce(nonce, parseHex(payload.signature, "signature"));
  return Response.json({ address: link.address, status: link.status });
}

// Link-by-connect: the page connects a wallet, identifies the user from verified
// Telegram initData, and starts a pending link for the connected address — so the
// user never types their address or a nonce.
async function createWalletLink(appState: App, config: AppConfig, request: Request): Promise<Response> {
  const payload = await parseCreateWalletLinkBody(request);
  const telegramUserId = resolveTelegramUserIdFromBody(payload, config);
  const { link, message } = await appState.walletLinkService.beginLink(telegramUserId, parseAddress(payload.address));
  return Response.json({ nonce: link.nonce, message });
}

// Verify a Safe an owner deployed from their own wallet, then link it to the group.
// No Telegram identity is required: the on-chain calldata-match verification is the
// security boundary, so only a correct deployment (matching the session's owners and
// threshold) can ever be linked, regardless of who submits the hash.
async function submitSafeDeployment(appState: App, _config: AppConfig, request: Request, pathname: string): Promise<Response> {
  const sessionId = requiredPathSuffix(pathname, "/api/safe-deployments/");
  const payload = await parseSafeDeploymentBody(request);
  const session = await appState.safeGroupSetupService.getSession(sessionId);
  const owners = session.owners.map((owner) => owner.address);
  const transactionHash = parseHex(payload.transactionHash, "transactionHash");
  const { safeAddress } = await appState.safeDeploymentService.verifyWalletDeployment(
    owners,
    session.threshold,
    saltNonceForSession(sessionId),
    transactionHash
  );
  const result = await appState.safeGroupSetupService.finalizeDeployment(sessionId, safeAddress, transactionHash);
  await notifyGroup(appState.bot, result.wallet.chatId, `✅ Group Safe deployed and linked: ${result.wallet.safeAddress}`);
  return Response.json({ safeAddress: result.wallet.safeAddress });
}

async function renderExecuteSafePage(appState: App, config: AppConfig, pathname: string): Promise<Response> {
  const submissionId = requiredPathSuffix(pathname, "/execute/");
  const { safeAddress, data } = await appState.safeSubmissionService.buildExecution(submissionId);
  return new Response(
    renderExecutePage({
      submissionId,
      safeAddress,
      data,
      ...(config.walletConnectProjectId === undefined ? {} : { walletConnectProjectId: config.walletConnectProjectId }),
      chainId: config.bscChainId
    }),
    { headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

// Verify an owner-submitted execution (no key, no identity needed — the on-chain
// match is the security), then finalize and tell the group.
async function submitSafeExecution(appState: App, request: Request, pathname: string): Promise<Response> {
  const submissionId = requiredPathSuffix(pathname, "/api/safe-executions/");
  const payload = await parseSafeDeploymentBody(request);
  const transactionHash = await appState.safeSubmissionService.finalizeExecution(
    submissionId,
    parseHex(payload.transactionHash, "transactionHash")
  );
  const submission = await appState.safeSubmissionService.getSubmission(submissionId);
  if (submission !== null) {
    await notifyGroup(appState.bot, submission.chatId, `✅ Safe tx ${submission.id} executed on-chain: ${transactionHash}`);
  }
  return Response.json({ transactionHash });
}

async function renderPoolAnalyticsPage(pathname: string): Promise<Response> {
  return new Response(renderPoolPage(requiredPathSuffix(pathname, "/pool/")), {
    headers: { "Content-Type": "text/html; charset=utf-8" }
  });
}

async function getPoolAnalytics(appState: App, config: AppConfig, url: URL): Promise<Response> {
  const analytics = await appState.poolService.getAnalytics(
    requiredApiPoolChatId(url.pathname),
    resolveTelegramUserIdFromQuery(url, config)
  );
  return Response.json(serializePoolAnalytics(analytics));
}

async function submitSafeSignature(appState: App, config: AppConfig, request: Request, pathname: string): Promise<Response> {
  const submissionId = requiredApiSubmissionId(pathname);
  const payload = await parseJsonBody(request);
  const submission = await appState.safeSubmissionService.submitOwnerSignature(
    submissionId,
    parseAddress(payload.ownerAddress),
    parseHex(payload.signature, "signature"),
    resolveTelegramUserId(payload, config)
  );
  await notifyGroup(appState.bot, submission.chatId, `🖊️ An owner just signed Safe tx ${submission.id}. Status: ${submission.status}.`);
  return Response.json({
    id: submission.id,
    status: submission.status,
    safeTxHash: submission.safeTxHash
  });
}

function resolveTelegramUserId(payload: z.infer<typeof SignaturePayloadSchema>, config: AppConfig): string {
  if (payload.telegramInitData !== undefined && payload.telegramInitData.length > 0) {
    return verifyTelegramInitData(payload.telegramInitData, config.telegramBotToken);
  }
  // A raw telegramUserId is unauthenticated, so it is only trusted outside production
  // (local/test). In production the caller must prove identity with signed initData,
  // matching the body/query resolvers below.
  if (config.appEnv !== "production" && payload.telegramUserId !== undefined) {
    return payload.telegramUserId;
  }
  throw new UserInputError("Telegram user identity is required");
}

function resolveTelegramUserIdFromBody(
  payload: { telegramUserId?: string | undefined; telegramInitData?: string | undefined },
  config: AppConfig
): string {
  if (payload.telegramInitData !== undefined && payload.telegramInitData.length > 0) {
    return verifyTelegramInitData(payload.telegramInitData, config.telegramBotToken);
  }
  if (config.appEnv !== "production" && payload.telegramUserId !== undefined) {
    return payload.telegramUserId;
  }
  throw new UserInputError("Telegram Web App identity is required");
}

function resolveTelegramUserIdFromQuery(url: URL, config: AppConfig): string {
  const telegramInitData = url.searchParams.get("telegramInitData");
  if (telegramInitData !== null && telegramInitData.length > 0) {
    return verifyTelegramInitData(telegramInitData, config.telegramBotToken);
  }
  const localTelegramUserId = url.searchParams.get("telegramUserId");
  if (config.appEnv !== "production" && localTelegramUserId !== null && /^\d+$/.test(localTelegramUserId)) {
    return localTelegramUserId;
  }
  throw new UserInputError("Telegram Web App identity is required");
}

async function route(action: () => Promise<Response>): Promise<Response> {
  try {
    return await action();
  } catch (error) {
    if (error instanceof UserInputError || error instanceof AppError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    Logger.error("[HttpRuntime] Request failed", { err: error instanceof Error ? error : undefined });
    return Response.json({ error: "Request failed" }, { status: 500 });
  }
}

function requiredPathSuffix(pathname: string, prefix: string): string {
  if (!pathname.startsWith(prefix) || pathname.length <= prefix.length) {
    throw new UserInputError("Missing route parameter");
  }
  return decodeURIComponent(pathname.slice(prefix.length));
}

function requiredApiSubmissionId(pathname: string): string {
  const prefix = "/api/safe-submissions/";
  const suffix = "/signatures";
  if (!pathname.startsWith(prefix) || !pathname.endsWith(suffix)) {
    throw new UserInputError("Invalid Safe signature route");
  }
  const submissionId = pathname.slice(prefix.length, -suffix.length);
  if (submissionId.length === 0) {
    throw new UserInputError("Missing Safe submission ID");
  }
  return decodeURIComponent(submissionId);
}

function requiredApiWalletLinkNonce(pathname: string): string {
  const prefix = "/api/wallet-links/";
  const suffix = "/signatures";
  if (!pathname.startsWith(prefix) || !pathname.endsWith(suffix)) {
    throw new UserInputError("Invalid wallet-link signature route");
  }
  const nonce = pathname.slice(prefix.length, -suffix.length);
  if (nonce.length === 0) {
    throw new UserInputError("Missing wallet-link nonce");
  }
  return decodeURIComponent(nonce);
}

function requiredApiPoolChatId(pathname: string): string {
  const prefix = "/api/pools/";
  const suffix = "/analytics";
  if (!pathname.startsWith(prefix) || !pathname.endsWith(suffix)) {
    throw new UserInputError("Invalid pool analytics route");
  }
  const chatId = pathname.slice(prefix.length, -suffix.length);
  if (chatId.length === 0) {
    throw new UserInputError("Missing pool chat ID");
  }
  return decodeURIComponent(chatId);
}

async function parseJsonBody(request: Request): Promise<z.infer<typeof SignaturePayloadSchema>> {
  try {
    return SignaturePayloadSchema.parse(await request.json());
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      throw new UserInputError("Invalid signature submission body");
    }
    throw error;
  }
}

async function parseWalletLinkBody(request: Request): Promise<z.infer<typeof WalletLinkPayloadSchema>> {
  try {
    return WalletLinkPayloadSchema.parse(await request.json());
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      throw new UserInputError("Invalid wallet-link submission body");
    }
    throw error;
  }
}

async function parseCreateWalletLinkBody(request: Request): Promise<z.infer<typeof CreateWalletLinkPayloadSchema>> {
  try {
    return CreateWalletLinkPayloadSchema.parse(await request.json());
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      throw new UserInputError("Invalid wallet-link request body");
    }
    throw error;
  }
}

async function parseSafeDeploymentBody(request: Request): Promise<z.infer<typeof SafeDeploymentPayloadSchema>> {
  try {
    return SafeDeploymentPayloadSchema.parse(await request.json());
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      throw new UserInputError("Invalid Safe deployment body");
    }
    throw error;
  }
}
