import { Router, type IRouter } from "express";
import { UpdateProfileBody } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";
import { updateProfileTx } from "../lib/journalWrites";

const router: IRouter = Router();

router.patch("/profile", requireAuth, async (req, res): Promise<void> => {
  const parsed = UpdateProfileBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid profile data" });
    return;
  }
  const userId = req.user!.id;
  const data = parsed.data;
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (data.preferredName !== undefined) updates.preferredName = data.preferredName;
  if (data.birthday !== undefined) updates.birthday = data.birthday;
  if (data.struggles !== undefined) updates.struggles = data.struggles;
  if (data.strengths !== undefined) updates.strengths = data.strengths;
  if (data.interests !== undefined) updates.interests = data.interests;
  if (data.bio !== undefined) updates.bio = data.bio;
  if (data.motivationalQuote !== undefined) updates.motivationalQuote = data.motivationalQuote;
  if (data.phone !== undefined) updates.phone = data.phone;
  if (data.timezone !== undefined) updates.timezone = data.timezone;
  if (data.onboardedAt !== undefined) {
    updates.onboardedAt = data.onboardedAt ? new Date(data.onboardedAt) : null;
  }
  if (data.birthdaySkippedAt !== undefined) {
    updates.birthdaySkippedAt = data.birthdaySkippedAt
      ? new Date(data.birthdaySkippedAt)
      : null;
  }

  const updated = await updateProfileTx(userId, updates);

  if (!updated) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json(updated);
});

export default router;
