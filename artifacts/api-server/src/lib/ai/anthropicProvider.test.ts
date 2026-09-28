import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import { AnthropicProvider } from "./anthropicProvider";

const request = {
  system: "coach",
  messages: [{ role: "user" as const, content: "hello" }],
  timeoutMs: 1_000,
};

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function message(content: unknown[], stop_reason = "end_turn") {
  return {
    id: "msg_1",
    type: "message",
    role: "assistant",
    model: "claude-opus-5",
    content,
    stop_reason,
    stop_sequence: null,
    usage: { input_tokens: 1, output_tokens: 1 },
  };
}

function providerWith(fetchMock: ReturnType<typeof vi.fn>) {
  const client = new Anthropic({
    apiKey: "secret",
    maxRetries: 0,
    fetch: fetchMock as unknown as typeof fetch,
  });
  return new AnthropicProvider("secret", "claude-opus-5", "low", { client });
}

describe("AnthropicProvider", () => {
  it("normalizes a text reply and sends the expected request", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(reply(message([{ type: "text", text: "Hi" }])));
    const result = await providerWith(fetchMock).chat({
      ...request,
      tools: [
        { name: "lookup", description: "d", inputSchema: { type: "object" } },
      ],
    });
    expect(result.content).toBe("Hi");
    expect(result.toolCalls).toEqual([]);
    expect(result.finishReason).toBe("end_turn");

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toContain("/v1/messages");
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe("claude-opus-5");
    expect(body.system).toBe("coach");
    expect(body.fallbacks).toBe("default");
    expect(body.thinking).toEqual({ type: "adaptive" });
    expect(body.output_config).toEqual({ effort: "low" });
    expect(body.tools[0]).toMatchObject({
      name: "lookup",
      input_schema: { type: "object" },
    });
    const headers = new Headers(init.headers);
    expect(headers.get("x-api-key")).toBe("secret");
    expect(headers.get("anthropic-beta")).toContain(
      "server-side-fallback-2026-07-01",
    );
  });

  it("returns tool calls and replays raw assistant content with grouped results", async () => {
    const assistantContent = [
      { type: "thinking", thinking: "", signature: "sig" },
      { type: "tool_use", id: "tu_1", name: "lookup", input: { limit: 1 } },
      { type: "tool_use", id: "tu_2", name: "lookup", input: { limit: 2 } },
    ];
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(reply(message(assistantContent, "tool_use")))
      .mockResolvedValueOnce(reply(message([{ type: "text", text: "Done" }])));
    const provider = providerWith(fetchMock);

    const first = await provider.chat(request);
    expect(first.toolCalls).toEqual([
      { id: "tu_1", name: "lookup", arguments: { limit: 1 } },
      { id: "tu_2", name: "lookup", arguments: { limit: 2 } },
    ]);

    await provider.chat({
      ...request,
      messages: [
        ...request.messages,
        {
          role: "assistant",
          content: first.content,
          toolCalls: first.toolCalls,
          providerContent: first.providerContent,
        },
        { role: "tool", content: "a", toolCallId: "tu_1" },
        { role: "tool", content: "b", toolCallId: "tu_2" },
      ],
    });
    const body = JSON.parse(
      (fetchMock.mock.calls[1][1] as RequestInit).body as string,
    );
    expect(body.messages).toHaveLength(3);
    expect(body.messages[1]).toEqual({
      role: "assistant",
      content: assistantContent,
    });
    expect(body.messages[2]).toEqual({
      role: "user",
      content: [
        { type: "tool_result", tool_use_id: "tu_1", content: "a" },
        { type: "tool_result", tool_use_id: "tu_2", content: "b" },
      ],
    });
  });

  it("treats a refusal as a non-retryable failure", async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply(message([], "refusal")));
    await expect(providerWith(fetchMock).chat(request)).rejects.toMatchObject({
      category: "invalid_request",
      retryable: false,
    });
  });

  it.each([
    [401, "authentication", false],
    [429, "rate_limited", true],
    [529, "unavailable", true],
    [400, "invalid_request", false],
  ])("maps HTTP %i to %s", async (status, category, retryable) => {
    const fetchMock = vi.fn().mockResolvedValue(
      reply({ type: "error", error: { type: "x", message: "detail" } }, status),
    );
    await expect(providerWith(fetchMock).chat(request)).rejects.toMatchObject({
      category,
      retryable,
    });
  });

  it("honors caller cancellation", async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () =>
            reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
          );
        }),
    );
    const promise = providerWith(fetchMock as never).chat({
      ...request,
      signal: controller.signal,
    });
    controller.abort();
    await expect(promise).rejects.toMatchObject({
      category: "aborted",
      retryable: false,
    });
  });

  describe("Cloudflare AI Gateway", () => {
    const gateway = "https://gateway.ai.cloudflare.com/v1/acct/kindred/anthropic";

    async function headersFor(baseURL: string, gatewayToken?: string) {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(reply(message([{ type: "text", text: "Hi" }])));
      vi.stubGlobal("fetch", fetchMock);
      try {
        await new AnthropicProvider("secret", "claude-opus-5", "low", {
          baseURL,
          gatewayToken,
        }).chat(request);
      } finally {
        vi.unstubAllGlobals();
      }
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      return { url: String(url), headers: new Headers(init.headers) };
    }

    it("routes through the gateway with privacy headers and auth token", async () => {
      const { url, headers } = await headersFor(gateway, " cf-token ");
      expect(url.split("?")[0]).toBe(`${gateway}/v1/messages`);
      expect(headers.get("cf-aig-collect-log-payload")).toBe("false");
      expect(headers.get("cf-aig-skip-cache")).toBe("true");
      expect(headers.get("cf-aig-authorization")).toBe("Bearer cf-token");
      expect(headers.get("x-api-key")).toBe("secret");
    });

    it("omits the gateway token header when none is configured", async () => {
      const { headers } = await headersFor(gateway);
      expect(headers.get("cf-aig-authorization")).toBeNull();
      expect(headers.get("cf-aig-skip-cache")).toBe("true");
    });

    it("never sends Cloudflare headers to other endpoints", async () => {
      const { headers } = await headersFor(
        "https://gateway.ai.cloudflare.com.example.com/anthropic",
        "cf-token",
      );
      expect(headers.get("cf-aig-authorization")).toBeNull();
      expect(headers.get("cf-aig-collect-log-payload")).toBeNull();
    });
  });
});
