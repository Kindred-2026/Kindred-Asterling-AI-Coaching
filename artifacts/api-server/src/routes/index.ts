import {
  Router,
  type IRouter,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import morningLogsRouter from "./morningLogs";
import bodyScansRouter from "./bodyScans";
import eveningReportsRouter from "./eveningReports";
import habitsRouter from "./habits";
import dashboardRouter from "./dashboard";
import affirmationsRouter from "./affirmations";
import profileRouter from "./profile";
import chatRouter from "./chat";
import medicationsRouter from "./medications";
import weeklyReportRouter from "./weeklyReport";
import subscriptionRouter from "./subscription";
import voiceRouter from "./voice";
import remindersRouter from "./reminders";
import adminRouter from "./admin";
import userRouter from "./user";
import accountRouter from "./account";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

function noStore(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader("Cache-Control", "no-store");
  next();
}

// Public account and subscription endpoints.
// NOTE: health routes are mounted before authentication in app.ts.
router.use(userRouter);
router.use(subscriptionRouter);

// Admin routes require auth + owner-only (checked within the route file).
router.use("/admin", adminRouter);

// Everything below requires an authenticated user.
router.use(requireAuth);

// Sensitive personal/wellness data must never be cached.
router.use(noStore);

router.use(accountRouter);
router.use(morningLogsRouter);
router.use(bodyScansRouter);
router.use(eveningReportsRouter);
router.use(habitsRouter);
router.use(dashboardRouter);
router.use(affirmationsRouter);
router.use(profileRouter);
router.use(chatRouter);
router.use(medicationsRouter);
router.use(weeklyReportRouter);
router.use(voiceRouter);
router.use(remindersRouter);

export default router;
