import { afterAll, describe, expect, it } from "vitest";
import {
  betaGrantsTable,
  bodyScansTable,
  calendarConnectionsTable,
  closeDatabase,
  conversations,
  dailyUsageTable,
  db,
  DatabaseLeaseUnavailableError,
  entitlementAuditTable,
  eq,
  eveningReportsTable,
  habitEntriesTable,
  habitsTable,
  medicationLogsTable,
  medicationScheduleEntriesTable,
  medicationsTable,
  messages,
  morningLogsTable,
  reminderDeliveriesTable,
  reminderSettingsTable,
  subscriptionsTable,
  usersTable,
  getMongoDatabase,
  withDatabaseLease,
} from "@workspace/db";
import { deleteAccount, exportAccount } from "./accountLifecycle";

const suffix = Math.random().toString(36).slice(2, 10);
const userId = `account-owner-${suffix}`;
const survivorId = `account-survivor-${suffix}`;

async function waitForLease(leaseId: string): Promise<boolean> {
  const database = await getMongoDatabase();
  const leases = database.collection<{ _id: string }>("_leases");
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (await leases.findOne({ _id: leaseId })) return true;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return false;
}

afterAll(async () => {
  await db.delete(usersTable).where(eq(usersTable.id, survivorId));
  await closeDatabase();
});

describe("MongoDB account lifecycle", () => {
  it("serializes external checkout work with an expiring database lease", async () => {
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const first = withDatabaseLease("test", userId, 5_000, async () => held);
    try {
      expect(await waitForLease(`test:${userId}`)).toBe(true);
      await expect(
        withDatabaseLease("test", userId, 5_000, async () => undefined),
      ).rejects.toBeInstanceOf(DatabaseLeaseUnavailableError);
    } finally {
      release();
      await first;
    }
    await expect(
      withDatabaseLease("test", userId, 5_000, async () => "released"),
    ).resolves.toBe("released");
  });

  it("renews a live lease so long work cannot be overtaken after its initial TTL", async () => {
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const first = withDatabaseLease(
      "renewal-test",
      userId,
      90,
      async () => held,
    );
    try {
      expect(await waitForLease(`renewal-test:${userId}`)).toBe(true);
      await new Promise((resolve) => setTimeout(resolve, 140));
      await expect(
        withDatabaseLease("renewal-test", userId, 90, async () => undefined),
      ).rejects.toBeInstanceOf(DatabaseLeaseUnavailableError);
    } finally {
      release();
      await first;
    }
  });

  it("exports every owned data category and transactionally erases it", async () => {
    await db.insert(usersTable).values([{ id: userId }, { id: survivorId }]);
    const [habit] = await db.insert(habitsTable).values({
      userId,
      name: "Walk",
      targetDays: 30,
      startDate: "2026-09-01",
    });
    await db.insert(habitEntriesTable).values({
      userId,
      habitId: habit!.id,
      date: "2026-09-01",
      completed: true,
    });
    const [medication] = await db.insert(medicationsTable).values({
      userId,
      name: "Test medicine",
      dosage: "1",
      times: ["08:00"],
    });
    await db.insert(medicationScheduleEntriesTable).values({
      userId,
      medicationId: medication!.id,
      scheduledTime: "08:00",
      startDate: "2026-09-01",
    });
    await db.insert(medicationLogsTable).values({
      userId,
      medicationId: medication!.id,
      date: "2026-09-01",
      scheduledTime: "08:00",
    });
    const [chat] = await db.insert(conversations).values({
      userId,
      title: "Private chat",
    });
    await db.insert(messages).values({
      conversationId: chat!.id,
      userId,
      role: "user",
      content: "Private content",
    });
    await Promise.all([
      db.insert(morningLogsTable).values({
        userId,
        date: "2026-09-01",
        mentalLoadLevel: "steady",
        miniGoals: [],
      }),
      db.insert(eveningReportsTable).values({
        userId,
        date: "2026-09-01",
        medicationEffectiveness: 4,
      }),
      db.insert(bodyScansTable).values({
        userId,
        feelings: ["calm"],
        energyLevel: 4,
      }),
      db.insert(dailyUsageTable).values({
        userId,
        date: "2026-09-01",
        count: 2,
      }),
      db.insert(reminderSettingsTable).values({ userId }),
      db.insert(reminderDeliveriesTable).values({
        userId,
        type: "morning",
        localDate: "2026-09-01",
        channel: "email",
      }),
      db.insert(calendarConnectionsTable).values({
        userId,
        provider: "google",
        encryptedRefreshToken: "encrypted",
      }),
      db.insert(subscriptionsTable).values({ userId, status: "active" }),
      db.insert(entitlementAuditTable).values({ userId, action: "created" }),
      db.insert(betaGrantsTable).values({ userId }),
      db.insert(entitlementAuditTable).values({
        userId: survivorId,
        action: "admin_action",
        actorId: userId,
      }),
      db.insert(betaGrantsTable).values({
        userId: survivorId,
        grantedBy: userId,
      }),
    ]);

    const exported = await exportAccount(userId);
    expect(exported).not.toBeNull();
    for (const value of Object.values(exported!.data)) {
      expect(value).toHaveLength(1);
    }
    expect(
      exported!.data.chatMessages.every((message) => message.userId === userId),
    ).toBe(true);

    await expect(deleteAccount(userId)).resolves.toBe(true);
    await expect(deleteAccount(userId)).resolves.toBe(false);
    expect(await exportAccount(userId)).toBeNull();

    const [survivingAudit] = await db
      .select()
      .from(entitlementAuditTable)
      .where(eq(entitlementAuditTable.userId, survivorId));
    const [survivingGrant] = await db
      .select()
      .from(betaGrantsTable)
      .where(eq(betaGrantsTable.userId, survivorId));
    expect(survivingAudit?.actorId).toBeNull();
    expect(survivingGrant?.grantedBy).toBeNull();
    expect(
      await db.count(messages, eq(messages.conversationId, chat!.id)),
    ).toBe(0);
  });
});
