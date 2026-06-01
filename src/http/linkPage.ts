import type { WalletLink } from "../domain/types.js";
import { buildWalletLinkMessage } from "../services/walletLinkService.js";
import { walletProviderScript } from "./walletProviderScript.js";
import { brandHead } from "./brand.js";

export function renderLinkPage(link: WalletLink, walletConnectProjectId?: string, chainId?: number): string {
  const nonceJson = JSON.stringify(link.nonce);
  const addressJson = JSON.stringify(link.address);
  const messageJson = JSON.stringify(buildWalletLinkMessage(link));
  const alreadyLinked = link.status === "linked";
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  ${brandHead()}
  <title>BNancy Wallet Link</title>
  <script src="https://telegram.org/js/telegram-web-app.js"></script>
  <style>
    :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #101318; color: #f7f3e8; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px; }
    main { width: min(640px, 100%); border: 1px solid #303744; border-radius: 8px; padding: 24px; background: #171b22; }
    h1 { margin: 0 0 16px; font-size: 24px; }
    p, code { color: #c9d1dc; line-height: 1.5; }
    code { word-break: break-all; }
    button { border: 0; border-radius: 6px; padding: 12px 16px; background: #f0b90b; color: #101318; font-weight: 700; cursor: pointer; font: inherit; }
    button:disabled { opacity: .55; cursor: not-allowed; }
    output { display: block; min-height: 56px; margin-top: 16px; border-radius: 6px; background: #0d1016; color: #f7f3e8; border: 1px solid #303744; padding: 12px; white-space: pre-wrap; }
  </style>
</head>
<body>
  <main>
    <h1>Link your wallet</h1>
    <p>Wallet to link: <code id="address">${link.address}</code></p>
    <p>Connect this exact wallet and sign to prove you control it. BNancy never sees your private key.</p>
    <button id="link" ${alreadyLinked ? "disabled" : ""}>Connect wallet and sign</button>
    <output id="output">${alreadyLinked ? "This wallet is already linked." : "Waiting for signature."}</output>
  </main>
  <script type="module">
    ${walletProviderScript(walletConnectProjectId, chainId)}
    const nonce = ${nonceJson};
    const expectedAddress = ${addressJson};
    const message = ${messageJson};
    const button = document.getElementById("link");
    const output = document.getElementById("output");
    const telegramWebApp = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
    if (telegramWebApp) {
      telegramWebApp.ready();
    }
    button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        const provider = await getProvider();
        const accounts = await provider.request({ method: "eth_requestAccounts" });
        try { await ensureChain(provider); } catch (e) { /* linking signs a message (chain-agnostic); proceed even if the switch is declined */ }
        const address = accounts[0];
        if (address.toLowerCase() !== expectedAddress.toLowerCase()) {
          output.textContent = "Connected wallet " + address + " does not match the wallet you are linking (" + expectedAddress + "). Switch accounts and try again.";
          button.disabled = false;
          return;
        }
        const signature = await provider.request({
          method: "personal_sign",
          params: [message, address]
        });
        const response = await fetch("/api/wallet-links/" + encodeURIComponent(nonce) + "/signatures", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ signature })
        });
        const body = await response.json();
        if (!response.ok) {
          throw new Error(body.error || "Wallet link failed");
        }
        output.textContent = "Wallet linked: " + body.address + ". You can return to Telegram.";
      } catch (error) {
        output.textContent = error instanceof Error ? error.message : "Linking failed";
        button.disabled = false;
      }
    });
  </script>
</body>
</html>`;
}

// Connect-first link page (no pre-typed address). The user connects a wallet, the
// page reads the connected address, identifies the user from Telegram initData, and
// links + signs in one tap. Opened as a WebApp button from a DM.
export function renderLinkStartPage(walletConnectProjectId?: string, chainId?: number): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  ${brandHead()}
  <title>BNancy Wallet Link</title>
  <script src="https://telegram.org/js/telegram-web-app.js"></script>
  <style>
    :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #101318; color: #f7f3e8; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px; }
    main { width: min(640px, 100%); border: 1px solid #303744; border-radius: 8px; padding: 24px; background: #171b22; }
    h1 { margin: 0 0 16px; font-size: 24px; }
    p { color: #c9d1dc; line-height: 1.5; }
    button { border: 0; border-radius: 6px; padding: 12px 16px; background: #f0b90b; color: #101318; font-weight: 700; cursor: pointer; font: inherit; }
    button:disabled { opacity: .55; cursor: not-allowed; }
    output { display: block; min-height: 56px; margin-top: 16px; border-radius: 6px; background: #0d1016; color: #f7f3e8; border: 1px solid #303744; padding: 12px; white-space: pre-wrap; }
  </style>
</head>
<body>
  <main>
    <h1>Link your wallet</h1>
    <p>Connect your wallet and sign once to prove you control it. BNancy never sees your private key.</p>
    <button id="link">Connect wallet and link</button>
    <output id="output">Waiting for your wallet.</output>
  </main>
  <script type="module">
    ${walletProviderScript(walletConnectProjectId, chainId)}
    const output = document.getElementById("output");
    const button = document.getElementById("link");
    const telegramWebApp = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
    if (telegramWebApp) {
      telegramWebApp.ready();
    }
    button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        const provider = await getProvider();
        const accounts = await provider.request({ method: "eth_requestAccounts" });
        try { await ensureChain(provider); } catch (e) { /* linking signs a message (chain-agnostic); proceed even if the switch is declined */ }
        const address = accounts[0];
        const startResponse = await fetch("/api/wallet-links", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ telegramInitData: telegramWebApp ? telegramWebApp.initData : "", address })
        });
        const started = await startResponse.json();
        if (!startResponse.ok) {
          throw new Error(started.error || "Could not start the wallet link");
        }
        const signature = await provider.request({ method: "personal_sign", params: [started.message, address] });
        const response = await fetch("/api/wallet-links/" + encodeURIComponent(started.nonce) + "/signatures", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ signature })
        });
        const body = await response.json();
        if (!response.ok) {
          throw new Error(body.error || "Wallet link failed");
        }
        output.textContent = "Wallet linked: " + body.address + ". You can return to Telegram.";
      } catch (error) {
        output.textContent = error instanceof Error ? error.message : "Linking failed";
        button.disabled = false;
      }
    });
  </script>
</body>
</html>`;
}
