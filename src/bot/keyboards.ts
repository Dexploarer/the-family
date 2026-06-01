import { InlineKeyboard } from "grammy";
import type { SafeCreationSession } from "../domain/types.js";
import { SUPPORTED_LANGUAGES } from "../domain/languages.js";

export function mainMenuKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("Generate wallet", "menu:wallet_generate")
    .text("Link wallet", "menu:link_start")
    .row()
    .text("Create group Safe", "menu:safe_group")
    .text("Show Safe", "menu:wallet")
    .row()
    .text("Init pool", "menu:pool_init")
    .text("Pool analytics", "menu:pool")
    .row()
    .text("My status", "menu:my_status")
    .text("My portfolio", "menu:portfolio")
    .row()
    .text("Deposit", "menu:pool_deposit")
    .text("Withdraw", "menu:pool_withdraw")
    .row()
    .text("Cancel withdrawal", "menu:pool_cancel")
    .text("Unlink Safe", "menu:safe_unlink")
    .row()
    .text("Set role", "menu:pool_role")
    .text("Update NAV", "menu:pool_nav")
    .row()
    .text("Buy token", "menu:buy")
    .text("Launch Flap", "menu:flap_launch")
    .row()
    .text("Flap metadata", "menu:flap_metadata");
}

export function promptStepKeyboard(showBack: boolean, choices: { label: string; value: string }[] = []): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  for (let index = 0; index < choices.length; index += 3) {
    for (const choice of choices.slice(index, index + 3)) {
      keyboard.text(choice.label, `choice:${choice.value}`);
    }
    keyboard.row();
  }
  if (showBack) {
    keyboard.text("Back", "prompt_back");
  }
  keyboard.text("Cancel", "prompt_cancel");
  return keyboard;
}

export function safeGroupKeyboard(session: SafeCreationSession): InlineKeyboard {
  const keyboard = new InlineKeyboard()
    .text("Generate wallet + join", `generate_join:${session.id}`)
    .text("Join linked wallet", `safe_join:${session.id}`)
    .row()
    .text("Refresh", `safe_refresh:${session.id}`);
  if (session.owners.length >= session.threshold && session.status === "collecting") {
    keyboard.row().text("Deploy Safe", `safe_deploy:${session.id}`);
  }
  if (session.status === "collecting") {
    keyboard.row().text("Cancel setup", `safe_cancel:${session.id}`);
  }
  return keyboard;
}

export function confirmUnlinkKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text("Confirm unlink", "safe_unlink_confirm");
}

function baseUrl(publicBaseUrl?: string): string {
  return publicBaseUrl?.replace(/\/$/, "") ?? "http://localhost:3000";
}

// WebApp buttons open inside Telegram (and auto-fill identity via initData) but
// are only allowed in private chats; in groups we fall back to a URL button.
// The /link/<nonce> and /sign/<id> pages carry their own context, so a URL
// button works everywhere.
function pageOpenButton(label: string, url: string, preferWebApp: boolean): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  return preferWebApp ? keyboard.webApp(label, url) : keyboard.url(label, url);
}

export function linkPageKeyboard(nonce: string, publicBaseUrl: string | undefined, preferWebApp: boolean): InlineKeyboard {
  return pageOpenButton("Connect & link wallet", `${baseUrl(publicBaseUrl)}/link/${encodeURIComponent(nonce)}`, preferWebApp);
}

// Connect-first link button (no nonce): opens the page that captures the address
// from the connected wallet. WebApp-only because it needs Telegram initData identity.
export function connectWalletKeyboard(publicBaseUrl: string | undefined): InlineKeyboard {
  return new InlineKeyboard().webApp("Connect & link wallet", `${baseUrl(publicBaseUrl)}/link`);
}

// Group chats can't open WebApp buttons or read Telegram initData, and a private key
// must never be shown in a group — so wallet generate/link bounce the user into the
// bot DM via a t.me deep link that carries the action (e.g. ?start=link). One tap,
// zero typing, and the private flow runs where Telegram allows it.
export function dmActionKeyboard(botUsername: string, startParam: string, label: string): InlineKeyboard {
  return new InlineKeyboard().url(label, `https://t.me/${botUsername}?start=${encodeURIComponent(startParam)}`);
}

export function safeSubmissionKeyboard(submissionId: string, publicBaseUrl: string | undefined, preferWebApp: boolean): InlineKeyboard {
  return pageOpenButton("Open & sign", `${baseUrl(publicBaseUrl)}/sign/${encodeURIComponent(submissionId)}`, preferWebApp)
    .row()
    .text("Check status", `safe_status:${submissionId}`)
    .text("Execute", `safe_execute:${submissionId}`);
}

// P2 action buttons: every result message carries the next step, so nobody copies an ID.
export function tradeProposalKeyboard(proposalId: string): InlineKeyboard {
  return new InlineKeyboard().text("Prepare Safe tx", `prepare:trade:${proposalId}`);
}

export function flapLaunchKeyboard(launchId: string): InlineKeyboard {
  return new InlineKeyboard().text("Prepare Safe tx", `prepare:flap:${launchId}`);
}

export function withdrawalKeyboard(requestId: string): InlineKeyboard {
  return new InlineKeyboard().text("Prepare Safe tx", `prepare:withdrawal:${requestId}`).text("Cancel", `wd_cancel:${requestId}`);
}

// Deploy-from-your-wallet button: opens the page that sends the deploy tx from the
// owner's own wallet (no bot key). The page needs no initData, so a URL button works.
export function deployPageKeyboard(sessionId: string, publicBaseUrl: string | undefined, preferWebApp: boolean): InlineKeyboard {
  return pageOpenButton("Connect & deploy Safe", `${baseUrl(publicBaseUrl)}/deploy/${encodeURIComponent(sessionId)}`, preferWebApp);
}

// Execute-from-your-wallet: opens the page where an owner sends execTransaction themselves.
export function executePageKeyboard(submissionId: string, publicBaseUrl: string | undefined, preferWebApp: boolean): InlineKeyboard {
  return pageOpenButton("Connect & execute", `${baseUrl(publicBaseUrl)}/execute/${encodeURIComponent(submissionId)}`, preferWebApp);
}

export function poolAppKeyboard(chatId: string, publicBaseUrl?: string): InlineKeyboard {
  const url = `${publicBaseUrl?.replace(/\/$/, "") ?? "http://localhost:3000"}/pool/${encodeURIComponent(chatId)}`;
  return new InlineKeyboard().webApp("Open analytics", url).url("Open in browser", url);
}

export function bnancyListKeyboard(entries: { candidate: { tokenSymbol: string; tokenAddress: string } }[]): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  entries.slice(0, 10).forEach((e, i) => {
    keyboard.text(`🔎 ${e.candidate.tokenSymbol}`, `bnancy_detail:${e.candidate.tokenAddress}`);
    if (i % 2 === 1) keyboard.row();
  });
  return keyboard;
}

export function bnancyLangKeyboard(selected: string[]): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  SUPPORTED_LANGUAGES.forEach((l, i) => {
    const on = selected.includes(l.code) ? "✅ " : "";
    keyboard.text(`${on}${l.flag} ${l.label}`, `bnancy_lang:${l.code}`);
    if (i % 3 === 2) keyboard.row();
  });
  return keyboard;
}

export function bnancyDetailKeyboard(
  tokenAddress: string,
  gatePassed: boolean,
  voiceAvailable = false,
  videoAvailable = false
): InlineKeyboard {
  const keyboard = new InlineKeyboard().text("⬅️ Back to list", "bnancy_list");
  if (gatePassed) keyboard.text("Trade this", `bnancy_buy:${tokenAddress}`);
  if (voiceAvailable) keyboard.text("🔊 Hear it", `bnancy_voice:${tokenAddress}`);
  if (videoAvailable) keyboard.text("🎬 Watch it", `bnancy_video:${tokenAddress}`);
  return keyboard;
}

export function helpText(topic: string): string {
  if (topic === "safe_group") {
    return [
      "Group Safe setup",
      "1. Each owner taps Generate + join or links a wallet with /link_start and /link_submit.",
      "2. A group admin runs /safe_group <threshold>.",
      "3. Members join from the inline buttons.",
      "4. A group admin taps Deploy Safe."
    ].join("\n");
  }
  if (topic === "link") {
    return [
      "Wallets",
      "/wallet_generate (DM me — generates a non-custodial wallet, key shown once)",
      "/link_start <ownerAddress>",
      "/link_submit <ownerAddress> <signature>"
    ].join("\n");
  }
  if (topic === "buy") {
    return ["Buy token", "/buy <tokenAddress> <bnbAmount> [slippageBps]", "Example: /buy 0x... 0.05 150"].join("\n");
  }
  if (topic === "flap") {
    return [
      "Flap launch",
      "/flap_metadata is optional when using Pinata.",
      "/flap_launch <name>|<symbol>|<metadataUri>|<buyTaxBps>|<sellTaxBps>|<taxDays>|<recipient:bps,...>|<initialBuyBnb>"
    ].join("\n");
  }
  if (topic === "pool") {
    return [
      "Pool",
      "/pool_init",
      "/pool_nav <navBnb> <liquidBnb> <positionsBnb>",
      "/pool_role <telegramUserId> <owner|trader|member>",
      "/pool_deposit <bnbAmount> <txHash>",
      "/pool_withdraw <basisPoints> <recipientAddress>"
    ].join("\n");
  }
  return "Unknown help topic";
}
