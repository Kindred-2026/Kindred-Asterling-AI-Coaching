import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { MongoClient, type ClientSession, type Db, type Document } from "mongodb";

const WRITE_FLAGS = ["--write", "--non-production"] as const;
const BATCH_SIZE = 500;

export type MessageOwnershipBackfillResult = {
  scanned: number;
  alreadyOwned: number;
  missingOwner: number;
  modified: number;
};

type BackfillOptions = {
  write?: boolean;
  session?: ClientSession;
};

type OwnershipRow = Document & {
  conversationId?: unknown;
  userId?: unknown;
  conversations?: Array<{ userId?: unknown }>;
};

function validatedConversationId(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    throw new Error("Message has an invalid conversationId");
  }
  return value as number;
}

function validatedUserId(value: unknown): string {
  if (typeof value !== "string" || value.length === 0 || value.includes("\0")) {
    throw new Error("Conversation has an invalid userId");
  }
  return value;
}

async function inspectMessages(
  database: Db,
  session?: ClientSession,
): Promise<{
  result: MessageOwnershipBackfillResult;
  ownersByConversation: Map<number, string>;
}> {
  const result: MessageOwnershipBackfillResult = {
    scanned: 0,
    alreadyOwned: 0,
    missingOwner: 0,
    modified: 0,
  };
  const ownersByConversation = new Map<number, string>();
  const cursor = database.collection("messages").aggregate<OwnershipRow>(
    [
      {
        $lookup: {
          from: "conversations",
          localField: "conversationId",
          foreignField: "id",
          as: "conversations",
        },
      },
      { $project: { conversationId: 1, userId: 1, conversations: { userId: 1 } } },
    ],
    { batchSize: BATCH_SIZE, session },
  );
  try {
    for await (const message of cursor) {
      result.scanned += 1;
      const matches = message.conversations ?? [];
      if (matches.length !== 1) {
        throw new Error(
          `Message conversationId must map to exactly one conversation; found ${matches.length}`,
        );
      }
      const conversationId = validatedConversationId(message.conversationId);
      const owner = validatedUserId(matches[0]?.userId);
      const knownOwner = ownersByConversation.get(conversationId);
      if (knownOwner !== undefined && knownOwner !== owner) {
        throw new Error("Conversation ID maps to multiple owners");
      }
      ownersByConversation.set(conversationId, owner);
      if (Object.hasOwn(message, "userId")) {
        if (message.userId !== owner) {
          throw new Error("Existing message owner does not match its conversation owner");
        }
        result.alreadyOwned += 1;
      } else {
        result.missingOwner += 1;
      }
    }
  } finally {
    await cursor.close();
  }
  return { result, ownersByConversation };
}

/** Validate every message before performing any idempotent owner updates. */
export async function backfillMessageOwnership(
  database: Db,
  options: BackfillOptions = {},
): Promise<MessageOwnershipBackfillResult> {
  const inspection = await inspectMessages(database, options.session);
  if (!options.write || inspection.result.missingOwner === 0) {
    return inspection.result;
  }

  let modified = 0;
  const entries = [...inspection.ownersByConversation.entries()];
  for (let offset = 0; offset < entries.length; offset += BATCH_SIZE) {
    const operations = entries
      .slice(offset, offset + BATCH_SIZE)
      .map(([conversationId, userId]) => ({
        updateMany: {
          filter: { conversationId, userId: { $exists: false } },
          update: { $set: { userId } },
        },
      }));
    if (operations.length === 0) continue;
    const writeResult = await database
      .collection("messages")
      .bulkWrite(operations, { ordered: true, session: options.session });
    modified += writeResult.modifiedCount;
  }
  if (modified !== inspection.result.missingOwner) {
    throw new Error("Message ownership update count changed during backfill");
  }
  const verification = await inspectMessages(database, options.session);
  if (
    verification.result.scanned !== inspection.result.scanned ||
    verification.result.missingOwner !== 0
  ) {
    throw new Error("Message ownership verification failed after backfill");
  }
  return { ...inspection.result, modified };
}

export function authorizeMessageOwnershipMigration(
  args: readonly string[],
  environment: string | undefined,
  uri: string,
  databaseName: string,
): boolean {
  if (args.some((arg) => !WRITE_FLAGS.includes(arg as (typeof WRITE_FLAGS)[number]))) {
    throw new Error("Unrecognized message ownership migration argument");
  }
  if (environment === "production") {
    throw new Error("Message ownership migration must never run in production mode");
  }
  if (!uri.startsWith("mongodb://") && !uri.startsWith("mongodb+srv://")) {
    throw new Error("Message ownership migration requires a MongoDB URI");
  }
  if (!/(^|[_-])(test|dev|development|fixture|rehearsal|staging)([_-]|$)/i.test(databaseName)) {
    throw new Error("Message ownership migration requires an explicitly non-production database");
  }
  const write = args.includes("--write");
  const confirmed = args.includes("--non-production");
  if (write !== confirmed) {
    throw new Error("Writes require both --write and --non-production");
  }
  if (write && !["test", "development", "staging"].includes(environment ?? "")) {
    throw new Error("Writes require NODE_ENV=test, development, or staging");
  }
  return write;
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

export async function runMessageOwnershipMigration(
  args: readonly string[] = process.argv.slice(2),
): Promise<void> {
  const uri = required("MONGODB_MESSAGE_OWNERSHIP_URI");
  const databaseName = required("MONGODB_MESSAGE_OWNERSHIP_DATABASE");
  const write = authorizeMessageOwnershipMigration(args, process.env.NODE_ENV, uri, databaseName);
  const client = new MongoClient(uri, {
    appName: "kindred-message-ownership-backfill",
    maxPoolSize: 2,
  });
  try {
    await client.connect();
    const session = client.startSession();
    let result!: MessageOwnershipBackfillResult;
    try {
      await session.withTransaction(async () => {
        result = await backfillMessageOwnership(client.db(databaseName), {
          write,
          session,
        });
      });
    } finally {
      await session.endSession();
    }
    console.log(JSON.stringify({ mode: write ? "write" : "dry-run", ...result }));
  } finally {
    await client.close();
  }
}

const invoked = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === invoked) await runMessageOwnershipMigration();
