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
  subscriptionsTable,
  entitlementAuditTable,
  betaGrantsTable,
} from "@workspace/db";
import { cancelHelcimSubscription, isHelcimConfigured } from "./helcimClient";
import {
  deleteAuth0User,
  isAuth0ManagementConfigured,
} from "./auth0Management";
import {
  planAmplitudeDeletion,
  sendAmplitudeDeletion,
} from "./amplitudeDeletion";
import { logger } from "./logger";
import { withRetries } from "./retry";

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
      subscriptions,
      entitlementAudit,
      betaGrants,
    },
  };
}

/** Billing already stopped at Helcim; nothing to cancel. */
const BILLING_STOPPED = new Set(["cancelled", "expired"]);

/**
 * Deletion was refused because a recurring Helcim subscription could not be
 * cancelled. Nothing was deleted, so the user is never left billed for an
 * account that no longer exists.
 */
export class AccountDeletionBlockedError extends Error {
  constructor() {
    super(
      "The Yearly subscription could not be cancelled, so the account was not deleted.",
    );
    this.name = "AccountDeletionBlockedError";
  }
}

async function stopRecurringBilling(userId: string): Promise<void> {
  const [subscription] = await db
    .select()
    .from(subscriptionsTable)
    .where(eq(subscriptionsTable.userId, userId))
    .limit(1);
  const subscriptionId = subscription?.paymentSubscriptionId;
  if (
    !subscription ||
    !subscriptionId ||
    BILLING_STOPPED.has(subscription.status ?? "")
  )
    return;
  if (!isHelcimConfigured()) {
    logger.error(
      { userId },
      "Account deletion blocked: HELCIM_API_KEY is not set, so the Helcim subscription cannot be cancelled",
    );
    throw new AccountDeletionBlockedError();
  }
  let outcome: Awaited<ReturnType<typeof cancelHelcimSubscription>>;
  try {
    outcome = await withRetries(
      () =>
        cancelHelcimSubscription(
          subscriptionId,
          subscription.paymentCustomerId,
        ),
      "Helcim subscription cancellation",
      { userId },
    );
  } catch (err) {
    logger.error(
      { err, userId },
      "Account deletion blocked: the Helcim subscription could not be cancelled",
    );
    throw new AccountDeletionBlockedError();
  }
  if (outcome === "not_customer_subscription") {
    logger.warn(
      { userId },
      "Account deletion: the stored Helcim ID is not this customer's subscription; nothing to cancel",
    );
    return;
  }
  logger.info({ userId, outcome }, "Account deletion: Helcim renewal stopped");
  // If the database step then fails, the surviving account must not still
  // look renewable.
  const paidThrough = subscription.currentPeriodEnd;
  await db
    .update(subscriptionsTable)
    .set({
      status:
        paidThrough && paidThrough.getTime() > Date.now()
          ? "cancel_at_period_end"
          : "cancelled",
      lastCheckedAt: new Date(),
    })
    .where(eq(subscriptionsTable.userId, userId));
}

/**
 * Best-effort erasure at Auth0 and Amplitude once the account is gone. Never
 * throws: a provider that still fails after retries is logged for manual
 * follow-up, which the Privacy Policy commits to within 30 days.
 */
async function eraseExternalRecords(user: {
  id: string;
  auth0UserId: string | null;
}): Promise<void> {
  const followUp = "manual follow-up required within 30 days";
  const auth0 = async () => {
    if (!user.auth0UserId) return;
    if (!isAuth0ManagementConfigured()) {
      logger.error(
        { userId: user.id, auth0UserId: user.auth0UserId },
        `Account deletion: Auth0 Management API is not configured; ${followUp}`,
      );
      return;
    }
    try {
      const outcome = await withRetries(
        () => deleteAuth0User(user.auth0UserId!),
        "Auth0 user deletion",
        { userId: user.id },
      );
      logger.info({ userId: user.id, outcome }, "Account deletion: Auth0 user removed");
    } catch (err) {
      logger.error(
        { err, userId: user.id, auth0UserId: user.auth0UserId },
        `Account deletion: Auth0 user could not be deleted; ${followUp}`,
      );
    }
  };
  const amplitude = async () => {
    const plan = planAmplitudeDeletion(user.id);
    if (plan.missingSecrets.length > 0) {
      logger.error(
        { userId: user.id, missing: plan.missingSecrets },
        `Account deletion: Amplitude secret key not set; ${followUp}`,
      );
    }
    await Promise.all(
      plan.requests.map(async (request) => {
        try {
          await withRetries(
            () => sendAmplitudeDeletion(request),
            "Amplitude deletion request",
            { userId: user.id, project: request.project },
          );
          logger.info(
            { userId: user.id, project: request.project },
            "Account deletion: Amplitude deletion requested",
          );
        } catch (err) {
          logger.error(
            { err, userId: user.id, project: request.project },
            `Account deletion: Amplitude deletion request failed; ${followUp}`,
          );
        }
      }),
    );
  };
  await Promise.all([auth0(), amplitude()]);
}

/**
 * Deletes the account everywhere it lives. Order matters: recurring billing
 * is cancelled first and blocks deletion if it fails (AccountDeletionBlockedError);
 * then the database rows go; then Auth0 and Amplitude, best-effort.
 */
export async function deleteAccount(userId: string): Promise<boolean> {
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  if (!user) return false;
  await stopRecurringBilling(userId);
  const deleted = await db.transaction(async (tx) => {
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
  if (!deleted) return false;
  await eraseExternalRecords({ id: user.id, auth0UserId: user.auth0UserId });
  return true;
}
