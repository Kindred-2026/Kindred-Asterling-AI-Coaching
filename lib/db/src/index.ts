import {
  closeDatabase as closeMongoDatabase,
  DatabaseLeaseUnavailableError as MongoLeaseError,
  db as mongoDb,
  and as mongoAnd,
  asc as mongoAsc,
  desc as mongoDesc,
  eq as mongoEq,
  gt as mongoGt,
  gte as mongoGte,
  inArray as mongoInArray,
  initializeDatabase as initializeMongoDatabase,
  isNull as mongoIsNull,
  lt as mongoLt,
  lte as mongoLte,
  or as mongoOr,
  pingDatabase as pingMongoDatabase,
  withDatabaseLease as withMongoDatabaseLease,
  type MongoDataApi,
} from "./mongoDb";
import {
  closePostgresDatabase,
  DatabaseLeaseUnavailableError as PostgresLeaseError,
  and as postgresAnd,
  asc as postgresAsc,
  desc as postgresDesc,
  eq as postgresEq,
  gt as postgresGt,
  gte as postgresGte,
  inArray as postgresInArray,
  initializePostgresDatabase,
  isNull as postgresIsNull,
  lt as postgresLt,
  lte as postgresLte,
  or as postgresOr,
  pingPostgresDatabase,
  postgresDb,
  withDatabaseLease as withPostgresDatabaseLease,
  type Condition as PostgresCondition,
} from "./postgresDb";
import type { Condition, DataApi, SortExpression } from "./mongoSchema";

const configuredProvider = process.env.DATABASE_PROVIDER?.trim().toLowerCase();
if (configuredProvider && configuredProvider !== "mongo" && configuredProvider !== "postgres") {
  throw new Error("DATABASE_PROVIDER must be either mongo or postgres");
}

// Mongo remains the default until the staged migration and cutover gates pass.
// Fly can opt into the PostgreSQL runtime only after its full schema is applied.
const usePostgres = configuredProvider === "postgres";
export const db: DataApi = usePostgres ? postgresDb : mongoDb;
export const DatabaseLeaseUnavailableError = usePostgres ? PostgresLeaseError : MongoLeaseError;
function asPostgresConditions(conditions: Condition[]): PostgresCondition[] {
  return conditions.map((condition) => {
    if (!("__postgresCondition" in condition) || condition.__postgresCondition !== true) {
      throw new Error("Condition does not belong to the active PostgreSQL adapter");
    }
    return condition;
  });
}
export const and: (...conditions: Condition[]) => Condition = (...conditions) =>
  usePostgres ? postgresAnd(...asPostgresConditions(conditions)) : mongoAnd(...conditions);
export const asc = usePostgres ? postgresAsc : mongoAsc;
export const desc = usePostgres ? postgresDesc : mongoDesc;
export const eq: typeof mongoEq = usePostgres ? postgresEq : mongoEq;
export const gt: typeof mongoGt = usePostgres ? postgresGt : mongoGt;
export const gte: typeof mongoGte = usePostgres ? postgresGte : mongoGte;
export const inArray: typeof mongoInArray = usePostgres ? postgresInArray : mongoInArray;
export const isNull: typeof mongoIsNull = usePostgres ? postgresIsNull : mongoIsNull;
export const lt: typeof mongoLt = usePostgres ? postgresLt : mongoLt;
export const lte: typeof mongoLte = usePostgres ? postgresLte : mongoLte;
export const or: (...conditions: Condition[]) => Condition = (...conditions) =>
  usePostgres ? postgresOr(...asPostgresConditions(conditions)) : mongoOr(...conditions);

export async function initializeDatabase(): Promise<void> {
  if (usePostgres) return initializePostgresDatabase();
  return initializeMongoDatabase();
}

export async function closeDatabase(): Promise<void> {
  if (usePostgres) return closePostgresDatabase();
  return closeMongoDatabase();
}

export async function pingDatabase(): Promise<void> {
  if (usePostgres) return pingPostgresDatabase();
  return pingMongoDatabase();
}

export async function withDatabaseLease<T>(
  namespace: string,
  key: string,
  ttlMs: number,
  callback: () => Promise<T>,
): Promise<T> {
  if (usePostgres) return withPostgresDatabaseLease(namespace, key, ttlMs, callback);
  return withMongoDatabaseLease(namespace, key, ttlMs, callback);
}

export {
  MongoDataApi,
  getMongoDatabase,
  initializeMongoCounters,
  initializeMongoIndexes,
  type DbTransaction,
} from "./mongoDb";
export {
  PostgresDataApi,
  initializePostgresDatabase,
  pingPostgresDatabase,
  type PostgresOptions,
} from "./postgresDb";
export type { DataApi, Condition, SortExpression } from "./mongoSchema";
export * from "./mongoSchema";
export * from "./migrationSupport";
