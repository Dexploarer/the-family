import { Bot } from "grammy";
import { loadConfig } from "../config.js";
import { AppError } from "../domain/errors.js";
import { Logger } from "../logger.js";
import {
  BOT_COMMANDS,
  BOT_DESCRIPTION,
  BOT_NAME,
  BOT_SHORT_DESCRIPTION,
  configureTelegramBot,
  expectedTelegramMenuButton,
  telegramMenuButtonMatches,
  telegramMenuButtonSummary
} from "../bot/telegramCommands.js";

const config = loadConfig();
const bot = new Bot(config.telegramBotToken);

await configureTelegramBot(bot, config.publicBaseUrl);
const me = await bot.api.getMe();
const commands = await bot.api.getMyCommands();
const name = await bot.api.getMyName();
const description = await bot.api.getMyDescription();
const shortDescription = await bot.api.getMyShortDescription();
const menuButton = await bot.api.getChatMenuButton();
const expectedMenuButton = expectedTelegramMenuButton(config.publicBaseUrl);

if (commands.length !== BOT_COMMANDS.length) {
  throw new AppError("Telegram command count mismatch", { commandCount: commands.length, expectedCommandCount: BOT_COMMANDS.length });
}
const commandMismatch = commands.find((command, index) => {
  const expected = BOT_COMMANDS[index];
  return expected === undefined || command.command !== expected.command || command.description !== expected.description;
});
if (commandMismatch !== undefined) {
  throw new AppError("Telegram command metadata mismatch", { command: commandMismatch.command });
}
if (name.name !== BOT_NAME) {
  throw new AppError("Telegram bot name mismatch");
}
if (description.description !== BOT_DESCRIPTION) {
  throw new AppError("Telegram bot description mismatch");
}
if (shortDescription.short_description !== BOT_SHORT_DESCRIPTION) {
  throw new AppError("Telegram bot short description mismatch");
}
if (!telegramMenuButtonMatches(menuButton, expectedMenuButton)) {
  throw new AppError("Telegram menu button mismatch", {
    actual: telegramMenuButtonSummary(menuButton),
    expected: telegramMenuButtonSummary(expectedMenuButton)
  });
}

Logger.info("[TelegramSetup] Bot commands configured", {
  username: me.username,
  name: name.name,
  commandCount: commands.length,
  expectedCommandCount: BOT_COMMANDS.length,
  descriptionConfigured: description.description === BOT_DESCRIPTION,
  shortDescriptionConfigured: shortDescription.short_description === BOT_SHORT_DESCRIPTION,
  menuButton: telegramMenuButtonSummary(menuButton)
});
