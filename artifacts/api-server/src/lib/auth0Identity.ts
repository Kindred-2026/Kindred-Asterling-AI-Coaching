import { randomUUID } from "node:crypto";
import { db, eq, usersTable } from "@workspace/db";
import { trackEvent } from "./analytics";

export interface AuthIdentity {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
  emailVerified: boolean;
}

export class IdentityLinkRequiredError extends Error {
  constructor() {
    super(
      "An existing Kindred account requires a verified identity migration.",
    );
  }
}

/** Never link accounts by email. Existing accounts need an explicit subject mapping. */
export async function syncAuth0Identity(identity: AuthIdentity) {
  const now = new Date();
  let created = false;
  const user = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(usersTable)
      .where(eq(usersTable.auth0UserId, identity.id))
      .limit(1);
    const email = identity.email?.trim().toLowerCase() || null;
    if (email && email !== existing?.email) {
      const [emailOwner] = await tx
        .select()
        .from(usersTable)
        .where(eq(usersTable.email, email))
        .limit(1);
      // Also covers an existing account whose Auth0 email changed to one that
      // another account owns (otherwise a unique-index error and a retry loop).
      if (emailOwner && emailOwner.id !== existing?.id)
        throw new IdentityLinkRequiredError();
    }
    // Keep the original verification time while the verified email is
    // unchanged, instead of moving it to every sign-in.
    const emailVerifiedAt = identity.emailVerified
      ? existing?.email === email && existing.emailVerifiedAt
        ? existing.emailVerifiedAt
        : now
      : null;
    created = !existing;
    const [user] = await tx
      .insert(usersTable)
      .values({
        id: existing?.id ?? randomUUID(),
        auth0UserId: identity.id,
        email,
        firstName: identity.firstName,
        lastName: identity.lastName,
        profileImageUrl: identity.profileImageUrl,
        emailVerifiedAt,
      })
      .onConflictDoUpdate({
        target: usersTable.auth0UserId,
        set: {
          email,
          firstName: identity.firstName,
          lastName: identity.lastName,
          profileImageUrl: identity.profileImageUrl,
          emailVerifiedAt,
          updatedAt: now,
        },
      })
      .returning();
    return user;
  });
  if (created) trackEvent(user.id, "Account Created");
  return user;
}

/** Application IDs remain stable across identity provider migrations. */
export async function getAppIdentity(userId: string): Promise<AuthIdentity> {
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  if (!user) throw new Error("Account not found");
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    profileImageUrl: user.profileImageUrl,
    emailVerified: user.emailVerifiedAt != null,
  };
}
