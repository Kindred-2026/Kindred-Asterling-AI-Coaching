import { eq } from "@workspace/db";
import {
  db,
  usersTable,
  morningLogsTable,
  eveningReportsTable,
  bodyScansTable,
  habitsTable,
  habitEntriesTable,
  conversations,
  messages,
  medicationsTable,
  medicationLogsTable,
  medicationScheduleEntriesTable,
  dailyUsageTable,
  reminderSettingsTable,
  reminderDeliveriesTable,
  calendarConnectionsTable,
  subscriptionsTable,
  entitlementAuditTable,
  betaGrantsTable,
} from "@workspace/db";

/** Build a portable copy using only predicates tied to the authenticated owner. */
export async function exportAccount(userId: string) {
  const owned = async <T>(query: PromiseLike<T>) => query;
  const [profile] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId));
  if (!profile) return null;
  const { passwordHash: _secret, ...safeProfile } = profile;
  const [
    morningLogs,
    eveningReports,
    bodyScans,
    habits,
    habitEntries,
    chats,
    medications,
    medicationLogs,
    medicationSchedules,
    dailyUsage,
    reminderSettings,
    reminderDeliveries,
    calendarConnections,
    subscriptions,
    entitlementAudit,
    betaGrants,
  ] = await Promise.all([
    owned(
      db
        .select()
        .from(morningLogsTable)
        .where(eq(morningLogsTable.userId, userId)),
    ),
    owned(
      db
        .select()
        .from(eveningReportsTable)
        .where(eq(eveningReportsTable.userId, userId)),
    ),
    owned(
      db.select().from(bodyScansTable).where(eq(bodyScansTable.userId, userId)),
    ),
    owned(db.select().from(habitsTable).where(eq(habitsTable.userId, userId))),
    owned(
      db
        .select()
        .from(habitEntriesTable)
        .where(eq(habitEntriesTable.userId, userId)),
    ),
    owned(
      db.select().from(conversations).where(eq(conversations.userId, userId)),
    ),
    owned(
      db
        .select()
        .from(medicationsTable)
        .where(eq(medicationsTable.userId, userId)),
    ),
    owned(
      db
        .select()
        .from(medicationLogsTable)
        .where(eq(medicationLogsTable.userId, userId)),
    ),
    owned(
      db
        .select()
        .from(medicationScheduleEntriesTable)
        .where(eq(medicationScheduleEntriesTable.userId, userId)),
    ),
    owned(
      db
        .select()
        .from(dailyUsageTable)
        .where(eq(dailyUsageTable.userId, userId)),
    ),
    owned(
      db
        .select()
        .from(reminderSettingsTable)
        .where(eq(reminderSettingsTable.userId, userId)),
    ),
    owned(
      db
        .select()
        .from(reminderDeliveriesTable)
        .where(eq(reminderDeliveriesTable.userId, userId)),
    ),
    owned(
      db
        .select()
        .from(calendarConnectionsTable)
        .where(eq(calendarConnectionsTable.userId, userId)),
    ),
    owned(
      db
        .select()
        .from(subscriptionsTable)
        .where(eq(subscriptionsTable.userId, userId)),
    ),
    owned(
      db
        .select()
        .from(entitlementAuditTable)
        .where(eq(entitlementAuditTable.userId, userId)),
    ),
    owned(
      db
        .select()
        .from(betaGrantsTable)
        .where(eq(betaGrantsTable.userId, userId)),
    ),
  ]);
  const chatMessages = await db
    .select()
    .from(messages)
    .where(eq(messages.userId, userId));
  return {
    exportedAt: new Date().toISOString(),
    formatVersion: 1,
    profile: safeProfile,
    data: {
      morningLogs,
      eveningReports,
      bodyScans,
      habits,
      habitEntries,
      chats,
      chatMessages,
      medications,
      medicationLogs,
      medicationSchedules,
      dailyUsage,
      reminderSettings,
      reminderDeliveries,
      calendarConnections,
      subscriptions,
      entitlementAudit,
      betaGrants,
    },
  };
}

/** Apply the documented policy for both a user request and identity webhook. */
export async function deleteAccount(userId: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    // Preserve grant/audit integrity without preserving the departing actor's identity.
    await tx
      .update(betaGrantsTable)
      .set({ grantedBy: null })
      .where(eq(betaGrantsTable.grantedBy, userId));
    await tx
      .update(betaGrantsTable)
      .set({ revokedBy: null })
      .where(eq(betaGrantsTable.revokedBy, userId));
    await tx
      .update(entitlementAuditTable)
      .set({ actorId: null })
      .where(eq(entitlementAuditTable.actorId, userId));
    const [deleted] = await tx
      .delete(usersTable)
      .where(eq(usersTable.id, userId))
      .returning({ id: usersTable.id });
    return Boolean(deleted);
  });
}
