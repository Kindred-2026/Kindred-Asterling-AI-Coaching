import { Router, type IRouter } from "express";
import { eq } from "@workspace/db";
import { db, reminderSettingsTable, usersTable } from "@workspace/db";
import {
  GetReminderSettingsResponse,
  UpdateReminderSettingsBody,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

// Returns the user's reminder settings, creating a default row on first access
// so the rest of the app can always assume a row exists.
async function getOrCreateSettings(userId: string) {
  const [existing] = await db
    .select()
    .from(reminderSettingsTable)
    .where(eq(reminderSettingsTable.userId, userId));
  if (existing) return existing;
  const [created] = await db
    .insert(reminderSettingsTable)
    .values({ userId })
    .onConflictDoNothing({ target: reminderSettingsTable.userId })
    .returning();
  if (created) return created;
  // Lost the insert race — read the row the other request created.
  const [row] = await db
    .select()
    .from(reminderSettingsTable)
    .where(eq(reminderSettingsTable.userId, userId));
  return row;
}

router.get(
  "/reminder-settings",
  requireAuth,
  async (req, res): Promise<void> => {
    const row = await getOrCreateSettings(req.user!.id);
    res.json(
      GetReminderSettingsResponse.parse(JSON.parse(JSON.stringify(row))),
    );
  },
);

router.patch(
  "/reminder-settings",
  requireAuth,
  async (req, res): Promise<void> => {
    const parsed = UpdateReminderSettingsBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid reminder settings" });
      return;
    }
    const userId = req.user!.id;
    const current = await getOrCreateSettings(userId);

    const data = parsed.data;
    // Text reminders can't be delivered without a phone number. Only check a
    // request that touches SMS or the phone, so an older row in that state
    // doesn't block unrelated edits.
    if (data.smsEnabled !== undefined || data.phone !== undefined) {
      const smsEnabled = data.smsEnabled ?? current?.smsEnabled ?? false;
      let phone = data.phone;
      if (phone === undefined) {
        const [user] = await db
          .select({ phone: usersTable.phone })
          .from(usersTable)
          .where(eq(usersTable.id, userId))
          .limit(1);
        phone = user?.phone ?? null;
      }
      if (smsEnabled && !phone?.trim()) {
        res
          .status(400)
          .json({ error: "Add a phone number to turn on text reminders" });
        return;
      }
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (data.morningEnabled !== undefined)
      updates.morningEnabled = data.morningEnabled;
    if (data.morningTime !== undefined) updates.morningTime = data.morningTime;
    if (data.medicationEnabled !== undefined)
      updates.medicationEnabled = data.medicationEnabled;
    if (data.eveningEnabled !== undefined)
      updates.eveningEnabled = data.eveningEnabled;
    if (data.eveningTime !== undefined) updates.eveningTime = data.eveningTime;
    if (data.smsEnabled !== undefined) updates.smsEnabled = data.smsEnabled;
    if (data.emailEnabled !== undefined)
      updates.emailEnabled = data.emailEnabled;

    // phone + timezone live on the user profile but are edited from the same
    // Reminders form, so we persist all of it in one transaction — either the
    // whole save succeeds or none of it does (no partial saved state).
    const userUpdates: Record<string, unknown> = {};
    if (data.phone !== undefined) userUpdates.phone = data.phone;
    if (data.timezone !== undefined) userUpdates.timezone = data.timezone;

    const updated = await db.transaction(async (tx) => {
      if (Object.keys(userUpdates).length > 0) {
        await tx
          .update(usersTable)
          .set(userUpdates)
          .where(eq(usersTable.id, userId));
      }
      const [row] = await tx
        .update(reminderSettingsTable)
        .set(updates)
        .where(eq(reminderSettingsTable.userId, userId))
        .returning();
      return row;
    });

    res.json(
      GetReminderSettingsResponse.parse(JSON.parse(JSON.stringify(updated))),
    );
  },
);

export default router;
