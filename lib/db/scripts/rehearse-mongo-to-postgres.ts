import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { MongoClient, type ClientSession, type Db } from "mongodb";
import pg from "pg";
import { rehearsalTables, replayRehearsal, type RehearsalSnapshot } from "../src/postgresRehearsal";

const MAX_ROWS = 250_000; // bounded, batched read; exceed the cap rather than exhaust memory
const MAX_BYTES = 64 * 1024 * 1024;

export function authorizeTarget(
  args: readonly string[],
  environment: string | undefined,
  targetUrl: string,
  activeUrl?: string,
): boolean {
  if (args.some((arg) => !["--write", "--non-production"].includes(arg)))
    throw new Error("Unrecognized rehearsal argument");
  if (environment === "production" || !["test", "development"].includes(environment ?? ""))
    throw new Error("Rehearsal requires NODE_ENV=test or development");
  const target = new URL(targetUrl);
  if (!["postgres:", "postgresql:"].includes(target.protocol))
    throw new Error("Target must be PostgreSQL");
  const name = decodeURIComponent(target.pathname.slice(1));
  if (!/^kindred_rehearsal_[a-z0-9_]+$/.test(name))
    throw new Error("Target must be a dedicated kindred_rehearsal_ database");
  if (activeUrl) {
    const active = new URL(activeUrl);
    if (active.host === target.host && active.pathname === target.pathname)
      throw new Error("Target cannot be the runtime database");
  }
  if (args.includes("--non-production") && !args.includes("--write"))
    throw new Error("--non-production requires --write");
  if (args.includes("--write") && !args.includes("--non-production"))
    throw new Error("--write requires --non-production");
  return args.includes("--write");
}

export async function readMongoSnapshot(
  database: Db,
  session?: ClientSession,
): Promise<RehearsalSnapshot> {
  const snapshot = {} as RehearsalSnapshot;
  let total = 0;
  let bytes = 0;
  for (const table of rehearsalTables) {
    const rows: Record<string, unknown>[] = [];
    const cursor = database
      .collection(table)
      .find({}, { projection: { _id: 0 }, batchSize: 500, session });
    try {
      for await (const row of cursor) {
        if (++total > MAX_ROWS)
          throw new Error(`Source exceeds ${MAX_ROWS} rows; no target writes attempted`);
        try {
          bytes += Buffer.byteLength(JSON.stringify(row));
        } catch {
          throw new Error("Source contains an unserializable row; no target writes attempted");
        }
        if (bytes > MAX_BYTES)
          throw new Error("Source exceeds rehearsal memory budget; no target writes attempted");
        rows.push(row);
      }
    } finally {
      await cursor.close();
    }
    snapshot[table] = rows;
  }
  return snapshot;
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

export async function runRehearsal(args: readonly string[] = process.argv.slice(2)): Promise<void> {
  // Validate target identity and mode before opening either connection.
  const targetUrl = required("PG_REHEARSAL_URL");
  const environment = process.env.NODE_ENV;
  const write = authorizeTarget(args, environment, targetUrl, process.env.DATABASE_URL);
  const sourceUri = required("MONGODB_REHEARSAL_URI");
  const sourceName = required("MONGODB_REHEARSAL_DATABASE");
  if (!/(^|[_-])(test|dev|development|fixture|rehearsal)([_-]|$)/.test(sourceName))
    throw new Error("Mongo source database must be explicitly named test/dev/fixture/rehearsal");
  if (
    sourceUri === process.env.MONGODB_URI?.trim() &&
    sourceName === process.env.MONGODB_DATABASE?.trim()
  )
    throw new Error("Rehearsal source must differ from the configured runtime source");
  const source = new MongoClient(sourceUri, {
    appName: "kindred-pg-rehearsal-read-only",
    maxPoolSize: 2,
  });
  const pool = new pg.Pool({ connectionString: targetUrl, max: 1 });
  try {
    const target = await pool.connect();
    try {
      const objects = await target.query(
        "SELECT relname FROM pg_catalog.pg_class JOIN pg_catalog.pg_namespace ON pg_namespace.oid = pg_class.relnamespace WHERE pg_namespace.nspname = 'public'",
      );
      if (objects.rows.length)
        throw new Error("Target is nonempty; use a new isolated rehearsal database");
      const functions = await target.query(
        "SELECT proname FROM pg_catalog.pg_proc JOIN pg_catalog.pg_namespace ON pg_namespace.oid = pg_proc.pronamespace WHERE pg_namespace.nspname = 'public'",
      );
      if (functions.rows.length) throw new Error("Target has unreviewed public functions");
      await source.connect();
      const session = source.startSession();
      let snapshot!: RehearsalSnapshot;
      try {
        await session.withTransaction(
          async () => {
            snapshot = await readMongoSnapshot(source.db(sourceName), session);
          },
          { readConcern: { level: "snapshot" } },
        );
      } finally {
        await session.endSession();
      }
      const sql = await readFile(
        new URL("../migrations-postgres/0001_rehearsal_core.sql", import.meta.url),
        "utf8",
      );
      const counts = await replayRehearsal(target, snapshot, {
        write,
        environment: environment as "test" | "development",
        confirmNonProduction: write,
        schemaSql: sql,
      });
      console.log(JSON.stringify({ mode: write ? "isolated-write" : "dry-run", counts }));
    } finally {
      target.release();
    }
  } finally {
    await Promise.allSettled([source.close(), pool.end()]);
  }
}

const invoked = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === invoked) await runRehearsal();
