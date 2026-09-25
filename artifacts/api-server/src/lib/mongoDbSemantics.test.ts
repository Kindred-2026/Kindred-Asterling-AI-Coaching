import { afterAll, afterEach, describe, expect, it } from "vitest";
import {
  affirmationsTable,
  and,
  closeDatabase,
  db,
  eq,
  getMongoDatabase,
  habitEntriesTable,
  habitsTable,
  initializeMongoCounters,
  lte,
  or,
  processedWebhooksTable,
  reminderDeliveriesTable,
  usersTable,
} from "@workspace/db";
import { checkAndIncrementDailyQuota } from "./dailyQuota";

const suffix = Math.random().toString(36).slice(2, 10);
const createdUserIds = new Set<string>();

async function createUser(id: string, values: Record<string, unknown> = {}) {
  createdUserIds.add(id);
  await db.insert(usersTable).values({ id, ...values });
}

afterEach(async () => {
  for (const id of createdUserIds) {
    await db.delete(usersTable).where(eq(usersTable.id, id));
  }
  createdUserIds.clear();
});

afterAll(async () => {
  await closeDatabase();
});

describe("MongoDB data API semantics", () => {
  it("treats zero-argument and/or conditions as neutral matches", () => {
    const andCondition = and();
    const orCondition = or();
    expect("filter" in andCondition ? andCondition.filter : undefined).toEqual({});
    expect("filter" in orCondition ? orCondition.filter : undefined).toEqual({});
  });

  it("updates and returns every matching document", async () => {
    const marker = `multi-${suffix}`;
    const ids = [`${marker}-1`, `${marker}-2`];
    await Promise.all(ids.map((id) => createUser(id, { firstName: marker })));

    const returned = await db
      .update(usersTable)
      .set({ lastName: "updated" })
      .where(eq(usersTable.firstName, marker))
      .returning({ id: usersTable.id, lastName: usersTable.lastName });

    expect(returned).toHaveLength(2);
    expect(returned.map(({ id }) => id).sort()).toEqual(ids.sort());
    expect(returned.every(({ lastName }) => lastName === "updated")).toBe(true);
  });

  it("ignores only the declared conflict target", async () => {
    const firstId = `conflict-first-${suffix}`;
    const secondId = `conflict-second-${suffix}`;
    const email = `${suffix}@example.test`;
    await createUser(firstId, { email, clerkUserId: `clerk-first-${suffix}` });

    const ignored = await db
      .insert(usersTable)
      .values({ id: firstId })
      .onConflictDoNothing({ target: usersTable.id })
      .returning();
    expect(ignored).toEqual([]);

    createdUserIds.add(secondId);
    await expect(
      db
        .insert(usersTable)
        .values({ id: secondId, email })
        .onConflictDoNothing({ target: usersTable.id }),
    ).rejects.toMatchObject({ code: 11000 });

    await expect(
      db
        .insert(usersTable)
        .values({
          id: secondId,
          clerkUserId: `clerk-second-${suffix}`,
          email,
        })
        .onConflictDoUpdate({
          target: usersTable.clerkUserId,
          set: { firstName: "must-not-be-swallowed" },
        }),
    ).rejects.toMatchObject({ code: 11000 });
  });

  it("preserves integer counter continuity after migrated maxima", async () => {
    const database = await getMongoDatabase();
    const [latest] = await database
      .collection<any>("affirmations")
      .find({}, { projection: { id: 1 } })
      .sort({ id: -1 })
      .limit(1)
      .toArray();
    const migratedMaximum =
      (typeof latest?.id === "number" ? latest.id : 0) + 100;
    await database.collection<any>("affirmations").insertOne({
      _id: migratedMaximum,
      id: migratedMaximum,
      text: `migrated-${suffix}`,
      isActive: true,
      createdAt: new Date(),
    });
    try {
      await initializeMongoCounters(database);
      const [created] = await db.insert(affirmationsTable).values({
        text: `runtime-${suffix}`,
        isActive: true,
      });
      expect(created?.id).toBe(migratedMaximum + 1);
      await database
        .collection<any>("affirmations")
        .deleteMany({ id: { $in: [migratedMaximum, migratedMaximum + 1] } });
    } finally {
      await database
        .collection<any>("affirmations")
        .deleteMany({ id: { $in: [migratedMaximum, migratedMaximum + 1] } });
    }
  });

  it("queries migrated date-only strings lexicographically", async () => {
    const userId = `date-query-${suffix}`;
    await createUser(userId);
    const [habit] = await db.insert(habitsTable).values({
      userId,
      name: "Date query",
      targetDays: 2,
      startDate: "2026-09-01",
    });
    await db.insert(habitEntriesTable).values([
      { userId, habitId: habit!.id, date: "2026-09-02", completed: true },
      { userId, habitId: habit!.id, date: "2026-09-03", completed: true },
    ]);

    const rows = await db
      .select()
      .from(habitEntriesTable)
      .where(
        and(
          eq(habitEntriesTable.userId, userId),
          lte(habitEntriesTable.date, "2026-09-02"),
        ),
      );
    expect(rows.map(({ date }) => date)).toEqual(["2026-09-02"]);
  });

  it("enforces quota atomically under concurrent requests", async () => {
    const userId = `quota-race-${suffix}`;
    await createUser(userId);
    const previous = process.env.DAILY_CHAT_LIMIT;
    process.env.DAILY_CHAT_LIMIT = "3";
    try {
      const results = await Promise.all(
        Array.from({ length: 12 }, () => checkAndIncrementDailyQuota(userId)),
      );
      expect(results.filter(({ allowed }) => allowed)).toHaveLength(3);
      const database = await getMongoDatabase();
      const date = new Date().toISOString().slice(0, 10);
      expect(
        await database.collection<any>("daily_usage").findOne({
          _id: `${userId}:${date}`,
        }),
      ).toMatchObject({ count: 3, date, userId });
    } finally {
      if (previous === undefined) delete process.env.DAILY_CHAT_LIMIT;
      else process.env.DAILY_CHAT_LIMIT = previous;
    }
  });

  it("allows one concurrent webhook claim", async () => {
    const webhookId = `webhook-race-${suffix}`;
    const claims = await Promise.all(
      Array.from({ length: 12 }, () =>
        db
          .insert(processedWebhooksTable)
          .values({ webhookId, eventType: "subscription.renewed" })
          .onConflictDoNothing({ target: processedWebhooksTable.webhookId })
          .returning(),
      ),
    );
    expect(claims.filter((rows) => rows.length === 1)).toHaveLength(1);
    await db
      .delete(processedWebhooksTable)
      .where(eq(processedWebhooksTable.webhookId, webhookId));
  });

  it("allows one concurrent reminder-delivery reservation", async () => {
    const userId = `reminder-race-${suffix}`;
    await createUser(userId);
    const value = {
      userId,
      type: "morning",
      localDate: "2026-09-02",
      doseTime: "",
      channel: "email",
    };
    const reservations = await Promise.all(
      Array.from({ length: 12 }, () =>
        db
          .insert(reminderDeliveriesTable)
          .values(value)
          .onConflictDoNothing({
            target: [
              reminderDeliveriesTable.userId,
              reminderDeliveriesTable.type,
              reminderDeliveriesTable.localDate,
              reminderDeliveriesTable.doseTime,
              reminderDeliveriesTable.channel,
            ],
          })
          .returning(),
      ),
    );
    expect(reservations.filter((rows) => rows.length === 1)).toHaveLength(1);
  });
});
