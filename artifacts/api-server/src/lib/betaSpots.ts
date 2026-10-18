import {
  and,
  betaGrantsTable,
  db,
  DatabaseLeaseUnavailableError,
  gt,
  isNull,
  or,
  withDatabaseLease,
  type DataApi,
} from "@workspace/db";

// Kindred's beta is first come, first served: anyone signed in with a verified
// email can claim an open spot until the beta is full. A few spots stay
// reserved for people an owner grants access to by hand from the admin page.
//
// The two kinds of grant are told apart by who granted them. A tester who
// claims an open spot is recorded as granting it to themselves; every other
// grant came from an owner and uses a reserved spot.

export interface BetaConfig {
  capacity: number;
  reserved: number;
  opensAt: Date | null;
}

export interface BetaPool {
  total: number;
  taken: number;
  left: number;
}

export interface BetaSpots {
  open: BetaPool;
  reserved: BetaPool;
}

const DEFAULT_CAPACITY = 20;
const DEFAULT_RESERVED = 5;

function wholeNumber(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  if (!/^\d+$/.test(raw)) throw new Error(`${name} must be a whole number`);
  return Number(raw);
}

export function betaConfig(): BetaConfig {
  const capacity = wholeNumber("BETA_CAPACITY", DEFAULT_CAPACITY);
  const reserved = wholeNumber("BETA_RESERVED_SPOTS", DEFAULT_RESERVED);
  if (reserved > capacity) {
    throw new Error("BETA_RESERVED_SPOTS cannot be more than BETA_CAPACITY");
  }
  const rawOpensAt = process.env.BETA_OPENS_AT?.trim();
  const opensAt = rawOpensAt ? new Date(rawOpensAt) : null;
  if (opensAt && Number.isNaN(opensAt.getTime())) {
    throw new Error(
      "BETA_OPENS_AT must be a date and time, like 2026-10-12T00:00:00-04:00",
    );
  }
  return { capacity, reserved, opensAt };
}

export function activeBetaGrant(now = new Date()) {
  return and(
    isNull(betaGrantsTable.revokedAt),
    or(isNull(betaGrantsTable.expiresAt), gt(betaGrantsTable.expiresAt, now)),
  );
}

export function isOpenSpot(grant: {
  userId: string;
  grantedBy: string | null;
}): boolean {
  return grant.grantedBy === grant.userId;
}

export async function countBetaSpots(
  config: BetaConfig,
  reader: Pick<DataApi, "select"> = db,
): Promise<BetaSpots> {
  const grants = await reader
    .select({
      userId: betaGrantsTable.userId,
      grantedBy: betaGrantsTable.grantedBy,
    })
    .from(betaGrantsTable)
    .where(activeBetaGrant());
  const openTaken = grants.filter(isOpenSpot).length;
  // The capacity is a hard ceiling, even if an owner granted more reserved
  // spots before the limits existed.
  const left = Math.max(0, config.capacity - grants.length);
  const pool = (total: number, taken: number): BetaPool => ({
    total,
    taken,
    left: Math.min(Math.max(0, total - taken), left),
  });
  return {
    open: pool(config.capacity - config.reserved, openTaken),
    reserved: pool(config.reserved, grants.length - openTaken),
  };
}

const LOCK_ATTEMPTS = 10;

// Every new grant is written under one lease, so two people can never both
// take the last spot. The lease is short; callers queue for it briefly.
export async function withBetaSpotLock<T>(
  callback: () => Promise<T>,
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await withDatabaseLease("beta-spots", "grants", 10_000, callback);
    } catch (err) {
      if (
        !(err instanceof DatabaseLeaseUnavailableError) ||
        attempt >= LOCK_ATTEMPTS
      ) {
        throw err;
      }
      await new Promise((resolve) =>
        setTimeout(resolve, 50 + Math.random() * 150),
      );
    }
  }
}
