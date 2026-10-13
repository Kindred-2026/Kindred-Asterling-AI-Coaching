import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { parse } from "yaml";
import { diagnose, headerPartitionKey, partitionKey } from "./check-client-ip.mjs";
import { mergeAppSpec } from "./digitalocean-app-spec.mjs";

const repoSpec = () => ({
  name: "kindred",
  envs: [{ key: "APP_WIDE", value: "1" }],
  services: [
    {
      name: "web",
      envs: [
        { key: "NODE_ENV", scope: "RUN_TIME", value: "production" },
        { key: "POSTGRES_URL", scope: "RUN_TIME", value: "${kindred-db.DATABASE_URL}" },
        { key: "VITE_AUTH0_DOMAIN", scope: "BUILD_TIME", value: "${VITE_AUTH0_DOMAIN}" },
        { key: "ANTHROPIC_API_KEY", scope: "RUN_TIME", type: "SECRET" },
        { key: "RESEND_API_KEY", scope: "RUN_TIME", type: "SECRET" },
      ],
    },
  ],
});

test("fills secrets from the live app and keeps dashboard-only secrets and domains", () => {
  const live = {
    name: "kindred",
    domains: [{ domain: "kindred.example.test", type: "PRIMARY" }],
    services: [
      {
        name: "web",
        envs: [
          { key: "NODE_ENV", value: "development" },
          { key: "ANTHROPIC_API_KEY", type: "SECRET", value: "EV[1:anthropic]" },
          { key: "AMPLITUDE_API_KEY", type: "SECRET", value: "EV[1:amplitude]" },
          { key: "LOG_LEVEL", value: "debug" },
        ],
      },
    ],
  };
  const { spec, report } = mergeAppSpec(repoSpec(), live);
  const envs = Object.fromEntries(spec.services[0].envs.map((env) => [env.key, env]));
  assert.equal(envs.NODE_ENV.value, "production");
  assert.equal(envs.POSTGRES_URL.value, "${kindred-db.DATABASE_URL}");
  assert.equal(envs.VITE_AUTH0_DOMAIN.value, "${VITE_AUTH0_DOMAIN}");
  assert.deepEqual(envs.ANTHROPIC_API_KEY, {
    key: "ANTHROPIC_API_KEY",
    scope: "RUN_TIME",
    type: "SECRET",
    value: "EV[1:anthropic]",
  });
  assert.equal(envs.RESEND_API_KEY.value, undefined);
  assert.equal(envs.AMPLITUDE_API_KEY.value, "EV[1:amplitude]");
  assert.equal(envs.LOG_LEVEL, undefined);
  assert.deepEqual(spec.domains, live.domains);
  assert.deepEqual(report, {
    kept: ["web:ANTHROPIC_API_KEY"],
    missing: ["web:RESEND_API_KEY"],
    preserved: ["web:AMPLITUDE_API_KEY"],
    dropped: ["web:LOG_LEVEL"],
    keptDomains: true,
  });
});

test("repo domains win, and a first deploy passes the repo spec through", () => {
  const withDomains = { ...repoSpec(), domains: [{ domain: "new.example.test" }] };
  const live = { domains: [{ domain: "old.example.test" }], services: [] };
  assert.deepEqual(mergeAppSpec(withDomains, live).spec.domains, [{ domain: "new.example.test" }]);

  const original = repoSpec();
  const { spec, report } = mergeAppSpec(original, null);
  assert.deepEqual(spec, repoSpec());
  assert.notEqual(spec, original);
  assert.deepEqual(report.missing, ["web:ANTHROPIC_API_KEY", "web:RESEND_API_KEY"]);
});

test("the checked-in app spec keeps secret values out of the repository", () => {
  const spec = parse(readFileSync(new URL("../.do/app.yaml", import.meta.url), "utf8"));
  const envs = spec.services.flatMap((service) => service.envs ?? []);
  for (const env of envs.filter((candidate) => candidate.type === "SECRET")) {
    assert.equal(env.value, undefined, `${env.key} must not have a value in .do/app.yaml`);
  }
  assert.equal(spec.services[0].instance_count, 1);
  assert.equal(spec.services[0].github.deploy_on_push, false);
});

test("client-IP check mirrors the rate limiter's partition key and diagnoses hop counts", () => {
  // express-rate-limit's key hash for ip:203.0.113.9, as served by the app.
  assert.equal(partitionKey("203.0.113.9"), "YzIyZGIwMjg0ZWIz");
  assert.equal(
    headerPartitionKey('"300-in-15min"; q=300; w=900; pk=:YzIyZGIwMjg0ZWIz:'),
    "YzIyZGIwMjg0ZWIz",
  );
  assert.equal(headerPartitionKey(undefined), null);

  const ownKey = partitionKey("203.0.113.9");
  assert.equal(diagnose({ ownKey, plainKey: ownKey, forgedKey: ownKey }), null);
  assert.match(
    diagnose({ ownKey, plainKey: partitionKey("10.0.0.5"), forgedKey: partitionKey("10.0.0.5") }),
    /Raise TRUST_PROXY_HOPS/,
  );
  assert.match(
    diagnose({ ownKey, plainKey: ownKey, forgedKey: partitionKey("192.0.2.1") }),
    /Lower TRUST_PROXY_HOPS/,
  );
  assert.match(diagnose({ ownKey, plainKey: null, forgedKey: null }), /could not run/);
});
