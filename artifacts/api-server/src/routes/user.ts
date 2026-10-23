import { Router, type IRouter, type Request, type Response } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { ownerIds } from "../lib/subscriptionService";

const router: IRouter = Router();

interface PublicUser {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
  preferredName: string | null;
  birthday: string | null;
  struggles: string | null;
  strengths: string | null;
  interests: string | null;
  bio: string | null;
  motivationalQuote: string | null;
  phone: string | null;
  timezone: string | null;
  emailVerifiedAt: string | null;
  onboardedAt: string | null;
  createdAt: string;
  isOwner: boolean;
}

router.get("/auth/user", requireAuth, async (req: Request, res: Response) => {
  const [row] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, req.user!.id));

  if (!row) {
    res.json({ user: null });
    return;
  }

  // Explicit allowlist: never spread the row, which carries internal columns
  // (passwordHash, provider subject IDs, deletion markers).
  const publicUser: PublicUser = {
    id: row.id,
    email: req.user!.email,
    firstName: req.user!.firstName,
    lastName: req.user!.lastName,
    profileImageUrl: req.user!.profileImageUrl,
    preferredName: row.preferredName,
    struggles: row.struggles,
    strengths: row.strengths,
    interests: row.interests,
    bio: row.bio,
    motivationalQuote: row.motivationalQuote,
    phone: row.phone,
    timezone: row.timezone,
    createdAt: row.createdAt.toISOString(),
    emailVerifiedAt: row.emailVerifiedAt?.toISOString() ?? null,
    onboardedAt: row.onboardedAt?.toISOString() ?? null,
    birthday: row.birthday ?? null,
    isOwner: ownerIds().has(row.id),
  };

  res.json({ user: publicUser });
});

export default router;
