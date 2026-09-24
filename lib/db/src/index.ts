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
} from "./postgresDb";

const configuredProvider = process.env.DATABASE_PROVIDER?.trim().toLowerCase();
if (configuredProvider && configuredProvider !== "mongo" && configuredProvider !== "postgres") {
  throw new Error("DATABASE_PROVIDER must be either mongo or postgres");
}

// Mongo remains the default until the staged migration and cutover gates pass.
// Fly can opt into the PostgreSQL runtime only after its full schema is applied.
const usePostgres = configuredProvider === "postgres";
export const db = (usePostgres ? postgresDb : mongoDb) as unknown as MongoDataApi;
export const DatabaseLeaseUnavailableError = usePostgres ? PostgresLeaseError : MongoLeaseError;
export const and: typeof mongoAnd = usePostgres ? postgresAnd as unknown as typeof mongoAnd : mongoAnd;
export const asc: typeof mongoAsc = usePostgres ? postgresAsc as unknown as typeof mongoAsc : mongoAsc;
export const desc: typeof mongoDesc = usePostgres ? postgresDesc as unknown as typeof mongoDesc : mongoDesc;
export const eq: typeof mongoEq = usePostgres ? postgresEq as unknown as typeof mongoEq : mongoEq;
export const gt: typeof mongoGt = usePostgres ? postgresGt as unknown as typeof mongoGt : mongoGt;
export const gte: typeof mongoGte = usePostgres ? postgresGte as unknown as typeof mongoGte : mongoGte;
export const inArray: typeof mongoInArray = usePostgres ? postgresInArray as unknown as typeof mongoInArray : mongoInArray;
export const isNull: typeof mongoIsNull = usePostgres ? postgresIsNull as unknown as typeof mongoIsNull : mongoIsNull;
export const lt: typeof mongoLt = usePostgres ? postgresLt as unknown as typeof mongoLt : mongoLt;
export const lte: typeof mongoLte = usePostgres ? postgresLte as unknown as typeof mongoLte : mongoLte;
export const or: typeof mongoOr = usePostgres ? postgresOr as unknown as typeof mongoOr : mongoOr;

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
  type Condition,
  type DbTransaction,
} from "./mongoDb";
export {
  PostgresDataApi,
  initializePostgresDatabase,
  pingPostgresDatabase,
  type PostgresOptions,
} from "./postgresDb";
export * from "./mongoSchema";
export * from "./migrationSupport";
