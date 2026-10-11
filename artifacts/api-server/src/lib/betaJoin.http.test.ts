import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import {
  betaGrantsTable,
  closeDatabase,
  db,
  eq,
  usersTable,
} from "@workspace/db";
import app from "../app";
import {
  registerTestClerkIdentity,
  revokeTestClerkIdentity,
} from "../middlewares/testClerkIdentityAdapter";

// Drives the first-come, first-served beta over HTTP with a small beta: three
// spots, one of them reserved for an owner to hand out.
const suffix = crypto.randomUUID();
const ownerId = `test-beta-owner-${suffix}`;
const unverifiedId = `test-beta-unverified-${suffix}`;
const testerIds = Array.from(
  { length: 5 },
  (_, i) => `test-beta-tester-${i}-${suffix}`,
);

let server: Server;
let baseUrl: string;
let ownerToken = "";
let unverifiedToken = "";
let testerTokens: string[] = [];
const savedEnv = { ...process.env };

async function api(
  method: string,
  path: string,
  token: string | undefined,
  body?: unknown,
): Promise<{ status: number; body: any }> {
  const headers: Record<string, string> = {};
  if (token) headers["authorization"] = `Bearer ${token}`;
  if (body !== undefined) headers["content-type"] = "application/json";
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

const join = (token: string | undefined) => api("POST", "/beta/join", token);
const status = (token: string | undefined) => api("GET", "/beta/status", token);

beforeAll(async () => {
  await db
    .insert(usersTable)
    .values(
      [ownerId, unverifiedId, ...testerIds].map((id) => ({ id })),
    );
  ownerToken = registerTestClerkIdentity({ id: ownerId });
  unverifiedToken = registerTestClerkIdentity({
    id: unverifiedId,
    emailVerified: false,
  });
  testerTokens = testerIds.map((id) => registerTestClerkIdentity({ id }));
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
});

beforeEach(async () => {
  process.env.BETA_CAPACITY = "3";
  process.env.BETA_RESERVED_SPOTS = "1";
  process.env.SUBSCRIPTION_OWNER_IDS = ownerId;
  delete process.env.BETA_OPENS_AT;
  await db.delete(betaGrantsTable);
});

afterAll(async () => {
  process.env = savedEnv;
  [ownerToken, unverifiedToken, ...testerTokens].forEach(
    revokeTestClerkIdentity,
  );
  await db.delete(betaGrantsTable);
  for (const id of [ownerId, unverifiedId, ...testerIds]) {
    await db.delete(usersTable).where(eq(usersTable.id, id));
  }
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
  await closeDatabase();
});

describe("first-come, first-served beta", () => {
  it("requires sign-in", async () => {
    expect((await status(undefined)).status).toBe(401);
    expect((await join(undefined)).status).toBe(401);
  });

  it("shows the open spots, leaving out the reserved ones", async () => {
    const res = await status(testerTokens[0]);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      state: "open",
      opensAt: null,
      spotsLeft: 2,
      emailVerified: true,
    });
  });

  it("lets testers join until the open spots are gone", async () => {
    expect((await join(testerTokens[0])).body).toEqual({ joined: true });
    expect((await join(testerTokens[1])).body).toEqual({ joined: true });

    const full = await join(testerTokens[2]);
    expect(full.status).toBe(409);
    expect(full.body.state).toBe("full");
    expect((await status(testerTokens[2])).body).toMatchObject({
      state: "full",
      spotsLeft: 0,
    });
  });

  it("gives a joined tester access to the app", async () => {
    await join(testerTokens[0]);
    const access = await api("GET", "/subscription/status", testerTokens[0]);
    expect(access.body).toMatchObject({ active: true, source: "beta" });
  });

  it("does not use a second spot when a tester joins twice", async () => {
    await join(testerTokens[0]);
    expect((await join(testerTokens[0])).body).toEqual({ joined: true });
    expect((await status(testerTokens[1])).body.spotsLeft).toBe(1);
  });

  it("never hands out more spots than there are, even all at once", async () => {
    const results = await Promise.all(testerTokens.map(join));
    expect(results.filter((r) => r.status === 200)).toHaveLength(2);
    expect(results.filter((r) => r.status === 409)).toHaveLength(3);
    const grants = await db.select().from(betaGrantsTable);
    expect(grants).toHaveLength(2);
  });

  it("asks for a verified email before joining", async () => {
    expect((await status(unverifiedToken)).body.emailVerified).toBe(false);
    expect((await join(unverifiedToken)).status).toBe(403);
    expect(await db.select().from(betaGrantsTable)).toHaveLength(0);
  });

  it("stays closed until the opening time", async () => {
    const opensAt = new Date(Date.now() + 60 * 60 * 1000);
    process.env.BETA_OPENS_AT = opensAt.toISOString();
    expect((await status(testerTokens[0])).body).toMatchObject({
      state: "not_open",
      opensAt: opensAt.toISOString(),
    });
    const early = await join(testerTokens[0]);
    expect(early.status).toBe(409);
    expect(early.body.state).toBe("not_open");

    process.env.BETA_OPENS_AT = new Date(Date.now() - 1000).toISOString();
    expect((await join(testerTokens[0])).body).toEqual({ joined: true });
  });

  it("frees a spot when an owner revokes a tester", async () => {
    await join(testerTokens[0]);
    await join(testerTokens[1]);
    expect(
      (
        await api("POST", "/admin/beta/revoke", ownerToken, {
          userId: testerIds[0],
        })
      ).status,
    ).toBe(200);
    expect((await join(testerTokens[2])).body).toEqual({ joined: true });
  });

  it("does not let a revoked tester take a spot back", async () => {
    await join(testerTokens[0]);
    await api("POST", "/admin/beta/revoke", ownerToken, {
      userId: testerIds[0],
    });
    const again = await join(testerTokens[0]);
    expect(again.status).toBe(403);
    expect(again.body.error).toMatch(/turned off/);
    expect((await status(testerTokens[1])).body.spotsLeft).toBe(2);
  });

  it("keeps reserved spots for owner grants only", async () => {
    await join(testerTokens[0]);
    await join(testerTokens[1]);

    const friend = await api("POST", "/admin/beta/grant", ownerToken, {
      userId: testerIds[2],
    });
    expect(friend.status).toBe(201);

    const another = await api("POST", "/admin/beta/grant", ownerToken, {
      userId: testerIds[3],
    });
    expect(another.status).toBe(409);
    expect(another.body.error).toMatch(/reserved spots are in use/);

    const list = await api("GET", "/admin/beta/grants", ownerToken);
    expect(list.body.spots).toEqual({
      open: { total: 2, taken: 2, left: 0 },
      reserved: { total: 1, taken: 1, left: 0 },
    });
    const kinds = Object.fromEntries(
      list.body.grants.map((g: any) => [g.userId, g.kind]),
    );
    expect(kinds).toEqual({
      [testerIds[0]]: "open",
      [testerIds[1]]: "open",
      [testerIds[2]]: "reserved",
    });
  });

  it("does not let owner grants take open spots", async () => {
    await api("POST", "/admin/beta/grant", ownerToken, {
      userId: testerIds[0],
    });
    expect((await status(testerTokens[1])).body.spotsLeft).toBe(2);
  });
});
