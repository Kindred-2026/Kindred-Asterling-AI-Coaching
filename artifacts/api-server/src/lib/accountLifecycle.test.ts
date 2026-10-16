import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  betaGrantsTable,
  bodyScansTable,
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
import {
  AccountDeletionBlockedError,
  deleteAccount,
  exportAccount,
} from "./accountLifecycle";
import {
  failThen,
  mockExternalProviders,
  setProviderEnv,
  status,
} from "./__fixtures__/externalProviders";
import { pseudonymousUserId } from "./analytics";
import { resetAuth0ManagementToken } from "./auth0Management";
import {
  signedCustomerReference,
  type SubscriptionStatus,
} from "./helcimClient";
import { retryPolicy } from "./retry";

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

describe("account deletion across Helcim, Auth0 and Amplitude", () => {
  let restoreEnv: () => void;
  let providers: ReturnType<typeof mockExternalProviders> | undefined;
  const originalDelay = retryPolicy.baseDelayMs;

  beforeEach(() => {
    restoreEnv = setProviderEnv();
    retryPolicy.baseDelayMs = 0;
    resetAuth0ManagementToken();
  });

  afterEach(() => {
    providers?.restore();
    providers = undefined;
    restoreEnv();
    retryPolicy.baseDelayMs = originalDelay;
  });

  async function seedYearlySubscriber(
    subscriptionStatus: SubscriptionStatus = "active",
    auth0UserId: string | null = "",
  ) {
    const id = `yearly-${Math.random().toString(36).slice(2, 10)}`;
    const customerCode = signedCustomerReference(id);
    await db.insert(usersTable).values({
      id,
      auth0UserId: auth0UserId === "" ? `google-oauth2|${id}` : auth0UserId,
    });
    await db.insert(subscriptionsTable).values({
      userId: id,
      status: subscriptionStatus,
      paymentCustomerId: customerCode,
      paymentSubscriptionId: "7001",
      currentPeriodEnd: new Date(Date.now() + 300 * 86_400_000),
    });
    await db.insert(morningLogsTable).values({
      userId: id,
      date: "2026-10-01",
      mentalLoadLevel: "steady",
      miniGoals: [],
    });
    return { id, customerCode };
  }

  const userExists = async (id: string) =>
    (await db.count(usersTable, eq(usersTable.id, id))) === 1;

  it("cancels an active Yearly plan first, then deletes the account, the Auth0 user and Amplitude data", async () => {
    const { id, customerCode } = await seedYearlySubscriber();
    const seenAt: Record<string, boolean> = {};
    providers = mockExternalProviders({
      helcimCustomerCode: customerCode,
      helcimDelete: async () => {
        seenAt.helcimCancel = await userExists(id);
        return new Response(null, { status: 200 });
      },
      auth0Delete: async () => {
        seenAt.auth0Delete = await userExists(id);
        return new Response(null, { status: 204 });
      },
    });

    await expect(deleteAccount(id)).resolves.toBe(true);

    // Billing stops while the account still exists; Auth0 goes after it.
    expect(seenAt).toEqual({ helcimCancel: true, auth0Delete: false });
    expect(await userExists(id)).toBe(false);
    expect(
      await db.count(subscriptionsTable, eq(subscriptionsTable.userId, id)),
    ).toBe(0);
    expect(
      providers.of("helcim").map((call) => `${call.method} ${call.url}`),
    ).toEqual([
      "GET https://api.helcim.com/v2/subscriptions/7001",
      "DELETE https://api.helcim.com/v2/subscriptions/7001",
    ]);
    expect(
      providers
        .of("auth0")
        .filter((call) => call.method === "DELETE")
        .map((call) => call.url),
    ).toEqual([
      `https://kindred-test.ca.auth0.com/api/v2/users/${encodeURIComponent(`google-oauth2|${id}`)}`,
    ]);
    expect(
      providers.of("amplitude").map((call) => call.body),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          user_ids: [pseudonymousUserId(id, "test-salt")],
        }),
        expect.objectContaining({ user_ids: [id] }),
      ]),
    );
    expect(providers.of("amplitude")).toHaveLength(2);
  });

  it("deletes nothing and reports the block when Helcim cannot cancel", async () => {
    const { id, customerCode } = await seedYearlySubscriber();
    providers = mockExternalProviders({
      helcimCustomerCode: customerCode,
      helcimDelete: status(503),
    });

    await expect(deleteAccount(id)).rejects.toBeInstanceOf(
      AccountDeletionBlockedError,
    );

    expect(
      providers.of("helcim").filter((call) => call.method === "DELETE"),
    ).toHaveLength(retryPolicy.attempts);
    expect(providers.of("auth0")).toHaveLength(0);
    expect(providers.of("amplitude")).toHaveLength(0);
    expect(await userExists(id)).toBe(true);
    expect(
      await db.count(morningLogsTable, eq(morningLogsTable.userId, id)),
    ).toBe(1);
    const [subscription] = await db
      .select()
      .from(subscriptionsTable)
      .where(eq(subscriptionsTable.userId, id));
    expect(subscription?.status).toBe("active");

    providers.restore();
    providers = mockExternalProviders({ helcimCustomerCode: customerCode });
    await expect(deleteAccount(id)).resolves.toBe(true);
  });

  it("blocks deletion of a billed account when Helcim is not configured", async () => {
    const { id } = await seedYearlySubscriber("past_due");
    restoreEnv();
    restoreEnv = setProviderEnv({ HELCIM_API_KEY: undefined });
    providers = mockExternalProviders();

    await expect(deleteAccount(id)).rejects.toBeInstanceOf(
      AccountDeletionBlockedError,
    );
    expect(await userExists(id)).toBe(true);
    await db.delete(usersTable).where(eq(usersTable.id, id));
  });

  it("retries a transient Helcim failure and then completes", async () => {
    const { id, customerCode } = await seedYearlySubscriber();
    providers = mockExternalProviders({
      helcimCustomerCode: customerCode,
      helcimDelete: failThen(2, 503, status(200)),
    });

    await expect(deleteAccount(id)).resolves.toBe(true);
    expect(
      providers.of("helcim").filter((call) => call.method === "DELETE"),
    ).toHaveLength(3);
  });

  it("does not call Helcim once renewal is already cancelled", async () => {
    const { id } = await seedYearlySubscriber("cancelled");
    providers = mockExternalProviders();

    await expect(deleteAccount(id)).resolves.toBe(true);
    expect(providers.of("helcim")).toHaveLength(0);
    expect(providers.of("auth0").length).toBeGreaterThan(0);
  });

  it("still deletes the account when Auth0 and Amplitude stay down", async () => {
    const { id, customerCode } = await seedYearlySubscriber();
    providers = mockExternalProviders({
      helcimCustomerCode: customerCode,
      auth0Delete: status(503),
      amplitude: status(500),
    });

    await expect(deleteAccount(id)).resolves.toBe(true);
    expect(await userExists(id)).toBe(false);
    expect(
      providers.of("auth0").filter((call) => call.method === "DELETE"),
    ).toHaveLength(retryPolicy.attempts);
    expect(providers.of("amplitude")).toHaveLength(2 * retryPolicy.attempts);
  });

  it("skips Auth0 for an account with no Auth0 identity", async () => {
    const { id, customerCode } = await seedYearlySubscriber("active", null);
    providers = mockExternalProviders({ helcimCustomerCode: customerCode });

    await expect(deleteAccount(id)).resolves.toBe(true);
    expect(providers.of("auth0")).toHaveLength(0);
    expect(providers.of("amplitude")).toHaveLength(2);
  });
});
