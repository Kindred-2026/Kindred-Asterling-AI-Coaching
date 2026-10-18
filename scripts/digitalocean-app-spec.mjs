// `node scripts/digitalocean-app-spec.mjs <.do/app.yaml> <output.json>`
//
// Builds the App Platform spec that the "Deploy to DigitalOcean" workflow
// applies. A deploy replaces the app's whole spec, so this merges in what
// lives only in App Platform: an env with `type: SECRET` and no value takes
// the encrypted value stored in the live app, secrets added only in the
// dashboard are kept, and the live custom domains are kept while the repo
// spec has no `domains:` list. Everything else comes from the repo spec.
//
// Reads DIGITALOCEAN_ACCESS_TOKEN. Prints key names only, never values.

import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { parse } from "yaml";

const COMPONENT_KINDS = ["services", "workers", "jobs", "static_sites", "functions"];

function mergeEnvs(scope, repoEnvs, liveEnvs, report) {
  const live = liveEnvs ?? [];
  const merged = (repoEnvs ?? []).map((env) => {
    if (env.type !== "SECRET" || (env.value ?? "") !== "") return env;
    const stored = live.find(
      (candidate) => candidate.key === env.key && (candidate.value ?? "") !== "",
    );
    if (stored) {
      report.kept.push(`${scope}:${env.key}`);
      return { ...env, value: stored.value };
    }
    report.missing.push(`${scope}:${env.key}`);
    return env;
  });
  const keys = new Set(merged.map((env) => env.key));
  for (const env of live) {
    if (keys.has(env.key)) continue;
    if (env.type === "SECRET") {
      merged.push(env);
      report.preserved.push(`${scope}:${env.key}`);
    } else {
      report.dropped.push(`${scope}:${env.key}`);
    }
  }
  return merged.length ? merged : undefined;
}

export function mergeAppSpec(repoSpec, liveSpec) {
  const spec = structuredClone(repoSpec);
  const report = { kept: [], missing: [], preserved: [], dropped: [], keptDomains: false };
  const live = liveSpec ?? {};
  const appEnvs = mergeEnvs("app", spec.envs, live.envs, report);
  if (appEnvs) spec.envs = appEnvs;
  for (const kind of COMPONENT_KINDS) {
    for (const component of spec[kind] ?? []) {
      const liveComponent = (live[kind] ?? []).find(
        (candidate) => candidate.name === component.name,
      );
      const envs = mergeEnvs(component.name, component.envs, liveComponent?.envs, report);
      if (envs) component.envs = envs;
    }
  }
  if (spec.domains === undefined && live.domains?.length) {
    spec.domains = live.domains;
    report.keptDomains = true;
  }
  return { spec, report };
}

async function findLiveApp(name, token) {
  let url = "https://api.digitalocean.com/v2/apps?per_page=100";
  while (url) {
    const response = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error(`DigitalOcean API returned ${response.status} listing apps`);
    const body = await response.json();
    const app = (body.apps ?? []).find((candidate) => candidate.spec?.name === name);
    if (app) return app;
    url = body.links?.pages?.next ?? null;
  }
  return null;
}

async function main([input, output]) {
  if (!input || !output)
    throw new Error("usage: digitalocean-app-spec.mjs <app.yaml> <output.json>");
  const token = process.env.DIGITALOCEAN_ACCESS_TOKEN?.trim();
  if (!token) throw new Error("DIGITALOCEAN_ACCESS_TOKEN is not set");
  const repoSpec = parse(readFileSync(input, "utf8"));
  if (!repoSpec?.name) throw new Error(`${input} has no app name`);

  const app = await findLiveApp(repoSpec.name, token);
  if (!app) console.log(`App "${repoSpec.name}" does not exist yet; this deploy creates it.`);
  const { spec, report } = mergeAppSpec(repoSpec, app?.spec);
  writeFileSync(output, `${JSON.stringify(spec, null, 2)}\n`, { mode: 0o600 });

  if (report.kept.length) console.log(`Secrets kept from App Platform: ${report.kept.join(", ")}`);
  if (report.preserved.length)
    console.log(`Dashboard-only secrets kept: ${report.preserved.join(", ")}`);
  if (report.keptDomains)
    console.log(`Custom domains kept: ${spec.domains.map((d) => d.domain).join(", ")}`);
  if (report.missing.length) {
    console.log(
      `::warning::Secrets with no value in App Platform yet: ${report.missing.join(", ")}`,
    );
  }
  if (report.dropped.length) {
    console.log(
      `::warning::Dashboard-only plain settings removed (add them to .do/app.yaml to keep them): ${report.dropped.join(", ")}`,
    );
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(`::error::${error.message}`);
    process.exit(1);
  });
}
