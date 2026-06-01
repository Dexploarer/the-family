import { brandCssVars, brandHead } from "./brand.js";
import type { BrandingSnapshot } from "../services/brandingService.js";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

// Operator dashboard at /admin — email login, analytics, flags, whitelabel, team.
export function renderAdminPage(branding: BrandingSnapshot): string {
  const title = escapeHtml(`${branding.productName} ${branding.operatorTitle}`);
  const productName = escapeHtml(branding.productName);
  const operatorTitle = escapeHtml(branding.operatorTitle);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  ${brandHead(branding)}
  <title>${title}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600&family=Manrope:wght@400;500;700&display=swap" rel="stylesheet" />
  <style>
    :root {
      color-scheme: dark;
      --ink: #08080a;
      --panel: rgba(255,255,255,0.04);
      --line: rgba(214,178,94,0.22);
      --text: #f4efe2;
      --muted: #9c968a;
      --g2: #e9c46a;
      --sans: "Manrope", system-ui, sans-serif;
      --serif: "Cormorant Garamond", Georgia, serif;
    }
    ${brandCssVars(branding)}
    * { box-sizing: border-box; margin: 0; }
    body { background: var(--ink); color: var(--text); font-family: var(--sans); min-height: 100dvh; }
    a { color: var(--g2); }
    .wrap { width: min(1180px, 94%); margin: 0 auto; padding: 24px 0 64px; }
    header { display: flex; flex-wrap: wrap; gap: 16px; align-items: center; justify-content: space-between; margin-bottom: 28px; }
    h1 { font-family: var(--serif); font-size: 36px; font-weight: 600; letter-spacing: 0.08em; }
    .tabs { display: flex; gap: 8px; flex-wrap: wrap; }
    .tab, button, input, select { font: inherit; }
    .tab, button {
      border: 1px solid var(--line); background: var(--panel); color: var(--text);
      border-radius: 4px; padding: 10px 14px; cursor: pointer;
    }
    .tab.active, button.primary { background: linear-gradient(135deg, var(--brand-accent-start), var(--brand-accent-end)); color: #1a1205; border-color: transparent; font-weight: 700; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-bottom: 20px; }
    .card { border: 1px solid var(--line); border-radius: 6px; padding: 16px; background: var(--panel); }
    .card .label { color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: 0.12em; }
    .card .value { font-family: var(--serif); font-size: 28px; margin-top: 6px; }
    .panel { border: 1px solid var(--line); border-radius: 6px; padding: 16px; background: var(--panel); margin-bottom: 16px; }
    .panel h2 { font-family: var(--serif); font-size: 22px; margin-bottom: 12px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { text-align: left; padding: 10px 8px; border-bottom: 1px solid var(--line); vertical-align: top; }
    th { color: var(--muted); font-weight: 500; font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; }
    tr[data-chat-id] { cursor: pointer; }
    tr[data-chat-id]:hover { background: rgba(233,196,106,0.06); }
    .muted { color: var(--muted); }
    .login { max-width: 420px; margin: 12vh auto 0; }
    .login input, .field input, .field select { width: 100%; padding: 12px; border-radius: 4px; border: 1px solid var(--line); background: #111; color: var(--text); margin: 8px 0 12px; }
    .flag-row { display: flex; gap: 12px; align-items: flex-start; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid var(--line); }
    .flag-row:last-child { border-bottom: 0; }
    .pill { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; border: 1px solid var(--line); }
    .pill.on { color: #1a1205; background: var(--g2); border-color: transparent; }
    .error { color: #ff8a9c; margin-top: 8px; }
    .hidden { display: none !important; }
    pre { white-space: pre-wrap; word-break: break-word; font-size: 12px; color: var(--muted); max-height: 320px; overflow: auto; }
    .report-section { margin-bottom: 18px; }
    .report-section h3 { font-family: var(--serif); font-size: 18px; margin-bottom: 8px; }
    .stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 8px; margin-bottom: 10px; }
    .stat-grid div { border: 1px solid var(--line); border-radius: 4px; padding: 8px 10px; }
    .stat-grid span { display: block; color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; }
    .invite-box { margin-top: 12px; padding: 12px; border: 1px dashed var(--line); border-radius: 4px; word-break: break-all; }
    .subtable { margin-top: 8px; }
    .row { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; }
    .field { flex: 1 1 220px; }
    label { font-size: 12px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.08em; }
  </style>
</head>
<body>
  <div class="wrap">
    <header>
      <div>
        <p class="muted" style="font-size:12px;letter-spacing:0.28em;text-transform:uppercase">${productName}</p>
        <h1>${operatorTitle}</h1>
      </div>
      <div class="row hidden" id="headerActions">
        <span class="muted" id="whoami"></span>
        <button type="button" id="logoutBtn">Sign out</button>
      </div>
      <div class="tabs hidden" id="tabs">
        <button type="button" class="tab active" data-tab="overview">Overview</button>
        <button type="button" class="tab" data-tab="flags">Flags</button>
        <button type="button" class="tab" data-tab="groups">Groups</button>
        <button type="button" class="tab" data-tab="safe">Safe queue</button>
        <button type="button" class="tab" data-tab="model">eliza-1</button>
        <button type="button" class="tab" data-tab="activity">Activity</button>
        <button type="button" class="tab hidden" data-tab="branding" data-super-only>Branding</button>
        <button type="button" class="tab hidden" data-tab="team" data-super-only>Team</button>
      </div>
    </header>

    <section id="loginView" class="login panel">
      <h2 id="loginTitle">Sign in</h2>
      <p class="muted" id="loginHint">Enter your operator email to continue.</p>
      <div id="emailStep">
        <input id="emailInput" type="email" autocomplete="username" placeholder="you@company.com" />
        <button type="button" class="primary" id="emailBtn">Continue</button>
      </div>
      <div id="passwordStep" class="hidden">
        <input id="passwordInput" type="password" autocomplete="current-password" placeholder="Password" />
        <button type="button" class="primary" id="loginBtn">Sign in</button>
        <button type="button" id="backEmailBtn">Back</button>
      </div>
      <div id="setPasswordStep" class="hidden">
        <input id="newPasswordInput" type="password" autocomplete="new-password" placeholder="Choose a password (12+ chars)" />
        <button type="button" class="primary" id="setPasswordBtn">Set password &amp; enter</button>
        <button type="button" id="backSetBtn">Back</button>
      </div>
      <div id="inviteAcceptStep" class="hidden">
        <p class="muted" id="inviteAcceptHint">Accept your invite and choose a password.</p>
        <input id="invitePasswordInput" type="password" autocomplete="new-password" placeholder="Choose a password (12+ chars)" />
        <button type="button" class="primary" id="inviteAcceptBtn">Accept invite</button>
      </div>
      <p class="error hidden" id="loginError"></p>
    </section>

    <main id="dashboard" class="hidden">
      <section id="tab-overview">
        <div class="grid" id="overviewCards"></div>
        <div class="panel"><h2>Top commands (24h)</h2><div id="topCommands" class="muted">Loading…</div></div>
        <div class="panel">
          <h2>Recent activity</h2>
          <table><thead><tr><th>When</th><th>Command</th><th>User</th><th>Group</th></tr></thead><tbody id="recentUsage"></tbody></table>
        </div>
      </section>
      <section id="tab-flags" class="hidden"><div class="panel"><div id="flagsList">Loading…</div></div></section>
      <section id="tab-groups" class="hidden">
        <div class="panel">
          <h2>Registered groups</h2>
          <table><thead><tr><th>Chat</th><th>Safe</th><th>Members</th><th>NAV</th><th>Last activity</th></tr></thead><tbody id="groupsTable"></tbody></table>
        </div>
        <div class="panel hidden" id="groupDetail"><h2 id="groupDetailTitle">Group report</h2><div id="groupDetailBody"></div></div>
      </section>
      <section id="tab-safe" class="hidden">
        <div class="panel">
          <h2>Safe &amp; proposal queue</h2>
          <p class="muted">Trades, launches, and withdrawals waiting on prepare/sign/execute.</p>
          <table><thead><tr><th>Stage</th><th>Kind</th><th>Group</th><th>Label</th><th>Detail</th><th>Links</th></tr></thead><tbody id="safeQueueTable"></tbody></table>
        </div>
      </section>
      <section id="tab-model" class="hidden">
        <div class="grid" id="modelCards"></div>
        <div class="panel"><h2>Top tokens (24h)</h2><div id="modelTopTokens" class="muted">Loading…</div></div>
        <div class="panel"><h2>Top callers (24h)</h2><div id="modelTopCallers" class="muted">Loading…</div></div>
        <div class="panel">
          <h2>Inference log (24h)</h2>
          <table><thead><tr><th>When</th><th>Status</th><th>Source</th><th>Token</th><th>User</th><th>Group</th><th>ms</th><th>Trajectory</th></tr></thead><tbody id="modelLogTable"></tbody></table>
        </div>
      </section>
      <section id="tab-activity" class="hidden">
        <div class="panel">
          <h2>Usage log (24h)</h2>
          <table><thead><tr><th>When</th><th>Command</th><th>User</th><th>Group</th></tr></thead><tbody id="activityTable"></tbody></table>
        </div>
      </section>
      <section id="tab-branding" class="hidden">
        <div class="panel">
          <h2>Whitelabel</h2>
          <div class="field"><label>Product name</label><input id="brandProductName" /></div>
          <div class="field"><label>Tagline</label><input id="brandTagline" /></div>
          <div class="field"><label>Operator title</label><input id="brandOperatorTitle" /></div>
          <div class="field"><label>Footer note</label><input id="brandFooterNote" /></div>
          <div class="row">
            <div class="field"><label>Theme color</label><input id="brandThemeColor" type="color" /></div>
            <div class="field"><label>Accent start</label><input id="brandAccentStart" type="color" /></div>
            <div class="field"><label>Accent end</label><input id="brandAccentEnd" type="color" /></div>
          </div>
          <button type="button" class="primary" id="saveBrandingBtn">Save branding</button>
        </div>
      </section>
      <section id="tab-team" class="hidden">
        <div class="panel">
          <h2>Invite admin</h2>
          <div class="row">
            <div class="field"><label>Email</label><input id="inviteEmail" type="email" placeholder="teammate@company.com" /></div>
            <div class="field"><label>Role</label><select id="inviteRole"><option value="admin">Admin</option><option value="super_admin">Super admin</option></select></div>
          </div>
          <button type="button" class="primary" id="inviteBtn">Create invite link</button>
          <div id="inviteResult" class="invite-box hidden"></div>
        </div>
        <div class="panel">
          <h2>Team</h2>
          <table><thead><tr><th>Email</th><th>Role</th><th>Password</th><th></th></tr></thead><tbody id="teamTable"></tbody></table>
        </div>
      </section>
    </main>
  </div>
  <script type="module">
    let currentEmail = "";
    let me = null;
    const loginView = document.getElementById("loginView");
    const dashboard = document.getElementById("dashboard");
    const loginError = document.getElementById("loginError");
    const tabs = document.getElementById("tabs");
    const headerActions = document.getElementById("headerActions");

    async function api(path, options = {}) {
      const response = await fetch(path, {
        ...options,
        credentials: "include",
        headers: { "Content-Type": "application/json", ...(options.headers || {}) }
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || ("HTTP " + response.status));
      return body;
    }

    function showError(message) {
      loginError.textContent = message;
      loginError.classList.remove("hidden");
    }
    function clearError() { loginError.classList.add("hidden"); }

    function esc(s) {
      return String(s).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
    }
    function fmtTime(iso) { return new Date(iso).toLocaleString(); }
    function weiToBnb(wei) {
      if (!wei || wei === "—") return "—";
      try {
        const v = Number(wei) / 1e18;
        return v.toLocaleString(undefined, { maximumFractionDigits: 6 }) + " BNB";
      } catch { return wei; }
    }
    function renderReportSection(section) {
      let html = '<div class="report-section"><h3>' + esc(section.title) + '</h3>';
      if (section.stats && section.stats.length) {
        html += '<div class="stat-grid">' + section.stats.map((s) =>
          '<div><span>' + esc(s.label) + '</span>' + esc(s.value) + '</div>'
        ).join("") + '</div>';
      }
      if (section.tables) {
        for (const table of section.tables) {
          html += '<div class="subtable"><table><thead><tr>' +
            table.headers.map((h) => '<th>' + esc(h) + '</th>').join("") + '</tr></thead><tbody>' +
            (table.rows.length ? table.rows.map((row) =>
              '<tr>' + row.map((cell) => '<td>' + esc(cell) + '</td>').join("") + '</tr>'
            ).join("") : '<tr><td colspan="' + table.headers.length + '" class="muted">None</td></tr>') +
            '</tbody></table></div>';
        }
      }
      if (section.note) html += '<p class="muted">' + esc(section.note) + '</p>';
      return html + '</div>';
    }
    function renderReportView(view) {
      let html = renderReportSection(view.summary);
      if (view.pool) html += renderReportSection(view.pool);
      html += renderReportSection(view.usage);
      html += '<p class="muted"><a href="' + esc(view.links.poolUrl) + '" target="_blank" rel="noopener">Open pool mini-app</a></p>';
      return html;
    }
    function usageRows(target, rows) {
      target.innerHTML = rows.map((row) =>
        "<tr><td>" + fmtTime(row.createdAt) + "</td><td><code>" + row.command + "</code></td><td>" + row.telegramUserId + "</td><td>" + (row.chatId || "—") + "</td></tr>"
      ).join("") || "<tr><td colspan='4' class='muted'>No events</td></tr>";
    }

    async function loadOverview() {
      const data = await api("/api/admin/overview");
      const p = data.platform;
      document.getElementById("overviewCards").innerHTML = [
        ["Groups", p.groups], ["Members", p.totalMembers], ["DAU (24h)", p.dau24h],
        ["TVL", weiToBnb(p.totalTvlWei)], ["Deposits 24h", weiToBnb(p.depositVolume24hWei)], ["Withdrawals 24h", weiToBnb(p.withdrawalVolume24hWei)]
      ].map(([label, value]) => '<div class="card"><div class="label">' + label + '</div><div class="value">' + value + '</div></div>').join("");
      document.getElementById("topCommands").innerHTML = (p.topCommands || []).map((row) => "<div><code>" + row.command + "</code> — " + row.count + "</div>").join("") || "No commands yet";
      usageRows(document.getElementById("recentUsage"), data.recentUsage || []);
    }

    async function loadFlags() {
      const data = await api("/api/admin/flags");
      document.getElementById("flagsList").innerHTML = (data.flags || []).map((flag) => {
        const disabled = flag.runtimeConfigured ? "" : "disabled";
        return '<div class="flag-row" data-flag="' + flag.key + '"><div><strong>' + flag.label + '</strong><div class="muted">' + flag.description + '</div><div style="margin-top:6px"><span class="pill ' + (flag.effective ? "on" : "") + '">' + (flag.effective ? "ON" : "OFF") + '</span> <span class="muted">source: ' + flag.source + '</span></div></div><div style="display:flex;gap:8px"><button type="button" ' + disabled + ' data-action="on">Enable</button><button type="button" ' + disabled + ' data-action="off">Disable</button><button type="button" data-action="reset">Reset</button></div></div>';
      }).join("");
      document.getElementById("flagsList").querySelectorAll("[data-action]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const row = btn.closest("[data-flag]");
          const key = row.getAttribute("data-flag");
          const action = btn.getAttribute("data-action");
          const payload = action === "reset" ? { key, reset: true } : { key, enabled: action === "on" };
          await api("/api/admin/flags", { method: "PATCH", body: JSON.stringify(payload) });
          await loadFlags();
        });
      });
    }

    async function loadGroups() {
      const data = await api("/api/admin/groups");
      const tbody = document.getElementById("groupsTable");
      tbody.innerHTML = (data.groups || []).map((group) =>
        '<tr data-chat-id="' + group.chatId + '"><td>' + group.chatId + '</td><td><code>' + group.safeAddress.slice(0, 10) + '…</code></td><td>' + group.memberCount + '</td><td>' + weiToBnb(group.navWei || "—") + '</td><td>' + (group.lastActivityAt ? fmtTime(group.lastActivityAt) : "—") + '</td></tr>'
      ).join("") || "<tr><td colspan='5' class='muted'>No groups yet</td></tr>";
      tbody.querySelectorAll("[data-chat-id]").forEach((row) => {
        row.addEventListener("click", async () => {
          const chatId = row.getAttribute("data-chat-id");
          const report = await api("/api/admin/groups/" + encodeURIComponent(chatId));
          document.getElementById("groupDetail").classList.remove("hidden");
          document.getElementById("groupDetailTitle").textContent = "Group " + chatId;
          document.getElementById("groupDetailBody").innerHTML = renderReportView(report.view);
        });
      });
    }

    async function loadSafeQueue() {
      const data = await api("/api/admin/safe-queue");
      const tbody = document.getElementById("safeQueueTable");
      tbody.innerHTML = (data.items || []).map((item) => {
        const links = [
          item.signUrl ? '<a href="' + esc(item.signUrl) + '" target="_blank" rel="noopener">Sign</a>' : "",
          item.executeUrl ? '<a href="' + esc(item.executeUrl) + '" target="_blank" rel="noopener">Execute</a>' : ""
        ].filter(Boolean).join(" · ") || "—";
        return '<tr><td>' + esc(item.stage) + '</td><td>' + esc(item.kind) + '</td><td>' + esc(item.chatId) +
          '</td><td>' + esc(item.label) + '</td><td>' + esc(item.detail) + '</td><td>' + links + '</td></tr>';
      }).join("") || "<tr><td colspan='6' class='muted'>Queue is empty</td></tr>";
    }

    async function loadModel() {
      const [analytics, logs] = await Promise.all([
        api("/api/admin/model/analytics?hours=24"),
        api("/api/admin/model/logs?hours=24")
      ]);
      const a = analytics.analytics;
      document.getElementById("modelCards").innerHTML = [
        ["Calls (24h)", a.total], ["Avg latency", a.avgLatencyMs + " ms"],
        ["OK", a.byStatus.ok || 0], ["Fallback", a.byStatus.fallback || 0], ["Error", a.byStatus.error || 0]
      ].map(([label, value]) => '<div class="card"><div class="label">' + label + '</div><div class="value">' + value + '</div></div>').join("");
      document.getElementById("modelTopTokens").innerHTML = (a.topTokens || []).map((t) =>
        "<div><code>" + esc(t.tokenSymbol) + "</code> · " + t.count + " calls</div>"
      ).join("") || "No model calls yet";
      document.getElementById("modelTopCallers").innerHTML = (a.topCallers || []).map((c) =>
        "<div>User " + esc(c.telegramUserId) + " · " + c.count + "</div>"
      ).join("") || "No callers yet";
      const tbody = document.getElementById("modelLogTable");
      tbody.innerHTML = (logs.logs || []).map((log) =>
        '<tr><td>' + fmtTime(log.createdAt) + '</td><td>' + esc(log.status) + '</td><td>' + esc(log.source) +
        '</td><td>' + esc(log.tokenSymbol || "—") + '</td><td>' + esc(log.telegramUserId || "—") + '</td><td>' +
        esc(log.chatId || "—") + '</td><td>' + log.latencyMs + '</td><td><span class="muted">' +
        esc(log.promptPreview) + '</span><br/>' + esc((log.responsePreview || log.errorMessage || "").slice(0, 120)) + '</td></tr>'
      ).join("") || "<tr><td colspan='8' class='muted'>No inference logs yet — open a token in /bnancy</td></tr>";
    }

    async function loadActivity() {
      const data = await api("/api/admin/usage?hours=24");
      usageRows(document.getElementById("activityTable"), data.usage || []);
    }

    async function loadBranding() {
      const data = await api("/api/admin/branding");
      const b = data.branding;
      document.getElementById("brandProductName").value = b.productName;
      document.getElementById("brandTagline").value = b.tagline;
      document.getElementById("brandOperatorTitle").value = b.operatorTitle;
      document.getElementById("brandFooterNote").value = b.footerNote;
      document.getElementById("brandThemeColor").value = b.themeColor;
      document.getElementById("brandAccentStart").value = b.accentStart;
      document.getElementById("brandAccentEnd").value = b.accentEnd;
    }

    async function loadTeam() {
      const data = await api("/api/admin/users");
      document.getElementById("teamTable").innerHTML = (data.users || []).map((user) =>
        '<tr><td>' + user.email + '</td><td>' + user.role + '</td><td>' + (user.hasPassword ? "set" : "pending") + '</td><td>' +
        (user.id === me?.id ? "—" : '<button type="button" data-remove="' + user.id + '">Remove</button>') + '</td></tr>'
      ).join("") || "<tr><td colspan='4' class='muted'>No team members</td></tr>";
      document.getElementById("teamTable").querySelectorAll("[data-remove]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          await api("/api/admin/users/" + encodeURIComponent(btn.getAttribute("data-remove")), { method: "DELETE" });
          await loadTeam();
        });
      });
    }

    async function refresh(tab) {
      if (tab === "overview") await loadOverview();
      if (tab === "flags") await loadFlags();
      if (tab === "groups") await loadGroups();
      if (tab === "safe") await loadSafeQueue();
      if (tab === "model") await loadModel();
      if (tab === "activity") await loadActivity();
      if (tab === "branding") await loadBranding();
      if (tab === "team") await loadTeam();
    }

    function showSuperTabs(show) {
      document.querySelectorAll("[data-super-only]").forEach((el) => el.classList.toggle("hidden", !show));
    }

    async function enterDashboard(user) {
      me = user;
      document.getElementById("whoami").textContent = user.email + " · " + user.role;
      showSuperTabs(user.role === "super_admin");
      loginView.classList.add("hidden");
      dashboard.classList.remove("hidden");
      tabs.classList.remove("hidden");
      headerActions.classList.remove("hidden");
      await refresh("overview");
    }

    document.getElementById("emailBtn").addEventListener("click", async () => {
      clearError();
      currentEmail = document.getElementById("emailInput").value.trim();
      try {
        const result = await api("/api/admin/auth/check-email", { method: "POST", body: JSON.stringify({ email: currentEmail }) });
        document.getElementById("emailStep").classList.add("hidden");
        if (result.step === "password") {
          document.getElementById("passwordStep").classList.remove("hidden");
          document.getElementById("loginTitle").textContent = "Welcome back";
        } else if (result.step === "set_password") {
          document.getElementById("setPasswordStep").classList.remove("hidden");
          document.getElementById("loginTitle").textContent = "Create your password";
          document.getElementById("loginHint").textContent = "First time here — choose a password for this operator account.";
        } else {
          showError("This email is not authorized.");
          document.getElementById("emailStep").classList.remove("hidden");
        }
      } catch (error) {
        showError(error.message || "Could not continue");
      }
    });

    document.getElementById("loginBtn").addEventListener("click", async () => {
      clearError();
      try {
        const result = await api("/api/admin/auth/login", {
          method: "POST",
          body: JSON.stringify({ email: currentEmail, password: document.getElementById("passwordInput").value })
        });
        await enterDashboard(result.user);
      } catch (error) { showError(error.message || "Login failed"); }
    });

    document.getElementById("setPasswordBtn").addEventListener("click", async () => {
      clearError();
      try {
        const result = await api("/api/admin/auth/set-password", {
          method: "POST",
          body: JSON.stringify({ email: currentEmail, password: document.getElementById("newPasswordInput").value })
        });
        await enterDashboard(result.user);
      } catch (error) { showError(error.message || "Could not set password"); }
    });

    document.getElementById("backEmailBtn").addEventListener("click", () => {
      document.getElementById("passwordStep").classList.add("hidden");
      document.getElementById("emailStep").classList.remove("hidden");
      clearError();
    });
    document.getElementById("backSetBtn").addEventListener("click", () => {
      document.getElementById("setPasswordStep").classList.add("hidden");
      document.getElementById("emailStep").classList.remove("hidden");
      clearError();
    });

    document.getElementById("logoutBtn").addEventListener("click", async () => {
      await api("/api/admin/auth/logout", { method: "POST", body: "{}" });
      location.reload();
    });

    document.getElementById("tabs").querySelectorAll(".tab").forEach((tabBtn) => {
      tabBtn.addEventListener("click", async () => {
        document.querySelectorAll(".tab").forEach((el) => el.classList.remove("active"));
        tabBtn.classList.add("active");
        const tab = tabBtn.getAttribute("data-tab");
        ["overview", "flags", "groups", "safe", "model", "activity", "branding", "team"].forEach((name) => {
          document.getElementById("tab-" + name).classList.toggle("hidden", name !== tab);
        });
        await refresh(tab);
      });
    });

    document.getElementById("saveBrandingBtn").addEventListener("click", async () => {
      await api("/api/admin/branding", {
        method: "PATCH",
        body: JSON.stringify({
          productName: document.getElementById("brandProductName").value,
          tagline: document.getElementById("brandTagline").value,
          operatorTitle: document.getElementById("brandOperatorTitle").value,
          footerNote: document.getElementById("brandFooterNote").value,
          themeColor: document.getElementById("brandThemeColor").value,
          accentStart: document.getElementById("brandAccentStart").value,
          accentEnd: document.getElementById("brandAccentEnd").value
        })
      });
      alert("Branding saved. Refresh the landing page to preview.");
    });

    document.getElementById("inviteBtn").addEventListener("click", async () => {
      const result = await api("/api/admin/users", {
        method: "POST",
        body: JSON.stringify({
          email: document.getElementById("inviteEmail").value,
          role: document.getElementById("inviteRole").value
        })
      });
      const box = document.getElementById("inviteResult");
      box.classList.remove("hidden");
      box.innerHTML = (result.emailSent ? "<p>Invite email sent via AgentMail.</p>" : "<p>Copy this link for your teammate (set <code>AGENTMAIL_API_KEY</code> to email automatically):</p>") +
        '<p><a href="' + esc(result.inviteUrl) + '">' + esc(result.inviteUrl) + '</a></p>';
      document.getElementById("inviteEmail").value = "";
      await loadTeam();
    });

    let inviteToken = new URLSearchParams(location.search).get("invite");
    async function startInviteAccept() {
      if (!inviteToken) return;
      loginView.classList.remove("hidden");
      dashboard.classList.add("hidden");
      document.getElementById("emailStep").classList.add("hidden");
      document.getElementById("passwordStep").classList.add("hidden");
      document.getElementById("setPasswordStep").classList.add("hidden");
      document.getElementById("inviteAcceptStep").classList.remove("hidden");
      document.getElementById("loginTitle").textContent = "Accept invite";
      try {
        const preview = await api("/api/admin/auth/invite-preview?token=" + encodeURIComponent(inviteToken));
        currentEmail = preview.email;
        document.getElementById("inviteAcceptHint").textContent = "Set a password for " + preview.email + " (" + preview.role + ").";
        if (preview.expired) showError("This invite link has expired.");
      } catch (error) {
        showError(error.message || "Invalid invite link");
      }
    }
    document.getElementById("inviteAcceptBtn").addEventListener("click", async () => {
      clearError();
      try {
        const result = await api("/api/admin/auth/accept-invite", {
          method: "POST",
          body: JSON.stringify({ token: inviteToken, password: document.getElementById("invitePasswordInput").value })
        });
        history.replaceState({}, "", "/admin");
        await enterDashboard(result.user);
      } catch (error) { showError(error.message || "Could not accept invite"); }
    });

    try {
      const session = await api("/api/admin/auth/me");
      await enterDashboard(session.user);
    } catch {
      await startInviteAccept();
    }
  </script>
</body>
</html>`;
}
