// Port and HTTP probes for the dev supervisor: port preflight and child
// readiness checks.

import net from "node:net";

import { sleep } from "./dev-supervisor-process.mjs";

// ---------------------------------------------------------------------------
// Port helpers
// ---------------------------------------------------------------------------

// True if nothing is listening on host:port (we can bind it right now).
export function checkPortFree(port, host = "0.0.0.0") {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", (err) => {
      // EADDRINUSE / EACCES mean the port is effectively taken.
      server.close();
      resolve(err?.code !== "EADDRINUSE" && err?.code !== "EACCES");
    });
    server.once("listening", () => server.close(() => resolve(true)));
    server.listen(port, host);
  });
}

// True if something is already listening on host:port.
export async function checkPortInUse(port, host = "0.0.0.0") {
  return !(await checkPortFree(port, host));
}

// Returns the occupied entries from `ports` ({ port, label })[].
export async function preflightPorts(ports) {
  const occupied = [];
  for (const entry of ports) {
    if (await checkPortInUse(entry.port)) occupied.push(entry);
  }
  return occupied;
}

// ---------------------------------------------------------------------------
// Readiness
// ---------------------------------------------------------------------------

async function waitForHttp(url, { pollMs, timeoutMs, cancelled }) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (cancelled?.()) return false;
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(Math.min(pollMs, timeoutMs)),
      });
      if (response.ok) return true;
    } catch {
      // still starting; keep polling
    }
    await sleep(pollMs);
  }
  return false;
}

async function waitForPort(port, host, { pollMs, timeoutMs, cancelled }) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (cancelled?.()) return false;
    if (await checkPortInUse(port, host)) return true;
    await sleep(pollMs);
  }
  return false;
}

export async function waitForReadiness(job, options = {}) {
  const { pollMs = 200, timeoutMs = 60_000 } = options;
  if (!job.readiness) return { ok: true, job };
  const { type, timeoutMs: jobTimeoutMs = timeoutMs } = job.readiness;
  const ok =
    type === "http" && job.readiness.url
      ? await waitForHttp(job.readiness.url, {
          pollMs,
          timeoutMs: jobTimeoutMs,
          cancelled: options.cancelled,
        })
      : type === "port"
        ? await waitForPort(job.readiness.port, job.readiness.host, {
            pollMs,
            timeoutMs: jobTimeoutMs,
            cancelled: options.cancelled,
          })
        : true;
  return { ok, job };
}
