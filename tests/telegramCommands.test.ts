import { describe, expect, it } from "bun:test";
import { BOT_COMMANDS, BOT_DESCRIPTION, BOT_NAME, BOT_SHORT_DESCRIPTION } from "../src/bot/telegramCommands.js";

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
});
