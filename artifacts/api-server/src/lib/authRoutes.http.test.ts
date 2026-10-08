import { describe, it, expect, beforeAll, afterAll } from "vitest";
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
