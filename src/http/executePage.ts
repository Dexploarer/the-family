import { walletProviderScript } from "./walletProviderScript.js";
import { brandHead } from "./brand.js";

// Execute-from-your-wallet page. The server hands the wallet the exact
// execTransaction calldata (with the owners' collected signatures); the connected
// wallet sends it and pays gas, then posts the hash back for on-chain verification.
export function renderExecutePage(input: {
  submissionId: string;
  safeAddress: string;
  data: string;
  walletConnectProjectId?: string;
  chainId?: number;
}): string {
  const submissionIdJson = JSON.stringify(input.submissionId);
  const toJson = JSON.stringify(input.safeAddress);
  const dataJson = JSON.stringify(input.data);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  ${brandHead()}
  <title>BNancy Safe Execute</title>
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
    <h1>Execute the Safe transaction</h1>
    <p>Safe: <code>${input.safeAddress}</code></p>
    <p>Enough owners have signed. Connect a wallet to submit the transaction on BNB Smart Chain — you pay the gas; the bot holds no key.</p>
    <p><strong>Make sure your wallet is on BNB Smart Chain.</strong></p>
    <button id="execute">Connect wallet and execute</button>
    <output id="output">Waiting for your wallet.</output>
  </main>
  <script type="module">
    ${walletProviderScript(input.walletConnectProjectId, input.chainId)}
    const submissionId = ${submissionIdJson};
    const to = ${toJson};
    const data = ${dataJson};
    const output = document.getElementById("output");
    const button = document.getElementById("execute");
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
        output.textContent = "Executing… tx " + transactionHash + "\\nConfirming on-chain…";
        const response = await fetch("/api/safe-executions/" + encodeURIComponent(submissionId), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transactionHash })
        });
        const body = await response.json();
        if (!response.ok) {
          throw new Error(body.error || "Execution verification failed");
        }
        output.textContent = "Executed: " + transactionHash + ". You can return to Telegram.";
      } catch (error) {
        output.textContent = error instanceof Error ? error.message : "Execution failed";
        button.disabled = false;
      }
    });
  </script>
</body>
</html>`;
}
