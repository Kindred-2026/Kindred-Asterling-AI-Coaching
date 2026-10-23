import {
  vi,
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from "vitest";
import { eq } from "@workspace/db";
import {
  db,
  usersTable,
  reminderSettingsTable,
  reminderDeliveriesTable,
  medicationsTable,
  medicationScheduleEntriesTable,
} from "@workspace/db";

// The scheduler's only external dependencies are the two send libs, which we
// stub so the tests exercise the due/dedup/window logic without network calls.
vi.mock("./twilio", () => ({
  isSmsConfigured: vi.fn(() => true),
  sendSms: vi.fn(async () => true),
}));
vi.mock("./resend", () => ({
  isEmailConfigured: vi.fn(() => true),
  sendEmail: vi.fn(async () => true),
}));

import * as twilio from "./twilio";
import * as resend from "./resend";
import { runReminderTick } from "./reminderScheduler";

const mockSendSms = vi.mocked(twilio.sendSms);
const mockSendEmail = vi.mocked(resend.sendEmail);

const suffix = Math.random().toString(36).slice(2, 10);
const userId = `test-rem-${suffix}`;
const email = `rem-${suffix}@example.test`;

// Use UTC so the user's local "HH:MM" equals the UTC time we pass in `now`.
const TZ = "UTC";

async function setSettings(
  over: Partial<typeof reminderSettingsTable.$inferInsert>,
) {
  await db
    .insert(reminderSettingsTable)
    .values({ userId, ...over })
    .onConflictDoUpdate({ target: reminderSettingsTable.userId, set: over });
}

async function deliveryCount(): Promise<number> {
  const rows = await db
    .select({ id: reminderDeliveriesTable.id })
    .from(reminderDeliveriesTable)
    .where(eq(reminderDeliveriesTable.userId, userId));
  return rows.length;
}

beforeAll(async () => {
  await db
    .insert(usersTable)
    .values({ id: userId, email, firstName: "Test", phone: "+15551234567", timezone: TZ })
    .onConflictDoNothing({ target: usersTable.id });
});

afterAll(async () => {
  await db.delete(usersTable).where(eq(usersTable.id, userId));
});

beforeEach(async () => {
  vi.clearAllMocks();
  mockSendSms.mockResolvedValue(true);
  mockSendEmail.mockResolvedValue(true);
  await db
    .delete(reminderDeliveriesTable)
    .where(eq(reminderDeliveriesTable.userId, userId));
});

describe("runReminderTick", () => {
  it("sends a morning reminder over both channels exactly once and dedupes on re-run", async () => {
    await setSettings({
      morningEnabled: true,
      morningTime: "08:00",
      eveningEnabled: false,
      medicationEnabled: false,
      smsEnabled: true,
      emailEnabled: true,
    });
    const now = new Date("2026-06-26T08:00:00Z");

    await runReminderTick(now);
    expect(mockSendSms).toHaveBeenCalledTimes(1);
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    expect(await deliveryCount()).toBe(2); // one ledger row per channel

    // Re-running the same minute must not re-send.
    await runReminderTick(now);
    expect(mockSendSms).toHaveBeenCalledTimes(1);
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    expect(await deliveryCount()).toBe(2);
  });

  it("fires within the catch-up window when a tick is late, but not outside it", async () => {
    await setSettings({
      morningEnabled: true,
      morningTime: "08:00",
      eveningEnabled: false,
      medicationEnabled: false,
      smsEnabled: false,
      emailEnabled: true,
    });

    // 5 minutes late — still inside the 10-minute window.
    await runReminderTick(new Date("2026-06-26T08:05:00Z"));
    expect(mockSendEmail).toHaveBeenCalledTimes(1);

    // Next day, 11 minutes late — outside the window, so it must not fire.
    vi.clearAllMocks();
    await runReminderTick(new Date("2026-06-27T08:11:00Z"));
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("releases the reservation when a send fails so a later tick can retry", async () => {
    await setSettings({
      morningEnabled: true,
      morningTime: "08:00",
      eveningEnabled: false,
      medicationEnabled: false,
      smsEnabled: false,
      emailEnabled: true,
    });

    // First attempt: send fails -> no ledger row should remain.
    mockSendEmail.mockResolvedValueOnce(false);
    await runReminderTick(new Date("2026-06-26T08:00:00Z"));
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    expect(await deliveryCount()).toBe(0);

    // Retry within the window now succeeds and records the delivery.
    await runReminderTick(new Date("2026-06-26T08:03:00Z"));
    expect(mockSendEmail).toHaveBeenCalledTimes(2);
    expect(await deliveryCount()).toBe(1);
  });

  it("does not send when the user's local time hasn't reached the scheduled time", async () => {
    await setSettings({
      morningEnabled: true,
      morningTime: "08:00",
      eveningEnabled: false,
      medicationEnabled: false,
      smsEnabled: false,
      emailEnabled: true,
    });
    await runReminderTick(new Date("2026-06-26T07:55:00Z"));
    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(await deliveryCount()).toBe(0);
  });

  it("skips channels with no destination or disabled", async () => {
    await setSettings({
      morningEnabled: true,
      morningTime: "08:00",
      eveningEnabled: false,
      medicationEnabled: false,
      smsEnabled: true,
      emailEnabled: false,
    });
    // User has a phone, so SMS should go out and email should not.
    await runReminderTick(new Date("2026-06-26T08:00:00Z"));
    expect(mockSendSms).toHaveBeenCalledTimes(1);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  describe("across midnight", () => {
    const eveningOnly = {
      morningEnabled: false,
      eveningEnabled: true,
      eveningTime: "23:59",
      medicationEnabled: false,
      smsEnabled: false,
      emailEnabled: true,
    };

    async function ledgerDates(): Promise<string[]> {
      const rows = await db
        .select()
        .from(reminderDeliveriesTable)
        .where(eq(reminderDeliveriesTable.userId, userId));
      return rows.map((r) => r.localDate).sort();
    }

    it("catches up a late-evening reminder just after midnight, dated to its own day", async () => {
      await setSettings(eveningOnly);
      // The 23:59 tick was missed; 00:01 is still inside the window.
      await runReminderTick(new Date("2026-06-27T00:01:00Z"));
      expect(mockSendEmail).toHaveBeenCalledTimes(1);
      expect(await ledgerDates()).toEqual(["2026-06-26"]);

      // Tonight's 23:59 is a separate occurrence and still goes out.
      await runReminderTick(new Date("2026-06-27T23:59:00Z"));
      expect(mockSendEmail).toHaveBeenCalledTimes(2);
      expect(await ledgerDates()).toEqual(["2026-06-26", "2026-06-27"]);
    });

    it("does not resend after midnight when the on-time tick already delivered", async () => {
      await setSettings(eveningOnly);
      await runReminderTick(new Date("2026-06-26T23:59:00Z"));
      await runReminderTick(new Date("2026-06-27T00:03:00Z"));
      expect(mockSendEmail).toHaveBeenCalledTimes(1);
    });

    it("still ignores occurrences outside the window after midnight", async () => {
      await setSettings({ ...eveningOnly, eveningTime: "23:50" });
      await runReminderTick(new Date("2026-06-27T00:01:00Z")); // 11 minutes late
      expect(mockSendEmail).not.toHaveBeenCalled();
    });

    it("uses the occurrence's own day for medication schedule bounds", async () => {
      await setSettings({ ...eveningOnly, eveningEnabled: false, medicationEnabled: true });
      const [med] = await db
        .insert(medicationsTable)
        .values({ userId, name: "Melatonin", dosage: "1mg", times: ["23:59"] })
        .returning();
      try {
        // Schedule starts on the 27th, so the 26th's 23:59 dose never existed.
        await db.insert(medicationScheduleEntriesTable).values({
          medicationId: med!.id,
          userId,
          scheduledTime: "23:59",
          startDate: "2026-06-27",
          endDate: null,
        });
        await runReminderTick(new Date("2026-06-27T00:01:00Z"));
        expect(mockSendEmail).not.toHaveBeenCalled();

        // Starting on the 26th, the caught-up dose is due and dated the 26th.
        await db
          .update(medicationScheduleEntriesTable)
          .set({ startDate: "2026-06-26" })
          .where(eq(medicationScheduleEntriesTable.medicationId, med!.id));
        await runReminderTick(new Date("2026-06-27T00:02:00Z"));
        expect(mockSendEmail).toHaveBeenCalledTimes(1);
        expect(await ledgerDates()).toEqual(["2026-06-26"]);
      } finally {
        await db.delete(medicationsTable).where(eq(medicationsTable.id, med!.id));
      }
    });
  });
});
