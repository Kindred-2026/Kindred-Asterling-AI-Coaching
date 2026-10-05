import { describe, expect, it } from "vitest";
import { chatSendErrorMessage } from "./chatSendError";

const apiError = (status: number, data: unknown) => ({ status, data });

describe("chatSendErrorMessage", () => {
  it("names the AI failure the server reports", () => {
    expect(
      chatSendErrorMessage(apiError(502, { error: "assistant_unavailable", reason: "authentication" })),
    ).toMatch(/API key.*\(authentication\)$/);
    expect(
      chatSendErrorMessage(apiError(502, { error: "assistant_unavailable", reason: "timeout" })),
    ).toMatch(/too long.*\(timeout\)$/);
  });

  it("keeps the setup message for an unconfigured provider", () => {
    expect(
      chatSendErrorMessage(apiError(503, { reason: "provider_not_configured" })),
    ).toMatch(/has not been configured yet/);
  });

  it("shows an unknown reason code instead of hiding it", () => {
    expect(chatSendErrorMessage(apiError(502, { reason: "max_tool_iterations" }))).toBe(
      "Kindred couldn't put a reply together. Try sending that again in a moment. (max_tool_iterations)",
    );
  });

  it("explains failures that never reached the AI call", () => {
    expect(chatSendErrorMessage(apiError(401, null))).toMatch(/sign-in has expired/);
    expect(
      chatSendErrorMessage(apiError(429, { error: "You've reached your daily message limit. Try again tomorrow." })),
    ).toBe("You've reached your daily message limit. Try again tomorrow.");
    expect(chatSendErrorMessage(apiError(403, "<html>challenge</html>"))).toMatch(/\(HTTP 403\)$/);
    expect(chatSendErrorMessage(new TypeError("Failed to fetch"))).toMatch(/connection/);
  });
});
