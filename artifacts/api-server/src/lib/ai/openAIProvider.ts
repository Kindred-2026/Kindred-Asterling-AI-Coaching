import type { AIProvider, AIRequest, AIResponse, AIToolCall } from "./types";
import { AIProviderError, errorForStatus } from "./errors";
import { fetchWithDeadline } from "./http";

export class OpenAIProvider implements AIProvider {
  readonly name = "openai" as const;
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly baseUrl = "https://api.openai.com/v1",
  ) {}

  async chat(request: AIRequest): Promise<AIResponse> {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      authorization: `Bearer ${this.apiKey}`,
    };
    if (isCloudflareAIGateway(this.baseUrl)) {
      // Keep conversation bodies out of Gateway request logs. Metadata and
      // usage can still be used for operational metrics. Conversation-specific
      // prompts and responses must also bypass Gateway response caching.
      headers["cf-aig-collect-log-payload"] = "false";
      headers["cf-aig-skip-cache"] = "true";
    }
    const response = await fetchWithDeadline(
      `${this.baseUrl.replace(/\/$/, "")}/chat/completions`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: this.model,
          store: false,
          messages: [
            { role: "system", content: request.system },
            ...request.messages.map(toOpenAIMessage),
          ],
          tools: request.tools?.map((tool) => ({
            type: "function",
            function: {
              name: tool.name,
              description: tool.description,
              parameters: tool.inputSchema,
            },
          })),
        }),
      },
      request.timeoutMs,
      request.signal,
    );
    if (!response.ok) throw errorForStatus(response.status);
    let body: unknown;
    try {
      body = await response.json();
    } catch (error) {
      throw new AIProviderError(
        "malformed_response",
        "AI provider returned invalid JSON",
        false,
        { cause: error },
      );
    }
    const raw = body as {
      choices?: Array<{
        finish_reason?: unknown;
        message?: { content?: unknown; tool_calls?: unknown };
      }>;
    };
    const choice = raw?.choices?.[0];
    if (
      !choice?.message ||
      (choice.message.content !== null &&
        choice.message.content !== undefined &&
        typeof choice.message.content !== "string")
    )
      throw new AIProviderError(
        "malformed_response",
        "AI provider response is missing a valid message",
      );
    return {
      content:
        typeof choice.message.content === "string"
          ? choice.message.content
          : "",
      toolCalls: parseToolCalls(choice.message.tool_calls),
      finishReason:
        typeof choice.finish_reason === "string"
          ? choice.finish_reason
          : undefined,
    };
  }
}

function isCloudflareAIGateway(baseUrl: string): boolean {
  try {
    return new URL(baseUrl).hostname === "gateway.ai.cloudflare.com";
  } catch {
    return false;
  }
}

function toOpenAIMessage(message: AIRequest["messages"][number]) {
  if (message.role === "tool")
    return {
      role: "tool",
      content: message.content,
      tool_call_id: message.toolCallId,
    };
  return {
    role: message.role,
    content: message.content,
    ...(message.toolCalls
      ? {
          tool_calls: message.toolCalls.map((call) => ({
            id: call.id,
            type: "function",
            function: {
              name: call.name,
              arguments: JSON.stringify(call.arguments),
            },
          })),
        }
      : {}),
  };
}

function parseToolCalls(value: unknown): AIToolCall[] {
  if (value === undefined) return [];
  if (!Array.isArray(value))
    throw new AIProviderError(
      "malformed_response",
      "AI provider returned invalid tool calls",
    );
  return value.map((entry) => {
    const call = entry as {
      id?: unknown;
      function?: { name?: unknown; arguments?: unknown };
    };
    if (
      typeof call?.id !== "string" ||
      typeof call.function?.name !== "string" ||
      typeof call.function.arguments !== "string"
    )
      throw new AIProviderError(
        "malformed_response",
        "AI provider returned an invalid tool call",
      );
    let args: unknown;
    try {
      args = JSON.parse(call.function.arguments);
    } catch (error) {
      throw new AIProviderError(
        "malformed_response",
        "AI provider returned malformed tool arguments",
        false,
        { cause: error },
      );
    }
    if (!args || typeof args !== "object" || Array.isArray(args))
      throw new AIProviderError(
        "malformed_response",
        "AI provider returned invalid tool arguments",
      );
    return {
      id: call.id,
      name: call.function.name,
      arguments: args as Record<string, unknown>,
    };
  });
}
