import { allTables, subscriptionStatuses } from "./mongoSchema";
import { DATE_ONLY_FIELDS, snakeCase } from "./migrationSupport";

// Explicit insertion order and reviewed fields. Do not infer types from JS defaults.
// These are application-internal Kindred IDs, not Auth0 subjects or email keys.
export const rehearsalColumns = {
  users: [
    "id",
    "auth0UserId",
    "clerkUserId",
    "clerkDeletedAt",
    "email",
    "passwordHash",
    "firstName",
    "lastName",
    "profileImageUrl",
    "preferredName",
    "birthday",
    "struggles",
    "strengths",
    "interests",
    "bio",
    "motivationalQuote",
    "phone",
    "timezone",
    "emailVerifiedAt",
    "onboardedAt",
    "createdAt",
    "updatedAt",
  ],
  affirmations: ["id", "text", "isActive", "createdAt"],
  conversations: ["id", "userId", "title", "status", "createdAt", "archivedAt"],
  habits: ["id", "userId", "name", "description", "targetDays", "startDate", "createdAt"],
  medications: ["id", "userId", "name", "dosage", "times", "notes", "createdAt"],
  beta_grants: ["id", "userId", "grantedBy", "grantedAt", "expiresAt", "revokedAt", "revokedBy"],
  body_scans: [
    "id",
    "userId",
    "scannedAt",
    "feelings",
    "energyLevel",
    "physicalSensations",
    "notes",
    "createdAt",
  ],
  calendar_connections: ["userId", "provider", "encryptedRefreshToken", "createdAt", "updatedAt"],
  daily_usage: ["userId", "date", "count"],
  entitlement_audit: ["id", "userId", "action", "actorId", "metadata", "createdAt"],
  evening_reports: [
    "id",
    "userId",
    "date",
    "medicationEffectiveness",
    "overallMood",
    "wins",
    "challenges",
    "tomorrowIntent",
    "createdAt",
  ],
  habit_entries: ["id", "habitId", "userId", "date", "completed", "notes", "createdAt"],
  medication_logs: [
    "id",
    "medicationId",
    "userId",
    "date",
    "scheduledTime",
    "takenAt",
    "effectiveness",
  ],
  medication_schedule_entries: [
    "id",
    "medicationId",
    "userId",
    "scheduledTime",
    "startDate",
    "endDate",
  ],
  messages: ["id", "conversationId", "userId", "role", "content", "createdAt"],
  morning_logs: ["id", "userId", "date", "mentalLoadLevel", "miniGoals", "notes", "createdAt"],
  processed_webhooks: ["webhookId", "eventType", "processedAt"],
  reminder_settings: [
    "userId",
    "morningEnabled",
    "morningTime",
    "medicationEnabled",
    "eveningEnabled",
    "eveningTime",
    "smsEnabled",
    "emailEnabled",
    "createdAt",
    "updatedAt",
  ],
  reminder_deliveries: ["id", "userId", "type", "doseTime", "localDate", "channel", "sentAt"],
  subscriptions: [
    "userId",
    "email",
    "status",
    "paymentCustomerId",
    "paymentSubscriptionId",
    "currentPeriodEnd",
    "providerEventAt",
    "lastCheckedAt",
    "createdAt",
    "updatedAt",
  ],
} as const;

export type RehearsalTable = keyof typeof rehearsalColumns;
export type RehearsalSnapshot = {
  [Name in RehearsalTable]: ReadonlyArray<Record<string, unknown>>;
};
export type SqlClient = {
  query(sql: string, values?: readonly unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
};
export type RehearsalOptions = {
  write?: boolean;
  environment?: "test" | "development";
  confirmNonProduction?: boolean;
  schemaSql?: string;
};
export const rehearsalTables = Object.keys(rehearsalColumns) as RehearsalTable[];

// Every non-identity field must be classified. A change to the Mongo schema
// requires a deliberate corresponding change to this map and to the SQL file.
const booleans = new Set([
  "isActive",
  "completed",
  "morningEnabled",
  "medicationEnabled",
  "eveningEnabled",
  "smsEnabled",
  "emailEnabled",
]);
const integers = new Set([
  "energyLevel",
  "medicationEffectiveness",
  "targetDays",
  "count",
  "effectiveness",
]);
const arrays = new Set(["feelings", "times", "miniGoals"]);
const timestamps = new Set([
  "clerkDeletedAt",
  "emailVerifiedAt",
  "onboardedAt",
  "createdAt",
  "updatedAt",
  "grantedAt",
  "expiresAt",
  "revokedAt",
  "scannedAt",
  "archivedAt",
  "takenAt",
  "sentAt",
  "processedAt",
  "currentPeriodEnd",
  "providerEventAt",
  "lastCheckedAt",
]);
const json = new Set(["metadata"]);
const keys: Record<RehearsalTable, readonly string[]> = Object.fromEntries(
  allTables.map((table) => [table.collectionName, table.primaryKey]),
) as Record<RehearsalTable, readonly string[]>;
const required: Partial<Record<RehearsalTable, readonly string[]>> = {
  users: ["id"],
  affirmations: ["id", "text"],
  conversations: ["id", "userId", "title"],
  habits: ["id", "userId", "name", "startDate"],
  medications: ["id", "userId", "name", "dosage", "times"],
  beta_grants: ["id", "userId"],
  body_scans: ["id", "userId", "energyLevel"],
  calendar_connections: ["userId", "encryptedRefreshToken"],
  daily_usage: ["userId", "date"],
  entitlement_audit: ["id", "userId", "action"],
  evening_reports: ["id", "userId", "date", "medicationEffectiveness"],
  habit_entries: ["id", "habitId", "userId", "date"],
  medication_logs: ["id", "medicationId", "userId", "date", "scheduledTime"],
  medication_schedule_entries: ["id", "medicationId", "userId", "scheduledTime", "startDate"],
  messages: ["id", "conversationId", "userId", "role", "content"],
  morning_logs: ["id", "userId", "date", "mentalLoadLevel"],
  processed_webhooks: ["webhookId", "eventType"],
  reminder_settings: ["userId"],
  reminder_deliveries: ["id", "userId", "type", "localDate", "channel"],
  subscriptions: ["userId"],
};
const nonNullable: Partial<Record<RehearsalTable, readonly string[]>> = {
  users: ["createdAt", "updatedAt"],
  affirmations: ["isActive", "createdAt"],
  conversations: ["status", "createdAt"],
  habits: ["targetDays", "createdAt"],
  medications: ["createdAt"],
  beta_grants: ["grantedAt"],
  body_scans: ["scannedAt", "feelings", "createdAt"],
  calendar_connections: ["provider", "createdAt", "updatedAt"],
  daily_usage: ["count"],
  entitlement_audit: ["createdAt"],
  evening_reports: ["createdAt"],
  habit_entries: ["completed", "createdAt"],
  medication_logs: ["takenAt"],
  messages: ["createdAt"],
  morning_logs: ["miniGoals", "createdAt"],
  processed_webhooks: ["processedAt"],
  reminder_settings: [
    "morningEnabled",
    "morningTime",
    "medicationEnabled",
    "eveningEnabled",
    "eveningTime",
    "smsEnabled",
    "emailEnabled",
    "createdAt",
    "updatedAt",
  ],
  reminder_deliveries: ["doseTime", "sentAt"],
  subscriptions: ["status", "createdAt", "updatedAt"],
};

export function assertRehearsalSchemaCoverage(): void {
  if (
    rehearsalTables.length !== allTables.length ||
    allTables.some((table) => {
      const fields = rehearsalColumns[table.collectionName as RehearsalTable] as
        readonly string[] | undefined;
      return (
        !fields ||
        fields.length !== Object.keys(table.columns).length ||
        new Set(fields).size !== fields.length ||
        fields.some((field) => !(field in table.columns))
      );
    })
  )
    throw new Error("PostgreSQL rehearsal map differs from Mongo schema");
}

function validDate(value: unknown): boolean {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

function validateValue(table: RehearsalTable, field: string, value: unknown): void {
  if (value === null) return;
  if (
    table === "subscriptions" &&
    field === "status" &&
    !subscriptionStatuses.includes(value as never)
  )
    throw new Error("Invalid subscriptions.status");
  const dateFields = DATE_ONLY_FIELDS[table] ?? [];
  if (dateFields.includes(field)) {
    if (!validDate(value)) throw new Error(`Invalid ${table}.${field} date`);
  } else if (timestamps.has(field)) {
    if (!(value instanceof Date) || Number.isNaN(value.getTime()))
      throw new Error(`Invalid ${table}.${field} timestamp`);
  } else if (arrays.has(field)) {
    if (!Array.isArray(value) || value.some((part) => typeof part !== "string"))
      throw new Error(`Invalid ${table}.${field} text array`);
  } else if (json.has(field)) {
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error(`Invalid ${table}.${field} JSON object`);
    const safeJson = (entry: unknown): boolean => {
      if (entry === null || typeof entry === "string" || typeof entry === "boolean") return true;
      if (typeof entry === "number") return Number.isFinite(entry);
      if (Array.isArray(entry)) return entry.every(safeJson);
      if (!entry || typeof entry !== "object" || Object.getPrototypeOf(entry) !== Object.prototype)
        return false;
      return Object.values(entry).every(safeJson);
    };
    try {
      if (!safeJson(value)) throw new Error();
      JSON.stringify(value);
    } catch {
      throw new Error(`Invalid ${table}.${field} JSON object`);
    }
  } else if (booleans.has(field)) {
    if (typeof value !== "boolean") throw new Error(`Invalid ${table}.${field} boolean`);
  } else if (
    integers.has(field) ||
    (field === "id" &&
      keys[table].includes("id") &&
      !["users", "beta_grants", "entitlement_audit"].includes(table))
  ) {
    if (
      typeof value !== "number" ||
      !Number.isSafeInteger(value) ||
      value < -2147483648 ||
      value > 2147483647 ||
      (field === "id" && value < 1) ||
      (field === "count" && value < 0)
    )
      throw new Error(`Invalid ${table}.${field} integer`);
  } else if (field === "habitId" || field === "medicationId" || field === "conversationId") {
    if (
      typeof value !== "number" ||
      !Number.isSafeInteger(value) ||
      value < 1 ||
      value > 2147483647
    )
      throw new Error(`Invalid ${table}.${field} integer reference`);
  } else if (typeof value !== "string" || value.length === 0 || value.includes("\0")) {
    throw new Error(`Invalid ${table}.${field} string`);
  }
}

export function validateRehearsal(snapshot: RehearsalSnapshot): void {
  assertRehearsalSchemaCoverage();
  const ids = {} as Record<RehearsalTable, Map<string, Record<string, unknown>>>;
  for (const table of rehearsalTables) {
    if (!Array.isArray(snapshot[table])) throw new Error(`Missing ${table} collection`);
    ids[table] = new Map();
    const fields = new Set<string>(rehearsalColumns[table]);
    for (const row of snapshot[table]) {
      if (!row || typeof row !== "object" || Array.isArray(row))
        throw new Error(`Invalid ${table} row`);
      for (const field of Object.keys(row)) {
        if (!fields.has(field)) throw new Error(`Unreviewed ${table}.${field} field`);
        if (
          row[field] === null &&
          (required[table]?.includes(field) || nonNullable[table]?.includes(field))
        )
          throw new Error(`Invalid null ${table}.${field}`);
        validateValue(table, field, row[field]);
      }
      for (const field of required[table] ?? keys[table]) {
        if (row[field] == null) throw new Error(`Missing ${table}.${field}`);
      }
      const id = keys[table].map((key) => JSON.stringify(row[key])).join(":");
      if (ids[table].has(id)) throw new Error(`Duplicate ${table} ID`);
      ids[table].set(id, row);
    }
  }
  const users = new Set(snapshot.users.map((row) => row.id));
  for (const table of rehearsalTables) {
    for (const row of snapshot[table]) {
      if (table !== "users" && "userId" in row && !users.has(row.userId))
        throw new Error(`${table} has orphaned userId`);
      for (const field of ["grantedBy", "revokedBy", "actorId"]) {
        if (row[field] != null && !users.has(row[field]))
          throw new Error(`${table} has orphaned ${field}`);
      }
    }
  }
  const parents = [
    ["messages", "conversationId", "conversations", "userId"],
    ["habit_entries", "habitId", "habits", "userId"],
    ["medication_logs", "medicationId", "medications", "userId"],
    ["medication_schedule_entries", "medicationId", "medications", "userId"],
  ] as const;
  for (const [table, field, parent, ownerField] of parents) {
    const byId = new Map(snapshot[parent].map((row) => [row.id, row]));
    for (const row of snapshot[table]) {
      const match = byId.get(row[field]);
      if (!match || (ownerField && match.userId !== row[ownerField]))
        throw new Error(`${table} crosses account boundary or has orphaned ${field}`);
    }
  }
}

// Caller supplies an isolated target, with an empty schema already verified.
// PostgreSQL (not pg-mem) must confirm transaction rollback before cutover.
export async function replayRehearsal(
  client: SqlClient,
  snapshot: RehearsalSnapshot,
  options: RehearsalOptions = {},
): Promise<Record<RehearsalTable, number>> {
  if (
    options.write &&
    (process.env.NODE_ENV === "production" ||
      options.confirmNonProduction !== true ||
      !["test", "development"].includes(options.environment ?? ""))
  ) {
    throw new Error(
      "Writes require explicit test/development environment and non-production confirmation",
    );
  }
  validateRehearsal(snapshot);
  const counts = {} as Record<RehearsalTable, number>;
  await client.query("BEGIN");
  try {
    if (options.schemaSql) await client.query(options.schemaSql);
    for (const table of rehearsalTables) {
      for (const row of snapshot[table]) {
        const present = (rehearsalColumns[table] as readonly string[]).filter(
          (field) => row[field] !== undefined,
        );
        const columns = present.map((field) => `"${snakeCase(field)}"`).join(", ");
        const placeholders = present.map((_, i) => `$${i + 1}`).join(", ");
        await client.query(
          `INSERT INTO "${table}" (${columns}) VALUES (${placeholders})`,
          present.map((field) => row[field]),
        );
      }
      counts[table] = snapshot[table].length;
    }
    for (const table of rehearsalTables) {
      const { rows } = await client.query(`SELECT count(*) AS total FROM "${table}"`);
      if (Number(rows[0]?.total) !== counts[table])
        throw new Error(`Target ${table} count mismatch`);
    }
    await client.query(options.write ? "COMMIT" : "ROLLBACK");
    return counts;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
