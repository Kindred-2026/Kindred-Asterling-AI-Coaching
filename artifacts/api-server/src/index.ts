import app from "./app";
import { logger } from "./lib/logger";
import { startReminderScheduler } from "./lib/reminderScheduler";
import { stopReminderScheduler } from "./lib/reminderScheduler";
import { validateRuntimeConfig } from "./lib/validateConfig";
import { closeDatabase, initializeDatabase } from "@workspace/db";

validateRuntimeConfig();
const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

await initializeDatabase();

const server = app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  startReminderScheduler();
});

let shuttingDown = false;
async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "Graceful shutdown started");
  stopReminderScheduler();

  const forceExit = setTimeout(() => {
    logger.error("Graceful shutdown timed out");
    process.exit(1);
  }, 30_000);
  forceExit.unref();

  server.close(async (err) => {
    let shutdownFailed = Boolean(err);
    try {
      if (err) logger.error({ err }, "HTTP server close failed");
      try {
        await closeDatabase();
      } catch (databaseError) {
        shutdownFailed = true;
        logger.error({ err: databaseError }, "Database close failed");
      }
      if (!shutdownFailed) {
        logger.info("HTTP server and database pool closed");
      }
      process.exitCode = shutdownFailed ? 1 : 0;
    } finally {
      clearTimeout(forceExit);
    }
  });
}

process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("SIGINT", () => void shutdown("SIGINT"));
