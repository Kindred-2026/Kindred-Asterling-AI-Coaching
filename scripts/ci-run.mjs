// Shared CI component runner: executes exactly one `pnpm verify` component with
// the same safe child environment local verify uses (scripts/verify.mjs
// componentEnv). This keeps CI-provider variables from leaking into
// tests/builds and guarantees local and CI behavior match, without duplicating
// the command strings or the secret-stripping logic. Usage:
//
//   node scripts/ci-run.mjs <component-name>
//
// The component names are the pnpm verify component list; the runner exits with
// the child's exit code (2 if the component name is unknown or spawn fails).

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { COMPONENTS, componentEnv } from "./verify.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

const name = process.argv[2];
const component = COMPONENTS.find((c) => c.name === name);

if (!component) {
  console.error(
    `ci-run: unknown component "${name}". Expected one of: ${COMPONENTS.map((c) => c.name).join(", ")}`,
  );
  process.exit(2);
}

const child = spawn(component.cmd, component.args, {
  cwd: ROOT,
  env: componentEnv(component),
  stdio: "inherit",
});

child.once("error", (err) => {
  console.error(`ci-run: failed to spawn ${component.name}: ${err.message}`);
  process.exit(2);
});

child.once("close", (code, signal) => {
  if (signal) {
    console.error(`ci-run: ${component.name} terminated by signal ${signal}`);
    process.exit(128 + (signal === "SIGINT" ? 2 : 15));
  }
  process.exit(code ?? 1);
});
