import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import crypto from "node:crypto";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { eq } from "@workspace/db";
import {
  db,
  usersTable,
  subscriptionsTable,
  processedWebhooksTable,
  entitlementAuditTable,
} from "@workspace/db";

import app from "../app";
import { signedCustomerReference } from "../lib/helcimClient";

const suffix = Math.random().toString(36).slice(2, 10);
const userId = `test-webhook-${suffix}`;
const email = `${userId}@example.test`;
// Generated per run so no secret-like literal sits in source.
const webhookSecret = crypto.randomBytes(32).toString("base64");
const referenceSecret = `test-reference-${crypto.randomUUID()}`;

let server: Server;
let baseUrl: string;
let customerCode: string;

function signedHeaders(
  body: string,
  webhookId: string,
  timestamp = Math.floor(Date.now() / 1000).toString(),
): Record<string, string> {
  const signature = crypto
    .createHmac("sha256", Buffer.from(webhookSecret, "base64"))
    .update(`${webhookId}.${timestamp}.${body}`)
    .digest("base64");
  return {
    "content-type": "application/json",
    "webhook-id": webhookId,
    "webhook-timestamp": timestamp,
    "webhook-signature": `v1,${signature}`,
  };
}

function eventBody(
  eventType: string,
  overrides: Record<string, unknown> = {},
): string {
  return JSON.stringify({
    eventType,
    createdAt: new Date().toISOString(),
    data: { customer: { customerCode }, ...overrides },
  });
}

async function post(
  path: string,
  body: string,
  headers: Record<string, string>,
): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers,
    body,
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

beforeAll(async () => {
  process.env.HELCIM_API_KEY = "test-key";
  process.env.HELCIM_WEBHOOK_SECRET = webhookSecret;
  process.env.HELCIM_CUSTOMER_REFERENCE_SECRET = referenceSecret;
  customerCode = signedCustomerReference(userId);
  await db
    .insert(usersTable)
    .values({ id: userId, email })
    .onConflictDoNothing({ target: usersTable.id });
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      resolve();
    });
  });
});

afterAll(async () => {
  await db
    .delete(entitlementAuditTable)
    .where(eq(entitlementAuditTable.userId, userId));
  await db
    .delete(subscriptionsTable)
    .where(eq(subscriptionsTable.userId, userId));
  await db.delete(usersTable).where(eq(usersTable.id, userId));
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("POST /api/payment/webhook", () => {
  beforeEach(async () => {
    await db
      .delete(subscriptionsTable)
      .where(eq(subscriptionsTable.userId, userId));
  });

  it("rejects a request with an invalid signature", async () => {
    const body = eventBody("subscription.created");
    const headers = signedHeaders(body, `wh_${Math.random()}`);
    headers["webhook-signature"] = "v1,AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
    const res = await post("/api/payment/webhook", body, headers);
    expect(res.status).toBe(401);

    const [row] = await db
      .select()
      .from(subscriptionsTable)
      .where(eq(subscriptionsTable.userId, userId));
    expect(row).toBeUndefined();
  });

  it("processes a signed subscription.created event and activates the subscription", async () => {
    const webhookId = `wh_${Math.random()}`;
    const body = eventBody("subscription.created", {
      customerCode: customerCode,
      subscriptionId: "sub_1",
    });
    const res = await post(
      "/api/payment/webhook",
      body,
      signedHeaders(body, webhookId),
    );
    expect(res.status).toBe(200);

    const [row] = await db
      .select()
      .from(subscriptionsTable)
      .where(eq(subscriptionsTable.userId, userId));
    expect(row?.status).toBe("active");
    expect(row?.paymentCustomerId).toBe(customerCode);
  });

  it("ignores a replayed webhook with the same webhook-id (dedup)", async () => {
    const webhookId = `wh_${Math.random()}`;
    const createdBody = eventBody("subscription.created", {
      customerCode,
      subscriptionId: "sub_2",
    });
    const first = await post(
      "/api/payment/webhook",
      createdBody,
      signedHeaders(createdBody, webhookId),
    );
    expect(first.status).toBe(200);

    // Replay the exact same webhook-id with a payload that would otherwise
    // change state (cancellation) — the duplicate claim must short-circuit it.
    const cancelledBody = eventBody("subscription.cancelled", {
      customerCode,
      subscriptionId: "sub_2",
    });
    const replay = await post(
      "/api/payment/webhook",
      cancelledBody,
      signedHeaders(cancelledBody, webhookId),
    );
    expect(replay.status).toBe(200);

    const [row] = await db
      .select()
      .from(subscriptionsTable)
      .where(eq(subscriptionsTable.userId, userId));
    // Status must still reflect the first (created/active) event, not the
    // replayed cancellation, because the webhook-id was already claimed.
    expect(row?.status).toBe("active");
  });

  it("does not regress state when an older event arrives out of order", async () => {
    const newer = eventBody("subscription.cancelled", {
      customerCode,
      subscriptionId: "sub_3",
    });
    await post(
      "/api/payment/webhook",
      newer,
      signedHeaders(newer, `wh_${Math.random()}`),
    );
    const [afterNewer] = await db
      .select()
      .from(subscriptionsTable)
      .where(eq(subscriptionsTable.userId, userId));
    expect(afterNewer?.status).toBe("cancelled");

    // An older "created" event (earlier occurredAt) arrives late/out of order
    // and must not overwrite the already-applied cancellation.
    const olderTimestamp = new Date(Date.now() - 60_000).toISOString();
    const older = JSON.stringify({
      eventType: "subscription.created",
      createdAt: olderTimestamp,
      data: { customer: { customerCode }, subscriptionId: "sub_3" },
    });
    await post(
      "/api/payment/webhook",
      older,
      signedHeaders(older, `wh_${Math.random()}`),
    );
    const [afterOlder] = await db
      .select()
      .from(subscriptionsTable)
      .where(eq(subscriptionsTable.userId, userId));
    expect(afterOlder?.status).toBe("cancelled");
  });

  it("applies a distinct event that shares the previous event's timestamp", async () => {
    const createdAt = new Date().toISOString();
    for (const eventType of ["invoice.paid", "invoice.payment_failed"]) {
      const body = JSON.stringify({
        eventType,
        createdAt,
        data: { customer: { customerCode }, subscriptionId: "sub_4" },
      });
      await post(
        "/api/payment/webhook",
        body,
        signedHeaders(body, `wh_${Math.random()}`),
      );
    }
    const [row] = await db
      .select()
      .from(subscriptionsTable)
      .where(eq(subscriptionsTable.userId, userId));
    expect(row?.status).toBe("past_due");
  });

  it("acknowledges a signed event type it does not handle", async () => {
    const body = eventBody("customer.updated", { customerCode });
    const res = await post(
      "/api/payment/webhook",
      body,
      signedHeaders(body, `wh_${Math.random()}`),
    );
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true, ignored: true });

    const [row] = await db
      .select()
      .from(subscriptionsTable)
      .where(eq(subscriptionsTable.userId, userId));
    expect(row).toBeUndefined();
  });

  it("acknowledges a signed event with no customer", async () => {
    const body = JSON.stringify({
      eventType: "invoice.paid",
      createdAt: new Date().toISOString(),
      data: {},
    });
    const res = await post(
      "/api/payment/webhook",
      body,
      signedHeaders(body, `wh_${Math.random()}`),
    );
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true, ignored: true });
  });

  it("checks the signature before the event type", async () => {
    const body = eventBody("customer.updated", { customerCode });
    const headers = signedHeaders(body, `wh_${Math.random()}`);
    headers["webhook-signature"] = "v1,AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
    const res = await post("/api/payment/webhook", body, headers);
    expect(res.status).toBe(401);
  });

  it("returns received:true without crashing when webhook headers are missing", async () => {
    const body = eventBody("subscription.created", { customerCode });
    const res = await fetch(`${baseUrl}/api/payment/webhook`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { received: boolean };
    expect(json.received).toBe(true);

    const [row] = await db
      .select()
      .from(subscriptionsTable)
      .where(eq(subscriptionsTable.userId, userId));
    expect(row).toBeUndefined();
  });
});
