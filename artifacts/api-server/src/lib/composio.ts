import { Composio } from "@composio/core";

let client: Composio | null | undefined;

// Composio is optional: without COMPOSIO_API_KEY every helper returns null so
// chat keeps working with only Kindred's own tools. The SDK reads the key from
// the environment itself — never pass it inline.
export function getComposio(): Composio | null {
  if (client !== undefined) return client;
  client = process.env.COMPOSIO_API_KEY?.trim() ? new Composio() : null;
  return client;
}

// One Composio session per Kindred user. `userId` must be the Kindred users.id
// (req.user.id), never an email or a shared placeholder — Composio scopes every
// connected account (GitHub, etc.) to this ID.
export async function createComposioSession(userId: string) {
  const composio = getComposio();
  if (!composio) return null;
  return composio.create(userId, { toolkits: ["github"] });
}
