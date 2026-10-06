import { Router, type IRouter } from "express";
import { desc, eq, and } from "@workspace/db";
import { db, habitsTable, habitEntriesTable } from "@workspace/db";
import {
  CreateHabitBody,
  UpdateHabitParams,
  UpdateHabitBody,
  DeleteHabitParams,
  ListHabitEntriesParams,
  LogHabitEntryParams,
  LogHabitEntryBody,
  ListHabitsResponse,
  UpdateHabitResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";
import { trackEvent } from "../lib/analytics";
import { createHabitTx, logHabitEntryTx } from "../lib/journalWrites";

const router: IRouter = Router();

router.get("/habits", requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.id;
  const habits = await db
    .select()
    .from(habitsTable)
    .where(eq(habitsTable.userId, userId))
    .orderBy(desc(habitsTable.createdAt))
    .limit(100);

  const withCounts = await Promise.all(
    habits.map(async (habit) => {
      const count = await db.count(
        habitEntriesTable,
        and(
          eq(habitEntriesTable.habitId, habit.id),
          eq(habitEntriesTable.completed, true),
          eq(habitEntriesTable.userId, userId),
        ),
      );
      return { ...habit, completedCount: count };
    }),
  );

  res.json(ListHabitsResponse.parse(JSON.parse(JSON.stringify(withCounts))));
});

router.post("/habits", requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.id;
  const parsed = CreateHabitBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const today = new Date().toISOString().split("T")[0];
  const habit = await createHabitTx(userId, {
    name: parsed.data.name,
    description: parsed.data.description ?? null,
    targetDays: parsed.data.targetDays ?? 90,
    startDate: parsed.data.startDate ?? today,
  });
  trackEvent(userId, "Habit Created");
  res.status(201).json(habit);
});

router.patch("/habits/:id", requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.id;
  const params = UpdateHabitParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateHabitBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [habit] = await db
    .update(habitsTable)
    .set(parsed.data)
    .where(
      and(eq(habitsTable.id, params.data.id), eq(habitsTable.userId, userId)),
    )
    .returning();
  if (!habit) {
    res.status(404).json({ error: "Habit not found" });
    return;
  }
  const count = await db.count(
    habitEntriesTable,
    and(
      eq(habitEntriesTable.habitId, habit.id),
      eq(habitEntriesTable.completed, true),
      eq(habitEntriesTable.userId, userId),
    ),
  );
  res.json(
    UpdateHabitResponse.parse(
      JSON.parse(JSON.stringify({ ...habit, completedCount: count })),
    ),
  );
});

router.delete("/habits/:id", requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.id;
  const params = DeleteHabitParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [habit] = await db
    .delete(habitsTable)
    .where(
      and(eq(habitsTable.id, params.data.id), eq(habitsTable.userId, userId)),
    )
    .returning();
  if (!habit) {
    res.status(404).json({ error: "Habit not found" });
    return;
  }
  res.sendStatus(204);
});

router.get(
  "/habits/:id/entries",
  requireAuth,
  async (req, res): Promise<void> => {
    const userId = req.user!.id;
    const params = ListHabitEntriesParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    // Verify the habit belongs to this user
    const [habit] = await db
      .select()
      .from(habitsTable)
      .where(
        and(eq(habitsTable.id, params.data.id), eq(habitsTable.userId, userId)),
      );
    if (!habit) {
      res.status(404).json({ error: "Habit not found" });
      return;
    }
    const entries = await db
      .select()
      .from(habitEntriesTable)
      .where(
        and(
          eq(habitEntriesTable.habitId, params.data.id),
          eq(habitEntriesTable.userId, userId),
        ),
      )
      .orderBy(desc(habitEntriesTable.date))
      .limit(365);
    res.json(JSON.parse(JSON.stringify(entries)));
  },
);

router.post(
  "/habits/:id/entries",
  requireAuth,
  async (req, res): Promise<void> => {
    const userId = req.user!.id;
    const params = LogHabitEntryParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const parsed = LogHabitEntryBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const entry = await logHabitEntryTx(params.data.id, userId, {
      date: parsed.data.date,
      completed: parsed.data.completed,
      notes: parsed.data.notes ?? null,
    });
    if (!entry) {
      res.status(404).json({ error: "Habit not found" });
      return;
    }
    trackEvent(userId, "Habit Logged", {
      completed: parsed.data.completed,
    });
    res.status(201).json(entry);
  },
);

export default router;
