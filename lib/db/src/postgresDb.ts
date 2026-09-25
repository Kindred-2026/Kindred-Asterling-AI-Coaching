import { randomUUID } from "node:crypto";
import { Pool, type QueryResult } from "pg";
import {
  allTables,
  dailyUsageTable,
  type Column,
  type SelectBuilder,
  type SelectionRow,
  type Table,
  usersTable,
} from "./mongoSchema";
import { snakeCase, camelCase } from "./migrationSupport";
import { validatePostgresSchemaCatalog } from "./postgresSchema";
import type { Condition as SharedCondition, SortExpression as SharedSortExpression } from "./mongoSchema";

type Row = Record<string, any>;
type Queryable = { query: (sql: string, values?: any[]) => Promise<QueryResult<any>>; connect?: () => Promise<any>; release?: () => void; end?: () => Promise<void> };

export type Condition = Extract<SharedCondition, { readonly __postgresCondition: true }>;
export type SortExpression = Extract<SharedSortExpression, { readonly __postgresSort: true }>;
type Scalar = string | number | boolean | Date | null;
type Expression =
  | { kind: "comparison"; column: Column; operator: "=" | ">" | ">=" | "<" | "<=" | "IN"; value: Scalar | readonly Scalar[] }
  | { kind: "logical"; operator: "AND" | "OR"; conditions: readonly Condition[] };
const expressions = new WeakMap<object, Expression>();

function column(value: unknown): value is Column {
  return !!value && typeof value === "object" && typeof (value as Column).key === "string" && typeof (value as Column).tableName === "string";
}
function scalar(value: unknown): Scalar {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value instanceof Date && Number.isFinite(value.getTime())) return new Date(value.getTime());
  throw new Error("PostgreSQL conditions accept scalar values only");
}
function make(expression: Expression): Condition {
  const result = { __postgresCondition: true as const };
  expressions.set(result, expression);
  return result;
}
function condition(value: unknown): Expression {
  if (!value || typeof value !== "object" || expressions.get(value as object) === undefined)
    throw new Error("Invalid database condition");
  return expressions.get(value as object)!;
}
function comparison(columnValue: Column, operator: "=" | ">" | ">=" | "<" | "<=" | "IN", value: unknown): Condition {
  if (!column(columnValue)) throw new Error("Invalid database condition column");
  if (columnValue.tableName !== "") {
    const table = allTables.find((candidate) => candidate.collectionName === columnValue.tableName);
    if (!table || !Object.hasOwn(table.columns, columnValue.key)) throw new Error("Invalid database condition column");
  }
  if (column(value)) throw new Error("Cross-table comparisons require an explicit lookup");
  return make({ kind: "comparison", column: columnValue, operator, value: operator === "IN" ? (Array.isArray(value) ? value.map(scalar) : (() => { throw new Error("IN requires an array"); })()) : scalar(value) });
}
export function eq(c: Column, v: unknown): Condition { return comparison(c, "=", v); }
export function gt(c: Column, v: unknown): Condition { return comparison(c, ">", v); }
export function gte(c: Column, v: unknown): Condition { return comparison(c, ">=", v); }
export function lt(c: Column, v: unknown): Condition { return comparison(c, "<", v); }
export function lte(c: Column, v: unknown): Condition { return comparison(c, "<=", v); }
export function isNull(c: Column): Condition { return comparison(c, "=", null); }
export function inArray(c: Column, v: readonly unknown[]): Condition { return comparison(c, "IN", v); }
export function and(...values: Condition[]): Condition { values.forEach(condition); return make({ kind: "logical", operator: "AND", conditions: values }); }
export function or(...values: Condition[]): Condition { values.forEach(condition); return make({ kind: "logical", operator: "OR", conditions: values }); }
export function asc(c: Column): SortExpression { validateColumn(c); return { __postgresSort: true, column: c, direction: "ASC" }; }
export function desc(c: Column): SortExpression { validateColumn(c); return { __postgresSort: true, column: c, direction: "DESC" }; }

function tableOf<TableRow extends Row>(value: Table<TableRow>): Table<TableRow> {
  const found = allTables.find((candidate) => candidate.collectionName === value?.collectionName);
  if (!found || !Object.is(found, value)) throw new Error("Invalid database table");
  return value;
}
function validateColumn(value: unknown, table?: Table): asserts value is Column {
  if (!column(value)) throw new Error("Invalid database column");
  const owner = allTables.find((candidate) => candidate.collectionName === value.tableName);
  if (!owner || !Object.hasOwn(owner.columns, value.key) || (table && owner !== table)) throw new Error("Invalid database column");
}
function identifier(value: string): string { return `"${value.replaceAll('"', '""')}"`; }
function sqlColumn(c: Column, table?: Table): string { validateColumn(c, table); return identifier(snakeCase(c.key)); }
function fromDb(row: Row): Row { return Object.fromEntries(Object.entries(row).map(([key, value]) => [camelCase(key), value])); }
function selectionSql(selection: Record<string, unknown> | undefined, table: Table): { sql: string; project: (row: Row) => Row } {
  if (!selection) return { sql: "*", project: fromDb };
  const entries = Object.entries(selection);
  const columns = entries.map(([alias, value]) => `${sqlColumn(value as Column, table)} AS ${identifier(alias)}`).join(", ");
  return { sql: columns, project: (row) => Object.fromEntries(entries.map(([alias]) => [alias, row[alias]])) };
}
function compile(value: Condition, table: Table, params: unknown[], qualify = false): string {
  const expression = condition(value);
  if (expression.kind === "logical") {
    if (!expression.conditions.length) return expression.operator === "AND" ? "TRUE" : "FALSE";
    return `(${expression.conditions.map((child) => compile(child, table, params, qualify)).join(` ${expression.operator} `)})`;
  }
  const left = qualify ? `${identifier(table.collectionName)}.${sqlColumn(expression.column, table)}` : sqlColumn(expression.column, table);
  if (expression.operator === "IN") {
    const values = expression.value as readonly Scalar[];
    if (!values.length) return "FALSE";
    return `${left} IN (${values.map((item) => { params.push(item); return `$${params.length}`; }).join(", ")})`;
  }
  params.push(expression.value);
  return expression.value === null ? `${left} IS NULL` : `${left} ${expression.operator} $${params.length}`;
}
function validateValue(value: unknown): void {
  if (value === undefined || typeof value === "function" || column(value)) throw new Error("Invalid PostgreSQL value");
  if (value instanceof Date && !Number.isFinite(value.getTime())) throw new Error("Invalid PostgreSQL date");
  if (typeof value === "number" && !Number.isFinite(value)) throw new Error("Invalid PostgreSQL number");
  if (Array.isArray(value)) value.forEach(validateValue);
  else if (value && typeof value === "object" && !(value instanceof Date)) Object.values(value).forEach(validateValue);
}
function rowValues(table: Table, input: Row): { columns: string[]; values: unknown[] } {
  const keys = Object.keys(input);
  keys.forEach((key) => { if (!Object.hasOwn(table.columns, key)) throw new Error(`Invalid ${table.collectionName} column`); validateValue(input[key]); });
  return { columns: keys.map((key) => identifier(snakeCase(key))), values: keys.map((key) => input[key]) };
}
function defaults(table: Table, input: Row): Row {
  const result: Row = {};
  for (const [key, value] of Object.entries(table.defaults)) result[key] = typeof value === "function" ? value() : value;
  Object.assign(result, input);
  if (table.uuidField && result[table.uuidField] == null) result[table.uuidField] = randomUUID();
  return result;
}
function project(row: Row, selection: Record<string, unknown> | undefined, table: Table): Row {
  return selection ? selectionSql(selection, table).project(row) : fromDb(row);
}
function targetColumns(target: Column | Column[], table: Table): Column[] { const result = Array.isArray(target) ? target : [target]; result.forEach((c) => validateColumn(c, table)); return result; }

export class DatabaseLeaseUnavailableError extends Error {}

export type PostgresOptions = { pool?: Pool; url?: string; maxPoolSize?: number };
let pool: Pool | null = null;
function getPool(options?: PostgresOptions): Pool {
  if (pool) return pool;
  if (options?.pool) { pool = options.pool; return pool; }
  const url = (options?.url ?? process.env.POSTGRES_URL)?.trim();
  if (!url || !/^postgres(?:ql):\/\//i.test(url)) throw new Error("POSTGRES_URL must be a PostgreSQL URL");
  pool = new Pool({ connectionString: url, max: options?.maxPoolSize ?? 10, min: 0, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 5_000, maxUses: 0 });
  return pool;
}
export async function initializePostgresDatabase(options?: PostgresOptions): Promise<void> {
  const current = getPool(options);
  await current.query("SELECT 1");
  const [tables, columns, constraints] = await Promise.all([
    current.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'"),
    current.query("SELECT table_name, column_name, data_type, udt_name FROM information_schema.columns WHERE table_schema = 'public'"),
    current.query(`SELECT child.relname AS table_name, c.contype AS type,
      ARRAY(SELECT a.attname FROM unnest(c.conkey) WITH ORDINALITY AS key_column(attnum, ordinal_position)
        JOIN pg_attribute AS a ON a.attrelid = c.conrelid AND a.attnum = key_column.attnum
        ORDER BY key_column.ordinal_position) AS columns,
      parent.relname AS referenced_table,
      ARRAY(SELECT a.attname FROM unnest(c.confkey) WITH ORDINALITY AS referenced_column(attnum, ordinal_position)
        JOIN pg_attribute AS a ON a.attrelid = c.confrelid AND a.attnum = referenced_column.attnum
        ORDER BY referenced_column.ordinal_position) AS referenced_columns,
      CASE c.confdeltype WHEN 'c' THEN 'CASCADE' WHEN 'n' THEN 'SET NULL' WHEN 'r' THEN 'RESTRICT'
        WHEN 'd' THEN 'SET DEFAULT' WHEN 'a' THEN 'NO ACTION' END AS delete_action
      FROM pg_constraint AS c
      JOIN pg_class AS child ON child.oid = c.conrelid
      JOIN pg_namespace AS child_schema ON child_schema.oid = child.relnamespace
      LEFT JOIN pg_class AS parent ON parent.oid = c.confrelid
      LEFT JOIN pg_namespace AS parent_schema ON parent_schema.oid = parent.relnamespace
      WHERE child_schema.nspname = 'public' AND (parent.oid IS NULL OR parent_schema.nspname = 'public')
        AND c.contype IN ('p', 'u', 'f')`),
  ]);
  const missing = validatePostgresSchemaCatalog({
    tables: tables.rows.map((row) => row.table_name),
    columns: columns.rows,
    constraints: constraints.rows,
  });
  if (missing.length) {
    throw new Error(`PostgreSQL schema is incomplete; missing schema objects: ${missing.join(", ")}`);
  }
}
export async function getPostgresPool(options?: PostgresOptions): Promise<Pool> { return getPool(options); }
export async function pingPostgresDatabase(): Promise<void> { await getPool().query("SELECT 1"); }
export async function closePostgresDatabase(): Promise<void> { const current = pool; pool = null; if (current) await current.end(); }

class SelectQuery<Result extends Row> implements PromiseLike<Result[]> {
  private filter?: Condition; private sorts: Array<SortExpression | Column> = []; private maximum?: number;
  constructor(private readonly api: PostgresDataApi, private readonly table: Table, private readonly selection?: Record<string, unknown>) {}
  where(value: Condition): this { condition(value); this.filter = value; return this; }
  orderBy(...values: Array<SortExpression | Column>): this {
    values.forEach((value) => {
      if (column(value)) validateColumn(value, this.table);
      else {
        const sort = value as SortExpression;
        if (sort?.__postgresSort !== true || (sort.direction !== "ASC" && sort.direction !== "DESC")) throw new Error("Invalid database sort");
        validateColumn(sort.column, this.table);
      }
    });
    this.sorts = values;
    return this;
  }
  limit(value: number): this { if (!Number.isSafeInteger(value) || value < 0) throw new Error("Invalid limit"); this.maximum = value; return this; }
  async execute(): Promise<Result[]> { const params: unknown[] = []; const selected = selectionSql(this.selection, this.table); let sql = `SELECT ${selected.sql} FROM ${identifier(this.table.collectionName)}`; if (this.filter) sql += ` WHERE ${compile(this.filter, this.table, params)}`; if (this.sorts.length) sql += ` ORDER BY ${this.sorts.map((v) => { const sort = v as SortExpression; const c = sort.column ?? (v as Column); return `${sqlColumn(c, this.table)} ${sort.direction ?? "ASC"}`; }).join(", ")}`; if (this.maximum !== undefined) sql += ` LIMIT ${this.maximum}`; const result = await this.api.query(sql, params); return result.rows.map((r) => project(r, this.selection, this.table) as Result); }
  then<T = Result[], E = never>(ok?: ((v: Result[]) => T | PromiseLike<T>) | null, fail?: ((e: unknown) => E | PromiseLike<E>) | null): PromiseLike<T | E> { return this.execute().then(ok, fail); }
}
class PostgresSelectBuilder<Selection extends Record<string, unknown> | undefined> implements SelectBuilder<Selection> {
  constructor(private readonly api: PostgresDataApi, private readonly selection?: Selection) {}
  from<TableRow extends Row>(table: Table<TableRow>): SelectQuery<SelectionRow<Selection, TableRow>> {
    return new SelectQuery<SelectionRow<Selection, TableRow>>(this.api, tableOf(table), this.selection);
  }
}
class InsertQuery<TableRow extends Row> implements PromiseLike<TableRow[]> {
  private inputs: Row[] = []; private conflict?: { kind: "nothing" | "update"; target: Column | Column[]; set?: Row; setWhere?: Condition }; private selection?: Record<string, unknown>;
  constructor(private readonly api: PostgresDataApi, private readonly table: Table<TableRow>) {}
  values(value: Row | Row[]): this { this.inputs = (Array.isArray(value) ? value : [value]).map((v) => defaults(this.table, v)); return this; }
  onConflictDoNothing(options: { target: Column | Column[] }): this { targetColumns(options.target, this.table); this.conflict = { kind: "nothing", target: options.target }; return this; }
  onConflictDoUpdate(options: { target: Column | Column[]; set: Row; setWhere?: Condition }): this { targetColumns(options.target, this.table); if (options.setWhere) condition(options.setWhere); rowValues(this.table, options.set); this.conflict = { kind: "update", ...options }; return this; }
  returning(selection?: Record<string, unknown>): this { selectionSql(selection, this.table); this.selection = selection; return this; }
  async execute(): Promise<TableRow[]> { const out: TableRow[] = []; for (const input of this.inputs) { const prepared = { ...input }; if (this.table.autoIncrement && prepared[this.table.autoIncrement] == null) delete prepared[this.table.autoIncrement]; const { columns, values } = rowValues(this.table, prepared); if (!columns.length) throw new Error("Insert requires at least one value"); const placeholders = values.map((_, i) => `$${i + 1}`); let sql = `INSERT INTO ${identifier(this.table.collectionName)} (${columns.join(", ")}) VALUES (${placeholders.join(", ")})`; if (this.conflict) { const targets = targetColumns(this.conflict.target, this.table).map((c) => sqlColumn(c, this.table)).join(", "); if (this.conflict.kind === "nothing") sql += ` ON CONFLICT (${targets}) DO NOTHING`; else { const set = this.conflict.set!; const assignments = Object.keys(set).map((key) => `${identifier(snakeCase(key))} = $${values.push(set[key])}`).join(", "); const updated = this.table.updatedAtField && !Object.hasOwn(set, this.table.updatedAtField) ? `, ${identifier(snakeCase(this.table.updatedAtField))} = $${values.push(new Date())}` : ""; sql += ` ON CONFLICT (${targets}) DO UPDATE SET ${assignments || `${identifier(snakeCase(this.table.primaryKey[0]!))} = EXCLUDED.${identifier(snakeCase(this.table.primaryKey[0]!))}`}${updated}`; if (this.conflict.setWhere) sql += ` WHERE ${compile(this.conflict.setWhere, this.table, values, true)}`; } } sql += " RETURNING *"; const result = await this.api.query(sql, values); out.push(...result.rows.map((r) => project(r, this.selection, this.table) as TableRow)); } return out; }
  then<T = TableRow[], E = never>(ok?: ((v: TableRow[]) => T | PromiseLike<T>) | null, fail?: ((e: unknown) => E | PromiseLike<E>) | null): PromiseLike<T | E> { return this.execute().then(ok, fail); }
}
class UpdateQuery<TableRow extends Row> implements PromiseLike<TableRow[]> {
  private changes: Row = {}; private filter?: Condition; private selection?: Record<string, unknown>; private shouldReturn = false;
  constructor(private readonly api: PostgresDataApi, private readonly table: Table<TableRow>) {}
  set(value: Row): this { if (!Object.keys(value).length) throw new Error("Update requires at least one value"); rowValues(this.table, value); this.changes = value; return this; }
  where(value: Condition): this { condition(value); this.filter = value; return this; }
  returning(selection?: Record<string, unknown>): this { selectionSql(selection, this.table); this.selection = selection; this.shouldReturn = true; return this; }
  async execute(): Promise<TableRow[]> { const values: unknown[] = []; const assignments = Object.keys(this.changes).map((key) => `${identifier(snakeCase(key))} = $${values.push(this.changes[key])}`).join(", "); const all = this.table.updatedAtField && !Object.hasOwn(this.changes, this.table.updatedAtField) ? `${assignments}, ${identifier(snakeCase(this.table.updatedAtField))} = $${values.push(new Date())}` : assignments; let sql = `UPDATE ${identifier(this.table.collectionName)} SET ${all}`; if (this.filter) sql += ` WHERE ${compile(this.filter, this.table, values)}`; if (this.shouldReturn) sql += " RETURNING *"; const result = await this.api.query(sql, values); return this.shouldReturn ? result.rows.map((r) => project(r, this.selection, this.table) as TableRow) : []; }
  then<T = TableRow[], E = never>(ok?: ((v: TableRow[]) => T | PromiseLike<T>) | null, fail?: ((e: unknown) => E | PromiseLike<E>) | null): PromiseLike<T | E> { return this.execute().then(ok, fail); }
}
class DeleteQuery<TableRow extends Row> implements PromiseLike<TableRow[]> {
  private filter?: Condition; private selection?: Record<string, unknown>; private shouldReturn = false;
  constructor(private readonly api: PostgresDataApi, private readonly table: Table<TableRow>) {}
  where(value: Condition): this { condition(value); this.filter = value; return this; }
  returning(selection?: Record<string, unknown>): this { selectionSql(selection, this.table); this.selection = selection; this.shouldReturn = true; return this; }
  async execute(): Promise<TableRow[]> { const values: unknown[] = []; let sql = `DELETE FROM ${identifier(this.table.collectionName)}`; if (this.filter) sql += ` WHERE ${compile(this.filter, this.table, values)}`; if (this.shouldReturn) sql += " RETURNING *"; const result = await this.api.query(sql, values); return this.shouldReturn ? result.rows.map((r) => project(r, this.selection, this.table) as TableRow) : []; }
  then<T = TableRow[], E = never>(ok?: ((v: TableRow[]) => T | PromiseLike<T>) | null, fail?: ((e: unknown) => E | PromiseLike<E>) | null): PromiseLike<T | E> { return this.execute().then(ok, fail); }
}

export class PostgresDataApi {
  constructor(private readonly client?: Queryable, private readonly transactionBound = false) {}
  query(sql: string, values?: readonly unknown[]): Promise<QueryResult<any>> { return (this.client ?? getPool()).query(sql, values as unknown[] | undefined); }
  async initialize(): Promise<void> { await this.query("SELECT 1"); }
  async ping(): Promise<void> { await this.query("SELECT 1"); }
  async incrementDailyUsage(userId: string, date: string, limit: number): Promise<number | null> {
    if (!Number.isSafeInteger(limit) || limit <= 0) return null;
    const table = identifier(dailyUsageTable.collectionName);
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const updated = await this.query(
        `UPDATE ${table} SET ${identifier("count")} = ${identifier("count")} + 1 WHERE user_id = $1 AND date = $2 AND ${identifier("count")} < ${limit} RETURNING ${identifier("count")}`,
        [userId, date],
      );
      if (updated.rows.length === 1) return Number(updated.rows[0]?.count);
      const inserted = await this.query(
        `INSERT INTO ${table} (user_id, date, count) VALUES ($1, $2, 1) ON CONFLICT (user_id, date) DO NOTHING RETURNING count`,
        [userId, date],
      );
      if (inserted.rows.length === 1) return Number(inserted.rows[0]?.count);
      const current = await this.query(`SELECT count FROM ${table} WHERE user_id = $1 AND date = $2`, [userId, date]);
      if (current.rows.length && Number(current.rows[0]?.count) >= limit) return null;
    }
    throw new Error("Daily usage update exceeded its retry limit");
  }
  async refundDailyUsage(userId: string, date: string): Promise<void> {
    await this.query(`UPDATE ${identifier(dailyUsageTable.collectionName)} SET ${identifier("count")} = ${identifier("count")} - 1 WHERE user_id = $1 AND date = $2 AND ${identifier("count")} > 0`, [userId, date]);
  }
  async findUsersByEmail(email: string, limit = 2): Promise<string[]> {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new Error("Invalid user lookup limit");
    const result = await this.query(`SELECT id FROM ${identifier(usersTable.collectionName)} WHERE LOWER(email) = LOWER($1) ORDER BY id LIMIT $2`, [email, limit]);
    return result.rows.flatMap((row) => typeof row.id === "string" ? [row.id] : []);
  }
  async close(): Promise<void> {
    if (this.transactionBound) return;
    if (this.client) {
      if (this.client.end) await this.client.end();
      return;
    }
    await closePostgresDatabase();
  }
  select<Selection extends Record<string, unknown> | undefined = undefined>(selection?: Selection): SelectBuilder<Selection> { return new PostgresSelectBuilder(this, selection); }
  insert<TableRow extends Row>(table: Table<TableRow>): InsertQuery<TableRow> { return new InsertQuery(this, tableOf(table)); }
  update<TableRow extends Row>(table: Table<TableRow>): UpdateQuery<TableRow> { return new UpdateQuery(this, tableOf(table)); }
  delete<TableRow extends Row>(table: Table<TableRow>): DeleteQuery<TableRow> { return new DeleteQuery(this, tableOf(table)); }
  async count(table: Table, filter?: Condition): Promise<number> { const current = tableOf(table); const values: unknown[] = []; let sql = `SELECT count(*) AS total FROM ${identifier(current.collectionName)}`; if (filter) sql += ` WHERE ${compile(filter, current, values)}`; const result = await this.query(sql, values); return Number(result.rows[0]?.total ?? 0); }
  async transaction<T>(callback: (tx: PostgresDataApi) => Promise<T>): Promise<T> {
    const nested = this.transactionBound;
    const connection = nested ? this.client! : this.client?.connect ? await this.client.connect() : await getPool().connect();
    const savepoint = nested ? `kindred_${randomUUID().replaceAll("-", "")}` : undefined;
    try {
      await connection.query(nested ? `SAVEPOINT ${savepoint}` : "BEGIN");
      const result = await callback(new PostgresDataApi(connection, true));
      await connection.query(nested ? `RELEASE SAVEPOINT ${savepoint}` : "COMMIT");
      return result;
    } catch (error) {
      await connection.query(nested ? `ROLLBACK TO SAVEPOINT ${savepoint}` : "ROLLBACK");
      if (nested) await connection.query(`RELEASE SAVEPOINT ${savepoint}`);
      throw error;
    } finally {
      if (connection !== this.client) connection.release?.();
    }
  }
  async withDatabaseLease<T>(namespace: string, key: string, ttlMs: number, callback: () => Promise<T>): Promise<T> { return withDatabaseLease(namespace, key, ttlMs, callback, this.client ?? getPool()); }
}
export async function withDatabaseLease<T>(namespace: string, key: string, ttlMs: number, callback: () => Promise<T>, queryable: Queryable = getPool()): Promise<T> {
  if (!namespace.trim() || !key.trim() || !Number.isSafeInteger(ttlMs) || ttlMs < 100 || ttlMs > 2_147_483_647) throw new Error("Invalid database lease parameters");
  const leaseKey = `${namespace}:${key}`;
  const token = randomUUID();
  const leaseTable = identifier("database_leases");
  const expirySql = "clock_timestamp() + ($3::integer * INTERVAL '1 millisecond')";
  const claim = await queryable.query(
    `INSERT INTO ${leaseTable} (lease_key, token, expires_at) VALUES ($1, $2, ${expirySql}) ON CONFLICT (lease_key) DO UPDATE SET token = EXCLUDED.token, expires_at = EXCLUDED.expires_at WHERE ${leaseTable}.expires_at <= clock_timestamp() RETURNING token`,
    [leaseKey, token, ttlMs],
  );
  if (claim.rows.length !== 1 || claim.rows[0]?.token !== token) throw new DatabaseLeaseUnavailableError(`Database lease is already held: ${namespace}`);

  let lost = false;
  let renewal: Promise<void> | undefined;
  const timer = setInterval(() => {
    if (renewal) return;
    renewal = queryable.query(
      `UPDATE ${leaseTable} SET expires_at = ${expirySql} WHERE lease_key = $1 AND token = $2 RETURNING token`,
      [leaseKey, token, ttlMs],
    ).then((result) => { if (result.rows.length !== 1 || result.rows[0]?.token !== token) lost = true; }).catch(() => { lost = true; }).finally(() => { renewal = undefined; });
  }, Math.max(50, Math.floor(ttlMs / 3)));
  timer.unref();
  try {
    const result = await callback();
    if (renewal) await renewal;
    if (lost) throw new DatabaseLeaseUnavailableError(`Database lease was lost: ${namespace}`);
    return result;
  } finally {
    clearInterval(timer);
    if (renewal) await renewal;
    await queryable.query(`DELETE FROM ${leaseTable} WHERE lease_key = $1 AND token = $2`, [leaseKey, token]);
  }
}
export const postgresDb = new PostgresDataApi();
export type DbTransaction = PostgresDataApi;
