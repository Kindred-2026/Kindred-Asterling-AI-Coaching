// Tests for scripts/dev-supervisor.mjs and the dev.mjs launcher.
//
// Unit tests cover parsing/config/jobs. Integration tests spawn the real
// `dev.mjs` CLI with the fake-children fixture and verify process-group
// shutdown: all owned children (and wrappers/grandchildren) exit on
// SIGINT/SIGTERM and on child/build failure, unrelated processes survive, and
// ports become reusable. The disposable database is exercised as an OWNED DB
// WORKER process group (scripts/dev-db-worker.mjs) — bounded cancellation uses
// only real, supported mechanisms (SIGTERM → the worker's real
// MongoMemoryReplSet.stop(); SIGKILL of the owned group as the force path). No
// fixture-only forceStop() exists. An opt-in test (KINDRED_RUN_DB_WORKER_INTEGRATION=1)
// runs the real mongodb-memory-server worker holding a live replica set.
// No real product ports/processes are used by the default suite.

import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, test, after } from "node:test";
import assert from "node:assert/strict";

import {
  checkPortFree,
  checkPortInUse,
  createJobs,
  createShutdownCoordinator,
  DEFAULT_DEV_DB_MODE,
  loadEnvFile,
  parseDevConfig,
  parseEnvFile,
  parsePort,
  preflightPorts,
  runDevelopment,
  waitForReadiness,
} from "./dev-supervisor.mjs";

// ---------------------------------------------------------------------------
// Unit: blank VITE_* handling (Auth0 fallback correctness)
// ---------------------------------------------------------------------------

describe("parseDevConfig: blank VITE_* values", () => {
  test("blank/whitespace-only VITE_* values are treated as unset (never forwarded as empty strings)", () => {
    const config = parseDevConfig({
      processEnv: {},
      fileEnv: {
        VITE_AUTH0_DOMAIN: "",
        VITE_AUTH0_CLIENT_ID: "   ",
        VITE_AUTH0_AUDIENCE: "https://api.example.com",
        MONGODB_URI: "mongodb://127.0.0.1:27017",
      },
    });
    assert.equal("VITE_AUTH0_DOMAIN" in config.webEnv, false);
    assert.equal("VITE_AUTH0_CLIENT_ID" in config.webEnv, false);
    assert.equal(config.webEnv.VITE_AUTH0_AUDIENCE, "https://api.example.com");
  });

  test("a blank shell value is dropped so the web child never sees an empty string (Vite can fall back to the package .env)", () => {
    const config = parseDevConfig({
      processEnv: { VITE_AUTH0_DOMAIN: "" },
      fileEnv: { VITE_AUTH0_DOMAIN: "file.example.com" },
    });
    assert.equal("VITE_AUTH0_DOMAIN" in config.webEnv, false);
  });

  test("an explicit nonblank shell override still wins over the file value", () => {
    const config = parseDevConfig({
      processEnv: { VITE_AUTH0_DOMAIN: "shell.example.com" },
      fileEnv: { VITE_AUTH0_DOMAIN: "file.example.com" },
    });
    assert.equal(config.webEnv.VITE_AUTH0_DOMAIN, "shell.example.com");
  });
});

// ---------------------------------------------------------------------------
// Integration: real CLI + fake children
// ---------------------------------------------------------------------------

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const fixturePath = path.join(here, "dev-supervisor-fixture.mjs");

// ---------------------------------------------------------------------------
// Unit: env parsing / ports / config / jobs
// ---------------------------------------------------------------------------

describe("parseEnvFile", () => {
  test("parses KEY=VALUE, quotes, comments, and export prefixes", () => {
    const parsed = parseEnvFile(`
# comment
KINDRED_WEB_PORT=8080
export KINDRED_API_PORT=3000
VITE_AUTH0_DOMAIN="https://dev.example.auth0.com"
MONGODB_URI='mongodb://127.0.0.1:27017'
ALONE
=orphan
`);
    assert.equal(parsed.KINDRED_WEB_PORT, "8080");
    assert.equal(parsed.KINDRED_API_PORT, "3000");
    assert.equal(parsed.VITE_AUTH0_DOMAIN, "https://dev.example.auth0.com");
    assert.equal(parsed.MONGODB_URI, "mongodb://127.0.0.1:27017");
    assert.equal(parsed.ALONE, undefined);
  });
});

describe("loadEnvFile", () => {
  test("returns {} when the file is missing", () => {
    assert.deepEqual(loadEnvFile("/nonexistent/.env.dev"), {});
  });
});

describe("parsePort", () => {
  test("accepts valid ports", () => {
    assert.equal(parsePort("8080", "KINDRED_WEB_PORT"), 8080);
    assert.equal(parsePort(3000, "KINDRED_API_PORT"), 3000);
  });

  test("rejects missing, zero, out-of-range, and non-numeric values", () => {
    assert.throws(() => parsePort("", "KINDRED_WEB_PORT"), /KINDRED_WEB_PORT/);
    assert.throws(() => parsePort("0", "KINDRED_WEB_PORT"), /KINDRED_WEB_PORT/);
    assert.throws(() => parsePort("65536", "KINDRED_WEB_PORT"), /KINDRED_WEB_PORT/);
    assert.throws(() => parsePort("-1", "KINDRED_WEB_PORT"), /KINDRED_WEB_PORT/);
    assert.throws(() => parsePort("abc", "KINDRED_WEB_PORT"), /KINDRED_WEB_PORT/);
  });
});

describe("parseDevConfig", () => {
  test("applies defaults when nothing is set", () => {
    const config = parseDevConfig({ processEnv: {}, fileEnv: {} });
    assert.equal(config.webPort, 8080);
    assert.equal(config.apiPort, 3000);
    assert.equal(config.dbMode, "disposable");
    assert.equal(config.basePath, "/");
    assert.equal(config.apiOrigin, "http://127.0.0.1:3000");
  });

  test("process env overrides the file env; file env fills the rest", () => {
    const config = parseDevConfig({
      processEnv: { KINDRED_WEB_PORT: "9500" },
      fileEnv: {
        KINDRED_WEB_PORT: "9000",
        KINDRED_API_PORT: "4000",
        VITE_AUTH0_DOMAIN: "https://file.example.auth0.com",
      },
    });
    assert.equal(config.webPort, 9500);
    assert.equal(config.apiPort, 4000);
    assert.equal(config.apiOrigin, "http://127.0.0.1:4000");
    assert.equal(
      config.webEnv.VITE_AUTH0_DOMAIN,
      "https://file.example.auth0.com",
    );
  });

  test("rejects equal web/api ports", () => {
    assert.throws(() =>
      parseDevConfig({
        processEnv: {},
        fileEnv: { KINDRED_WEB_PORT: "8080", KINDRED_API_PORT: "8080" },
      }),
    );
  });

  test("external mode requires MONGODB_URI/DATABASE and never echoes secrets", () => {
    const fixturePassword = randomBytes(24).toString("hex");
    const uri = `mongodb://fixture:${fixturePassword}@db.example:27017`;
    assert.throws(
      () =>
        parseDevConfig({
          processEnv: {},
          fileEnv: { KINDRED_DEV_DB: "external", MONGODB_URI: uri },
        }),
      (err) => {
        assert.match(err.message, /MONGODB_URI/);
        assert.match(err.message, /MONGODB_DATABASE/);
        assert.ok(!err.message.includes(fixturePassword));
        return true;
      },
    );
  });

  test("external mode rejects non-mongodb URIs and invalid database names", () => {
    assert.throws(() =>
      parseDevConfig({
        processEnv: {},
        fileEnv: {
          KINDRED_DEV_DB: "external",
          MONGODB_URI: "postgres://127.0.0.1/db",
          MONGODB_DATABASE: "kindred_dev",
        },
      }),
      /mongodb/,
    );
    assert.throws(() =>
      parseDevConfig({
        processEnv: {},
        fileEnv: {
          KINDRED_DEV_DB: "external",
          MONGODB_URI: "mongodb://127.0.0.1:27017",
          MONGODB_DATABASE: "bad db name;drop",
        },
      }),
      /MONGODB_DATABASE/,
    );
  });

  test("isolates server secrets from the browser child env", () => {
    const fixtureKey = randomBytes(24).toString("hex");
    const config = parseDevConfig({
      processEnv: {},
      fileEnv: {
        MONGODB_URI: "mongodb://127.0.0.1:27017",
        MONGODB_DATABASE: "kindred_dev",
        RESEND_API_KEY: fixtureKey,
        VITE_AUTH0_CLIENT_ID: "pub-client-456",
        KINDRED_DEV_DB: DEFAULT_DEV_DB_MODE,
      },
    });
    assert.equal(config.webEnv.MONGODB_URI, undefined);
    assert.equal(config.webEnv.MONGODB_DATABASE, undefined);
    assert.equal(config.webEnv.RESEND_API_KEY, undefined);
    assert.equal(config.webEnv.VITE_AUTH0_CLIENT_ID, "pub-client-456");
    assert.equal(config.apiEnv.MONGODB_URI, "mongodb://127.0.0.1:27017");
    assert.equal(config.apiEnv.RESEND_API_KEY, fixtureKey);
  });

  test("validates BASE_PATH and KINDRED_API_ORIGIN", () => {
    assert.throws(
      () => parseDevConfig({ processEnv: { BASE_PATH: "nope" }, fileEnv: {} }),
      /BASE_PATH/,
    );
    assert.throws(
      () =>
        parseDevConfig({
          processEnv: { KINDRED_API_ORIGIN: "not-a-url" },
          fileEnv: {},
        }),
      /KINDRED_API_ORIGIN/,
    );
  });
});

describe("port helpers", () => {
  test("detects an occupied port and accepts a free one", async () => {
    const port = await getFreePort();
    const freePort = await getFreePort();
    const server = net.createServer();
    await new Promise((resolve) => server.listen(port, "0.0.0.0", resolve));
    try {
      assert.equal(await checkPortInUse(port), true);
      assert.equal(await checkPortFree(port), false);
      const occupied = await preflightPorts([
        { port, label: "busy" },
        { port: freePort, label: "free" },
      ]);
      assert.deepEqual(occupied.map((entry) => entry.label), ["busy"]);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});

describe("createJobs", () => {
  const config = parseDevConfig({ processEnv: {}, fileEnv: {} });

  test("runs the real product workspace commands with proper launch env", () => {
    const jobs = createJobs(config, { cwd: repoRoot });
    assert.deepEqual(jobs.web.args, [
      "--filter",
      "@workspace/kindred-coach",
      "run",
      "dev",
    ]);
    assert.deepEqual(jobs.api.args, [
      "--filter",
      "@workspace/api-server",
      "run",
      "start",
    ]);
    assert.equal(jobs.build.command, "pnpm");
    assert.equal(jobs.web.env.PORT, "8080");
    assert.equal(jobs.web.env.BASE_PATH, "/");
    assert.equal(jobs.web.env.REMINDER_SCHEDULER_DISABLED, undefined);
    assert.equal(jobs.api.env.PORT, "3000");
    assert.equal(jobs.api.env.REMINDER_SCHEDULER_DISABLED, "true");
    assert.equal(jobs.api.env.NODE_ENV, "development");
  });

  test("never launches the Next.js experiment", () => {
    const jobs = createJobs(config, { cwd: repoRoot });
    for (const job of [jobs.build, jobs.web, jobs.api]) {
      const flat = job.args.join(" ");
      assert.ok(!flat.includes("frontend"), `${job.name} must not target frontend`);
      assert.ok(!flat.includes("next"), `${job.name} must not target next`);
    }
  });

  test("web child keeps an exec PATH but never receives server secrets", () => {
    const fixtureUri = `mongodb://fixture:${randomBytes(24).toString("hex")}@127.0.0.1:27017`;
    const jobEnvConfig = parseDevConfig({
      processEnv: {},
      fileEnv: {
        MONGODB_URI: fixtureUri,
        MONGODB_DATABASE: "kindred_dev",
        OLLAMA_BASE_URL: "http://127.0.0.1:11434",
        VITE_AUTH0_DOMAIN: "dev.example.auth0.com",
      },
    });
    const jobs = createJobs(jobEnvConfig, { cwd: repoRoot });
    assert.ok(
      jobs.web.env.PATH?.length > 0,
      "web child must be able to exec pnpm via PATH",
    );
    assert.equal(jobs.web.env.MONGODB_URI, undefined);
    assert.equal(jobs.web.env.MONGODB_DATABASE, undefined);
    assert.equal(jobs.web.env.OLLAMA_BASE_URL, undefined);
    assert.equal(jobs.web.env.VITE_AUTH0_DOMAIN, "dev.example.auth0.com");
    assert.equal(jobs.api.env.MONGODB_URI, fixtureUri);
  });
});

describe("waitForReadiness", () => {
  test("is instantly ready without a readiness spec", async () => {
    assert.deepEqual(await waitForReadiness({ name: "x" }), {
      ok: true,
      job: { name: "x" },
    });
  });

  test("resolves ok once a port is bound", async () => {
    const port = await getFreePort();
    const server = net.createServer();
    await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
    try {
      const result = await waitForReadiness(
        {
          name: "web",
          readiness: { type: "port", port, host: "127.0.0.1", timeoutMs: 3000 },
        },
        { pollMs: 50 },
      );
      assert.equal(result.ok, true);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  test("times out when the port never binds", async () => {
    const port = await getFreePort();
    const result = await waitForReadiness(
      {
        name: "web",
        readiness: { type: "port", port, host: "127.0.0.1", timeoutMs: 400 },
      },
      { pollMs: 50 },
    );
    assert.equal(result.ok, false);
  });
});

// ---------------------------------------------------------------------------
// Integration: real CLI + fake children
// ---------------------------------------------------------------------------

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

// Reserves several distinct free ports at once (the sockets are still open
// while each is measured, so two calls cannot return the same port).
function getDistinctFreePorts(count) {
  return new Promise((resolve, reject) => {
    const servers = [];
    let used = 0;
    for (let i = 0; i < count; i++) {
      const server = net.createServer();
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => {
        servers.push(server);
        used += 1;
        if (used !== count) return;
        const ports = servers.map((s) => s.address().port);
        Promise.all(
          servers.map((s) => new Promise((res) => s.close(res))),
        ).then(() => resolve(ports));
      });
    }
  });
}

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function waitForExit(child, timeoutMs = 20_000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("child did not exit")),
      timeoutMs,
    );
    child.once("exit", (code) => {
      clearTimeout(timer);
      resolve(code ?? 1);
    });
  });
}

async function waitForFile(file, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8"));
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.fail(`marker file never appeared: ${file}`);
}

async function waitForPortState(port, expectedInUse, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if ((await checkPortInUse(port)) === expectedInUse) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.fail(`port ${port} did not become ${expectedInUse ? "in use" : "free"}`);
}

function waitFor(condition, timeoutMs = 10_000, message = "condition timed out") {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const tick = () => {
      if (condition()) return resolve();
      if (Date.now() >= deadline) return reject(new Error(message));
      setTimeout(tick, 100);
    };
    tick();
  });
}

async function startCli(overrides = {}) {
  const stateDir = mkdtempSync(path.join(os.tmpdir(), "kindred-dev-sup-test-"));
  const webPort =
    overrides.KINDRED_WEB_PORT !== undefined
      ? Number(overrides.KINDRED_WEB_PORT)
      : await getFreePort();
  const apiPort =
    overrides.KINDRED_API_PORT !== undefined
      ? Number(overrides.KINDRED_API_PORT)
      : await getFreePort();
  const env = {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    KINDRED_DEV_DB: "external",
    MONGODB_URI: "mongodb://127.0.0.1:25999",
    MONGODB_DATABASE: "kindred_dev",
    KINDRED_DEV_JOBS_FIXTURE: fixturePath,
    FAKE_STATE_DIR: stateDir,
    KINDRED_WEB_PORT: String(webPort),
    KINDRED_API_PORT: String(apiPort),
    KINDRED_DEV_DEBUG_LOG: path.join(stateDir, "cli.audit.log"),
    ...overrides,
  };
  const child = spawn(process.execPath, ["scripts/dev.mjs"], {
    cwd: repoRoot,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  launchedClis.push(child);
  let stderr = "";
  let stdout = "";
  child.stdout.on("data", (d) => (stdout += d));
  child.stderr.on("data", (d) => (stderr += d));
  child.output = () => ({ stdout, stderr });
  return { child, stateDir, webPort, apiPort };
}

// Global safety net: if a test abort mid-flight (assertion failure) with a CLI
// or fake child still alive, kill it so the test runner can exit. Individual
// tests still do their own cleanup; this only covers failure leaks.
const launchedClis = [];
const spawnedPids = new Set();
after(() => {
  for (const cli of launchedClis) {
    try {
      cli.kill("SIGKILL");
    } catch {}
  }
  for (const pid of spawnedPids) {
    try {
      process.kill(pid, "SIGKILL");
    } catch {}
  }
});

function failWithCliOutput(assertion, stateDir, cli) {
  const out = cli.output ? cli.output() : { stdout: "", stderr: "" };
  let dir;
  try {
    dir = readFileSync(stateDir, "utf8");
  } catch {
    dir = "";
  }
  assertion(new Error(
    `marker did not appear; stateDir=${stateDir}; CLI stderr:\n${out.stderr}\nCLI stdout:\n${out.stdout}\nstateDir listing:\n${dir}`,
  ));
}

test("SIGINT: stops all owned children including grandchildren; unrelated process survives; ports freed", async () => {
  const { child, stateDir, webPort, apiPort } = await startCli({
    FAKE_MODE: "ok",
    FAKE_WRAP_GRANDCHILD: "true",
  });

  const webMarker = path.join(stateDir, "web.marker.json");
  const apiMarker = path.join(stateDir, "api.marker.json");
  await waitForFile(webMarker);
  await waitForFile(apiMarker);
  await waitForPortState(webPort, true);
  await waitForPortState(apiPort, true);

  const webPid = JSON.parse(readFileSync(webMarker, "utf8")).pid;
  const apiPid = JSON.parse(readFileSync(apiMarker, "utf8")).pid;
  const grandchildPid = Number(
    readFileSync(path.join(stateDir, "web.grandchild.pid"), "utf8"),
  );
  assert.ok(isAlive(webPid) && isAlive(apiPid) && isAlive(grandchildPid));

  const unrelated = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
    stdio: "ignore",
  });
  assert.ok(isAlive(unrelated.pid));

  child.kill("SIGINT");
  const code = await waitForExit(child);
  assert.equal(code, 0);

  await waitForPortState(webPort, false);
  await waitForPortState(apiPort, false);
  await waitFor(() => !isAlive(webPid) && !isAlive(apiPid) && !isAlive(grandchildPid));
  assert.ok(isAlive(unrelated.pid), "unrelated process must survive");
  unrelated.kill("SIGKILL");
});

test("SIGTERM: stops all owned children cleanly with exit code 0", async () => {
  const { child, stateDir, webPort, apiPort } = await startCli({
    FAKE_MODE: "ok",
    FAKE_WRAP_GRANDCHILD: "true",
  });

  await waitForFile(path.join(stateDir, "web.marker.json"));
  await waitForFile(path.join(stateDir, "api.marker.json"));
  await waitForPortState(webPort, true);
  await waitForPortState(apiPort, true);

  child.kill("SIGTERM");
  const code = await waitForExit(child);
  assert.equal(code, 0);
  await waitForPortState(webPort, false);
  await waitForPortState(apiPort, false);
});

test("api child failure: launcher exits nonzero and cleans up the web child", async () => {
  const { child, stateDir, webPort, apiPort } = await startCli({
    FAKE_MODE: "api-fail",
  });

  await waitForFile(path.join(stateDir, "web.marker.json"), 20_000).catch(() => {
    failWithCliOutput(assert.fail, stateDir, child);
  });
  await waitForPortState(webPort, true);

  const code = await waitForExit(child);
  assert.equal(code, 4);
  await waitForPortState(apiPort, false);
  await waitForPortState(webPort, false);
});

test("web child failure: launcher exits nonzero and cleans up the api child", async () => {
  const { child, stateDir, webPort, apiPort } = await startCli({
    FAKE_MODE: "web-fail",
  });

  await waitForFile(path.join(stateDir, "api.marker.json"), 20_000).catch(() => {
    failWithCliOutput(assert.fail, stateDir, child);
  });
  await waitForPortState(apiPort, true);

  const code = await waitForExit(child);
  assert.equal(code, 3);
  await waitForPortState(apiPort, false);
  await waitForPortState(webPort, false);
});

test("build phase failure: launcher exits nonzero before starting runtime children", async () => {
  const { child, stateDir, webPort } = await startCli({ FAKE_MODE: "build-fail" });

  const code = await waitForExit(child);
  assert.equal(code, 7);
  assert.equal(existsSync(path.join(stateDir, "web.marker.json")), false);
  await waitForPortState(webPort, false);
});

test("root package.json dev wiring stays on the product stack", () => {
  const pkg = JSON.parse(readFileSync(path.join(repoRoot, "package.json"), "utf8"));
  assert.equal(pkg.scripts.dev, "node scripts/dev.mjs");
  assert.match(
    pkg.scripts["test:dev-supervisor"],
    /--test scripts\/dev-supervisor\.test\.mjs/,
  );
});

test("SIGINT during a long build: stops the build group (incl. grandchild), never starts runtime children, unrelated survives", { timeout: 30_000 }, async () => {
  const { child, stateDir, webPort, apiPort } = await startCli({
    FAKE_BUILD_LONG: "true",
    FAKE_BUILD_GRANDCHILD: "true",
  });

  const buildMarker = await waitForFile(path.join(stateDir, "build.marker.json"));
  const buildPid = buildMarker.pid;
  const gcPidPath = path.join(stateDir, "build.grandchild.pid");
  await waitFor(() => existsSync(gcPidPath));
  const gcPid = Number(readFileSync(gcPidPath, "utf8"));
  spawnedPids.add(gcPid);
  assert.ok(isAlive(buildPid) && isAlive(gcPid));

  const unrelated = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
    stdio: "ignore",
  });
  assert.ok(isAlive(unrelated.pid));

  child.kill("SIGINT");
  const code = await waitForExit(child);
  assert.equal(code, 0);

  await waitFor(() => !isAlive(buildPid) && !isAlive(gcPid));
  assert.equal(existsSync(path.join(stateDir, "web.marker.json")), false);
  assert.equal(existsSync(path.join(stateDir, "api.marker.json")), false);
  assert.equal(await checkPortFree(webPort), true);
  assert.equal(await checkPortFree(apiPort), true);
  assert.ok(isAlive(unrelated.pid), "unrelated process must survive");
  unrelated.kill("SIGKILL");
});

test("SIGTERM during a long build: same guarantees with the TERM signal", { timeout: 30_000 }, async () => {
  const { child, stateDir, webPort, apiPort } = await startCli({
    FAKE_BUILD_LONG: "true",
    FAKE_BUILD_GRANDCHILD: "true",
  });

  const buildMarker = await waitForFile(path.join(stateDir, "build.marker.json"));
  const buildPid = buildMarker.pid;
  const gcPidPath = path.join(stateDir, "build.grandchild.pid");
  await waitFor(() => existsSync(gcPidPath));
  const gcPid = Number(readFileSync(gcPidPath, "utf8"));
  spawnedPids.add(gcPid);
  assert.ok(isAlive(buildPid) && isAlive(gcPid));

  child.kill("SIGTERM");
  const code = await waitForExit(child);
  assert.equal(code, 0);

  await waitFor(() => !isAlive(buildPid) && !isAlive(gcPid));
  assert.equal(existsSync(path.join(stateDir, "web.marker.json")), false);
  assert.equal(existsSync(path.join(stateDir, "api.marker.json")), false);
  assert.equal(await checkPortFree(webPort), true);
  assert.equal(await checkPortFree(apiPort), true);
});

test("SIGINT with a stubborn grandchild: group-completion force-stops it during explicit shutdown; port becomes reusable", { timeout: 30_000 }, async () => {
  const [webPort, apiPort, grandchildPort] = await getDistinctFreePorts(3);
  const { child, stateDir } = await startCli({
    KINDRED_WEB_PORT: String(webPort),
    KINDRED_API_PORT: String(apiPort),
    FAKE_MODE: "ok",
    FAKE_WRAP_GRANDCHILD: "stubborn",
    GRANDCHILD_PORT: String(grandchildPort),
    KINDRED_DEV_GRACE_MS: "800",
    KINDRED_DEV_FORCE_GRACE_MS: "1500",
  });

  await waitForFile(path.join(stateDir, "web.marker.json"));
  await waitForFile(path.join(stateDir, "api.marker.json"));
  await waitForPortState(webPort, true);
  await waitForPortState(apiPort, true);
  await waitForFile(path.join(stateDir, "web.grandchild.ready"));
  const gcPid = Number(
    readFileSync(path.join(stateDir, "web.grandchild.pid"), "utf8"),
  );
  spawnedPids.add(gcPid);
  assert.ok(isAlive(gcPid));
  await waitForPortState(grandchildPort, true);

  child.kill("SIGINT");
  const code = await waitForExit(child);
  assert.equal(code, 0);

  await waitFor(() => !isAlive(gcPid));
  await waitForPortState(grandchildPort, false);
  await waitForPortState(webPort, false);
  await waitForPortState(apiPort, false);
});

test("sibling failure with a stubborn grandchild: group-completion still force-stops it; port becomes reusable", { timeout: 30_000 }, async () => {
  const [webPort, apiPort, grandchildPort] = await getDistinctFreePorts(3);
  const { child, stateDir } = await startCli({
    KINDRED_WEB_PORT: String(webPort),
    KINDRED_API_PORT: String(apiPort),
    FAKE_MODE: "api-fail",
    FAKE_WRAP_GRANDCHILD: "stubborn",
    GRANDCHILD_PORT: String(grandchildPort),
    KINDRED_DEV_GRACE_MS: "800",
    KINDRED_DEV_FORCE_GRACE_MS: "1500",
  });

  await waitForFile(path.join(stateDir, "web.marker.json"));
  await waitForPortState(webPort, true);
  await waitForFile(path.join(stateDir, "web.grandchild.ready"));
  const gcPid = Number(
    readFileSync(path.join(stateDir, "web.grandchild.pid"), "utf8"),
  );
  spawnedPids.add(gcPid);
  assert.ok(isAlive(gcPid));
  await waitForPortState(grandchildPort, true);

  const code = await waitForExit(child);
  assert.equal(code, 4);

  await waitFor(() => !isAlive(gcPid));
  await waitForPortState(grandchildPort, false);
  await waitForPortState(webPort, false);
  await waitForPortState(apiPort, false);
});

test("build wrapper exits before a stubborn descendant: group-completion detects the live group, force-stops it, launcher reports the problem", { timeout: 30_000 }, async () => {
  const [webPort, apiPort, grandchildPort] = await getDistinctFreePorts(3);
  const stateDir = mkdtempSync(path.join(os.tmpdir(), "kindred-dev-sup-test-"));
  const config = parseDevConfig({
    processEnv: { KINDRED_WEB_PORT: String(webPort), KINDRED_API_PORT: String(apiPort) },
    fileEnv: {},
  });

  const savedEnv = { ...process.env };
  process.env.FAKE_STATE_DIR = stateDir;
  process.env.FAKE_MODE = "ok";
  process.env.FAKE_BUILD_GRANDCHILD = "true";
  process.env.WRAP_EXIT_AFTER_MS = "250";
  process.env.GRANDCHILD_STUBBORN = "true";
  process.env.GRANDCHILD_PORT = String(grandchildPort);
  try {
    const fixture = await import(pathToFileURL(fixturePath).href);
    const jobs = fixture.buildJobs(config, { cwd: repoRoot });
    const result = await runDevelopment(
      [jobs.build, jobs.web, jobs.api].filter(Boolean),
      { buildFlushMs: 1500 },
    );
    assert.equal(result.code, 1);
    assert.match(result.reason, /left a running descendant/);
  } finally {
    for (const [key, value] of Object.entries(savedEnv)) process.env[key] = value;
    for (const key of Object.keys(process.env)) {
      if (!(key in savedEnv)) delete process.env[key];
    }
  }

  const gcPid = Number(
    readFileSync(path.join(stateDir, "build.grandchild.pid"), "utf8"),
  );
  spawnedPids.add(gcPid);
  await waitFor(() => !isAlive(gcPid));
  await waitForPortState(grandchildPort, false);
  assert.equal(existsSync(path.join(stateDir, "web.marker.json")), false);
});

test("failed spawn: launcher reports the error without touching unrelated processes", { timeout: 30_000 }, async () => {
  const unrelated = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
    stdio: "ignore",
  });
  assert.ok(isAlive(unrelated.pid));

  const result = await runDevelopment([
    { name: "bogus", command: "definitely-not-a-real-binary", args: [], env: process.env },
  ]);
  assert.equal(result.code, 1);
  assert.match(result.reason, /spawn error/);
  assert.ok(isAlive(unrelated.pid), "unrelated process must survive");
  unrelated.kill("SIGKILL");
});

test("failed database provisioning with no signal: launcher exits nonzero, nothing is spawned", { timeout: 30_000 }, async () => {
  const dbFactoryOut = mkdtempSync(path.join(os.tmpdir(), "kindred-dev-db-factory-"));
  const { child, stateDir, webPort, apiPort } = await startCli({
    KINDRED_DEV_DB: "disposable",
    KINDRED_DEV_DB_FACTORY: "scripts/dev-db-factory-fixture.mjs",
    KINDRED_DEV_DB_FACTORY_OUT: dbFactoryOut,
    FAKE_DB_FACTORY_MODE: "delayed-reject",
    FAKE_DB_FACTORY_DELAY_MS: "300",
  });

  const code = await waitForExit(child);
  assert.equal(code, 1);
  assert.equal(existsSync(path.join(dbFactoryOut, "db-factory.rejected")), true);
  assert.equal(existsSync(path.join(dbFactoryOut, "db-factory.stopped")), false);
  assert.equal(existsSync(path.join(stateDir, "build.marker.json")), false);
  assert.equal(existsSync(path.join(stateDir, "web.marker.json")), false);
  assert.equal(existsSync(path.join(stateDir, "api.marker.json")), false);
  assert.equal(await checkPortFree(webPort), true);
  assert.equal(await checkPortFree(apiPort), true);
});

// ---------------------------------------------------------------------------
// Coordinator: bounded service shutdown (shutdown deadlines for services)
// ---------------------------------------------------------------------------

describe("coordinator: service shutdown is bounded like process groups", () => {
  const tinyWindows = { graceMs: 20, forceGraceMs: 20, gracefulPollMs: 5 };

  test("a stop that never settles is bounded: force fallback releases the live resource and cleanup is reported incomplete (no runtime groups)", async () => {
    const port = await getFreePort();
    const server = net.createServer();
    await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
    const keepAlive = setInterval(() => {}, 1000);
    let forceCalls = 0;

    const coordinator = createShutdownCoordinator(tinyWindows);
    coordinator.addService("hanging-db", {
      stop: () => new Promise(() => {}),
      forceStop() {
        forceCalls += 1;
        clearInterval(keepAlive);
        server.close(() => {});
      },
    });

    const startedAt = Date.now();
    try {
      await coordinator.requestStop("SIGTERM");
    } finally {
      coordinator.dispose();
    }
    const elapsed = Date.now() - startedAt;

    assert.ok(elapsed < 1000, `shutdown must be bounded (took ${elapsed} ms)`);
    assert.equal(forceCalls, 1);
    assert.equal(coordinator.cleanupIncomplete(), true);
    await waitForPortState(port, false);
  });

  test("a rejecting service stop is bounded and reported as incomplete", async () => {
    const coordinator = createShutdownCoordinator(tinyWindows);
    coordinator.addService("bad", {
      stop: () => Promise.reject(new Error("boom")),
    });
    try {
      await coordinator.requestStop("SIGINT");
    } finally {
      coordinator.dispose();
    }
    assert.equal(coordinator.cleanupIncomplete(), true);
  });

  test("repeated signals re-join the same bounded cleanup and the force fallback runs once", async () => {
    let forceCalls = 0;
    const coordinator = createShutdownCoordinator(tinyWindows);
    coordinator.addService("hang", {
      stop: () => new Promise(() => {}),
      forceStop() {
        forceCalls += 1;
      },
    });
    try {
      const first = coordinator.requestStop("SIGINT");
      const second = coordinator.requestStop("SIGTERM");
      await Promise.all([first, second]);
    } finally {
      coordinator.dispose();
    }
    assert.equal(forceCalls, 1);
    assert.equal(coordinator.cleanupIncomplete(), true);
  });
});

// ---------------------------------------------------------------------------
// Integration: disposable database provisioning via the OWNED DB WORKER
// (scripts/dev-db-worker.mjs). KINDRED_DEV_DB_FACTORY swaps only the replica-set
// constructor inside the worker; the production worker provisioning/shutdown
// control flow runs unchanged. No fixture exposes forceStop: a gracefully
// hanging stop is released by the supervisor's real force path (SIGKILL of the
// owned worker process group).
// ---------------------------------------------------------------------------

test("SIGINT during disposable DB provisioning: launcher waits for the late-starting replica set, stops it, starts nothing; port freed; unrelated survives", { timeout: 30_000 }, async () => {
  const [dbPort] = await getDistinctFreePorts(1);
  const dbFactoryOut = mkdtempSync(path.join(os.tmpdir(), "kindred-dev-db-factory-"));
  const { child, stateDir } = await startCli({
    KINDRED_DEV_DB: "disposable",
    KINDRED_DEV_DB_FACTORY: "scripts/dev-db-factory-fixture.mjs",
    KINDRED_DEV_DB_FACTORY_OUT: dbFactoryOut,
    FAKE_DB_FACTORY_MODE: "delayed-success",
    FAKE_DB_FACTORY_DELAY_MS: "1500",
    FAKE_DB_FACTORY_PORT: String(dbPort),
  });

  await waitForFile(path.join(dbFactoryOut, "db-factory.provisioning"));

  const unrelated = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
    stdio: "ignore",
  });
  spawnedPids.add(unrelated.pid);
  assert.ok(isAlive(unrelated.pid));

  child.kill("SIGINT");
  const code = await waitForExit(child);
  assert.equal(code, 0);

  // The replica set finished starting after the interruption and was still
  // stopped: stop() was invoked and the owned port was released.
  await waitForFile(path.join(dbFactoryOut, "db-factory.created"));
  await waitForFile(path.join(dbFactoryOut, "db-factory.stopped"));
  await waitForPortState(dbPort, false);

  assert.equal(existsSync(path.join(stateDir, "build.marker.json")), false);
  assert.equal(existsSync(path.join(stateDir, "web.marker.json")), false);
  assert.equal(existsSync(path.join(stateDir, "api.marker.json")), false);
  assert.ok(isAlive(unrelated.pid), "unrelated process must survive");
});

test("SIGTERM during disposable DB provisioning: same guarantees via SIGTERM", { timeout: 30_000 }, async () => {
  const [dbPort] = await getDistinctFreePorts(1);
  const dbFactoryOut = mkdtempSync(path.join(os.tmpdir(), "kindred-dev-db-factory-"));
  const { child, stateDir } = await startCli({
    KINDRED_DEV_DB: "disposable",
    KINDRED_DEV_DB_FACTORY: "scripts/dev-db-factory-fixture.mjs",
    KINDRED_DEV_DB_FACTORY_OUT: dbFactoryOut,
    FAKE_DB_FACTORY_MODE: "delayed-success",
    FAKE_DB_FACTORY_DELAY_MS: "1500",
    FAKE_DB_FACTORY_PORT: String(dbPort),
  });

  await waitForFile(path.join(dbFactoryOut, "db-factory.provisioning"));
  child.kill("SIGTERM");
  const code = await waitForExit(child);
  assert.equal(code, 0);

  await waitForFile(path.join(dbFactoryOut, "db-factory.created"));
  await waitForFile(path.join(dbFactoryOut, "db-factory.stopped"));
  await waitForPortState(dbPort, false);

  assert.equal(existsSync(path.join(stateDir, "build.marker.json")), false);
  assert.equal(existsSync(path.join(stateDir, "web.marker.json")), false);
  assert.equal(existsSync(path.join(stateDir, "api.marker.json")), false);
});

test("SIGTERM during disposable DB provisioning with a late reject: launcher exits 0, nothing started, no stale stop", { timeout: 30_000 }, async () => {
  const dbFactoryOut = mkdtempSync(path.join(os.tmpdir(), "kindred-dev-db-factory-"));
  const { child, stateDir } = await startCli({
    KINDRED_DEV_DB: "disposable",
    KINDRED_DEV_DB_FACTORY: "scripts/dev-db-factory-fixture.mjs",
    KINDRED_DEV_DB_FACTORY_OUT: dbFactoryOut,
    FAKE_DB_FACTORY_MODE: "delayed-reject",
    FAKE_DB_FACTORY_DELAY_MS: "1500",
  });

  await waitForFile(path.join(dbFactoryOut, "db-factory.provisioning"));
  child.kill("SIGTERM");
  const code = await waitForExit(child);
  assert.equal(code, 0);

  await waitForFile(path.join(dbFactoryOut, "db-factory.rejected"));
  assert.equal(existsSync(path.join(dbFactoryOut, "db-factory.stopped")), false);
  assert.equal(existsSync(path.join(stateDir, "build.marker.json")), false);
  assert.equal(existsSync(path.join(stateDir, "web.marker.json")), false);
  assert.equal(existsSync(path.join(stateDir, "api.marker.json")), false);
});

test("a hanging database stop is bounded and released by the real force path: owned worker group is killed, port freed, exit 0, nothing spawned, unrelated survives", { timeout: 30_000 }, async () => {
  const [dbPort] = await getDistinctFreePorts(1);
  const dbFactoryOut = mkdtempSync(path.join(os.tmpdir(), "kindred-dev-db-factory-"));
  const { child, stateDir } = await startCli({
    KINDRED_DEV_DB: "disposable",
    KINDRED_DEV_DB_FACTORY: "scripts/dev-db-factory-fixture.mjs",
    KINDRED_DEV_DB_FACTORY_OUT: dbFactoryOut,
    FAKE_DB_FACTORY_MODE: "hanging-stop",
    FAKE_DB_FACTORY_DELAY_MS: "1500",
    FAKE_DB_FACTORY_PORT: String(dbPort),
    KINDRED_DEV_GRACE_MS: "800",
    KINDRED_DEV_FORCE_GRACE_MS: "1500",
  });

  // Wait until the replica set is fully provisioned so the hanging stop is a
  // genuine "stop() never settles" on a live resource, then interrupt.
  await waitForFile(path.join(dbFactoryOut, "db-factory.provisioning"));
  const workerPid = Number(
    readFileSync(path.join(dbFactoryOut, "db-factory.worker-pid"), "utf8"),
  );
  spawnedPids.add(workerPid);
  await waitForFile(path.join(dbFactoryOut, "db-factory.created"));
  await waitForPortState(dbPort, true);
  assert.ok(isAlive(workerPid), "database worker must be alive while running");

  const unrelated = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
    stdio: "ignore",
  });
  spawnedPids.add(unrelated.pid);
  assert.ok(isAlive(unrelated.pid));

  child.kill("SIGINT");
  const startedAt = Date.now();
  const code = await waitForExit(child);
  const elapsed = Date.now() - startedAt;

  // The owned worker's stop() never settles, so shutdown must force-release it
  // by SIGKILLing the owned process group — exit 0 because cleanup is verified
  // (group dead, port free), and bounded by the grace/force windows.
  assert.equal(code, 0);
  assert.ok(elapsed < 10_000, `shutdown must stay bounded (took ${elapsed} ms)`);
  assert.match(child.output().stderr, /force-stopping: database/);
  await waitFor(() => !isAlive(workerPid));
  await waitForPortState(dbPort, false);
  assert.equal(existsSync(path.join(dbFactoryOut, "db-factory.stopped")), false);

  // The build/web/api jobs run normally while the replica set is live; the
  // DB-specific force-release must still collect the whole owned set. Any job
  // that was spawned before SIGINT must be dead after the CLI exits.
  for (const name of ["build", "web", "api"]) {
    const marker = path.join(stateDir, `${name}.marker.json`);
    if (existsSync(marker)) {
      const pid = JSON.parse(readFileSync(marker, "utf8")).pid;
      await waitFor(
        () => !isAlive(pid),
        10_000,
        `owned ${name} child must be dead`,
      );
    }
  }
  assert.ok(isAlive(unrelated.pid), "unrelated process must survive");
});
// ---------------------------------------------------------------------------
// Regression (always run): a provisioned worker stays alive after READY.
// ---------------------------------------------------------------------------

test("a provisioned worker stays alive after READY and stops only on signal", { timeout: 30_000 }, async () => {
  const [dbPort] = await getDistinctFreePorts(1);
  const dbFactoryOut = mkdtempSync(path.join(os.tmpdir(), "kindred-dev-db-worker-ready-"));
  const workerPath = path.join(repoRoot, "scripts", "dev-db-worker.mjs");
  const worker = spawn(process.execPath, [workerPath], {
    cwd: repoRoot,
    env: {
      ...minimalWorkerEnv(),
      KINDRED_DEV_DB_FACTORY: "scripts/dev-db-factory-fixture.mjs",
      KINDRED_DEV_DB_FACTORY_OUT: dbFactoryOut,
      FAKE_DB_FACTORY_MODE: "delayed-success",
      FAKE_DB_FACTORY_DELAY_MS: "200",
      FAKE_DB_FACTORY_PORT: String(dbPort),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  launchedClis.push(worker);

  let stdout = "";
  let stderr = "";
  worker.stdout.on("data", (d) => (stdout += d));
  worker.stderr.on("data", (d) => (stderr += d));

  const readyLine = await waitForLine(stdout, () => {
    const line = stdout.split("\n").find((l) => l.startsWith("KINDRED_DB_WORKER_READY "));
    assert.ok(line, `worker must become ready; stderr:\n${stderr}`);
    return line;
  }, 30_000);

  const uri = readyLine.slice("KINDRED_DB_WORKER_READY ".length).trim();
  assert.ok(uri.includes(`127.0.0.1:${dbPort}`), `expected a URI for port ${dbPort}, got "${uri}"`);
  await waitForPortState(dbPort, true);

  // The worker must stay alive after READY rather than stopping the database
  // immediately (which tore the database down before the API connected). A
  // premature stop would free the port and write the stopped marker.
  await new Promise((resolve) => setTimeout(resolve, 800));
  assert.ok(isAlive(worker.pid), "worker must stay alive after READY");
  await waitForPortState(dbPort, true);
  assert.equal(
    existsSync(path.join(dbFactoryOut, "db-factory.stopped")),
    false,
    "database must not stop on its own after READY",
  );

  const unrelated = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
    stdio: "ignore",
  });
  spawnedPids.add(unrelated.pid);

  worker.kill("SIGTERM");
  const code = await waitForExit(worker, 30_000);
  assert.equal(code, 0, `worker must stop cleanly; stderr:\n${stderr}`);
  await waitForPortState(dbPort, false);
  assert.equal(
    existsSync(path.join(dbFactoryOut, "db-factory.stopped")),
    true,
    "stop() must release the live resource on signal",
  );
  assert.ok(isAlive(unrelated.pid), "unrelated process must survive");
  unrelated.kill("SIGKILL");
});
// ---------------------------------------------------------------------------
// Integration (opt-in): the REAL mongodb-memory-server worker holds a live
// replica set and verifies that graceful stop() releases it. Requires the
// mongod binary (MongoMemoryReplSet downloads or resolves the cached
// KINDRED_DEV_DB_VERSION binary), so it is not part of the default suite.
// ---------------------------------------------------------------------------

describe(
  "real mongodb-memory-server DB worker",
  { skip: process.env.KINDRED_RUN_DB_WORKER_INTEGRATION !== "1" },
  () => {
    test("SIGTERM stops a live replica set: worker exits 0, port freed, unrelated survives", { timeout: 120_000 }, async () => {
      const workerPath = path.join(repoRoot, "scripts", "dev-db-worker.mjs");
      const worker = spawn(process.execPath, [workerPath], {
        cwd: repoRoot,
        env: {
          ...minimalWorkerEnv(),
          KINDRED_DEV_DB_VERSION: "8.0.12",
        },
        stdio: ["ignore", "pipe", "pipe"],
      });
      launchedClis.push(worker);

      let stdout = "";
      let stderr = "";
      worker.stdout.on("data", (d) => (stdout += d));
      worker.stderr.on("data", (d) => (stderr += d));

      const readyLine = await waitForLine(stdout, () => {
        const line = stdout
          .split("\n")
          .find((l) => l.startsWith("KINDRED_DB_WORKER_READY "));
        assert.ok(line, `worker must become ready; stderr:\n${stderr}`);
        return line;
      }, 90_000);

      const uri = readyLine.slice("KINDRED_DB_WORKER_READY ".length).trim();
      const portMatch = String(uri).match(/127\.0\.0\.1:(\d+)/);
      assert.ok(portMatch, `expected a 127.0.0.1:port URI, got "${uri}"`);
      const port = Number(portMatch[1]);
      await waitForPortState(port, true);

      const unrelated = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
        stdio: "ignore",
      });
      spawnedPids.add(unrelated.pid);
      assert.ok(isAlive(unrelated.pid));

      worker.kill("SIGTERM");
      const code = await waitForExit(worker, 60_000);
      assert.equal(code, 0, `worker must stop cleanly; stderr:\n${stderr}`);
      await waitForPortState(port, false);
      assert.ok(isAlive(unrelated.pid), "unrelated process must survive");
      unrelated.kill("SIGKILL");
    });
  },
);

function minimalWorkerEnv() {
  const kept = {};
  for (const key of ["PATH", "HOME", "TMPDIR", "TMP", "TERM", "LANG"]) {
    if (process.env[key] !== undefined) kept[key] = process.env[key];
  }
  return kept;
}

function waitForLine(sharedBuffer, extract, timeoutMs) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const tick = () => {
      if (Date.now() >= deadline) {
        reject(new Error(`condition timed out reading worker output: ${sharedBuffer}`));
        return;
      }
      try {
        resolve(extract());
        return;
      } catch {}
      setTimeout(tick, 100);
    };
    tick();
  });
}
