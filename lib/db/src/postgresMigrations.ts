import { readdir, readFile } from "node:fs/promises";

const migrationsDirectory = new URL("../migrations-postgres/", import.meta.url);

/** Every checked-in PostgreSQL migration, in filename order, as one script. */
export async function readPostgresMigrations(): Promise<string> {
  const names = (await readdir(migrationsDirectory))
    .filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/.test(name))
    .sort();
  const scripts = await Promise.all(
    names.map((name) => readFile(new URL(name, migrationsDirectory), "utf8")),
  );
  return scripts.join("\n");
}
