import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { newDb } from "pg-mem";
import {
  PostgresDataApi,
  DatabaseLeaseUnavailableError,
  and,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  initializePostgresDatabase,
  closePostgresDatabase,
} from "./postgresDb";
import { affirmationsTable, conversations, messages, usersTable } from "./mongoSchema";

const schemaPath = fileURLToPath(new URL("../migrations-postgres/0001_rehearsal_core.sql", import.meta.url));

async function fixture(): Promise<{ api: PostgresDataApi; pool: any }> {
  const memory = newDb();
  memory.public.none(await readFile(schemaPath, "utf8"));
  const Pg = memory.adapters.createPg();
  const pool = new Pg.Pool();
  return { api: new PostgresDataApi(pool), pool };
}

async function seed(api: PostgresDataApi): Promise<void> {
  await api.insert(usersTable).values({ id: "owner-a", email: "a@example.test" }).returning();
  await api.insert(conversations).values([
    { id: 1, userId: "owner-a", title: "one" },
    { id: 2, userId: "owner-a", title: "two" },
  ]).returning();
  await api.insert(messages).values({ id: 7, conversationId: 1, userId: "owner-a", role: "user", content: "hello" });
}

test("translates supported conditions and rejects forged or cross-table conditions", async () => {
  const { api, pool } = await fixture();
  try {
    await seed(api);
    const rows = await api.select({ id: conversations.id, title: conversations.title })
      .from(conversations).where(and(gt(conversations.id, 0), inArray(conversations.status, ["active"])))
      .orderBy(desc(conversations.id)).limit(1);
    assert.deepEqual(rows, [{ id: 2, title: "two" }]);
    assert.throws(() => api.select().from(conversations).where({ $gt: 1 } as any), /Invalid database condition/);
    assert.throws(() => eq(conversations.id, usersTable.id), /Cross-table/);
    assert.throws(() => eq({ key: "missing", tableName: "conversations" } as any, 1), /Invalid database condition column/);
    const nullRows = await api.select().from(usersTable).where(isNull(usersTable.clerkUserId));
    assert.equal(nullRows.length, 1);
  } finally { await pool.end(); }
});

test("preserves defaults, IDs, conflict targets, updates, deletes, count and cascades", async () => {
  const { api, pool } = await fixture();
  try {
    await seed(api);
    const user = (await api.select().from(usersTable).where(eq(usersTable.id, "owner-a")))[0]!;
    assert.equal(user.id, "owner-a");
    assert.ok(user.createdAt instanceof Date);
    const updated = await api.insert(usersTable).values({ id: "owner-a", email: "changed@example.test" })
      .onConflictDoUpdate({ target: usersTable.id, set: { email: "updated@example.test" }, setWhere: eq(usersTable.id, "owner-a") }).returning();
    assert.equal(updated[0]?.email, "updated@example.test");
    await api.insert(conversations).values({ id: 2, userId: "owner-a", title: "ignored" }).onConflictDoNothing({ target: conversations.id });
    assert.equal(await api.count(conversations, eq(conversations.userId, "owner-a")), 2);
    const changed = await api.update(conversations).set({ status: "archived" }).where(inArray(conversations.id, [1, 2])).returning({ id: conversations.id, status: conversations.status });
    assert.equal(changed.length, 2);
    const deleted = await api.delete(conversations).where(eq(conversations.id, 2)).returning();
    assert.equal(deleted.length, 1);
    await api.delete(usersTable).where(eq(usersTable.id, "owner-a"));
    assert.equal(await api.count(messages), 0);
  } finally { await pool.end(); }
});

test("uses database identity sequences for generated integer IDs", async () => {
  const { api, pool } = await fixture();
  try {
    const inserted = await api.insert(affirmationsTable).values([
      { text: "first" },
      { text: "second" },
    ]).returning();
    assert.equal(inserted.length, 2);
    assert.ok(Number.isInteger(inserted[0]?.id));
    assert.equal(inserted[1]?.id, Number(inserted[0]?.id) + 1);
  } finally { await pool.end(); }
});

test("updates daily usage and performs case-insensitive legacy identity lookup", async () => {
  const { api, pool } = await fixture();
  try {
    await seed(api);
    assert.deepEqual(await api.findUsersByEmail("A@EXAMPLE.TEST"), ["owner-a"]);
    assert.equal(await api.incrementDailyUsage("owner-a", "2026-09-24", 2), 1);
    assert.equal(await api.incrementDailyUsage("owner-a", "2026-09-24", 2), 2);
    await api.refundDailyUsage("owner-a", "2026-09-24");
    assert.equal(await api.incrementDailyUsage("owner-a", "2026-09-24", 2), 2);
  } finally { await pool.end(); }
});

test("rolls back failed transactions and serializes database-backed leases", async () => {
  const { api, pool } = await fixture();
  try {
    const statements: string[] = [];
    const connection = {
      async query(sql: string) { statements.push(sql); return { rows: [], rowCount: 0 }; },
      release() {},
    };
    const transactionApi = new PostgresDataApi({ connect: async () => connection } as any);
    await assert.rejects(transactionApi.transaction(async () => {
      throw new Error("abort");
    }), /abort/);
    assert.deepEqual(statements, ["BEGIN", "ROLLBACK"]);
    const nestedStatements: string[] = [];
    const transactionConnection = {
      async query(sql: string) { nestedStatements.push(sql); return { rows: [], rowCount: 0 }; },
      release() {},
    };
    await assert.rejects(new PostgresDataApi(transactionConnection as any, true).transaction(async () => {
      throw new Error("nested abort");
    }), /nested abort/);
    assert.match(nestedStatements[0] ?? "", /^SAVEPOINT kindred_[a-f0-9]+$/);
    const savepoint = nestedStatements[0]?.split(" ")[1];
    assert.deepEqual(nestedStatements.slice(1), [
      `ROLLBACK TO SAVEPOINT ${savepoint}`,
      `RELEASE SAVEPOINT ${savepoint}`,
    ]);
    let held = false;
    await api.withDatabaseLease("test", "one", 1000, async () => {
      held = true;
      await assert.rejects(api.withDatabaseLease("test", "one", 1000, async () => undefined), DatabaseLeaseUnavailableError);
    });
    assert.equal(held, true);
  } finally { await pool.end(); }
});

test("rejects malformed sort values and supports empty logical conditions", async () => {
  const { api, pool } = await fixture();
  try {
    assert.throws(() => api.select().from(conversations).orderBy({ sort: { nope: 1 } } as any), /Invalid database sort/);
    assert.equal(await api.count(conversations, and()), 0);
  } finally { await pool.end(); }
});

test("supports deterministic ping, close and reinitialization with an embedded pool", async () => {
  const first = await fixture();
  await first.api.initialize();
  await first.api.ping();
  await first.api.close();
  const second = await fixture();
  try { await second.api.initialize(); } finally { await second.api.close(); }
});

test("startup refuses an incomplete PostgreSQL schema", async () => {
  const complete = await fixture();
  try {
    await initializePostgresDatabase({ pool: complete.pool });
  } finally {
    await closePostgresDatabase();
  }

  const memory = newDb();
  memory.public.none("CREATE TABLE users (id text PRIMARY KEY)");
  const Pg = memory.adapters.createPg();
  const incompletePool = new Pg.Pool();
  try {
    await assert.rejects(
      initializePostgresDatabase({ pool: incompletePool }),
      /PostgreSQL schema is incomplete/,
    );
  } finally {
    await closePostgresDatabase();
  }
});
