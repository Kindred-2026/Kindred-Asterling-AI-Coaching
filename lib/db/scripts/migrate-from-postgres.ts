import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { MongoClient, type Db, type Document } from "mongodb";
import pg from "pg";
import {
  initializeMongoCounters,
  initializeMongoIndexes,
} from "../src/mongoDb";
import {
  POSTGRES_DATE_OID,
  POSTGRES_TIMESTAMP_WITHOUT_TIME_ZONE_OID,
  OrderIndependentDigest,
  assertDateOnlyFields,
  authoritativeMigrationTables,
  parsePostgresDate,
  parsePostgresTimestampWithoutTimezone,
  transformRow,
  validateDiscoveredTableDefinitions,
  validateMigrationCollectionNames,
  type MigrationTableDefinition,
} from "../src/migrationSupport";

const { Client: PostgresClient } = pg;
const BATCH_SIZE = 1_000;
const IDENTIFIER = /^[a-z_][a-z0-9_]*$/;

type TableReport = {
  table: string;
  rows: number;
  sourceDigest: string;
  targetDigest: string;
};

pg.types.setTypeParser(POSTGRES_DATE_OID, parsePostgresDate);
pg.types.setTypeParser(
  POSTGRES_TIMESTAMP_WITHOUT_TIME_ZONE_OID,
  parsePostgresTimestampWithoutTimezone,
);

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function quotedIdentifier(value: string): string {
  if (!IDENTIFIER.test(value))
    throw new Error(`Unsafe SQL identifier: ${value}`);
  return `"${value}"`;
}

async function discoverTables(
  source: pg.Client,
): Promise<MigrationTableDefinition[]> {
  const allowlist = authoritativeMigrationTables.map(({ name }) => name);
  const tables = await source.query<{ table_name: string }>(
    `SELECT table_name
       FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
        AND table_name = ANY($1::text[])
      ORDER BY table_name`,
    [allowlist],
  );
  const keys = await source.query<{
    table_name: string;
    constraint_name: string;
    constraint_type: "PRIMARY KEY" | "UNIQUE";
    column_name: string;
    ordinal_position: number;
  }>(
    `SELECT c.relname AS table_name,
            con.conname AS constraint_name,
            CASE con.contype WHEN 'p' THEN 'PRIMARY KEY' ELSE 'UNIQUE' END AS constraint_type,
            a.attname AS column_name,
            k.ord AS ordinal_position
       FROM pg_catalog.pg_constraint con
       JOIN pg_catalog.pg_class c ON c.oid = con.conrelid
       JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
       CROSS JOIN LATERAL unnest(con.conkey) WITH ORDINALITY AS k(attnum, ord)
       JOIN pg_catalog.pg_attribute a
         ON a.attrelid = con.conrelid AND a.attnum = k.attnum
      WHERE n.nspname = 'public'
        AND con.contype IN ('p', 'u')
        AND c.relname = ANY($1::text[])
      ORDER BY c.relname,
               CASE con.contype WHEN 'p' THEN 0 ELSE 1 END,
               con.conname,
               k.ord`,
    [allowlist],
  );
  const byConstraint = new Map<string, string[]>();
  for (const key of keys.rows) {
    const constraint = `${key.table_name}\0${key.constraint_name}`;
    const columns = byConstraint.get(constraint) ?? [];
    columns.push(key.column_name);
    byConstraint.set(constraint, columns);
  }
  const candidatesByTable = new Map<string, string[][]>();
  for (const [constraint, columns] of byConstraint) {
    const tableName = constraint.slice(0, constraint.indexOf("\0"));
    const candidates = candidatesByTable.get(tableName) ?? [];
    candidates.push(columns);
    candidatesByTable.set(tableName, candidates);
  }
  const expectedByTable = new Map(
    authoritativeMigrationTables.map(({ name, primaryKey }) => [
      name,
      primaryKey,
    ]),
  );
  return validateDiscoveredTableDefinitions(
    tables.rows.map(({ table_name }) => {
      const expected = expectedByTable.get(table_name) ?? [];
      const candidates = candidatesByTable.get(table_name) ?? [];
      const matchingIdentity = candidates.find(
        (columns) => columns.join("\0") === expected.join("\0"),
      );
      return {
        name: table_name,
        primaryKey: matchingIdentity ?? candidates[0] ?? [],
      };
    }),
  );
}

async function migrateTable(
  source: pg.Client,
  target: Db,
  definition: MigrationTableDefinition,
): Promise<TableReport> {
  const sourceDigest = new OrderIndependentDigest();
  const cursor = `kindred_${definition.name}_${randomUUID().replaceAll("-", "")}`;
  const order =
    definition.primaryKey.length > 0
      ? ` ORDER BY ${definition.primaryKey.map(quotedIdentifier).join(", ")}`
      : " ORDER BY ctid";
  await source.query(
    `DECLARE ${quotedIdentifier(cursor)} NO SCROLL CURSOR FOR SELECT * FROM ${quotedIdentifier(definition.name)}${order}`,
  );
  let rows = 0;
  try {
    while (true) {
      const batch = await source.query<Record<string, unknown>>(
        `FETCH FORWARD ${BATCH_SIZE} FROM ${quotedIdentifier(cursor)}`,
      );
      if (batch.rows.length === 0) break;
      const documents = batch.rows.map((row) =>
        transformRow(definition.name, row, definition.primaryKey),
      );
      for (const document of documents) sourceDigest.add(document);
      await target.collection(definition.name).insertMany(documents, {
        ordered: true,
      });
      rows += documents.length;
      console.log(`${definition.name}: ${rows} rows copied`);
    }
  } finally {
    await source.query(`CLOSE ${quotedIdentifier(cursor)}`);
  }

  const targetDigest = new OrderIndependentDigest();
  let targetRows = 0;
  for await (const document of target.collection(definition.name).find()) {
    targetDigest.add(document);
    targetRows += 1;
  }
  if (targetRows !== rows || targetDigest.hex() !== sourceDigest.hex()) {
    throw new Error(
      `${definition.name} parity failure: source=${rows}/${sourceDigest.hex()} target=${targetRows}/${targetDigest.hex()}`,
    );
  }
  return {
    table: definition.name,
    rows,
    sourceDigest: sourceDigest.hex(),
    targetDigest: targetDigest.hex(),
  };
}

async function validateDateOnlyCollections(database: Db): Promise<void> {
  for (const { name } of authoritativeMigrationTables) {
    for await (const document of database.collection(name).find()) {
      assertDateOnlyFields(name, document);
    }
  }
}

async function countOrphans(
  database: Db,
  child: string,
  field: string,
  parent: string,
): Promise<number> {
  const [result] = await database
    .collection(child)
    .aggregate<{ count: number }>([
      { $match: { [field]: { $ne: null } } },
      {
        $lookup: {
          from: parent,
          localField: field,
          foreignField: "_id",
          as: "_parent",
        },
      },
      { $match: { _parent: { $size: 0 } } },
      { $count: "count" },
    ])
    .toArray();
  return result?.count ?? 0;
}

async function validateReferences(database: Db): Promise<void> {
  const userOwned = [
    "beta_grants",
    "body_scans",
    "conversations",
    "daily_usage",
    "entitlement_audit",
    "evening_reports",
    "habit_entries",
    "habits",
    "medication_logs",
    "medication_schedule_entries",
    "medications",
    "morning_logs",
    "reminder_deliveries",
    "reminder_settings",
    "subscriptions",
  ];
  const checks: Array<[string, string, string]> = userOwned.map((name) => [
    name,
    "userId",
    "users",
  ]);
  checks.push(
    ["messages", "conversationId", "conversations"],
    ["habit_entries", "habitId", "habits"],
    ["medication_logs", "medicationId", "medications"],
    ["medication_schedule_entries", "medicationId", "medications"],
    ["beta_grants", "grantedBy", "users"],
    ["beta_grants", "revokedBy", "users"],
    ["entitlement_audit", "actorId", "users"],
  );
  const collections = new Set(
    (await database.listCollections({}, { nameOnly: true }).toArray()).map(
      ({ name }) => name,
    ),
  );
  for (const [child, field, parent] of checks) {
    if (!collections.has(child) || !collections.has(parent)) continue;
    const orphans = await countOrphans(database, child, field, parent);
    if (orphans > 0) {
      throw new Error(`${child}.${field} has ${orphans} orphaned references`);
    }
  }
}

export async function runMigration(): Promise<void> {
  const sourceUrl = required("POSTGRES_SOURCE_URL");
  const mongoUri = required("MONGODB_URI");
  const targetName = required("MONGODB_MIGRATION_DATABASE");
  if (targetName === process.env.MONGODB_DATABASE?.trim()) {
    throw new Error(
      "MONGODB_MIGRATION_DATABASE must differ from MONGODB_DATABASE",
    );
  }

  const source = new PostgresClient({
    connectionString: sourceUrl,
    ssl: process.env.PG_SSL_CA
      ? { ca: process.env.PG_SSL_CA, rejectUnauthorized: true }
      : undefined,
  });
  const mongo = new MongoClient(mongoUri, {
    appName: "kindred-postgres-migration",
    maxPoolSize: 10,
    retryWrites: true,
  });

  try {
    await source.connect();
    await mongo.connect();
    const target = mongo.db(targetName);
    const existingCollections = await target
      .listCollections({}, { nameOnly: true })
      .toArray();
    const expectedCollectionNames = new Set(
      authoritativeMigrationTables.map(({ name }) => name),
    );
    for (const { name } of existingCollections) {
      if (!expectedCollectionNames.has(name)) {
        throw new Error(
          `Migration target ${targetName} contains unexpected collection ${name}; use a new staging database`,
        );
      }
      const documents = await target.collection(name).estimatedDocumentCount();
      if (documents > 0) {
        throw new Error(
          `Migration target ${targetName} is not empty; ${name} contains ${documents} documents`,
        );
      }
    }

    const existingCollectionNames = new Set(
      existingCollections.map(({ name }) => name),
    );
    for (const { name } of authoritativeMigrationTables) {
      if (!existingCollectionNames.has(name)) {
        await target.createCollection(name);
      }
    }

    await source.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const startedAt = new Date();
    const tables = await discoverTables(source);
    const reports: TableReport[] = [];
    try {
      for (const table of tables) {
        reports.push(await migrateTable(source, target, table));
      }
      await source.query("COMMIT");
    } catch (error) {
      await source.query("ROLLBACK");
      throw error;
    }

    await validateReferences(target);
    await validateDateOnlyCollections(target);
    await initializeMongoIndexes(target);
    await initializeMongoCounters(target);
    const collectionNames = (
      await target.listCollections({}, { nameOnly: true }).toArray()
    ).map(({ name }) => name);
    validateMigrationCollectionNames(collectionNames);
    const report = {
      status: "validated",
      startedAt: startedAt.toISOString(),
      completedAt: new Date().toISOString(),
      source: "postgresql-read-only-snapshot",
      targetDatabase: targetName,
      collectionCount: collectionNames.length,
      tables: reports,
      totalRows: reports.reduce((sum, table) => sum + table.rows, 0),
    };
    const reportPath =
      process.env.MONGODB_MIGRATION_REPORT_PATH ??
      `mongodb-migration-report-${startedAt.toISOString().replaceAll(":", "-")}.json`;
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, {
      flag: "wx",
      mode: 0o600,
    });
    console.log(`Migration validated. Report: ${reportPath}`);
  } finally {
    await Promise.allSettled([source.end(), mongo.close()]);
  }
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : "";
if (import.meta.url === invokedPath) await runMigration();
