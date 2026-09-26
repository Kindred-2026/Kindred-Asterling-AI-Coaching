import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { lookup } from "node:dns/promises";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import {
  PostgresDataApi,
  DatabaseLeaseUnavailableError,
  and,
  asc,
  eq,
  gt,
  inArray,
  initializePostgresDatabase,
  closePostgresDatabase,
} from "./postgresDb";
import { assertEmptyTarget } from "./postgresTargetGuard";
import { affirmationsTable, conversations, dailyUsageTable, usersTable } from "./mongoSchema";

const optIn = "I_UNDERSTAND_THIS_IS_A_DISPOSABLE_REHEARSAL_DATABASE";
const migrationPath = fileURLToPath(new URL("../migrations-postgres/0001_rehearsal_core.sql", import.meta.url));

type HostResolver = (hostname: string) => Promise<readonly string[]>;
type GuardConfig = {
  nodeEnv?: string;
  confirmation?: string;
  targetUrl?: string;
  runtimeUrl?: string;
  resolveHost?: HostResolver;
};

async function targetFromEnvironment(env: GuardConfig): Promise<string> {
  if (env.nodeEnv !== "test") throw new Error("PostgreSQL integration requires NODE_ENV=test");
  if (env.confirmation !== optIn) throw new Error(`Set POSTGRES_INTEGRATION_CONFIRM=${optIn} to opt in`);
  if (!env.targetUrl) throw new Error("POSTGRES_INTEGRATION_URL is required");
  let target: URL;
  try { target = new URL(env.targetUrl); } catch { throw new Error("POSTGRES_INTEGRATION_URL must be a PostgreSQL URL"); }
  if (!["postgres:", "postgresql:"].includes(target.protocol) || !target.hostname || !target.pathname.slice(1)) {
    throw new Error("POSTGRES_INTEGRATION_URL must identify a PostgreSQL database");
  }
  if (!target.pathname.slice(1).startsWith("kindred_rehearsal_")) {
    throw new Error("Target database name must start with kindred_rehearsal_");
  }
  if (env.runtimeUrl) {
    let runtime: URL;
    try { runtime = new URL(env.runtimeUrl); } catch { throw new Error("POSTGRES_URL is not a valid PostgreSQL URL"); }
    if (!["postgres:", "postgresql:"].includes(runtime.protocol) || !runtime.hostname) {
      throw new Error("POSTGRES_URL is not a valid PostgreSQL URL");
    }
    const resolveHost = env.resolveHost ?? (async (hostname: string) =>
      (await lookup(hostname, { all: true })).map(({ address }) => address));
    const [targetAddresses, runtimeAddresses] = await Promise.all([
      resolveHost(target.hostname),
      resolveHost(runtime.hostname),
    ]);
    const runtimeEndpoints = new Set(runtimeAddresses.map((address) =>
      `${address.toLowerCase()}|${runtime.port || "5432"}`));
    if (targetAddresses.some((address) =>
      runtimeEndpoints.has(`${address.toLowerCase()}|${target.port || "5432"}`))) {
      throw new Error("Integration target must not use the runtime POSTGRES_URL host");
    }
  }
  return env.targetUrl;
}

test("no-database guards fail closed before creating a connection", async () => {
  const base = { nodeEnv: "test", confirmation: optIn, targetUrl: "postgres://user:pass@localhost/kindred_rehearsal_fixture" };
  await assert.rejects(targetFromEnvironment({ ...base, nodeEnv: "development" }), /NODE_ENV=test/);
  await assert.rejects(targetFromEnvironment({ ...base, confirmation: "" }), /POSTGRES_INTEGRATION_CONFIRM/);
  await assert.rejects(targetFromEnvironment({ ...base, targetUrl: "postgres://localhost/other" }), /kindred_rehearsal_/);
  await assert.rejects(targetFromEnvironment({ ...base, runtimeUrl: "postgres://runtime:secret@LOCALHOST:5432/app" }), /runtime POSTGRES_URL host/);
  await assert.rejects(targetFromEnvironment({ ...base, targetUrl: "not a url" }), /must be a PostgreSQL URL/);
  const aliases = { resolveHost: async (hostname: string) =>
    hostname === "localhost" ? ["127.0.0.1"] : [hostname] };
  await assert.rejects(targetFromEnvironment({ ...base, runtimeUrl: "postgres://127.0.0.1:5432/app", ...aliases }), /runtime POSTGRES_URL host/);
});

const live = !!process.env.POSTGRES_INTEGRATION_URL;
test("real PostgreSQL rehearsal exercises PostgresDataApi", { skip: !live }, async () => {
  const connectionString = await targetFromEnvironment({
    nodeEnv: process.env.NODE_ENV,
    confirmation: process.env.POSTGRES_INTEGRATION_CONFIRM,
    targetUrl: process.env.POSTGRES_INTEGRATION_URL,
    runtimeUrl: process.env.POSTGRES_URL,
  });
  const pool = new Pool({ connectionString, max: 4, connectionTimeoutMillis: 5000 });
  let api = new PostgresDataApi();
  const run = randomUUID();
  const userId = `postgres-integration-${run}`;
  const email = `${run}@integration.invalid`;
  const leaseNamespace = `integration-${run}`;
  const affirmationIds: number[] = [];
  let initialized = false;
  let seeded = false;
  let precheckPoolOpen = true;
  try {
    // Check database-wide user objects using the empty-target guard.
    // This allows only objects belonging to explicitly allowlisted extensions
    // (plpgsql, pg_stat_monitor, pgaudit) and rejects everything else.
    await assertEmptyTarget(pool);
    // Real catalogs prove extension membership cannot be spoofed by object names.
    const guardClient = await pool.connect();
    try {
      for (const ddl of [
        "CREATE TABLE public.kindred_guard_probe (id int)",
        "CREATE VIEW public.kindred_guard_probe AS SELECT 1 AS id",
        "CREATE SEQUENCE public.kindred_guard_probe",
        "CREATE FUNCTION public.pg_stat_monitor_version(integer) RETURNS integer LANGUAGE SQL AS 'SELECT $1'",
        "CREATE TYPE public.kindred_guard_probe AS ENUM ('fixture')",
        "CREATE DOMAIN public.kindred_guard_probe AS integer",
        "CREATE TYPE public.kindred_guard_probe AS RANGE (subtype = integer)",
        "CREATE TYPE public.kindred_guard_probe AS (id integer)",
        "CREATE SCHEMA kindred_guard_probe",
      ]) {
        await guardClient.query("BEGIN");
        try {
          await guardClient.query(ddl);
          await assert.rejects(assertEmptyTarget(guardClient), /unreviewed objects/, ddl);
        } finally {
          await guardClient.query("ROLLBACK");
        }
        await assertEmptyTarget(guardClient);
      }
    } finally { guardClient.release(); }
    await pool.end();
    precheckPoolOpen = false;

    const sql = await readFile(migrationPath, "utf8");
    const migrationPool = new Pool({ connectionString, max: 4, connectionTimeoutMillis: 5000 });
    try { await migrationPool.query(sql); } finally { await migrationPool.end(); }
    initialized = true;
    await initializePostgresDatabase({ url: connectionString });

    await api.insert(usersTable).values({ id: userId, email }).returning();
    seeded = true;
    const inserted = await api.insert(conversations).values([
      { userId, title: `${run}-first` }, { userId, title: `${run}-second` },
    ]).returning();
    assert.equal(inserted.length, 2);
    const ids = inserted.map(({ id }) => id);
    assert.ok(ids[1]! > ids[0]!);
    const selected = await api.select({ id: conversations.id, title: conversations.title })
      .from(conversations).where(and(eq(conversations.userId, userId), gt(conversations.id, 0)))
      .orderBy(asc(conversations.id));
    assert.deepEqual(selected.map((row) => row.title), [`${run}-first`, `${run}-second`]);
    assert.equal(Object.keys(selected[0]!).length, 2);
    const changed = await api.update(conversations).set({ status: "archived" })
      .where(inArray(conversations.id, ids)).returning({ id: conversations.id, status: conversations.status });
    assert.equal(changed.length, 2);
    assert.equal((await api.insert(conversations).values({ id: ids[0], userId, title: "duplicate" })
      .onConflictDoNothing({ target: conversations.id }).returning()).length, 0);
    const upsert = await api.insert(usersTable).values({ id: userId, email })
      .onConflictDoUpdate({ target: usersTable.id, set: { email: `${run}+updated@integration.invalid` }, setWhere: eq(usersTable.id, userId) }).returning();
    assert.equal(upsert[0]?.email, `${run}+updated@integration.invalid`);

    const sequenceRows = await api.insert(affirmationsTable).values([{ text: `${run}-a` }, { text: `${run}-b` }]).returning();
    affirmationIds.push(...sequenceRows.map(({ id }) => id));
    assert.equal(sequenceRows.length, 2);
    assert.equal(sequenceRows[1]!.id, sequenceRows[0]!.id + 1);

    await assert.rejects(api.transaction(async (tx) => {
      await tx.update(conversations).set({ status: "active" }).where(inArray(conversations.id, ids));
      await tx.transaction(async (nested) => {
        await nested.update(conversations).set({ title: "nested-rollback" }).where(eq(conversations.id, ids[0]!));
        throw new Error("nested rollback marker");
      });
    }), /nested rollback marker/);
    const rolledBack = await api.select().from(conversations).where(inArray(conversations.id, ids)).orderBy(asc(conversations.id));
    assert.ok(rolledBack.every((row) => row.status === "archived"));
    assert.equal(rolledBack[0]?.title, `${run}-first`);

    const usageDate = new Date().toISOString().slice(0, 10);
    assert.equal(await api.incrementDailyUsage(userId, usageDate, 2), 1);
    assert.equal(await api.incrementDailyUsage(userId, usageDate, 2), 2);
    assert.equal(await api.incrementDailyUsage(userId, usageDate, 2), null);
    await api.refundDailyUsage(userId, usageDate);
    assert.equal(await api.incrementDailyUsage(userId, usageDate, 2), 2);
    await api.withDatabaseLease(leaseNamespace, "held", 1000, async () => {
      await assert.rejects(api.withDatabaseLease(leaseNamespace, "held", 1000, async () => undefined), DatabaseLeaseUnavailableError);
    });
    assert.equal(await api.count(dailyUsageTable, eq(dailyUsageTable.userId, userId)), 1);

    const removed = await api.delete(conversations).where(inArray(conversations.id, ids)).returning();
    assert.equal(removed.length, 2);
    await api.close();
    api = new PostgresDataApi();
    await initializePostgresDatabase({ url: connectionString });
    await api.initialize();
    assert.equal(await api.count(conversations, eq(conversations.userId, userId)), 0);
  } finally {
    if (seeded) {
      // Delete only this run's synthetic rows; owner FK cascades its dependent records.
      if (affirmationIds.length) await api.delete(affirmationsTable).where(inArray(affirmationsTable.id, affirmationIds));
      await api.query("DELETE FROM database_leases WHERE lease_key LIKE $1", [`${leaseNamespace}:%`]);
      await api.delete(usersTable).where(eq(usersTable.id, userId));
    }
    if (initialized) await closePostgresDatabase();
    else if (precheckPoolOpen) await pool.end();
  }
});
