// `pnpm verify` — one verification command for the production workspace.
//
// Runs the same components as the production GitHub Actions path in a fixed order,
// from an isolated safe child environment that never requires or forwards
// production secrets. It fails fast: the first failing component stops the run
// with the component name and its exit code, and temporary resources are
// released on success or failure.

import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { candidateState, invalidateEvidence, writeEvidence } from "./verify-evidence.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

// Export the component list so tests and CI documentation stay in sync. The
// verification/release machinery regression tests live in the maintained
// path, so a bug in evidence handling fails a later `pnpm verify` run too.
export const COMPONENTS = [
  { name: "format:check", cmd: "node", args: ["scripts/format-check.mjs"] },
  { name: "typecheck:production", cmd: "pnpm", args: ["run", "typecheck:production"] },
  { name: "test:dev-supervisor", cmd: "pnpm", args: ["run", "test:dev-supervisor"] },
  { name: "test:verify", cmd: "pnpm", args: ["run", "test:verify"] },
  { name: "test:release-check", cmd: "pnpm", args: ["run", "test:release-check"] },
  {
    name: "test:frontend",
    cmd: "pnpm",
    args: ["--filter", "@workspace/kindred-coach", "run", "test"],
  },
  { name: "test:api", cmd: "pnpm", args: ["--filter", "@workspace/db", "run", "test:api"] },
  { name: "test:journey", cmd: "pnpm", args: ["--filter", "@workspace/db", "run", "test:journey"] },
  { name: "generate:check", cmd: "node", args: ["scripts/verify-generated.mjs"] },
  { name: "build:api", cmd: "pnpm", args: ["--filter", "@workspace/api-server", "run", "build"] },
  {
    name: "build:frontend",
    cmd: "pnpm",
    args: ["--filter", "@workspace/kindred-coach", "run", "build"],
    synthetic: true,
  },
];

// Synthetic, non-secret public build identifiers injected into the frontend
// build so `pnpm verify` (and the shared CI runner) is deterministic without a
// committed or local `.env` file. These are clearly-fake placeholders, never
// real tenant values; real deployment configuration and live sign-in remain
// separate external acceptance gates.
export const SYNTHETIC_BUILD_CONFIG = {
  VITE_AUTH0_DOMAIN: "synthetic.kindred.local",
  VITE_AUTH0_CLIENT_ID: "synthetic-kindred-public-client",
  VITE_AUTH0_AUDIENCE: "https://synthetic.kindred.local/api",
};

// Evidence is only recorded when the run covered the exact expected component
// set; a subset run is never a full verification.
export function componentsComplete(passed) {
  const expected = COMPONENTS.map((c) => c.name);
  return (
    Array.isArray(passed) &&
    passed.length === expected.length &&
    [...passed].sort().join("\0") === [...expected].sort().join("\0")
  );
}

const PASS_THROUGH_KEYS = [
  "PATH",
  "HOME",
  "TMPDIR",
  "TMP",
  "TEMP",
  "TERM",
  "LANG",
  "LC_ALL",
  "CI",
  "FORCE_COLOR",
  "NO_COLOR",
  "NODE_ENV",
  "USER",
  "LOGNAME",
  "SHELL",
];

// Build the child environment: keep only keys needed to execute the commands
// and never forward secrets, stale local Auth0/DB environment files, or real
// VITE_* build values into the checks. Builds receive explicit synthetic public
// identifiers (SYNTHETIC_BUILD_CONFIG) so they are deterministic and isolated
// from any ignored local env overrides.
export function buildChildEnv(parent = process.env, { synthetic = false } = {}) {
  const env = {};
  for (const key of PASS_THROUGH_KEYS) {
    if (parent[key] !== undefined) env[key] = parent[key];
  }
  env.NODE_ENV ??= "test";
  env.CI ??= "1";
  env.HELCIM_PAYMENTS_ENABLED ??= "false";
  env.LOG_LEVEL ??= "silent";
  if (synthetic) Object.assign(env, SYNTHETIC_BUILD_CONFIG);
  return env;
}

// Safe child environment for one component: the secret-stripping baseline plus
// synthetic public build config for components that need it. The GitHub Actions runner
// (scripts/ci-run.mjs) calls this same function, so CI and local verify cannot
// drift.
export function componentEnv(component, parent = process.env) {
  return buildChildEnv(parent, { synthetic: Boolean(component.synthetic) });
}

export class VerifyComponentError extends Error {
  constructor(component, exitCode, signal) {
    super(
      `verify component "${component}" failed (exit=${exitCode ?? "null"} signal=${signal ?? "none"})`,
    );
    this.name = "VerifyComponentError";
    this.component = component;
    this.exitCode = exitCode;
    this.signal = signal;
  }
}

export class VerifyInterruptedError extends Error {
  constructor(signal) {
    super(`verify interrupted by ${signal}`);
    this.name = "VerifyInterruptedError";
    this.signal = signal;
  }
}

// Spawn a component; resolves 0 on success, throws VerifyComponentError on a
// nonzero exit/signal and VerifyInterruptedError when the passed AbortSignal
// fires (in which case the owned child process group is stopped). `spawnFn` is
// injectable for tests.
export function runComponent(
  component,
  { env, spawnFn = spawn, log = (message) => console.log(message), signal } = {},
) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new VerifyInterruptedError(signal.reason ?? "SIGTERM"));
      return;
    }
    // Detached so the child owns its own process group; on interruption we stop
    // only that group (the child and its descendants), never unrelated processes.
    const child = spawnFn(component.cmd, component.args, {
      cwd: ROOT,
      env: env ?? componentEnv(component),
      stdio: "inherit",
      detached: true,
    });
    const onAbort = () => {
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {
        try {
          child.kill("SIGKILL");
        } catch {
          // already gone
        }
      }
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    child.once("error", (err) => {
      signal?.removeEventListener("abort", onAbort);
      reject(new VerifyComponentError(component.name, null, `spawn:${err.message}`));
    });
    child.once("close", (code, childSignal) => {
      signal?.removeEventListener("abort", onAbort);
      if (signal?.aborted) {
        reject(new VerifyInterruptedError(signal.reason ?? "SIGTERM"));
        return;
      }
      if (code === 0) {
        log(`[verify] passed  ${component.name}`);
        resolve({ component: component.name, code: 0 });
      } else {
        log(
          `[verify] FAILED  ${component.name} (exit ${code ?? "null"} signal ${childSignal ?? "none"})`,
        );
        reject(new VerifyComponentError(component.name, code, childSignal));
      }
    });
  });
}

// Run components sequentially, failing fast. Returns a summary; throws if the
// orchestrator itself cannot run a component (used by tests). An abort during a
// component stops the run and throws VerifyInterruptedError so no later
// component executes.
export async function verify({
  components = COMPONENTS,
  runFn = runComponent,
  log = (message) => console.log(message),
  signal,
} = {}) {
  const passed = [];
  for (const component of components) {
    if (signal?.aborted) {
      throw new VerifyInterruptedError(signal.reason ?? "SIGTERM");
    }
    try {
      await runFn(component, { log, signal });
      passed.push(component.name);
    } catch (err) {
      if (err instanceof VerifyInterruptedError) throw err;
      if (err instanceof VerifyComponentError) {
        return { passed, failed: err.component, exitCode: err.exitCode };
      }
      throw err;
    }
  }
  return { passed, failed: null, exitCode: 0 };
}

// Decide what to do with success evidence after an otherwise-passing run.
// Never leaves an older success silently valid:
//  - an interrupted run invalidates evidence outright;
//  - a working tree that changed during the run is not a stable candidate, so
//    evidence is invalidated instead of stamped;
//  - a run that did not cover the complete expected component set records no
//    success evidence.
export function finalizeEvidence({
  before,
  after,
  passed,
  interruptedSignal = null,
  evidenceFile,
  toolchain = null,
  log = (message) => console.log(message),
}) {
  if (interruptedSignal) {
    invalidateEvidence(evidenceFile);
    log(`[verify] interrupted (${interruptedSignal}); verification evidence invalidated`);
    return { action: "invalidate", reason: `interrupted (${interruptedSignal})` };
  }
  if (after.fingerprint !== before.fingerprint) {
    invalidateEvidence(evidenceFile);
    log(
      "[verify] working tree changed during the run; no verified candidate — evidence invalidated",
    );
    return { action: "invalidate", reason: "working tree changed during the run" };
  }
  if (!componentsComplete(passed)) {
    invalidateEvidence(evidenceFile);
    log(
      `[verify] run covered ${passed.length} of ${COMPONENTS.length} components; evidence invalidated`,
    );
    return { action: "invalidate", reason: "incomplete component set" };
  }
  const effectiveToolchain = toolchain ?? { node: process.version };
  return writeEvidence(
    { state: before, components: passed, toolchain: effectiveToolchain },
    evidenceFile,
  );
}

// Post-verify evidence decision covering every outcome. A failing or
// interrupted run, a working tree that changed during the run, or an
// incomplete component set never leaves an older success silently valid.
export function settleRun({
  result,
  before,
  after,
  interruptedSignal = null,
  evidenceFile,
  log = (message) => console.log(message),
}) {
  if (interruptedSignal) {
    return finalizeEvidence({
      before,
      after,
      passed: result?.passed ?? [],
      interruptedSignal,
      evidenceFile,
      log,
    });
  }
  if (result.failed) {
    invalidateEvidence(evidenceFile);
    log(`[verify] finished with a failing component: ${result.failed}`);
    return { action: "invalidate", reason: `component failed: ${result.failed}` };
  }
  return finalizeEvidence({ before, after, passed: result.passed, evidenceFile, log });
}

async function main() {
  const controller = new AbortController();
  let interruptedSignal = null;
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => {
      if (interruptedSignal) process.exit(128 + (signal === "SIGINT" ? 2 : 15));
      interruptedSignal = signal;
      controller.abort(signal);
    });
  }

  const before = candidateState();
  let result;
  try {
    result = await verify({ signal: controller.signal });
  } catch (err) {
    if (err instanceof VerifyInterruptedError) {
      const sig = err.signal ?? interruptedSignal ?? "SIGTERM";
      settleRun({ result: null, before, after: before, interruptedSignal: sig });
      process.exit(sig === "SIGINT" ? 130 : 143);
    }
    console.error(`\n[verify] internal failure: ${err.message}`);
    invalidateEvidence();
    process.exitCode = 1;
    return;
  }

  if (interruptedSignal) {
    settleRun({ result, before, after: before, interruptedSignal });
    process.exit(interruptedSignal === "SIGINT" ? 130 : 143);
  }

  const after = candidateState();
  if (result.failed) {
    settleRun({ result, before, after });
    console.error(`\n[verify] finished with a failing component: ${result.failed}`);
    process.exitCode = 1;
  } else {
    try {
      settleRun({ result, before, after });
      console.log(`\n[verify] all ${result.passed.length} components passed`);
      console.log(`[verify] verification evidence recorded for ${before.head}`);
    } catch (err) {
      console.warn(`[verify] could not record verification evidence: ${err.message}`);
    }
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
