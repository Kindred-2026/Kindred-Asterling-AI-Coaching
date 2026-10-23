import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { betaGrantsTable, db, eq, usersTable } from "@workspace/db";
import adminRouter from "./admin";

function testApp(authenticated: boolean) {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    req.isAuthenticated = function (this: Request) {
      return this.user != null;
    } as Request["isAuthenticated"];
    if (authenticated) {
      req.user = {
        id: "owner-app-id",
        email: "owner@example.com",
        firstName: "Owner",
        lastName: null,
        profileImageUrl: null,
        emailVerified: true,
      };
    }
    next();
  });
  app.use("/api/admin", adminRouter);
  return app;
}

describe("admin route mounting", () => {
  const previousOwnerEmails = process.env.SUBSCRIPTION_OWNER_EMAILS;

  beforeEach(() => {
    process.env.SUBSCRIPTION_OWNER_EMAILS = "owner@example.com";

  });

  afterEach(() => {
    if (previousOwnerEmails === undefined) {
      delete process.env.SUBSCRIPTION_OWNER_EMAILS;
    } else {
      process.env.SUBSCRIPTION_OWNER_EMAILS = previousOwnerEmails;
    }
  });

  it("serves the documented /api/admin/users path to an owner", async () => {
    await db.delete(usersTable).where(eq(usersTable.id, "app-user-id"));
    await db.insert(usersTable).values({
      id: "app-user-id",
      clerkUserId: "clerk-user-id",
      clerkDeletedAt: null,
      email: "reviewer@example.com",
      passwordHash: null,
      firstName: "OAuth",
      lastName: "Reviewer",
      profileImageUrl: null,
      preferredName: null,
      birthday: null,
      struggles: null,
      strengths: null,
      interests: null,
      bio: null,
      motivationalQuote: null,
      phone: null,
      timezone: null,
      emailVerifiedAt: new Date("2026-09-07T00:00:00.000Z"),
      onboardedAt: null,
      createdAt: new Date("2026-09-07T00:00:00.000Z"),
      updatedAt: new Date("2026-09-07T00:00:00.000Z"),
    });

    const response = await request(testApp(true)).get(
      "/api/admin/users?q=reviewer%40example.com",
    );

    expect(response.status).toBe(200);
    expect(response.headers["x-powered-by"]).toBeUndefined();
    expect(response.body.users).toEqual([
      expect.objectContaining({
        id: "app-user-id",
        email: "reviewer@example.com",
        emailVerifiedAt: "2026-09-07T00:00:00.000Z",
      }),
    ]);

  });

  it("rejects anonymous callers on the corrected path", async () => {
    const response = await request(testApp(false)).get(
      "/api/admin/users?q=reviewer%40example.com",
    );

    expect(response.status).toBe(401);
  });

  it("rejects an array-valued admin search query", async () => {
    const response = await request(testApp(true)).get(
      "/api/admin/users?q=one&q=two",
    );
    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: "q must be a string" });
  });
});

describe("POST /api/admin/beta/revoke", () => {
  const previousOwnerEmails = process.env.SUBSCRIPTION_OWNER_EMAILS;
  const testerId = `test-revoke-${crypto.randomUUID()}`;
  const day = 86_400_000;

  beforeEach(async () => {
    process.env.SUBSCRIPTION_OWNER_EMAILS = "owner@example.com";
    await db.delete(betaGrantsTable).where(eq(betaGrantsTable.userId, testerId));
  });

  afterEach(async () => {
    await db.delete(betaGrantsTable).where(eq(betaGrantsTable.userId, testerId));
    if (previousOwnerEmails === undefined) {
      delete process.env.SUBSCRIPTION_OWNER_EMAILS;
    } else {
      process.env.SUBSCRIPTION_OWNER_EMAILS = previousOwnerEmails;
    }
  });

  async function grants() {
    return db
      .select()
      .from(betaGrantsTable)
      .where(eq(betaGrantsTable.userId, testerId));
  }

  it("revokes the active grant, not an older expired one", async () => {
    await db.insert(betaGrantsTable).values({
      userId: testerId,
      grantedAt: new Date(Date.now() - 60 * day),
      expiresAt: new Date(Date.now() - 30 * day),
    });
    await db.insert(betaGrantsTable).values({
      userId: testerId,
      expiresAt: new Date(Date.now() + 30 * day),
    });

    const response = await request(testApp(true))
      .post("/api/admin/beta/revoke")
      .send({ userId: testerId });
    expect(response.status).toBe(200);

    const rows = await grants();
    const active = rows.find((g) => g.expiresAt!.getTime() > Date.now());
    const expired = rows.find((g) => g.expiresAt!.getTime() <= Date.now());
    expect(active?.revokedAt).toBeInstanceOf(Date);
    expect(expired?.revokedAt).toBeNull();
  });

  it("returns 404 when the only unrevoked grant has expired", async () => {
    await db.insert(betaGrantsTable).values({
      userId: testerId,
      expiresAt: new Date(Date.now() - day),
    });

    const response = await request(testApp(true))
      .post("/api/admin/beta/revoke")
      .send({ userId: testerId });
    expect(response.status).toBe(404);

    const [row] = await grants();
    expect(row?.revokedAt).toBeNull();
  });
});
