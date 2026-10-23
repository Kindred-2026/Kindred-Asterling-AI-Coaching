import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import {
  closeDatabase,
  db,
  eq,
  habitEntriesTable,
  habitsTable,
  usersTable,
} from "@workspace/db";
import app from "../app";
import {
  registerTestClerkIdentity,
  revokeTestClerkIdentity,
} from "../middlewares/testClerkIdentityAdapter";

const userId = `test-streaks-${crypto.randomUUID()}`;
let server: Server;
let baseUrl: string;
let token: string;

function utcDay(daysAgo: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

beforeAll(async () => {
  await db.insert(usersTable).values({ id: userId });
  token = registerTestClerkIdentity({ id: userId });
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
});

afterAll(async () => {
  revokeTestClerkIdentity(token);
  await db.delete(habitEntriesTable).where(eq(habitEntriesTable.userId, userId));
  await db.delete(habitsTable).where(eq(habitsTable.userId, userId));
  await db.delete(usersTable).where(eq(usersTable.id, userId));
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
  await closeDatabase();
});

describe("GET /api/dashboard/streaks", () => {
  it("counts entries stored as timestamps as well as plain dates", async () => {
    const [habit] = await db
      .insert(habitsTable)
      .values({ userId, name: "Walk", startDate: utcDay(10) })
      .returning();
    await db.insert(habitEntriesTable).values([
      {
        habitId: habit!.id,
        userId,
        date: `${utcDay(0)}T12:00:00.000Z`,
        completed: true,
      },
      { habitId: habit!.id, userId, date: utcDay(1), completed: true },
    ]);

    const res = await fetch(`${baseUrl}/dashboard/streaks?tzOffset=0`, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const streaks = (await res.json()) as {
      habitId: number;
      currentStreak: number;
      longestStreak: number;
    }[];
    expect(streaks.find((s) => s.habitId === habit!.id)).toMatchObject({
      currentStreak: 2,
      longestStreak: 2,
    });
  });
});
