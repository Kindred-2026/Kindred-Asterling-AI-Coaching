import {
  Router,
  type IRouter,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { eq, and, desc } from "@workspace/db";
import {
  db,
  usersTable,
  betaGrantsTable,
  entitlementAuditTable,
  DatabaseLeaseUnavailableError,
} from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { ownerIds } from "../lib/subscriptionService";
import {
  activeBetaGrant,
  betaConfig,
  countBetaSpots,
  isOpenSpot,
  withBetaSpotLock,
} from "../lib/betaSpots";

function ownerEmails(): Set<string> {
  return new Set(
    (process.env.SUBSCRIPTION_OWNER_EMAILS || "")
      .toLowerCase()
      .split(",")
      .map((e) => e.trim())
      .filter(Boolean),
  );
}

function requireOwner(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (ownerIds().has(req.user.id)) {
    next();
    return;
  }
  if (
    req.user.emailVerified &&
    req.user.email &&
    ownerEmails().has(req.user.email.trim().toLowerCase())
  ) {
    next();
    return;
  }
  res.status(403).json({ error: "Forbidden" });
  return;
}

const router: IRouter = Router();

router.use(requireAuth, requireOwner);

router.get("/users", async (req, res): Promise<void> => {
  const query = req.query.q;
  if (query !== undefined && typeof query !== "string") {
    res.status(400).json({ error: "q must be a string" });
    return;
  }
  const rawQ = (query ?? "").trim().toLowerCase();
  if (!rawQ) {
    res.json({ users: [] });
    return;
  }

  const matches = await db.select().from(usersTable).where(eq(usersTable.email, rawQ)).limit(20);
  const users = matches.map((user) => ({
    id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName,
    emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
  }));

  res.json({ users });
});

router.get("/beta/grants", async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      id: betaGrantsTable.id,
      userId: betaGrantsTable.userId,
      grantedBy: betaGrantsTable.grantedBy,
      grantedAt: betaGrantsTable.grantedAt,
      expiresAt: betaGrantsTable.expiresAt,
      revokedAt: betaGrantsTable.revokedAt,
      revokedBy: betaGrantsTable.revokedBy,
    })
    .from(betaGrantsTable)
    .orderBy(desc(betaGrantsTable.grantedAt))
    .limit(200);

  const config = betaConfig();
  res.json({
    grants: rows.map((row) => ({
      ...row,
      kind: isOpenSpot(row) ? "open" : "reserved",
    })),
    spots: await countBetaSpots(config),
    opensAt: config.opensAt?.toISOString() ?? null,
  });
});

router.post("/beta/grant", async (req, res): Promise<void> => {
  const { userId } = req.body as { userId?: string };
  if (!userId || typeof userId !== "string") {
    res.status(400).json({ error: "userId is required" });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  // Owner grants use the reserved spots set aside for friends.
  let result;
  try {
    result = await withBetaSpotLock(async () => {
      const [existing] = await db
        .select()
        .from(betaGrantsTable)
        .where(and(eq(betaGrantsTable.userId, userId), activeBetaGrant()))
        .limit(1);
      if (existing) return { error: "User already has an active beta grant" };

      const spots = await countBetaSpots(betaConfig());
      if (spots.reserved.left === 0) {
        return {
          error:
            spots.reserved.taken >= spots.reserved.total
              ? `All ${spots.reserved.total} reserved spots are in use. Revoke one, or ask them to join an open spot.`
              : "The beta is full.",
        };
      }

      const [grant] = await db
        .insert(betaGrantsTable)
        .values({
          userId,
          grantedBy: req.user!.id,
        })
        .returning();

      await db.insert(entitlementAuditTable).values({
        userId,
        action: "beta_granted",
        actorId: req.user!.id,
        metadata: { grantId: grant.id },
      });
      return { grant };
    });
  } catch (err) {
    if (err instanceof DatabaseLeaseUnavailableError) {
      res.status(503).json({ error: "Beta spots are busy. Try again." });
      return;
    }
    throw err;
  }

  if ("error" in result) {
    res.status(409).json({ error: result.error });
    return;
  }
  res.status(201).json({ grant: result.grant });
});

router.post("/beta/revoke", async (req, res): Promise<void> => {
  const { userId } = req.body as { userId?: string };
  if (!userId || typeof userId !== "string") {
    res.status(400).json({ error: "userId is required" });
    return;
  }

  const [grant] = await db
    .select()
    .from(betaGrantsTable)
    .where(
      // An expired grant that was never revoked must not be picked instead
      // of the active one.
      and(eq(betaGrantsTable.userId, userId), activeBetaGrant()),
    )
    .limit(1);

  if (!grant) {
    res.status(404).json({ error: "No active beta grant found for this user" });
    return;
  }

  await db
    .update(betaGrantsTable)
    .set({
      revokedAt: new Date(),
      revokedBy: req.user!.id,
    })
    .where(eq(betaGrantsTable.id, grant.id));

  await db.insert(entitlementAuditTable).values({
    userId,
    action: "beta_revoked",
    actorId: req.user!.id,
    metadata: { grantId: grant.id },
  });

  res.json({ success: true });
});

export default router;
