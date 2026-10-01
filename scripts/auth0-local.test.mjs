import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { applyEnvValues, resolveAuth0Status, validateAuth0Config } from "./auth0-local.mjs";

const VALID = {
  domain: "my-tenant.us.auth0.com",
  clientId: "AbCdEfGhIjKlMnOpQrStUvWxYz012345",
  audience: "https://api.example.test",
};

describe("validateAuth0Config", () => {
  test("accepts public tenant values", () => {
    assert.deepEqual(validateAuth0Config(VALID), []);
  });
  test("rejects the example placeholder, URLs and malformed client ids", () => {
    assert.match(
      validateAuth0Config({ ...VALID, domain: "YOUR-DEV-TENANT.us.auth0.com" }).join(),
      /placeholder/,
    );
    assert.match(
      validateAuth0Config({ ...VALID, domain: "https://x.auth0.com/" }).join(),
      /bare host/,
    );
    assert.match(
      validateAuth0Config({ ...VALID, clientId: "has spaces in it!" }).join(),
      /client id/,
    );
    assert.equal(validateAuth0Config({}).length, 3);
  });
});

describe("applyEnvValues", () => {
  test("replaces set and commented-out keys in place and appends missing ones", () => {
    const text = [
      "VITE_AUTH0_DOMAIN=YOUR-DEV-TENANT.us.auth0.com",
      "# VITE_AUTH0_CLIENT_ID is optional here",
      "# VITE_AUTH0_CLIENT_ID=",
      "AI_PROVIDER=disabled",
      "",
    ].join("\n");
    const out = applyEnvValues(text, {
      VITE_AUTH0_DOMAIN: "a.auth0.com",
      VITE_AUTH0_CLIENT_ID: "abc",
      AUTH0_DOMAIN: "a.auth0.com",
    });
    assert.equal(
      out,
      [
        "VITE_AUTH0_DOMAIN=a.auth0.com",
        "# VITE_AUTH0_CLIENT_ID is optional here",
        "VITE_AUTH0_CLIENT_ID=abc",
        "AI_PROVIDER=disabled",
        "AUTH0_DOMAIN=a.auth0.com",
        "",
      ].join("\n"),
    );
  });
});

describe("resolveAuth0Status", () => {
  const envDev = {
    VITE_AUTH0_DOMAIN: VALID.domain,
    VITE_AUTH0_AUDIENCE: VALID.audience,
    AUTH0_DOMAIN: VALID.domain,
    AUTH0_AUDIENCE: VALID.audience,
  };
  test("the example defaults are not configured", () => {
    const status = resolveAuth0Status({
      envDev: {
        ...envDev,
        VITE_AUTH0_DOMAIN: "YOUR-DEV-TENANT.us.auth0.com",
        VITE_AUTH0_CLIENT_ID: "",
      },
    });
    assert.equal(status.configured, false);
  });
  test("falls back to the package .env.local client id when .env.dev leaves it blank", () => {
    const status = resolveAuth0Status({
      envDev: { ...envDev, VITE_AUTH0_CLIENT_ID: " " },
      envLocal: { VITE_AUTH0_CLIENT_ID: VALID.clientId },
    });
    assert.equal(status.configured, true);
    assert.equal(status.clientId, VALID.clientId);
  });
  test("flags a frontend/API tenant mismatch", () => {
    const status = resolveAuth0Status({
      envDev: { ...envDev, VITE_AUTH0_CLIENT_ID: VALID.clientId, AUTH0_DOMAIN: "other.auth0.com" },
    });
    assert.equal(status.configured, false);
    assert.match(status.problems.join(), /AUTH0_DOMAIN/);
  });
});
