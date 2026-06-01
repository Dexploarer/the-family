import type { InlineKeyboard } from "grammy";
import type { Address } from "viem";
import { InvalidInputError, UserInputError } from "../domain/errors.js";
import type { PendingPrompt, PoolRole } from "../domain/types.js";
import {
  parseAddress,
  parseBasisPoints,
  parseBnbAmount,
  parseNonNegativeBnbAmount,
  parseTransactionHash
} from "../utils/evm.js";
import { parsePositiveInteger } from "./commandUtils.js";
import { createFlapSalt, parseVaultRecipients } from "../chain/flapService.js";
import { formatFlapLaunch, formatSafeCreationSession, formatSafeStatus, formatSafeSubmission, formatTradeProposal } from "./formatters.js";
import { formatPoolAnalytics, formatWithdrawalRequest } from "./poolCommands.js";
import { executePageKeyboard, flapLaunchKeyboard, linkPageKeyboard, safeGroupKeyboard, safeSubmissionKeyboard, tradeProposalKeyboard, withdrawalKeyboard } from "./keyboards.js";
import type { BotDependencies } from "./bot.js";

export type PromptReply = (text: string, keyboard?: InlineKeyboard) => Promise<void>;

export type PromptContext = {
  deps: BotDependencies;
  chatId: string;
  telegramUserId: string;
  reply: PromptReply;
  requireAdmin: () => Promise<void>;
  // Resolves a member's @username live from Telegram (no persistence); null if none.
  usernameFor: (userId: string) => Promise<string | null>;
};

export type PromptChoice = { label: string; value: string };

export type PromptField = {
  label: string;
  example: string;
  validate: (value: string) => void;
  // Optional one-tap shortcuts. Typing a custom value still works.
  choices?: PromptChoice[] | ((context: PromptContext) => Promise<PromptChoice[]>);
};

export type PromptFlow = {
  command: string;
  title: string;
  adminOnly: boolean;
  fields: PromptField[];
  execute: (context: PromptContext, values: string[]) => Promise<void>;
};

// --- Pure state helpers (unit-tested without grammy) ---

export function newPrompt(chatId: string, telegramUserId: string, command: string): PendingPrompt {
  const now = new Date();
  return { chatId, telegramUserId, command, collected: [], createdAt: now, updatedAt: now };
}

export function nextField(flow: PromptFlow, prompt: PendingPrompt): PromptField | undefined {
  return flow.fields[prompt.collected.length];
}

export function isComplete(flow: PromptFlow, prompt: PendingPrompt): boolean {
  return prompt.collected.length >= flow.fields.length;
}

export function withInput(prompt: PendingPrompt, value: string): PendingPrompt {
  return { ...prompt, collected: [...prompt.collected, value], updatedAt: new Date() };
}

export function withoutLast(prompt: PendingPrompt): PendingPrompt {
  return { ...prompt, collected: prompt.collected.slice(0, -1), updatedAt: new Date() };
}

export function getFlow(command: string): PromptFlow | undefined {
  return PROMPT_FLOWS[command];
}

function required(values: string[], index: number): string {
  const value = values[index];
  if (value === undefined) {
    throw new UserInputError("Missing collected prompt value", { index });
  }
  return value;
}

function validateRole(value: string): void {
  if (value !== "owner" && value !== "trader" && value !== "member") {
    throw new InvalidInputError("Role must be owner, trader, or member.", { value });
  }
}

function validateSafeSource(value: string): void {
  if (value !== "trade" && value !== "flap" && value !== "withdrawal") {
    throw new InvalidInputError("Source must be trade, flap, or withdrawal.", { value });
  }
}

function validateNonEmpty(label: string): (value: string) => void {
  return (value: string) => {
    if (value.trim().length === 0) {
      throw new InvalidInputError(`${label} cannot be empty.`);
    }
  };
}

async function allowedSenders(deps: BotDependencies, telegramUserId: string): Promise<Address[]> {
  const linked = await deps.walletLinkService.getLinkedWallets(telegramUserId);
  return linked.map((wallet) => wallet.address);
}

export const PROMPT_FLOWS: Record<string, PromptFlow> = {
  link_start: {
    command: "link_start",
    title: "Link an existing wallet",
    adminOnly: false,
    fields: [{ label: "Wallet address to link", example: "0x1111111111111111111111111111111111111111", validate: (v) => void parseAddress(v) }],
    execute: async (c, values) => {
      const address = parseAddress(required(values, 0));
      const result = await c.deps.walletLinkService.beginLink(c.telegramUserId, address);
      await c.reply(
        ["Tap below, connect this wallet, and sign.", "", "Manual fallback: /link_submit <ownerAddress> <signature>", result.message].join("\n"),
        linkPageKeyboard(result.link.nonce, c.deps.config.publicBaseUrl, false)
      );
    }
  },
  safe_group: {
    command: "safe_group",
    title: "Create a group Safe",
    adminOnly: true,
    fields: [
      {
        label: "Signature threshold (how many owners must approve)",
        example: "2",
        validate: (v) => void parsePositiveInteger(v, "threshold"),
        choices: [
          { label: "1 (solo)", value: "1" },
          { label: "2", value: "2" },
          { label: "3", value: "3" }
        ]
      }
    ],
    execute: async (c, values) => {
      await c.requireAdmin();
      const threshold = parsePositiveInteger(required(values, 0), "threshold");
      const session = await c.deps.safeGroupSetupService.createSession(c.chatId, c.telegramUserId, threshold);
      await c.reply(formatSafeCreationSession(session), safeGroupKeyboard(session));
    }
  },
  buy: {
    command: "buy",
    title: "Create a token buy proposal",
    adminOnly: false,
    fields: [
      { label: "Token address", example: "0x7777777777777777777777777777777777777777", validate: (v) => void parseAddress(v) },
      {
        label: "BNB amount to spend",
        example: "0.25",
        validate: (v) => void parseBnbAmount(v),
        choices: [
          { label: "0.05", value: "0.05" },
          { label: "0.1", value: "0.1" },
          { label: "0.25", value: "0.25" }
        ]
      }
    ],
    execute: async (c, values) => {
      await c.deps.poolService.requireTraderAccess(c.chatId, c.telegramUserId);
      const proposal = await c.deps.tradeService.createNativeBuyProposal({
        chatId: c.chatId,
        proposerTelegramId: c.telegramUserId,
        tokenAddress: parseAddress(required(values, 0)),
        inputAmountWei: parseBnbAmount(required(values, 1)),
        slippageBps: 150,
        tradeFeeBps: c.deps.config.tradeFeeBps,
        feeRecipient: c.deps.config.platformFeeRecipient,
        dexDeadlineSeconds: c.deps.config.dexDeadlineSeconds
      });
      await c.reply(formatTradeProposal(proposal), tradeProposalKeyboard(proposal.id));
    }
  },
  pool_role: {
    command: "pool_role",
    title: "Assign a pool role",
    adminOnly: false,
    fields: [
      {
        label: "Member's numeric Telegram user ID",
        example: "123456789",
        validate: (v) => void parsePositiveInteger(v, "telegramUserId"),
        choices: async (c) =>
          Promise.all(
            (await c.deps.poolService.listMembers(c.chatId)).map(async (member) => {
              const username = await c.usernameFor(member.telegramUserId);
              return {
                label: username === null ? `${member.role}: ${member.telegramUserId}` : `@${username} (${member.role})`,
                value: member.telegramUserId
              };
            })
          )
      },
      {
        label: "Role: owner, trader, or member",
        example: "trader",
        validate: validateRole,
        choices: [
          { label: "Owner", value: "owner" },
          { label: "Trader", value: "trader" },
          { label: "Member", value: "member" }
        ]
      }
    ],
    execute: async (c, values) => {
      const member = await c.deps.poolService.setRole({
        chatId: c.chatId,
        operatorTelegramId: c.telegramUserId,
        targetTelegramId: required(values, 0),
        role: required(values, 1) as PoolRole
      });
      await c.reply(`Pool role set: ${member.telegramUserId} is ${member.role}`);
    }
  },
  pool_nav: {
    command: "pool_nav",
    title: "Update pool NAV snapshot",
    adminOnly: false,
    fields: [
      {
        label: "Open positions value in BNB (liquid is read from the Safe automatically)",
        example: "0.5",
        validate: (v) => void parseNonNegativeBnbAmount(v),
        choices: [{ label: "0 (all liquid)", value: "0" }]
      }
    ],
    execute: async (c, values) => {
      const positionsWei = parseNonNegativeBnbAmount(required(values, 0));
      const wallet = await c.deps.groupWalletService.getWallet(c.chatId);
      if (wallet === null) {
        throw new UserInputError("This group has no Safe yet. Create one first.");
      }
      // Liquid is the Safe's live BNB balance — no need to type it.
      const liquidWei = await c.deps.safeDeploymentService.getNativeBalanceWei(wallet.safeAddress);
      const analytics = await c.deps.poolService.updateNav({
        chatId: c.chatId,
        operatorTelegramId: c.telegramUserId,
        navWei: liquidWei + positionsWei,
        liquidWei,
        positionsWei
      });
      await c.reply(formatPoolAnalytics(analytics));
    }
  },
  pool_deposit: {
    command: "pool_deposit",
    title: "Credit a BNB deposit",
    adminOnly: false,
    fields: [
      { label: "Transaction hash of your BNB transfer to the Safe", example: "0x<64 hex>", validate: (v) => void parseTransactionHash(v) }
    ],
    execute: async (c, values) => {
      const transactionHash = parseTransactionHash(required(values, 0));
      const wallet = await c.deps.groupWalletService.getWallet(c.chatId);
      if (wallet === null) {
        throw new UserInputError("This group has no Safe yet. Create one with /safe_group <threshold> first.");
      }
      // No amount typed: the verified on-chain transfer value is what gets credited.
      const verified = await c.deps.depositVerificationService.verifyNativeDeposit({
        transactionHash,
        safeAddress: wallet.safeAddress,
        allowedSenders: await allowedSenders(c.deps, c.telegramUserId)
      });
      const analytics = await c.deps.poolService.creditDeposit({
        chatId: c.chatId,
        telegramUserId: c.telegramUserId,
        amountWei: verified.amountWei,
        transactionHash
      });
      await c.reply(formatPoolAnalytics(analytics));
    }
  },
  pool_withdraw: {
    command: "pool_withdraw",
    title: "Request a pool withdrawal",
    adminOnly: false,
    fields: [
      {
        label: "How much to withdraw",
        example: "5000",
        validate: (v) => void parseBasisPoints(v, 10000),
        choices: [
          { label: "25%", value: "2500" },
          { label: "50%", value: "5000" },
          { label: "100%", value: "10000" }
        ]
      },
      {
        label: "Recipient address (must be a wallet you linked)",
        example: "0x1111111111111111111111111111111111111111",
        validate: (v) => void parseAddress(v),
        choices: async (c) =>
          (await c.deps.walletLinkService.getLinkedWallets(c.telegramUserId)).map((wallet) => ({
            label: `${wallet.address.slice(0, 6)}…${wallet.address.slice(-4)}`,
            value: wallet.address
          }))
      }
    ],
    execute: async (c, values) => {
      const withdrawalBps = parseBasisPoints(required(values, 0), 10000);
      const recipientAddress = parseAddress(required(values, 1));
      const senders = await allowedSenders(c.deps, c.telegramUserId);
      if (!senders.some((address) => address.toLowerCase() === recipientAddress.toLowerCase())) {
        throw new UserInputError("Withdrawal recipient must be a wallet linked to your Telegram account");
      }
      const request = await c.deps.poolService.requestWithdrawal({
        chatId: c.chatId,
        telegramUserId: c.telegramUserId,
        recipientAddress,
        withdrawalBps
      });
      await c.reply(formatWithdrawalRequest(request), withdrawalKeyboard(request.id));
    }
  },
  pool_cancel: {
    command: "pool_cancel",
    title: "Cancel a queued withdrawal",
    adminOnly: false,
    fields: [
      {
        label: "Withdrawal request ID to cancel",
        example: "wd_abc123",
        validate: (v) => {
          if (v.trim().length === 0) {
            throw new InvalidInputError("Enter the withdrawal request ID (from /pool or the request reply).");
          }
        },
        choices: async (c) =>
          (await c.deps.poolService.listQueuedWithdrawals(c.chatId)).map((request) => ({
            label: `${request.recipientAddress.slice(0, 6)}… (${request.id.slice(-4)})`,
            value: request.id
          }))
      }
    ],
    execute: async (c, values) => {
      const request = await c.deps.poolService.cancelWithdrawal(c.chatId, required(values, 0), c.telegramUserId);
      await c.reply(`Withdrawal ${request.id} cancelled. Your ${request.shares.toString()} shares were restored.`);
    }
  },
  proposal: {
    command: "proposal",
    title: "Show a trade proposal",
    adminOnly: false,
    fields: [{ label: "Proposal ID", example: "trade_abc123", validate: validateNonEmpty("Proposal ID") }],
    execute: async (c, values) => {
      const proposal = await c.deps.tradeService.getProposal(required(values, 0));
      if (proposal === null) {
        throw new UserInputError("Proposal not found.");
      }
      await c.reply(formatTradeProposal(proposal), tradeProposalKeyboard(proposal.id));
    }
  },
  safe_prepare: {
    command: "safe_prepare",
    title: "Prepare a Safe transaction",
    adminOnly: false,
    fields: [
      { label: "Source: trade, flap, or withdrawal", example: "trade", validate: validateSafeSource },
      { label: "Source ID (the proposal/launch/withdrawal ID)", example: "trade_abc123", validate: validateNonEmpty("Source ID") }
    ],
    execute: async (c, values) => {
      const source = required(values, 0);
      const sourceId = required(values, 1);
      const submission =
        source === "trade"
          ? await c.deps.safeSubmissionService.prepareTradeSubmission(c.chatId, sourceId, c.telegramUserId)
          : source === "flap"
            ? await c.deps.safeSubmissionService.prepareFlapLaunchSubmission(c.chatId, sourceId, c.telegramUserId)
            : await c.deps.safeSubmissionService.prepareWithdrawalSubmission(c.chatId, sourceId, c.telegramUserId);
      await c.reply(formatSafeSubmission(submission), safeSubmissionKeyboard(submission.id, c.deps.config.publicBaseUrl, false));
    }
  },
  safe_status: {
    command: "safe_status",
    title: "Show Safe transaction status",
    adminOnly: false,
    fields: [{ label: "Safe submission ID", example: "safe_abc123", validate: validateNonEmpty("Submission ID") }],
    execute: async (c, values) => {
      const status = await c.deps.safeSubmissionService.getStatus(required(values, 0));
      await c.reply(formatSafeStatus(status));
    }
  },
  safe_execute: {
    command: "safe_execute",
    title: "Execute a ready Safe transaction",
    adminOnly: true,
    fields: [{ label: "Safe submission ID", example: "safe_abc123", validate: validateNonEmpty("Submission ID") }],
    execute: async (c, values) => {
      const submissionId = required(values, 0);
      await c.reply(
        "Enough owners signed? Execute from your own wallet — you pay the gas, the bot holds no key.",
        executePageKeyboard(submissionId, c.deps.config.publicBaseUrl, false)
      );
    }
  },
  flap_metadata: {
    command: "flap_metadata",
    title: "Upload Flap token metadata",
    adminOnly: true,
    fields: [
      { label: "Token name", example: "BNancy Coin", validate: validateNonEmpty("Name") },
      { label: "Token symbol", example: "BNANCY", validate: validateNonEmpty("Symbol") },
      { label: "Description", example: "Group token launched through Flap", validate: validateNonEmpty("Description") },
      { label: "Image URI", example: "ipfs://bafy-image...", validate: validateNonEmpty("Image URI") }
    ],
    execute: async (c, values) => {
      await c.requireAdmin();
      const metadataUri = await c.deps.flapMetadataService.createMetadata({
        name: required(values, 0),
        symbol: required(values, 1),
        description: required(values, 2),
        imageUri: required(values, 3)
      });
      await c.reply(`Flap metadata uploaded: ${metadataUri}`);
    }
  },
  flap_launch: {
    command: "flap_launch",
    title: "Create a Flap launch proposal",
    adminOnly: true,
    fields: [
      { label: "Token name", example: "BNancy Coin", validate: validateNonEmpty("Name") },
      { label: "Token symbol", example: "BNANCY", validate: validateNonEmpty("Symbol") },
      { label: "Metadata URI", example: "ipfs://bafy...", validate: validateNonEmpty("Metadata URI") },
      { label: "Buy tax (bps, 100 = 1%)", example: "200", validate: (v) => void parseBasisPoints(v, 5000) },
      { label: "Sell tax (bps, 100 = 1%)", example: "200", validate: (v) => void parseBasisPoints(v, 5000) },
      { label: "Tax duration in days", example: "30", validate: (v) => void parsePositiveInteger(v, "taxDays") },
      { label: "Vault recipients (address:bps,address:bps — must sum to 10000)", example: "0xRecipient...:10000", validate: (v) => void parseVaultRecipients(v) },
      { label: "Initial buy in BNB", example: "0.1", validate: (v) => void parseBnbAmount(v) }
    ],
    execute: async (c, values) => {
      await c.requireAdmin();
      const proposal = await c.deps.flapLaunchService.createLaunchProposal({
        chatId: c.chatId,
        proposerTelegramId: c.telegramUserId,
        name: required(values, 0),
        symbol: required(values, 1),
        metadataUri: required(values, 2),
        buyTaxBps: parseBasisPoints(required(values, 3), 5000),
        sellTaxBps: parseBasisPoints(required(values, 4), 5000),
        taxDurationSeconds: parsePositiveInteger(required(values, 5), "taxDays") * 24 * 60 * 60,
        recipients: parseVaultRecipients(required(values, 6)),
        initialBuyWei: parseBnbAmount(required(values, 7)),
        salt: createFlapSalt(),
        commissionReceiver: c.deps.config.platformCommissionReceiver
      });
      await c.reply(formatFlapLaunch(proposal), flapLaunchKeyboard(proposal.id));
    }
  }
};
