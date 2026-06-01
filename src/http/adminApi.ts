import { z } from "zod";
import type { App } from "../app.js";
import type { AppConfig } from "../config.js";
import { UserInputError } from "../domain/errors.js";
import type { AdminRole } from "../domain/types.js";
import {
  adminDashboardEnabled,
  principalHasRole,
  resolveAdminPrincipal,
  type AdminPrincipal
} from "./adminAuth.js";
import type { PlatformStats } from "../services/poolService.js";
import { PLATFORM_FLAG_KEYS, type PlatformFlagKey } from "../services/platformSettings.js";
import type { BrandingPatch } from "../services/brandingService.js";

const flagPatchSchema = z.object({
  key: z.enum([PLATFORM_FLAG_KEYS.video, PLATFORM_FLAG_KEYS.voice]),
  enabled: z.boolean().optional(),
  reset: z.boolean().optional()
});

const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(["super_admin", "admin"])
});

const brandingPatchSchema = z.object({
  productName: z.string().min(1).max(80).optional(),
  tagline: z.string().min(1).max(160).optional(),
  themeColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  operatorTitle: z.string().min(1).max(80).optional(),
  footerNote: z.string().min(1).max(240).optional(),
  accentStart: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  accentEnd: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional()
});

function unauthorized(): Response {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

function forbidden(): Response {
  return Response.json({ error: "Forbidden" }, { status: 403 });
}

function disabled(): Response {
  return Response.json({ error: "Admin dashboard is not configured" }, { status: 503 });
}

function serializePlatformStats(stats: PlatformStats) {
  return {
    groups: stats.groups,
    totalMembers: stats.totalMembers,
    totalTvlWei: stats.totalTvlWei.toString(),
    depositVolume24hWei: stats.depositVolume24hWei.toString(),
    withdrawalVolume24hWei: stats.withdrawalVolume24hWei.toString(),
    dau24h: stats.dau24h,
    topCommands: stats.topCommands
  };
}

async function requirePrincipal(
  app: App,
  config: AppConfig,
  request: Request,
  minRole: AdminRole = "admin"
): Promise<Response | AdminPrincipal> {
  if (!adminDashboardEnabled(config)) {
    return disabled();
  }
  const principal = await resolveAdminPrincipal(app, config, request);
  if (principal === null) {
    return unauthorized();
  }
  if (!principalHasRole(principal, minRole)) {
    return forbidden();
  }
  return principal;
}

export async function handleAdminOverview(app: App, config: AppConfig, request: Request): Promise<Response> {
  const auth = await requirePrincipal(app, config, request);
  if (auth instanceof Response) {
    return auth;
  }
  const overview = await app.adminDashboard.getOverview();
  return Response.json({
    platform: serializePlatformStats(overview.platform),
    flags: overview.flags,
    recentUsage: overview.recentUsage
  });
}

export async function handleAdminGroups(app: App, config: AppConfig, request: Request): Promise<Response> {
  const auth = await requirePrincipal(app, config, request);
  if (auth instanceof Response) {
    return auth;
  }
  return Response.json({ groups: await app.adminDashboard.listGroups() });
}

export async function handleAdminGroupReport(
  app: App,
  config: AppConfig,
  request: Request,
  chatId: string
): Promise<Response> {
  const auth = await requirePrincipal(app, config, request);
  if (auth instanceof Response) {
    return auth;
  }
  try {
    return Response.json({ view: await app.adminDashboard.getGroupReportView(chatId) });
  } catch {
    return Response.json({ error: "Group not found" }, { status: 404 });
  }
}

export async function handleAdminSafeQueue(app: App, config: AppConfig, request: Request): Promise<Response> {
  const auth = await requirePrincipal(app, config, request);
  if (auth instanceof Response) {
    return auth;
  }
  return Response.json({ items: await app.adminDashboard.listSafeQueue() });
}

export async function handleAdminModelLogs(app: App, config: AppConfig, request: Request, url: URL): Promise<Response> {
  const auth = await requirePrincipal(app, config, request);
  if (auth instanceof Response) {
    return auth;
  }
  const hours = url.searchParams.get("hours");
  const parsed = hours === null ? 24 : Number(hours);
  const logs = await app.modelInferenceLog.listRecent({
    hours: Number.isNaN(parsed) ? 24 : parsed,
    limit: 200
  });
  return Response.json({
    logs: logs.map((log) => ({
      id: log.id,
      source: log.source,
      model: log.model,
      status: log.status,
      telegramUserId: log.telegramUserId,
      chatId: log.chatId,
      tokenSymbol: log.tokenSymbol,
      tokenAddress: log.tokenAddress,
      language: log.language,
      latencyMs: log.latencyMs,
      promptPreview: log.promptPreview,
      responsePreview: log.responsePreview,
      errorMessage: log.errorMessage,
      createdAt: log.createdAt.toISOString()
    }))
  });
}

export async function handleAdminModelAnalytics(app: App, config: AppConfig, request: Request, url: URL): Promise<Response> {
  const auth = await requirePrincipal(app, config, request);
  if (auth instanceof Response) {
    return auth;
  }
  const hours = url.searchParams.get("hours");
  const parsed = hours === null ? 24 : Number(hours);
  return Response.json({
    analytics: await app.modelInferenceLog.getAnalytics({ hours: Number.isNaN(parsed) ? 24 : parsed })
  });
}

export async function handleAdminUsage(app: App, config: AppConfig, request: Request, url: URL): Promise<Response> {
  const auth = await requirePrincipal(app, config, request);
  if (auth instanceof Response) {
    return auth;
  }
  const chatId = url.searchParams.get("chatId") ?? undefined;
  const hours = url.searchParams.get("hours");
  const parsedHours = hours === null ? undefined : Number(hours);
  const usage = await app.adminDashboard.listUsage({
    ...(chatId === undefined ? {} : { chatId }),
    ...(parsedHours === undefined || Number.isNaN(parsedHours) ? {} : { hours: parsedHours })
  });
  return Response.json({ usage });
}

export async function handleAdminFlagsGet(app: App, config: AppConfig, request: Request): Promise<Response> {
  const auth = await requirePrincipal(app, config, request);
  if (auth instanceof Response) {
    return auth;
  }
  return Response.json({ flags: await app.platformSettings.listFlags() });
}

export async function handleAdminFlagsPatch(app: App, config: AppConfig, request: Request): Promise<Response> {
  const auth = await requirePrincipal(app, config, request);
  if (auth instanceof Response) {
    return auth;
  }
  const body = await request.json().catch(() => null);
  const parsed = flagPatchSchema.safeParse(body);
  if (!parsed.success) {
    throw new UserInputError("Invalid flag payload");
  }
  const { key, enabled, reset } = parsed.data;
  if (reset === true) {
    await app.platformSettings.clearFlag(key as PlatformFlagKey);
  } else if (enabled !== undefined) {
    await app.platformSettings.setFlag(key as PlatformFlagKey, enabled);
  } else {
    throw new UserInputError("Provide enabled or reset");
  }
  return Response.json({ flags: await app.platformSettings.listFlags() });
}

export async function handleAdminBrandingGet(app: App, config: AppConfig, request: Request): Promise<Response> {
  const auth = await requirePrincipal(app, config, request);
  if (auth instanceof Response) {
    return auth;
  }
  return Response.json({ branding: await app.branding.getSnapshot() });
}

export async function handleAdminBrandingPatch(app: App, config: AppConfig, request: Request): Promise<Response> {
  const auth = await requirePrincipal(app, config, request, "super_admin");
  if (auth instanceof Response) {
    return auth;
  }
  const body = await request.json().catch(() => null);
  const parsed = brandingPatchSchema.safeParse(body);
  if (!parsed.success) {
    throw new UserInputError("Invalid branding payload");
  }
  const branding = await app.branding.update(parsed.data as BrandingPatch);
  return Response.json({ branding });
}

export async function handleAdminUsersList(app: App, config: AppConfig, request: Request): Promise<Response> {
  const auth = await requirePrincipal(app, config, request, "super_admin");
  if (auth instanceof Response) {
    return auth;
  }
  return Response.json({ users: await app.adminAccount.listUsers() });
}

export async function handleAdminUsersInvite(app: App, config: AppConfig, request: Request): Promise<Response> {
  const auth = await requirePrincipal(app, config, request, "super_admin");
  if (auth instanceof Response) {
    return auth;
  }
  if (auth.kind !== "user") {
    throw new UserInputError("Legacy token cannot invite users. Sign in with email.");
  }
  const body = await request.json().catch(() => null);
  const parsed = inviteSchema.safeParse(body);
  if (!parsed.success) {
    throw new UserInputError("Invalid invite payload");
  }
  const result = await app.adminInvite.createInvite(parsed.data.email, parsed.data.role, auth.user);
  return Response.json(result);
}

export async function handleAdminUsersDelete(
  app: App,
  config: AppConfig,
  request: Request,
  userId: string
): Promise<Response> {
  const auth = await requirePrincipal(app, config, request, "super_admin");
  if (auth instanceof Response) {
    return auth;
  }
  if (auth.kind !== "user") {
    throw new UserInputError("Legacy token cannot manage users. Sign in with email.");
  }
  await app.adminAccount.removeUser(userId, auth.user);
  return Response.json({ ok: true });
}

export async function handleAdminBrandingPublic(app: App): Promise<Response> {
  return Response.json({ branding: await app.branding.getSnapshot() });
}
