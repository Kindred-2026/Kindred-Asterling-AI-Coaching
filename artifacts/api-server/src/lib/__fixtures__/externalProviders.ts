import { randomBytes, randomUUID } from "node:crypto";
import { vi } from "vitest";

/** Test-only fakes for Helcim, the Auth0 Management API and Amplitude. */

const fake = (label: string) => `test-${label}-${randomUUID()}`;

/** Fake credentials, generated per run so no secret-like literal sits in source. */
export const fakeCredentials = {
  helcimApiKey: fake("helcim"),
  helcimReferenceSecret: fake("reference"),
  helcimWebhookSecret: randomBytes(32).toString("base64"),
  mgmtClientId: fake("mgmt-client"),
  mgmtClientSecret: fake("mgmt"),
  mgmtToken: fake("mgmt-token"),
  productKey: fake("product-key"),
  productSecret: fake("product"),
  idSalt: fake("salt"),
  agentKey: fake("agent-key"),
  agentSecret: fake("agent"),
};

export interface ProviderCall {
  provider: "helcim" | "auth0" | "amplitude";
  method: string;
  url: string;
  headers: Record<string, string>;
  body: unknown;
}

type Responder = (call: ProviderCall) => Response | Promise<Response>;

export interface ProviderOverrides {
  /** Owner Helcim reports for every subscription lookup. */
  helcimCustomerCode?: string;
  helcimLookup?: Responder;
  helcimDelete?: Responder;
  auth0Token?: Responder;
  auth0Delete?: Responder;
  amplitude?: Responder;
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const status =
  (code: number): Responder =>
  () =>
    new Response(null, { status: code });

/** Fails `failures` times with `code`, then defers to `then`. */
export function failThen(failures: number, code: number, then: Responder): Responder {
  let remaining = failures;
  return (call) => {
    if (remaining > 0) {
      remaining -= 1;
      return new Response(null, { status: code });
    }
    return then(call);
  };
}

function headersOf(init?: RequestInit): Record<string, string> {
  return Object.fromEntries(new Headers(init?.headers).entries());
}

/**
 * Routes provider URLs to fakes and records each call; any other URL (such
 * as a test's own request to the app) goes to the real fetch.
 */
export function mockExternalProviders(overrides: ProviderOverrides = {}) {
  const realFetch = globalThis.fetch;
  const calls: ProviderCall[] = [];
  const spy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    const host = new URL(url).host;
    const provider =
      host === "api.helcim.com"
        ? "helcim"
        : host === "amplitude.com"
          ? "amplitude"
          : host.endsWith(".auth0.com")
            ? "auth0"
            : null;
    if (!provider) return realFetch(input, init);
    const raw = init?.body;
    const call: ProviderCall = {
      provider,
      method: init?.method ?? "GET",
      url,
      headers: headersOf(init),
      body: typeof raw === "string" ? JSON.parse(raw) : null,
    };
    calls.push(call);
    if (provider === "helcim") {
      if (call.method === "DELETE") return (overrides.helcimDelete ?? status(200))(call);
      return (
        overrides.helcimLookup ??
        (() =>
          json({
            data: {
              id: Number(url.split("/").pop()) || 1,
              customerCode: overrides.helcimCustomerCode,
            },
          }))
      )(call);
    }
    if (provider === "auth0") {
      if (url.endsWith("/oauth/token"))
        return (
          overrides.auth0Token ??
          (() =>
            json({
              access_token: fakeCredentials.mgmtToken,
              token_type: "Bearer",
              expires_in: 86400,
            }))
        )(call);
      return (overrides.auth0Delete ?? status(204))(call);
    }
    return (overrides.amplitude ?? (() => json({ day: "2026-10-16" })))(call);
  });
  return {
    calls,
    of: (provider: ProviderCall["provider"]) => calls.filter((call) => call.provider === provider),
    restore: () => spy.mockRestore(),
  };
}

const PROVIDER_ENV = {
  HELCIM_API_KEY: fakeCredentials.helcimApiKey,
  HELCIM_CUSTOMER_REFERENCE_SECRET: fakeCredentials.helcimReferenceSecret,
  HELCIM_WEBHOOK_SECRET: fakeCredentials.helcimWebhookSecret,
  AUTH0_DOMAIN: "auth.kindred.example",
  AUTH0_MGMT_DOMAIN: "kindred-test.ca.auth0.com",
  AUTH0_MGMT_CLIENT_ID: fakeCredentials.mgmtClientId,
  AUTH0_MGMT_CLIENT_SECRET: fakeCredentials.mgmtClientSecret,
  AMPLITUDE_API_KEY: fakeCredentials.productKey,
  AMPLITUDE_SECRET_KEY: fakeCredentials.productSecret,
  AMPLITUDE_ID_SALT: fakeCredentials.idSalt,
  AMPLITUDE_AI_API_KEY: fakeCredentials.agentKey,
  AMPLITUDE_AI_SECRET_KEY: fakeCredentials.agentSecret,
};

/** Sets every provider credential; returns a function restoring the old env. */
export function setProviderEnv(
  overrides: Partial<Record<keyof typeof PROVIDER_ENV, string | undefined>> = {},
): () => void {
  const values = { ...PROVIDER_ENV, ...overrides };
  const previous = Object.fromEntries(Object.keys(values).map((name) => [name, process.env[name]]));
  for (const [name, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  return () => {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  };
}
