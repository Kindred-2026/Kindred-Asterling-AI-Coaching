import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { eq, db, closeDatabase, usersTable } from "@workspace/db";
import app from "../app";
import {
  registerTestClerkIdentity,
  revokeTestClerkIdentity,
} from "../middlewares/testClerkIdentityAdapter";

// Drives the beta checklist routes over HTTP: ticks persist per user and
// one tester's ticks never show up for another.
const suffix = crypto.randomUUID();
const userAId = `test-checklist-a-${suffix}`;
const userBId = `test-checklist-b-${suffix}`;

let server: Server;
let baseUrl: string;
let tokenA: string;
let tokenB: string;

async function api(
  method: string,
  token: string | undefined,
  body?: unknown,
): Promise<{ status: number; body: any }> {
  const headers: Record<string, string> = {};
  if (token) headers["authorization"] = `Bearer ${token}`;
  if (body !== undefined) headers["content-type"] = "application/json";
  const res = await fetch(`${baseUrl}/beta-checklist`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

beforeAll(async () => {
  await db.insert(usersTable).values([{ id: userAId }, { id: userBId }]);
  tokenA = registerTestClerkIdentity({ id: userAId });
  tokenB = registerTestClerkIdentity({ id: userBId });
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
});

afterAll(async () => {
  [tokenA, tokenB].forEach(revokeTestClerkIdentity);
  for (const id of [userAId, userBId]) {
    await db.delete(usersTable).where(eq(usersTable.id, id));
  }
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
  await closeDatabase();
});

describe("beta checklist", () => {
  it("requires sign-in", async () => {
    expect((await api("GET", undefined)).status).toBe(401);
    expect(
      (await api("PUT", undefined, { itemId: "signup-create", checked: true }))
        .status,
    ).toBe(401);
  });

  it("starts empty", async () => {
    const res = await api("GET", tokenA);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ checked: [] });
  });

  it("saves ticks and unticks for the signed-in user only", async () => {
    await api("PUT", tokenA, { itemId: "signup-create", checked: true });
    const ticked = await api("PUT", tokenA, {
      itemId: "talk-welcome",
      checked: true,
    });
    expect(ticked.body).toEqual({ checked: ["signup-create", "talk-welcome"] });

    const unticked = await api("PUT", tokenA, {
      itemId: "signup-create",
      checked: false,
    });
    expect(unticked.body).toEqual({ checked: ["talk-welcome"] });

    expect((await api("GET", tokenA)).body).toEqual({
      checked: ["talk-welcome"],
    });
    expect((await api("GET", tokenB)).body).toEqual({ checked: [] });
  });

  it("is idempotent when the same tick is sent twice", async () => {
    await api("PUT", tokenB, { itemId: "habits-add", checked: true });
    const again = await api("PUT", tokenB, {
      itemId: "habits-add",
      checked: true,
    });
    expect(again.body).toEqual({ checked: ["habits-add"] });
  });

  it("rejects malformed updates", async () => {
    for (const body of [
      {},
      { itemId: "signup-create" },
      { itemId: "signup-create", checked: "yes" },
      { itemId: "Not An Id", checked: true },
      { itemId: "a".repeat(65), checked: true },
      { itemId: 42, checked: true },
    ]) {
      expect((await api("PUT", tokenA, body)).status).toBe(400);
    }
  });
});
