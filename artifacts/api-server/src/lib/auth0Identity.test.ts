import { randomUUID } from "node:crypto";
import { db, eq, usersTable } from "@workspace/db";
import { afterEach, describe, expect, it } from "vitest";
import {
  IdentityLinkRequiredError,
  syncAuth0Identity,
  type AuthIdentity,
} from "./auth0Identity";
const ids: string[] = [];
afterEach(async () => {
  for (const id of ids.splice(0))
    await db.delete(usersTable).where(eq(usersTable.id, id));
});
function identity(): AuthIdentity {
  const id = randomUUID();
  return {
    id: `auth0|${id}`,
    email: `${id}@example.test`,
    emailVerified: true,
    firstName: "Test",
    lastName: null,
    profileImageUrl: null,
  };
}
describe("Auth0 identity mapping", () => {
  it("creates a stable application ID and reuses it on subsequent sign-ins", async () => {
    const external = identity();
    const first = await syncAuth0Identity(external);
    ids.push(first.id);
    const second = await syncAuth0Identity({
      ...external,
      firstName: "Updated",
    });
    expect(second.id).toBe(first.id);
    expect(second.id).not.toBe(external.id);
    expect(second.firstName).toBe("Updated");
  });
  it("retains an explicitly migrated account's application ID and profile", async () => {
    const external = identity();
    const id = randomUUID();
    ids.push(id);
    await db
      .insert(usersTable)
      .values({
        id,
        clerkUserId: "clerk-legacy",
        auth0UserId: external.id,
        email: external.email,
        preferredName: "Keep me",
      });
    const user = await syncAuth0Identity(external);
    expect(user.id).toBe(id);
    expect(user.clerkUserId).toBe("clerk-legacy");
    expect(user.preferredName).toBe("Keep me");
  });
  it("does not grant an existing account to a new subject with the same email", async () => {
    const external = identity();
    const id = randomUUID();
    ids.push(id);
    await db
      .insert(usersTable)
      .values({ id, clerkUserId: "clerk-existing", email: external.email });
    await expect(syncAuth0Identity(external)).rejects.toBeInstanceOf(
      IdentityLinkRequiredError,
    );
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, id));
    expect(user.auth0UserId).toBeNull();
  });
  it("does not mark an unverified email as verified", async () => {
    const user = await syncAuth0Identity({
      ...identity(),
      emailVerified: false,
    });
    ids.push(user.id);
    expect(user.emailVerifiedAt).toBeNull();
  });
  it("keeps the original verification time across later sign-ins", async () => {
    const external = identity();
    const first = await syncAuth0Identity(external);
    ids.push(first.id);
    await new Promise((resolve) => setTimeout(resolve, 20));
    const second = await syncAuth0Identity(external);
    expect(second.emailVerifiedAt?.getTime()).toBe(
      first.emailVerifiedAt?.getTime(),
    );
  });
  it("refuses to move an existing account onto another account's email", async () => {
    const other = await syncAuth0Identity(identity());
    ids.push(other.id);
    const external = identity();
    const user = await syncAuth0Identity(external);
    ids.push(user.id);
    await expect(
      syncAuth0Identity({ ...external, email: other.email }),
    ).rejects.toBeInstanceOf(IdentityLinkRequiredError);
  });
});
