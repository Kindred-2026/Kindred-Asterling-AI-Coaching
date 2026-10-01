import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { MongoClient, type Db } from "mongodb";
import pg from "pg";

// The Google Calendar integration was permanently removed on 2026-10-01. Its
// stored refresh tokens can no longer be decrypted or revoked, so this one-off
// job drops them from whichever database the API runtime is configured to use.
// It is a dry run unless --confirm names the exact target database, and it
// prints only counts, never token values or connection strings.

const TABLE = "calendar_connections";
const DROP_SQL = new URL("../migrations-postgres/0002_drop_calendar_connections.sql", import.meta.url);

type Queryable = { query: (sql: string) => Promise<{ rows: Record<string, unknown>[] }> };

export type CalendarConnectionsDropResult = {
  provider: "mongo" | "postgres";
  database: string;
  present: boolean;
  rows: number;
  dropped: boolean;
};

/** Returns the database named by --confirm=<name>, or null for a dry run. */
export function parseConfirmation(args: readonly string[]): string | null {
  let confirmed: string | null = null;
  for (const arg of args) {
    if (arg === "--") continue;
    const match = /^--confirm=(.+)$/.exec(arg);
    if (!match) throw new Error(`Unknown argument: ${arg}. Use --confirm=<database name> to drop.`);
    confirmed = match[1];
  }
  return confirmed;
}

export async function dropMongoCalendarConnections(
  database: Db,
  confirmed: string | null,
): Promise<CalendarConnectionsDropResult> {
  const present = (await database.listCollections({ name: TABLE }, { nameOnly: true }).toArray()).length > 0;
  const rows = present ? await database.collection(TABLE).countDocuments() : 0;
  const drop = present && confirmed === database.databaseName;
  if (drop) await database.collection(TABLE).drop();
  return { provider: "mongo", database: database.databaseName, present, rows, dropped: drop };
}

export async function dropPostgresCalendarConnections(
  client: Queryable,
  confirmed: string | null,
  dropSql: string,
): Promise<CalendarConnectionsDropResult> {
  const [{ name }] = (await client.query("SELECT current_database() AS name")).rows as [{ name: string }];
  const present = (await client.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = '${TABLE}'`,
  )).rows.length > 0;
  const rows = present
    ? Number((await client.query(`SELECT count(*) AS count FROM ${TABLE}`)).rows[0].count)
    : 0;
  const drop = present && confirmed === name;
  if (drop) await client.query(dropSql);
  return { provider: "postgres", database: name, present, rows, dropped: drop };
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

export async function runDropCalendarConnections(
  args: readonly string[] = process.argv.slice(2),
): Promise<CalendarConnectionsDropResult> {
  const confirmed = parseConfirmation(args);
  const provider = process.env.DATABASE_PROVIDER?.trim().toLowerCase() || "mongo";
  let result: CalendarConnectionsDropResult;
  if (provider === "mongo") {
    const client = new MongoClient(required("MONGODB_URI"), {
      appName: "kindred-drop-calendar-connections",
      maxPoolSize: 2,
    });
    try {
      await client.connect();
      result = await dropMongoCalendarConnections(client.db(required("MONGODB_DATABASE")), confirmed);
    } finally {
      await client.close();
    }
  } else if (provider === "postgres") {
    const client = new pg.Client({ connectionString: required("POSTGRES_URL") });
    try {
      await client.connect();
      result = await dropPostgresCalendarConnections(client, confirmed, await readFile(DROP_SQL, "utf8"));
    } finally {
      await client.end();
    }
  } else {
    throw new Error("DATABASE_PROVIDER must be either mongo or postgres");
  }
  if (confirmed !== null && confirmed !== result.database) {
    throw new Error("--confirm does not match the configured database; nothing was dropped");
  }
  console.log(JSON.stringify({ mode: confirmed === null ? "dry-run" : "drop", ...result }));
  return result;
}

const invoked = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === invoked) await runDropCalendarConnections();
