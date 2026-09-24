import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { MongoClient, type Db } from "mongodb";
import {
  authorizeMessageOwnershipMigration,
  backfillMessageOwnership,
} from "./migrate-message-ownership";

let replica: MongoMemoryReplSet;
let client: MongoClient;
let sequence = 0;
type Fixture = { _id: string; [key: string]: unknown };

before(async () => {
  replica = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  client = new MongoClient(replica.getUri());
  await client.connect();
});

after(async () => {
  await client.close();
  await replica.stop();
});

function disposableDatabase(): Db {
  sequence += 1;
  return client.db(`message_ownership_test_${sequence}`);
}

test("is dry-run by default, then writes idempotently after full validation", async () => {
  const database = disposableDatabase();
  await database.collection<Fixture>("conversations").insertMany([
    { _id: "conversation-a", id: 11, userId: "owner-a" },
    { _id: "conversation-b", id: 12, userId: "owner-b" },
  ]);
  await database.collection<Fixture>("messages").insertMany([
    { _id: "message-a", id: 21, conversationId: 11, role: "user", content: "old" },
    {
      _id: "message-b",
      id: 22,
      conversationId: 12,
      userId: "owner-b",
      role: "user",
      content: "new",
    },
  ]);

  assert.deepEqual(await backfillMessageOwnership(database), {
    scanned: 2,
    alreadyOwned: 1,
    missingOwner: 1,
    modified: 0,
  });
  assert.equal(
    await database.collection<Fixture>("messages").countDocuments({ userId: { $exists: false } }),
    1,
  );
  assert.deepEqual(await backfillMessageOwnership(database, { write: true }), {
    scanned: 2,
    alreadyOwned: 1,
    missingOwner: 1,
    modified: 1,
  });
  assert.deepEqual(await backfillMessageOwnership(database, { write: true }), {
    scanned: 2,
    alreadyOwned: 2,
    missingOwner: 0,
    modified: 0,
  });
});

test("rejects orphaned, ambiguous, and conflicting ownership before writes", async () => {
  for (const kind of ["orphan", "ambiguous", "conflict"] as const) {
    const database = disposableDatabase();
    await database.collection<Fixture>("conversations").insertOne({
      _id: `${kind}-conversation-a`,
      id: 31,
      userId: "owner-a",
    });
    if (kind === "ambiguous") {
      await database.collection<Fixture>("conversations").insertOne({
        _id: `${kind}-conversation-b`,
        id: 31,
        userId: "owner-b",
      });
    }
    await database.collection<Fixture>("messages").insertMany([
      { _id: `${kind}-safe`, id: 41, conversationId: 31, content: "safe" },
      {
        _id: `${kind}-invalid`,
        id: 42,
        conversationId: kind === "orphan" ? 999 : 31,
        ...(kind === "conflict" ? { userId: "owner-b" } : {}),
        content: "invalid",
      },
    ]);

    await assert.rejects(
      backfillMessageOwnership(database, { write: true }),
      kind === "conflict" ? /does not match/ : /exactly one conversation/,
    );
    assert.equal(
      await database.collection<Fixture>("messages").countDocuments({ userId: { $exists: false } }),
      kind === "conflict" ? 1 : 2,
    );
  }
});

test("requires explicit write confirmation and non-production identity", () => {
  const uri = "mongodb://127.0.0.1:27017";
  assert.equal(
    authorizeMessageOwnershipMigration([], "development", uri, "kindred_staging"),
    false,
  );
  assert.equal(
    authorizeMessageOwnershipMigration(
      ["--write", "--non-production"],
      "staging",
      uri,
      "kindred_staging",
    ),
    true,
  );
  assert.throws(
    () => authorizeMessageOwnershipMigration(["--write"], "development", uri, "kindred_dev"),
    /both --write and --non-production/,
  );
  assert.throws(
    () => authorizeMessageOwnershipMigration([], "production", uri, "kindred_staging"),
    /never run in production/,
  );
  assert.throws(
    () => authorizeMessageOwnershipMigration([], "development", uri, "kindred"),
    /explicitly non-production database/,
  );
});
