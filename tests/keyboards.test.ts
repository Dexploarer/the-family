import { describe, expect, it } from "bun:test";
import {
  connectWalletKeyboard,
  dmActionKeyboard,
  deployPageKeyboard,
  executePageKeyboard,
  flapLaunchKeyboard,
  linkPageKeyboard,
  bnancyDetailKeyboard,
  poolAppKeyboard,
  safeGroupKeyboard,
  safeSubmissionKeyboard,
  tradeProposalKeyboard,
  withdrawalKeyboard
} from "../src/bot/keyboards.js";

type Btn = { text: string; url?: string; web_app?: { url: string } };
function buttons(kb: { inline_keyboard: Btn[][] }): Btn[] {
  return kb.inline_keyboard.flat();
}

describe("safeGroupKeyboard", () => {
  it("shows deploy only when enough owners joined", () => {
    const keyboard = safeGroupKeyboard({
      id: "setup_123",
      chatId: "chat",
      creatorTelegramId: "admin",
      threshold: 1,
      owners: [
        {
          telegramUserId: "111",
          address: "0x1111111111111111111111111111111111111111",
          joinedAt: new Date("2026-05-27T00:00:00.000Z")
        }
      ],
      status: "collecting",
      createdAt: new Date("2026-05-27T00:00:00.000Z")
    });

    expect(JSON.stringify(keyboard.inline_keyboard)).toContain("safe_deploy:setup_123");
  });
});

describe("poolAppKeyboard", () => {
  it("opens the Telegram mini app analytics route", () => {
    const keyboard = poolAppKeyboard("-100123", "http://localhost:3000");

    expect(JSON.stringify(keyboard.inline_keyboard)).toContain("http://localhost:3000/pool/-100123");
  });
});

describe("page-open keyboards", () => {
  it("uses a WebApp button in private chats", () => {
    const b = buttons(linkPageKeyboard("abc", "https://x.test", true))[0]!;
    expect(b.web_app?.url).toBe("https://x.test/link/abc");
    expect(b.url).toBeUndefined();
  });

  it("uses a URL button in group chats", () => {
    const b = buttons(linkPageKeyboard("abc", "https://x.test", false))[0]!;
    expect(b.url).toBe("https://x.test/link/abc");
    expect(b.web_app).toBeUndefined();
  });

  it("builds a signing button from the submission id", () => {
    const b = buttons(safeSubmissionKeyboard("safe_1", "https://x.test", true))[0]!;
    expect(b.web_app?.url).toBe("https://x.test/sign/safe_1");
  });

  it("connect-wallet button opens the connect-first link page as a WebApp", () => {
    const b = buttons(connectWalletKeyboard("https://x.test"))[0]!;
    expect(b.web_app?.url).toBe("https://x.test/link");
  });

  it("group fallback deep-links into the bot DM carrying the start action", () => {
    const b = buttons(dmActionKeyboard("bnancy_bsc_bot", "link", "Link in our DM →"))[0]!;
    expect(b.url).toBe("https://t.me/bnancy_bsc_bot?start=link");
    expect(b.text).toBe("Link in our DM →");
  });

  it("deploy button points at the deploy page for the session", () => {
    const b = buttons(deployPageKeyboard("setup_1", "https://x.test", false))[0]!;
    expect(b.url).toBe("https://x.test/deploy/setup_1");
  });

  it("execute button points at the execute page for the submission", () => {
    const b = buttons(executePageKeyboard("safe_1", "https://x.test", false))[0]!;
    expect(b.url).toBe("https://x.test/execute/safe_1");
  });
});

describe("result action keyboards (no ID typing)", () => {
  function data(kb: { inline_keyboard: { text: string; callback_data?: string }[][] }): string[] {
    return kb.inline_keyboard.flat().map((b) => b.callback_data ?? "");
  }

  it("trade proposal offers Prepare Safe tx carrying the id", () => {
    expect(data(tradeProposalKeyboard("trade_1"))).toContain("prepare:trade:trade_1");
  });

  it("flap launch offers Prepare Safe tx carrying the id", () => {
    expect(data(flapLaunchKeyboard("flap_1"))).toContain("prepare:flap:flap_1");
  });

  it("withdrawal offers Prepare and Cancel carrying the id", () => {
    const d = data(withdrawalKeyboard("wd_1"));
    expect(d).toContain("prepare:withdrawal:wd_1");
    expect(d).toContain("wd_cancel:wd_1");
  });

  it("safe submission offers status + execute alongside the sign button", () => {
    const d = data(safeSubmissionKeyboard("safe_1", "https://x.test", false));
    expect(d).toContain("safe_status:safe_1");
    expect(d).toContain("safe_execute:safe_1");
  });

  it("bnancy detail offers Watch it only when video is available", () => {
    expect(data(bnancyDetailKeyboard("0xabc", false, true, true))).toContain("bnancy_video:0xabc");
    expect(data(bnancyDetailKeyboard("0xabc", false, true, false))).not.toContain("bnancy_video:0xabc");
  });
});
