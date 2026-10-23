import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomBytes } from "node:crypto";
import type { AddressInfo } from "net";
import type { Server } from "http";
import { eq } from "@workspace/db";
import { db, usersTable } from "@workspace/db";
import app from "../app";
import {
  registerTestClerkIdentity,
  revokeTestClerkIdentity,
} from "../middlewares/testClerkIdentityAdapter";

// Drives the real Express app over HTTP to prove the app-level authentication
// path: health stays public, protected routes reject anonymous callers, and a
// valid test identity reaches protected handlers.

const suffix = Math.random().toString(36).slice(2, 10);
const userId = `test-auth-${suffix}`;

let server: Server;
let baseUrl: string;
let token: string;

beforeAll(async () => {
  await db
    .insert(usersTable)
    .values({
      id: userId,
      email: `${userId}@example.test`,
      emailVerifiedAt: new Date(),
    })
    .onConflictDoNothing({ target: usersTable.id });
  token = registerTestClerkIdentity({ id: userId });
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const addr = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${addr.port}/api`;
});

afterAll(async () => {
  revokeTestClerkIdentity(token);
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
  await db.delete(usersTable).where(eq(usersTable.id, userId));
});

async function get(path: string, opts: { token?: string } = {}): Promise<{ status: number }> {
  const headers: Record<string, string> = {};
  if (opts.token) headers["authorization"] = `Bearer ${opts.token}`;
  const res = await fetch(`${baseUrl}${path}`, { headers });
  return { status: res.status };
}

describe("app authentication path", () => {
  it("keeps the health endpoint public", async () => {
    const res = await get("/healthz");
    expect(res.status).toBe(200);
  });

  it("rejects signed-out protected API requests", async () => {
    const res = await get("/habits");
    expect(res.status).toBe(401);
  });

  it("rejects disallowed cross-site origins with 403", async () => {
    const res = await fetch(`${baseUrl}/habits`, {
      headers: { origin: "https://not-allowed.example" },
    });
    expect(res.status).toBe(403);
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("reaches protected handlers for valid authenticated requests", async () => {
    const res = await get("/habits", { token });
    expect(res.status).toBe(200);
  });
});

describe("GET /auth/user emailVerifiedAt", () => {
  async function fetchUser(t: string): Promise<{ emailVerifiedAt: string | null; createdAt: string }> {
    const res = await fetch(`${baseUrl}/auth/user`, {
      headers: { authorization: `Bearer ${t}` },
    });
    expect(res.status).toBe(200);
    return ((await res.json()) as { user: { emailVerifiedAt: string | null; createdAt: string } }).user;
  }

  it("reports the stored verification time, not the account creation time", async () => {
    const verifiedAt = new Date("2026-01-02T03:04:05.000Z");
    await db.update(usersTable).set({ emailVerifiedAt: verifiedAt }).where(eq(usersTable.id, userId));
    const user = await fetchUser(token);
    expect(user.emailVerifiedAt).toBe(verifiedAt.toISOString());
    expect(user.emailVerifiedAt).not.toBe(user.createdAt);
  });

  it("returns only public profile fields, never internal columns", async () => {
    await db
      .update(usersTable)
      // Generated per run so no secret-like literal sits in source.
      .set({ passwordHash: randomBytes(16).toString("hex"), clerkUserId: `clerk-${suffix}` })
      .where(eq(usersTable.id, userId));
    const res = await fetch(`${baseUrl}/auth/user`, {
      headers: { authorization: `Bearer ${token}` },
    });
    const { user } = (await res.json()) as { user: Record<string, unknown> };
    for (const key of ["passwordHash", "clerkUserId", "auth0UserId", "clerkDeletedAt", "updatedAt"]) {
      expect(user).not.toHaveProperty(key);
    }
    expect(user).toMatchObject({ id: userId, preferredName: null, timezone: null });
  });

  it("reports null for a user whose email was never verified", async () => {
    const unverifiedId = `test-auth-unverified-${suffix}`;
    await db.insert(usersTable).values({ id: unverifiedId, emailVerifiedAt: null });
    const unverifiedToken = registerTestClerkIdentity({ id: unverifiedId });
    try {
      const user = await fetchUser(unverifiedToken);
      expect(user.emailVerifiedAt).toBeNull();
    } finally {
      revokeTestClerkIdentity(unverifiedToken);
      await db.delete(usersTable).where(eq(usersTable.id, unverifiedId));
    }
  });
});
