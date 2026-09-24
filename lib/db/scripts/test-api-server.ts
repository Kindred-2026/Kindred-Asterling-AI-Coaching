import { spawn } from "node:child_process";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { MongoClient } from "mongodb";
import { initializeMongoIndexes } from "../src/mongoDb";

const databaseName = "kindred_test";
const replicaSet = await MongoMemoryReplSet.create({
  binary: { version: "8.0.12" },
  replSet: { count: 1, storageEngine: "wiredTiger" },
});

try {
  const uri = replicaSet.getUri();
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const database = client.db(databaseName);
    const topology = await database.command({ hello: 1 });
    if (typeof topology.setName !== "string") {
      throw new Error("API tests require a MongoDB replica set");
    }
    await initializeMongoIndexes(database);
  } finally {
    await client.close();
  }

  const child = spawn(
    "pnpm",
    ["--filter", "@workspace/api-server", "run", "test"],
    {
      cwd: new URL("../../..", import.meta.url),
      env: {
        ...process.env,
        NODE_ENV: "test",
        DATABASE_PROVIDER: "mongo",
        HELCIM_PAYMENTS_ENABLED: "false",
        MONGODB_URI: uri,
        MONGODB_DATABASE: databaseName,
      },
      stdio: "inherit",
    },
  );
  const exitCode = await new Promise<number>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
  });
  if (exitCode !== 0) process.exitCode = exitCode;
} finally {
  await replicaSet.stop();
}
