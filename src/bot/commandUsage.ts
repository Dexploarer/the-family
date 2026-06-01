export type CommandUsage = {
  summary: string;
  usage: string;
  example?: string;
  next?: string;
};

export const COMMAND_USAGE: Record<string, CommandUsage> = {
  link_start: {
    summary: "Start linking an external owner wallet to your Telegram account.",
    usage: "/link_start <ownerAddress>",
    example: "/link_start 0x1111111111111111111111111111111111111111",
    next: "BNancy replies with a message to sign. Sign it with that wallet, then run /link_submit."
  },
  link_submit: {
    summary: "Finish linking a wallet by submitting the signature from /link_start.",
    usage: "/link_submit <ownerAddress> <signature>",
    example: "/link_submit 0x1111111111111111111111111111111111111111 0x<signature>",
    next: "Run /link_start <ownerAddress> first to get the message to sign."
  },
  wallet_set: {
    summary: "Link an existing Safe to this group (admin only).",
    usage: "/wallet_set <safeAddress> <threshold> <owner1> [owner2 ...]",
    example: "/wallet_set 0xSafe... 2 0xOwnerA... 0xOwnerB...",
    next: "No Safe yet? Create one with /safe_group <threshold> or /safe_create."
  },
  safe_create: {
    summary: "Deprecated — use /safe_group to deploy from an owner's wallet, or /wallet_set to link an existing Safe.",
    usage: "/safe_create <threshold> <owner1> [owner2 ...]",
    example: "/safe_group 2",
    next: "Collect owners with inline buttons, then tap Deploy Safe."
  },
  safe_group: {
    summary: "Start collecting group members to deploy a Safe (admin only).",
    usage: "/safe_group <threshold>",
    example: "/safe_group 2",
    next: "Members then tap Generate + join or Join linked wallet, and an admin taps Deploy Safe."
  },
  safe_group_join: {
    summary: "Join an in-progress Safe setup with a specific wallet address.",
    usage: "/safe_group_join <setupId> <ownerAddress>",
    example: "/safe_group_join setup_abc123 0xOwnerA...",
    next: "An admin starts the setup with /safe_group <threshold>; the setup ID is shown in that message."
  },
  buy: {
    summary: "Create a group buy proposal for a BSC token.",
    usage: "/buy <tokenAddress> <bnbAmount> [slippageBps]",
    example: "/buy 0xToken... 0.25 150",
    next: "You must have a trader or owner pool role. An owner can grant it with /pool_role."
  },
  proposal: {
    summary: "Show a saved trade proposal by its ID.",
    usage: "/proposal <proposalId>",
    example: "/proposal trade_abc123",
    next: "Create a proposal first with /buy <tokenAddress> <bnbAmount> [slippageBps]; the ID is in its reply."
  },
  flap_metadata: {
    summary: "Upload Flap token metadata to IPFS and get back a metadata URI (admin only).",
    usage: "/flap_metadata <name>|<symbol>|<description>|<imageUri>|[website]|[telegram]|[x]",
    example: "/flap_metadata Family Coin|FAM|Group token|ipfs://bafy-image...",
    next: "Separate fields with | . Already have a metadata URI? Skip this and pass it straight to /flap_launch."
  },
  flap_launch: {
    summary: "Create a Flap token launch proposal (admin only).",
    usage: "/flap_launch <name>|<symbol>|<metadataUri>|<buyTaxBps>|<sellTaxBps>|<taxDays>|<recipient:bps,...>|<initialBuyBnb>",
    example: "/flap_launch Family Coin|FAM|ipfs://bafy...|200|200|30|0xRecipient...:10000|0.1",
    next: "All 8 fields are required, separated by | . Recipient shares must sum to 10000 bps. Get a metadata URI from /flap_metadata."
  },
  safe_prepare: {
    summary: "Turn a proposal into a Safe transaction owners can sign.",
    usage: "/safe_prepare <trade|flap|withdrawal> <id>",
    example: "/safe_prepare trade trade_abc123",
    next: "trade IDs come from /buy, flap IDs from /flap_launch, withdrawal IDs from /pool_withdraw."
  },
  safe_submit: {
    summary: "Submit an owner signature for a prepared Safe transaction.",
    usage: "/safe_submit <submissionId> <ownerAddress> <signature>",
    example: "/safe_submit safe_abc123 0xOwnerA... 0x<signature>",
    next: "Get the submission ID from /safe_prepare, or sign from the page at /sign/<submissionId>."
  },
  safe_status: {
    summary: "Show confirmations and execution state for a Safe transaction.",
    usage: "/safe_status <safeSubmissionId>",
    example: "/safe_status safe_abc123",
    next: "The submission ID comes from /safe_prepare <type> <id>."
  },
  safe_execute: {
    summary: "Open the wallet execute page for a ready Safe submission (admin only). You pay gas from your wallet.",
    usage: "/safe_execute <safeSubmissionId>",
    example: "/safe_execute safe_abc123",
    next: "Check confirmations with /safe_status first. Tap the link to send execTransaction from your wallet."
  },
  pool_nav: {
    summary: "Update the pool's mark-to-market NAV snapshot (owner only).",
    usage: "/pool_nav <navBnb> <liquidBnb> <positionsBnb>",
    example: "/pool_nav 1.2 0.7 0.5",
    next: "navBnb must equal liquidBnb + positionsBnb."
  },
  pool_role: {
    summary: "Assign a pool role to a member (owner only).",
    usage: "/pool_role <telegramUserId> <owner|trader|member>",
    example: "/pool_role 123456789 trader",
    next: "Find a member's numeric Telegram user ID from the /pool analytics breakdown."
  },
  pool_deposit: {
    summary: "Credit a BNB deposit you already sent to the group Safe.",
    usage: "/pool_deposit <bnbAmount> <txHash>",
    example: "/pool_deposit 1.0 0x<64-hex-transaction-hash>",
    next: "First send BNB to the group Safe (see /wallet), then run this with that transaction's hash."
  },
  pool_withdraw: {
    summary: "Request a withdrawal of your pool shares.",
    usage: "/pool_withdraw <basisPoints> <recipientAddress>",
    example: "/pool_withdraw 5000 0xYourLinkedWallet...",
    next: "5000 bps = 50%. The recipient must be a wallet linked to your Telegram account."
  },
  pool_cancel: {
    summary: "Cancel one of your queued withdrawal requests and restore the locked shares.",
    usage: "/pool_cancel <withdrawalRequestId>",
    example: "/pool_cancel wd_abc123",
    next: "Only queued withdrawals can be cancelled. Find the ID in /pool or the request reply. A pool owner can cancel any member's queued withdrawal."
  }
};

export function renderUsage(command: string, reason?: string): string {
  const entry = COMMAND_USAGE[command];
  if (entry === undefined) {
    return reason !== undefined && reason.length > 0 ? reason : "Command failed";
  }
  const lines = [reason !== undefined && reason.length > 0 ? reason : entry.summary, "", `Usage: ${entry.usage}`];
  if (entry.example !== undefined) {
    lines.push(`Example: ${entry.example}`);
  }
  if (entry.next !== undefined) {
    lines.push("", entry.next);
  }
  return lines.join("\n");
}
