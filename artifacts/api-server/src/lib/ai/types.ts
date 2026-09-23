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
}

export interface AIProvider {
  readonly name: "ollama" | "openai";
  chat(request: AIRequest): Promise<AIResponse>;
}
