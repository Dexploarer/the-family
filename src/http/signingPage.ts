import type { SafeSubmission } from "../domain/types.js";
import { walletProviderScript } from "./walletProviderScript.js";
import { brandHead } from "./brand.js";

export function renderSigningPage(submission: SafeSubmission, walletConnectProjectId?: string, chainId?: number): string {
  const submissionIdJson = JSON.stringify(submission.id);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  ${brandHead()}
  <title>BNancy Safe Signature</title>
  <script src="https://telegram.org/js/telegram-web-app.js"></script>
  <style>
    :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #101318; color: #f7f3e8; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px; }
    main { width: min(720px, 100%); border: 1px solid #303744; border-radius: 8px; padding: 24px; background: #171b22; }
    h1 { margin: 0 0 16px; font-size: 24px; }
    p, code { color: #c9d1dc; line-height: 1.5; }
    code { word-break: break-all; }
    label { display: grid; gap: 8px; margin: 18px 0; color: #c9d1dc; }
    input { border-radius: 6px; background: #0d1016; color: #f7f3e8; border: 1px solid #303744; padding: 12px; font: inherit; }
    button { border: 0; border-radius: 6px; padding: 12px 16px; background: #f0b90b; color: #101318; font-weight: 700; cursor: pointer; }
    button:disabled { opacity: .55; cursor: not-allowed; }
    output { display: block; min-height: 56px; margin-top: 16px; border-radius: 6px; background: #0d1016; color: #f7f3e8; border: 1px solid #303744; padding: 12px; white-space: pre-wrap; }
  </style>
</head>
<body>
  <main>
    <h1>Sign Safe Transaction</h1>
    <p>Safe: <code>${submission.safeAddress}</code></p>
    <p>Hash: <code id="hash">${submission.safeTxHash}</code></p>
    <label>
      Telegram user ID
      <input id="telegramUserId" inputmode="numeric" autocomplete="off" placeholder="123456789" />
    </label>
    <button id="sign">Connect wallet, sign, and submit</button>
    <output id="output">Waiting for signature.</output>
  </main>
  <script type="module">
    ${walletProviderScript(walletConnectProjectId, chainId)}
    const submissionId = ${submissionIdJson};
    const button = document.getElementById("sign");
    const output = document.getElementById("output");
    const telegramUserIdInput = document.getElementById("telegramUserId");
    const telegramWebApp = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
    telegramUserIdInput.value = localStorage.getItem("bnancy-telegram-user-id") || "";
    if (telegramWebApp) {
      telegramWebApp.ready();
      if (telegramWebApp.initDataUnsafe && telegramWebApp.initDataUnsafe.user && telegramWebApp.initDataUnsafe.user.id) {
        telegramUserIdInput.value = String(telegramWebApp.initDataUnsafe.user.id);
        telegramUserIdInput.readOnly = true;
      }
    }
    button.addEventListener("click", async () => {
      const telegramUserId = telegramUserIdInput.value.trim();
      if (!/^\\d+$/.test(telegramUserId)) {
        output.textContent = "Enter your numeric Telegram user ID first.";
        return;
      }
      button.disabled = true;
      try {
        const provider = await getProvider();
        const accounts = await provider.request({ method: "eth_requestAccounts" });
        try { await ensureChain(provider); } catch (e) { /* signing a Safe tx hash is chain-agnostic; proceed even if the switch is declined */ }
        const address = accounts[0];
        const signature = await provider.request({
          method: "personal_sign",
          params: [document.getElementById("hash").textContent, address]
        });
        localStorage.setItem("bnancy-telegram-user-id", telegramUserId);
        const response = await fetch("/api/safe-submissions/" + submissionId + "/signatures", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            telegramUserId,
            telegramInitData: telegramWebApp ? telegramWebApp.initData : "",
            ownerAddress: address,
            signature
          })
        });
        const body = await response.json();
        if (!response.ok) {
          throw new Error(body.error || "Signature submission failed");
        }
        output.textContent = "Signature submitted. Status: " + body.status;
      } catch (error) {
        output.textContent = error instanceof Error ? error.message : "Signing failed";
      } finally {
        button.disabled = false;
      }
    });
  </script>
</body>
</html>`;
}
