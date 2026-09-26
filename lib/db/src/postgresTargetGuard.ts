import type { Pool } from "pg";

// Observed defaults on Fly MPG. Object names alone never grant an exemption.
const allowedExtensions = ["plpgsql", "pg_stat_monitor", "pgaudit"];

export async function assertEmptyTarget(client: Pick<Pool, "query">): Promise<void> {
  const result = await client.query<{ kind: string; name: string }>(`
    WITH RECURSIVE extension_members(classid, objid) AS (
      SELECT d.classid, d.objid
      FROM pg_catalog.pg_depend d
      JOIN pg_catalog.pg_extension e ON e.oid = d.refobjid
      WHERE d.refclassid = 'pg_catalog.pg_extension'::regclass
        AND d.deptype = 'e' AND d.objsubid = 0
        AND e.extname = ANY($1::text[])
      UNION
      -- Internal dependencies include the extension view's composite/array types.
      -- Normal/automatic dependencies are not extension ownership.
      SELECT d.classid, d.objid
      FROM pg_catalog.pg_depend d
      JOIN extension_members m ON m.classid = d.refclassid AND m.objid = d.refobjid
      WHERE d.deptype = 'i' AND d.objsubid = 0
    ), candidates AS (
      SELECT 'pg_catalog.pg_class'::regclass AS classid, c.oid AS objid,
        'relation' AS kind, n.nspname || '.' || c.relname AS name
      FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relkind IN ('r', 'p', 'S', 'v', 'm', 'f', 'c')
        AND n.nspname NOT IN ('pg_catalog', 'information_schema')
        AND n.nspname NOT LIKE 'pg_toast%' AND n.nspname NOT LIKE 'pg_temp_%'
      UNION ALL
      SELECT 'pg_catalog.pg_proc'::regclass, p.oid, 'function', n.nspname || '.' || p.proname
      FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
        AND n.nspname NOT LIKE 'pg_toast%' AND n.nspname NOT LIKE 'pg_temp_%'
      UNION ALL
      SELECT 'pg_catalog.pg_type'::regclass, t.oid, 'type', n.nspname || '.' || t.typname
      FROM pg_catalog.pg_type t JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
        AND n.nspname NOT LIKE 'pg_toast%' AND n.nspname NOT LIKE 'pg_temp_%'
      UNION ALL
      SELECT 'pg_catalog.pg_namespace'::regclass, n.oid, 'schema', n.nspname
      FROM pg_catalog.pg_namespace n
      WHERE n.nspname NOT IN ('pg_catalog', 'information_schema', 'public')
        AND n.nspname NOT LIKE 'pg_toast%' AND n.nspname NOT LIKE 'pg_temp_%'
      UNION ALL
      SELECT 'pg_catalog.pg_extension'::regclass, e.oid, 'extension', e.extname
      FROM pg_catalog.pg_extension e WHERE e.extname <> ALL($1::text[])
    )
    SELECT kind, name FROM candidates c
    WHERE NOT EXISTS (
      SELECT 1 FROM extension_members m WHERE m.classid = c.classid AND m.objid = c.objid
    )
    ORDER BY kind, name
  `, [allowedExtensions]);
  if (result.rows.length) {
    throw new Error("Target contains unreviewed objects; use an empty isolated rehearsal database");
  }
}
