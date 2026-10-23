import crypto from "node:crypto";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { db, eq, usersTable } from "@workspace/db";
import app from "../app";
import {
  registerTestClerkIdentity,
  revokeTestClerkIdentity,
} from "../middlewares/testClerkIdentityAdapter";

let server: Server;
let baseUrl: string;
const tokens: string[] = [];
const userIds: string[] = [];
const originalEnv = {
  appId: process.env.INTERCOM_APP_ID,
  secret: process.env.INTERCOM_MESSENGER_SECRET,
};

beforeAll(async () => {
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      resolve();
    });
  });
});

afterEach(() => {
  if (originalEnv.appId === undefined) delete process.env.INTERCOM_APP_ID;
  else process.env.INTERCOM_APP_ID = originalEnv.appId;
  if (originalEnv.secret === undefined) delete process.env.INTERCOM_MESSENGER_SECRET;
  else process.env.INTERCOM_MESSENGER_SECRET = originalEnv.secret;
});

afterAll(async () => {
  tokens.forEach(revokeTestClerkIdentity);
  for (const id of userIds) await db.delete(usersTable).where(eq(usersTable.id, id));
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

async function seedUser() {
  const id = `http-intercom-${Math.random().toString(36).slice(2, 10)}`;
  const token = registerTestClerkIdentity({ id, firstName: "Ada", lastName: "Lovelace" });
  tokens.push(token);
  userIds.push(id);
  await db.insert(usersTable).values({ id, auth0UserId: `auth0|${id}` });
  return { id, token };
}

const getSettings = (token: string) =>
  fetch(`${baseUrl}/api/account/intercom`, {
    headers: { authorization: `Bearer ${token}` },
  });

describe("GET /api/account/intercom", () => {
  it("answers 404 when Intercom is not configured", async () => {
    delete process.env.INTERCOM_APP_ID;
    delete process.env.INTERCOM_MESSENGER_SECRET;
    const { token } = await seedUser();
    expect((await getSettings(token)).status).toBe(404);
  });

  it("requires sign-in", async () => {
    process.env.INTERCOM_APP_ID = "test-app";
    process.env.INTERCOM_MESSENGER_SECRET = "test-secret";
    expect((await fetch(`${baseUrl}/api/account/intercom`)).status).toBe(401);
  });

  it("returns a token signed for the signed-in user only", async () => {
    process.env.INTERCOM_APP_ID = "test-app";
    process.env.INTERCOM_MESSENGER_SECRET = "test-secret";
    const { id, token } = await seedUser();

    const response = await getSettings(token);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = (await response.json()) as {
      appId: string;
      userJwt: string;
      name: string | null;
      createdAt: number;
    };
    expect(body.appId).toBe("test-app");
    expect(body.name).toBe("Ada Lovelace");
    expect(Number.isInteger(body.createdAt)).toBe(true);

    const [header, payload, signature] = body.userJwt.split(".");
    expect(signature).toBe(
      crypto
        .createHmac("sha256", "test-secret")
        .update(`${header}.${payload}`)
        .digest("base64url"),
    );
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString());
    expect(claims.user_id).toBe(id);
    expect(claims.email).toBe(`${id}@example.test`);
    expect(claims.exp).toBeGreaterThan(Date.now() / 1000);
  });
});
