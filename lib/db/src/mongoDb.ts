import { randomUUID } from "node:crypto";
import {
  MongoClient,
  MongoServerError,
  type ClientSession,
  type Db,
  type Document,
  type Filter,
  type CreateIndexesOptions,
  type Sort,
} from "mongodb";
import { trace } from "@opentelemetry/api";
import {
  allTables,
  conversations,
  habitEntriesTable,
  habitsTable,
  medicationLogsTable,
  medicationScheduleEntriesTable,
  medicationsTable,
  messages,
  usersTable,
  type Column,
  type Table,
} from "./mongoSchema";

type Row = Record<string, unknown>;
// Kindred preserves its existing UUID, integer, and composite primary keys as
// MongoDB `_id` values instead of replacing them with ObjectIds.
type MongoRow = Row & { _id: any };

export type Condition = { readonly filter: Filter<Document> };
export type SortExpression = { readonly sort: Sort };

function isColumn(value: unknown): value is Column {
  return Boolean(
    value &&
    typeof value === "object" &&
    "key" in value &&
    "tableName" in value,
  );
}

function condition(filter: Filter<Document>): Condition {
  return { filter };
}

export function eq(column: Column, value: unknown): Condition {
  if (isColumn(value)) {
    throw new Error("Cross-collection comparisons require an explicit lookup");
  }
  return condition({ [column.key]: value });
}

export function and(...conditions: Condition[]): Condition {
  if (conditions.length === 0) return condition({});
  return condition({ $and: conditions.map((entry) => entry.filter) });
}

export function or(...conditions: Condition[]): Condition {
  if (conditions.length === 0) return condition({});
  return condition({ $or: conditions.map((entry) => entry.filter) });
}

export function isNull(column: Column): Condition {
  return condition({ [column.key]: null });
}

export function gt(column: Column, value: unknown): Condition {
  return condition({ [column.key]: { $gt: value } });
}

export function gte(column: Column, value: unknown): Condition {
  return condition({ [column.key]: { $gte: value } });
}

export function lte(column: Column, value: unknown): Condition {
  return condition({ [column.key]: { $lte: value } });
}

export function lt(column: Column, value: unknown): Condition {
  return condition({ [column.key]: { $lt: value } });
}

export function inArray(column: Column, values: readonly unknown[]): Condition {
  return condition({ [column.key]: { $in: [...values] } });
}

export function asc(column: Column): SortExpression {
  return { sort: { [column.key]: 1 } };
}

export function desc(column: Column): SortExpression {
  return { sort: { [column.key]: -1 } };
}

function requiredConfiguration(): { uri: string; databaseName: string } {
  const uri = process.env.MONGODB_URI?.trim();
  const databaseName = process.env.MONGODB_DATABASE?.trim();
  if (!uri || !databaseName) {
    throw new Error("MONGODB_URI and MONGODB_DATABASE are required");
  }
  return { uri, databaseName };
}

let client: MongoClient | null = null;
let database: Db | null = null;
let indexesPromise: Promise<void> | null = null;

export async function getMongoDatabase(): Promise<Db> {
  if (database) return database;
  const { uri, databaseName } = requiredConfiguration();
  client = new MongoClient(uri, {
    appName: "kindred-api",
    maxPoolSize: 20,
    minPoolSize: 0,
    maxIdleTimeMS: 30_000,
    serverSelectionTimeoutMS: 5_000,
    waitQueueTimeoutMS: 5_000,
    retryWrites: true,
  });
  await client.connect();
  database = client.db(databaseName);
  await database.command({ ping: 1 });
  return database;
}

function collectionName(table: Table): string {
  return table.collectionName;
}

async function collection(table: Table) {
  const current = await getMongoDatabase();
  return current.collection<any>(collectionName(table));
}

const indexDefinitions: ReadonlyArray<{
  table: Table;
  keys: Record<string, 1 | -1>;
  options?: CreateIndexesOptions;
}> = [
  {
    table: usersTable,
    keys: { auth0UserId: 1 },
    options: {
      unique: true,
      partialFilterExpression: { auth0UserId: { $type: "string" } },
    },
  },
  {
    table: usersTable,
    keys: { clerkUserId: 1 },
    options: {
      unique: true,
      partialFilterExpression: { clerkUserId: { $type: "string" } },
    },
  },
  {
    table: usersTable,
    keys: { email: 1 },
    options: {
      unique: true,
      partialFilterExpression: { email: { $type: "string" } },
    },
  },
  {
    table: usersTable,
    keys: { email: 1 },
    options: {
      name: "users_email_case_insensitive_lookup",
      collation: { locale: "en", strength: 2 },
      partialFilterExpression: { email: { $type: "string" } },
    },
  },
  { table: habitsTable, keys: { userId: 1 } },
  { table: habitEntriesTable, keys: { userId: 1, habitId: 1, date: -1 } },
  { table: conversations, keys: { userId: 1, status: 1, createdAt: -1 } },
  { table: messages, keys: { conversationId: 1, id: -1 } },
  { table: medicationsTable, keys: { userId: 1, name: 1 } },
  {
    table: medicationLogsTable,
    keys: { userId: 1, medicationId: 1, date: 1, scheduledTime: 1 },
    options: { unique: true },
  },
  {
    table: medicationScheduleEntriesTable,
    keys: { userId: 1, medicationId: 1, startDate: 1, endDate: 1 },
  },
];

export async function initializeMongoIndexes(current: Db): Promise<void> {
  for (const definition of indexDefinitions) {
    await current
      .collection(definition.table.collectionName)
      .createIndex(definition.keys, definition.options);
  }
  await current
    .collection("daily_usage")
    .createIndex({ userId: 1, date: 1 }, { unique: true });
  await current
    .collection("beta_grants")
    .createIndex({ userId: 1, revokedAt: 1, expiresAt: 1 });
  await current.collection("beta_grants").createIndex({ grantedBy: 1 });
  await current.collection("beta_grants").createIndex({ revokedBy: 1 });
  await current.collection("beta_grants").createIndex({ grantedAt: -1 });
  await current
    .collection("body_scans")
    .createIndex({ userId: 1, scannedAt: -1 });
  await current
    .collection("morning_logs")
    .createIndex({ userId: 1, createdAt: -1 });
  await current
    .collection("evening_reports")
    .createIndex({ userId: 1, createdAt: -1 });
  await current.collection("calendar_connections").createIndex({ provider: 1 });
  await current.collection("subscriptions").createIndex(
    { paymentCustomerId: 1 },
    {
      unique: true,
      partialFilterExpression: { paymentCustomerId: { $type: "string" } },
    },
  );
  await current
    .collection("entitlement_audit")
    .createIndex({ userId: 1, createdAt: -1 });
  await current
    .collection("entitlement_audit")
    .createIndex({ actorId: 1, createdAt: -1 });
  await current
    .collection("reminder_settings")
    .createIndex({ userId: 1 }, { unique: true });
  await current
    .collection("reminder_deliveries")
    .createIndex(
      { userId: 1, type: 1, localDate: 1, doseTime: 1, channel: 1 },
      { unique: true },
    );
}

export async function initializeDatabase(): Promise<void> {
  if (!indexesPromise) {
    indexesPromise = (async () => {
      const current = await getMongoDatabase();
      await initializeMongoIndexes(current);
    })().catch((error) => {
      indexesPromise = null;
      throw error;
    });
  }
  await indexesPromise;
}

export async function initializeMongoCounters(current: Db): Promise<void> {
  for (const table of allTables) {
    if (!table.autoIncrement) continue;
    const [latest] = await current
      .collection(table.collectionName)
      .find({}, { projection: { [table.autoIncrement]: 1 } })
      .sort({ [table.autoIncrement]: -1 })
      .limit(1)
      .toArray();
    const value = latest?.[table.autoIncrement];
    await current
      .collection<{ _id: string; value: number }>("_counters")
      .updateOne(
        { _id: table.collectionName },
        { $set: { value: typeof value === "number" ? value : 0 } },
        { upsert: true },
      );
  }
}

export async function pingDatabase(): Promise<void> {
  const current = await getMongoDatabase();
  await current.command({ ping: 1 });
}

export async function closeDatabase(): Promise<void> {
  await client?.close();
  client = null;
  database = null;
  indexesPromise = null;
}

export class DatabaseLeaseUnavailableError extends Error {}

export async function withDatabaseLease<T>(
  namespace: string,
  key: string,
  ttlMs: number,
  callback: () => Promise<T>,
): Promise<T> {
  const current = await getMongoDatabase();
  const leases = current.collection<any>("_leases");
  const leaseId = `${namespace}:${key}`;
  const token = randomUUID();
  const now = new Date();
  try {
    await leases.findOneAndUpdate(
      {
        _id: leaseId,
        $or: [{ expiresAt: { $lte: now } }, { expiresAt: { $exists: false } }],
      },
      {
        $set: { token, expiresAt: new Date(now.getTime() + ttlMs) },
      },
      { upsert: true },
    );
  } catch (error) {
    if (isDuplicateKey(error)) {
      throw new DatabaseLeaseUnavailableError(
        `Database lease is already held: ${namespace}`,
      );
    }
    throw error;
  }
  const renewal = setInterval(
    () => {
      void leases
        .updateOne(
          { _id: leaseId, token },
          { $set: { expiresAt: new Date(Date.now() + ttlMs) } },
        )
        .catch(() => undefined);
    },
    Math.max(25, Math.floor(ttlMs / 3)),
  );
  renewal.unref();
  try {
    return await callback();
  } finally {
    clearInterval(renewal);
    await leases.deleteOne({ _id: leaseId, token });
  }
}

function stripMongoId(document: Document): Row {
  const { _id: _mongoId, ...row } = document;
  return row;
}

function project(row: Row, selection?: Record<string, unknown>): Row {
  if (!selection) return row;
  return Object.fromEntries(
    Object.entries(selection).map(([alias, selected]) => {
      if (!isColumn(selected)) {
        throw new Error(`Unsupported MongoDB projection for ${alias}`);
      }
      return [alias, row[selected.key]];
    }),
  );
}

function resolvedDefaults(table: Table): Row {
  return Object.fromEntries(
    Object.entries(table.defaults).map(([key, value]) => [
      key,
      typeof value === "function" ? value() : value,
    ]),
  );
}

function documentId(table: Table, row: Row): unknown {
  if (table.collectionName === "daily_usage")
    return `${row.userId}:${row.date}`;
  if (table.primaryKey.length === 1) return row[table.primaryKey[0]!];
  return JSON.stringify(
    Object.fromEntries(table.primaryKey.map((key) => [key, row[key]])),
  );
}

function canonicalStoredQueryId(value: unknown): string | number {
  // Reconstruct a JSON scalar, never carry a BSON object, array, or RegExp
  // from a stored document into a MongoDB query. JSON round-tripping retains
  // punctuation (including regex-looking strings) and composite key strings.
  if (
    !(typeof value === "string" && value.length > 0) &&
    !(typeof value === "number" && Number.isSafeInteger(value))
  ) {
    throw new Error("Invalid stored query identifier");
  }
  const parsed: unknown = JSON.parse(JSON.stringify(value));
  if (typeof parsed !== typeof value || parsed !== value) {
    throw new Error("Invalid stored query identifier");
  }
  return parsed as string | number;
}

function storedQueryIds(rows: readonly Row[], field: string): Array<string | number> {
  // Persisted data is not a query expression. In particular, MongoDB treats a
  // RegExp inside $in as a pattern, which could match another account's rows.
  // Kindred uses string (including composite) and integer primary keys.
  // Build a fresh list from validated primitives, never from raw documents.
  const ids: Array<string | number> = [];
  for (const row of rows) {
    ids.push(canonicalStoredQueryId(row[field]));
  }
  return ids;
}

async function nextSequenceValue(
  table: Table,
  session?: ClientSession,
): Promise<number> {
  const current = await getMongoDatabase();
  const result = await current
    .collection<{ _id: string; value: number }>("_counters")
    .findOneAndUpdate(
      { _id: table.collectionName },
      { $inc: { value: 1 } },
      { upsert: true, returnDocument: "after", session },
    );
  if (!result)
    throw new Error(`Unable to allocate an ID for ${table.collectionName}`);
  return result.value;
}

async function prepareInsert(
  table: Table,
  value: Row,
  session?: ClientSession,
): Promise<MongoRow> {
  const row: Row = { ...resolvedDefaults(table), ...value };
  if (table.uuidField && row[table.uuidField] == null) {
    row[table.uuidField] = randomUUID();
  }
  if (table.autoIncrement && row[table.autoIncrement] == null) {
    row[table.autoIncrement] = await nextSequenceValue(table, session);
  }
  const _id = documentId(table, row);
  if (_id == null)
    throw new Error(`${table.collectionName} is missing its primary key`);
  return { ...row, _id };
}

function isDuplicateKey(error: unknown): boolean {
  return error instanceof MongoServerError && error.code === 11000;
}

function isDuplicateForTarget(
  error: unknown,
  table: Table,
  target: Column | Column[],
): boolean {
  if (!isDuplicateKey(error)) return false;
  const pattern = (
    error as MongoServerError & {
      keyPattern?: Record<string, unknown>;
    }
  ).keyPattern;
  if (!pattern) return false;
  const columns = Array.isArray(target) ? target : [target];
  const targetKeys = columns.map(({ key }) => key).sort();
  const primaryKeys = [...table.primaryKey].sort();
  const expectedKeys =
    targetKeys.join("\n") === primaryKeys.join("\n") ? ["_id"] : targetKeys;
  return (
    Object.keys(pattern).sort().join("\n") === expectedKeys.sort().join("\n")
  );
}

type SelectedRow<Selection extends Record<string, unknown>> = {
  [Key in keyof Selection]: Selection[Key] extends Column<infer Value>
    ? Value
    : unknown;
};

type SelectionResult<
  Selection extends Record<string, unknown> | undefined,
  TableRow extends Row,
> =
  Selection extends Record<string, unknown> ? SelectedRow<Selection> : TableRow;

class SelectQuery<Result extends Row> implements PromiseLike<Result[]> {
  private filter: Filter<Document> = {};
  private sort: Sort | undefined;
  private maximum: number | undefined;

  constructor(
    private readonly table: Table,
    private readonly selection: Record<string, unknown> | undefined,
    private readonly session?: ClientSession,
  ) {}

  where(value: Condition): this {
    this.filter = value.filter;
    return this;
  }

  orderBy(...values: Array<SortExpression | Column>): this {
    this.sort = Object.assign(
      {},
      ...values.map((value) =>
        isColumn(value) ? { [value.key]: 1 } : value.sort,
      ),
    );
    return this;
  }

  limit(value: number): this {
    this.maximum = value;
    return this;
  }

  private async execute(): Promise<Result[]> {
    const target = await collection(this.table);
    let cursor = target.find(this.filter, { session: this.session });
    if (this.sort) cursor = cursor.sort(this.sort);
    if (this.maximum != null) cursor = cursor.limit(this.maximum);
    const rows = (await cursor.toArray()).map(stripMongoId);
    return rows.map((row) => project(row, this.selection) as Result);
  }

  then<TResult1 = Result[], TResult2 = never>(
    onfulfilled?:
      ((value: Result[]) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }
}

class SelectStart<Selection extends Record<string, unknown> | undefined> {
  constructor(
    private readonly selection: Record<string, unknown> | undefined,
    private readonly session?: ClientSession,
  ) {}

  from<TableRow extends Row>(
    table: Table<TableRow>,
  ): SelectQuery<SelectionResult<Selection, TableRow>> {
    return new SelectQuery<SelectionResult<Selection, TableRow>>(
      table,
      this.selection,
      this.session,
    );
  }
}

type ConflictAction =
  | { kind: "none"; target: Column | Column[] }
  | {
      kind: "update";
      target: Column | Column[];
      set: Row;
      setWhere?: Condition;
    };

class InsertQuery<TableRow extends Row> implements PromiseLike<TableRow[]> {
  private rows: Row[] = [];
  private conflict: ConflictAction | undefined;
  private selection: Record<string, unknown> | undefined;

  constructor(
    private readonly table: Table<TableRow>,
    private readonly session?: ClientSession,
  ) {}

  values(value: Partial<TableRow> | Array<Partial<TableRow>>): this {
    this.rows = (Array.isArray(value) ? value : [value]) as Row[];
    return this;
  }

  onConflictDoNothing(options: { target: Column | Column[] }): this {
    this.conflict = { kind: "none", target: options.target };
    return this;
  }

  onConflictDoUpdate(options: {
    target: Column | Column[];
    set: Row;
    setWhere?: Condition;
  }): this {
    this.conflict = { kind: "update", ...options };
    return this;
  }

  returning(selection?: Record<string, unknown>): this {
    this.selection = selection;
    return this;
  }

  private async execute(): Promise<TableRow[]> {
    const targetCollection = await collection(this.table);
    const returned: Row[] = [];
    for (const input of this.rows) {
      const document = await prepareInsert(this.table, input, this.session);
      try {
        if (this.conflict?.kind === "update") {
          const targetColumns = Array.isArray(this.conflict.target)
            ? this.conflict.target
            : [this.conflict.target];
          const filter: Filter<Document> = Object.fromEntries(
            targetColumns.map((column) => [column.key, document[column.key]]),
          );
          if (this.conflict.setWhere) {
            Object.assign(filter, this.conflict.setWhere.filter);
          }
          const updateValues = Object.fromEntries(
            Object.entries(this.conflict.set).filter(
              ([, value]) => !isColumn(value),
            ),
          );
          if (this.table.updatedAtField) {
            updateValues[this.table.updatedAtField] = new Date();
          }
          const insertValues = Object.fromEntries(
            Object.entries(document).filter(([key]) => !(key in updateValues)),
          );
          const result = await targetCollection.findOneAndUpdate(
            filter,
            { $setOnInsert: insertValues, $set: updateValues },
            { upsert: true, returnDocument: "after", session: this.session },
          );
          if (result)
            returned.push(project(stripMongoId(result), this.selection));
          continue;
        }
        await targetCollection.insertOne(document, { session: this.session });
        returned.push(project(stripMongoId(document), this.selection));
      } catch (error) {
        if (
          !this.conflict ||
          !isDuplicateForTarget(error, this.table, this.conflict.target)
        ) {
          throw error;
        }
        if (this.conflict.kind === "update") {
          const targetColumns = Array.isArray(this.conflict.target)
            ? this.conflict.target
            : [this.conflict.target];
          const filter: Filter<Document> = Object.fromEntries(
            targetColumns.map((column) => [column.key, document[column.key]]),
          );
          if (this.conflict.setWhere) {
            Object.assign(filter, this.conflict.setWhere.filter);
          }
          const updateValues = Object.fromEntries(
            Object.entries(this.conflict.set).filter(
              ([, value]) => !isColumn(value),
            ),
          );
          if (this.table.updatedAtField) {
            updateValues[this.table.updatedAtField] = new Date();
          }
          const result = await targetCollection.findOneAndUpdate(
            filter,
            { $set: updateValues },
            { returnDocument: "after", session: this.session },
          );
          if (result) {
            returned.push(project(stripMongoId(result), this.selection));
          }
        }
        continue;
      }
    }
    return returned as TableRow[];
  }

  then<TResult1 = TableRow[], TResult2 = never>(
    onfulfilled?:
      ((value: TableRow[]) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }
}

class UpdateQuery<TableRow extends Row> implements PromiseLike<TableRow[]> {
  private changes: Row = {};
  private filter: Filter<Document> = {};
  private selection: Record<string, unknown> | undefined;
  private shouldReturn = false;

  constructor(
    private readonly table: Table<TableRow>,
    private readonly session?: ClientSession,
  ) {}

  set(value: Partial<TableRow>): this {
    this.changes = value as Row;
    return this;
  }

  where(value: Condition): this {
    this.filter = value.filter;
    return this;
  }

  returning(selection?: Record<string, unknown>): this {
    this.shouldReturn = true;
    this.selection = selection;
    return this;
  }

  private async execute(): Promise<TableRow[]> {
    const target = await collection(this.table);
    const changes = Object.fromEntries(
      Object.entries(this.changes).filter(([, value]) => !isColumn(value)),
    );
    if (this.table.updatedAtField)
      changes[this.table.updatedAtField] = new Date();
    if (this.shouldReturn) {
      const matches = await target
        .find(this.filter, {
          projection: { _id: 1 },
          session: this.session,
        })
        .toArray();
      if (matches.length === 0) return [];
      // Validate the database-derived values at the source, before either
      // MongoDB query. Do not allow a BSON object or RegExp into $in.
      const ids = matches.map((match) => canonicalStoredQueryId(match._id));
      await target.updateMany(
        { _id: { $in: ids } },
        { $set: changes },
        { session: this.session },
      );
      const updated = await target
        .find({ _id: { $in: ids } }, { session: this.session })
        .toArray();
      return updated.map((document) =>
        project(stripMongoId(document), this.selection),
      ) as TableRow[];
    }
    await target.updateMany(
      this.filter,
      { $set: changes },
      { session: this.session },
    );
    return [];
  }

  then<TResult1 = TableRow[], TResult2 = never>(
    onfulfilled?:
      ((value: TableRow[]) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }
}

async function cascadeDelete(
  table: Table,
  rows: Row[],
  session: ClientSession,
): Promise<void> {
  const current = await getMongoDatabase();
  const values = (field: string) => storedQueryIds(rows, field);
  if (table.collectionName === conversations.collectionName) {
    await current
      .collection(messages.collectionName)
      .deleteMany({ conversationId: { $in: values("id") } }, { session });
  } else if (table.collectionName === habitsTable.collectionName) {
    await current
      .collection(habitEntriesTable.collectionName)
      .deleteMany({ habitId: { $in: values("id") } }, { session });
  } else if (table.collectionName === medicationsTable.collectionName) {
    const filter = { medicationId: { $in: values("id") } };
    await current
      .collection(medicationLogsTable.collectionName)
      .deleteMany(filter, { session });
    await current
      .collection(medicationScheduleEntriesTable.collectionName)
      .deleteMany(filter, { session });
  } else if (table.collectionName === usersTable.collectionName) {
    const userIds = values("id");
    const ownedCollections = [
      "morning_logs",
      "evening_reports",
      "body_scans",
      "habit_entries",
      "habits",
      "medication_logs",
      "medication_schedule_entries",
      "medications",
      "daily_usage",
      "reminder_settings",
      "reminder_deliveries",
      "calendar_connections",
      "subscriptions",
      "entitlement_audit",
      "beta_grants",
    ];
    const conversationRows = await current
      .collection(conversations.collectionName)
      .find({ userId: { $in: userIds } }, { projection: { id: 1 }, session })
      .toArray();
    // A stored conversation ID is data, not a MongoDB query expression.
    const conversationIds = conversationRows.map((row) =>
      canonicalStoredQueryId(row.id),
    );
    await current
      .collection(messages.collectionName)
      .deleteMany({ conversationId: { $in: conversationIds } }, { session });
    await current
      .collection(conversations.collectionName)
      .deleteMany({ userId: { $in: userIds } }, { session });
    for (const name of ownedCollections) {
      await current
        .collection(name)
        .deleteMany({ userId: { $in: userIds } }, { session });
    }
  }
}

function requiresCascade(table: Table): boolean {
  return [
    usersTable.collectionName,
    conversations.collectionName,
    habitsTable.collectionName,
    medicationsTable.collectionName,
  ].includes(table.collectionName);
}

class DeleteQuery<TableRow extends Row> implements PromiseLike<TableRow[]> {
  private filter: Filter<Document> = {};
  private selection: Record<string, unknown> | undefined;
  private shouldReturn = false;

  constructor(
    private readonly table: Table<TableRow>,
    private readonly session?: ClientSession,
  ) {}

  where(value: Condition): this {
    this.filter = value.filter;
    return this;
  }

  returning(selection?: Record<string, unknown>): this {
    this.shouldReturn = true;
    this.selection = selection;
    return this;
  }

  private async executeWithSession(
    session?: ClientSession,
  ): Promise<TableRow[]> {
    const target = await collection(this.table);
    const documents = await target.find(this.filter, { session }).toArray();
    const rows = documents.map(stripMongoId);
    if (session && requiresCascade(this.table)) {
      await cascadeDelete(this.table, rows, session);
    }
    await target.deleteMany(this.filter, { session });
    return this.shouldReturn
      ? (rows.map((row) => project(row, this.selection)) as TableRow[])
      : [];
  }

  private async execute(): Promise<TableRow[]> {
    if (this.session || !requiresCascade(this.table)) {
      return this.executeWithSession(this.session);
    }
    const current = await getMongoDatabase();
    const standaloneSession = client!.startSession();
    let result: TableRow[] = [];
    try {
      await standaloneSession.withTransaction(async () => {
        result = await this.executeWithSession(standaloneSession);
      });
      return result;
    } finally {
      await standaloneSession.endSession();
    }
  }

  then<TResult1 = TableRow[], TResult2 = never>(
    onfulfilled?:
      ((value: TableRow[]) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }
}

export class MongoDataApi {
  constructor(readonly session?: ClientSession) {}

  select<Selection extends Record<string, unknown> | undefined = undefined>(
    selection?: Selection,
  ): SelectStart<Selection> {
    return new SelectStart(selection, this.session);
  }

  insert<TableRow extends Row>(table: Table<TableRow>): InsertQuery<TableRow> {
    return new InsertQuery(table, this.session);
  }

  update<TableRow extends Row>(table: Table<TableRow>): UpdateQuery<TableRow> {
    return new UpdateQuery(table, this.session);
  }

  delete<TableRow extends Row>(table: Table<TableRow>): DeleteQuery<TableRow> {
    return new DeleteQuery(table, this.session);
  }

  async count(table: Table, value?: Condition): Promise<number> {
    const target = await collection(table);
    return target.countDocuments(value?.filter ?? {}, {
      session: this.session,
    });
  }

  async transaction<T>(callback: (tx: MongoDataApi) => Promise<T>): Promise<T> {
    const current = await getMongoDatabase();
    void current;
    const transactionSession = client!.startSession();
    let result!: T;
    try {
      await transactionSession.withTransaction(
        async () => {
          result = await callback(new MongoDataApi(transactionSession));
        },
        {
          readConcern: { level: "snapshot" },
          writeConcern: { w: "majority" },
        },
      );
      return result;
    } finally {
      await transactionSession.endSession();
    }
  }
}

export const db = new MongoDataApi();
export type DbTransaction = MongoDataApi;

trace.getTracer("kindred-db");
