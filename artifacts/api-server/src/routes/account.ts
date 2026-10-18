import { Router, type IRouter, type Request, type Response } from "express";
import { requireAuth } from "../middlewares/requireAuth";
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
