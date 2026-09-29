#!/usr/bin/env node
import net from "node:net";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { Pool } from "pg";

const clusterId = "w76geop28dnrplk4";
const confirmValue = "I_UNDERSTAND_THIS_IS_A_DISPOSABLE_REHEARSAL_DATABASE";
const database = process.env.POSTGRES_INTEGRATION_DATABASE;
const defaultFlyctl = join(homedir(), ".fly", "bin", "fly");
const flyctl = process.env.FLYCTL_PATH ?? (existsSync(defaultFlyctl) ? defaultFlyctl : "fly");

function fail(message) {
  console.error(message);
  process.exitCode = 1;
  throw new Error(message);
}

async function readHidden(prompt) {
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== "function") {
    fail("POSTGRES_INTEGRATION_SOURCE_URL is unset and stdin is not an interactive terminal");
  }
  process.stderr.write(`${prompt}: `);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  let value = "";
  try {
    for await (const chunk of process.stdin) {
      for (const byte of chunk) {
        if (byte === 3) throw new Error("interrupted");
        if (byte === 13 || byte === 10) {
          process.stderr.write("\n");
          return value;
        }
        if (byte === 127 || byte === 8) value = value.slice(0, -1);
        else value += String.fromCharCode(byte);
      }
    }
  } finally {
    process.stdin.setRawMode(false);
    process.stdin.pause();
  }
  fail("No connection URL was entered");
}

function waitForListener(host, port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const socket = net.connect({ host, port });
      socket.setTimeout(500);
      socket.once("connect", () => {
        socket.destroy();
        resolve();
      });
      socket.once("error", () => {
        socket.destroy();
        if (Date.now() >= deadline) reject(new Error("Fly MPG proxy did not become ready"));
        else setTimeout(attempt, 250).unref();
      });
      socket.once("timeout", () => {
        socket.destroy();
        if (Date.now() >= deadline) reject(new Error("Fly MPG proxy did not become ready"));
        else setTimeout(attempt, 250).unref();
      });
    };
    attempt();
  });
}

function waitForProxy(proxy, expected, timeoutMs) {
  return new Promise((resolve, reject) => {
    let output = "";
    const timer = setTimeout(
      () => reject(new Error("Fly MPG proxy did not confirm the expected remote cluster")),
      timeoutMs,
    );
    proxy.stdout.on("data", (chunk) => {
      output += chunk.toString();
      if (output.includes(expected)) {
        clearTimeout(timer);
        resolve();
      }
    });
    proxy.once("error", () => {
      clearTimeout(timer);
      reject(new Error("Could not start flyctl MPG proxy"));
    });
    proxy.once("exit", () => {
      clearTimeout(timer);
      reject(new Error("Fly MPG proxy exited before confirming the expected cluster"));
    });
  });
}

if (!/^kindred_rehearsal_[a-z0-9_]+$/.test(database ?? "")) {
  fail("Set POSTGRES_INTEGRATION_DATABASE to a dedicated kindred_rehearsal_ database");
}

let sourceText = process.env.POSTGRES_INTEGRATION_SOURCE_URL;
if (!sourceText)
  sourceText = await readHidden("Paste the schema-admin MPG connection URL (input is hidden)");
let source;
try {
  source = new URL(sourceText);
} catch {
  fail("The Fly MPG connection URL is invalid");
}
if (!(
  ["postgres:", "postgresql:"].includes(source.protocol) &&
  ["direct", "pgbouncer"].some((route) => source.hostname === `${route}.${clusterId}.flympg.net`) &&
  source.username &&
  source.password
)) {
  fail("Use the schema-admin connection URL from this Fly MPG cluster's Connect view");
}
if (process.env.POSTGRES_INTEGRATION_CONFIRM !== confirmValue) {
  fail(`Set POSTGRES_INTEGRATION_CONFIRM=${confirmValue}`);
}

const localPort = Number(process.env.POSTGRES_INTEGRATION_PROXY_PORT ?? 16432);
if (!Number.isInteger(localPort) || localPort < 1024 || localPort > 65535) {
  fail("POSTGRES_INTEGRATION_PROXY_PORT must be an unprivileged TCP port");
}
const target = new URL(source);
target.hostname = "127.0.0.1";
target.port = String(localPort);
target.pathname = `/${database}`;

const proxy = spawn(
  flyctl,
  ["mpg", "proxy", clusterId, "--bind-addr", "127.0.0.1", "--local-port", String(localPort)],
  { stdio: ["ignore", "pipe", "ignore"] },
);
let pool;
let interrupted = false;
const stopProxy = () => {
  if (!proxy.killed) proxy.kill("SIGTERM");
};
process.once("SIGINT", () => {
  interrupted = true;
  stopProxy();
});
process.once("SIGTERM", stopProxy);

try {
  const expectedProxy = `Proxying localhost:${localPort} to remote [direct.${clusterId}.flympg.net]:5432`;
  await waitForProxy(proxy, expectedProxy, 20_000);
  await waitForListener("127.0.0.1", localPort, 60_000);
  pool = new Pool({ connectionString: target.toString(), max: 1, connectionTimeoutMillis: 8_000 });
  const preflight = await pool.query(
    `
    SELECT current_database()::text = $1 AS expected_database,
           has_database_privilege(current_user, current_database(), 'CREATE') AS database_create,
           has_schema_privilege(current_user, 'public', 'CREATE') AS schema_create
  `,
    [database],
  );
  if (
    !preflight.rows[0]?.expected_database ||
    !preflight.rows[0]?.database_create ||
    !preflight.rows[0]?.schema_create
  ) {
    fail(
      "Connected role or database does not have the expected isolated rehearsal DDL permissions",
    );
  }
  await pool.end();
  pool = undefined;
  console.log(
    `Fly MPG proxy ready on 127.0.0.1:${localPort}; target database identity and DDL permissions verified.`,
  );

  const childEnv = {
    ...process.env,
    NODE_ENV: "test",
    POSTGRES_INTEGRATION_CONFIRM: confirmValue,
    POSTGRES_INTEGRATION_URL: target.toString(),
  };
  delete childEnv.POSTGRES_INTEGRATION_SOURCE_URL;
  delete childEnv.POSTGRES_INTEGRATION_DATABASE;
  delete childEnv.POSTGRES_INTEGRATION_PROXY_PORT;
  delete childEnv.POSTGRES_URL;
  const test = spawn(
    "corepack",
    ["pnpm", "--filter", "@workspace/db", "run", "test:postgres-integration"],
    {
      stdio: "inherit",
      env: childEnv,
    },
  );
  const exitCode = await new Promise((resolve, reject) => {
    test.once("error", reject);
    test.once("exit", (code, signal) => resolve(code ?? (signal ? 1 : 0)));
  });
  if (exitCode !== 0) process.exitCode = Number(exitCode);
  if (interrupted) process.exitCode = 130;
} finally {
  if (pool) await pool.end().catch(() => {});
  stopProxy();
  await Promise.race([new Promise((resolve) => proxy.once("exit", resolve)), delay(3_000)]);
}
