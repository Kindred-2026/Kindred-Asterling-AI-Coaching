// Turns a failed /chat/send call into a message that says what went wrong, so
// "Kindred couldn't reply" is never the only clue. The server sends
// `{ error: "assistant_unavailable", reason }` when the AI call fails; other
// failures (expired sign-in, daily limit, a proxy in front of the API) arrive
// with only an HTTP status.

const RETRY = "Try sending that again in a moment.";

const REASON_MESSAGES: Record<string, string> = {
  provider_not_configured:
    "Kindred's AI provider has not been configured yet. An administrator needs to finish the server setup.",
  authentication:
    "Kindred's AI service rejected the server's API key. An administrator needs to check the Anthropic API key on the server.",
  invalid_request:
    "Kindred's AI service turned the request down. If this keeps happening, an administrator should check the server logs and the Anthropic account's credit balance.",
  rate_limited: `Kindred's AI service is busy right now. ${RETRY}`,
  timeout: `Kindred took too long to reply. ${RETRY}`,
  unavailable: `Kindred's AI service couldn't be reached. ${RETRY}`,
};

function field(data: unknown, key: string): string | null {
  if (!data || typeof data !== "object" || !(key in data)) return null;
  const value = (data as Record<string, unknown>)[key];
  return typeof value === "string" && value ? value : null;
}

export function chatSendErrorMessage(err: unknown): string {
  const data = err && typeof err === "object" ? (err as { data?: unknown }).data : null;
  const status =
    err && typeof err === "object" && typeof (err as { status?: unknown }).status === "number"
      ? (err as { status: number }).status
      : null;
  const reason = field(data, "reason");

  if (reason) {
    const known = REASON_MESSAGES[reason];
    return known
      ? `${known} (${reason})`
      : `Kindred couldn't put a reply together. ${RETRY} (${reason})`;
  }
  if (status === 401) return "Your sign-in has expired. Sign in again, then resend your message.";
  if (status === 429) {
    return field(data, "error") ?? `You're sending messages too quickly. ${RETRY}`;
  }
  if (status !== null) {
    return `Kindred couldn't reach its server. Reload the page and try again. (HTTP ${status})`;
  }
  return `Kindred couldn't reach its server. Check your connection and try again.`;
}
