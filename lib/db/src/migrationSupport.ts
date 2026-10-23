import { createHash } from "node:crypto";
import type { Document } from "mongodb";
import { allTables } from "./mongoSchema";

export type MigrationTableDefinition = {
  name: string;
  primaryKey: string[];
};

export const POSTGRES_DATE_OID = 1082;
export const POSTGRES_TIMESTAMP_WITHOUT_TIME_ZONE_OID = 1114;

export const DATE_ONLY_FIELDS: Readonly<Record<string, readonly string[]>> = {
  users: ["birthday"],
  daily_usage: ["date"],
  evening_reports: ["date"],
  habit_entries: ["date"],
  habits: ["startDate"],
  medication_logs: ["date"],
  medication_schedule_entries: ["startDate", "endDate"],
  morning_logs: ["date"],
  reminder_deliveries: ["localDate"],
};

export function camelCase(value: string): string {
  return value.replace(/_([a-z0-9])/g, (_, letter: string) =>
    letter.toUpperCase(),
  );
}

export function snakeCase(value: string): string {
  return value.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

export function parsePostgresDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`Invalid PostgreSQL DATE value: ${value}`);
  }
  return value;
}

export function parsePostgresTimestampWithoutTimezone(value: string): Date {
  const parsed = new Date(`${value.replace(" ", "T")}Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid PostgreSQL timestamp value: ${value}`);
  }
  return parsed;
}

export const authoritativeMigrationTables: readonly MigrationTableDefinition[] =
  allTables.map((table) => ({
    name: table.collectionName,
    primaryKey: table.primaryKey.map(snakeCase),
  }));

export const expectedMigrationCollections = [
  ...authoritativeMigrationTables.map(({ name }) => name),
  "_counters",
] as const;

export function validateDiscoveredTableDefinitions(
  discovered: readonly MigrationTableDefinition[],
): MigrationTableDefinition[] {
  const byName = new Map(discovered.map((table) => [table.name, table]));
  for (const expected of authoritativeMigrationTables) {
    const actual = byName.get(expected.name);
    if (!actual)
      throw new Error(`Required source table is missing: ${expected.name}`);
    if (actual.primaryKey.join(",") !== expected.primaryKey.join(",")) {
      throw new Error(
        `${expected.name} identity constraint mismatch: expected ${expected.primaryKey.join(",")} but found ${actual.primaryKey.join(",")}`,
      );
    }
  }
  return authoritativeMigrationTables.map((table) => ({
    name: table.name,
    primaryKey: [...table.primaryKey],
  }));
}

export function validateMigrationCollectionNames(
  names: readonly string[],
): void {
  const actual = [...names].sort();
  const expected = [...expectedMigrationCollections].sort();
  if (actual.join("\n") !== expected.join("\n")) {
    throw new Error(
      `Migration collection set mismatch: expected ${expected.join(", ")} but found ${actual.join(", ")}`,
    );
  }
}

export function assertDateOnlyFields(
  tableName: string,
  document: Record<string, unknown>,
): void {
  for (const field of DATE_ONLY_FIELDS[tableName] ?? []) {
    const value = document[field];
    if (value == null) continue;
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new Error(
        `${tableName}.${field} must be an exact YYYY-MM-DD string; received ${Object.prototype.toString.call(value)}`,
      );
    }
  }
}

function canonical(value: unknown): string {
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Buffer.isBuffer(value)) return JSON.stringify(value.toString("base64"));
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`)
      .join(",")}}`;
  }
  if (typeof value === "bigint") return JSON.stringify(value.toString());
  return JSON.stringify(value);
}

export class OrderIndependentDigest {
  private readonly value = Buffer.alloc(32);

  // 256-bit addition modulo 2^256 (big-endian). Unlike XOR, an even number of
  // identical rows does not cancel out to zero.
  add(document: Document): void {
    const rowHash = createHash("sha256").update(canonical(document)).digest();
    let carry = 0;
    for (let index = this.value.length - 1; index >= 0; index -= 1) {
      const sum = this.value[index]! + rowHash[index]! + carry;
      this.value[index] = sum & 0xff;
      carry = sum >> 8;
    }
  }

  hex(): string {
    return this.value.toString("hex");
  }
}

function mongoId(
  tableName: string,
  row: Record<string, unknown>,
  primaryKey: string[],
): unknown {
  if (tableName === "daily_usage") return `${row.userId}:${row.date}`;
  if (primaryKey.length === 0) {
    return createHash("sha256").update(canonical(row)).digest("hex");
  }
  if (primaryKey.length === 1) return row[camelCase(primaryKey[0]!)];
  return canonical(
    Object.fromEntries(
      primaryKey.map((column) => [camelCase(column), row[camelCase(column)]]),
    ),
  );
}

export function transformRow(
  tableName: string,
  row: Record<string, unknown>,
  primaryKey: string[],
): Document {
  const transformed = Object.fromEntries(
    Object.entries(row).map(([key, value]) => [camelCase(key), value]),
  );
  const _id = mongoId(tableName, transformed, primaryKey);
  if (_id === null || _id === undefined) {
    throw new Error(
      `Source row is missing primary key ${primaryKey.join(", ")}`,
    );
  }
  const document = { _id, ...transformed };
  assertDateOnlyFields(tableName, document);
  return document;
}
