#!/usr/bin/env node
// Runs `fly mcp server` over stdio, but forces the legacy initialize handshake.
// flyctl 0.4.108 advertises MCP 2026-07-28 via server/discover yet never answers
// tools/list in that mode, so Claude Code times out fetching tools. Rejecting the
// discover probe makes the client fall back to initialize, which flyctl handles.
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

const fly = spawn("fly", ["mcp", "server"], { stdio: ["pipe", "inherit", "inherit"] });
fly.on("error", (err) => {
  process.stderr.write(`fly-mcp: failed to start fly: ${err.message}\n`);
  process.exit(1);
});
fly.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));

createInterface({ input: process.stdin })
  .on("line", (line) => {
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      fly.stdin.write(line + "\n");
      return;
    }
    if (msg.method === "server/discover" && msg.id !== undefined) {
      process.stdout.write(
        JSON.stringify({
          jsonrpc: "2.0",
          id: msg.id,
          error: { code: -32601, message: "Method not found" },
        }) + "\n",
      );
      return;
    }
    fly.stdin.write(line + "\n");
  })
  .on("close", () => fly.stdin.end());

for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => fly.kill(sig));
