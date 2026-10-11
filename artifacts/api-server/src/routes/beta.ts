import { Router, type IRouter } from "express";
import {
  and,
  betaGrantsTable,
  db,
  DatabaseLeaseUnavailableError,
  entitlementAuditTable,
  eq,
} from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import {
  activeBetaGrant,
  betaConfig,
  countBetaSpots,
  withBetaSpotLock,
  type BetaConfig,
} from "../lib/betaSpots";

// Signed-in people without access land here: they can see whether the beta
// has room and claim an open spot for themselves.
const router: IRouter = Router();

function notOpenYet(config: BetaConfig): boolean {
  return config.opensAt != null && config.opensAt.getTime() > Date.now();
}

router.get("/beta/status", requireAuth, async (req, res): Promise<void> => {
  const config = betaConfig();
  const spots = await countBetaSpots(config);
  res.json({
    state: notOpenYet(config)
      ? "not_open"
      : spots.open.left > 0
        ? "open"
        : "full",
    opensAt: config.opensAt?.toISOString() ?? null,
    spotsLeft: spots.open.left,
    emailVerified: req.user!.emailVerified,
  });
});

router.post("/beta/join", requireAuth, async (req, res): Promise<void> => {
  const user = req.user!;
  if (!user.emailVerified) {
    res
      .status(403)
      .json({ error: "Verify your email before joining the beta." });
    return;
  }
  const config = betaConfig();
  if (notOpenYet(config)) {
    res
      .status(409)
      .json({ error: "The beta isn't open yet.", state: "not_open" });
    return;
  }

  let result: "joined" | "full" | "revoked";
  try {
    result = await withBetaSpotLock(() =>
      db.transaction(async (tx) => {
        const [existing] = await tx
          .select({ id: betaGrantsTable.id })
          .from(betaGrantsTable)
          .where(and(eq(betaGrantsTable.userId, user.id), activeBetaGrant()))
          .limit(1);
        if (existing) return "joined" as const;

        // Someone an owner removed can't put themselves back in.
        const past = await tx
          .select({ revokedAt: betaGrantsTable.revokedAt })
          .from(betaGrantsTable)
          .where(eq(betaGrantsTable.userId, user.id));
        if (past.some((grant) => grant.revokedAt != null)) {
          return "revoked" as const;
        }

        const spots = await countBetaSpots(config, tx);
        if (spots.open.left === 0) return "full" as const;

        const [grant] = await tx
          .insert(betaGrantsTable)
          .values({ userId: user.id, grantedBy: user.id })
          .returning();
        await tx.insert(entitlementAuditTable).values({
          userId: user.id,
          action: "beta_joined",
          actorId: user.id,
          metadata: { grantId: grant.id },
        });
        return "joined" as const;
      }),
    );
  } catch (err) {
    if (err instanceof DatabaseLeaseUnavailableError) {
      res.status(503).json({
        error: "Lots of people are joining right now. Try again in a moment.",
      });
      return;
    }
    throw err;
  }

  if (result === "revoked") {
    res.status(403).json({
      error:
        "Your beta access was turned off. Contact the Kindred team if you think that's a mistake.",
    });
    return;
  }
  if (result === "full") {
    res.status(409).json({ error: "The beta is full.", state: "full" });
    return;
  }
  res.json({ joined: true });
});

export default router;
