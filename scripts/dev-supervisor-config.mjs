// Development configuration for the dev supervisor: .env parsing, port
// validation, the merged launcher configuration, and the real product jobs.

import { existsSync, readFileSync } from "node:fs";

export const DEFAULT_WEB_PORT = 8080;
export const DEFAULT_API_PORT = 3000;
export const DEFAULT_DEV_DB_MODE = "disposable";
export const DEFAULT_DEV_DB_NAME = "kindred_dev";
export const DEV_ENV_FILE = ".env.dev";

// ---------------------------------------------------------------------------
// .env parsing (tiny, no dependency)
// ---------------------------------------------------------------------------

// Parse dotenv-style text: `KEY=VALUE` lines, `#` comments, optional
// `export ` prefix, optional single/double quotes around the value.
export function parseEnvFile(text) {
  const result = {};
  for (const rawLine of String(text).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const stripped = line.startsWith("export ")
      ? line.slice("export ".length).trimStart()
      : line;
    const eq = stripped.indexOf("=");
    if (eq <= 0) continue;
    const key = stripped.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let value = stripped.slice(eq + 1).trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

export function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return {};
  return parseEnvFile(readFileSync(filePath, "utf8"));
}

// ---------------------------------------------------------------------------
// Port validation
// ---------------------------------------------------------------------------

// Returns the numeric port or throws. Values are echoed in the error because
// ports are local, non-secret configuration and the message is actionable.
export function parsePort(value, name) {
  if (value === undefined || value === null || `${value}`.trim() === "") {
    throw new Error(`${name} must be an integer between 1 and 65535.`);
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error(
      `${name} must be an integer between 1 and 65535 (received "${value}").`,
    );
  }
  return parsed;
}

// ---------------------------------------------------------------------------
// Development configuration
// ---------------------------------------------------------------------------

// Merge order: fileEnv provides the isolated development configuration, while
// the inherited process environment deliberately overrides it.
export function mergeDevEnv({ processEnv, fileEnv }) {
  return { ...fileEnv, ...processEnv };
}

// A value is "blank" when it is empty or whitespace-only. Blank VITE_* values
// are intentionally treated as unset (see parseDevConfig).
function isBlank(value) {
  return typeof value !== "string" || value.trim() === "";
}

export function parseDevConfig({ processEnv, fileEnv }) {
  const env = mergeDevEnv({ processEnv, fileEnv });

  const webPort = parsePort(
    env.KINDRED_WEB_PORT ?? String(DEFAULT_WEB_PORT),
    "KINDRED_WEB_PORT",
  );
  const apiPort = parsePort(
    env.KINDRED_API_PORT ?? String(DEFAULT_API_PORT),
    "KINDRED_API_PORT",
  );
  if (webPort === apiPort) {
    throw new Error(
      "KINDRED_WEB_PORT and KINDRED_API_PORT must use different ports.",
    );
  }

  let basePath = (env.BASE_PATH ?? "").trim();
  if (!basePath) basePath = "/";
  if (!basePath.startsWith("/")) {
    throw new Error('BASE_PATH must start with "/".');
  }

  const dbMode = (env.KINDRED_DEV_DB ?? "").trim().toLowerCase() || DEFAULT_DEV_DB_MODE;
  if (dbMode !== "disposable" && dbMode !== "external") {
    throw new Error(
      'KINDRED_DEV_DB must be "disposable" or "external" (received a different value).',
    );
  }
  if (dbMode === "external") {
    const missing = [];
    if (!env.MONGODB_URI?.trim()) missing.push("MONGODB_URI");
    if (!env.MONGODB_DATABASE?.trim()) missing.push("MONGODB_DATABASE");
    if (missing.length > 0) {
      throw new Error(
        `External development database requires MONGODB_URI and MONGODB_DATABASE in ${DEV_ENV_FILE} (missing: ${missing.join(", ")}).`,
      );
    }
    if (!/^mongodb(?:\+srv)?:\/\//i.test(env.MONGODB_URI.trim())) {
      throw new Error("MONGODB_URI must use mongodb:// or mongodb+srv://.");
    }
    if (!/^[A-Za-z0-9_-]{1,63}$/.test(env.MONGODB_DATABASE.trim())) {
      throw new Error(
        "MONGODB_DATABASE may only contain letters, numbers, underscores or hyphens.",
      );
    }
  }

  let apiOrigin = (env.KINDRED_API_ORIGIN ?? "").trim();
  if (!apiOrigin) apiOrigin = `http://127.0.0.1:${apiPort}`;
  try {
    // eslint-disable-next-line no-new
    new URL(apiOrigin);
  } catch {
    throw new Error("KINDRED_API_ORIGIN must be a valid absolute URL.");
  }

  // The browser child only ever receives public VITE_* values plus the
  // launcher-provided launch keys; server secrets never cross into Vite.
  // Blank VITE_* values are deliberate "not set" values: they are not forwarded
  // as empty strings. That way Vite (whose process environment wins over its
  // package `.env.local`) falls back to the package-level Auth0 onboarding file
  // instead of seeing an empty string, and the shell can still override a file
  // value with an explicit nonblank assignment.
  const webEnv = {};
  for (const key of Object.keys(env)) {
    if (key.startsWith("VITE_") && !isBlank(env[key])) webEnv[key] = env[key];
  }

  // The API child inherits the whole development configuration so the API can
  // reach its database, Auth0 resource guard and any documented integrations.
  const apiEnv = { ...env };

  return {
    webPort,
    apiPort,
    dbMode,
    basePath,
    apiOrigin,
    webEnv,
    apiEnv,
  };
}

// ---------------------------------------------------------------------------
// Job wiring (real product commands)
// ---------------------------------------------------------------------------

// Minimal, non-secret OS environment needed to exec the workspace commands
// (pnpm resolves via PATH). We intentionally do NOT spread the launcher's full
// environment into the browser child: its env is filtered to public VITE_*
// values below, so secrets present in the launcher's environment never reach
// the Vite process that feeds the browser bundle.
const OS_ENV_KEYS = [
  "PATH",
  "HOME",
  "SHELL",
  "TERM",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "TMPDIR",
  "XDG_CONFIG_HOME",
];
export function minimalProcessEnv() {
  return Object.fromEntries(
    OS_ENV_KEYS.filter((key) => process.env[key] !== undefined).map((key) => [
      key,
      process.env[key],
    ]),
  );
}

export function createJobs(config, { cwd }) {
  const web = {
    name: "web",
    command: "pnpm",
    args: ["--filter", "@workspace/kindred-coach", "run", "dev"],
    cwd,
    env: {
      ...minimalProcessEnv(),
      ...config.webEnv,
      PORT: String(config.webPort),
      BASE_PATH: config.basePath,
      KINDRED_API_ORIGIN: config.apiOrigin,
    },
    stdio: "inherit",
    detached: true,
    readiness: {
      type: "port",
      port: config.webPort,
      host: "127.0.0.1",
      timeoutMs: 60_000,
    },
  };

  const api = {
    name: "api",
    command: "pnpm",
    args: ["--filter", "@workspace/api-server", "run", "start"],
    cwd,
    env: {
      ...config.apiEnv,
      PORT: String(config.apiPort),
      NODE_ENV: "development",
      // The launcher suppresses background reminder scheduling for normal
      // local development; production scheduling is unchanged (no such
      // override is set there).
      REMINDER_SCHEDULER_DISABLED: "true",
    },
    stdio: "inherit",
    detached: true,
    readiness: {
      type: "http",
      url: `${config.apiOrigin.replace(/\/$/, "")}/api/healthz/db`,
      timeoutMs: 60_000,
    },
  };

  const build = {
    name: "api-build",
    command: "pnpm",
    args: ["--filter", "@workspace/api-server", "run", "build"],
    cwd,
    env: config.apiEnv,
    stdio: "inherit",
    // Builds are owned process groups too: interrupting them mid-build must
    // stop the whole build tree without touching anything else.
    detached: true,
    build: true,
  };

  return { build, web, api };
}
