import { createHash, randomBytes } from "node:crypto";
import type { AppConfig } from "../config.js";
import type { AdminRole, AdminUser } from "../domain/types.js";
import { UserInputError } from "../domain/errors.js";
import type { Repository } from "../storage/repository.js";
import { ensureOperatorInviteInbox, sendAgentMailMessage } from "../integrations/agentMail.js";
import { createId } from "../utils/ids.js";
import type { AdminPublicUser } from "./adminAccountService.js";

export type AdminInviteResult = {
  user: AdminPublicUser;
  inviteUrl: string;
  emailSent: boolean;
};

const INVITE_TTL_DAYS = 7;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// Magic-link invites for dashboard teammates; optional AgentMail email delivery.
export class AdminInviteService {
  constructor(
    private readonly repository: Repository,
    private readonly config: AppConfig
  ) {}

  async createInvite(emailInput: string, role: AdminRole, createdBy: AdminUser): Promise<AdminInviteResult> {
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

    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(now.getTime() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
    await this.repository.saveAdminInvite({
      id: createId("inv"),
      email,
      role,
      tokenHash: hashToken(token),
      createdByUserId: createdBy.id,
      expiresAt,
      acceptedAt: null,
      createdAt: now
    });

    const base = this.config.publicBaseUrl?.replace(/\/+$/, "") ?? "";
    const inviteUrl = `${base}/admin?invite=${token}`;
    const emailSent = await this.sendInviteEmail(email, inviteUrl, createdBy.email);

    return {
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        hasPassword: false,
        createdAt: user.createdAt.toISOString(),
        lastLoginAt: null
      },
      inviteUrl,
      emailSent
    };
  }

  async previewInvite(token: string): Promise<{ email: string; role: AdminRole; expired: boolean }> {
    const invite = await this.lookupInvite(token);
    return {
      email: invite.email,
      role: invite.role,
      expired: invite.expiresAt <= new Date() || invite.acceptedAt !== null
    };
  }

  async consumeInvite(token: string): Promise<{ email: string; role: AdminRole }> {
    const invite = await this.lookupInvite(token);
    if (invite.expiresAt <= new Date()) {
      throw new UserInputError("This invite link has expired. Ask a super admin to send a new one.");
    }
    if (invite.acceptedAt !== null) {
      throw new UserInputError("This invite link was already used.");
    }
    await this.repository.markAdminInviteAccepted(invite.id, new Date());
    return { email: invite.email, role: invite.role };
  }

  private async lookupInvite(token: string) {
    await this.repository.deleteExpiredAdminInvites(new Date());
    const invite = await this.repository.getAdminInviteByTokenHash(hashToken(token.trim()));
    if (invite === null) {
      throw new UserInputError("Invalid or expired invite link.");
    }
    return invite;
  }

  private async sendInviteEmail(to: string, inviteUrl: string, inviterEmail: string): Promise<boolean> {
    const apiKey = this.config.agentMailApiKey;
    if (apiKey === undefined) {
      return false;
    }
    try {
      const inboxId = await ensureOperatorInviteInbox(apiKey, this.config.agentMailInboxId);
      const text = [
        `You were invited to the BNancy operator dashboard by ${inviterEmail}.`,
        "",
        `Accept invite and set your password: ${inviteUrl}`,
        "",
        `This link expires in ${INVITE_TTL_DAYS} days.`
      ].join("\n");
      const html = [
        `<p>You were invited to the BNancy operator dashboard by ${inviterEmail}.</p>`,
        `<p><a href="${inviteUrl}">Accept invite and set your password</a></p>`,
        `<p>This link expires in ${INVITE_TTL_DAYS} days.</p>`
      ].join("");
      return await sendAgentMailMessage(apiKey, inboxId, {
        to,
        subject: "BNancy operator dashboard invite",
        text,
        html
      });
    } catch {
      return false;
    }
  }
}
