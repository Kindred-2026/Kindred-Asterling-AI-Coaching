import { Router, type IRouter } from "express";
import { and, asc, eq, gte, lte, or, isNull } from "@workspace/db";
import {
  db,
  medicationsTable,
  medicationLogsTable,
  medicationScheduleEntriesTable,
} from "@workspace/db";
import {
  CreateMedicationBody,
  UpdateMedicationBody,
  LogMedicationTakenBody,
  UnlogMedicationTakenBody,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";
import { normalizeTimes } from "../lib/medicationSchedule";
import {
  createMedicationTx,
  updateMedicationTx,
  deleteMedicationTx,
  logDoseTx,
} from "../lib/medicationWrites";

const router: IRouter = Router();

// Largest valid UTC offset is ±14h; clamp anything outside that (and NaN → 0)
// so a malformed client value can't shift the day by an absurd amount.
function normalizeTzOffset(raw: unknown): number {
  const n =
    typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
  if (!Number.isFinite(n)) return 0;
  const i = Math.trunc(n);
  return Math.max(-840, Math.min(840, i));
}

// JS Date.getTimezoneOffset() returns (UTC - local) in minutes, so subtracting
// it from a UTC instant yields that instant's local wall-clock. We then read the
// calendar day off the shifted instant via toISOString(). This gives one
// consistent "local day" notion used both when recording and reporting doses.
function localDateStr(instant: Date, tzOffsetMinutes: number): string {
  const local = new Date(instant.getTime() - tzOffsetMinutes * 60_000);
  return local.toISOString().split("T")[0];
}

function todayDateStr(tzOffsetMinutes = 0): string {
  return localDateStr(new Date(), tzOffsetMinutes);
}

function sevenDayWindowStartDateStr(tzOffsetMinutes: number): string {
  // Inclusive 7-day window: today and the previous 6 days, in local time.
  const local = new Date(Date.now() - tzOffsetMinutes * 60_000);
  local.setUTCDate(local.getUTCDate() - 6);
  return local.toISOString().split("T")[0];
}

function lastSevenDays(tzOffsetMinutes: number): string[] {
  // Oldest first: [today-6 ... today], in local time.
  const days: string[] = [];
  const base = new Date(Date.now() - tzOffsetMinutes * 60_000);
  for (let i = 6; i >= 0; i--) {
    const d = new Date(base);
    d.setUTCDate(d.getUTCDate() - i);
    days.push(d.toISOString().split("T")[0]);
  }
  return days;
}

function parseId(raw: string | string[] | undefined): number | null {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (v === undefined) return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

router.get("/medications", requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.id;
  const tzOffset = normalizeTzOffset(req.query.tzOffset);
  const meds = await db
    .select()
    .from(medicationsTable)
    .where(eq(medicationsTable.userId, userId))
    .orderBy(asc(medicationsTable.name))
    .limit(100);

  const today = todayDateStr(tzOffset);
  const todays = await db
    .select()
    .from(medicationLogsTable)
    .where(
      and(
        eq(medicationLogsTable.userId, userId),
        eq(medicationLogsTable.date, today),
      ),
    );
  // Map keyed by `${medicationId}|${scheduledTime}` → today's log for that dose.
  const todayMap = new Map<
    string,
    { takenAt: string; effectiveness: number | null }
  >();
  for (const l of todays) {
    todayMap.set(`${l.medicationId}|${l.scheduledTime}`, {
      takenAt: new Date(l.takenAt).toISOString(),
      effectiveness: l.effectiveness ?? null,
    });
  }

  const sinceDate = sevenDayWindowStartDateStr(tzOffset);
  const recent = await db
    .select()
    .from(medicationLogsTable)
    .where(
      and(
        eq(medicationLogsTable.userId, userId),
        gte(medicationLogsTable.date, sinceDate),
      ),
    );
  const recentMap = new Map<number, { avg: number | null; cnt: number }>();
  const valuesByMedication = new Map<number, number[]>();
  for (const log of recent) {
    if (log.effectiveness === null) continue;
    const values = valuesByMedication.get(log.medicationId) ?? [];
    values.push(log.effectiveness);
    valuesByMedication.set(log.medicationId, values);
  }
  for (const [medicationId, values] of valuesByMedication) {
    const average =
      values.reduce((sum, value) => sum + value, 0) / values.length;
    recentMap.set(medicationId, {
      avg: Math.round(average * 10) / 10,
      cnt: values.length,
    });
  }

  const result = meds.map((m) => {
    const times = normalizeTimes(m.times);
    const r = recentMap.get(m.id) ?? { avg: null, cnt: 0 };
    const doses = times.map((scheduledTime) => {
      const t = todayMap.get(`${m.id}|${scheduledTime}`) ?? null;
      return {
        scheduledTime,
        takenAt: t?.takenAt ?? null,
        effectiveness: t?.effectiveness ?? null,
      };
    });
    return {
      ...JSON.parse(JSON.stringify(m)),
      times,
      doses,
      recentEffectivenessAvg: r.avg,
      recentEffectivenessCount: r.cnt,
    };
  });
  res.json(result);
});

router.get(
  "/medications/weekly-report",
  requireAuth,
  async (req, res): Promise<void> => {
    const userId = req.user!.id;
    const tzOffset = normalizeTzOffset(req.query.tzOffset);
    const meds = await db
      .select()
      .from(medicationsTable)
      .where(eq(medicationsTable.userId, userId))
      .orderBy(asc(medicationsTable.name));

    const sinceDate = sevenDayWindowStartDateStr(tzOffset);
    const logs = await db
      .select()
      .from(medicationLogsTable)
      .where(
        and(
          eq(medicationLogsTable.userId, userId),
          gte(medicationLogsTable.date, sinceDate),
        ),
      );

    // Only fetch schedule entries that overlap the 7-day reporting window.
    // An entry overlaps if it started at or before today AND it either has no
    // end date (still active) or ended on/after the window start (endDate is
    // exclusive, so endDate >= sinceDate means in effect on at least one day).
    const today = todayDateStr(tzOffset);
    const scheduleEntries = await db
      .select()
      .from(medicationScheduleEntriesTable)
      .where(
        and(
          eq(medicationScheduleEntriesTable.userId, userId),
          lte(medicationScheduleEntriesTable.startDate, today),
          or(
            isNull(medicationScheduleEntriesTable.endDate),
            gte(medicationScheduleEntriesTable.endDate, sinceDate),
          ),
        ),
      );
    const scheduleByMed = new Map<
      number,
      { scheduledTime: string; startDate: string; endDate: string | null }[]
    >();
    for (const e of scheduleEntries) {
      const list = scheduleByMed.get(e.medicationId) ?? [];
      list.push({
        scheduledTime: e.scheduledTime,
        startDate:
          typeof e.startDate === "string" ? e.startDate : String(e.startDate),
        endDate:
          e.endDate === null
            ? null
            : typeof e.endDate === "string"
              ? e.endDate
              : String(e.endDate),
      });
      scheduleByMed.set(e.medicationId, list);
    }

    res.json({
      days: lastSevenDays(tzOffset),
      medications: meds.map((m) => ({
        id: m.id,
        name: m.name,
        dosage: m.dosage,
        schedule: scheduleByMed.get(m.id) ?? [],
        createdDate: localDateStr(new Date(m.createdAt), tzOffset),
      })),
      logs: logs.map((l) => ({
        medicationId: l.medicationId,
        date: typeof l.date === "string" ? l.date : String(l.date),
        scheduledTime: l.scheduledTime,
        takenAt: new Date(l.takenAt).toISOString(),
        effectiveness: l.effectiveness ?? null,
      })),
    });
  },
);

router.post("/medications", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateMedicationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const userId = req.user!.id;
  const times = normalizeTimes(parsed.data.times);
  const created = await createMedicationTx(
    userId,
    {
      name: parsed.data.name.trim(),
      dosage: parsed.data.dosage.trim(),
      times,
      notes: parsed.data.notes ?? null,
    },
    todayDateStr(),
  );
  res.status(201).json(JSON.parse(JSON.stringify(created)));
});

router.patch(
  "/medications/:id",
  requireAuth,
  async (req, res): Promise<void> => {
    const id = parseId(req.params.id);
    if (id === null) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const parsed = UpdateMedicationBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const userId = req.user!.id;
    const times = normalizeTimes(parsed.data.times);
    const updated = await updateMedicationTx(
      id,
      userId,
      {
        name: parsed.data.name.trim(),
        dosage: parsed.data.dosage.trim(),
        times,
        notes: parsed.data.notes ?? null,
      },
      todayDateStr(),
    );
    if (!updated) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(JSON.parse(JSON.stringify(updated)));
  },
);

router.delete(
  "/medications/:id",
  requireAuth,
  async (req, res): Promise<void> => {
    const id = parseId(req.params.id);
    if (id === null) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const userId = req.user!.id;
    const deleted = await deleteMedicationTx(id, userId);
    if (!deleted) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.sendStatus(204);
  },
);

router.post(
  "/medications/:id/log",
  requireAuth,
  async (req, res): Promise<void> => {
    const id = parseId(req.params.id);
    if (id === null) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const parsed = LogMedicationTakenBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const scheduledTime = parsed.data.scheduledTime;
    const effectiveness = parsed.data.effectiveness ?? null;
    const tzOffset = normalizeTzOffset(parsed.data.tzOffset);

    const userId = req.user!.id;
    const today = todayDateStr(tzOffset);
    const result = await logDoseTx(id, userId, {
      date: today,
      scheduledTime,
      effectiveness,
    });
    if (!result) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.status(201).json(JSON.parse(JSON.stringify(result)));
  },
);

router.delete(
  "/medications/:id/log",
  requireAuth,
  async (req, res): Promise<void> => {
    const id = parseId(req.params.id);
    if (id === null) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const parsed = UnlogMedicationTakenBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const userId = req.user!.id;
    const today = todayDateStr(normalizeTzOffset(parsed.data.tzOffset));
    const [removed] = await db
      .delete(medicationLogsTable)
      .where(
        and(
          eq(medicationLogsTable.medicationId, id),
          eq(medicationLogsTable.userId, userId),
          eq(medicationLogsTable.date, today),
          eq(medicationLogsTable.scheduledTime, parsed.data.scheduledTime),
        ),
      )
      .returning();
    if (!removed) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.sendStatus(204);
  },
);

export default router;
