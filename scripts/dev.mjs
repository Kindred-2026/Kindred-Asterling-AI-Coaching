#!/usr/bin/env node
// Root `pnpm dev` launcher for the Kindred product (Phase 3A).
//
// Starts the production React/Vite frontend (artifacts/kindred-coach) and the
// Express API (artifacts/api-server) together, after documented first-time
// configuration (.env.dev).
//
// Configuration precedence: inherited process environment > root `.env.dev` >
// built-in defaults.
//
// Signal coverage spans the entire startup lifecycle. The shutdown coordinator
// (and its SIGINT/SIGTERM handlers) is created before any async work, and the
// disposable database is registered as an OWNED PROCESS GROUP before it is
// provisioned, so a stop request during an in-flight provisioning is handled
// by the DB worker and the owned group is stopped on every exit path. Cleanup
// is bounded and idempotent for both process groups and services. Interruption
// at any point cancels further startup. There are no `process.exit()` calls:
// the process exits with the reported exit code after cleanup completes, and a
// shutdown whose cleanup could not be verified is reported as a failure.
//
// The disposable MongoDB replica set runs inside the dedicated worker script
// scripts/dev-db-worker.mjs using the REAL mongodb-memory-server
// MongoMemoryReplSet interface. Shutdown is bounded with only real, supported
// mechanisms: SIGTERM reaches the worker's own graceful stop() (the worker is
// an owned process group), and a stop that never settles is released by
// SIGKILLing that owned group — never by relying on an invented library
// "forceStop" method (MongoMemoryReplSet does not expose one).

import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  createDatabaseWorker,
  createJobs,
  createShutdownCoordinator,
  DEV_ENV_FILE,
  DEFAULT_DEV_DB_NAME,
  loadEnvFile,
  parseDevConfig,
  preflightPorts,
  runDevelopment,
} from "./dev-supervisor.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envFilePath = path.join(repoRoot, DEV_ENV_FILE);

const envNumber = (name, fallback) => {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

// The coordinator owns process-group tracking, shutdown services and the
// SIGINT/SIGTERM handlers. It must exist before config parsing and database
// provisioning so an interruption during any startup phase is handled and
// cancels further startup. Grace windows are env-tunable for fast tests.
const coordinator = createShutdownCoordinator({
  logger: console,
  graceMs: envNumber("KINDRED_DEV_GRACE_MS", 8000),
  forceGraceMs: envNumber("KINDRED_DEV_FORCE_GRACE_MS", 4000),
  gracefulPollMs: envNumber("KINDRED_DEV_GRACEFUL_POLL_MS", 100),
});

const interrupted = () => Boolean(coordinator.stopReason);

async function provisionDatabase(config) {
  if (config.dbMode !== "disposable") return { code: 0, reason: null };
  if (config.apiEnv.MONGODB_URI) {
    console.error(
      "[dev] KINDRED_DEV_DB=disposable overrides MONGODB_URI/MONGODB_DATABASE for the API child; set KINDRED_DEV_DB=external to use your own development database.",
    );
  }

  // Provisioning owns one resource: a disposable MongoDB replica set running
  // in the dedicated (detached, own-process-group) worker. The worker resolves
  // `workerGroup.ready` with the real URI only after the real
  // MongoMemoryReplSet.create() has started. The worker is registered as an
  // owned group BEFORE readiness so a stop request during the (possibly long)
  // start is covered from the very first millisecond:
  //
  //   - A swift stop during create(): the worker waits for the creation to
  //     settle and then stops whatever replica set appeared; the owned group's
  //     exit ends the stop. No MONGODB_URI or startup follows an interruption.
  //   - A create() or stop() that never settles: the owned group is
  //     force-released with SIGKILL after the coordinator's grace window — a
  //     real, supported OS-level release that frees the port and terminates any
  //     mongod descendant. Shutdown can never hang on the database, and there
  //     is no fixture-only or invented forceStop() anywhere.
  const workerEnv = {
    KINDRED_DEV_DB_VERSION: "8.0.12",
    KINDRED_DEV_DB_REPLSET_COUNT: "1",
  };
  for (const key of [
    "KINDRED_DEV_DB_FACTORY",
    "KINDRED_DEV_DB_FACTORY_OUT",
    "KINDRED_DEV_DEBUG_LOG",
    "FAKE_DB_FACTORY_MODE",
    "FAKE_DB_FACTORY_DELAY_MS",
    "FAKE_DB_FACTORY_PORT",
  ]) {
    if (process.env[key] !== undefined) workerEnv[key] = process.env[key];
  }

  const worker = createDatabaseWorker({
    coordinator,
    repoRoot,
    logger: console,
    extraEnv: workerEnv,
  });

  try {
    const uri = await Promise.race([
      worker.ready,
      coordinator.whenStopped().then(() => null),
    ]);
    // whenStopped() resolves only after every owned process group (including
    // the database worker) is actually gone, so a mid-provision interruption
    // stops here without starting anything and without a stale resource.
    if (interrupted() || uri === null || uri === undefined) {
      return { code: 0, reason: coordinator.stopReason ?? "shutdown" };
    }
    config.apiEnv.MONGODB_URI = uri;
    config.apiEnv.MONGODB_DATABASE = DEFAULT_DEV_DB_NAME;
    console.error(
      "[dev] Provisioned a disposable MongoDB replica set for development (data is lost when this command exits).",
    );
    return { code: 0, reason: null };
  } catch (err) {
    if (interrupted()) return { code: 0, reason: coordinator.stopReason };
    console.error(
      `[dev] Unable to provision the disposable development database: ${err?.message ?? err}`,
    );
    console.error(
      "[dev] Set KINDRED_DEV_DB=external and point MONGODB_URI at a dedicated development MongoDB (see docs/local-development.md).",
    );
    return { code: 1, reason: "database provisioning failed" };
  }
}

async function buildJobSet(config) {
  const fixturePath = process.env.KINDRED_DEV_JOBS_FIXTURE;
  if (fixturePath) {
    const fixture = await import(
      pathToFileURL(path.resolve(repoRoot, fixturePath)).href
    );
    return fixture.buildJobs(config, { cwd: repoRoot });
  }
  return createJobs(config, { cwd: repoRoot });
}

async function run() {
  let config;
  try {
    config = parseDevConfig({
      processEnv: process.env,
      fileEnv: loadEnvFile(envFilePath),
    });
  } catch (err) {
    console.error(`[dev] Invalid local development configuration: ${err.message}`);
    console.error(
      `[dev] Copy ${DEV_ENV_FILE}.example to ${DEV_ENV_FILE} and follow docs/local-development.md.`,
    );
    return { code: 1, reason: "invalid local development configuration" };
  }

  const { webPort, apiPort, apiOrigin } = config;

  const occupied = await preflightPorts([
    { port: webPort, label: "KINDRED_WEB_PORT (frontend)" },
    { port: apiPort, label: "KINDRED_API_PORT (API)" },
  ]);
  if (occupied.length > 0) {
    for (const entry of occupied) {
      console.error(`[dev] Port ${entry.port} (${entry.label}) is already in use.`);
    }
    console.error(
      "[dev] Stopping; the conflicting process was left untouched. Change the port in .env.dev or stop the other process.",
    );
    return { code: 1, reason: "ports in use" };
  }
  if (interrupted()) return { code: 0, reason: coordinator.stopReason };

  // Provision the development database before the API starts. If an
  // interruption arrives mid-provision, the coordinator stops registered
  // services and we exit cleanly without spawning anything.
  const provisioning = provisionDatabase(config).then(
    (outcome) => outcome ?? { code: 1, reason: "database provisioning failed" },
    (err) => {
      console.error(
        `[dev] Unable to provision the development database: ${err?.message ?? err}`,
      );
      return { code: 1, reason: "database provisioning failed" };
    },
  );
  const dbOutcome = await Promise.race([
    provisioning,
    coordinator.whenStopped().then(() => ({ interrupted: true })),
  ]);
  // An interruption anywhere (including one that wins the race only after
  // provisioning resolved, possibly with a late failure) stops here cleanly.
  if (coordinator.stopReason) return { code: 0, reason: coordinator.stopReason };
  if (dbOutcome.interrupted) return { code: 0, reason: coordinator.stopReason };
  if (dbOutcome.code !== 0) return dbOutcome;

  const jobs = await buildJobSet(config);
  if (interrupted()) return { code: 0, reason: coordinator.stopReason };

  console.error(
    `[dev] Starting frontend at http://localhost:${webPort} and API at ${apiOrigin} ...`,
  );

  const result = await runDevelopment(
    [jobs.build, jobs.web, jobs.api].filter(Boolean),
    {
      logger: console,
      coordinator,
      buildFlushMs: envNumber("KINDRED_DEV_BUILD_FLUSH_MS", 5000),
      onReady: () => {
        console.error(
          `[dev] Both development servers are ready: frontend at http://localhost:${webPort}, API at ${apiOrigin} (health: ${apiOrigin}/api/healthz/db).`,
        );
      },
    },
  );
  return result;
}

const result = await run().then(async (outcome) => {
  // Bounded idempotent cleanup on every exit path (partial init, exceptions,
  // build failure, runtime exit, signal), then release the signal handlers.
  await coordinator.stopEverything();
  coordinator.dispose();
  // A shutdown whose cleanup could not be verified (a service stop failed or
  // never settled, and own resources had to be force-released) is a failure:
  // report it with a non-zero exit instead of a silent clean stop.
  if (outcome.code === 0 && coordinator.cleanupIncomplete()) {
    return { code: 1, reason: "shutdown could not verify complete cleanup" };
  }
  return outcome;
});

if (result.code !== 0) {
  console.error(`[dev] Stopped with errors: ${result.reason}`);
}
process.exitCode = result.code ?? 1;