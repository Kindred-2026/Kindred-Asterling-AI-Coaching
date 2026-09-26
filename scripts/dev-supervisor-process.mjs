// Process-group primitives shared by the dev supervisor modules: debug audit
// logging, owned process-group signalling and spawning, and small promise
// helpers. Internal to the supervisor; not re-exported by dev-supervisor.mjs.

import { spawn } from "node:child_process";
import { appendFileSync } from "node:fs";

// When KINDRED_DEV_DEBUG_LOG is set, append an audit trail of child lifecycle
// events (spawn pid, exit, signals, cleanup) to that file. Off by default.
export function debugLog(message) {
  const file = process.env.KINDRED_DEV_DEBUG_LOG;
  if (file) {
    try {
      appendFileSync(file, `${Date.now()} ${message}\n`);
    } catch {
      // best-effort diagnostics only
    }
  }
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Resolve once `promise` settles, or within `ms` — whichever comes first. When
// the deadline lapses `onTimeout()` runs (a synchronous, best-effort force
// fallback that must not block), so a service whose graceful stop never settles
// can never hang shutdown indefinitely.
export function withTimeout(promise, ms, onTimeout) {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      onTimeout();
      resolve({ timedOut: true });
    }, ms);
    promise.then(
      () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ timedOut: false });
      },
      (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ timedOut: false, error: err });
      },
    );
  });
}

// ---------------------------------------------------------------------------
// Process-group supervision
// ---------------------------------------------------------------------------

// A process group exists when signalling it with signal 0 does not report
// ESRCH. EPERM ("exists but not signallable") also means it exists.
export function groupExists(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(-pid, 0);
    return true;
  } catch (err) {
    return err.code === "EPERM";
  }
}

// Signal every process in the child's group (spawned detached => the child is
// its own process-group leader, so pnpm wrappers and their descendants are all
// covered). Scoped strictly to children owned by this invocation; never the
// invoking shell's group (we always use the negative "group" form, and only
// for PIDs we successfully spawned).
export function signalGroup(child, signal) {
  const pid = child?.pid;
  if (!Number.isInteger(pid) || pid <= 0) {
    debugLog(`skip signal pid=${String(pid)} signal=${signal} invalid-pid`);
    return;
  }
  debugLog(
    `signal pid=${pid} signal=${signal} ` +
      `groupExists=${groupExists(pid)} ` +
      `groupCheck=${(() => {
        try {
          process.kill(-pid, 0);
          return "group-exists";
        } catch (err) {
          return err.code;
        }
      })()}`,
  );
  // Only act on a group that exists right now; never signal an absent group.
  if (!groupExists(pid)) return;
  try {
    process.kill(-pid, signal);
  } catch (err) {
    if (err?.code !== "ESRCH") {
      // eslint-disable-next-line no-console
      console.error(`[dev] failed to signal ${child?.job?.name ?? "child"}: ${err.message}`);
    }
  }
}

// Run a child as an owned process group and resolve when its *direct* child
// exits. Group-completion (descendants) is handled by the shutdown coordinator.
export function spawnOwned(job, coordinator, logger) {
  return new Promise((resolve) => {
    const child = spawn(job.command, job.args, {
      cwd: job.cwd,
      env: job.env,
      stdio: job.stdio ?? "inherit",
      detached: true,
    });
    const group = {
      job,
      child,
      spawnError: null,
      // Once the direct child exits we must still confirm the *group* is gone
      // before considering this group stopped. If we ever observe the group as
      // absent we treat it as permanently stopped (a later "exists" can only be
      // an unrelated reuse of the pgid, which we must never signal).
      postExitGoneObserved: false,
    };
    coordinator.groups.set(job.name, group);
    debugLog(
      `spawn name=${job.name} pid=${child.pid} detached=${true} ` +
        `cmd=${job.command} args=${JSON.stringify(job.args)}`,
    );
    child.once("error", (err) => {
      group.spawnError = err;
      coordinator.groups.delete(job.name);
      logger.error(`[dev] failed to start ${job.name}: ${err.message}`);
      debugLog(`error name=${job.name} pid=${child.pid} message=${err.message}`);
      resolve({ code: 1, reason: `spawn error: ${job.name}`, error: err });
    });
    child.once("exit", (code, signal) => {
      debugLog(`exit name=${job.name} pid=${child.pid} code=${code} signal=${signal}`);
      resolve({
        code: typeof code === "number" ? code : 1,
        signal: signal ?? null,
      });
    });
  });
}

export function deferred() {
  let resolve;
  const promise = new Promise((res) => {
    resolve = res;
  });
  return { promise, resolve };
}
