-- Exact row count for every app table, one "table count" line each. Run it
-- against the old and the new database and diff the output
-- (docs/DIGITALOCEAN_DEPLOYMENT.md). Prints counts only, never row contents.
SELECT table_name,
  (xpath('/row/c/text()', query_to_xml(format('SELECT count(*) AS c FROM public.%I', table_name), false, true, '')))[1]::text::bigint AS row_count
FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
ORDER BY table_name;
