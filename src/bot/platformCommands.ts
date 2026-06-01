import type { Bot } from "grammy";
import type { AppConfig } from "../config.js";
import { UserInputError } from "../domain/errors.js";
import { PLATFORM_FLAG_KEYS, type PlatformSettingsService } from "../services/platformSettings.js";
import { handleUserCommand, requireTelegramUserId } from "./commandUtils.js";

export type PlatformCommandDependencies = {
  config: AppConfig;
  platformSettings: PlatformSettingsService;
};

function requirePlatformAdmin(config: AppConfig, telegramUserId: string): void {
  if (!config.platformAdminIds.includes(telegramUserId)) {
    throw new UserInputError("This command is for platform admins only.");
  }
}

async function formatFlagsStatus(platformSettings: PlatformSettingsService): Promise<string> {
  const flags = await platformSettings.listFlags();
  const lines = flags.map((flag) => {
    const label = flag.key === PLATFORM_FLAG_KEYS.video ? "Video" : "Voice";
    return `${label}: ${flag.effective ? "ON" : "OFF"} (${flag.source})`;
  });
  return [
    ...lines,
    "",
    "Commands:",
    "/flags status",
    "/flags video on|off|reset",
    "/flags voice on|off|reset",
    "/video on|off|reset (alias for video)"
  ].join("\n");
}

async function patchFlag(
  platformSettings: PlatformSettingsService,
  key: typeof PLATFORM_FLAG_KEYS.video | typeof PLATFORM_FLAG_KEYS.voice,
  action: string
): Promise<string> {
  if (action === "on") {
    await platformSettings.setFlag(key, true);
  } else if (action === "off") {
    await platformSettings.setFlag(key, false);
  } else if (action === "reset") {
    await platformSettings.clearFlag(key);
  } else {
    throw new UserInputError("Usage: /flags <video|voice> <on|off|reset>");
  }
  return formatFlagsStatus(platformSettings);
}

export function registerPlatformCommands(bot: Bot, dependencies: PlatformCommandDependencies): void {
  bot.command("flags", async (ctx) => {
    await handleUserCommand(ctx, "flags", async () => {
      if (ctx.chat?.type !== "private") {
        await ctx.reply("🔒 Platform controls are private — DM me and run the command there.");
        return;
      }
      const fromId = requireTelegramUserId(ctx.from?.id);
      requirePlatformAdmin(dependencies.config, fromId);

      const parts = (ctx.message?.text ?? "").trim().split(/\s+/);
      const target = (parts[1] ?? "status").toLowerCase();
      const action = (parts[2] ?? "").toLowerCase();

      if (target === "status" || target === "") {
        await ctx.reply(await formatFlagsStatus(dependencies.platformSettings));
        return;
      }
      if (target === "video") {
        if (action === "") {
          await ctx.reply(await formatFlagsStatus(dependencies.platformSettings));
          return;
        }
        await ctx.reply(await patchFlag(dependencies.platformSettings, PLATFORM_FLAG_KEYS.video, action));
        return;
      }
      if (target === "voice") {
        if (action === "") {
          await ctx.reply(await formatFlagsStatus(dependencies.platformSettings));
          return;
        }
        await ctx.reply(await patchFlag(dependencies.platformSettings, PLATFORM_FLAG_KEYS.voice, action));
        return;
      }
      throw new UserInputError("Usage: /flags [status|video|voice] [on|off|reset]");
    });
  });

  bot.command("video", async (ctx) => {
    await handleUserCommand(ctx, "video", async () => {
      if (ctx.chat?.type !== "private") {
        await ctx.reply("🔒 Platform controls are private — DM me and run the command there.");
        return;
      }
      const fromId = requireTelegramUserId(ctx.from?.id);
      requirePlatformAdmin(dependencies.config, fromId);

      const parts = (ctx.message?.text ?? "").trim().split(/\s+/);
      const action = (parts[1] ?? "status").toLowerCase();
      if (action === "status" || action === "") {
        await ctx.reply(await formatFlagsStatus(dependencies.platformSettings));
        return;
      }
      await ctx.reply(await patchFlag(dependencies.platformSettings, PLATFORM_FLAG_KEYS.video, action));
    });
  });
}
