import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { newDb } from "pg-mem";
import type { Db } from "mongodb";
import { authorizeTarget, readMongoSnapshot } from "./rehearse-mongo-to-postgres";
import {
  assertRehearsalSchemaCoverage,
  rehearsalColumns,
  rehearsalTables,
  replayRehearsal,
  validateRehearsal,
  type RehearsalSnapshot,
} from "../src/postgresRehearsal";
import { snakeCase } from "../src/migrationSupport";

const sqlPath = fileURLToPath(
  new URL("../migrations-postgres/0001_rehearsal_core.sql", import.meta.url),
);
const fixture = (): RehearsalSnapshot =>
  ({
    ...Object.fromEntries(rehearsalTables.map((table) => [table, []])),
    users: [
      { id: "kindred-owner-a", auth0UserId: "auth0|a", email: "same@example.test" },
      { id: "kindred-owner-b", auth0UserId: "auth0|b" },
    ],
    conversations: [{ id: 71, userId: "kindred-owner-a", title: "History" }],
    messages: [{ id: 23, conversationId: 71, role: "user", content: "Private" }],
    habits: [{ id: 41, userId: "kindred-owner-a", name: "Walk", startDate: "2026-09-21" }],
    habit_entries: [{ id: 51, userId: "kindred-owner-a", habitId: 41, date: "2026-09-22" }],
    daily_usage: [{ userId: "kindred-owner-a", date: "2026-09-22", count: 2 }],
    affirmations: [{ id: 1, text: "Keep going" }],
    beta_grants: [{ id: "beta-1", userId: "kindred-owner-a", grantedBy: "kindred-owner-b" }],
    body_scans: [{ id: 31, userId: "kindred-owner-a", energyLevel: 4, feelings: ["calm"] }],
    calendar_connections: [
      { userId: "kindred-owner-a", encryptedRefreshToken: "synthetic-ciphertext" },
    ],
    entitlement_audit: [
      {
        id: "audit-1",
        userId: "kindred-owner-a",
        actorId: "kindred-owner-b",
        action: "test",
        metadata: { synthetic: true },
      },
    ],
    evening_reports: [
      { id: 32, userId: "kindred-owner-a", date: "2026-09-22", medicationEffectiveness: 3 },
    ],
    medications: [
      { id: 33, userId: "kindred-owner-a", name: "Synthetic", dosage: "1", times: ["08:00"] },
    ],
    medication_logs: [
      {
        id: 34,
        medicationId: 33,
        userId: "kindred-owner-a",
        date: "2026-09-22",
        scheduledTime: "08:00",
      },
    ],
    medication_schedule_entries: [
      {
        id: 35,
        medicationId: 33,
        userId: "kindred-owner-a",
        startDate: "2026-09-21",
        scheduledTime: "08:00",
      },
    ],
    morning_logs: [
      {
        id: 36,
        userId: "kindred-owner-a",
        date: "2026-09-22",
        mentalLoadLevel: "low",
        miniGoals: ["walk"],
      },
    ],
    processed_webhooks: [{ webhookId: "synthetic-event", eventType: "checkout.completed" }],
    reminder_settings: [{ userId: "kindred-owner-a", morningEnabled: true }],
    reminder_deliveries: [
      {
        id: 37,
        userId: "kindred-owner-a",
        type: "morning",
        localDate: "2026-09-22",
        channel: "email",
      },
    ],
    subscriptions: [
      { userId: "kindred-owner-a", status: "active", paymentCustomerId: "synthetic-customer" },
    ],
  }) as RehearsalSnapshot;

async function database() {
  const memory = newDb();
  // pg-mem uses PostgreSQL syntax and enforces PK/FK/unique/index constraints.
  memory.public.none(await readFile(sqlPath, "utf8"));
  const adapter = memory.adapters.createPg();
  const client = new adapter.Client();
  await client.connect();
  return client;
}

test("rehearses all tables with stable Kindred IDs, owner isolation and cascade", async () => {
  const client = await database();
  try {
    const rows = fixture();
    const counts = await replayRehearsal(client, rows, {
      write: true,
      environment: "test",
      confirmNonProduction: true,
    });
    assert.equal(Object.keys(counts).length, 20);
    assert.equal(counts.users, 2);
    assert.equal(counts.messages, 1);
    const owner = await client.query("SELECT id, auth0_user_id FROM users WHERE id = $1", [
      "kindred-owner-a",
    ]);
    assert.equal(owner.rows[0]?.id, "kindred-owner-a");
    assert.equal(owner.rows[0]?.auth0_user_id, "auth0|a");
    assert.equal(
      (await client.query("SELECT id FROM conversations WHERE user_id = $1", ["kindred-owner-b"]))
        .rows.length,
      0,
    );
    await assert.rejects(
      client.query("INSERT INTO users (id, auth0_user_id) VALUES ($1, $2)", ["another", "auth0|a"]),
    );
    await client.query("DELETE FROM users WHERE id = $1", ["kindred-owner-a"]);
    for (const table of rehearsalTables.filter(
      (name) => name !== "users" && name !== "affirmations" && name !== "processed_webhooks",
    )) {
      assert.equal((await client.query(`SELECT * FROM ${table}`)).rows.length, 0, table);
    }
    assert.equal((await client.query("SELECT * FROM users")).rows.length, 1);
  } finally {
    await client.end();
  }
});

test("rejects cross-account relationships, orphan identities and unreviewed fields before SQL", () => {
  const crossAccount = fixture();
  crossAccount.habit_entries = [
    { id: 51, userId: "kindred-owner-b", habitId: 41, date: "2026-09-22" },
  ];
  assert.throws(() => validateRehearsal(crossAccount), /crosses account boundary/);
  const orphan = fixture();
  orphan.messages = [{ id: 23, conversationId: 999, role: "user", content: "Private" }];
  assert.throws(() => validateRehearsal(orphan), /orphaned conversationId/);
  const unknown = fixture();
  unknown.users = [{ id: "kindred-owner-a", undocumented: true }];
  assert.throws(() => validateRehearsal(unknown), /Unreviewed users.undocumented/);
});

test("SQL constraints reject cross-owner habits, preserve unique indexes and reject duplicate replay", async () => {
  const client = await database();
  try {
    await replayRehearsal(client, fixture(), {
      write: true,
      environment: "test",
      confirmNonProduction: true,
    });
    await assert.rejects(
      client.query(
        "INSERT INTO habit_entries (id, user_id, habit_id, date) VALUES ($1, $2, $3, $4)",
        [55, "kindred-owner-b", 41, "2026-09-23"],
      ),
    );
    await assert.rejects(
      replayRehearsal(client, fixture(), {
        write: true,
        environment: "test",
        confirmNonProduction: true,
      }),
    );
    assert.equal((await client.query("SELECT * FROM users")).rows.length, 2);
    assert.equal((await client.query("SELECT * FROM messages")).rows.length, 1);
  } finally {
    await client.end();
  }
});

test("defaults to dry-run and requires an explicit non-production write gate", async () => {
  const client = await database();
  try {
    await assert.rejects(
      replayRehearsal(client, fixture(), { write: true }),
      /Writes require explicit/,
    );
    assert.equal((await client.query("SELECT * FROM users")).rows.length, 0);
    const statements: string[] = [];
    await replayRehearsal(
      {
        query: async (sql, values) => {
          statements.push(sql);
          return client.query(sql, values as unknown[]);
        },
      },
      fixture(),
    );
    assert.equal(statements[0], "BEGIN");
    assert.equal(statements.at(-1), "ROLLBACK");
    // pg-mem does not implement transactional rollback; do not claim this is
    // a PostgreSQL rollback test. Real-PG verification remains a cutover gate.
  } finally {
    await client.end();
  }
});

test("replays deterministically into a clean embedded schema", async () => {
  const first = await database();
  const restored = await database();
  try {
    const options = { write: true, environment: "test", confirmNonProduction: true } as const;
    await replayRehearsal(first, fixture(), options);
    await replayRehearsal(restored, fixture(), options);
    for (const [table, fields] of [
      ["users", "id, auth0_user_id"],
      ["conversations", "id, user_id, title"],
      ["messages", "id, conversation_id, content"],
      ["habits", "id, user_id, name"],
      ["habit_entries", "id, habit_id, user_id"],
      ["daily_usage", "user_id, date, count"],
    ]) {
      const original = await first.query(`SELECT ${fields} FROM ${table}`);
      const replayed = await restored.query(`SELECT ${fields} FROM ${table}`);
      assert.deepEqual(replayed.rows, original.rows, table);
    }
  } finally {
    await first.end();
    await restored.end();
  }
});

test("checks every current Mongo table and rejects unsafe values before a transaction", async () => {
  const snapshot = fixture();
  assert.equal(rehearsalTables.length, 20);
  for (const [table, field, value] of [
    ["users", "id", { $gt: "" }],
    ["users", "createdAt", "yesterday"],
    ["morning_logs", "miniGoals", ["okay", 99]],
    ["evening_reports", "date", "2026-02-30"],
    ["medication_logs", "effectiveness", Number.NaN],
    ["entitlement_audit", "metadata", ["not-an-object"]],
    ["reminder_settings", "emailEnabled", "yes"],
  ] as const) {
    const invalid = fixture();
    invalid[table] = [{ ...invalid[table][0], [field]: value }];
    assert.throws(() => validateRehearsal(invalid), /Invalid/);
  }
  snapshot.subscriptions = [...snapshot.subscriptions, snapshot.subscriptions[0]!];
  assert.throws(() => validateRehearsal(snapshot), /Duplicate subscriptions ID/);
});

test("rejects orphaned owners, cross-owner medication records and secondary actors", () => {
  const orphan = fixture();
  orphan.reminder_deliveries = [{ ...orphan.reminder_deliveries[0]!, userId: "missing" }];
  assert.throws(() => validateRehearsal(orphan), /orphaned userId/);
  const crossOwner = fixture();
  crossOwner.medication_logs = [{ ...crossOwner.medication_logs[0]!, userId: "kindred-owner-b" }];
  assert.throws(() => validateRehearsal(crossOwner), /crosses account boundary/);
  const actor = fixture();
  actor.beta_grants = [{ ...actor.beta_grants[0]!, grantedBy: "missing" }];
  assert.throws(() => validateRehearsal(actor), /orphaned grantedBy/);
});

test("requires a dedicated non-production target and two explicit write flags", () => {
  const url = "postgresql://localhost/kindred_rehearsal_fixture";
  assert.equal(authorizeTarget([], "test", url), false);
  assert.equal(authorizeTarget(["--write", "--non-production"], "development", url), true);
  assert.throws(() => authorizeTarget(["--write"], "test", url), /requires/);
  assert.throws(
    () => authorizeTarget(["--write", "--non-production"], "production", url),
    /NODE_ENV/,
  );
  assert.throws(() => authorizeTarget([], "test", "postgresql://localhost/kindred"), /dedicated/);
  assert.throws(() => authorizeTarget([], "test", url, url), /share a host/);
  assert.throws(
    () =>
      authorizeTarget(
        ["--write", "--non-production"],
        "development",
        "postgresql://staging:secret@localhost:5432/kindred_rehearsal_stage",
        "postgresql://runtime:secret@localhost:5432/kindred",
      ),
    /share a host/,
  );
  assert.throws(() => authorizeTarget(["--unknown"], "test", url), /Unrecognized/);
});

test("SQL columns match every reviewed Mongo field exactly", async () => {
  assertRehearsalSchemaCoverage();
  const client = await database();
  try {
    for (const table of rehearsalTables) {
      const columns = await client.query(
        "SELECT column_name FROM information_schema.columns WHERE table_name = $1",
        [table],
      );
      assert.deepEqual(
        columns.rows.map((row: { column_name: string }) => row.column_name).sort(),
        rehearsalColumns[table].map(snakeCase).sort(),
        table,
      );
    }
  } finally {
    await client.end();
  }
});

test("source reader batches every collection and projects away Mongo _id", async () => {
  const seen: string[] = [];
  const fake = {
    collection(name: string) {
      seen.push(name);
      return {
        find(_filter: unknown, options: { projection: Record<string, number>; batchSize: number }) {
          assert.deepEqual(options, { projection: { _id: 0 }, batchSize: 500, session: undefined });
          return {
            async *[Symbol.asyncIterator]() {
              if (name === "users") yield { id: "synthetic" };
            },
            async close() {},
          };
        },
      };
    },
  } as unknown as Db;
  const snapshot = await readMongoSnapshot(fake);
  assert.deepEqual(seen, rehearsalTables);
  assert.deepEqual(snapshot.users, [{ id: "synthetic" }]);
  assert.equal(snapshot.subscriptions.length, 0);
});

test("subscription, webhook, reminder and medication uniqueness and owner keys", async () => {
  const client = await database();
  try {
    await replayRehearsal(client, fixture(), {
      write: true,
      environment: "test",
      confirmNonProduction: true,
    });
    await assert.rejects(
      client.query("INSERT INTO subscriptions (user_id, payment_customer_id) VALUES ($1, $2)", [
        "kindred-owner-b",
        "synthetic-customer",
      ]),
    );
    await assert.rejects(
      client.query("INSERT INTO processed_webhooks (webhook_id, event_type) VALUES ($1, $2)", [
        "synthetic-event",
        "again",
      ]),
    );
    await assert.rejects(
      client.query(
        "INSERT INTO reminder_deliveries (id, user_id, type, local_date, channel) VALUES ($1, $2, $3, $4, $5)",
        [80, "kindred-owner-a", "morning", "2026-09-22", "email"],
      ),
    );
    await assert.rejects(
      client.query(
        "INSERT INTO medication_logs (id, medication_id, user_id, date, scheduled_time) VALUES ($1, $2, $3, $4, $5)",
        [81, 33, "kindred-owner-b", "2026-09-23", "08:00"],
      ),
    );
    await client.query("DELETE FROM users WHERE id = $1", ["kindred-owner-b"]);
    assert.equal(
      (await client.query("SELECT granted_by FROM beta_grants")).rows[0]?.granted_by,
      null,
    );
    assert.equal(
      (await client.query("SELECT actor_id FROM entitlement_audit")).rows[0]?.actor_id,
      null,
    );
  } finally {
    await client.end();
  }
});
