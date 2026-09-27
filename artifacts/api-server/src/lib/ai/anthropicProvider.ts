import Anthropic from "@anthropic-ai/sdk";
import type { AIProvider, AIRequest, AIResponse, AIToolCall } from "./types";
import { AIProviderError, errorForStatus, normalizeProviderError } from "./errors";

export const DEFAULT_ANTHROPIC_MODEL = "claude-opus-5";
export const ANTHROPIC_EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;
export type AnthropicEffort = (typeof ANTHROPIC_EFFORTS)[number];

// Coaching replies are short; this leaves room for adaptive thinking plus the
// visible answer while staying well under the SDK's non-streaming timeout.
const MAX_TOKENS = 8000;
// Server-side refusal fallback: a declined request is re-run on Anthropic's
// recommended model for that refusal category inside the same call.
const FALLBACK_BETA = "server-side-fallback-2026-07-01";

export class AnthropicProvider implements AIProvider {
  readonly name = "anthropic" as const;
  private readonly client: Anthropic;

  constructor(
    apiKey: string,
    private readonly model: string = DEFAULT_ANTHROPIC_MODEL,
    private readonly effort: AnthropicEffort = "low",
    client?: Anthropic,
  ) {
    // chat.ts owns retries and the per-attempt deadline, so the SDK must not
    // add its own retry loop on top.
    this.client = client ?? new Anthropic({ apiKey, maxRetries: 0 });
  }

  async chat(request: AIRequest): Promise<AIResponse> {
    let response: Anthropic.Beta.BetaMessage;
    try {
      response = await this.client.beta.messages.create(
        {
          model: this.model,
          max_tokens: MAX_TOKENS,
          betas: [FALLBACK_BETA],
          fallbacks: "default",
          thinking: { type: "adaptive" },
          output_config: { effort: this.effort },
          // Caches the system prompt + history so tool-loop follow-ups in the
          // same turn are billed at cache-read rates.
          cache_control: { type: "ephemeral" },
          system: request.system,
          messages: toAnthropicMessages(request.messages),
          tools: request.tools?.map((tool) => ({
            name: tool.name,
            description: tool.description,
            input_schema: tool.inputSchema as Anthropic.Beta.BetaTool.InputSchema,
          })),
        },
        { timeout: request.timeoutMs, signal: request.signal },
      );
    } catch (error) {
      throw mapSdkError(error, request.signal);
    }

    if (response.stop_reason === "refusal")
      throw new AIProviderError(
        "invalid_request",
        "AI provider declined the request",
      );

    const text: string[] = [];
    const toolCalls: AIToolCall[] = [];
    for (const block of response.content) {
      if (block.type === "text") text.push(block.text);
      else if (block.type === "tool_use") {
        if (
          !block.input ||
          typeof block.input !== "object" ||
          Array.isArray(block.input)
        )
          throw new AIProviderError(
            "malformed_response",
            "AI provider returned invalid tool arguments",
          );
        toolCalls.push({
          id: block.id,
          name: block.name,
          arguments: block.input as Record<string, unknown>,
        });
      }
    }
    return {
      content: text.join(""),
      toolCalls,
      finishReason: response.stop_reason ?? undefined,
      // Thinking blocks must be sent back unchanged when continuing a
      // tool-use turn, so keep the raw assistant content for the next call.
      providerContent: response.content,
    };
  }
}

function toAnthropicMessages(
  messages: AIRequest["messages"],
): Anthropic.Beta.BetaMessageParam[] {
  const out: Anthropic.Beta.BetaMessageParam[] = [];
  for (const message of messages) {
    if (message.role === "system") continue;
    if (message.role === "tool") {
      const result: Anthropic.Beta.BetaToolResultBlockParam = {
        type: "tool_result",
        tool_use_id: message.toolCallId ?? "",
        content: message.content,
      };
      // All results for one assistant turn belong in a single user message.
      const last = out[out.length - 1];
      if (
        last?.role === "user" &&
        Array.isArray(last.content) &&
        last.content.every((b) => b.type === "tool_result")
      ) {
        last.content.push(result);
      } else {
        out.push({ role: "user", content: [result] });
      }
      continue;
    }
    if (message.role === "assistant") {
      if (Array.isArray(message.providerContent)) {
        out.push({
          role: "assistant",
          content: message.providerContent as Anthropic.Beta.BetaContentBlockParam[],
        });
        continue;
      }
      if (message.toolCalls?.length) {
        const content: Anthropic.Beta.BetaContentBlockParam[] = [];
        if (message.content) content.push({ type: "text", text: message.content });
        for (const call of message.toolCalls)
          content.push({
            type: "tool_use",
            id: call.id,
            name: call.name,
            input: call.arguments,
          });
        out.push({ role: "assistant", content });
        continue;
      }
    }
    out.push({ role: message.role, content: message.content });
  }
  return out;
}

function mapSdkError(error: unknown, signal?: AbortSignal): AIProviderError {
  if (error instanceof Anthropic.APIUserAbortError || signal?.aborted)
    return new AIProviderError("aborted", "AI request was cancelled", false, {
      cause: error,
    });
  if (error instanceof Anthropic.APIConnectionTimeoutError)
    return new AIProviderError("timeout", "AI request timed out", true, {
      cause: error,
    });
  if (error instanceof Anthropic.APIError && typeof error.status === "number") {
    // 529 = Anthropic overloaded; errorForStatus treats >=500 as retryable.
    const mapped = errorForStatus(error.status);
    return new AIProviderError(mapped.category, mapped.message, mapped.retryable, {
      cause: error,
    });
  }
  return normalizeProviderError(error);
}
