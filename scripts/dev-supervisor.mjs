// Local development process supervisor for the Kindred product.
//
// Phase 3A scope: root `pnpm dev` starts the production Vite frontend
// (`artifacts/kindred-coach`) and the Express API (`artifacts/api-server`)
// together, with coordinated shutdown and clear failure reporting. This module
// is deliberately small and dependency-free: it only uses Node 24 built-ins.
//
// Design rules implemented here:
//   - Each child runs the existing workspace package command (Vite/API) so the
//     real product is tested, never a stand-in.
//   - Every owned child — including build-phase wrappers — is spawned detached
//     (its own process group) so cleanup signals reach pnpm wrappers and their
//     descendants, without ever using `pkill`/`killall`, port-based process
//     killing, or signalling the invoking shell's group.
//   - Signal handling (SIGINT/SIGTERM) is installed before *any* work begins so
//     interruption covers database provisioning, the build phase, spawns, and
//     runtime children. An interruption cancels further startup.
//   - Port preflight is a courtesy check; the supervisor still reacts to an
//     actual bind failure that turns into a nonzero child exit.
//   - Cleanup is scoped to owned process groups and is bounded: a graceful
//     window (SIGTERM), then a bounded force window (SIGKILL), then it resolves.
//     It also stops any registered shutdown services (e.g. a disposable DB),
//     and those service stops are bounded too: each service's graceful stop may
//     not exceed the force window, after which a supported force fallback
//     releases its owned resources and failure is reported accurately if
//     cleanup cannot be verified. A never-settling service cannot hang shutdown.
//   - A child process group is considered stopped only when every member has
//     exited — not merely when its direct child exits. Cleanup therefore waits
//     for lingering descendants (wrappers that exit while a grandchild stays).
//
// Module layout (this file is the public entry point and only re-exports):
//   - dev-supervisor-config.mjs    .env parsing, ports, config, product jobs
//   - dev-supervisor-probes.mjs    port preflight and readiness checks
//   - dev-supervisor-process.mjs   internal process-group primitives
//   - dev-supervisor-shutdown.mjs  signal handling and bounded cleanup
//   - dev-supervisor-database.mjs  owned disposable-database worker
//   - dev-supervisor-run.mjs       build phase and runtime supervision

export {
  DEFAULT_API_PORT,
  DEFAULT_DEV_DB_MODE,
  DEFAULT_DEV_DB_NAME,
  DEFAULT_WEB_PORT,
  DEV_ENV_FILE,
  createJobs,
  loadEnvFile,
  mergeDevEnv,
  minimalProcessEnv,
  parseDevConfig,
  parseEnvFile,
  parsePort,
} from "./dev-supervisor-config.mjs";
export {
  checkPortFree,
  checkPortInUse,
  preflightPorts,
  waitForReadiness,
} from "./dev-supervisor-probes.mjs";
export {
  createShutdownCoordinator,
  forceKillOwnedGroups,
} from "./dev-supervisor-shutdown.mjs";
export {
  DB_WORKER_READY_PREFIX,
  createDatabaseWorker,
} from "./dev-supervisor-database.mjs";
export { runDevelopment } from "./dev-supervisor-run.mjs";
