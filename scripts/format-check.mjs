// `pnpm format:check` / `pnpm format` — maintained formatting boundary.
//
// The enforced boundary is the developer-workflow surface ("maintained files"):
//
//   * `scripts/*.{js,mjs,ts}` and `scripts/src/*.{ts,tsx}` — new files added
//     later are automatically included, so new violations cannot silently slip
//     past a formatting change.
//   * The workspace and CI config: root and `scripts/` package/tsconfig JSON,
//     `pnpm-workspace.yaml`, `.prettierrc.json`.
//   * The generated-client contract: `lib/api-spec/orval.config.ts` and the
//     hand-authored `lib/api-client-react` / `lib/api-zod` entrypoints.
//
// The pre-existing `scripts/` runtime and test files were NOT written with
// prettier and are listed in LEGACY_FORMAT_BASELINE. They are a documented
// formatting baseline; bringing them (or legacy `lib/`, `artifacts/`, `docs/`)
// into the enforced boundary is a separate reviewed change so that this
// workflow does not force a repository-wide formatting rewrite
// (docs/specs/phase-3-developer-workflow.md, section 3B).
//
// This command never rewrites files unless explicitly invoked with `--write`.

import { spawnSync } from "node:child_process";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const write = process.argv.includes("--write");

const EXPLICIT_CONFIG_FILES = [
  "package.json",
  "pnpm-workspace.yaml",
  ".prettierrc.json",
  "tsconfig.json",
  "tsconfig.base.json",
  "scripts/package.json",
  "scripts/tsconfig.json",
  "lib/api-spec/orval.config.ts",
  "lib/api-client-react/src/index.ts",
  "lib/api-client-react/src/custom-fetch.ts",
  "lib/api-zod/src/index.ts",
];

// Pre-existing developer-workflow files that predate the prettier boundary.
// They stay outside the enforced set until a dedicated formatting-baseline
// change brings them in; this list is the explicit, reviewed exception.
const LEGACY_FORMAT_BASELINE = new Set([
  "scripts/dev.mjs",
  "scripts/dev-supervisor.mjs",
  "scripts/dev-supervisor.test.mjs",
  "scripts/dev-db-factory-fixture.mjs",
  "scripts/dev-supervisor-fixture.mjs",
  "scripts/generate-docs.mjs",
  "scripts/src/clerk-admin.ts",
  "scripts/src/hello.ts",
]);

async function listDirFiles(relDir, extensions) {
  const files = [];
  let entries = [];
  try {
    entries = await fsp.readdir(path.join(ROOT, relDir), { withFileTypes: true });
  } catch {
    return files;
  }
  for (const entry of entries) {
    if (entry.isFile() && extensions.some((ext) => entry.name.endsWith(`.${ext}`))) {
      files.push(`${relDir}${entry.name}`);
    }
  }
  return files.sort();
}

export async function collectBoundaryFiles() {
  const files = new Set([...EXPLICIT_CONFIG_FILES]);
  for (const rel of await listDirFiles("scripts/", ["js", "mjs", "ts"])) {
    if (!LEGACY_FORMAT_BASELINE.has(rel)) files.add(rel);
  }
  for (const rel of await listDirFiles("scripts/src/", ["ts", "tsx"])) {
    if (!LEGACY_FORMAT_BASELINE.has(rel)) files.add(rel);
  }
  const existing = [];
  for (const rel of files) {
    try {
      await fsp.access(path.join(ROOT, rel));
      existing.push(rel);
    } catch {
      // ignore missing files
    }
  }
  return existing.sort();
}

export async function run() {
  const files = await collectBoundaryFiles();
  if (files.length === 0) {
    console.log("[format] no files in the maintained formatting boundary");
    return 0;
  }
  const args = [
    "exec",
    "prettier",
    "--config",
    ".prettierrc.json",
    write ? "--write" : "--check",
    "--",
    ...files,
  ];
  if (write) {
    console.log(`[format] formatting ${files.length} maintained file(s)...`);
  }
  const r = spawnSync("pnpm", args, { cwd: ROOT, stdio: "inherit" });
  return r.status ?? 1;
}

async function main() {
  process.exitCode = await run();
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
