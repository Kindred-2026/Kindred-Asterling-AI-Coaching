import { Router, type IRouter } from "express";
import { gte, eq, and } from "@workspace/db";
import {
  db,
  morningLogsTable,
  eveningReportsTable,
  bodyScansTable,
} from "@workspace/db";
import PDFDocument from "pdfkit";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function toYMD(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

router.get(
  "/weekly-report/pdf",
  requireAuth,
  async (req, res): Promise<void> => {
    const userId = req.user!.id;

    const today = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 7);
    const startDate = toYMD(start);
    // Scans are filtered by instant, so start at local midnight of the same
    // day the YYYY-MM-DD bound uses (new Date(startDate) would be UTC midnight).
    const windowStart = new Date(
      start.getFullYear(),
      start.getMonth(),
      start.getDate(),
    );

    const monthDay: Intl.DateTimeFormatOptions = {
      month: "short",
      day: "numeric",
    };
    const rangeLabel = `${start.toLocaleDateString("en-US", monthDay)} – ${today.toLocaleDateString(
      "en-US",
      { ...monthDay, year: "numeric" },
    )}`;

    const morningLogs = await db
      .select()
      .from(morningLogsTable)
      .where(
        and(
          eq(morningLogsTable.userId, userId),
          gte(morningLogsTable.date, startDate),
        ),
      )
      .limit(50);
    morningLogs.sort((a, b) => a.date.localeCompare(b.date));

    const eveningReports = await db
      .select()
      .from(eveningReportsTable)
      .where(
        and(
          eq(eveningReportsTable.userId, userId),
          gte(eveningReportsTable.date, startDate),
        ),
      )
      .limit(50);
    eveningReports.sort((a, b) => a.date.localeCompare(b.date));

    const bodyScans = await db
      .select()
      .from(bodyScansTable)
      .where(
        and(
          eq(bodyScansTable.userId, userId),
          gte(bodyScansTable.scannedAt, windowStart),
        ),
      )
      .limit(50);
    bodyScans.sort((a, b) => a.scannedAt.getTime() - b.scannedAt.getTime());

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="kindred-weekly-summary.pdf"',
    );

    const doc = new PDFDocument({ margin: 50 });
    doc.pipe(res);

    doc.fontSize(22).text("Kindred Weekly Wellness Summary");
    doc.moveDown(0.25);
    doc.fontSize(12).fillColor("#555555").text(rangeLabel);
    doc.fillColor("#000000");
    doc.moveDown();

    const sectionHeader = (title: string): void => {
      doc.moveDown(0.5);
      doc.fontSize(16).text(title);
      doc.moveDown(0.25);
      doc.fontSize(12);
    };

    const entryField = (label: string, value: string): void => {
      doc.text(`${label}: ${value}`);
    };

    sectionHeader("Morning Logs");
    if (morningLogs.length === 0) {
      doc.text("No entries this week.");
    } else {
      for (const log of morningLogs) {
        entryField("Date", log.date);
        entryField("Mental Load Level", log.mentalLoadLevel);
        entryField("Mini Goals", log.miniGoals.join(", "));
        entryField("Notes", log.notes ?? "");
        doc.moveDown(0.5);
      }
    }

    sectionHeader("Evening Reports");
    if (eveningReports.length === 0) {
      doc.text("No entries this week.");
    } else {
      for (const report of eveningReports) {
        entryField("Date", report.date);
        entryField("Overall Mood", report.overallMood ?? "");
        entryField(
          "Medication Effectiveness",
          `${report.medicationEffectiveness} / 10`,
        );
        entryField("Wins", report.wins ?? "");
        entryField("Challenges", report.challenges ?? "");
        entryField("Tomorrow's Intent", report.tomorrowIntent ?? "");
        doc.moveDown(0.5);
      }
    }

    sectionHeader("Body Scans");
    if (bodyScans.length === 0) {
      doc.text("No entries this week.");
    } else {
      for (const scan of bodyScans) {
        entryField("Date/Time", scan.scannedAt.toLocaleString("en-US"));
        entryField("Energy Level", `${scan.energyLevel} / 10`);
        entryField("Feelings", scan.feelings.join(", "));
        entryField("Physical Sensations", scan.physicalSensations ?? "");
        entryField("Notes", scan.notes ?? "");
        doc.moveDown(0.5);
      }
    }

    doc.end();
  },
);

export default router;
