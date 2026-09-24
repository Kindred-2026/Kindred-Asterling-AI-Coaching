import {
  vi,
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { eq } from "@workspace/db";
import { db, usersTable } from "@workspace/db";

import app from "../app";
import {
  registerTestClerkIdentity,
  revokeTestClerkIdentity,
} from "../middlewares/testClerkIdentityAdapter";

vi.mock("./helcimClient", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./helcimClient")>();
  return {
    ...actual,
    createHelcimCustomer: vi.fn(async () => 9999),
  };
});

const suffix = Math.random().toString(36).slice(2, 10);
const userId = `test-checkout-${suffix}`;
const email = `${userId}@example.test`;

let server: Server;
let baseUrl: string;
let token: string;
const tokens: string[] = [];

async function makeSession(uid: string): Promise<string> {
  const token = registerTestClerkIdentity({ id: uid, email });
  tokens.push(token);
  return token;
}

interface ApiResult {
  status: number;
  body: unknown;
}

async function api(
  method: string,
  path: string,
  opts: { token?: string; body?: unknown } = {},
): Promise<ApiResult> {
  const headers: Record<string, string> = {};
  if (opts.token) headers["authorization"] = `Bearer ${opts.token}`;
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  return { status: res.status, body };
}

beforeAll(async () => {
  await db
    .insert(usersTable)
    .values({ id: userId })
    .onConflictDoNothing({ target: usersTable.id });
  token = await makeSession(userId);
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      resolve();
    });
  });
});

afterAll(async () => {
  tokens.forEach(revokeTestClerkIdentity);
  await db.delete(usersTable).where(eq(usersTable.id, userId));
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("POST /api/subscription/checkout", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects anonymous callers with 401", async () => {
    const res = await api("POST", "/api/subscription/checkout", {
      body: { planType: "yearly" },
    });
    expect(res.status).toBe(401);
  });

  it("rejects an invalid planType with 400", async () => {
    const res = await api("POST", "/api/subscription/checkout", {
      token,
      body: { planType: "monthly" },
    });
    expect(res.status).toBe(400);
  });

  it("returns 503 when checkout env vars are not set", async () => {
    const yearlyUrl = process.env.HELCIM_YEARLY_CHECKOUT_URL;
    delete process.env.HELCIM_YEARLY_CHECKOUT_URL;
    const res = await api("POST", "/api/subscription/checkout", {
      token,
      body: { planType: "yearly" },
    });
    expect(res.status).toBe(503);
    if (yearlyUrl) process.env.HELCIM_YEARLY_CHECKOUT_URL = yearlyUrl;
  });

  it("returns the Helcim checkout URL for an authenticated buyer", async () => {
    process.env.HELCIM_YEARLY_CHECKOUT_URL =
      "https://subscriptions.helcim.com/subscribe/test123";
    process.env.HELCIM_LIFETIME_CHECKOUT_URL =
      "https://subscriptions.helcim.com/subscribe/test456";
    process.env.HELCIM_API_KEY = "test-key";
    process.env.HELCIM_WEBHOOK_SECRET = Buffer.from(
      "synthetic-fixture-only",
    ).toString("base64");
    process.env.HELCIM_CUSTOMER_REFERENCE_SECRET = "test-reference-secret";

    const res = await api("POST", "/api/subscription/checkout", {
      token,
      body: { planType: "yearly" },
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      checkoutUrl:
        "https://subscriptions.helcim.com/subscribe/test123?customerCode=9999",
    });
  });

  it("returns the lifetime Helcim checkout URL", async () => {
    process.env.HELCIM_YEARLY_CHECKOUT_URL =
      "https://subscriptions.helcim.com/subscribe/test123";
    process.env.HELCIM_LIFETIME_CHECKOUT_URL =
      "https://subscriptions.helcim.com/subscribe/test456";
    process.env.HELCIM_API_KEY = "test-key";
    process.env.HELCIM_WEBHOOK_SECRET = Buffer.from(
      "synthetic-fixture-only",
    ).toString("base64");
    process.env.HELCIM_CUSTOMER_REFERENCE_SECRET = "test-reference-secret";

    const res = await api("POST", "/api/subscription/checkout", {
      token,
      body: { planType: "lifetime" },
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      checkoutUrl:
        "https://subscriptions.helcim.com/subscribe/test456?customerCode=9999",
    });
  });
});
