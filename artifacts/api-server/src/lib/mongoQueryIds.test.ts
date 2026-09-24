import { randomUUID } from "node:crypto";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import {
  closeDatabase,
  dailyUsageTable,
  db,
  eq,
  getMongoDatabase,
  inArray,
  messages,
  usersTable,
} from "@workspace/db";

type FixtureRow = { _id: string | number | { nested: string }; [key: string]: unknown };

const marker = randomUUID();
const collectionNames = ["users", "conversations", "messages", "daily_usage"];

afterEach(async () => {
  const mongo = await getMongoDatabase();
  for (const name of collectionNames) {
    await mongo.collection<FixtureRow>(name).deleteMany({ queryIdTest: marker });
  }
});

afterAll(closeDatabase);

describe("database-derived query identifiers", () => {
  it("rejects operator-bearing request values and forged filters before MongoDB access", () => {
    expect(() => eq(usersTable.id, { $ne: null })).toThrow(
      "MongoDB conditions accept scalar values only",
    );
    expect(() => eq(usersTable.id, /.*/)).toThrow(
      "MongoDB conditions accept scalar values only",
    );
    expect(() => inArray(usersTable.id, ["safe", { $ne: null }])).toThrow(
      "MongoDB conditions accept scalar values only",
    );
    expect(() =>
      db.update(usersTable).where({ filter: { $where: "return true" } } as never),
    ).toThrow("Invalid database condition");
  });

  it("uses its validated condition expression even if a filter view is mutated", async () => {
    const mongo = await getMongoDatabase();
    const targetId = `${marker}-target`;
    const otherId = `${marker}-other`;
    await mongo.collection<FixtureRow>("users").insertMany([
      { _id: targetId, id: targetId, firstName: "before", queryIdTest: marker },
      { _id: otherId, id: otherId, firstName: "before", queryIdTest: marker },
    ]);
    const safeCondition = eq(usersTable.id, targetId);
    (safeCondition.filter as Record<string, unknown>).id = { $ne: "never-match" };

    await db.update(usersTable).set({ firstName: "after" }).where(safeCondition);

    expect(await mongo.collection<FixtureRow>("users").findOne({ _id: targetId })).toMatchObject({
      firstName: "after",
    });
    expect(await mongo.collection<FixtureRow>("users").findOne({ _id: otherId })).toMatchObject({
      firstName: "before",
    });
  });

  it("updates only the selected string ID, treating regex-looking strings literally", async () => {
    const mongo = await getMongoDatabase();
    await mongo.collection<FixtureRow>("users").insertMany([
      { _id: ".*", id: ".*", firstName: "before", queryIdTest: marker },
      { _id: marker, id: marker, firstName: "survivor", queryIdTest: marker },
    ]);
    const changed = await db
      .update(usersTable)
      .set({ firstName: "after" })
      .where(eq(usersTable.id, ".*"))
      .returning();
    expect(changed).toHaveLength(1);
    expect(changed[0]?.firstName).toBe("after");
    expect(await mongo.collection<FixtureRow>("users").findOne({ id: marker })).toMatchObject({
      firstName: "survivor",
    });
  });

  it("treats operator-looking and JSON composite string IDs as literal values", async () => {
    const mongo = await getMongoDatabase();
    const composite = JSON.stringify({ userId: marker, date: "2026-09-14" });
    await mongo.collection<FixtureRow>("users").insertMany([
      { _id: "$ne", id: `${marker}-operator`, firstName: "before", bio: marker, queryIdTest: marker },
      { _id: composite, id: `${marker}-composite`, firstName: "before", bio: marker, queryIdTest: marker },
      { _id: marker, id: `${marker}-other`, firstName: "survivor", queryIdTest: marker },
    ]);
    const changed = await db
      .update(usersTable)
      .set({ firstName: "after" })
      .where(eq(usersTable.bio, marker))
      .returning();
    expect(changed.map(({ id }) => id).sort()).toEqual(
      [`${marker}-operator`, `${marker}-composite`].sort(),
    );
    expect(await mongo.collection<FixtureRow>("users").findOne({ _id: marker })).toMatchObject({
      firstName: "survivor",
    });
  });

  it("preserves numeric IDs during update and returning", async () => {
    const mongo = await getMongoDatabase();
    await mongo.collection<FixtureRow>("messages").insertOne({
      _id: 81234567,
      id: 81234567,
      content: "before",
      queryIdTest: marker,
    });
    const changed = await db
      .update(messages)
      .set({ content: "after" })
      .where(eq(messages.id, 81234567))
      .returning();
    expect(changed[0]).toMatchObject({ id: 81234567, content: "after" });
  });

  it("preserves composite string IDs during update and returning", async () => {
    const mongo = await getMongoDatabase();
    await mongo.collection<FixtureRow>("daily_usage").insertOne({
      _id: `${marker}:2026-09-14`,
      userId: marker,
      date: "2026-09-14",
      count: 1,
      queryIdTest: marker,
    });
    const changed = await db
      .update(dailyUsageTable)
      .set({ count: 2 })
      .where(eq(dailyUsageTable.userId, marker))
      .returning();
    expect(changed[0]).toMatchObject({ userId: marker, count: 2 });
  });

  it("does not reuse non-scalar stored _ids in a returning update selector", async () => {
    const mongo = await getMongoDatabase();
    await mongo.collection<FixtureRow>("users").insertMany([
      { _id: marker, id: `${marker}-good`, firstName: "before", bio: marker, queryIdTest: marker },
      {
        _id: { nested: marker },
        id: `${marker}-bad`,
        firstName: "before",
        bio: marker,
        queryIdTest: marker,
      },
    ]);
    const updated = await db
      .update(usersTable)
      .set({ firstName: "after" })
      .where(eq(usersTable.bio, marker))
      .returning();
    expect(updated).toHaveLength(2);
    expect(
      await mongo
        .collection<FixtureRow>("users")
        .countDocuments({ queryIdTest: marker, firstName: "after" }),
    ).toBe(2);
  });

  it("does not reuse fractional stored _ids in a returning update selector", async () => {
    const mongo = await getMongoDatabase();
    await mongo.collection<FixtureRow>("users").insertMany([
      { _id: marker, id: marker, firstName: "before", bio: marker, queryIdTest: marker },
      {
        _id: 1.5,
        id: `${marker}-fractional`,
        firstName: "before",
        bio: marker,
        queryIdTest: marker,
      },
    ]);
    const updated = await db
      .update(usersTable)
      .set({ firstName: "after" })
      .where(eq(usersTable.bio, marker))
      .returning();
    expect(updated).toHaveLength(2);
    expect(
      await mongo
        .collection<FixtureRow>("users")
        .countDocuments({ queryIdTest: marker, firstName: "after" }),
    ).toBe(2);
  });

  for (const [label, invalidId] of [
    ["regular expression", /.*/],
    ["operator document", { $ne: null }],
    ["null", null],
    ["array", ["unexpected"]],
    ["non-integer number", 1.5],
  ] as const) {
    it(`rolls back account deletion when a stored conversation ID is a ${label}`, async () => {
      const mongo = await getMongoDatabase();
      const owner = `${marker}-owner`,
        survivor = `${marker}-survivor`;
      await mongo.collection<FixtureRow>("users").insertMany([
        { _id: owner, id: owner, queryIdTest: marker },
        { _id: survivor, id: survivor, queryIdTest: marker },
      ]);
      await mongo.collection<FixtureRow>("conversations").insertMany([
        { _id: `${marker}-bad-chat`, id: invalidId, userId: owner, queryIdTest: marker },
        {
          _id: `${marker}-good-chat`,
          id: `${marker}-good-chat`,
          userId: survivor,
          queryIdTest: marker,
        },
      ]);
      await mongo.collection<FixtureRow>("messages").insertOne({
        _id: `${marker}-message`,
        conversationId: `${marker}-good-chat`,
        queryIdTest: marker,
      });
      let failure: unknown;
      try {
        await db.delete(usersTable).where(eq(usersTable.id, owner));
      } catch (error) {
        failure = error;
      }
      expect(
        await mongo.collection<FixtureRow>("messages").countDocuments({ queryIdTest: marker }),
      ).toBe(1);
      expect(failure).toBeInstanceOf(Error);
      expect((failure as Error).message).toBe("Invalid stored query identifier");
      expect(
        await mongo.collection<FixtureRow>("users").countDocuments({ queryIdTest: marker }),
      ).toBe(2);
      expect(
        await mongo.collection<FixtureRow>("conversations").countDocuments({ queryIdTest: marker }),
      ).toBe(2);
      expect(
        await mongo.collection<FixtureRow>("messages").countDocuments({ queryIdTest: marker }),
      ).toBe(1);
    });
  }

  it("deletes only the owner's conversations and messages for valid IDs", async () => {
    const mongo = await getMongoDatabase();
    const owner = `${marker}-owner`,
      survivor = `${marker}-survivor`;
    await mongo.collection<FixtureRow>("users").insertMany([
      { _id: owner, id: owner, queryIdTest: marker },
      { _id: survivor, id: survivor, queryIdTest: marker },
    ]);
    await mongo.collection<FixtureRow>("conversations").insertMany([
      { _id: `${marker}-chat`, id: `${marker}-chat`, userId: owner, queryIdTest: marker },
      {
        _id: `${marker}-other-chat`,
        id: `${marker}-other-chat`,
        userId: survivor,
        queryIdTest: marker,
      },
    ]);
    await mongo.collection<FixtureRow>("messages").insertMany([
      { _id: `${marker}-message`, conversationId: `${marker}-chat`, queryIdTest: marker },
      {
        _id: `${marker}-other-message`,
        conversationId: `${marker}-other-chat`,
        queryIdTest: marker,
      },
    ]);
    await db.delete(usersTable).where(eq(usersTable.id, owner));
    expect(await mongo.collection<FixtureRow>("users").findOne({ id: owner })).toBeNull();
    expect(
      await mongo.collection<FixtureRow>("conversations").countDocuments({ queryIdTest: marker }),
    ).toBe(1);
    expect(
      await mongo.collection<FixtureRow>("messages").findOne({ queryIdTest: marker }),
    ).toMatchObject({
      conversationId: `${marker}-other-chat`,
    });
  });

  it("deletes a regex-looking conversation ID literally without touching another owner's messages", async () => {
    const mongo = await getMongoDatabase();
    const owner = `${marker}-owner`;
    const survivor = `${marker}-survivor`;
    await mongo.collection<FixtureRow>("users").insertMany([
      { _id: owner, id: owner, queryIdTest: marker },
      { _id: survivor, id: survivor, queryIdTest: marker },
    ]);
    await mongo.collection<FixtureRow>("conversations").insertMany([
      {
        _id: `${marker}-literal-chat`,
        id: ".*",
        userId: owner,
        queryIdTest: marker,
      },
      {
        _id: `${marker}-other-chat`,
        id: survivor,
        userId: survivor,
        queryIdTest: marker,
      },
    ]);
    await mongo.collection<FixtureRow>("messages").insertMany([
      {
        _id: `${marker}-literal-message`,
        conversationId: ".*",
        queryIdTest: marker,
      },
      {
        _id: `${marker}-other-message`,
        conversationId: survivor,
        queryIdTest: marker,
      },
    ]);

    await db.delete(usersTable).where(eq(usersTable.id, owner));

    expect(
      await mongo.collection<FixtureRow>("messages").findOne({ conversationId: ".*" }),
    ).toBeNull();
    expect(
      await mongo.collection<FixtureRow>("messages").findOne({ conversationId: survivor }),
    ).not.toBeNull();
    expect(
      await mongo.collection<FixtureRow>("conversations").findOne({ userId: survivor }),
    ).not.toBeNull();
  });

  it("deletes messages for a safe-integer conversation ID on account deletion", async () => {
    const mongo = await getMongoDatabase();
    const owner = `${marker}-owner`;
    const conversationId = 81234567;
    await mongo.collection<FixtureRow>("users").insertOne({
      _id: owner,
      id: owner,
      queryIdTest: marker,
    });
    await mongo.collection<FixtureRow>("conversations").insertOne({
      _id: `${marker}-numeric-chat`,
      id: conversationId,
      userId: owner,
      queryIdTest: marker,
    });
    await mongo.collection<FixtureRow>("messages").insertOne({
      _id: `${marker}-numeric-message`,
      conversationId,
      queryIdTest: marker,
    });

    await db.delete(usersTable).where(eq(usersTable.id, owner));

    expect(
      await mongo.collection<FixtureRow>("messages").findOne({ queryIdTest: marker }),
    ).toBeNull();
    expect(
      await mongo.collection<FixtureRow>("conversations").findOne({ queryIdTest: marker }),
    ).toBeNull();
  });
});
