import type { Bot } from "grammy";
import { Logger } from "../logger.js";

export type TelegramMenuButton = Awaited<ReturnType<Bot["api"]["getChatMenuButton"]>>;

export const BOT_NAME = "BNancy, the Golden Girl of Binance";

export const BOT_SHORT_DESCRIPTION = "BNancy runs BSC Safe group trading, pool accounting, and Flap launches for Telegram groups.";

export const BOT_DESCRIPTION = [
  "BNancy, the Golden Girl of Binance, helps Telegram groups run non-custodial BSC Safe trading pools.",
  "Create or link a group Safe, assign owners/traders/members, verify deposits, track shares and PnL, prepare token buys, launch through Flap, and approve Safe transactions.",
  "BNancy is infrastructure only. No profit, token, or execution guarantees."
].join("\n");

export const BOT_COMMANDS = [
  { command: "start", description: "Open the group trading menu" },
  { command: "wallet_generate", description: "Generate a non-custodial wallet (DM only)" },
  { command: "link_start", description: "Start wallet linking" },
  { command: "link_submit", description: "Submit wallet link signature" },
  { command: "safe_group", description: "Collect group members and deploy a Safe" },
  { command: "safe_group_join", description: "Join a Safe setup with a specific wallet" },
  { command: "safe_create", description: "Deploy a Safe from explicit owner addresses" },
  { command: "wallet_set", description: "Link an existing Safe to this group" },
  { command: "safe_unlink", description: "Unlink the group Safe (does not delete on-chain)" },
  { command: "wallet", description: "Show the group Safe wallet" },
  { command: "pool_init", description: "Initialize group pool accounting" },
  { command: "pool", description: "Show pool analytics mini app" },
  { command: "pool_nav", description: "Update pool NAV snapshot" },
  { command: "pool_role", description: "Assign pool owner/trader/member role" },
  { command: "pool_deposit", description: "Credit a verified BNB deposit" },
  { command: "pool_withdraw", description: "Request a pool withdrawal" },
  { command: "pool_cancel", description: "Cancel a queued pool withdrawal" },
  { command: "portfolio", description: "Your position across all your groups" },
  { command: "bnancy", description: "Check elizaOK trends through BNancy's exit-safety lens" },
  { command: "buy", description: "Create a BSC token buy proposal" },
  { command: "proposal", description: "Show a trade proposal" },
  { command: "flap_metadata", description: "Upload optional Flap metadata" },
  { command: "flap_launch", description: "Create a Flap launch proposal" },
  { command: "safe_prepare", description: "Prepare a Safe transaction" },
  { command: "safe_status", description: "Show Safe transaction status" },
  { command: "safe_execute", description: "Execute a Safe tx from your wallet (you pay gas)" },
  { command: "flags", description: "Platform feature flags (platform admins, DM)" },
  { command: "video", description: "Toggle video notes remotely (platform admins, DM)" }
] as const;

export function expectedTelegramMenuButton(publicBaseUrl: string | undefined): TelegramMenuButton {
  const baseUrl = publicBaseUrl === undefined ? undefined : publicBaseUrl.replace(/\/$/, "");
  if (baseUrl !== undefined && baseUrl.startsWith("https://")) {
    return { type: "web_app", text: "Open BNancy", web_app: { url: baseUrl } };
  }
  return { type: "commands" };
}

export function telegramMenuButtonMatches(actual: TelegramMenuButton, expected: TelegramMenuButton): boolean {
  if (actual.type !== expected.type) {
    return false;
  }
  if (actual.type === "web_app" && expected.type === "web_app") {
    return actual.text === expected.text && actual.web_app.url === expected.web_app.url;
  }
  return true;
}

export function telegramMenuButtonSummary(button: TelegramMenuButton): string {
  if (button.type === "web_app") {
    return `${button.text} -> ${button.web_app.url}`;
  }
  return button.type;
}

export async function configureTelegramBot(bot: Bot, publicBaseUrl?: string): Promise<void> {
  // These profile, command, and menu updates are heavily rate-limited by Telegram
  // (especially setMyName/setMyDescription). A 429 on any of them must NOT
  // crash startup, otherwise the bot never starts polling. Each call is
  // best-effort and independent; the inline button menus work regardless.
  await configureStep("setMyName", () => bot.api.setMyName(BOT_NAME));
  await configureStep("setMyDescription", () => bot.api.setMyDescription(BOT_DESCRIPTION));
  await configureStep("setMyShortDescription", () => bot.api.setMyShortDescription(BOT_SHORT_DESCRIPTION));
  await configureStep("setMyCommands", () => bot.api.setMyCommands([...BOT_COMMANDS]));
  await configureStep("setChatMenuButton", () => bot.api.setChatMenuButton({ menu_button: expectedTelegramMenuButton(publicBaseUrl) }));
}

async function configureStep(label: string, action: () => Promise<unknown>): Promise<void> {
  try {
    await action();
  } catch (error) {
    Logger.warn(`[TelegramBot] ${label} skipped (Telegram API error/rate limit)`, {
      err: error instanceof Error ? error : undefined
    });
  }
}
