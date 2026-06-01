import { randomBytes } from "node:crypto";
import type { AppConfig } from "../config.js";
import type { AdminRole, AdminSession, AdminUser } from "../domain/types.js";
import { UserInputError } from "../domain/errors.js";
import type { Repository } from "../storage/repository.js";
import { createId } from "../utils/ids.js";

export type EmailAuthStep = "password" | "set_password" | "not_allowed";

export type EmailCheckResult = {
  step: EmailAuthStep;
  email: string;
};

export type AdminPublicUser = {
  id: string;
  email: string;
  role: AdminRole;
  hasPassword: boolean;
  createdAt: string;
  lastLoginAt: string | null;
};

const MIN_PASSWORD_LENGTH = 12;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function assertPasswordStrength(password: string): void {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new UserInputError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
}

function serializePublicUser(user: AdminUser): AdminPublicUser {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    hasPassword: user.passwordHash !== null,
    createdAt: user.createdAt.toISOString(),
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null
  };
}

function roleRank(role: AdminRole): number {
  return role === "super_admin" ? 2 : 1;
}

// Email + password admin accounts with bootstrap and invite flows.
export class AdminAccountService {
  constructor(
    private readonly repository: Repository,
    private readonly config: AppConfig
  ) {}

  async checkEmail(rawEmail: string): Promise<EmailCheckResult> {
    const email = normalizeEmail(rawEmail);
    if (!email.includes("@")) {
      throw new UserInputError("Enter a valid email address.");
    }

    const existing = await this.repository.getAdminUserByEmail(email);
    if (existing === null) {
      const canBootstrap = await this.canBootstrap(email);
      return { step: canBootstrap ? "set_password" : "not_allowed", email };
    }
    if (existing.passwordHash === null) {
      return { step: "set_password", email: existing.email };
    }
    return { step: "password", email: existing.email };
  }

  async login(emailInput: string, password: string): Promise<{ sessionId: string; user: AdminPublicUser }> {
    const email = normalizeEmail(emailInput);
    const user = await this.repository.getAdminUserByEmail(email);
    if (user === null || user.passwordHash === null) {
      throw new UserInputError("Invalid email or password.");
    }
    const valid = await Bun.password.verify(password, user.passwordHash);
    if (!valid) {
      throw new UserInputError("Invalid email or password.");
    }
    const sessionId = await this.createSession(user.id);
    const updated: AdminUser = { ...user, lastLoginAt: new Date(), updatedAt: new Date() };
    await this.repository.saveAdminUser(updated);
    return { sessionId, user: serializePublicUser(updated) };
  }

  async setPassword(emailInput: string, password: string): Promise<{ sessionId: string; user: AdminPublicUser }> {
    assertPasswordStrength(password);
    const email = normalizeEmail(emailInput);
    const passwordHash = await Bun.password.hash(password, { algorithm: "bcrypt", cost: 12 });
    const now = new Date();

    let user = await this.repository.getAdminUserByEmail(email);
    if (user === null) {
      const canBootstrap = await this.canBootstrap(email);
      if (!canBootstrap) {
        throw new UserInputError("This email is not authorized to create an admin account.");
      }
      user = {
        id: createId("admin"),
        email,
        passwordHash,
        role: "super_admin",
        createdAt: now,
        updatedAt: now,
        lastLoginAt: now
      };
    } else {
      if (user.passwordHash !== null) {
        throw new UserInputError("Password is already set. Sign in with your password.");
      }
      user = {
        ...user,
        passwordHash,
        updatedAt: now,
        lastLoginAt: now
      };
    }

    await this.repository.saveAdminUser(user);
    const sessionId = await this.createSession(user.id);
    return { sessionId, user: serializePublicUser(user) };
  }

  async logout(sessionId: string | null): Promise<void> {
    if (sessionId === null) {
      return;
    }
    await this.repository.deleteAdminSession(sessionId);
  }

  async resolveSession(sessionId: string | null): Promise<AdminUser | null> {
    if (sessionId === null) {
      return null;
    }
    await this.repository.deleteExpiredAdminSessions(new Date());
    const session = await this.repository.getAdminSession(sessionId);
    if (session === null || session.expiresAt <= new Date()) {
      if (session !== null) {
        await this.repository.deleteAdminSession(sessionId);
      }
      return null;
    }
    return this.repository.getAdminUserById(session.userId);
  }

  async listUsers(): Promise<AdminPublicUser[]> {
    const users = await this.repository.listAdminUsers();
    return users.map(serializePublicUser);
  }

  async inviteUser(emailInput: string, role: AdminRole): Promise<AdminPublicUser> {
    const email = normalizeEmail(emailInput);
    if (!email.includes("@")) {
      throw new UserInputError("Enter a valid email address.");
    }
    const existing = await this.repository.getAdminUserByEmail(email);
    if (existing !== null) {
      throw new UserInputError("An admin with that email already exists.");
    }
    const now = new Date();
    const user: AdminUser = {
      id: createId("admin"),
      email,
      passwordHash: null,
      role,
      createdAt: now,
      updatedAt: now,
      lastLoginAt: null
    };
    await this.repository.saveAdminUser(user);
    return serializePublicUser(user);
  }

  async removeUser(userId: string, actor: AdminUser): Promise<void> {
    const target = await this.repository.getAdminUserById(userId);
    if (target === null) {
      throw new UserInputError("Admin user not found.");
    }
    if (target.id === actor.id) {
      throw new UserInputError("You cannot remove your own account.");
    }
    if (target.role === "super_admin") {
      const supers = (await this.repository.listAdminUsers()).filter((user) => user.role === "super_admin");
      if (supers.length <= 1) {
        throw new UserInputError("Cannot remove the last super admin.");
      }
    }
    await this.repository.deleteAdminUser(userId);
  }

  hasRole(user: AdminUser | null, minRole: AdminRole): boolean {
    if (user === null) {
      return false;
    }
    return roleRank(user.role) >= roleRank(minRole);
  }

  private async canBootstrap(email: string): Promise<boolean> {
    const count = await this.repository.countAdminUsers();
    if (count > 0) {
      return false;
    }
    const bootstrapEmail = this.config.adminBootstrapEmail;
    if (bootstrapEmail === undefined) {
      return false;
    }
    return normalizeEmail(bootstrapEmail) === email;
  }

  private async createSession(userId: string): Promise<string> {
    const sessionId = randomBytes(32).toString("hex");
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.config.adminSessionTtlDays * 24 * 60 * 60 * 1000);
    const session: AdminSession = {
      id: sessionId,
      userId,
      expiresAt,
      createdAt: now
    };
    await this.repository.saveAdminSession(session);
    return sessionId;
  }
}
