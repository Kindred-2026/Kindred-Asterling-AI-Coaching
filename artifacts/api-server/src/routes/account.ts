import { Router, type IRouter, type Request, type Response } from "express";
import { db, eq, usersTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { intercomConfig, signIntercomUserJwt } from "../lib/intercom";
import {
  AccountDeletionBlockedError,
  deleteAccount,
  exportAccount,
} from "../lib/accountLifecycle";

const router: IRouter = Router();
router.get(
  "/account/export",
  requireAuth,
  async (req: Request, res: Response) => {
    const payload = await exportAccount(req.user!.id);
    if (!payload) {
      res.status(404).json({ error: "Account not found" });
      return;
    }
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="kindred-account-export.json"',
    );
    res.json(payload);
  },
);
// Boot settings for the support Messenger on the Account page. Who the user is
// travels only inside the signed token; name and sign-up date are unsigned
// display details.
router.get(
  "/account/intercom",
  requireAuth,
  async (req: Request, res: Response) => {
    const config = intercomConfig();
    if (!config) {
      res.status(404).json({ error: "Support chat is not set up" });
      return;
    }
    const [row] = await db
      .select({
        createdAt: usersTable.createdAt,
        preferredName: usersTable.preferredName,
      })
      .from(usersTable)
      .where(eq(usersTable.id, req.user!.id));
    if (!row) {
      res.status(404).json({ error: "Account not found" });
      return;
    }
    const { id, email, firstName, lastName } = req.user!;
    const fullName = [firstName, lastName].filter(Boolean).join(" ");
    res.json({
      appId: config.appId,
      userJwt: signIntercomUserJwt(
        { user_id: id, ...(email ? { email } : {}) },
        config.secret,
      ),
      name: fullName || row.preferredName || null,
      createdAt: Math.floor(row.createdAt.getTime() / 1000),
    });
  },
);
router.delete("/account", requireAuth, async (req: Request, res: Response) => {
  let deleted: boolean;
  try {
    deleted = await deleteAccount(req.user!.id);
  } catch (err) {
    if (err instanceof AccountDeletionBlockedError) {
      res.status(502).json({
        error:
          "We could not cancel your Yearly renewal with Helcim, so nothing was deleted. Please try again shortly.",
      });
      return;
    }
    throw err;
  }
  if (!deleted) {
    res.status(404).json({ error: "Account not found" });
    return;
  }
  res.clearCookie("connect.sid");
  res.sendStatus(204);
});
export default router;
