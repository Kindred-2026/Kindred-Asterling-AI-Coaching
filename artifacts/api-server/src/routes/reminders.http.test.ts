import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import {
  closeDatabase,
  db,
  eq,
  reminderSettingsTable,
  usersTable,
} from "@workspace/db";
import app from "../app";
import {
  registerTestClerkIdentity,
  revokeTestClerkIdentity,
} from "../middlewares/testClerkIdentityAdapter";

const userId = `test-reminders-${crypto.randomUUID()}`;
let server: Server;
let baseUrl: string;
let token: string;

async function patch(body: unknown) {
  const res = await fetch(`${baseUrl}/reminder-settings`, {
    method: "PATCH",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  return {
    status: res.status,
    body: (await res.json()) as Record<string, unknown>,
  };
}

beforeAll(async () => {
  await db.insert(usersTable).values({ id: userId });
  token = registerTestClerkIdentity({ id: userId });
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
});

beforeEach(async () => {
  await db
    .delete(reminderSettingsTable)
    .where(eq(reminderSettingsTable.userId, userId));
  await db.update(usersTable).set({ phone: null }).where(eq(usersTable.id, userId));
});

afterAll(async () => {
  revokeTestClerkIdentity(token);
  await db
    .delete(reminderSettingsTable)
    .where(eq(reminderSettingsTable.userId, userId));
  await db.delete(usersTable).where(eq(usersTable.id, userId));
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
  await closeDatabase();
});

describe("PATCH /api/reminder-settings", () => {
  it("refuses to turn on text reminders without a phone number", async () => {
    const res = await patch({ smsEnabled: true, phone: null });
    expect(res.status).toBe(400);

    const [row] = await db
      .select()
      .from(reminderSettingsTable)
      .where(eq(reminderSettingsTable.userId, userId));
    expect(row?.smsEnabled).toBe(false);
  });

  it("refuses to clear the phone while text reminders are on", async () => {
    expect((await patch({ smsEnabled: true, phone: "+15551234567" })).status).toBe(200);
    expect((await patch({ phone: null })).status).toBe(400);
  });

  it("turns on text reminders with a phone number saved earlier", async () => {
    await db
      .update(usersTable)
      .set({ phone: "+15551234567" })
      .where(eq(usersTable.id, userId));
    const res = await patch({ smsEnabled: true });
    expect(res.status).toBe(200);
    expect(res.body.smsEnabled).toBe(true);
  });

  it("does not block unrelated edits", async () => {
    const res = await patch({ morningTime: "07:30" });
    expect(res.status).toBe(200);
    expect(res.body.morningTime).toBe("07:30");
  });
});
