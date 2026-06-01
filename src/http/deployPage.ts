import type { Address } from "viem";
import { walletProviderScript } from "./walletProviderScript.js";
import { brandHead } from "./brand.js";

// Deploy-from-your-wallet page. The server builds the exact createProxyWithNonce
// calldata for this session; the page sends it from the connected wallet (the user
// pays gas), then posts the tx hash back for on-chain verification + linking.
export function renderDeployPage(input: {
  sessionId: string;
  owners: Address[];
  threshold: number;
  to: string;
  data: string;
  walletConnectProjectId?: string;
  chainId?: number;
}): string {
  const sessionIdJson = JSON.stringify(input.sessionId);
  const toJson = JSON.stringify(input.to);
  const dataJson = JSON.stringify(input.data);
  const ownersList = input.owners.map((owner, index) => `${index + 1}. ${owner}`).join("<br/>");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  ${brandHead()}
  <title>BNancy Safe Deploy</title>
  <script src="https://telegram.org/js/telegram-web-app.js"></script>
  <style>
    :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #101318; color: #f7f3e8; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px; }
    main { width: min(720px, 100%); border: 1px solid #303744; border-radius: 8px; padding: 24px; background: #171b22; }
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
    <h1>Deploy your group Safe</h1>
    <p>Threshold: ${input.threshold} of ${input.owners.length}</p>
    <p>Owners:<br/>${ownersList}</p>
    <p>Connect a wallet to deploy the Safe on BNB Smart Chain. You pay the gas; the bot never holds a key.</p>
    <p><strong>Make sure your wallet is on BNB Smart Chain</strong> before deploying.</p>
    <button id="deploy">Connect wallet and deploy</button>
    <output id="output">Waiting for your wallet.</output>
  </main>
  <script type="module">
    ${walletProviderScript(input.walletConnectProjectId, input.chainId)}
    const sessionId = ${sessionIdJson};
    const to = ${toJson};
    const data = ${dataJson};
    const output = document.getElementById("output");
    const button = document.getElementById("deploy");
    const telegramWebApp = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
    if (telegramWebApp) {
      telegramWebApp.ready();
    }
    button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        const provider = await getProvider();
        const accounts = await provider.request({ method: "eth_requestAccounts" });
        await ensureChain(provider); // force BNB Chain before sending — the wallet may default to Ethereum
        const from = accounts[0];
        const transactionHash = await provider.request({ method: "eth_sendTransaction", params: [{ from, to, data, value: "0x0" }] });
        output.textContent = "Deploying… tx " + transactionHash + "\\nConfirming on-chain…";
        const response = await fetch("/api/safe-deployments/" + encodeURIComponent(sessionId), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ telegramInitData: telegramWebApp ? telegramWebApp.initData : "", transactionHash })
        });
        const body = await response.json();
        if (!response.ok) {
          throw new Error(body.error || "Deployment verification failed");
        }
        output.textContent = "Safe deployed: " + body.safeAddress + ". You can return to Telegram.";
      } catch (error) {
        output.textContent = error instanceof Error ? error.message : "Deployment failed";
        button.disabled = false;
      }
    });
  </script>
</body>
</html>`;
}
