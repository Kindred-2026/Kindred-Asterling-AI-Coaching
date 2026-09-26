// Owned disposable-database worker for the dev supervisor. The worker itself
// lives in dev-db-worker.mjs; this module spawns and supervises it.

import { spawn } from "node:child_process";
import path from "node:path";

import { minimalProcessEnv } from "./dev-supervisor-config.mjs";
import { debugLog } from "./dev-supervisor-process.mjs";

// Protocol constant (must match the worker's stdout prefix).
export const DB_WORKER_READY_PREFIX = "KINDRED_DB_WORKER_READY";

// Spawns the disposable-MongoDB worker subprocess as an owned process group,
// registers it on the coordinator (so interruption is bounded), and resolves
// `ready` with the real `mongodb://...` URI once the worker reports readiness.
//
// The worker is an owned, detached process group: graceful stop (SIGTERM) is
// handled by the worker's own signal handler using only the real
// MongoMemoryReplSet.stop(); force stop is a SIGKILL of this owned group — a
// real, supported OS-level release that frees the bound port and kills any
// mongod descendant. No fixture-only or invented library forceStop() method
// exists or is used.
export function createDatabaseWorker({
  coordinator,
  repoRoot,
  logger = console,
  workerPath,
  extraEnv = {},
  spawnFn = spawn,
} = {}) {
  const resolvedWorkerPath =
    workerPath ?? path.join(repoRoot, "scripts", "dev-db-worker.mjs");
  const env = { ...minimalProcessEnv(), ...extraEnv };
  const child = spawnFn(process.execPath, [resolvedWorkerPath], {
    cwd: repoRoot,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });
  const group = {
    job: { name: "database" },
    child,
    spawnError: null,
    postExitGoneObserved: false,
  };
  coordinator.groups.set("database", group);
  debugLog(
    `db-worker spawn pid=${child.pid} worker=${resolvedWorkerPath} detached=true`,
  );

  let settled = false;
  let resolveReady;
  let rejectReady;
  let stdoutBuf = "";

  const ready = new Promise((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });

  child.stdout.on("data", (chunk) => {
    stdoutBuf += chunk.toString("utf8");
    let idx;
    while ((idx = stdoutBuf.indexOf("\n")) >= 0) {
      const line = stdoutBuf.slice(0, idx).replace(/\r$/, "").trimEnd();
      stdoutBuf = stdoutBuf.slice(idx + 1);
      if (line.startsWith(`${DB_WORKER_READY_PREFIX} `)) {
        const uri = line.slice(DB_WORKER_READY_PREFIX.length + 1).trim();
        if (!settled && uri) {
          settled = true;
          debugLog(`db-worker ready pid=${child.pid}`);
          resolveReady(uri);
        }
      }
    }
  });
  child.stdout.on("error", () => {});
  child.stderr.on("data", (chunk) => {
    const text = `${chunk}`.trimEnd();
    if (text) logger.error(`[db-worker] ${text}`);
  });

  child.once("error", (err) => {
    group.spawnError = err;
    coordinator.groups.delete("database");
    debugLog(`db-worker spawn error pid=${child.pid} message=${err.message}`);
    if (!settled) {
      settled = true;
      rejectReady(
        new Error(`could not start database worker: ${err.message}`),
      );
    }
  });
  child.once("exit", (code, signal) => {
    debugLog(`db-worker exit pid=${child.pid} code=${code} signal=${signal}`);
    if (!settled) {
      settled = true;
      rejectReady(
        new Error(
          `database worker exited before reporting readiness (code=${code ?? "null"}, signal=${signal ?? "none"})`,
        ),
      );
    }
  });

  return { ready, group, child };
}
