import { describe, expect, it } from "bun:test";
import {
  BOT_COMMANDS,
  BOT_DESCRIPTION,
  BOT_NAME,
  BOT_SHORT_DESCRIPTION,
  expectedTelegramMenuButton,
  telegramMenuButtonMatches,
  telegramMenuButtonSummary
} from "../src/bot/telegramCommands.js";

describe("BOT_COMMANDS", () => {
  it("registers the group Safe setup commands in Telegram", () => {
    const commands = BOT_COMMANDS.map((command) => command.command);

    expect(commands).toContain("safe_group");
    expect(commands).toContain("safe_group_join");
    expect(commands).toContain("safe_create");
    expect(commands).toContain("pool_init");
    expect(commands).toContain("pool_deposit");
    expect(commands).toContain("pool_withdraw");
    expect(commands).toContain("buy");
    expect(commands).toContain("flap_launch");
    expect(commands).toContain("bnancy");
    expect(commands).not.toContain("bnancy".slice(1));
  });

  it("uses BNancy as the bot identity and keeps metadata inside Telegram limits", () => {
    expect(BOT_NAME).toBe("BNancy, the Golden Girl of Binance");
    expect(BOT_SHORT_DESCRIPTION).toContain("BNancy");
    expect(BOT_DESCRIPTION).toContain("BNancy");
    expect(`${BOT_NAME}\n${BOT_SHORT_DESCRIPTION}\n${BOT_DESCRIPTION}`).not.toMatch(/\bNancy\b/);
    expect(BOT_NAME.length).toBeLessThanOrEqual(64);
    expect(BOT_SHORT_DESCRIPTION.length).toBeLessThanOrEqual(120);
    expect(BOT_DESCRIPTION.length).toBeLessThanOrEqual(512);
    expect(BOT_DESCRIPTION).toContain("infrastructure only");
  });

  it("keeps command metadata unique and inside Telegram limits", () => {
    const commands = new Set<string>();
    for (const command of BOT_COMMANDS) {
      expect(command.command).toMatch(/^[a-z0-9_]{1,32}$/);
      expect(command.description.length).toBeGreaterThan(0);
      expect(command.description.length).toBeLessThanOrEqual(256);
      expect(commands.has(command.command)).toBe(false);
      commands.add(command.command);
    }
  });

  it("uses a Mini App menu button when a public HTTPS base URL is configured", () => {
    const menuButton = expectedTelegramMenuButton("https://bnancy.example/");

    expect(menuButton).toEqual({ type: "web_app", text: "Open BNancy", web_app: { url: "https://bnancy.example" } });
    expect(telegramMenuButtonMatches(menuButton, expectedTelegramMenuButton("https://bnancy.example"))).toBe(true);
    expect(telegramMenuButtonSummary(menuButton)).toBe("Open BNancy -> https://bnancy.example");
  });

  it("uses the commands menu button without an HTTPS public URL", () => {
    expect(expectedTelegramMenuButton(undefined)).toEqual({ type: "commands" });
    expect(expectedTelegramMenuButton("http://localhost:3000")).toEqual({ type: "commands" });
  });
});
