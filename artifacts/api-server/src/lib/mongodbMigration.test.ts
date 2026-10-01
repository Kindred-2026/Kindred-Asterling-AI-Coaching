import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  DATE_ONLY_FIELDS,
  OrderIndependentDigest,
  assertDateOnlyFields,
  authoritativeMigrationTables,
  expectedMigrationCollections,
  parsePostgresDate,
  parsePostgresTimestampWithoutTimezone,
  transformRow,
  validateDiscoveredTableDefinitions,
  validateMigrationCollectionNames,
} from "@workspace/db";

describe("PostgreSQL to MongoDB migration", () => {
  it("preserves values while converting database column names", () => {
    const createdAt = new Date("2026-09-02T12:00:00.000Z");
    expect(
      transformRow(
        "users",
        {
          id: "user-1",
          clerk_user_id: "clerk-1",
          created_at: createdAt,
        },
        ["id"],
      ),
    ).toEqual({
      _id: "user-1",
      id: "user-1",
      clerkUserId: "clerk-1",
      createdAt,
    });
  });

  it("uses the same daily quota key as the runtime", () => {
    expect(
      transformRow(
        "daily_usage",
        { user_id: "user-1", date: "2026-09-02", count: 4 },
        ["user_id", "date"],
      )._id,
    ).toBe("user-1:2026-09-02");
  });

  it("preserves PostgreSQL DATE values as exact calendar strings", () => {
    expect(parsePostgresDate("2026-09-02")).toBe("2026-09-02");
    expect(() => parsePostgresDate("2026-9-2")).toThrow(
      /Invalid PostgreSQL DATE/,
    );
  });

  it("parses timestamp-without-time-zone deterministically as UTC", () => {
    expect(
      parsePostgresTimestampWithoutTimezone(
        "2026-09-02 12:34:56.789",
      ).toISOString(),
    ).toBe("2026-09-02T12:34:56.789Z");
  });

  it("checks every authoritative date-only field after transformation", () => {
    for (const [table, fields] of Object.entries(DATE_ONLY_FIELDS)) {
      const valid = Object.fromEntries(
        fields.map((field) => [field, "2026-09-02"]),
      );
      expect(() => assertDateOnlyFields(table, valid)).not.toThrow();
      for (const field of fields) {
        expect(() =>
          assertDateOnlyFields(table, { ...valid, [field]: new Date() }),
        ).toThrow(`${table}.${field} must be an exact YYYY-MM-DD string`);
      }
    }
  });

  it("uses an explicit 19-collection product-data allowlist", () => {
    const names = authoritativeMigrationTables.map(({ name }) => name);
    expect(names).toHaveLength(19);
    expect(names).not.toEqual(
      expect.arrayContaining([
        "sessions",
        "schema_migrations",
        "privacy_migration_orphans",
        "mongodb_mirror_outbox",
      ]),
    );
    expect(expectedMigrationCollections).toHaveLength(20);
    expect(() =>
      validateMigrationCollectionNames(expectedMigrationCollections),
    ).not.toThrow();
    expect(() =>
      validateMigrationCollectionNames([
        ...expectedMigrationCollections,
        "sessions",
      ]),
    ).toThrow(/collection set mismatch/);
  });

  it("requires every allowlisted source table with the expected identity constraint", () => {
    expect(
      validateDiscoveredTableDefinitions(authoritativeMigrationTables),
    ).toEqual(authoritativeMigrationTables);
    expect(() =>
      validateDiscoveredTableDefinitions(authoritativeMigrationTables.slice(1)),
    ).toThrow(/Required source table is missing/);
    expect(() =>
      validateDiscoveredTableDefinitions(
        authoritativeMigrationTables.map((table, index) =>
          index === 0 ? { ...table, primaryKey: ["wrong_key"] } : table,
        ),
      ),
    ).toThrow(/identity constraint mismatch/);
  });

  it("computes a row-order-independent parity digest", () => {
    const left = new OrderIndependentDigest();
    const right = new OrderIndependentDigest();
    const first = { _id: 1, value: "a" };
    const second = { _id: 2, value: "b" };
    left.add(first);
    left.add(second);
    right.add(second);
    right.add(first);
    expect(left.hex()).toBe(right.hex());
  });

  it("enforces the snapshot and fresh-target safety gates", () => {
    const source = readFileSync(
      new URL(
        "../../../../lib/db/scripts/migrate-from-postgres.ts",
        import.meta.url,
      ),
      "utf8",
    );
    expect(source).toContain("REPEATABLE READ READ ONLY");
    expect(source).toContain("setTypeParser(POSTGRES_DATE_OID");
    expect(source).toContain("POSTGRES_TIMESTAMP_WITHOUT_TIME_ZONE_OID");
    expect(source).toContain("table_name = ANY($1::text[])");
    expect(source).toContain("pg_catalog.pg_constraint");
    expect(source).toContain("con.contype IN ('p', 'u')");
    expect(source).toContain(
      "MONGODB_MIGRATION_DATABASE must differ from MONGODB_DATABASE",
    );
    expect(source).toContain("estimatedDocumentCount");
    expect(source).toContain("contains unexpected collection");
    expect(source).toContain("is not empty;");
    expect(source).not.toContain("MONGODB_MIGRATION_ALLOW_RUNTIME_TARGET");
    expect(source).toContain("sourceDigest");
    expect(source).toContain("validateReferences(target)");
    expect(source).toContain("validateDateOnlyCollections(target)");
    expect(source).toContain(
      "validateMigrationCollectionNames(collectionNames)",
    );
    expect(source).not.toContain("dropDatabase");
  });
});
