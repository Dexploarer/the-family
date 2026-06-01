import { loadConfig } from "./config.js";
import { buildApp } from "./app.js";
import { Logger } from "./logger.js";
import { startHttpRuntime } from "./http/server.js";

const config = loadConfig();
const app = buildApp(config);

Logger.info("[Bootstrap] Starting Telegram bot", {
  appEnv: config.appEnv,
  storageDriver: config.storageDriver,
  bscChainId: config.bscChainId
});

const runtime = await startHttpRuntime(app, config);

let shuttingDown = false;

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  Logger.info("[Bootstrap] Received shutdown signal", { signal });
  try {
    await runtime.stop();
  } catch (error) {
    Logger.error("[Bootstrap] Shutdown failed", { err: error instanceof Error ? error : undefined });
    process.exit(1);
  }
  process.exit(0);
}

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});
process.on("SIGINT", () => {
  void shutdown("SIGINT");
});
