import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db, eq, usersTable } from "@workspace/db";
import adminRouter from "./admin";

function testApp(authenticated: boolean) {
  const app = express();
  app.disable("x-powered-by");
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
