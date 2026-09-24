// Tests for scripts/verify.mjs and scripts/verify-generated.mjs — the `pnpm
// verify` orchestrator. They cover orchestration-failure naming and exit-code
// propagation, the safe child environment (secrets never forwarded, synthetic
// public Auth0 values injected), generated-client drift detection including
// deleted files, the maintained formatting boundary, and (when
// RUN_VERIFY_INTEGRATION=1) a real orval re-generation proving tracked files
// stay unchanged.

import { execFileSync, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  buildChildEnv,
  componentEnv,
  runComponent,
  verify,
  VerifyComponentError,
  VerifyInterruptedError,
  COMPONENTS,
  componentsComplete,
  finalizeEvidence,
  settleRun,
  SYNTHETIC_BUILD_CONFIG,
} from "./verify.mjs";
import { compareGeneratedTrees, snapshotGeneratorInputs } from "./verify-generated.mjs";
import { candidateState, evidenceError, readEvidence, writeEvidence } from "./verify-evidence.mjs";
import { normalizeGenerated } from "./generated-normalize.mjs";

const formatCheck = await import("./format-check.mjs");

const ROOT = fileURLToPath(new URL("..", import.meta.url));

// ---------------------------------------------------------------------------
// safe child environment
// ---------------------------------------------------------------------------

describe("buildChildEnv (safe configuration)", () => {
  test("never forwards secret-like keys or VITE_* build values", () => {
    const fixtureSecret = randomBytes(24).toString("hex");
    const parent = {
      PATH: "/usr/bin:/bin",
      HOME: "/home/ci",
      CI: undefined,
      VITE_AUTH0_CLIENT_SECRET: fixtureSecret,
      VITE_AUTH0_DOMAIN: "should-never-leak",
      VITE_AUTH0_CLIENT_ID: "should-never-leak",
      VITE_AUTH0_AUDIENCE: "should-never-leak",
      AUTH0_CLIENT_SECRET: fixtureSecret,
      AUTH0_MANAGEMENT_TOKEN: fixtureSecret,
      MONGODB_URI: `mongodb://127.0.0.1:27017/${fixtureSecret}`,
      OPENAI_API_KEY: fixtureSecret,
      AWS_SECRET_ACCESS_KEY: fixtureSecret,
      AUTH0_DOMAIN: "real.prod.auth0",
    };
    const env = buildChildEnv(parent);
    for (const forbidden of [
      "VITE_AUTH0_CLIENT_SECRET",
      "VITE_AUTH0_DOMAIN",
      "VITE_AUTH0_CLIENT_ID",
      "VITE_AUTH0_AUDIENCE",
      "AUTH0_CLIENT_SECRET",
      "AUTH0_MANAGEMENT_TOKEN",
      "MONGODB_URI",
      "OPENAI_API_KEY",
      "AWS_SECRET_ACCESS_KEY",
      "AUTH0_DOMAIN",
    ]) {
      assert.equal(forbidden in env, false, `${forbidden} must not be forwarded`);
    }
    assert.equal(env.PATH, "/usr/bin:/bin");
    assert.equal(env.HOME, "/home/ci");
    assert.equal(env.CI, "1");
    assert.equal(env.NODE_ENV, "test");
    assert.equal(env.HELCIM_PAYMENTS_ENABLED, "false");
  });

  test("injects synthetic public build config only when requested", () => {
    const base = buildChildEnv({ PATH: "/usr/bin:/bin" });
    assert.equal("VITE_AUTH0_DOMAIN" in base, false);
    const synthetic = buildChildEnv({ PATH: "/usr/bin:/bin" }, { synthetic: true });
    assert.deepEqual(
      {
        VITE_AUTH0_DOMAIN: synthetic.VITE_AUTH0_DOMAIN,
        VITE_AUTH0_CLIENT_ID: synthetic.VITE_AUTH0_CLIENT_ID,
        VITE_AUTH0_AUDIENCE: synthetic.VITE_AUTH0_AUDIENCE,
      },
      SYNTHETIC_BUILD_CONFIG,
    );
  });

  test("componentEnv injects synthetic config only for the frontend build", () => {
    const buildFrontend = COMPONENTS.find((c) => c.name === "build:frontend");
    const typecheck = COMPONENTS.find((c) => c.name === "typecheck:production");
    assert.ok(buildFrontend.synthetic, "build:frontend must be marked synthetic");
    assert.equal(typecheck.synthetic, undefined);
    assert.equal(
      componentEnv(buildFrontend).VITE_AUTH0_CLIENT_ID,
      SYNTHETIC_BUILD_CONFIG.VITE_AUTH0_CLIENT_ID,
    );
    assert.equal("VITE_AUTH0_CLIENT_ID" in componentEnv(typecheck), false);
  });
});

// ---------------------------------------------------------------------------
// orchestration: exit-code propagation, fail-fast, component naming
// ---------------------------------------------------------------------------

describe("runComponent", () => {
  test("resolves on exit 0", async () => {
    const result = await runComponent(
      { name: "test-pass", cmd: process.execPath, args: ["-e", "process.exit(0)"] },
      { log: () => {} },
    );
    assert.equal(result.code, 0);
  });

  test("throws VerifyComponentError with component name and exit code on nonzero exit", async () => {
    await assert.rejects(
      runComponent(
        {
          name: "test-fail",
          cmd: process.execPath,
          args: ["-e", "process.exit(7)"],
        },
        { log: () => {} },
      ),
      (err) => {
        assert.ok(err instanceof VerifyComponentError);
        assert.equal(err.component, "test-fail");
        assert.equal(err.exitCode, 7);
        return true;
      },
    );
  });
});

describe("verify ordering and failure naming", () => {
  const failingRun =
    (failOn) =>
    async (component, { log = console } = {}) => {
      log(`[verify] test run ${component.name}`);
      if (component.name === failOn) {
        throw new VerifyComponentError(component.name, 3, null);
      }
      return { component: component.name, code: 0 };
    };

  test("stops at the first failing component and reports its name", async () => {
    const result = await verify({
      components: [
        { name: "a", cmd: "ignored", args: [] },
        { name: "b", cmd: "ignored", args: [] },
        { name: "c", cmd: "ignored", args: [] },
      ],
      runFn: failingRun("b"),
      log: () => {},
    });
    assert.deepEqual(result.passed, ["a"]);
    assert.equal(result.failed, "b");
    assert.equal(result.exitCode, 3);
  });

  test("reports all components passing when nothing fails", async () => {
    const result = await verify({
      components: [
        { name: "a", cmd: "ignored", args: [] },
        { name: "b", cmd: "ignored", args: [] },
      ],
      runFn: failingRun(null),
      log: () => {},
    });
    assert.deepEqual(result.passed, ["a", "b"]);
    assert.equal(result.failed, null);
  });
});

// ---------------------------------------------------------------------------
// generated-client drift detection (including deleted files)
// ---------------------------------------------------------------------------

function files(entries) {
  return new Map(
    Object.entries(entries).map(([rel, content]) => [rel, Buffer.from(content, "utf8")]),
  );
}

describe("compareGeneratedTrees", () => {
  const base = files({
    "api.ts": "export const A = 1;\n",
    "types/habit.ts": "export const habit = {};\n",
    "api.schemas.ts": "export const X = 1;\n",
    "toBeDeleted.ts": "export const legacy = 1;\n",
  });

  test("detects changed, removed (deleted) and added files separately", () => {
    const candidate = files({
      "api.ts": "export const A = 2;\n",
      "types/habit.ts": "export const habit = {};\n",
      "api.schemas.ts": "export const X = 1;\n",
      "brandNew.ts": "export const fresh = 1;\n",
    });
    const drift = compareGeneratedTrees(base, candidate);
    assert.deepEqual(drift.changed, ["api.ts"]);
    assert.deepEqual(drift.removed, ["toBeDeleted.ts"]);
    assert.deepEqual(drift.added, ["brandNew.ts"]);
  });

  test("no drift when trees match byte-for-byte", () => {
    const drift = compareGeneratedTrees(base, new Map(base));
    assert.deepEqual(drift, { removed: [], added: [], changed: [] });
  });
});

// ---------------------------------------------------------------------------
// maintained formatting boundary
// ---------------------------------------------------------------------------

describe("formatting boundary", () => {
  test("always covers the maintained developer-workflow surface", async () => {
    const files = await formatCheck.collectBoundaryFiles();
    for (const expected of [
      "scripts/verify.mjs",
      "scripts/verify-generated.mjs",
      "scripts/format-check.mjs",
      "package.json",
      "pnpm-workspace.yaml",
      "lib/api-spec/orval.config.ts",
    ]) {
      assert.ok(files.includes(expected), `boundary must include ${expected}`);
    }
  });

  test("never includes lockfiles, prose docs, env files, or generated output", async () => {
    const files = await formatCheck.collectBoundaryFiles();
    for (const rel of files) {
      assert.ok(!rel.startsWith("docs/"), `prose docs are outside: ${rel}`);
      assert.ok(!/\/generated\//.test(rel), `generated output is outside: ${rel}`);
      assert.ok(!/\.env/.test(rel), `env files are outside: ${rel}`);
      assert.ok(!/pnpm-lock|package-lock|yarn\.lock/.test(rel), `lockfiles are outside: ${rel}`);
    }
  });

  test("legacy pre-existing scripts stay on the documented format baseline", async () => {
    const files = await formatCheck.collectBoundaryFiles();
    for (const legacy of [
      "scripts/dev.mjs",
      "scripts/dev-supervisor.mjs",
      "scripts/dev-supervisor.test.mjs",
    ]) {
      assert.ok(!files.includes(legacy), `${legacy} must remain on the legacy baseline`);
    }
  });

  test("the enforced boundary is currently prettier-clean (format:check passes)", async () => {
    const status = await formatCheck.run();
    assert.equal(status, 0, "format:check must pass on the maintained boundary");
  });
});

// ---------------------------------------------------------------------------
// integration (opt-in): real orval re-generation keeps tracked files unchanged
// ---------------------------------------------------------------------------

describe(
  "generated-client integration (real orval)",
  { skip: process.env.RUN_VERIFY_INTEGRATION !== "1" },
  () => {
    test("running generate:check leaves tracked files byte-identical and passes", () => {
      const paths = ["lib/api-client-react/src/generated", "lib/api-zod/src/generated"];
      const before = gitStatus(paths);
      const r = spawnSync(process.execPath, ["scripts/verify-generated.mjs"], {
        cwd: ROOT,
        encoding: "utf8",
      });
      assert.equal(r.status, 0, (r.stdout || "") + (r.stderr || ""));
      assert.equal(gitStatus(paths), before, "tracked generated files must not change");
    });
  },
);

function gitStatus(paths) {
  const r = spawnSync("git", ["status", "--porcelain", "--", ...paths], {
    cwd: ROOT,
    encoding: "utf8",
  });
  if (r.status !== 0) throw new Error(`git status failed: ${r.stderr}`);
  return r.stdout;
}

// ---------------------------------------------------------------------------
// evidence: content-bound candidate fingerprint
// ---------------------------------------------------------------------------

function gitRun(cwd, args) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

async function withRepo(fn) {
  const dir = mkdtempSync(join(tmpdir(), "kindred-verify-candidate-"));
  gitRun(dir, ["init", "-b", "main"]);
  gitRun(dir, ["config", "user.email", "t@example.com"]);
  gitRun(dir, ["config", "user.name", "t"]);
  writeFileSync(join(dir, "file.txt"), "one\n");
  gitRun(dir, ["add", "."]);
  gitRun(dir, ["commit", "-m", "init"]);
  try {
    await fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// Real candidateState() for a disposable repo (subprocess so KINDRED_RELEASE_ROOT
// binds runGit to the repo, exactly like release:check uses it).
function stateAt(dir) {
  const r = spawnSync(
    process.execPath,
    [
      "-e",
      `import(process.env.VERIFY_EVIDENCE_IMPORT).then((m) => process.stdout.write(JSON.stringify(m.candidateState()))).catch((e) => { console.error(e); process.exit(1); });`,
    ],
    {
      env: {
        ...process.env,
        KINDRED_RELEASE_ROOT: dir,
        VERIFY_EVIDENCE_IMPORT: pathToFileURL(join(ROOT, "scripts", "verify-evidence.mjs")).href,
      },
      encoding: "utf8",
    },
  );
  assert.equal(r.status, 0, `candidateState failed:\n${r.stderr}`);
  return JSON.parse(r.stdout);
}

describe("content-bound candidate fingerprint", () => {
  test("re-editing an already-dirty file changes the fingerprint while porcelain stays identical", async () => {
    await withRepo((dir) => {
      writeFileSync(join(dir, "file.txt"), "two\n");
      const b = stateAt(dir);
      assert.equal(b.dirty, true);
      writeFileSync(join(dir, "file.txt"), "three\n");
      const c = stateAt(dir);
      assert.equal(c.dirty, true);
      assert.notEqual(b.fingerprint, c.fingerprint, "same path, different content, must differ");
    });
  });

  test("staged changes are content-bound", async () => {
    await withRepo((dir) => {
      writeFileSync(join(dir, "file.txt"), "staged\n");
      gitRun(dir, ["add", "file.txt"]);
      const staged = stateAt(dir);
      writeFileSync(join(dir, "file.txt"), "re-staged\n");
      gitRun(dir, ["add", "file.txt"]);
      const restaged = stateAt(dir);
      assert.notEqual(staged.fingerprint, restaged.fingerprint);
    });
  });

  test("untracked candidate changes are content-bound", async () => {
    await withRepo((dir) => {
      writeFileSync(join(dir, "new.txt"), "one\n");
      const a = stateAt(dir);
      writeFileSync(join(dir, "new.txt"), "two\n");
      const b = stateAt(dir);
      assert.notEqual(a.fingerprint, b.fingerprint);
    });
  });

  test("a commit during the candidate lifecycle is bound to the new HEAD", async () => {
    await withRepo((dir) => {
      const before = stateAt(dir);
      writeFileSync(join(dir, "file.txt"), "committed\n");
      gitRun(dir, ["add", "."]);
      gitRun(dir, ["commit", "-m", "change"]);
      const after = stateAt(dir);
      assert.equal(after.dirty, false);
      assert.notEqual(before.fingerprint, after.fingerprint);
    });
  });
});

// ---------------------------------------------------------------------------
// evidence: finalization decisions and schema
// ---------------------------------------------------------------------------

function withEvidenceFile(fn) {
  const dir = mkdtempSync(join(tmpdir(), "kindred-evidence-"));
  const file = join(dir, "evidence.json");
  try {
    return fn(file);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const FULL_PASSED = COMPONENTS.map((c) => c.name);

describe("evidence finalization", () => {
  test("writes success evidence only for a stable, complete, untouched candidate", () => {
    withEvidenceFile((file) => {
      const state = { head: "h1", branch: "main", fingerprint: "fp" };
      finalizeEvidence({
        before: state,
        after: { ...state },
        passed: FULL_PASSED,
        evidenceFile: file,
        toolchain: { node: process.version },
        log: () => {},
      });
      const ev = readEvidence(file);
      assert.ok(ev, "success evidence must be written");
      assert.equal(ev.schema, 2);
      assert.equal(ev.fingerprint, "fp");
      assert.deepEqual(ev.components, FULL_PASSED);
    });
  });

  test("an interrupted run invalidates evidence instead of recording success", () => {
    withEvidenceFile((file) => {
      writeEvidence(
        {
          state: { head: "h1", branch: "main", fingerprint: "old" },
          components: FULL_PASSED,
          toolchain: { node: process.version },
        },
        file,
      );
      const state = { head: "h2", branch: "main", fingerprint: "new" };
      const out = finalizeEvidence({
        before: state,
        after: { ...state },
        passed: FULL_PASSED,
        interruptedSignal: "SIGINT",
        evidenceFile: file,
        log: () => {},
      });
      assert.equal(existsSync(file), false, "interrupted run must not leave older success valid");
      assert.deepEqual(out, { action: "invalidate", reason: "interrupted (SIGINT)" });
    });
  });

  test("a working tree that changed during the run invalidates evidence (mutation regression)", () => {
    withEvidenceFile((file) => {
      const before = { head: "h1", branch: "main", fingerprint: "before" };
      finalizeEvidence({
        before,
        after: { ...before, fingerprint: "after" },
        passed: FULL_PASSED,
        evidenceFile: file,
        log: () => {},
      });
      assert.equal(
        existsSync(file),
        false,
        "evidence must not be stamped for the final state alone",
      );
    });
  });

  test("a run that did not cover the complete component set records no success evidence", () => {
    withEvidenceFile((file) => {
      const state = { head: "h1", branch: "main", fingerprint: "fp" };
      finalizeEvidence({
        before: state,
        after: { ...state },
        passed: ["format:check"],
        evidenceFile: file,
        log: () => {},
      });
      assert.equal(existsSync(file), false, "partial runs must not produce success evidence");
    });
  });

  test("a failed run invalidates prior success evidence (failed rerun regression)", () => {
    withEvidenceFile((file) => {
      writeEvidence(
        {
          state: { head: "h1", branch: "main", fingerprint: "old" },
          components: FULL_PASSED,
          toolchain: { node: process.version },
        },
        file,
      );
      const state = { head: "h2", branch: "main", fingerprint: "new" };
      const out = settleRun({
        result: { passed: ["format:check"], failed: "typecheck:production", exitCode: 1 },
        before: state,
        after: { ...state },
        evidenceFile: file,
        log: () => {},
      });
      assert.equal(existsSync(file), false, "a failed rerun must not leave older success valid");
      assert.deepEqual(out, {
        action: "invalidate",
        reason: "component failed: typecheck:production",
      });
    });
  });

  test("an interrupted run invalidates evidence via settleRun too", () => {
    withEvidenceFile((file) => {
      writeEvidence(
        {
          state: { head: "h1", branch: "main", fingerprint: "old" },
          components: FULL_PASSED,
          toolchain: { node: process.version },
        },
        file,
      );
      const state = { head: "h2", branch: "main", fingerprint: "new" };
      settleRun({
        result: { passed: FULL_PASSED, failed: null, exitCode: 0 },
        before: state,
        after: { ...state },
        interruptedSignal: "SIGTERM",
        evidenceFile: file,
        log: () => {},
      });
      assert.equal(existsSync(file), false, "an interrupted run must invalidate evidence");
    });
  });
});

describe("componentsComplete and evidence schema", () => {
  test("componentsComplete requires the exact expected component set", () => {
    assert.equal(componentsComplete(FULL_PASSED), true);
    assert.equal(componentsComplete([]), false);
    assert.equal(componentsComplete(["format:check"]), false);
    assert.equal(componentsComplete([...FULL_PASSED, "extra"]), false);
  });

  test("writeEvidence records schema and toolchain and round-trips", () => {
    withEvidenceFile((file) => {
      const state = { head: "abc", branch: "main", fingerprint: "fp" };
      const toolchain = { node: process.version, pnpm: "pnpm@10.28.1", orval: "^8.22.0" };
      writeEvidence({ state, components: FULL_PASSED, toolchain }, file);
      const ev = readEvidence(file);
      assert.equal(ev.schema, 2);
      assert.equal(ev.fingerprint, "fp");
      assert.deepEqual(ev.toolchain, toolchain);
      assert.deepEqual(ev.components, FULL_PASSED);
    });
  });

  test("evidenceError rejects malformed, wrong-schema and toolchain-less evidence", () => {
    const good = {
      schema: 2,
      sha: "a",
      fingerprint: "b",
      components: ["x"],
      toolchain: { node: process.version },
    };
    assert.equal(evidenceError(good), null);
    assert.ok(evidenceError(null));
    assert.ok(evidenceError({}));
    assert.ok(evidenceError({ ...good, schema: 1 }));
    assert.ok(evidenceError({ ...good, fingerprint: "" }));
    assert.ok(evidenceError({ ...good, components: "nope" }));
    assert.ok(evidenceError({ ...good, toolchain: {} }));
  });
});

// ---------------------------------------------------------------------------
// interruption: cancel pending components and stop only the owned process group
// ---------------------------------------------------------------------------

async function waitForExit(pid, timeoutMs = 3000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      process.kill(pid, 0);
    } catch {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return false;
}

describe("interruption cancels pending components and stops owned processes", () => {
  test("abort during a long component kills it (and its descendant) and runs no later component", async () => {
    const dir = mkdtempSync(join(tmpdir(), "kindred-verify-interrupt-"));
    const pidFile = join(dir, "descendant.pid");
    const laterMarker = join(dir, "later-ran");
    const longComponent = {
      name: "long",
      cmd: process.execPath,
      args: [
        "-e",
        [
          "const { spawn } = require('node:child_process');",
          "const fs = require('node:fs');",
          "const c = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { stdio: 'ignore' });",
          "fs.writeFileSync(process.argv[1], String(c.pid));",
          "setInterval(()=>{}, 1000);",
        ].join("\n"),
        pidFile,
      ],
    };
    const laterComponent = {
      name: "later",
      cmd: process.execPath,
      args: ["-e", `require('node:fs').writeFileSync(process.argv[1], 'ran')`, laterMarker],
    };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort("SIGINT"), 500);
    try {
      await assert.rejects(
        verify({
          components: [longComponent, laterComponent],
          signal: controller.signal,
          log: () => {},
        }),
        (err) => {
          assert.ok(err instanceof VerifyInterruptedError, "must throw VerifyInterruptedError");
          assert.equal(err.signal, "SIGINT");
          return true;
        },
      );
    } finally {
      clearTimeout(timer);
      rmSync(dir, { recursive: true, force: true });
    }
    assert.equal(existsSync(laterMarker), false, "later component must not run after interruption");
    if (existsSync(pidFile)) {
      const pid = Number(readFileSync(pidFile, "utf8"));
      assert.equal(await waitForExit(pid), true, "owned descendant must be stopped");
    }
  });

  test("an already-aborted signal rejects before spawning anything", async () => {
    const controller = new AbortController();
    controller.abort("SIGTERM");
    await assert.rejects(
      runComponent(
        { name: "never", cmd: process.execPath, args: ["-e", "process.exit(0)"] },
        { log: () => {}, signal: controller.signal },
      ),
      (err) => err instanceof VerifyInterruptedError,
    );
  });
});

// ---------------------------------------------------------------------------
// minimal generator-input snapshot: secret/operational files are never copied
// ---------------------------------------------------------------------------

describe("minimal generator-input snapshot", () => {
  test("copies the contract/config and never copies secret or operational files", async () => {
    const dir = mkdtempSync(join(tmpdir(), "kindred-snapshot-"));
    const root = join(dir, "root");
    const harness = join(dir, "harness");
    mkdirSync(join(root, "lib", "api-spec"), { recursive: true });
    mkdirSync(join(root, "lib", "api-client-react", "src"), { recursive: true });
    mkdirSync(join(root, "deploy"), { recursive: true });
    writeFileSync(join(root, "package.json"), "{}\n");
    writeFileSync(join(root, "lib", "api-spec", "openapi.yaml"), "openapi: 3.0.0\n");
    writeFileSync(join(root, "lib", "api-spec", "orval.config.ts"), "export default {};\n");
    writeFileSync(join(root, "lib", "api-client-react", "src", "custom-fetch.ts"), "export {};\n");
    // Sentinel secret/operational fixtures (fake values, never real secrets).
    writeFileSync(join(root, ".env.local"), "VITE_AUTH0_CLIENT_ID=sentinel-secret\n");
    writeFileSync(join(root, ".env.1password"), "DATABASE_URL=op://sentinel\n");
    writeFileSync(join(root, "SECRET_INVENTORY.md"), "sentinel secret inventory\n");
    writeFileSync(join(root, "deploy", "secrets.yaml"), "token: sentinel\n");

    await snapshotGeneratorInputs(root, harness);

    assert.equal(existsSync(join(harness, "lib", "api-spec", "openapi.yaml")), true);
    assert.equal(existsSync(join(harness, "lib", "api-spec", "orval.config.ts")), true);
    assert.equal(
      existsSync(join(harness, "lib", "api-client-react", "src", "custom-fetch.ts")),
      true,
    );
    assert.equal(existsSync(join(harness, "package.json")), true);
    for (const forbidden of [".env.local", ".env.1password", "SECRET_INVENTORY.md", "deploy"]) {
      assert.equal(existsSync(join(harness, forbidden)), false, `${forbidden} must not be copied`);
    }
    rmSync(dir, { recursive: true, force: true });
  });
});

// ---------------------------------------------------------------------------
// generated output normalization
// ---------------------------------------------------------------------------

describe("generated output normalization", () => {
  test("normalizeGenerated collapses trailing blank lines to a single newline", () => {
    assert.equal(normalizeGenerated("export const a = 1;\n\n\n"), "export const a = 1;\n");
    assert.equal(normalizeGenerated("export const a = 1;\n"), "export const a = 1;\n");
    assert.equal(normalizeGenerated("export const a = 1;"), "export const a = 1;\n");
    assert.equal(normalizeGenerated("export const a = 1;   \n\n"), "export const a = 1;\n");
  });
});

// ---------------------------------------------------------------------------
// CI rules and the shared safe execution path
// ---------------------------------------------------------------------------

describe("CI rules and shared safe execution path", () => {
  test("GitHub Actions CI defines the maintained test and build jobs", () => {
    const yaml = readFileSync(join(ROOT, ".github/workflows/ci.yml"), "utf8");
    for (const job of ["typecheck:", "test-api-server:", "test-kindred-coach:", "build:"]) {
      assert.match(yaml, new RegExp(`\\n  ${job}`), `CI workflow must include ${job}`);
    }
    assert.match(yaml, /pnpm run typecheck/);
    assert.match(yaml, /pnpm --filter @workspace\/db run test:api/);
    assert.match(yaml, /pnpm --filter @workspace\/kindred-coach run test/);
  });

  test("ci-run rejects an unknown component with exit 2", () => {
    const r = spawnSync(process.execPath, [join(ROOT, "scripts", "ci-run.mjs"), "bogus"], {
      cwd: ROOT,
      encoding: "utf8",
    });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /unknown component/);
  });
});
