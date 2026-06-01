import { timingSafeEqual } from "node:crypto";
import type { App } from "../app.js";
import type { AppConfig } from "../config.js";
import type { AdminRole, AdminUser } from "../domain/types.js";

export const ADMIN_SESSION_COOKIE = "nancy_admin_session";

export type AdminPrincipal =
  | { kind: "legacy"; role: "super_admin" }
  | { kind: "user"; user: AdminUser };

function normalizeToken(value: string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function tokensMatch(expected: string, provided: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}

export function adminDashboardEnabled(config: AppConfig): boolean {
  return config.platformOpsToken !== undefined || config.adminSessionSecret !== undefined;
}

export function extractAdminToken(request: Request): string | null {
  const auth = request.headers.get("authorization");
  if (auth !== null && auth.toLowerCase().startsWith("bearer ")) {
    return normalizeToken(auth.slice("bearer ".length));
  }
  return normalizeToken(request.headers.get("x-platform-ops-token"));
}

export function readSessionCookie(request: Request): string | null {
  const header = request.headers.get("cookie");
  if (header === null) {
    return null;
  }
  for (const part of header.split(";")) {
    const [rawKey, ...rest] = part.trim().split("=");
    if (rawKey === ADMIN_SESSION_COOKIE) {
      const value = rest.join("=").trim();
      return value.length > 0 ? value : null;
    }
  }
  return null;
}

export function sessionCookieHeader(sessionId: string, config: AppConfig): string {
  const maxAge = config.adminSessionTtlDays * 24 * 60 * 60;
  const secure = config.publicBaseUrl?.startsWith("https://") === true ? "; Secure" : "";
  return `${ADMIN_SESSION_COOKIE}=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export function clearSessionCookieHeader(): string {
  return `${ADMIN_SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

function authorizeLegacyToken(request: Request, config: AppConfig): boolean {
  const expected = config.platformOpsToken;
  if (expected === undefined) {
    return false;
  }
  const provided = extractAdminToken(request);
  if (provided === null) {
    return false;
  }
  return tokensMatch(expected, provided);
}

export async function resolveAdminPrincipal(app: App, config: AppConfig, request: Request): Promise<AdminPrincipal | null> {
  if (authorizeLegacyToken(request, config)) {
    return { kind: "legacy", role: "super_admin" };
  }
  if (config.adminSessionSecret === undefined) {
    return null;
  }
  const sessionId = readSessionCookie(request);
  const user = await app.adminAccount.resolveSession(sessionId);
  if (user === null) {
    return null;
  }
  return { kind: "user", user };
}

export function principalHasRole(principal: AdminPrincipal, minRole: AdminRole): boolean {
  if (principal.kind === "legacy") {
    return true;
  }
  return appRoleRank(principal.user.role) >= appRoleRank(minRole);
}

function appRoleRank(role: AdminRole): number {
  return role === "super_admin" ? 2 : 1;
}

export function serializePrincipal(principal: AdminPrincipal): {
  email: string;
  role: AdminRole;
  kind: "legacy" | "user";
  id?: string;
} {
  if (principal.kind === "legacy") {
    return { email: "legacy-token", role: "super_admin", kind: "legacy" };
  }
  return {
    email: principal.user.email,
    role: principal.user.role,
    kind: "user",
    id: principal.user.id
  };
}
