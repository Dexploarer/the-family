import { describe, expect, it } from "bun:test";
import type { Context } from "grammy";
import type { BotDependencies } from "../src/bot/bot.js";
import {
  handlePromptCancel,
  handlePromptChoice,
  routePromptInput
} from "../src/bot/promptController.js";
import {
  getFlow,
  isComplete,
  newPrompt,
  nextField,
  PROMPT_FLOWS,
  withInput,
  withoutLast
} from "../src/bot/prompts.js";
import { WalletLinkService } from "../src/services/walletLinkService.js";
import { MemoryRepository } from "../src/storage/memoryRepository.js";

const CHAT = "555";
const USER = "111";

function fakeContext(text: string): { ctx: Context; replies: string[]; markups: unknown[] } {
  const replies: string[] = [];
  const markups: unknown[] = [];
  const ctx = {
    message: { text },
    chat: { id: 555, type: "group" },
    from: { id: 111 },
    reply: async (value: string, other?: { reply_markup?: unknown }) => {
      replies.push(value);
      markups.push(other?.reply_markup);
    },
    answerCallbackQuery: async () => {}
  } as unknown as Context;
  return { ctx, replies, markups };
}

function fakeCallbackContext(data: string): { ctx: Context; replies: string[] } {
  const replies: string[] = [];
  const ctx = {
    chat: { id: 555, type: "group" },
    from: { id: 111 },
    callbackQuery: { data },
    reply: async (value: string) => {
      replies.push(value);
    },
    answerCallbackQuery: async () => {}
  } as unknown as Context;
  return { ctx, replies };
}

describe("prompt state helpers", () => {
  it("progresses through fields and detects completion", () => {
    const flow = PROMPT_FLOWS["pool_role"]!;
    let prompt = newPrompt(CHAT, USER, "pool_role");
    expect(nextField(flow, prompt)?.label).toContain("Telegram user ID");
    expect(isComplete(flow, prompt)).toBe(false);

    prompt = withInput(prompt, "222");
    expect(nextField(flow, prompt)?.label).toContain("Role");
    expect(isComplete(flow, prompt)).toBe(false);

    prompt = withInput(prompt, "trader");
    expect(isComplete(flow, prompt)).toBe(true);

    prompt = withoutLast(prompt);
    expect(prompt.collected).toEqual(["222"]);
    expect(isComplete(flow, prompt)).toBe(false);
  });

  it("defines a runnable flow for each registered command", () => {
    for (const [command, flow] of Object.entries(PROMPT_FLOWS)) {
      expect(flow.command).toBe(command);
      expect(flow.fields.length).toBeGreaterThan(0);
      for (const field of flow.fields) {
        expect(typeof field.validate).toBe("function");
      }
      expect(typeof flow.execute).toBe("function");
    }
  });
});

describe("routePromptInput", () => {
  it("ignores slash commands and inactive users", async () => {
    const repository = new MemoryRepository();
    const deps = { repository } as unknown as BotDependencies;

    const slash = fakeContext("/buy 0x 1");
    expect(await routePromptInput(deps, slash.ctx)).toBe(false);

    const idle = fakeContext("just chatting");
    expect(await routePromptInput(deps, idle.ctx)).toBe(false);
  });

  it("re-asks the same field when input is invalid", async () => {
    const repository = new MemoryRepository();
    await repository.savePendingPrompt(newPrompt(CHAT, USER, "link_start"));
    const deps = { repository } as unknown as BotDependencies;

    const { ctx, replies } = fakeContext("not-an-address");
    const handled = await routePromptInput(deps, ctx);

    expect(handled).toBe(true);
    expect(replies[0]).toContain("valid EVM address");
    // prompt stays active so the user can retry
    expect(await repository.getPendingPrompt(CHAT, USER)).not.toBeNull();
  });

  it("completes a single-field flow and runs its action", async () => {
    const repository = new MemoryRepository();
    const walletLinkService = new WalletLinkService(repository);
    await repository.savePendingPrompt(newPrompt(CHAT, USER, "link_start"));
    const deps = {
      repository,
      walletLinkService,
      config: { publicBaseUrl: "https://bnancy.example" }
    } as unknown as BotDependencies;

    const { ctx, replies, markups } = fakeContext("0x1111111111111111111111111111111111111111");
    const handled = await routePromptInput(deps, ctx);

    expect(handled).toBe(true);
    expect(replies[0]).toContain("connect this wallet");
    // the link URL is now a tappable button, not pasted text
    expect(JSON.stringify(markups[0])).toContain("https://bnancy.example/link/");
    // the flow began a pending wallet link for that exact address
    const link = await repository.getWalletLink(USER, "0x1111111111111111111111111111111111111111");
    expect(link?.status).toBe("pending");
    // the prompt is cleared after completion
    expect(await repository.getPendingPrompt(CHAT, USER)).toBeNull();
  });

  it("offers existing pool members as a picker for the role target (no numeric id typed)", async () => {
    const field = PROMPT_FLOWS["pool_role"]!.fields[0]!;
    const choices =
      typeof field.choices === "function"
        ? await field.choices({
            chatId: CHAT,
            telegramUserId: USER,
            usernameFor: async () => null,
            deps: { poolService: { listMembers: async () => [{ telegramUserId: "222", role: "member" }] } }
          } as never)
        : (field.choices ?? []);
    expect(choices).toEqual([{ label: "member: 222", value: "222" }]);
  });

  it("accepts a tapped choice button as the field value", async () => {
    const repository = new MemoryRepository();
    const calls: Array<{ role: string }> = [];
    const deps = {
      repository,
      poolService: {
        setRole: async (input: { role: string }) => {
          calls.push({ role: input.role });
          return { telegramUserId: "222", role: input.role };
        }
      }
    } as unknown as BotDependencies;
    // already collected the target user id; now on the role field
    await repository.savePendingPrompt(withInput(newPrompt(CHAT, USER, "pool_role"), "222"));

    const { ctx } = fakeCallbackContext("choice:trader");
    await handlePromptChoice(deps, ctx);

    expect(calls[0]?.role).toBe("trader");
    expect(await repository.getPendingPrompt(CHAT, USER)).toBeNull();
  });

  it("advances a multi-field flow then executes with all values", async () => {
    const repository = new MemoryRepository();
    await repository.savePendingPrompt(newPrompt(CHAT, USER, "pool_role"));
    const calls: Array<{ chatId: string; operatorTelegramId: string; targetTelegramId: string; role: string }> = [];
    const deps = {
      repository,
      poolService: {
        setRole: async (input: { chatId: string; operatorTelegramId: string; targetTelegramId: string; role: string }) => {
          calls.push(input);
          return { telegramUserId: input.targetTelegramId, role: input.role };
        }
      }
    } as unknown as BotDependencies;

    const step1 = fakeContext("222");
    expect(await routePromptInput(deps, step1.ctx)).toBe(true);
    expect(step1.replies[0]).toContain("step 2 of 2");

    const step2 = fakeContext("trader");
    expect(await routePromptInput(deps, step2.ctx)).toBe(true);
    expect(step2.replies[0]).toBe("Pool role set: 222 is trader");
    expect(calls).toEqual([{ chatId: CHAT, operatorTelegramId: USER, targetTelegramId: "222", role: "trader" }]);
    expect(await repository.getPendingPrompt(CHAT, USER)).toBeNull();
  });

  it("cancel clears the active prompt", async () => {
    const repository = new MemoryRepository();
    await repository.savePendingPrompt(newPrompt(CHAT, USER, "pool_role"));
    const deps = { repository } as unknown as BotDependencies;

    const { ctx, replies } = fakeContext("");
    await handlePromptCancel(deps, ctx);

    expect(replies[0]).toBe("Cancelled.");
    expect(await repository.getPendingPrompt(CHAT, USER)).toBeNull();
  });
});

describe("getFlow", () => {
  it("returns undefined for commands without a guided flow", () => {
    // wallet_set / safe_create take variadic owners and stay slash-only
    expect(getFlow("wallet_set")).toBeUndefined();
    expect(getFlow("buy")).toBeDefined();
    expect(getFlow("flap_launch")).toBeDefined();
  });
});
