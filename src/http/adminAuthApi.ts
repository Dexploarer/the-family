import { z } from "zod";
import type { App } from "../app.js";
import type { AppConfig } from "../config.js";
import { UserInputError } from "../domain/errors.js";
import {
  adminDashboardEnabled,
  clearSessionCookieHeader,
  readSessionCookie,
  resolveAdminPrincipal,
  serializePrincipal,
  sessionCookieHeader
} from "./adminAuth.js";

const emailSchema = z.object({ email: z.string().email() });
const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });
const setPasswordSchema = z.object({ email: z.string().email(), password: z.string().min(12) });

function disabled(): Response {
  return Response.json({ error: "Admin dashboard is not configured" }, { status: 503 });
}

function jsonWithSession(body: unknown, sessionId: string, config: AppConfig): Response {
  return Response.json(body, {
    headers: {
      "Set-Cookie": sessionCookieHeader(sessionId, config)
    }
  });
}

export async function handleAdminAuthCheckEmail(app: App, config: AppConfig, request: Request): Promise<Response> {
  if (!adminDashboardEnabled(config)) {
    return disabled();
  }
  const body = await request.json().catch(() => null);
  const parsed = emailSchema.safeParse(body);
  if (!parsed.success) {
    throw new UserInputError("Enter a valid email address.");
  }
  return Response.json(await app.adminAccount.checkEmail(parsed.data.email));
}

export async function handleAdminAuthLogin(app: App, config: AppConfig, request: Request): Promise<Response> {
  if (!adminDashboardEnabled(config) || config.adminSessionSecret === undefined) {
    return disabled();
  }
  const body = await request.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    throw new UserInputError("Invalid login payload.");
  }
  const result = await app.adminAccount.login(parsed.data.email, parsed.data.password);
  return jsonWithSession({ user: result.user }, result.sessionId, config);
}

export async function handleAdminAuthSetPassword(app: App, config: AppConfig, request: Request): Promise<Response> {
  if (!adminDashboardEnabled(config) || config.adminSessionSecret === undefined) {
    return disabled();
  }
  const body = await request.json().catch(() => null);
  const parsed = setPasswordSchema.safeParse(body);
  if (!parsed.success) {
    throw new UserInputError("Password must be at least 12 characters.");
  }
  const result = await app.adminAccount.setPassword(parsed.data.email, parsed.data.password);
  return jsonWithSession({ user: result.user }, result.sessionId, config);
}

export async function handleAdminAuthLogout(app: App, _config: AppConfig, request: Request): Promise<Response> {
  const sessionId = readSessionCookie(request);
  await app.adminAccount.logout(sessionId);
  return Response.json({ ok: true }, { headers: { "Set-Cookie": clearSessionCookieHeader() } });
}

export async function handleAdminAuthMe(app: App, config: AppConfig, request: Request): Promise<Response> {
  if (!adminDashboardEnabled(config)) {
    return disabled();
  }
  const principal = await resolveAdminPrincipal(app, config, request);
  if (principal === null) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return Response.json({ user: serializePrincipal(principal) });
}
