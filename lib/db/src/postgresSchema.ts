import { allTables } from "./mongoSchema";
import { DATE_ONLY_FIELDS, snakeCase } from "./migrationSupport";

export type PostgresSchemaConstraint = {
  table_name: string;
  type: "p" | "u" | "f";
  columns: string[];
  referenced_table: string | null;
  referenced_columns: string[];
  delete_action: string | null;
};

export type PostgresSchemaCatalog = {
  tables: readonly string[];
  columns: readonly {
    table_name: string;
    column_name: string;
    data_type: string;
    udt_name: string;
  }[];
  constraints: readonly PostgresSchemaConstraint[];
};

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
  "habitId",
  "medicationId",
  "conversationId",
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

function expectedColumnType(tableName: string, field: string, autoIncrement?: string): string {
  if ((DATE_ONLY_FIELDS[tableName] ?? []).includes(field)) return "date";
  if (timestamps.has(field)) return "timestamp with time zone";
  if (booleans.has(field)) return "boolean";
  if (arrays.has(field)) return "text[]";
  if (field === "metadata") return "jsonb";
  if (field === autoIncrement || integers.has(field)) return "integer";
  return "text";
}

const requiredUniqueConstraints: Array<[string, string[]]> = [
  ["users", ["auth0_user_id"]],
  ["users", ["clerk_user_id"]],
  ["users", ["email"]],
  ["conversations", ["user_id", "id"]],
  ["habits", ["user_id", "id"]],
  ["medications", ["user_id", "id"]],
  ["medication_logs", ["user_id", "medication_id", "date", "scheduled_time"]],
  ["reminder_deliveries", ["user_id", "type", "local_date", "dose_time", "channel"]],
  ["subscriptions", ["payment_customer_id"]],
];

const requiredForeignKeys: Array<[
  table: string,
  columns: string[],
  referencedTable: string,
  referencedColumns: string[],
  deleteAction: string,
]> = [];

for (const table of [
  "conversations",
  "messages",
  "habits",
  "habit_entries",
  "medications",
  "medication_logs",
  "medication_schedule_entries",
  "beta_grants",
  "body_scans",
  "calendar_connections",
  "daily_usage",
  "entitlement_audit",
  "evening_reports",
  "morning_logs",
  "reminder_settings",
  "reminder_deliveries",
  "subscriptions",
]) {
  requiredForeignKeys.push([table, ["user_id"], "users", ["id"], "CASCADE"]);
}
requiredForeignKeys.push(
  ["messages", ["user_id", "conversation_id"], "conversations", ["user_id", "id"], "CASCADE"],
  ["habit_entries", ["user_id", "habit_id"], "habits", ["user_id", "id"], "CASCADE"],
  ["medication_logs", ["user_id", "medication_id"], "medications", ["user_id", "id"], "CASCADE"],
  ["medication_schedule_entries", ["user_id", "medication_id"], "medications", ["user_id", "id"], "CASCADE"],
  ["beta_grants", ["granted_by"], "users", ["id"], "SET NULL"],
  ["beta_grants", ["revoked_by"], "users", ["id"], "SET NULL"],
  ["entitlement_audit", ["actor_id"], "users", ["id"], "SET NULL"],
);

function constraintKey(constraint: PostgresSchemaConstraint): string {
  return JSON.stringify([
    constraint.table_name,
    constraint.type,
    constraint.columns,
    constraint.referenced_table,
    constraint.referenced_columns,
    constraint.delete_action,
  ]);
}

export function validatePostgresSchemaCatalog(catalog: PostgresSchemaCatalog): string[] {
  const missing: string[] = [];
  const presentTables = new Set(catalog.tables);
  for (const table of [...allTables.map((value) => value.collectionName), "database_leases"]) {
    if (!presentTables.has(table)) missing.push(`table ${table}`);
  }

  const columns = new Map(catalog.columns.map((column) => [`${column.table_name}.${column.column_name}`, column]));
  for (const table of allTables) {
    for (const [field, definition] of Object.entries(table.columns)) {
      const columnName = snakeCase(field);
      const qualified = `${table.collectionName}.${columnName}`;
      const column = columns.get(qualified);
      if (!column) {
        missing.push(`column ${qualified}`);
      } else {
        const actualType = column.data_type === "ARRAY" ? `${column.udt_name.slice(1)}[]` : column.data_type;
        const expectedType = expectedColumnType(table.collectionName, field, table.autoIncrement);
        if (actualType !== expectedType) missing.push(`column ${qualified} type ${expectedType}`);
      }
    }
  }
  for (const columnName of ["lease_key", "token", "expires_at"]) {
    const column = columns.get(`database_leases.${columnName}`);
    const expectedType = columnName === "expires_at" ? "timestamp with time zone" : "text";
    if (!column) missing.push(`column database_leases.${columnName}`);
    else if (column.data_type !== expectedType) missing.push(`column database_leases.${columnName} type ${expectedType}`);
  }

  const expectedConstraints: PostgresSchemaConstraint[] = allTables.map((table) => ({
    table_name: table.collectionName,
    type: "p",
    columns: table.primaryKey.map(snakeCase),
    referenced_table: null,
    referenced_columns: [],
    delete_action: null,
  }));
  expectedConstraints.push({
    table_name: "database_leases",
    type: "p",
    columns: ["lease_key"],
    referenced_table: null,
    referenced_columns: [],
    delete_action: null,
  });
  for (const [table_name, columns] of requiredUniqueConstraints) {
    expectedConstraints.push({ table_name, type: "u", columns, referenced_table: null, referenced_columns: [], delete_action: null });
  }
  for (const [table_name, columns, referenced_table, referenced_columns, delete_action] of requiredForeignKeys) {
    expectedConstraints.push({ table_name, type: "f", columns, referenced_table, referenced_columns, delete_action });
  }
  const presentConstraints = new Set(catalog.constraints.map(constraintKey));
  for (const constraint of expectedConstraints) {
    if (presentConstraints.has(constraintKey(constraint))) continue;
    const kind = constraint.type === "p" ? "primary key" : constraint.type === "u" ? "unique key" : "foreign key";
    missing.push(`${kind} ${constraint.table_name}(${constraint.columns.join(",")})`);
  }
  return missing;
}

export function requiredPostgresSchemaCatalog(): PostgresSchemaCatalog {
  const tables = [...allTables.map((table) => table.collectionName), "database_leases"];
  const columns = allTables.flatMap((table) =>
    Object.entries(table.columns).map(([field]) => {
      const data_type = expectedColumnType(table.collectionName, field, table.autoIncrement);
      return {
        table_name: table.collectionName,
        column_name: snakeCase(field),
        data_type: data_type === "text[]" ? "ARRAY" : data_type,
        udt_name: data_type === "text[]" ? "_text" : data_type.replaceAll(" ", "_"),
      };
    }),
  );
  columns.push(
    { table_name: "database_leases", column_name: "lease_key", data_type: "text", udt_name: "text" },
    { table_name: "database_leases", column_name: "token", data_type: "text", udt_name: "text" },
    { table_name: "database_leases", column_name: "expires_at", data_type: "timestamp with time zone", udt_name: "timestamptz" },
  );
  const constraints: PostgresSchemaConstraint[] = allTables.map((table) => ({
    table_name: table.collectionName,
    type: "p",
    columns: table.primaryKey.map(snakeCase),
    referenced_table: null,
    referenced_columns: [],
    delete_action: null,
  }));
  constraints.push({ table_name: "database_leases", type: "p", columns: ["lease_key"], referenced_table: null, referenced_columns: [], delete_action: null });
  for (const [table_name, columns] of requiredUniqueConstraints) constraints.push({ table_name, type: "u", columns, referenced_table: null, referenced_columns: [], delete_action: null });
  for (const [table_name, columns, referenced_table, referenced_columns, delete_action] of requiredForeignKeys) {
    constraints.push({ table_name, type: "f", columns, referenced_table, referenced_columns, delete_action });
  }
  return { tables, columns, constraints };
}
