import { analyticsUserId } from "./analytics";
import { providerHttpError } from "./retry";

// Amplitude User Privacy API: queues deletion of everything a project holds
// for the listed user IDs. Auth is HTTP Basic with the project's API key and
// secret key. Product analytics (analytics.ts) sends a pseudonymous ID, while
// Agent Analytics (amplitude.ts) sends the raw internal user ID, so each
// project is asked to delete the ID it actually received.

const DELETION_URL = "https://amplitude.com/api/2/deletions/users";
const REQUESTER = "kindred-account-deletion";

export interface AmplitudeDeletionRequest {
  project: "product" | "agent" | "product+agent";
  apiKey: string;
  secretKey: string;
  userIds: string[];
}

/** One request per project that has both its API key and secret key set. */
export function planAmplitudeDeletion(userId: string): AmplitudeDeletionRequest[] {
  const requests: AmplitudeDeletionRequest[] = [];
  const productKey = process.env.AMPLITUDE_API_KEY?.trim();
  const productSecret = process.env.AMPLITUDE_SECRET_KEY?.trim();
  const agentKey = process.env.AMPLITUDE_AI_API_KEY?.trim();
  const agentSecret = process.env.AMPLITUDE_AI_SECRET_KEY?.trim();

  if (productKey && productSecret) {
    requests.push({
      project: "product",
      apiKey: productKey,
      secretKey: productSecret,
      userIds: [analyticsUserId(userId)],
    });
  }

  if (agentKey) {
    const shared = requests.find((request) => request.apiKey === agentKey);
    if (shared) {
      // Both trackers write to one project: one request covers both IDs.
      shared.project = "product+agent";
      shared.userIds.push(userId);
    } else if (agentSecret) {
      requests.push({
        project: "agent",
        apiKey: agentKey,
        secretKey: agentSecret,
        userIds: [userId],
      });
    }
  }
  return requests;
}

/** Queues the deletion. Amplitude finishes deletion jobs asynchronously. */
export async function sendAmplitudeDeletion(request: AmplitudeDeletionRequest): Promise<void> {
  const credentials = Buffer.from(`${request.apiKey}:${request.secretKey}`).toString("base64");
  const response = await fetch(DELETION_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      user_ids: request.userIds,
      requester: REQUESTER,
      // A user who never sent an event is not an error.
      ignore_invalid_id: "true",
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok)
    throw providerHttpError(`Amplitude ${request.project} deletion request`, response.status);
}
