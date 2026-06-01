import { brandHead } from "./brand.js";

export function renderPoolPage(chatId: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  ${brandHead()}
  <title>BNancy Pool</title>
  <script src="https://telegram.org/js/telegram-web-app.js"></script>
  <style>
    :root {
      color-scheme: light dark;
      --bg: #f7f7f4;
      --panel: #ffffff;
      --text: #171717;
      --muted: #61615c;
      --line: #ddddd4;
      --accent: #12715b;
      --danger: #9b1c31;
      --shadow: 0 12px 32px rgb(24 24 20 / 10%);
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #111311;
        --panel: #191c19;
        --text: #f4f4ef;
        --muted: #b6b8b1;
        --line: #31362f;
        --accent: #6fd0ad;
        --danger: #ff8a9c;
        --shadow: none;
      }
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-block-size: 100dvh;
      background: var(--bg);
      color: var(--text);
      font: 14px/1.45 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    button {
      min-block-size: 40px;
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 0 14px;
      background: var(--panel);
      color: var(--text);
      font: inherit;
      cursor: pointer;
    }
    button:focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 2px;
    }
    .shell {
      inline-size: min(1120px, 100%);
      margin-inline: auto;
      padding: 16px;
    }
    .topbar {
      display: flex;
      flex-wrap: wrap;
      align-items: safe center;
      gap: 12px;
      justify-content: space-between;
      padding-block: 8px 16px;
    }
    h1, h2, p { margin: 0; }
    h1 { font-size: 22px; letter-spacing: 0; }
    h2 { font-size: 15px; letter-spacing: 0; }
    .muted { color: var(--muted); }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(168px, 1fr));
      gap: 12px;
      margin-block-end: 12px;
    }
    .panel {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      box-shadow: var(--shadow);
      padding: 14px;
    }
    .metric {
      display: grid;
      gap: 6px;
      min-block-size: 86px;
    }
    .metric strong {
      overflow-wrap: anywhere;
      font-size: 19px;
      letter-spacing: 0;
    }
    .stack {
      display: grid;
      gap: 12px;
    }
    .bar {
      overflow: hidden;
      block-size: 10px;
      border-radius: 999px;
      background: color-mix(in srgb, var(--line) 72%, transparent);
    }
    .bar > span {
      display: block;
      block-size: 100%;
      inline-size: var(--value);
      background: var(--accent);
    }
    .table-wrap {
      overflow-x: auto;
    }
    table {
      inline-size: 100%;
      min-inline-size: 720px;
      border-collapse: collapse;
    }
    th, td {
      padding: 10px 8px;
      border-block-end: 1px solid var(--line);
      text-align: start;
      white-space: nowrap;
    }
    th { color: var(--muted); font-size: 12px; font-weight: 600; }
    .positive { color: var(--accent); }
    .negative { color: var(--danger); }
    .empty, .error {
      display: grid;
      gap: 10px;
      place-items: start;
      padding: 24px;
    }
  </style>
</head>
<body>
  <main class="shell" data-pool-root data-chat-id="${escapeAttribute(chatId)}">
    <section class="topbar">
      <div>
        <h1>BNancy Pool</h1>
        <p class="muted" data-subtitle>Loading pool analytics</p>
      </div>
      <button type="button" data-refresh>Refresh</button>
    </section>
    <section data-content class="stack" aria-live="polite"></section>
  </main>
  <script>
    const root = document.querySelector("[data-pool-root]");
    const content = document.querySelector("[data-content]");
    const subtitle = document.querySelector("[data-subtitle]");
    const refresh = document.querySelector("[data-refresh]");
    const chatId = root.dataset.chatId;
    const telegram = window.Telegram?.WebApp;
    telegram?.ready();
    refresh.addEventListener("click", () => load());

    async function load() {
      content.innerHTML = '<section class="panel empty"><p>Loading pool analytics</p></section>';
      const query = new URLSearchParams();
      if (telegram?.initData) query.set("telegramInitData", telegram.initData);
      const localUser = new URLSearchParams(location.search).get("telegramUserId");
      if (!telegram?.initData && localUser) query.set("telegramUserId", localUser);
      const response = await fetch("/api/pools/" + encodeURIComponent(chatId) + "/analytics?" + query.toString());
      if (!response.ok) {
        const payload = await response.json();
        renderError(payload.error || "Pool analytics failed");
        return;
      }
      render(await response.json());
    }

    function render(data) {
      subtitle.textContent = "Chat " + data.chatId + " · updated " + new Date(data.capturedAt).toLocaleString();
      content.innerHTML = [
        metrics(data),
        memberPanel(data),
        membersPanel(data),
        withdrawalsPanel(data)
      ].join("");
    }

    function metrics(data) {
      return '<section class="grid">' +
        metric("NAV", formatBnb(data.navWei)) +
        metric("Liquid", formatBnb(data.liquidWei)) +
        metric("Open positions", formatBnb(data.positionsWei)) +
        metric("Reserved", formatBnb(data.reservedWithdrawalWei)) +
        '</section>';
    }

    function metric(label, value) {
      return '<article class="panel metric"><span class="muted">' + esc(label) + '</span><strong>' + esc(value) + '</strong></article>';
    }

    function memberPanel(data) {
      const member = data.member;
      const pnlClass = BigInt(member.unrealizedPnlWei) >= 0n ? "positive" : "negative";
      return '<section class="panel stack"><h2>Your breakdown</h2><div class="bar"><span style="--value:' +
        esc(percent(member.ownershipBps)) + '"></span></div><div class="grid">' +
        metric("Role", member.role) +
        metric("Ownership", formatBps(member.ownershipBps)) +
        metric("Active value", formatBnb(member.activeValueWei)) +
        metric("Queued withdrawals", formatBnb(member.queuedWithdrawalWei)) +
        metric("Deposited", formatBnb(member.depositedWei)) +
        '<article class="panel metric"><span class="muted">PnL after fees</span><strong class="' + pnlClass + '">' +
        esc(formatSignedBnb(member.unrealizedPnlWei)) + '</strong></article></div></section>';
    }

    function membersPanel(data) {
      if (data.members.length === 0) return '<section class="panel empty"><p>No pool members yet</p></section>';
      return '<section class="panel stack"><h2>Members</h2><div class="table-wrap"><table><thead><tr><th>User</th><th>Role</th><th>Ownership</th><th>Active value</th><th>Deposited</th><th>Withdrawn</th><th>PnL</th></tr></thead><tbody>' +
        data.members.map((member) => '<tr><td>' + esc(member.telegramUserId) + '</td><td>' + esc(member.role) + '</td><td>' +
          esc(formatBps(member.ownershipBps)) + '</td><td>' + esc(formatBnb(member.activeValueWei)) + '</td><td>' +
          esc(formatBnb(member.depositedWei)) + '</td><td>' + esc(formatBnb(member.withdrawnWei)) + '</td><td>' +
          esc(formatSignedBnb(member.unrealizedPnlWei)) + '</td></tr>').join("") +
        '</tbody></table></div></section>';
    }

    function withdrawalsPanel(data) {
      const open = data.withdrawals.filter((request) => request.status !== "executed" && request.status !== "cancelled");
      if (open.length === 0) return '<section class="panel empty"><p>No queued withdrawals</p></section>';
      return '<section class="panel stack"><h2>Queued withdrawals</h2><div class="table-wrap"><table><thead><tr><th>ID</th><th>User</th><th>Status</th><th>Gross</th><th>Fee</th><th>Net</th></tr></thead><tbody>' +
        open.map((request) => '<tr><td>' + esc(request.id) + '</td><td>' + esc(request.telegramUserId) + '</td><td>' +
          esc(request.status) + '</td><td>' + esc(formatBnb(request.grossAmountWei)) + '</td><td>' +
          esc(formatBnb(request.feeAmountWei)) + '</td><td>' + esc(formatBnb(request.netAmountWei)) + '</td></tr>').join("") +
        '</tbody></table></div></section>';
    }

    function renderError(message) {
      subtitle.textContent = "Pool analytics unavailable";
      content.innerHTML = '<section class="panel error"><p>' + esc(message) + '</p><button type="button" data-retry>Retry</button></section>';
      content.querySelector("[data-retry]").addEventListener("click", () => load());
    }

    function formatBps(value) {
      return (Number(value) / 100).toFixed(2) + "%";
    }

    function percent(value) {
      return Math.max(0, Math.min(100, Number(value) / 100)).toFixed(2) + "%";
    }

    function formatSignedBnb(value) {
      const amount = BigInt(value);
      return (amount < 0n ? "-" : "+") + formatBnb((amount < 0n ? -amount : amount));
    }

    function formatBnb(value) {
      const wei = BigInt(value);
      const whole = wei / 1000000000000000000n;
      const fraction = (wei % 1000000000000000000n).toString().padStart(18, "0").slice(0, 6).replace(/0+$/, "");
      return whole.toString() + (fraction.length === 0 ? "" : "." + fraction) + " BNB";
    }

    function esc(value) {
      return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
    }

    load();
  </script>
</body>
</html>`;
}

function escapeAttribute(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    if (char === "&") return "&amp;";
    if (char === "<") return "&lt;";
    if (char === ">") return "&gt;";
    if (char === '"') return "&quot;";
    return "&#39;";
  });
}
