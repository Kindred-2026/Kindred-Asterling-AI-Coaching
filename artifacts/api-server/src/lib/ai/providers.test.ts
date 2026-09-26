import { afterEach, describe, expect, it, vi } from "vitest";
import { AIProviderError } from "./errors";
import { OllamaProvider } from "./ollamaProvider";
import { OpenAIProvider } from "./openAIProvider";

const request = {
  system: "coach",
  messages: [{ role: "user" as const, content: "hello" }],
  timeoutMs: 100,
};

afterEach(() => vi.unstubAllGlobals());

describe("normalized AI provider contract", () => {
  it("normalizes a normal OpenAI-compatible reply and disables storage", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            choices: [
              {
                finish_reason: "stop",
                message: { content: "Hi", tool_calls: [] },
              },
            ],
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      new OpenAIProvider("secret", "model").chat(request),
    ).resolves.toEqual({ content: "Hi", toolCalls: [], finishReason: "stop" });
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(init.body as string).store).toBe(false);
    expect(init.redirect).toBe("error");
    expect((init.headers as Record<string, string>).authorization).toBe(
      "Bearer secret",
    );
  });

  it("disables Cloudflare AI Gateway payload logging for coaching conversations", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ choices: [{ message: { content: "Hi" } }] }),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    await new OpenAIProvider(
      "secret",
      "model",
      "https://gateway.ai.cloudflare.com/v1/account/gateway/openai",
    ).chat(request);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>)["cf-aig-collect-log-payload"]).toBe("false");
    expect((init.headers as Record<string, string>)["cf-aig-skip-cache"]).toBe("true");
    expect(JSON.parse(init.body as string).store).toBe(false);
  });

  it("normalizes Ollama tool calls", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({
              message: {
                content: "",
                tool_calls: [
                  { function: { name: "lookup", arguments: { limit: 1 } } },
                ],
              },
              done_reason: "tool_calls",
            }),
            { status: 200 },
          ),
        ),
    );
    const result = await new OllamaProvider("http://ollama", "model").chat(
      request,
    );
    expect(result.toolCalls).toEqual([
      { id: "ollama-tool-0", name: "lookup", arguments: { limit: 1 } },
    ]);
  });

  it("categorizes malformed responses without exposing their body", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ choices: [] }), { status: 200 }),
        ),
    );
    await expect(
      new OpenAIProvider("secret", "model").chat(request),
    ).rejects.toMatchObject({
      category: "malformed_response",
      retryable: false,
    });
  });

  it("categorizes provider outages as retryable", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(new Response("provider detail", { status: 503 })),
    );
    await expect(
      new OllamaProvider("http://ollama", "model").chat(request),
    ).rejects.toMatchObject({ category: "unavailable", retryable: true });
  });

  it("honors deadlines", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener("abort", () =>
              reject(
                Object.assign(new Error("aborted"), { name: "AbortError" }),
              ),
            );
          }),
      ),
    );
    const promise = new OllamaProvider("http://ollama", "model").chat({
      ...request,
      timeoutMs: 5,
    });
    await expect(promise).rejects.toEqual(
      expect.objectContaining<Partial<AIProviderError>>({
        category: "timeout",
        retryable: true,
      }),
    );
  });

  it("honors caller cancellation", async () => {
    const controller = new AbortController();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener("abort", () =>
              reject(
                Object.assign(new Error("aborted"), { name: "AbortError" }),
              ),
            );
          }),
      ),
    );
    const promise = new OllamaProvider("http://ollama", "model").chat({
      ...request,
      signal: controller.signal,
    });
    controller.abort();
    await expect(promise).rejects.toMatchObject({
      category: "aborted",
      retryable: false,
    });
  });
});
