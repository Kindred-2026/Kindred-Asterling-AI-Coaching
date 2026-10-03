// `pnpm workspace:check` — local workspace smoke test.
//
// Confirms a developer machine can run the product stack end to end: checks the
// Node/pnpm toolchain, installs from the lockfile, seeds `.env.dev` from the
// committed example when missing, boots `scripts/dev.mjs` (disposable MongoDB),
// probes the frontend and the proxied `GET /api/healthz/db`, then stops the
// stack and requires a clean exit. Nothing outside the repository is touched.

import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readAuth0Status } from "./auth0-local.mjs";
import {
  DEFAULT_WEB_PORT,
  DEV_ENV_FILE,
  loadEnvFile,
  parseDevConfig,
} from "./dev-supervisor-config.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const READY_LINE = "Both development servers are ready";
const READY_TIMEOUT_MS = 240_000;
const STOP_TIMEOUT_MS = 60_000;
const SIGNAL_EXIT_CODES = { SIGINT: 130, SIGTERM: 143 };
const IS_WINDOWS = process.platform === "win32";
const childEnv = { ...process.env, KINDRED_DEV_DB: "disposable" };

// `tree` steps (pnpm) own their whole process tree: a POSIX process group, or
// the taskkill /T tree on Windows. The dev supervisor stops its own children.
let active = null;
let interruptedBy = null;

function stopActive(signal) {
  const { child, tree } = active;
  if (!tree) {
    child.kill(signal);
  } else if (IS_WINDOWS) {
    spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    try {
      process.kill(-child.pid, signal);
    } catch {
      // The group already exited.
    }
  }
}

function groupAlive(pid) {
  try {
    process.kill(-pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}

async function waitForGroupExit(pid) {
  const deadline = Date.now() + STOP_TIMEOUT_MS;
  while (groupAlive(pid)) {
    if (Date.now() > deadline) {
      try {
        process.kill(-pid, "SIGKILL");
      } catch {
        // The group exited meanwhile.
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

function exitInterrupted() {
  console.error(`[workspace:check] INTERRUPTED by ${interruptedBy}`);
  process.exit(SIGNAL_EXIT_CODES[interruptedBy]);
}

for (const signal of Object.keys(SIGNAL_EXIT_CODES)) {
  process.on(signal, () => {
    if (interruptedBy) {
      if (active) stopActive("SIGKILL");
      return;
    }
    interruptedBy = signal;
    if (!active) exitInterrupted();
    log(`received ${signal}; stopping the running step...`);
    stopActive("SIGTERM");
    setTimeout(() => active && stopActive("SIGKILL"), STOP_TIMEOUT_MS).unref();
  });
}

function log(message) {
  console.log(`[workspace:check] ${message}`);
}

function fail(message, output) {
  if (output) process.stderr.write(output);
  if (interruptedBy) exitInterrupted();
  console.error(`[workspace:check] FAILED: ${message}`);
  process.exit(1);
}

async function runPnpm(args) {
  const execPath = process.env.npm_execpath;
  const options = { cwd: ROOT, stdio: "inherit", detached: !IS_WINDOWS };
  const child = execPath?.includes("pnpm")
    ? spawn(process.execPath, [execPath, ...args], options)
    : spawn("pnpm", args, { ...options, shell: IS_WINDOWS });
  active = { child, tree: true };
  const { code, signal, error } = await new Promise((resolve) => {
    child.once("error", (spawnError) => resolve({ error: spawnError }));
    child.once("exit", (exitCode, exitSignal) => resolve({ code: exitCode, signal: exitSignal }));
  });
  if (interruptedBy && !IS_WINDOWS && child.pid) await waitForGroupExit(child.pid);
  active = null;
  if (error) fail(`could not run pnpm ${args.join(" ")}: ${error.message}`);
  if (code !== 0) fail(`pnpm ${args.join(" ")} exited with ${code ?? signal}`);
}

function readWebPort() {
  try {
    const fileEnv = loadEnvFile(path.join(ROOT, DEV_ENV_FILE));
    return String(parseDevConfig({ processEnv: childEnv, fileEnv }).webPort);
  } catch {
    // Invalid configuration: dev.mjs reports the exact problem when it starts.
    return String(DEFAULT_WEB_PORT);
  }
}

async function probe(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`${url} answered HTTP ${response.status}`);
  return response;
}

const nodeMajor = Number(process.versions.node.split(".")[0]);
if (nodeMajor !== 24)
  fail(`Node.js 24 is required (engines.node is 24.x); found ${process.version}.`);
log(`Node ${process.version}`);

await runPnpm(["--version"]);
await runPnpm(["install", "--frozen-lockfile"]);

const envDevPath = path.join(ROOT, ".env.dev");
if (!fs.existsSync(envDevPath)) {
  fs.copyFileSync(path.join(ROOT, ".env.dev.example"), envDevPath);
  log("created .env.dev from .env.dev.example");
}

const auth0 = readAuth0Status();
if (auth0.configured) log(`sign-in configured for ${auth0.domain}`);
else
  log(
    `WARNING sign-in not configured (${auth0.problems.join("; ")}); the UI will show "Sign-in is not configured". Run \`pnpm auth0:local\`.`,
  );

const webPort = readWebPort();
log(`starting the dev stack (frontend port ${webPort})...`);

const child = spawn(process.execPath, ["scripts/dev.mjs"], {
  cwd: ROOT,
  env: childEnv,
  stdio: ["ignore", "pipe", "pipe"],
});
active = { child, tree: false };
let output = "";
child.stdout.on("data", (chunk) => (output += chunk));
child.stderr.on("data", (chunk) => (output += chunk));
const exited = new Promise((resolve) =>
  child.on("exit", (code, signal) => resolve({ code, signal })),
);

const deadline = Date.now() + READY_TIMEOUT_MS;
let childExit = null;
exited.then((result) => (childExit = result));
while (!output.includes(READY_LINE)) {
  if (childExit)
    fail(`dev stack exited before becoming ready (${childExit.code ?? childExit.signal}).`, output);
  if (Date.now() > deadline) {
    child.kill("SIGTERM");
    await exited;
    fail(`dev stack was not ready within ${READY_TIMEOUT_MS / 1000}s.`, output);
  }
  await new Promise((resolve) => setTimeout(resolve, 500));
}
log("dev stack reported ready");

let probeError = null;
try {
  await probe(`http://127.0.0.1:${webPort}/`);
  log(`frontend  http://127.0.0.1:${webPort}/ OK`);
  if (auth0.configured) {
    const authModule = await (await probe(`http://127.0.0.1:${webPort}/src/lib/auth.tsx`)).text();
    if (!authModule.includes(JSON.stringify(auth0.clientId)))
      throw new Error("frontend is not serving the configured VITE_AUTH0_CLIENT_ID");
    log("auth0     frontend serves the configured client id");
  }
  const health = await (await probe(`http://127.0.0.1:${webPort}/api/healthz/db`)).json();
  if (health.status !== "ok" || health.database !== "connected") {
    throw new Error(`/api/healthz/db reported ${JSON.stringify(health)}`);
  }
  log(`api + db  http://127.0.0.1:${webPort}/api/healthz/db ${JSON.stringify(health)}`);
} catch (error) {
  probeError = error;
}

log("stopping the dev stack...");
child.kill("SIGTERM");
const stopTimer = setTimeout(() => child.kill("SIGKILL"), STOP_TIMEOUT_MS);
const { code, signal } = await exited;
clearTimeout(stopTimer);

if (probeError) fail(probeError.message, output);
if (code !== 0) fail(`dev stack did not shut down cleanly (${code ?? signal}).`, output);
if (interruptedBy) exitInterrupted();
log("PASSED: local workspace installs, starts, serves the UI and API, and shuts down cleanly.");
