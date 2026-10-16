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

export interface AmplitudeDeletionPlan {
  requests: AmplitudeDeletionRequest[];
  /** Projects that receive data but have no secret key to delete it with. */
  missingSecrets: string[];
}

export function planAmplitudeDeletion(userId: string): AmplitudeDeletionPlan {
  const plan: AmplitudeDeletionPlan = { requests: [], missingSecrets: [] };
  const productKey = process.env.AMPLITUDE_API_KEY?.trim();
  const productSecret = process.env.AMPLITUDE_SECRET_KEY?.trim();
  const agentKey = process.env.AMPLITUDE_AI_API_KEY?.trim();
  const agentSecret = process.env.AMPLITUDE_AI_SECRET_KEY?.trim();

  if (productKey && productSecret) {
    plan.requests.push({
      project: "product",
      apiKey: productKey,
      secretKey: productSecret,
      userIds: [analyticsUserId(userId)],
    });
  } else if (productKey) {
    plan.missingSecrets.push("AMPLITUDE_SECRET_KEY");
  }

  if (agentKey) {
    const shared = plan.requests.find((request) => request.apiKey === agentKey);
    if (shared) {
      // Both trackers write to one project: one request covers both IDs.
      shared.project = "product+agent";
      shared.userIds.push(userId);
    } else if (agentSecret) {
      plan.requests.push({
        project: "agent",
        apiKey: agentKey,
        secretKey: agentSecret,
        userIds: [userId],
      });
    } else {
      plan.missingSecrets.push("AMPLITUDE_AI_SECRET_KEY");
    }
  }
  return plan;
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
