import * as Sentry from "@sentry/node";
import cron, { type ScheduledTask } from "node-cron";
import { and, eq, isNull, lte, or, gt, inArray } from "@workspace/db";
import {
  db,
  usersTable,
  reminderSettingsTable,
  reminderDeliveriesTable,
  medicationsTable,
  medicationScheduleEntriesTable,
} from "@workspace/db";
import { logger } from "./logger";
import { isSmsConfigured, sendSms } from "./twilio";
import { isEmailConfigured, sendEmail } from "./resend";

const DEFAULT_TZ = "America/New_York";

// Catch-up window (minutes). A reminder fires on the first tick at or after its
// scheduled local time, up to this many minutes late. This makes delivery robust
// to a slow/skipped tick (e.g. a tick that runs >60s) without firing stale
// reminders after long downtime. The deliveries ledger guarantees once-only.
const WINDOW_MIN = 10;

type ReminderType = "morning" | "evening" | "medication";

// Minutes-since-midnight for an "HH:MM" local time, or null if malformed.
function hmToMin(hm: string): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(hm);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

// Which local day's occurrence of `scheduledMin` is due within the catch-up
// window ending at `nowMin`: 0 for today, -1 for yesterday (a late-evening time
// caught up just after midnight), or null when nothing is due. The occurrence's
// day keys the deliveries ledger, so yesterday's 23:59 caught up at 00:01 never
// collides with tonight's 23:59.
function dueDayOffset(scheduledMin: number, nowMin: number): 0 | -1 | null {
  const delta = nowMin - scheduledMin;
  if (delta >= 0 && delta <= WINDOW_MIN) return 0;
  if (delta < 0 && delta + 24 * 60 <= WINDOW_MIN) return -1;
  return null;
}

// The local calendar day before `date` ("YYYY-MM-DD").
function previousDate(date: string): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().split("T")[0];
}

interface DueReminder {
  type: ReminderType;
  // For medication, the dose "HH:MM"; otherwise "" (matches the deliveries ledger
  // default so dedup works for morning/evening too).
  doseTime: string;
  // Human text describing what's due (e.g. medication names), used in messages.
  detail?: string;
  // The local day this occurrence belongs to (keys the deliveries ledger).
  localDate: string;
}

// Compute the user's local "HH:MM" and "YYYY-MM-DD" in their timezone.
function localParts(timezone: string, now: Date): { hm: string; date: string } {
  let tz = timezone;
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: tz });
  } catch {
    tz = DEFAULT_TZ;
  }
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now); // "HH:MM"
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now); // "YYYY-MM-DD"
  // en-GB can emit "24:00" at midnight on some runtimes; normalize to "00:00".
  return { hm: time === "24:00" ? "00:00" : time, date };
}

function appUrl(path: string): string {
  const base =
    process.env.APP_PUBLIC_URL ||
    (process.env.REPLIT_DOMAINS ? `https://${process.env.REPLIT_DOMAINS.split(",")[0]}` : "");
  if (!base) return "";
  return `${base.replace(/\/$/, "")}${path}`;
}

function greeting(name: string | null): string {
  return name ? `, ${name}` : "";
}

function buildMessage(due: DueReminder, name: string | null): { subject: string; text: string } {
  const hi = greeting(name);
  if (due.type === "morning") {
    const link = appUrl("/app/morning");
    return {
      subject: "Your morning check-in with Kindred",
      text: `Good morning${hi}. This is Kindred — a gentle nudge to check in with your morning mental-load when you have a moment.${link ? `\n\n${link}` : ""}`,
    };
  }
  if (due.type === "evening") {
    const link = appUrl("/app/evening");
    return {
      subject: "Time to wind down with Kindred",
      text: `Hi${hi}, it's Kindred. Time to wind down — your evening reflection is here whenever you're ready.${link ? `\n\n${link}` : ""}`,
    };
  }
  const link = appUrl("/app/medications");
  return {
    subject: "Medication reminder from Kindred",
    text: `Hi${hi}, it's Kindred. Time for your medication dose (${due.doseTime}). Open Kindred for details.${link ? `\n\n${link}` : ""}`,
  };
}

type Dose = { doseTime: string; names: string[]; localDate: string };

// Find medication doses whose schedule is active today and whose scheduled time
// is due within the catch-up window ending at `nowMin`. Returns one entry per
// distinct dose time, with the distinct medication names due at that time.
// Kept for tests or external callers, but we avoid N+1 by batching in runReminderTick
async function medsDueInWindow(
  userId: string,
  localDate: string,
  nowMin: number,
): Promise<Array<Dose>> {
  const schedules = await db
    .select()
    .from(medicationScheduleEntriesTable)
    .where(
      and(
        eq(medicationScheduleEntriesTable.userId, userId),
        lte(medicationScheduleEntriesTable.startDate, localDate),
        or(
          isNull(medicationScheduleEntriesTable.endDate),
          gt(medicationScheduleEntriesTable.endDate, localDate),
        ),
      ),
    );
  const medicationIds = [...new Set(schedules.map((row) => row.medicationId))];
  const medications = medicationIds.length
    ? await db
        .select()
        .from(medicationsTable)
        .where(
          and(eq(medicationsTable.userId, userId), inArray(medicationsTable.id, medicationIds)),
        )
    : [];
  const namesById = new Map(medications.map((row) => [row.id, row.name]));

  const byTime = new Map<string, Set<string>>();
  for (const r of schedules) {
    const name = namesById.get(r.medicationId);
    if (!name) continue;
    const sMin = hmToMin(r.scheduledTime);
    if (sMin === null || dueDayOffset(sMin, nowMin) !== 0) continue;
    const set = byTime.get(r.scheduledTime) ?? new Set<string>();
    set.add(name);
    byTime.set(r.scheduledTime, set);
  }
  return Array.from(byTime.entries()).map(([doseTime, names]) => ({
    doseTime,
    names: Array.from(names),
    localDate,
  }));
}

// Try to send one reminder over one channel exactly once. To be atomic against
// overlapping ticks (or multiple processes), we *reserve* the deliveries-ledger
// document first via an atomic unique-key insert: if no row comes back we lost
// the race (already sent/reserved) and bail. Only the winner sends.
// If the send fails we release the reservation so a later tick (still inside the
// catch-up window) can retry instead of marking it permanently done.
async function deliverOnce(
  userId: string,
  due: DueReminder,
  localDate: string,
  channel: "sms" | "email",
  destination: string,
  name: string | null,
): Promise<void> {
  const reserved = await db
    .insert(reminderDeliveriesTable)
    .values({
      userId,
      type: due.type,
      doseTime: due.doseTime,
      localDate,
      channel,
    })
    .onConflictDoNothing({
      target: [
        reminderDeliveriesTable.userId,
        reminderDeliveriesTable.type,
        reminderDeliveriesTable.localDate,
        reminderDeliveriesTable.doseTime,
        reminderDeliveriesTable.channel,
      ],
    })
    .returning({ id: reminderDeliveriesTable.id });
  if (reserved.length === 0) return; // already sent or reserved by another tick

  const { subject, text } = buildMessage(due, name);
  const ok =
    channel === "sms"
      ? await sendSms(destination, text)
      : await sendEmail(destination, subject, text);
  if (!ok) {
    // Release the reservation so it can be retried within the catch-up window.
    await db.delete(reminderDeliveriesTable).where(eq(reminderDeliveriesTable.id, reserved[0]!.id));
    return;
  }
  logger.info({ userId, type: due.type, channel }, "Reminder sent");
}

// Process a single user's due reminders for the current minute.
async function processUser(
  row: {
    userId: string;
    timezone: string | null;
    phone: string | null;
    email: string | null;
    preferredName: string | null;
    firstName: string | null;
    morningEnabled: boolean;
    morningTime: string;
    medicationEnabled: boolean;
    eveningEnabled: boolean;
    eveningTime: string;
    smsEnabled: boolean;
    emailEnabled: boolean;
  },
  now: Date,
  medsDue: Array<Dose> = [],
): Promise<void> {
  const { hm, date } = localParts(row.timezone ?? DEFAULT_TZ, now);
  const nowMin = hmToMin(hm);
  if (nowMin === null) return;
  const name = row.preferredName || row.firstName || null;

  const occurrenceDate = (offset: 0 | -1) => (offset === 0 ? date : previousDate(date));
  const due: DueReminder[] = [];
  const morningMin = hmToMin(row.morningTime);
  const morningDay = morningMin === null ? null : dueDayOffset(morningMin, nowMin);
  if (row.morningEnabled && morningDay !== null)
    due.push({
      type: "morning",
      doseTime: "",
      localDate: occurrenceDate(morningDay),
    });
  const eveningMin = hmToMin(row.eveningTime);
  const eveningDay = eveningMin === null ? null : dueDayOffset(eveningMin, nowMin);
  if (row.eveningEnabled && eveningDay !== null)
    due.push({
      type: "evening",
      doseTime: "",
      localDate: occurrenceDate(eveningDay),
    });
  if (row.medicationEnabled) {
    for (const dose of medsDue)
      due.push({
        type: "medication",
        doseTime: dose.doseTime,
        detail: dose.names.join(", "),
        localDate: dose.localDate,
      });
  }
  if (due.length === 0) return;

  const channels: Array<{ ch: "sms" | "email"; to: string }> = [];
  if (row.smsEnabled && isSmsConfigured() && row.phone) channels.push({ ch: "sms", to: row.phone });
  if (row.emailEnabled && isEmailConfigured() && row.email)
    channels.push({ ch: "email", to: row.email });
  if (channels.length === 0) return;

  const promises: Promise<void>[] = [];
  for (const d of due) {
    for (const c of channels) {
      promises.push(
        deliverOnce(row.userId, d, d.localDate, c.ch, c.to, name).catch((err) => {
          logger.error(
            { err, userId: row.userId, type: d.type, channel: c.ch },
            "Reminder delivery failed",
          );
        }),
      );
    }
  }
  await Promise.allSettled(promises);
}

const REMINDER_BATCH_SIZE = 100;

async function processSettingsBatch(
  settings: Array<typeof reminderSettingsTable.$inferSelect>,
  now: Date,
): Promise<void> {
  const userIds = settings.map((row) => row.userId);
  const users = userIds.length
    ? await db.select().from(usersTable).where(inArray(usersTable.id, userIds))
    : [];
  const usersById = new Map(users.map((row) => [row.id, row]));
  const rows = settings.flatMap((setting) => {
    const user = usersById.get(setting.userId);
    return user
      ? [
          {
            ...setting,
            timezone: user.timezone,
            phone: user.phone,
            preferredName: user.preferredName,
            email: user.email,
            firstName: user.firstName,
          },
        ]
      : [];
  });

  const rowsWithIdentity = rows;

  // Compute local time and catch-up window for each user.
  // Also batch fetch medication schedules to avoid N+1 queries.
  const userTimes = new Map<string, { hm: string; date: string; nowMin: number }>();
  const medUserIds: string[] = [];

  for (const row of rowsWithIdentity) {
    const { hm, date } = localParts(row.timezone ?? DEFAULT_TZ, now);
    const nowMin = hmToMin(hm);
    if (nowMin !== null) {
      userTimes.set(row.userId, { hm, date, nowMin });
      if (row.medicationEnabled) {
        medUserIds.push(row.userId);
      }
    }
  }

  // Batch fetch medications
  const medsByUser = new Map<string, Array<Dose>>();
  if (medUserIds.length > 0) {
    const allSchedules = await db
      .select()
      .from(medicationScheduleEntriesTable)
      .where(inArray(medicationScheduleEntriesTable.userId, medUserIds));
    const medicationIds = [...new Set(allSchedules.map((row) => row.medicationId))];
    const allMedications = medicationIds.length
      ? await db.select().from(medicationsTable).where(inArray(medicationsTable.id, medicationIds))
      : [];
    const medicationsById = new Map(allMedications.map((row) => [row.id, row]));

    // Group by user and check dates/windows in memory
    for (const r of allSchedules) {
      const medication = medicationsById.get(r.medicationId);
      if (!medication || medication.userId !== r.userId) continue;
      const uTime = userTimes.get(r.userId);
      if (!uTime) continue; // Should not happen, but safeguard

      // Apply window check; the occurrence may be yesterday's (just after
      // midnight), and its own day decides whether the schedule was active.
      const sMin = hmToMin(r.scheduledTime);
      const day = sMin === null ? null : dueDayOffset(sMin, uTime.nowMin);
      if (day === null) continue;
      const occurrenceDate = day === 0 ? uTime.date : previousDate(uTime.date);

      // Apply date bounds check
      if (r.startDate > occurrenceDate) continue;
      if (r.endDate !== null && r.endDate <= occurrenceDate) continue;

      // Valid dose
      let userMeds = medsByUser.get(r.userId);
      if (!userMeds) {
        userMeds = [];
        medsByUser.set(r.userId, userMeds);
      }

      let dose = userMeds.find((d) => d.doseTime === r.scheduledTime);
      if (!dose) {
        dose = { doseTime: r.scheduledTime, names: [], localDate: occurrenceDate };
        userMeds.push(dose);
      }
      if (!dose.names.includes(medication.name)) {
        dose.names.push(medication.name);
      }
    }
  }

  for (const row of rowsWithIdentity) {
    const uTime = userTimes.get(row.userId);
    if (!uTime) continue;
    const userMeds = medsByUser.get(row.userId) ?? [];
    await processUser(row, now, userMeds);
  }
}

// Sentry Cron Monitor for the tick. Passing the config creates the monitor
// on the first check-in and keeps it in sync with this code after that. A
// tick longer than the catch-up window means reminders were skipped, so that
// is the max runtime. Check-ins are no-ops when SENTRY_DSN is unset.
export const REMINDER_MONITOR_SLUG = "reminder-tick";
const REMINDER_MONITOR_CONFIG = {
  schedule: { type: "crontab", value: "* * * * *" },
  checkinMargin: 5,
  maxRuntime: WINDOW_MIN,
  timezone: "UTC",
} as const;

let ticking = false;

export async function runReminderTick(now: Date = new Date()): Promise<void> {
  if (ticking) return; // don't overlap if a tick runs long
  ticking = true;
  try {
    // Errors must reach withMonitor so the check-in is marked "error"; they
    // are caught and logged below.
    await Sentry.withMonitor(
      REMINDER_MONITOR_SLUG,
      () => tickReminders(now),
      REMINDER_MONITOR_CONFIG,
    );
  } catch (err) {
    logger.error({ err }, "Reminder tick failed");
  } finally {
    ticking = false;
  }
}

async function tickReminders(now: Date): Promise<void> {
  const enabled = and(
    or(
      eq(reminderSettingsTable.morningEnabled, true),
      eq(reminderSettingsTable.eveningEnabled, true),
      eq(reminderSettingsTable.medicationEnabled, true),
    ),
    or(eq(reminderSettingsTable.smsEnabled, true), eq(reminderSettingsTable.emailEnabled, true)),
  );
  let afterUserId: string | null = null;
  while (true) {
    const settings = await db
      .select()
      .from(reminderSettingsTable)
      .where(afterUserId ? and(enabled, gt(reminderSettingsTable.userId, afterUserId)) : enabled)
      .orderBy(reminderSettingsTable.userId)
      .limit(REMINDER_BATCH_SIZE);
    if (settings.length === 0) break;
    await processSettingsBatch(settings, now);
    if (settings.length < REMINDER_BATCH_SIZE) break;
    afterUserId = settings.at(-1)!.userId;
  }
}

let task: ScheduledTask | null = null;

// True when the once-a-minute scheduler must not run. Normal production
// does not set REMINDER_SCHEDULER_DISABLED, so production scheduling is
// unchanged; the local development launcher sets it to avoid accidental
// background messages during development.
export function reminderSchedulerDisabled(): boolean {
  return process.env.NODE_ENV === "test" || process.env.REMINDER_SCHEDULER_DISABLED === "true";
}

// Start the once-a-minute scheduler. Idempotent. Skips entirely in test.
export function startReminderScheduler(): void {
  if (process.env.NODE_ENV === "test") return;
  if (reminderSchedulerDisabled()) {
    logger.info(
      process.env.REMINDER_SCHEDULER_DISABLED === "true"
        ? "Reminder scheduler suppressed by REMINDER_SCHEDULER_DISABLED"
        : "Reminder scheduler suppressed (test mode)",
    );
    return;
  }
  if (task) return;
  task = cron.schedule("* * * * *", () => {
    void runReminderTick();
  });
  logger.info("Reminder scheduler started (every minute)");
}

export function stopReminderScheduler(): void {
  task?.stop();
  task = null;
  logger.info("Reminder scheduler stopped");
}
