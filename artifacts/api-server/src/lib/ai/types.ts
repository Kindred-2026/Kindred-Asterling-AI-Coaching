export type AIMessageRole = "system" | "user" | "assistant" | "tool";

export interface AIToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface AIMessage {
  role: AIMessageRole;
  content: string;
  toolCalls?: AIToolCall[];
  toolCallId?: string;
  /** Provider-native assistant content to replay verbatim (e.g. thinking blocks). */
  providerContent?: unknown;
}

export interface AIToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface AIRequest {
  system: string;
  messages: AIMessage[];
  tools?: AIToolDefinition[];
  /** Absolute amount of time allowed for this provider attempt. */
  timeoutMs: number;
  signal?: AbortSignal;
}

export interface AIResponse {
  content: string;
  toolCalls: AIToolCall[];
  finishReason?: string;
  providerContent?: unknown;
}

export interface AIProvider {
  readonly name: "ollama" | "openai" | "anthropic";
  chat(request: AIRequest): Promise<AIResponse>;
}
