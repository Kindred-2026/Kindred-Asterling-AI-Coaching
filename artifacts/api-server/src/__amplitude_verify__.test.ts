import { describe, expect, it } from "vitest";
import {
  AIConfig,
  PROP_INPUT_TOKENS,
  PROP_LATENCY_MS,
  PROP_MODEL_NAME,
  PROP_OUTPUT_TOKENS,
  PROP_PROVIDER,
  PROP_SESSION_ID,
} from "@amplitude/ai";
import { MockAmplitudeAI } from "@amplitude/ai/testing";

describe("amplitude instrumentation", () => {
  it("emits a well-formed turn for kindred-coach-chat", async () => {
    const mock = new MockAmplitudeAI(new AIConfig({ contentMode: "full" }));
    const agent = mock.agent("kindred-coach-chat", { userId: "u1" });

    await agent.session({ sessionId: "conversation-1" }).run(async (s) => {
      s.trackUserMessage("I slept badly");
      s.trackToolCall("get_recent_checkins", 12, true);
      s.trackAiMessage("Sorry to hear that.", "claude-opus-5", "anthropic", 150, {
        inputTokens: 100,
        outputTokens: 20,
        totalCostUsd: 0.001,
      });
    });

    mock.assertEventTracked("[Agent] User Message", { userId: "u1" });
    mock.assertSessionClosed("conversation-1");
    for (const e of mock.getEvents("[Agent] AI Response")) {
      const p = e.event_properties ?? {};
      expect(e.user_id || e.device_id).toBeTruthy();
      expect(p[PROP_SESSION_ID]).toBeTruthy();
      expect(p[PROP_MODEL_NAME]).toBeTruthy();
      expect(p[PROP_PROVIDER]).toBeTruthy();
      expect(p[PROP_LATENCY_MS]).toBeGreaterThan(0);
      expect(p[PROP_INPUT_TOKENS]).toBeGreaterThan(0);
      expect(p[PROP_OUTPUT_TOKENS]).toBeGreaterThan(0);
    }
  });
});
