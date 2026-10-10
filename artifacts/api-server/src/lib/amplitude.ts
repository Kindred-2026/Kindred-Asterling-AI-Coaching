import { AIConfig, AmplitudeAI } from "@amplitude/ai";

/**
 * Amplitude Agent Analytics. Telemetry is optional: without
 * AMPLITUDE_AI_API_KEY every tracker call is a no-op, and a tracking failure
 * must never fail a coaching reply.
 */
const apiKey = process.env.AMPLITUDE_AI_API_KEY?.trim();

export const ai = apiKey
  ? new AmplitudeAI({
      apiKey,
      config: new AIConfig({ contentMode: "full", redactPii: true }),
    })
  : null;

// Module-level singleton: a per-request agent would change [Agent] Agent ID
// every turn and break session grouping.
const agent =
  ai?.agent("kindred-coach-chat", {
    description:
      "Kindred coaching chat: answers user messages via the configured LLM with a user-data tool loop",
  }) ?? null;

export interface AiMessageInfo {
  content: string;
  model: string;
  provider: string;
  latencyMs: number;
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
  /** Pass 0 for local models, which cannot be priced. */
  totalCostUsd?: number;
  errorMessage?: string;
}

export interface ChatTracker {
  userMessage(content: string): void;
  aiMessage(info: AiMessageInfo): void;
  toolCall(name: string, latencyMs: number, success: boolean): void;
}

const noopTracker: ChatTracker = {
  userMessage() {},
  aiMessage() {},
  toolCall() {},
};

function safe(fn: () => void): void {
  try {
    fn();
  } catch {
    // Telemetry must never break the request.
  }
}

/**
 * Runs `fn` inside an Agent Analytics session keyed by the stored
 * conversation id, then flushes (long-lived server: no auto-flush).
 */
export async function withChatSession<T>(
  ids: { userId: string; conversationId: number },
  fn: (tracker: ChatTracker) => Promise<T>,
): Promise<T> {
  if (!ai || !agent) return fn(noopTracker);
  try {
    return await agent
      .session({
        userId: ids.userId,
        sessionId: `conversation-${ids.conversationId}`,
      })
      .run((s) =>
        fn({
          userMessage: (content) => safe(() => s.trackUserMessage(content)),
          aiMessage: (m) =>
            safe(() =>
              s.trackAiMessage(m.content, m.model, m.provider, m.latencyMs, {
                inputTokens: m.inputTokens,
                outputTokens: m.outputTokens,
                totalTokens:
                  m.inputTokens !== undefined && m.outputTokens !== undefined
                    ? m.inputTokens + m.outputTokens
                    : undefined,
                cacheReadTokens: m.cacheReadTokens,
                cacheCreationTokens: m.cacheCreationTokens,
                totalCostUsd: m.totalCostUsd,
                isError: m.errorMessage !== undefined,
                errorMessage: m.errorMessage,
              }),
            ),
          toolCall: (name, latencyMs, success) =>
            safe(() => s.trackToolCall(name, latencyMs, success)),
        }),
      );
  } finally {
    try {
      await ai.flush();
    } catch {
      // ignore
    }
  }
}
