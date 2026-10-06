import { Router, type IRouter } from "express";
import { desc, eq } from "@workspace/db";
import { db, eveningReportsTable } from "@workspace/db";
import {
  CreateEveningReportBody,
  ListEveningReportsResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";
import { createEveningReportTx } from "../lib/journalWrites";
import { trackEvent } from "../lib/analytics";

const router: IRouter = Router();

router.get("/evening-reports", requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.id;
  const reports = await db
    .select()
    .from(eveningReportsTable)
    .where(eq(eveningReportsTable.userId, userId))
    .orderBy(desc(eveningReportsTable.createdAt))
    .limit(365);
  res.json(
    ListEveningReportsResponse.parse(JSON.parse(JSON.stringify(reports))),
  );
});

router.post(
  "/evening-reports",
  requireAuth,
  async (req, res): Promise<void> => {
    const userId = req.user!.id;
    const parsed = CreateEveningReportBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const report = await createEveningReportTx(userId, {
      date: parsed.data.date,
      medicationEffectiveness: parsed.data.medicationEffectiveness,
      overallMood: parsed.data.overallMood ?? null,
      wins: parsed.data.wins ?? null,
      challenges: parsed.data.challenges ?? null,
      tomorrowIntent: parsed.data.tomorrowIntent ?? null,
    });
    trackEvent(userId, "Evening Report Completed");
    res.status(201).json(report);
  },
);

export default router;
