import { Router, type IRouter } from "express";
import { db, usersTable, eq } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";

// Beta testers tick off the test plan inside the app. The checklist itself
// lives in the web app; the API only stores which item ids each tester ticked.
const ITEM_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_ITEM_ID_LENGTH = 64;
const MAX_ITEMS = 200;

const router: IRouter = Router();

router.get("/beta-checklist", requireAuth, async (req, res): Promise<void> => {
  const [user] = await db
    .select({ betaChecklist: usersTable.betaChecklist })
    .from(usersTable)
    .where(eq(usersTable.id, req.user!.id))
    .limit(1);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json({ checked: user.betaChecklist ?? [] });
});

router.put("/beta-checklist", requireAuth, async (req, res): Promise<void> => {
  const { itemId, checked } = (req.body ?? {}) as {
    itemId?: unknown;
    checked?: unknown;
  };
  if (
    typeof itemId !== "string" ||
    itemId.length > MAX_ITEM_ID_LENGTH ||
    !ITEM_ID.test(itemId) ||
    typeof checked !== "boolean"
  ) {
    res.status(400).json({ error: "Invalid checklist update" });
    return;
  }

  const userId = req.user!.id;
  const result = await db.transaction(async (tx) => {
    const [user] = await tx
      .select({ betaChecklist: usersTable.betaChecklist })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);
    if (!user) return null;
    const current = new Set(user.betaChecklist ?? []);
    if (checked) current.add(itemId);
    else current.delete(itemId);
    if (current.size > MAX_ITEMS) return "too_many" as const;
    const next = [...current].sort();
    await tx
      .update(usersTable)
      .set({ betaChecklist: next, updatedAt: new Date() })
      .where(eq(usersTable.id, userId));
    return next;
  });

  if (result === null) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  if (result === "too_many") {
    res.status(400).json({ error: "Too many checklist items" });
    return;
  }
  res.json({ checked: result });
});

export default router;
