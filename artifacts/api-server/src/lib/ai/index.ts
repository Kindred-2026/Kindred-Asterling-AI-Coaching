import type { AIProvider } from "./types";
import { OllamaProvider } from "./ollamaProvider";
import { OpenAIProvider } from "./openAIProvider";
import {
  ANTHROPIC_EFFORTS,
  AnthropicProvider,
  DEFAULT_ANTHROPIC_MODEL,
  type AnthropicEffort,
} from "./anthropicProvider";

export * from "./types";
export * from "./errors";

let override: AIProvider | null | undefined;

function anthropicEffort(): AnthropicEffort {
  const raw = process.env.ANTHROPIC_EFFORT?.trim().toLowerCase();
  return ANTHROPIC_EFFORTS.includes(raw as AnthropicEffort)
    ? (raw as AnthropicEffort)
    : "low";
}

export function getAIProvider(): AIProvider | null {
  if (override !== undefined) return override;
  const selection = (process.env.AI_PROVIDER || "ollama").toLowerCase();
  if (selection === "disabled" || selection === "none" || selection === "off")
    return null;
  if (selection === "anthropic")
    return new AnthropicProvider(
      process.env.ANTHROPIC_API_KEY || "",
      process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_ANTHROPIC_MODEL,
      anthropicEffort(),
      {
        baseURL: process.env.ANTHROPIC_BASE_URL,
        gatewayToken: process.env.CLOUDFLARE_AI_GATEWAY_TOKEN,
      },
    );
  if (selection === "openai")
    return new OpenAIProvider(
      process.env.OPENAI_API_KEY || "",
      process.env.OPENAI_MODEL || "",
      process.env.OPENAI_BASE_URL,
      process.env.CLOUDFLARE_AI_GATEWAY_ID,
    );
  if (selection === "ollama")
    return new OllamaProvider(
      process.env.OLLAMA_BASE_URL || "",
      process.env.OLLAMA_MODEL || "",
    );
  return null;
}

/** Test seam; production code always resolves from API-container environment. */
export function setAIProviderForTests(
  provider: AIProvider | null | undefined,
): void {
  override = provider;
}
