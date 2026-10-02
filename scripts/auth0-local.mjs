// `pnpm auth0:local` — configure Auth0 sign-in for the local workspace.
//
// Writes the three public Auth0 values (tenant domain, SPA client id, API
// audience) into the git-ignored `.env.dev` for both the frontend (VITE_*) and
// the API guard (AUTH0_*), after validating them and confirming the tenant's
// OIDC discovery document. `--check` only reports whether sign-in is
// configured. Only public identifiers are handled; never pass a client secret.
//
//   pnpm auth0:local                          # prompts for missing values
//   pnpm auth0:local --domain <tenant-host> --client-id <id> --audience <api-id>
//   pnpm auth0:local --check                  # exit 1 when not configured

import fs from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { parseEnvFile } from "./dev-supervisor-config.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const ENV_DEV = path.join(ROOT, ".env.dev");
const ENV_DEV_EXAMPLE = path.join(ROOT, ".env.dev.example");
const ENV_LOCAL = path.join(ROOT, "artifacts", "kindred-coach", ".env.local");
const PLACEHOLDER = /YOUR-DEV-TENANT/i;

export function validateAuth0Config({ domain, clientId, audience }) {
  const errors = [];
  if (!domain) errors.push("domain is required");
  else if (PLACEHOLDER.test(domain)) errors.push("domain is still the YOUR-DEV-TENANT placeholder");
  else if (!/^(?=.{4,253}$)([a-z0-9-]+\.)+[a-z]{2,}$/i.test(domain))
    errors.push(
      "domain must be a bare host name such as my-tenant.us.auth0.com (no https://, no path)",
    );
  if (!clientId) errors.push("client id is required");
  else if (!/^[A-Za-z0-9]{16,64}$/.test(clientId))
    errors.push("client id must be the public Application client id (16-64 letters/digits)");
  if (!audience) errors.push("audience is required");
  else if (/\s/.test(audience)) errors.push("audience must not contain whitespace");
  return errors;
}

// Set KEY=value for each entry: replaces an existing (or commented-out) `KEY=`
// line in place, otherwise appends it.
export function applyEnvValues(text, values) {
  const lines = text.split("\n");
  for (const [key, value] of Object.entries(values)) {
    const pattern = new RegExp(`^\\s*#?\\s*(?:export\\s+)?${key}=`);
    const index = lines.findIndex((line) => pattern.test(line));
    if (index >= 0) lines[index] = `${key}=${value}`;
    else {
      if (lines.at(-1) === "") lines.pop();
      lines.push(`${key}=${value}`, "");
    }
  }
  return lines.join("\n");
}

function nonBlank(env) {
  return Object.fromEntries(
    Object.entries(env).filter(([, value]) => typeof value === "string" && value.trim() !== ""),
  );
}

// Effective sign-in configuration as `pnpm dev` resolves it: shell over
// `.env.dev`, and the package `.env.local` as the frontend fallback.
export function resolveAuth0Status({ processEnv = {}, envDev = {}, envLocal = {} }) {
  const launcher = { ...nonBlank(envDev), ...nonBlank(processEnv) };
  const frontend = { ...nonBlank(envLocal), ...launcher };
  const config = {
    domain: frontend.VITE_AUTH0_DOMAIN,
    clientId: frontend.VITE_AUTH0_CLIENT_ID,
    audience: frontend.VITE_AUTH0_AUDIENCE,
  };
  const problems = validateAuth0Config(config);
  if (launcher.AUTH0_DOMAIN !== config.domain)
    problems.push("AUTH0_DOMAIN (API) must equal VITE_AUTH0_DOMAIN (frontend)");
  if (launcher.AUTH0_AUDIENCE !== config.audience)
    problems.push("AUTH0_AUDIENCE (API) must equal VITE_AUTH0_AUDIENCE (frontend)");
  return { configured: problems.length === 0, problems, ...config };
}

export function readAuth0Status(processEnv = process.env) {
  const read = (file) => (fs.existsSync(file) ? parseEnvFile(fs.readFileSync(file, "utf8")) : {});
  return resolveAuth0Status({ processEnv, envDev: read(ENV_DEV), envLocal: read(ENV_LOCAL) });
}

async function checkDiscovery(domain) {
  const url = `https://${domain}/.well-known/openid-configuration`;
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok)
    throw new Error(`${url} answered HTTP ${response.status}; is the domain right?`);
  const { issuer } = await response.json();
  if (issuer !== `https://${domain}/`)
    throw new Error(
      `tenant issuer is ${issuer}; use that host as the domain so API token validation matches`,
    );
}

function parseArgs(argv) {
  const args = { check: false, offline: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--check") args.check = true;
    else if (arg === "--offline") args.offline = true;
    else if (["--domain", "--client-id", "--audience"].includes(arg)) {
      const key = { "--domain": "domain", "--client-id": "clientId", "--audience": "audience" }[
        arg
      ];
      args[key] = argv[++i]?.trim();
    } else throw new Error(`unknown argument ${arg}`);
  }
  return args;
}

async function main() {
  const log = (message) => console.log(`[auth0:local] ${message}`);
  const args = parseArgs(process.argv.slice(2));

  if (args.check) {
    const status = readAuth0Status();
    if (status.configured)
      log(`sign-in configured: ${status.domain} (audience ${status.audience})`);
    else log(`sign-in NOT configured: ${status.problems.join("; ")}`);
    process.exit(status.configured ? 0 : 1);
  }

  if (!fs.existsSync(ENV_DEV)) {
    fs.copyFileSync(ENV_DEV_EXAMPLE, ENV_DEV);
    log("created .env.dev from .env.dev.example");
  }
  const envDevText = fs.readFileSync(ENV_DEV, "utf8");
  const current = resolveAuth0Status({ envDev: parseEnvFile(envDevText) });
  const values = {
    domain: args.domain ?? (PLACEHOLDER.test(current.domain ?? "") ? undefined : current.domain),
    clientId: args.clientId ?? current.clientId,
    audience: args.audience ?? current.audience,
  };

  const missing = Object.keys(values).filter((key) => !values[key]);
  if (missing.length > 0 && process.stdin.isTTY) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const labels = {
      domain: "Auth0 tenant domain (e.g. my-tenant.us.auth0.com)",
      clientId: "Local SPA Application client id (public)",
      audience: "API audience (identifier)",
    };
    for (const key of missing) values[key] = (await rl.question(`${labels[key]}: `)).trim();
    rl.close();
  }

  const errors = validateAuth0Config(values);
  if (errors.length > 0) {
    console.error(`[auth0:local] FAILED: ${errors.join("; ")}`);
    console.error(
      "[auth0:local] usage: pnpm auth0:local --domain <host> --client-id <id> --audience <api-id>",
    );
    process.exit(1);
  }

  if (args.offline) log("skipping tenant discovery check (--offline)");
  else {
    try {
      await checkDiscovery(values.domain);
      log(`tenant ${values.domain} answered OIDC discovery`);
    } catch (error) {
      console.error(`[auth0:local] FAILED: ${error.message}`);
      process.exit(1);
    }
  }

  fs.writeFileSync(
    ENV_DEV,
    applyEnvValues(envDevText, {
      VITE_AUTH0_DOMAIN: values.domain,
      VITE_AUTH0_CLIENT_ID: values.clientId,
      VITE_AUTH0_AUDIENCE: values.audience,
      AUTH0_DOMAIN: values.domain,
      AUTH0_AUDIENCE: values.audience,
    }),
  );
  const port = parseEnvFile(fs.readFileSync(ENV_DEV, "utf8")).KINDRED_WEB_PORT || "8080";
  log("wrote VITE_AUTH0_* and AUTH0_* to .env.dev");
  log(
    `in the Auth0 Application settings, allow callback + logout http://localhost:${port}/ and web origin http://localhost:${port}`,
  );
  log("restart pnpm dev to pick up the change");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
