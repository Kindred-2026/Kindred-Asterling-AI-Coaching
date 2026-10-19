import crypto from "node:crypto";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db, eq, subscriptionsTable, usersTable } from "@workspace/db";
import app from "../app";
import {
  registerTestClerkIdentity,
  revokeTestClerkIdentity,
} from "../middlewares/testClerkIdentityAdapter";
import { mockExternalProviders, setProviderEnv, status } from "./__fixtures__/externalProviders";
import { resetAuth0ManagementToken } from "./auth0Management";
import { signedCustomerReference } from "./helcimClient";
import { retryPolicy } from "./retry";

let server: Server;
let baseUrl: string;
let restoreEnv: () => void;
let providers: ReturnType<typeof mockExternalProviders> | undefined;
const tokens: string[] = [];
const originalDelay = retryPolicy.baseDelayMs;

beforeAll(async () => {
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      resolve();
    });
  });
});

afterAll(async () => {
  tokens.forEach(revokeTestClerkIdentity);
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  restoreEnv = setProviderEnv();
  retryPolicy.baseDelayMs = 0;
  resetAuth0ManagementToken();
});

afterEach(() => {
  providers?.restore();
  providers = undefined;
  restoreEnv();
  retryPolicy.baseDelayMs = originalDelay;
});

const newUserId = () => `http-delete-${Math.random().toString(36).slice(2, 10)}`;

describe("DELETE /api/account", () => {
  async function seedSubscriber() {
    const id = newUserId();
    const token = registerTestClerkIdentity({ id });
    tokens.push(token);
    await db.insert(usersTable).values({ id, auth0UserId: `auth0|${id}` });
    await db.insert(subscriptionsTable).values({
      userId: id,
      status: "active",
      paymentCustomerId: signedCustomerReference(id),
      paymentSubscriptionId: "8001",
    });
    return { id, token };
  }

  const remove = (token: string) =>
    fetch(`${baseUrl}/api/account`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${token}` },
    });

  it("answers 502 and keeps the account when renewal cannot be cancelled", async () => {
    const { id, token } = await seedSubscriber();
    providers = mockExternalProviders({ helcimDelete: status(500) });

    const response = await remove(token);
    expect(response.status).toBe(502);
    expect(((await response.json()) as { error: string }).error).toMatch(/nothing was deleted/);
    expect(await db.count(usersTable, eq(usersTable.id, id))).toBe(1);
    await db.delete(usersTable).where(eq(usersTable.id, id));
  });

  it("answers 204 after cancelling renewal and removing the account everywhere", async () => {
    const { id, token } = await seedSubscriber();
    providers = mockExternalProviders();

    const response = await remove(token);
    expect(response.status).toBe(204);
    expect(await db.count(usersTable, eq(usersTable.id, id))).toBe(0);
    expect(
      providers.calls
        .filter((call) => call.method === "DELETE")
        .map((call) => call.provider)
        .sort(),
    ).toEqual(["auth0", "helcim"]);
    expect(providers.of("amplitude")).toHaveLength(2);
  });
});

describe("Helcim webhook for a deleted account", () => {
  function signedDelivery(body: Record<string, unknown>) {
    const raw = JSON.stringify(body);
    const id = `msg_${crypto.randomUUID()}`;
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = crypto
      .createHmac("sha256", Buffer.from(process.env.HELCIM_WEBHOOK_SECRET!, "base64"))
      .update(`${id}.${timestamp}.${raw}`)
      .digest("base64");
    return fetch(`${baseUrl}/api/payment/webhook`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "webhook-id": id,
        "webhook-timestamp": timestamp,
        "webhook-signature": `v1,${signature}`,
      },
      body: raw,
    });
  }

  it("cancels a subscription that renews after its account was deleted", async () => {
    const customerCode = signedCustomerReference(newUserId());
    providers = mockExternalProviders({ helcimCustomerCode: customerCode });

    const response = await signedDelivery({
      type: "subscription.renewed",
      timestamp: new Date().toISOString(),
      data: { id: "9001", customerCode },
    });

    expect(response.status).toBe(200);
    expect(providers.of("helcim").map((call) => `${call.method} ${call.url}`)).toEqual([
      "GET https://api.helcim.com/v2/subscriptions/9001",
      "DELETE https://api.helcim.com/v2/subscriptions/9001",
    ]);
  });

  it("asks Helcim to redeliver while the cancellation keeps failing", async () => {
    const customerCode = signedCustomerReference(newUserId());
    providers = mockExternalProviders({
      helcimCustomerCode: customerCode,
      helcimDelete: status(503),
    });

    const response = await signedDelivery({
      type: "invoice.paid",
      timestamp: new Date().toISOString(),
      data: { subscriptionId: "9002", customerCode },
    });
    expect(response.status).toBe(500);
  });

  it("leaves an already-ended subscription alone", async () => {
    const customerCode = signedCustomerReference(newUserId());
    providers = mockExternalProviders({ helcimCustomerCode: customerCode });

    const response = await signedDelivery({
      type: "subscription.cancelled",
      timestamp: new Date().toISOString(),
      data: { id: "9003", customerCode },
    });
    expect(response.status).toBe(200);
    expect(providers.of("helcim")).toHaveLength(0);
  });
});
