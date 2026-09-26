// Shutdown coordination for the dev supervisor: signal handling, bounded
// cleanup of owned process groups, and bounded stops of registered services.

import {
  debugLog,
  deferred,
  groupExists,
  signalGroup,
  withTimeout,
} from "./dev-supervisor-process.mjs";

// Coordinates SIGINT/SIGTERM handling, owned process groups and shutdown
// services (such as a disposable database) for one launcher invocation.
//
// Signal handlers are installed by the coordinator, so interruption covers the
// full startup lifecycle: database provisioning, builds, spawns and runtime.
export function createShutdownCoordinator(options = {}) {
  const {
    logger = console,
    graceMs = 8000,
    forceGraceMs = 4000,
    gracefulPollMs = 100,
  } = options;

  const groups = new Map();
  const services = new Map();

  let stopping = null;
  let stopped = false;
  let cleanupIncompleteFlag = false;
  const stopWaiters = [];
  const onStopCallbacks = [];

  const markStopped = () => {
    if (stopped) return;
    stopped = true;
    for (const waiter of stopWaiters) waiter();
    stopWaiters.length = 0;
    for (const callback of onStopCallbacks) callback();
  };

  // A group is fully stopped when: its spawn never attached a group, OR its
  // direct child has exited AND the process group no longer exists (or was
  // observed absent once, so a later "exists" can only be pgid reuse).
  const groupFullyStopped = (group) => {
    if (group.spawnError) return true;
    const { child } = group;
    const directAlive =
      child.exitCode === null && child.signalCode === null && !child.killed;
    if (directAlive) return false;
    if (group.postExitGoneObserved) return true;
    if (!groupExists(child.pid)) {
      group.postExitGoneObserved = true;
      return true;
    }
    return false;
  };

  const aliveGroups = () =>
    [...groups.values()].filter((group) => !groupFullyStopped(group));

  const stopEverything = () => {
    if (stopping) return stopping.promise;
    stopping = deferred();

    // Bounded service shutdown, decoupled from whether any process groups are
    // alive. Each service's graceful stop gets its own force window; if it has
    // not settled by then, a supported force fallback releases its owned
    // resources and the service is reported as "unverified" (cleanup could not
    // be verified). `Promise.all` over these bounded outcomes can no longer
    // hang shutdown on a never-settling service stop.
    const serviceStops = [...services.entries()].map(async ([name, service]) => {
      try {
        debugLog(`service stop name=${name}`);
        const outcome = await withTimeout(service.stop(), forceGraceMs, () => {
          if (typeof service.forceStop === "function") {
            try {
              debugLog(`service force-stop name=${name}`);
              const forced = service.forceStop();
              if (forced && typeof forced.then === "function") {
                forced.catch(() => {});
              }
            } catch (err) {
              logger.error(
                `[dev] force stop for service ${name} failed: ${err?.message ?? err}`,
              );
            }
          }
        });
        if (outcome.timedOut) {
          cleanupIncompleteFlag = true;
          logger.error(
            `[dev] service ${name} did not stop within ${forceGraceMs} ms; ` +
              "own resources were force-released if a supported fallback exists, " +
              "but its cleanup could not be verified.",
          );
        } else if (outcome.error) {
          cleanupIncompleteFlag = true;
          logger.error(
            `[dev] failed to stop service ${name}: ${outcome.error?.message ?? outcome.error}`,
          );
        } else {
          debugLog(`service stopped name=${name}`);
        }
      } catch (err) {
        // Service itself threw outside the wrapped promise (e.g. force stop).
        cleanupIncompleteFlag = true;
        logger.error(
          `[dev] failed to stop service ${name}: ${err?.message ?? err}`,
        );
      }
    });
    const allServiceStops = Promise.all(serviceStops);

    // Graceful phase: SIGTERM every owned group.
    for (const group of groups.values()) {
      if (!group.spawnError) signalGroup(group.child, "SIGTERM");
    }

    const finishStop = async () => {
      // Wait for the (bounded) service stops; never declare the stop complete
      // while an initialization that produced resources is still in flight.
      await allServiceStops;
      markStopped();
      stopping.resolve();
    };

    const deadline = Date.now() + graceMs;
    const tick = () => {
      const alive = aliveGroups();
      if (alive.length === 0) {
        void finishStop();
        return;
      }
      if (Date.now() >= deadline) {
        const names = alive.map((group) => group.job.name).join(", ");
        logger.error(
          `[dev] graceful shutdown timed out; force-stopping: ${names}`,
        );
        const forceTick = () => {
          const stillAlive = aliveGroups();
          const forceDeadlineHit = Date.now() >= deadline + forceGraceMs;
          if (stillAlive.length === 0 || forceDeadlineHit) {
            void finishStop();
            return;
          }
          for (const group of stillAlive) {
            if (!group.spawnError) signalGroup(group.child, "SIGKILL");
          }
          debugLog(
            `force-stopping names=${stillAlive.map((g) => g.job.name).join(",")}`,
          );
          setTimeout(forceTick, gracefulPollMs);
        };
        forceTick();
        return;
      }
      setTimeout(tick, gracefulPollMs);
    };
    tick();

    return stopping.promise;
  };

  const stopReasonHolder = { reason: null };

  const requestStop = (signal) => {
    if (!stopReasonHolder.reason) stopReasonHolder.reason = signal;
    // Bounded idempotent cleanup; a second signal just re-joins the same run.
    const promise = stopEverything();
    promise.then(markStopped);
    return promise;
  };

  const onSignal = (signal) => {
    logger.log(`[dev] received ${signal}; stopping dev servers...`);
    void requestStop(signal);
  };

  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);

  // Hard-exit safety net: if this process is about to die without running the
  // normal cleanup path (e.g. SIGKILL of the supervisor), still stop the owned
  // detached groups best-effort.
  const onHardExit = () => {
    for (const group of groups.values()) {
      if (!group.spawnError) signalGroup(group.child, "SIGKILL");
    }
  };
  process.on("exit", onHardExit);

  return {
    groups,
    services,
    addService(name, service) {
      services.set(name, service);
      return service;
    },
    // True once a stop has been requested for any reason.
    get stopReason() {
      return stopReasonHolder.reason;
    },
    groupFullyStopped,
    requestStop,
    stopEverything,
    // True once a stop has completed but a registered service could not be
    // verified as stopped (its graceful stop failed or never settled). Callers
    // use this to report the shutdown accurately.
    cleanupIncomplete() {
      return cleanupIncompleteFlag;
    },
    // Resolves when the (first) stop has fully completed. Never resolves just
    // because it was called; used to bound provisioning/startup on interruption.
    whenStopped() {
      if (stopped) return Promise.resolve();
      if (stopping) return stopping.promise;
      return new Promise((resolve) => stopWaiters.push(resolve));
    },
    // Register a callback invoked after a stop completes (used by runDevelopment
    // to unblock its own outer promise on signal).
    onStop(callback) {
      onStopCallbacks.push(callback);
    },
    dispose() {
      process.removeListener("SIGINT", onSignal);
      process.removeListener("SIGTERM", onSignal);
      process.removeListener("exit", onHardExit);
    },
  };
}

// Best-effort synchronous kill of owned groups on parent exit (e.g. hard
// exits) so detached children do not outlive an invocation unexpectedly.
export function forceKillOwnedGroups(runningGroups) {
  for (const group of runningGroups) {
    if (!group.spawnError) signalGroup(group.child, "SIGKILL");
  }
}
