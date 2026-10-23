import { and, desc, eq, gte, inArray } from "@workspace/db";
import {
  db,
  morningLogsTable,
  eveningReportsTable,
  bodyScansTable,
  habitsTable,
  habitEntriesTable,
  medicationsTable,
  medicationLogsTable,
} from "@workspace/db";

const DEFAULT_LIMIT = 7;
const MAX_LIMIT = 30;
// Per-field clip limits for tool outputs. Keeps individual fields from
// bloating a tool result even when the DB contains near-limit stored values.
const TOOL_FIELD_SHORT = 200; // names, dosage, mood strings
const TOOL_FIELD_LONG = 1000; // notes, sensations, wins/challenges
// Streak logic only looks back 90 days, so fetching older entries is waste.
// Cap habits returned to prevent O(N habits × N entries) fan-out queries.
const HABIT_ENTRY_LOOKBACK_DAYS = 90;
const MAX_HABITS = 50;

function clampLimit(n: unknown): number {
  const v =
    typeof n === "number" && Number.isFinite(n) ? Math.floor(n) : DEFAULT_LIMIT;
  return Math.max(1, Math.min(MAX_LIMIT, v));
}

function clipStr(s: string | null | undefined, max: number): string | null {
  if (!s) return null;
  const t = s.trim();
  if (!t) return null;
  return t.length > max ? t.slice(0, max) + "…" : t;
}

function todayDateStr(): string {
  return new Date().toISOString().split("T")[0];
}

// Tool definitions Kindred can call during a chat turn. Every tool is scoped
// server-side to the requesting user (see runChatTool) — the model never gets
// to choose whose data it reads. Outputs deliberately exclude internal row IDs
// so existence of other records can't leak and the prompt stays small.
export const chatTools: Array<{
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}> = [
  {
    name: "get_recent_morning_logs",
    description:
      "Get the user's most recent morning check-ins (mental-load level, mini goals, notes), newest first. Use when the conversation is about how their days have been starting, their mental load, focus, or morning routine.",
    input_schema: {
      type: "object",
      properties: {
        limit: {
          type: "integer",
          description: "How many recent entries to return (1-30, default 7).",
        },
      },
    },
  },
  {
    name: "get_recent_evening_reports",
    description:
      "Get the user's most recent evening reflections (overall mood, wins, challenges, intention for tomorrow, how their medication felt), newest first. Use when the conversation is about how days have been ending, their mood, recent wins or struggles.",
    input_schema: {
      type: "object",
      properties: {
        limit: {
          type: "integer",
          description: "How many recent entries to return (1-30, default 7).",
        },
      },
    },
  },
  {
    name: "get_recent_body_scans",
    description:
      "Get the user's most recent body scans (feelings, energy level 1-10, physical sensations, notes), newest first. Use when the conversation is about how their body feels, energy, pain, tension, or physical symptoms.",
    input_schema: {
      type: "object",
      properties: {
        limit: {
          type: "integer",
          description: "How many recent entries to return (1-30, default 7).",
        },
      },
    },
  },
  {
    name: "get_habits_with_streaks",
    description:
      "Get the user's habits with their current streak, longest streak, and total completed days. Use when the conversation is about their habits, consistency, routines, or progress.",
    input_schema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_medications_status",
    description:
      "Get the user's medications (name, dosage, notes) along with each scheduled dose time and whether that specific dose has been taken today. Medications can have multiple doses per day. Use when the conversation is about their medication, doses, or whether they've taken something today.",
    input_schema: {
      type: "object",
      properties: {},
    },
  },
];

async function getRecentMorningLogs(
  userId: string,
  limit: number,
): Promise<unknown> {
  const rows = await db
    .select()
    .from(morningLogsTable)
    .where(eq(morningLogsTable.userId, userId))
    .orderBy(desc(morningLogsTable.date))
    .limit(limit);
  return rows.map((r) => ({
    date: r.date,
    mentalLoadLevel: r.mentalLoadLevel,
    miniGoals: (r.miniGoals ?? [])
      .map((g) => clipStr(g, TOOL_FIELD_SHORT))
      .filter(Boolean),
    notes: clipStr(r.notes, TOOL_FIELD_LONG),
  }));
}

async function getRecentEveningReports(
  userId: string,
  limit: number,
): Promise<unknown> {
  const rows = await db
    .select()
    .from(eveningReportsTable)
    .where(eq(eveningReportsTable.userId, userId))
    .orderBy(desc(eveningReportsTable.date))
    .limit(limit);
  return rows.map((r) => ({
    date: r.date,
    overallMood: clipStr(r.overallMood, TOOL_FIELD_SHORT),
    wins: clipStr(r.wins, TOOL_FIELD_LONG),
    challenges: clipStr(r.challenges, TOOL_FIELD_LONG),
    tomorrowIntent: clipStr(r.tomorrowIntent, TOOL_FIELD_LONG),
    medicationEffectiveness: r.medicationEffectiveness,
  }));
}

async function getRecentBodyScans(
  userId: string,
  limit: number,
): Promise<unknown> {
  const rows = await db
    .select()
    .from(bodyScansTable)
    .where(eq(bodyScansTable.userId, userId))
    .orderBy(desc(bodyScansTable.scannedAt))
    .limit(limit);
  return rows.map((r) => ({
    scannedAt: new Date(r.scannedAt).toISOString(),
    feelings: (r.feelings ?? [])
      .map((f) => clipStr(f, TOOL_FIELD_SHORT))
      .filter(Boolean),
    energyLevel: r.energyLevel,
    physicalSensations: clipStr(r.physicalSensations, TOOL_FIELD_LONG),
    notes: clipStr(r.notes, TOOL_FIELD_LONG),
  }));
}

async function getHabitsWithStreaks(userId: string): Promise<unknown> {
  // Cap the number of habits to prevent O(N habits × N entries) fan-out.
  const habits = await db
    .select()
    .from(habitsTable)
    .where(eq(habitsTable.userId, userId))
    .limit(MAX_HABITS);

  // Streak math only looks back HABIT_ENTRY_LOOKBACK_DAYS days, so fetching
  // older entries is pure waste. Compute the cutoff date once and reuse it
  // across all per-habit queries so the DB work is bounded regardless of
  // how much history the user has accumulated.
  if (habits.length === 0) {
    return [];
  }

  const today = new Date();
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() - HABIT_ENTRY_LOOKBACK_DAYS);
  const cutoffStr = cutoff.toISOString().split("T")[0];

  const habitIds = habits.map((h) => h.id);

  const allEntries = await db
    .select()
    .from(habitEntriesTable)
    .where(
      and(
        eq(habitEntriesTable.userId, userId),
        inArray(habitEntriesTable.habitId, habitIds),
        eq(habitEntriesTable.completed, true),
        gte(habitEntriesTable.date, cutoffStr),
      ),
    )
    .orderBy(desc(habitEntriesTable.date));

  const entriesByHabit = new Map<number, typeof allEntries>();
  for (const entry of allEntries) {
    let entries = entriesByHabit.get(entry.habitId);
    if (!entries) {
      entries = [];
      entriesByHabit.set(entry.habitId, entries);
    }
    entries.push(entry);
  }

  return habits.map((habit) => {
    // Limit to HABIT_ENTRY_LOOKBACK_DAYS just like the original logic
    const entries = (entriesByHabit.get(habit.id) || []).slice(
      0,
      HABIT_ENTRY_LOOKBACK_DAYS,
    );

    // Mirror the streak math used by the dashboard so the AI and the UI
    // always agree on the numbers.
    let currentStreak = 0;
    let longestStreak = 0;
    let tempStreak = 0;
    let counting = true;
    const completedDates = entries.map((e) => e.date);
    for (let i = 0; i < HABIT_ENTRY_LOOKBACK_DAYS; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const ds = d.toISOString().split("T")[0];
      if (completedDates.includes(ds)) {
        if (counting && (i === 0 || i === 1 || currentStreak > 0)) currentStreak++;
        tempStreak++;
        if (tempStreak > longestStreak) longestStreak = tempStreak;
      } else {
        if (i > 0 && currentStreak > 0) counting = false;
        tempStreak = 0;
      }
    }

    return {
      name: clipStr(habit.name, TOOL_FIELD_SHORT),
      description: clipStr(habit.description, TOOL_FIELD_LONG),
      targetDays: habit.targetDays,
      currentStreak,
      longestStreak,
      completedCount: entries.length,
    };
  });
}

// Cap medications read for chat use so query + serialization work is bounded
// before truncation. A normal user won't hit this limit; it only blocks abuse.
const MAX_CHAT_MEDICATIONS = 50;

async function getMedicationsStatus(userId: string): Promise<unknown> {
  const meds = await db
    .select()
    .from(medicationsTable)
    .where(eq(medicationsTable.userId, userId))
    .limit(MAX_CHAT_MEDICATIONS);
  const today = todayDateStr();
  // Scope the logs query to only the medication IDs just fetched (the capped
  // list) so we never read today's logs for medications outside that set.
  // This ensures the query + takenSet construction work is O(cap), not O(total).
  const medIds = meds.map((m) => m.id);
  const todays =
    medIds.length > 0
      ? await db
          .select()
          .from(medicationLogsTable)
          .where(
            and(
              eq(medicationLogsTable.userId, userId),
              eq(medicationLogsTable.date, today),
              inArray(medicationLogsTable.medicationId, medIds),
            ),
          )
      : [];
  const takenSet = new Set(
    todays.map((l) => `${l.medicationId}|${l.scheduledTime}`),
  );
  return meds.map((m) => {
    const times = Array.from(new Set(m.times.map((t) => t.trim()))).sort();
    return {
      name: clipStr(m.name, TOOL_FIELD_SHORT),
      dosage: clipStr(m.dosage, TOOL_FIELD_SHORT),
      notes: clipStr(m.notes, TOOL_FIELD_LONG),
      doses: times.map((scheduledTime) => ({
        scheduledTime,
        takenToday: takenSet.has(`${m.id}|${scheduledTime}`),
      })),
    };
  });
}

// Execute a tool call. ALWAYS scoped to the passed userId, which is derived
// from the session — never from anything the model produced.
export async function runChatTool(
  name: string,
  input: Record<string, unknown>,
  userId: string,
): Promise<string> {
  let data: unknown;
  switch (name) {
    case "get_recent_morning_logs":
      data = await getRecentMorningLogs(userId, clampLimit(input.limit));
      break;
    case "get_recent_evening_reports":
      data = await getRecentEveningReports(userId, clampLimit(input.limit));
      break;
    case "get_recent_body_scans":
      data = await getRecentBodyScans(userId, clampLimit(input.limit));
      break;
    case "get_habits_with_streaks":
      data = await getHabitsWithStreaks(userId);
      break;
    case "get_medications_status":
      data = await getMedicationsStatus(userId);
      break;
    default:
      data = { error: "unknown_tool" };
  }
  return JSON.stringify(data);
}
