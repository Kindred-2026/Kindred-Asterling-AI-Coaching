// Job-wiring and runtime supervision for the dev supervisor: the build phase,
// runtime children, readiness, and the final exit result.

import { spawn } from "node:child_process";

import { waitForReadiness } from "./dev-supervisor-probes.mjs";
import { debugLog, signalGroup, spawnOwned } from "./dev-supervisor-process.mjs";
import { createShutdownCoordinator } from "./dev-supervisor-shutdown.mjs";

// Run a set of jobs ({ build } jobs run to completion first) and resolve with
// the process group's final { code, reason } once everything has stopped.
//
// `coordinator` is shared with the caller (so the disposable database can be
// stopped on every exit path, including a signal during a build). Signal
// handlers belong to the coordinator; interruption cancels further startup.
export async function runDevelopment(jobs, options = {}) {
  const {
    logger = console,
    pollMs = 200,
    readyTimeoutMs = 60_000,
    buildFlushMs = 5000,
    onReady = null,
    coordinator: providedCoordinator = null,
  } = options;

  const coordinator = providedCoordinator ?? createShutdownCoordinator({ logger });
  const ownsCoordinator = !providedCoordinator;

  const finish = async (result) => {
    if (ownsCoordinator) {
      await coordinator.stopEverything();
      coordinator.dispose();
    }
    debugLog(`runDevelopment resolved code=${result.code} reason=${result.reason ?? "none"}`);
    return result;
  };

  const buildJobs = jobs.filter((job) => job.build);
  const runtimeJobs = jobs.filter((job) => !job.build);
  const interruptible = () => Boolean(coordinator.stopReason);

  // Wait until a whole build group is gone (direct child AND descendants), so
  // we never carry a live owned group forward after a "successful" build.
  const flushGroup = (group) =>
    new Promise((resolve) => {
      const deadline = Date.now() + buildFlushMs;
      const tick = () => {
        if (interruptible() || coordinator.groupFullyStopped(group)) {
          return resolve({ stopped: coordinator.groupFullyStopped(group) });
        }
        if (Date.now() >= deadline) {
          signalGroup(group.child, "SIGKILL");
          return resolve({ stopped: false });
        }
        setTimeout(tick, pollMs);
      };
      tick();
    });

  const runCore = async () => {
    // 1. Build phase: run to completion; a failure aborts before any child
    //    starts. Builds are owned process groups, so interruption stops them
    //    too and no runtime child is spawned afterward.
    for (const job of buildJobs) {
      if (interruptible()) return { code: 0, reason: coordinator.stopReason };
      const buildResult = await spawnOwned(job, coordinator, logger);
      if (interruptible()) return { code: 0, reason: coordinator.stopReason };
      if (buildResult.code !== 0) {
        return { code: buildResult.code, reason: `${job.name} failed` };
      }
      const group = coordinator.groups.get(job.name);
      const flush = await flushGroup(group);
      if (interruptible()) return { code: 0, reason: coordinator.stopReason };
      if (!flush.stopped) {
        return {
          code: 1,
          reason: `${job.name} exited but left a running descendant`,
        };
      }
    }
    if (runtimeJobs.length === 0) return { code: 0, reason: "no runtime jobs" };

    let settled = false;
    let resolveOuter;
    const outer = new Promise((resolve) => {
      resolveOuter = resolve;
    });

    coordinator.onStop(() => {
      if (!settled) {
        settled = true;
        resolveOuter({
          code: 0,
          reason: coordinator.stopReason ?? "shutdown",
        });
      }
    });

    const settle = async (nextResult) => {
      if (settled) return;
      settled = true;
      try {
        await coordinator.stopEverything();
      } finally {
        resolveOuter(nextResult);
      }
    };

    const running = () => settled || interruptible();

    // 2. Spawn runtime children as owned process groups.
    for (const job of runtimeJobs) {
      if (running()) return { code: 0, reason: coordinator.stopReason };
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
        void settle({ code: 1, reason: `spawn error: ${job.name}` });
      });
      child.once("exit", (code, signal) => {
        debugLog(`exit name=${job.name} pid=${child.pid} code=${code} signal=${signal}`);
        if (settled || interruptible()) return;
        const exitCode = typeof code === "number" ? code : 1;
        void settle({
          code: exitCode,
          reason: `${job.name} exited (code=${code ?? "null"}, signal=${signal ?? "none"})`,
        });
      });
    }

    // 3. Readiness: wait until the frontend binds its port and the API answers
    //    /api/healthz/db (which also verifies the development database).
    const runtimeWithReadiness = runtimeJobs.filter((job) => job.readiness);
    if (runtimeWithReadiness.length === 0) return outer;
    void Promise.all(
      runtimeWithReadiness.map((job) =>
        waitForReadiness(job, {
          pollMs,
          timeoutMs: readyTimeoutMs,
          cancelled: running,
        }),
      ),
    ).then((results) => {
      if (running()) return;
      const failed = results.filter((entry) => !entry.ok);
      if (failed.length > 0) {
        logger.error(
          `[dev] ${failed
            .map((entry) => entry.job.name)
            .join(", ")} did not become ready within ${readyTimeoutMs} ms.`,
        );
        void settle({ code: 1, reason: "readiness failed" });
      } else if (onReady) {
        onReady(results);
      }
    });
    return outer;
  };

  try {
    return await finish(await runCore());
  } catch (err) {
    logger.error(`[dev] unexpected launcher error: ${err?.message ?? err}`);
    return finish({ code: 1, reason: "unexpected launcher error" });
  }
}
