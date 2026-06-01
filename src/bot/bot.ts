import { Bot, InputFile, type Context } from "grammy";
import type { AppConfig } from "../config.js";
import { AppError, InvalidInputError, UserInputError } from "../domain/errors.js";
import type { Repository } from "../storage/repository.js";
import { parseAddress, parseBasisPoints, parseBnbAmount, parseHex } from "../utils/evm.js";
import { Logger } from "../logger.js";
import { createFlapSalt, parseVaultRecipients } from "../chain/flapService.js";
import {
  formatFlapLaunch,
  formatGeneratedWallet,
  formatSafeCreationSession,
  formatSafeStatus,
  formatSafeSubmission,
  formatTradeProposal,
  formatWallet
} from "./formatters.js";
import { GroupWalletService } from "../services/groupWalletService.js";
import { TradeService } from "../services/tradeService.js";
import { FlapLaunchService } from "../services/flapLaunchService.js";
import { SafeSubmissionService } from "../services/safeSubmissionService.js";
import { WalletLinkService } from "../services/walletLinkService.js";
import { FlapMetadataService } from "../services/flapMetadataService.js";
import { SafeDeploymentService } from "../services/safeDeploymentService.js";
import { SafeGroupSetupService } from "../services/safeGroupSetupService.js";
import { PoolService } from "../services/poolService.js";
import { DepositVerificationService } from "../services/depositVerificationService.js";
import type { WatchlistService } from "../services/watchlistService.js";
import type { ExplanationService } from "../services/explanationService.js";
import { VoiceService, voiceSupported } from "../services/voiceService.js";
import type { VoiceVideoService } from "../services/voiceVideoService.js";
import type { PlatformSettingsService } from "../services/platformSettings.js";
import { flapLaunchKeyboard, executePageKeyboard, helpText, linkPageKeyboard, mainMenuKeyboard, nancyDetailKeyboard, nancyLangKeyboard, nancyListKeyboard, safeGroupKeyboard, safeSubmissionKeyboard, tradeProposalKeyboard } from "./keyboards.js";
import { normalizeLanguages } from "../domain/languages.js";
import type { WatchlistEntry } from "../domain/types.js";
import { formatWatchlist, formatWatchlistEntry } from "./watchlistView.js";
import { registerSafeCallbacks } from "./safeCallbacks.js";
import { registerPoolCommands } from "./poolCommands.js";
import { registerPlatformCommands } from "./platformCommands.js";
import { createId } from "../utils/ids.js";
import { beginUnlink, handleMenuSelection, handlePromptBack, handlePromptCancel, handlePromptChoice, routePromptInput } from "./promptController.js";
import {
  emptyToUndefined,
  handleUserCommand,
  parsePositiveInteger,
  requireChatId,
  requireGroupAdmin,
  requiredPart,
  requireTelegramUserId,
  splitCommand
} from "./commandUtils.js";

export type BotDependencies = {
  repository: Repository;
  groupWalletService: GroupWalletService;
  walletLinkService: WalletLinkService;
  tradeService: TradeService;
  flapLaunchService: FlapLaunchService;
  flapMetadataService: FlapMetadataService;
  safeSubmissionService: SafeSubmissionService;
  safeDeploymentService: SafeDeploymentService;
  safeGroupSetupService: SafeGroupSetupService;
  poolService: PoolService;
  depositVerificationService: DepositVerificationService;
  watchlistService: WatchlistService;
  explanationService: ExplanationService;
  voiceService?: VoiceService;
  voiceVideoService?: VoiceVideoService;
  platformSettings: PlatformSettingsService;
  config: AppConfig;
};

export function createBot(dependencies: BotDependencies): Bot {
  const bot = new Bot(dependencies.config.telegramBotToken);

  // Lightweight usage telemetry: record slash commands and menu taps (best-effort).
  bot.use(async (ctx, next) => {
    const label = usageLabel(ctx);
    const userId = ctx.from?.id?.toString();
    if (label !== null && userId !== undefined) {
      try {
        const chatId = ctx.chat?.id?.toString();
        await dependencies.repository.saveUsageEvent({
          id: createId("usage"),
          command: label,
          telegramUserId: userId,
          createdAt: new Date(),
          ...(chatId === undefined ? {} : { chatId })
        });
      } catch (error) {
        Logger.warn("[Usage] failed to record event", { err: error instanceof Error ? error : undefined });
      }
    }
    await next();
  });

  bot.command("start", async (ctx) => {
    // Group "Generate/Link wallet" buttons deep-link here in the DM
    // (t.me/<bot>?start=link|generate) so the private flow finishes with one tap.
    const deepLink = (ctx.match ?? "").trim();
    if (deepLink === "link" || deepLink === "generate") {
      await handleUserCommand(ctx, "start", async () => {
        await handleMenuSelection(dependencies, ctx, deepLink === "link" ? "link_start" : "wallet_generate");
      });
      return;
    }
    await ctx.reply(
      [
        "💛 Hey sugar — Nancy here, the Golden Girl of Binance.",
        "",
        "I run your group's shared trading wallet: a Safe multisig the owners control. I never hold your keys.",
        "",
        "New here? Three taps to get going:",
        "1️⃣ Generate wallet (or Link wallet) — your owner key",
        "2️⃣ Create group Safe — collect owners, then deploy from your wallet",
        "3️⃣ Init pool — then Deposit and watch your share grow",
        "",
        "Tap a button below, or open the command menu (the / icon) for everything."
      ].join("\n"),
      { reply_markup: mainMenuKeyboard() }
    );
  });

  bot.command("wallet_generate", async (ctx) => {
    await handleUserCommand(ctx, "wallet_generate", async () => {
      const fromId = requireTelegramUserId(ctx.from?.id);
      if (ctx.chat?.type !== "private") {
        await ctx.reply(
          "DM me to generate a wallet so your private key stays private. Open a private chat with me and run /wallet_generate there."
        );
        return;
      }
      const generated = await dependencies.walletLinkService.generateLinkedWallet(fromId);
      await ctx.reply(formatGeneratedWallet(generated));
    });
  });

  bot.command("link_start", async (ctx) => {
    await handleUserCommand(ctx, "link_start", async () => {
      const fromId = requireTelegramUserId(ctx.from?.id);
      const parts = splitCommand(ctx.message?.text, 2);
      const address = parseAddress(requiredPart(parts, 1));
      const result = await dependencies.walletLinkService.beginLink(fromId, address);
      await ctx.reply(
        [
          "Tap below, connect this wallet, and sign.",
          "",
          "Manual fallback: sign this message and run /link_submit <ownerAddress> <signature>",
          result.message
        ].join("\n"),
        { reply_markup: linkPageKeyboard(result.link.nonce, dependencies.config.publicBaseUrl, ctx.chat?.type === "private") }
      );
    });
  });

  bot.command("link_submit", async (ctx) => {
    await handleUserCommand(ctx, "link_submit", async () => {
      const fromId = requireTelegramUserId(ctx.from?.id);
      const parts = splitCommand(ctx.message?.text, 3);
      const address = parseAddress(requiredPart(parts, 1));
      const signature = parseHex(requiredPart(parts, 2), "signature");
      const link = await dependencies.walletLinkService.completeLink(fromId, address, signature);
      await ctx.reply(`Linked wallet ${link.address}`);
    });
  });

  bot.command("wallet_set", async (ctx) => {
    await handleUserCommand(ctx, "wallet_set", async () => {
      const chatId = requireChatId(ctx.chat?.id);
      await requireGroupAdmin(ctx, chatId);
      const parts = splitCommand(ctx.message?.text, 4);
      const safeAddress = parseAddress(requiredPart(parts, 1));
      const threshold = parsePositiveInteger(requiredPart(parts, 2), "threshold");
      const owners = parts.slice(3).map(parseAddress);
      if (threshold > owners.length) {
        throw new UserInputError("Threshold cannot exceed owner count", { threshold, owners: owners.length });
      }
      const wallet = await dependencies.groupWalletService.setWallet(chatId, safeAddress, threshold, owners);
      await ctx.reply(formatWallet(wallet));
    });
  });

  bot.command("safe_create", async (ctx) => {
    await handleUserCommand(ctx, "safe_create", async () => {
      throw new UserInputError(
        "Use /safe_group <threshold> to collect owners, then tap Deploy Safe to deploy from your wallet. Already have a Safe? Use /wallet_set."
      );
    });
  });

  bot.command("safe_group", async (ctx) => {
    await handleUserCommand(ctx, "safe_group", async () => {
      const chatId = requireChatId(ctx.chat?.id);
      await requireGroupAdmin(ctx, chatId);
      const fromId = requireTelegramUserId(ctx.from?.id);
      const parts = splitCommand(ctx.message?.text, 2);
      const threshold = parsePositiveInteger(requiredPart(parts, 1), "threshold");
      const session = await dependencies.safeGroupSetupService.createSession(chatId, fromId, threshold);
      await ctx.reply(formatSafeCreationSession(session), {
        reply_markup: safeGroupKeyboard(session)
      });
    });
  });

  bot.command("safe_group_join", async (ctx) => {
    await handleUserCommand(ctx, "safe_group_join", async () => {
      const fromId = requireTelegramUserId(ctx.from?.id);
      const parts = splitCommand(ctx.message?.text, 3);
      const session = await dependencies.safeGroupSetupService.joinWithWallet(
        requiredPart(parts, 1),
        fromId,
        parseAddress(requiredPart(parts, 2))
      );
      await ctx.reply(formatSafeCreationSession(session), {
        reply_markup: safeGroupKeyboard(session)
      });
    });
  });

  bot.command("wallet", async (ctx) => {
    await handleUserCommand(ctx, "wallet", async () => {
      const chatId = requireChatId(ctx.chat?.id);
      const wallet = await dependencies.groupWalletService.getWallet(chatId);
      if (wallet === null) {
        throw new UserInputError("No group wallet set");
      }
      await ctx.reply(formatWallet(wallet));
    });
  });

  bot.command("buy", async (ctx) => {
    await handleUserCommand(ctx, "buy", async () => {
      const chatId = requireChatId(ctx.chat?.id);
      const fromId = requireTelegramUserId(ctx.from?.id);
      await dependencies.poolService.requireTraderAccess(chatId, fromId);
      const parts = splitCommand(ctx.message?.text, 3);
      const tokenAddress = parseAddress(requiredPart(parts, 1));
      const amountWei = parseBnbAmount(requiredPart(parts, 2));
      const slippageBps = parts[3] === undefined ? 150 : parseBasisPoints(parts[3], 5000);
      const proposal = await dependencies.tradeService.createNativeBuyProposal({
        chatId,
        proposerTelegramId: fromId,
        tokenAddress,
        inputAmountWei: amountWei,
        slippageBps,
        tradeFeeBps: dependencies.config.tradeFeeBps,
        feeRecipient: dependencies.config.platformFeeRecipient,
        dexDeadlineSeconds: dependencies.config.dexDeadlineSeconds
      });
      await ctx.reply(formatTradeProposal(proposal), { reply_markup: tradeProposalKeyboard(proposal.id) });
    });
  });

  bot.command("nancy", async (ctx) => {
    await handleUserCommand(ctx, "nancy", async () => {
      const chatId = requireChatId(ctx.chat?.id);
      const fromId = requireTelegramUserId(ctx.from?.id);
      const treasuryBnb = await groupTreasuryBnb(dependencies, chatId, fromId);
      const list = await dependencies.watchlistService.getList(Number(chatId), treasuryBnb);
      await ctx.reply(formatWatchlist(list, treasuryBnb ?? dependencies.config.watchlistDefaultSizeBnb), {
        parse_mode: "Markdown",
        reply_markup: nancyListKeyboard(list)
      });
    });
  });

  bot.command("nancy_lang", async (ctx) => {
    await handleUserCommand(ctx, "nancy_lang", async () => {
      const chatId = requireChatId(ctx.chat?.id);
      await requireGroupAdmin(ctx, chatId);
      const current = normalizeLanguages((await dependencies.repository.getGroupLanguages(chatId)) ?? []);
      await ctx.reply(
        "🌐 Nancy's verdict language(s). Tap to toggle — pick several for multi-language (one verdict per language).",
        { reply_markup: nancyLangKeyboard(current) }
      );
    });
  });

  bot.command("proposal", async (ctx) => {
    await handleUserCommand(ctx, "proposal", async () => {
      const parts = splitCommand(ctx.message?.text, 2);
      const proposalId = requiredPart(parts, 1);
      const proposal = await dependencies.tradeService.getProposal(proposalId);
      if (proposal === null) {
        throw new UserInputError("Proposal not found", { id: proposalId });
      }
      await ctx.reply(formatTradeProposal(proposal), { reply_markup: tradeProposalKeyboard(proposal.id) });
    });
  });

  bot.command("flap_launch", async (ctx) => {
    await handleUserCommand(ctx, "flap_launch", async () => {
      const chatId = requireChatId(ctx.chat?.id);
      await requireGroupAdmin(ctx, chatId);
      const fromId = requireTelegramUserId(ctx.from?.id);
      const commandText = ctx.message?.text;
      if (commandText === undefined) {
        throw new InvalidInputError();
      }
      const payload = commandText.replace(/^\/flap_launch(@\w+)?\s*/, "");
      const parts = payload.split("|");
      if (parts.length !== 8) {
        throw new InvalidInputError();
      }
      const buyTaxBps = parseBasisPoints(requiredPart(parts, 3), 5000);
      const sellTaxBps = parseBasisPoints(requiredPart(parts, 4), 5000);
      const taxDays = parsePositiveInteger(requiredPart(parts, 5), "taxDays");
      const proposal = await dependencies.flapLaunchService.createLaunchProposal({
        chatId,
        proposerTelegramId: fromId,
        name: requiredPart(parts, 0),
        symbol: requiredPart(parts, 1),
        metadataUri: requiredPart(parts, 2),
        buyTaxBps,
        sellTaxBps,
        taxDurationSeconds: taxDays * 24 * 60 * 60,
        recipients: parseVaultRecipients(requiredPart(parts, 6)),
        initialBuyWei: parseBnbAmount(requiredPart(parts, 7)),
        salt: createFlapSalt(),
        commissionReceiver: dependencies.config.platformCommissionReceiver
      });
      await ctx.reply(formatFlapLaunch(proposal), { reply_markup: flapLaunchKeyboard(proposal.id) });
    });
  });

  bot.command("flap_metadata", async (ctx) => {
    await handleUserCommand(ctx, "flap_metadata", async () => {
      const chatId = requireChatId(ctx.chat?.id);
      await requireGroupAdmin(ctx, chatId);
      const commandText = ctx.message?.text;
      if (commandText === undefined) {
        throw new InvalidInputError();
      }
      const payload = commandText.replace(/^\/flap_metadata(@\w+)?\s*/, "");
      const parts = payload.split("|");
      if (parts.length < 4 || parts.length > 7) {
        throw new InvalidInputError();
      }
      const metadataUri = await dependencies.flapMetadataService.createMetadata({
        name: requiredPart(parts, 0),
        symbol: requiredPart(parts, 1),
        description: requiredPart(parts, 2),
        imageUri: requiredPart(parts, 3),
        ...(emptyToUndefined(parts[4]) === undefined ? {} : { website: requiredPart(parts, 4) }),
        ...(emptyToUndefined(parts[5]) === undefined ? {} : { telegram: requiredPart(parts, 5) }),
        ...(emptyToUndefined(parts[6]) === undefined ? {} : { x: requiredPart(parts, 6) })
      });
      await ctx.reply(`Flap metadata uploaded: ${metadataUri}`);
    });
  });

  bot.command("safe_prepare", async (ctx) => {
    await handleUserCommand(ctx, "safe_prepare", async () => {
      const chatId = requireChatId(ctx.chat?.id);
      const fromId = requireTelegramUserId(ctx.from?.id);
      const parts = splitCommand(ctx.message?.text, 3);
      const sourceType = requiredPart(parts, 1);
      const sourceId = requiredPart(parts, 2);
      const submission =
        sourceType === "trade"
          ? await dependencies.safeSubmissionService.prepareTradeSubmission(chatId, sourceId, fromId)
          : sourceType === "flap"
            ? await dependencies.safeSubmissionService.prepareFlapLaunchSubmission(chatId, sourceId, fromId)
            : sourceType === "withdrawal"
              ? await dependencies.safeSubmissionService.prepareWithdrawalSubmission(chatId, sourceId, fromId)
              : null;
      if (submission === null) {
        throw new InvalidInputError("The source must be trade, flap, or withdrawal.");
      }
      await ctx.reply(formatSafeSubmission(submission), {
        reply_markup: safeSubmissionKeyboard(submission.id, dependencies.config.publicBaseUrl, ctx.chat?.type === "private")
      });
    });
  });

  bot.command("safe_submit", async (ctx) => {
    await handleUserCommand(ctx, "safe_submit", async () => {
      const fromId = requireTelegramUserId(ctx.from?.id);
      const parts = splitCommand(ctx.message?.text, 4);
      const submissionId = requiredPart(parts, 1);
      const ownerAddress = parseAddress(requiredPart(parts, 2));
      const signature = parseHex(requiredPart(parts, 3), "signature");
      const submission = await dependencies.safeSubmissionService.submitOwnerSignature(submissionId, ownerAddress, signature, fromId);
      await ctx.reply(formatSafeSubmission(submission), {
        reply_markup: safeSubmissionKeyboard(submission.id, dependencies.config.publicBaseUrl, ctx.chat?.type === "private")
      });
    });
  });

  bot.command("safe_status", async (ctx) => {
    await handleUserCommand(ctx, "safe_status", async () => {
      const parts = splitCommand(ctx.message?.text, 2);
      const status = await dependencies.safeSubmissionService.getStatus(requiredPart(parts, 1));
      await ctx.reply(formatSafeStatus(status));
    });
  });

  bot.command("safe_execute", async (ctx) => {
    await handleUserCommand(ctx, "safe_execute", async () => {
      const parts = splitCommand(ctx.message?.text, 2);
      const submissionId = requiredPart(parts, 1);
      await ctx.reply(
        "Enough owners signed? Execute from your own wallet — you pay the gas, the bot holds no key.",
        { reply_markup: executePageKeyboard(submissionId, dependencies.config.publicBaseUrl, ctx.chat?.type === "private") }
      );
    });
  });

  bot.command("safe_unlink", async (ctx) => {
    await handleUserCommand(ctx, "safe_unlink", async () => {
      await beginUnlink(dependencies, ctx);
    });
  });

  bot.callbackQuery("nancy_list", async (ctx) => {
    await handleCallback(ctx, async () => {
      const chatId = requireChatId(ctx.chat?.id);
      const fromId = requireTelegramUserId(ctx.from?.id);
      const treasuryBnb = await groupTreasuryBnb(dependencies, chatId, fromId);
      const list = await dependencies.watchlistService.getList(Number(chatId), treasuryBnb);
      await ctx.answerCallbackQuery();
      await ctx.editMessageText(formatWatchlist(list, treasuryBnb ?? dependencies.config.watchlistDefaultSizeBnb), {
        parse_mode: "Markdown",
        reply_markup: nancyListKeyboard(list)
      });
    });
  });

  bot.callbackQuery(/^nancy_detail:(.+)$/, async (ctx) => {
    await handleCallback(ctx, async () => {
      const chatId = requireChatId(ctx.chat?.id);
      const fromId = requireTelegramUserId(ctx.from?.id);
      const tokenAddress = String(ctx.match[1] ?? "");
      // Respond to the webhook FAST: ack + placeholder, then do the slow work
      // (pool enrichment + eliza-1 verdict — up to ~20s, more for multi-language)
      // DETACHED, so we never blow grammy's ~10s webhook timeout.
      await ctx.answerCallbackQuery();
      await ctx.editMessageText("💛 Nancy's reading the pool — one sec…");
      void (async () => {
        try {
          const treasuryBnb = await groupTreasuryBnb(dependencies, chatId, fromId);
          const list = await dependencies.watchlistService.getList(Number(chatId), treasuryBnb);
          const entry = list.find((e) => e.candidate.tokenAddress.toLowerCase() === tokenAddress.toLowerCase());
          if (entry === undefined) {
            await ctx.editMessageText("That token rolled off the list — run /nancy again.");
            return;
          }
          const languages = normalizeLanguages((await dependencies.repository.getGroupLanguages(chatId)) ?? []);
          const explanation = await dependencies.explanationService.explain(entry, languages, {
            source: "watchlist_detail",
            telegramUserId: fromId,
            chatId
          });
          const [voiceFlag, videoFlag] = await Promise.all([
            dependencies.platformSettings.isVoiceEnabled(),
            dependencies.platformSettings.isVideoEnabled()
          ]);
          const voiceAvailable = dependencies.voiceService !== undefined && voiceFlag;
          const videoAvailable = voiceAvailable && dependencies.voiceVideoService !== undefined && videoFlag;
          await ctx.editMessageText(formatWatchlistEntry(entry, explanation), {
            parse_mode: "Markdown",
            reply_markup: nancyDetailKeyboard(entry.candidate.tokenAddress, entry.gate === "pass", voiceAvailable, videoAvailable)
          });
        } catch (error) {
          Logger.error("[TelegramBot] nancy_detail render failed", { err: error instanceof Error ? error : undefined });
          try {
            await ctx.editMessageText("Couldn't load that token right now — tap it again in a moment.");
          } catch {
            // editing the placeholder failed too; nothing more we can do
          }
        }
      })();
    });
  });

  bot.callbackQuery(/^nancy_lang:(.+)$/, async (ctx) => {
    await handleCallback(ctx, async () => {
      const chatId = requireChatId(ctx.chat?.id);
      await requireGroupAdmin(ctx, chatId);
      const code = String(ctx.match[1] ?? "");
      const current = normalizeLanguages((await dependencies.repository.getGroupLanguages(chatId)) ?? []);
      const next = current.includes(code) ? current.filter((c) => c !== code) : [...current, code];
      const normalized = normalizeLanguages(next);
      await dependencies.repository.setGroupLanguages(chatId, normalized);
      await ctx.answerCallbackQuery();
      await ctx.editMessageReplyMarkup({ reply_markup: nancyLangKeyboard(normalized) });
    });
  });

  bot.callbackQuery(/^nancy_buy:(.+)$/, async (ctx) => {
    await handleCallback(ctx, async () => {
      const tokenAddress = String(ctx.match[1] ?? "");
      await ctx.answerCallbackQuery();
      await ctx.reply(
        `To trade this, a trader runs:\n\`/buy ${tokenAddress} <bnbAmount>\`\n\nNancy re-checks risk, builds the Safe transaction, and the owners sign — she never moves funds herself.`,
        { parse_mode: "Markdown" }
      );
    });
  });

  bot.callbackQuery(/^nancy_voice:(.+)$/, async (ctx) => {
    await handleCallback(ctx, async () => {
      const chatId = requireChatId(ctx.chat?.id);
      const fromId = requireTelegramUserId(ctx.from?.id);
      const tokenAddress = String(ctx.match[1] ?? "");
      if (dependencies.voiceService === undefined || !(await dependencies.platformSettings.isVoiceEnabled())) {
        await ctx.answerCallbackQuery({ text: "Voice isn't enabled.", show_alert: true });
        return;
      }
      await ctx.answerCallbackQuery({ text: "🔊 Recording Nancy's take…" });
      void (async () => {
        try {
          const take = await nancySpokenTake(dependencies, chatId, fromId, tokenAddress);
          if (!take.ok) {
            if (take.reason === "synth") await ctx.reply("Couldn't record that one — try again in a moment.");
            return;
          }
          const { entry, voiceLang, primary } = take;
          const symbol = entry.candidate.tokenSymbol;
          await ctx.replyWithVoice(new InputFile(take.audio, "nancy.ogg"), {
            caption:
              voiceLang === primary
                ? `🔊 Nancy on ${symbol}`
                : `🔊 Nancy on ${symbol} (English voice — no ${primary} voice yet)`,
            // Re-open the options under the voice note so the user can act once she's done speaking.
            reply_markup: nancyDetailKeyboard(
              entry.candidate.tokenAddress,
              entry.gate === "pass",
              true,
              dependencies.voiceVideoService !== undefined && (await dependencies.platformSettings.isVideoEnabled())
            )
          });
        } catch (error) {
          Logger.error("[TelegramBot] nancy_voice failed", { err: error instanceof Error ? error : undefined });
        }
      })();
    });
  });

  bot.callbackQuery(/^nancy_video:(.+)$/, async (ctx) => {
    await handleCallback(ctx, async () => {
      const chatId = requireChatId(ctx.chat?.id);
      const fromId = requireTelegramUserId(ctx.from?.id);
      const tokenAddress = String(ctx.match[1] ?? "");
      if (
        dependencies.voiceService === undefined ||
        dependencies.voiceVideoService === undefined ||
        !(await dependencies.platformSettings.isVideoEnabled())
      ) {
        await ctx.answerCallbackQuery({ text: "Video isn't enabled.", show_alert: true });
        return;
      }
      await ctx.answerCallbackQuery({ text: "🎬 Filming Nancy's take…" });
      void (async () => {
        try {
          const take = await nancySpokenTake(dependencies, chatId, fromId, tokenAddress);
          if (!take.ok) {
            if (take.reason === "synth") await ctx.reply("Couldn't film that one — try again in a moment.");
            return;
          }
          const video = await dependencies.voiceVideoService!.render(take.audio);
          if (video === null) {
            await ctx.reply("Couldn't film that one — try again in a moment.");
            return;
          }
          const { entry, voiceLang, primary } = take;
          const symbol = entry.candidate.tokenSymbol;
          await ctx.replyWithVideo(new InputFile(video, "nancy.mp4"), {
            caption:
              voiceLang === primary
                ? `🎬 Nancy on ${symbol}`
                : `🎬 Nancy on ${symbol} (English voice — no ${primary} voice yet)`,
            reply_markup: nancyDetailKeyboard(entry.candidate.tokenAddress, entry.gate === "pass", true, true)
          });
        } catch (error) {
          Logger.error("[TelegramBot] nancy_video failed", { err: error instanceof Error ? error : undefined });
        }
      })();
    });
  });

  bot.callbackQuery(/^help:/, async (ctx) => {
    await handleCallback(ctx, async () => {
      const data = ctx.callbackQuery.data;
      await ctx.answerCallbackQuery();
      await ctx.reply(helpText(data.slice("help:".length)));
    });
  });

  registerSafeCallbacks(bot, dependencies);
  registerPoolCommands(bot, dependencies);
  registerPlatformCommands(bot, { config: dependencies.config, platformSettings: dependencies.platformSettings });

  bot.callbackQuery("prompt_back", async (ctx) => {
    await handlePromptBack(dependencies, ctx);
  });

  bot.callbackQuery("prompt_cancel", async (ctx) => {
    await handlePromptCancel(dependencies, ctx);
  });

  bot.callbackQuery(/^choice:/, async (ctx) => {
    await handlePromptChoice(dependencies, ctx);
  });

  bot.callbackQuery(/^menu:/, async (ctx) => {
    await ctx.answerCallbackQuery();
    try {
      await handleMenuSelection(dependencies, ctx, ctx.callbackQuery.data.slice("menu:".length));
    } catch (error) {
      if (error instanceof UserInputError || error instanceof AppError) {
        await ctx.reply(error.message);
        return;
      }
      Logger.error("[TelegramBot] Menu action failed", { err: error instanceof Error ? error : undefined });
      await ctx.reply("Something went wrong. Please try again.");
    }
  });

  bot.on("message:text", async (ctx) => {
    await routePromptInput(dependencies, ctx);
  });

  bot.on("callback_query:data", async (ctx) => {
    await ctx.answerCallbackQuery();
  });

  bot.catch((error) => {
    Logger.error("[TelegramBot] Unhandled bot error", { err: error.error instanceof Error ? error.error : undefined });
  });

  return bot;
}

type SpokenTake =
  | { ok: true; entry: WatchlistEntry; audio: Buffer; voiceLang: string; primary: string }
  | { ok: false; reason: "gone" | "synth" };

// Shared by the "🔊 Hear it" and "🎬 Watch it" buttons: resolve the watchlist
// entry, render Nancy's take in the group's language, and synthesize it to audio.
// Kokoro can't speak every language, so an unsupported primary falls back to an
// English voice (the written take stays in the group's language). Returns "gone"
// if the token rolled off the list (callers stay silent) or "synth" if voice
// failed (callers tell the user to retry).
async function nancySpokenTake(
  deps: BotDependencies,
  chatId: string,
  fromId: string,
  tokenAddress: string
): Promise<SpokenTake> {
  const languages = normalizeLanguages((await deps.repository.getGroupLanguages(chatId)) ?? []);
  const primary = languages[0] ?? "en";
  const voiceLang = voiceSupported(primary) ? primary : "en";
  const treasuryBnb = await groupTreasuryBnb(deps, chatId, fromId);
  const list = await deps.watchlistService.getList(Number(chatId), treasuryBnb);
  const entry = list.find((e) => e.candidate.tokenAddress.toLowerCase() === tokenAddress.toLowerCase());
  if (entry === undefined) return { ok: false, reason: "gone" };
  const take = await deps.explanationService.explain(entry, [voiceLang], {
    source: "watchlist_voice",
    telegramUserId: fromId,
    chatId
  });
  const spoken = take.replace(/[*_`\[\]#]/g, "");
  const audio = deps.voiceService === undefined ? null : await deps.voiceService.synthesize(spoken, voiceLang);
  if (audio === null) return { ok: false, reason: "synth" };
  return { ok: true, entry, audio, voiceLang, primary };
}

async function groupTreasuryBnb(deps: BotDependencies, chatId: string, fromId: string): Promise<number | undefined> {
  try {
    const analytics = await deps.poolService.getAnalytics(chatId, fromId);
    return Number(analytics.liquidWei) / 1e18;
  } catch {
    return undefined; // no pool yet or caller not a member -> use the default notional size
  }
}

async function handleCallback(ctx: Context, action: () => Promise<void>): Promise<void> {
  try {
    await action();
  } catch (error) {
    if (error instanceof UserInputError || error instanceof AppError) {
      await ctx.answerCallbackQuery({ text: error.message, show_alert: true });
      return;
    }
    Logger.error("[TelegramBot] Callback failed", { err: error instanceof Error ? error : undefined });
    await ctx.answerCallbackQuery({ text: "Action failed", show_alert: true });
  }
}

// Normalises an update into a usage label: a slash command (without args/@bot) or a menu tap.
function usageLabel(ctx: Context): string | null {
  const text = ctx.message?.text;
  if (text !== undefined && text.startsWith("/")) {
    return text.slice(1).split(/\s+/)[0]?.split("@")[0] ?? null;
  }
  const data = ctx.callbackQuery?.data;
  if (data !== undefined && data.startsWith("menu:")) {
    return `menu:${data.slice("menu:".length)}`;
  }
  return null;
}
