// `pnpm release:check` — read-only release-readiness evidence reporter.
//
// Reports the candidate (exact SHA + branch + working-tree changes without any
// file contents), whether the last `pnpm verify` evidence belongs to that exact
// candidate state, whether required public build/runtime variables are present
// and the frontend/API Auth0 issuer + audience are consistent, and the status
// of each published-release field (push / CI / merge / deploy / acceptance /
// rollback). Distinguishes local proof from CI proof and production proof.
//
// It NEVER runs verification, builds or installs, never writes files, never
// calls out to a remote and never prints secret values. Missing remote access
// is reported as unverified, never as passed.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";
import {
  candidateState,
  currentToolchain,
  evidenceError,
  readEvidence,
  EVIDENCE_FILE,
  ROOT,
  runGit,
} from "./verify-evidence.mjs";
import { COMPONENTS, componentsComplete } from "./verify.mjs";

// Exit code bits. Remainder (unverified remote/production fields) is always
// part of the report; the bits below mark the locally-detectable problems.
export const EXIT = {
  CLEAN: 0,
  EVIDENCE_MISSING_STALE: 1 << 0, // no evidence or evidence from another state
  DIRTY_CANDIDATE: 1 << 1, // working tree has tracked/untracked changes
  CONFIG_INCOMPLETE: 1 << 2, // required public vars missing or incoherent
  REMOTE_UNVERIFIED: 1 << 3, // remote/production fields still unverified
  NO_CANDIDATE: 1 << 6, // cannot determine candidate (not a git repo)
};

const FRONTEND_ENV_FILE = join(ROOT, "artifacts", "kindred-coach", ".env.local");
const ROLLBACK_DOC = join(ROOT, "docs", "release-rollback.md");

// Public build/runtime variable names that must exist before a release can be
// accepted. Values are never printed. VITE_* are public browser build values;
// AUTH0_* are the API runtime equivalents in the deployment environment. The
// frontend cannot sign in without a client id, so it is required alongside the
// matching domain/audience pair rather than inferred from their coherence.
export const REQUIRED_VARS = [
  "AUTH0_DOMAIN",
  "AUTH0_AUDIENCE",
  "VITE_AUTH0_DOMAIN",
  "VITE_AUTH0_CLIENT_ID",
  "VITE_AUTH0_AUDIENCE",
];

function readFrontendEnvFile() {
  try {
    const text = readFileSync(FRONTEND_ENV_FILE, "utf8");
    const vars = {};
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)=(.*)$/);
      if (match) vars[match[1]] = match[2];
    }
    return vars;
  } catch {
    return {};
  }
}

function frontendValue(env, envFile) {
  return (name) => env[name] ?? envFile[name];
}

function gitExists(args) {
  try {
    runGit(args);
    return true;
  } catch {
    return false;
  }
}

function gitRevParseQuiet(ref) {
  try {
    return runGit(["rev-parse", "--verify", "--quiet", ref]);
  } catch {
    return null;
  }
}

export function collectConfig(env = process.env, envFile = readFrontendEnvFile()) {
  const frontend = frontendValue(env, envFile);
  const presence = {};
  for (const name of REQUIRED_VARS) {
    // Whitespace-only values are treated as missing, so a value of spaces or an
    // empty string cannot satisfy a required key. Presence is distinct from
    // coherence: presence records whether each key has a real value, while
    // coherence compares the API and web sides only when both are present.
    presence[name] = typeof env[name] === "string" && env[name].trim() !== "";
  }
  const apiDomain = env.AUTH0_DOMAIN?.trim();
  const apiAudience = env.AUTH0_AUDIENCE?.trim();
  const webDomain = frontend("VITE_AUTH0_DOMAIN")?.trim();
  const webAudience = frontend("VITE_AUTH0_AUDIENCE")?.trim();
  const sides = { api: Boolean(apiDomain && apiAudience), web: Boolean(webDomain && webAudience) };
  const coherence = {
    issuer: sides.api && sides.web ? apiDomain === webDomain : null,
    audience: sides.api && sides.web ? apiAudience === webAudience : null,
  };
  const anyMissing = Object.values(presence).some((present) => !present);
  let status = "coherent";
  if (coherence.issuer === false || coherence.audience === false) status = "incoherent";
  else if (anyMissing) status = "incomplete";
  return {
    presence,
    sides,
    coherence,
    status,
    webSource: env.VITE_AUTH0_DOMAIN ? "shell" : "env.local",
  };
}

export function collectPublished({ state }) {
  const branch = state.branch;
  const pushed = branch ? gitRevParseQuiet(`origin/${branch}`) === state.head : false;
  const merged = branch
    ? gitExists(["merge-base", "--is-ancestor", state.head, "origin/main"])
    : false;
  const rollback = existsSync(ROLLBACK_DOC);
  return {
    push: {
      verified: pushed,
      detail: pushed
        ? `origin/${branch} points at ${state.head}`
        : `no origin/${branch ?? "<detached>"} at ${state.head}`,
    },
    ci: {
      verified: false,
      detail:
        "pending GitHub Actions workflow evidence for the pushed SHA (requires remote access)",
    },
    merge: {
      verified: merged,
      detail: merged
        ? "candidate is an ancestor of origin/main"
        : "candidate not merged into origin/main",
    },
    deployed: {
      verified: false,
      detail:
        "pending selected deployment provider's dashboard/revision evidence (requires provider access)",
    },
    acceptance: { verified: false, detail: "pending authorized human production acceptance" },
    rollback: {
      verified: rollback,
      detail: rollback
        ? "documented rollback procedure present (docs/release-rollback.md)"
        : "no documented rollback procedure found",
    },
  };
}

export function toolchainMatch(recorded, current) {
  if (!recorded || typeof recorded !== "object") return false;
  // The Node runtime version must match: a verify run under a different
  // runtime does not prove anything for the current environment.
  if (recorded.node !== current.node) return false;
  return true;
}

export function evaluate({ state, evidence, config, published }) {
  let evidenceStatus;
  const malformed = evidenceError(evidence);
  if (malformed) {
    evidenceStatus = "malformed";
  } else if (evidence.fingerprint !== state.fingerprint) {
    evidenceStatus = "stale";
  } else if (!componentsComplete(evidence.components)) {
    evidenceStatus = "stale";
  } else if (!toolchainMatch(evidence.toolchain, currentToolchain())) {
    evidenceStatus = "stale";
  } else {
    evidenceStatus = "verified";
  }

  let exit = EXIT.CLEAN;
  if (evidenceStatus !== "verified") exit |= EXIT.EVIDENCE_MISSING_STALE;
  if (state.dirty) exit |= EXIT.DIRTY_CANDIDATE;
  if (config.status !== "coherent") exit |= EXIT.CONFIG_INCOMPLETE;
  if (Object.values(published).some((field) => !field.verified)) exit |= EXIT.REMOTE_UNVERIFIED;
  return { evidenceStatus, exit };
}

export function printReport({ state, evidence, evidenceStatus, config, published, exit }) {
  const lines = [];
  lines.push("=== release:check (read-only) ===");
  lines.push(`candidate sha:    ${state.head}`);
  lines.push(`candidate branch: ${state.branch ?? "(detached)"}`);
  lines.push(
    `working tree:     ${state.dirty ? `DIRTY (${state.changedFiles} changed file${state.changedFiles === 1 ? "" : "s"})` : "clean"}`,
  );
  lines.push("");
  lines.push("--- verification evidence ---");
  if (evidenceStatus === "verified") {
    lines.push(`status: verified for this exact candidate (${evidence.timestamp})`);
    lines.push(
      `schema: ${evidence.schema} — toolchain node ${evidence.toolchain.node}${evidence.toolchain.pnpm ? `, ${evidence.toolchain.pnpm}` : ""}${evidence.toolchain.orval ? `, orval ${evidence.toolchain.orval}` : ""}`,
    );
    lines.push(`components: ${evidence.components.join(", ")}`);
  } else if (evidenceStatus === "malformed") {
    lines.push(`status: MALFORMED — evidence cannot be trusted (${evidenceError(evidence)})`);
    if (evidence) {
      lines.push(`evidence sha: ${evidence.sha ?? "<missing>"} (current: ${state.head})`);
      lines.push(`evidence recorded: ${evidence.timestamp ?? "<missing>"}`);
    }
  } else if (!evidence) {
    lines.push(`status: unverified — no ${EVIDENCE_FILE}`);
  } else {
    lines.push(`status: STALE — evidence belongs to a different working-tree state`);
    lines.push(`evidence sha: ${evidence.sha} (current: ${state.head})`);
    lines.push(`evidence recorded: ${evidence.timestamp}`);
    lines.push(
      `required: ${evidence.fingerprint === state.fingerprint ? "" : "matching content fingerprint, "}${COMPONENTS.length} component set, schema/toolchain match`,
    );
  }
  lines.push("");
  lines.push("--- required public config (names only) ---");
  for (const [name, present] of Object.entries(config.presence)) {
    lines.push(`${present ? "present" : "MISSING "} ${name}`);
  }
  lines.push(
    `Auth0 issuer consistency (${config.sides.api ? "api" : "missing-api"} vs ${config.sides.web ? `web (${config.webSource})` : "missing-web"}): ${
      config.coherence.issuer === null
        ? "not comparable"
        : config.coherence.issuer
          ? "consistent"
          : "INCONSISTENT"
    }`,
  );
  lines.push(
    `Auth0 audience consistency: ${
      config.coherence.audience === null
        ? "not comparable"
        : config.coherence.audience
          ? "consistent"
          : "INCONSISTENT"
    }`,
  );
  lines.push("(local values do not prove deployed parity; values never printed)");
  lines.push("");
  lines.push("--- published release fields ---");
  for (const [field, info] of Object.entries(published)) {
    lines.push(`${field.padEnd(9)} ${info.verified ? "verified " : "unverified"}  ${info.detail}`);
  }
  lines.push("");
  lines.push("--- remaining human steps (unless already verified above) ---");
  const steps = [];
  if (!published.push.verified)
    steps.push("push the candidate and note the SHA/GitHub Actions workflow URL");
  if (!published.ci.verified)
    steps.push("confirm GitHub Actions workflow for the pushed SHA is green and record evidence");
  if (!published.merge.verified)
    steps.push("merge into main (GitHub pull request) and record the merge SHA");
  if (!published.deployed.verified)
    steps.push(
      "deploy through the selected provider and record the deployed revision from its dashboard",
    );
  if (!published.acceptance.verified)
    steps.push(
      "run authorized production acceptance checks (Auth0 live sign-in, payments sandbox)",
    );
  if (!published.rollback.verified)
    steps.push("write/confirm the documented rollback procedure (docs/release-rollback.md)");
  steps.forEach((step, i) => lines.push(`  ${i + 1}. ${step}`));
  lines.push("");
  lines.push("--- exit code ---");
  lines.push(
    `${exit} (bits: 1=evidence missing/stale/malformed, 2=dirty candidate, 4=config incomplete/incoherent, 8=remote/production unverified, 64=no candidate)`,
  );
  return `\n${lines.join("\n")}\n`;
}

export function main({ state } = {}) {
  let report;
  let exit;
  let evidenceStatus;
  try {
    const candidate = state ?? candidateState();
    const evidence = readEvidence();
    const config = collectConfig();
    const published = collectPublished({ state: candidate });
    const result = evaluate({ state: candidate, evidence, config, published });
    evidenceStatus = result.evidenceStatus;
    exit = result.exit;
    report = printReport({ state: candidate, evidence, evidenceStatus, config, published, exit });
  } catch (err) {
    report = `\n=== release:check (read-only) ===\ncannot determine candidate: ${err.message}\n(exit 64)\n`;
    exit = EXIT.NO_CANDIDATE;
  }
  process.stdout.write(report);
  return exit;
}

const launchedDirectly = process.argv[1]
  ? fileURLToPath(import.meta.url) === resolve(process.argv[1])
  : false;

if (launchedDirectly) {
  process.exitCode = main();
}
