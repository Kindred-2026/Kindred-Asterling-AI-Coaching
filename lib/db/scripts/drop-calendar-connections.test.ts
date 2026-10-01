import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, before, test } from "node:test";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { MongoClient } from "mongodb";
import { DataType, newDb } from "pg-mem";
import {
  dropMongoCalendarConnections,
  dropPostgresCalendarConnections,
  parseConfirmation,
} from "./drop-calendar-connections";

let replica: MongoMemoryReplSet;
let client: MongoClient;

before(async () => {
  replica = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  client = new MongoClient(replica.getUri());
  await client.connect();
});

after(async () => {
  await client.close();
  await replica.stop();
});

test("parses only an explicit --confirm=<database>", () => {
  assert.equal(parseConfirmation([]), null);
  assert.equal(parseConfirmation(["--"]), null);
  assert.equal(parseConfirmation(["--confirm=kindred"]), "kindred");
  assert.throws(() => parseConfirmation(["--confirm", "kindred"]), /Unknown argument: --confirm/);
  assert.throws(() => parseConfirmation(["--write"]), /Unknown argument/);
});

test("Mongo: dry run counts, wrong name keeps, matching name drops", async () => {
  const database = client.db("calendar_drop_test");
  await database.collection("calendar_connections").insertMany([
    { userId: "owner-a", encryptedRefreshToken: "synthetic-a" },
    { userId: "owner-b", encryptedRefreshToken: "synthetic-b" },
  ]);
  await database.collection("users").insertOne({ id: "owner-a" });

  const dryRun = await dropMongoCalendarConnections(database, null);
  assert.deepEqual(dryRun, { provider: "mongo", database: "calendar_drop_test", present: true, rows: 2, dropped: false });
  assert.equal((await dropMongoCalendarConnections(database, "kindred")).dropped, false);
  assert.equal(await database.collection("calendar_connections").countDocuments(), 2);

  const dropped = await dropMongoCalendarConnections(database, "calendar_drop_test");
  assert.equal(dropped.dropped, true);
  const names = (await database.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name);
  assert.deepEqual(names, ["users"]);

  const rerun = await dropMongoCalendarConnections(database, "calendar_drop_test");
  assert.deepEqual(rerun, { provider: "mongo", database: "calendar_drop_test", present: false, rows: 0, dropped: false });
});

test("Postgres: applies 0002 only for the matching database", async () => {
  const memory = newDb();
  memory.public.registerFunction({ name: "clock_timestamp", returns: DataType.timestamptz, implementation: () => new Date(), impure: true });
  memory.public.registerFunction({ name: "current_database", returns: DataType.text, implementation: () => "kindred_test" });
  memory.public.none(await readFile(new URL("../migrations-postgres/0001_rehearsal_core.sql", import.meta.url), "utf8"));
  memory.public.none(`INSERT INTO users (id) VALUES ('owner-a');
    INSERT INTO calendar_connections (user_id, encrypted_refresh_token) VALUES ('owner-a', 'synthetic');`);
  const { Client } = memory.adapters.createPg();
  const pgClient = new Client();
  await pgClient.connect();
  const dropSql = await readFile(new URL("../migrations-postgres/0002_drop_calendar_connections.sql", import.meta.url), "utf8");
  try {
    assert.deepEqual(await dropPostgresCalendarConnections(pgClient, null, dropSql), {
      provider: "postgres", database: "kindred_test", present: true, rows: 1, dropped: false,
    });
    assert.equal((await dropPostgresCalendarConnections(pgClient, "other", dropSql)).dropped, false);
    assert.equal((await dropPostgresCalendarConnections(pgClient, "kindred_test", dropSql)).dropped, true);
    const after = await dropPostgresCalendarConnections(pgClient, "kindred_test", dropSql);
    assert.deepEqual(after, { provider: "postgres", database: "kindred_test", present: false, rows: 0, dropped: false });
    assert.equal((await pgClient.query("SELECT count(*) AS count FROM users")).rows[0].count, 1);
  } finally {
    await pgClient.end();
  }
});
