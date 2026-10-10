import type { AIProvider, AIRequest, AIResponse, AIToolCall } from "./types";
import { AIProviderError, errorForStatus } from "./errors";
import { fetchWithDeadline } from "./http";

export class OllamaProvider implements AIProvider {
  readonly name = "ollama" as const;
  get modelName(): string {
    return this.model;
  }
  constructor(
    private readonly baseUrl: string,
    private readonly model: string,
  ) {}

  async chat(request: AIRequest): Promise<AIResponse> {
    const response = await fetchWithDeadline(
      `${this.baseUrl.replace(/\/$/, "")}/api/chat`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: "system", content: request.system },
            ...request.messages.map(toOllamaMessage),
          ],
          tools: request.tools?.map((tool) => ({
            type: "function",
            function: {
              name: tool.name,
              description: tool.description,
              parameters: tool.inputSchema,
            },
          })),
          stream: false,
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
    if (!body || typeof body !== "object" || !("message" in body))
      throw new AIProviderError(
        "malformed_response",
        "AI provider response is missing a message",
      );
    const raw = body as {
      message?: { content?: unknown; tool_calls?: unknown };
      done_reason?: unknown;
      model?: unknown;
      prompt_eval_count?: unknown;
      eval_count?: unknown;
    };
    if (
      !raw.message ||
      (raw.message.content !== undefined &&
        typeof raw.message.content !== "string")
    )
      throw new AIProviderError(
        "malformed_response",
        "AI provider returned an invalid message",
      );
    return {
      content: raw.message.content ?? "",
      toolCalls: parseToolCalls(raw.message.tool_calls),
      finishReason:
        typeof raw.done_reason === "string" ? raw.done_reason : undefined,
      model: typeof raw.model === "string" ? raw.model : undefined,
      usage:
        typeof raw.prompt_eval_count === "number" &&
        typeof raw.eval_count === "number"
          ? {
              inputTokens: raw.prompt_eval_count,
              outputTokens: raw.eval_count,
            }
          : undefined,
    };
  }
}

function toOllamaMessage(message: AIRequest["messages"][number]) {
  return {
    role: message.role,
    content: message.content,
    ...(message.toolCalls
      ? {
          tool_calls: message.toolCalls.map((call) => ({
            function: { name: call.name, arguments: call.arguments },
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
  return value.map((entry, index) => {
    const call = entry as {
      id?: unknown;
      function?: { name?: unknown; arguments?: unknown };
    };
    if (
      !call?.function ||
      typeof call.function.name !== "string" ||
      !call.function.arguments ||
      typeof call.function.arguments !== "object" ||
      Array.isArray(call.function.arguments)
    )
      throw new AIProviderError(
        "malformed_response",
        "AI provider returned an invalid tool call",
      );
    return {
      id: typeof call.id === "string" ? call.id : `ollama-tool-${index}`,
      name: call.function.name,
      arguments: call.function.arguments as Record<string, unknown>,
    };
  });
}
