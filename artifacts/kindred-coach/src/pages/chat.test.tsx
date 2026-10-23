import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ChatConversationWithMessages,
  ChatTurnResponse,
} from "@workspace/api-client-react";

const ONBOARDED_USER = {
  id: "user-1",
  firstName: "Sam",
  preferredName: "Sam",
  onboardedAt: "2026-10-01T00:00:00.000Z",
};

const mocks = vi.hoisted(() => ({
  conversation: null as ChatConversationWithMessages | null,
  user: {} as Record<string, unknown>,
  sendChatMessage: vi.fn(),
  appendChatMessage: vi.fn(),
  updateProfile: vi.fn(),
}));

// The chat page talks to the API only through the generated client. Back the
// two queries with real react-query so invalidation refetches, and let each
// test decide what the server returns.
vi.mock("@workspace/api-client-react", async () => {
  const { useQuery } = await import("@tanstack/react-query");
  return {
    getGetActiveChatQueryKey: () => ["/api/chat/active"],
    getGetCurrentAuthUserQueryKey: () => ["/api/auth/user"],
    useGetActiveChat: () =>
      useQuery({
        queryKey: ["/api/chat/active"],
        queryFn: async () => mocks.conversation,
      }),
    useGetCurrentAuthUser: () =>
      useQuery({
        queryKey: ["/api/auth/user"],
        queryFn: async () => ({ user: { ...mocks.user } }),
      }),
    sendChatMessage: mocks.sendChatMessage,
    appendChatMessage: mocks.appendChatMessage,
    updateProfile: mocks.updateProfile,
    archiveActiveChat: vi.fn(),
  };
});

import Chat from "./chat";

const CRISIS_TEXT = "I'm really sorry you're going through this. …";

function crisisTurn(userText: string): ChatTurnResponse {
  return {
    id: 7,
    userId: "user-1",
    title: "Coaching chat",
    status: "active",
    createdAt: "2026-10-16T12:00:00.000Z",
    archivedAt: null,
    messages: [
      {
        id: 11,
        conversationId: 7,
        role: "user",
        content: userText,
        createdAt: "2026-10-16T12:00:00.000Z",
      },
      {
        id: 12,
        conversationId: 7,
        role: "crisis_support",
        content: CRISIS_TEXT,
        createdAt: "2026-10-16T12:00:00.000Z",
      },
    ],
    crisisSupport: {
      type: "crisis_support",
      message: CRISIS_TEXT,
      disclaimer: "Kindred is not medical care or an emergency service.",
      resources: [],
      falsePositive: {
        label: "This doesn’t apply",
        instruction: "Rephrase to keep coaching.",
      },
      reviewedConfigVersion: "2026-10-16",
    },
  };
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.conversation = null;
  mocks.user = { ...ONBOARDED_USER };
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  // jsdom implements neither of these; the page calls both after rendering.
  Element.prototype.scrollTo = () => {};
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

async function waitFor(check: () => boolean) {
  for (let i = 0; i < 50 && !check(); i++) {
    await act(async () => new Promise((resolve) => setTimeout(resolve, 10)));
  }
  expect(check()).toBe(true);
}

const input = () =>
  container.querySelector(
    '[data-testid="chat-input"]',
  ) as HTMLTextAreaElement | null;

async function render() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  await act(async () =>
    root.render(
      createElement(QueryClientProvider, { client }, createElement(Chat)),
    ),
  );
  await waitFor(() => input() !== null || paused() !== null);
}

const paused = () =>
  container.querySelector('[data-testid="onboarding-paused"]');

async function send(text: string) {
  const textarea = input()!;
  const setValue = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    "value",
  )!.set!;
  await act(async () => {
    setValue.call(textarea, text);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => {
    (
      container.querySelector('[data-testid="chat-send"]') as HTMLButtonElement
    ).click();
  });
}

const card = () =>
  container.querySelector('[data-testid="crisis-support-card"]');

describe("chat crisis support", () => {
  it("shows the crisis card and keeps the user's message after a crisis turn", async () => {
    mocks.sendChatMessage.mockImplementation(
      async ({ content }: { content: string }) => {
        const turn = crisisTurn(content);
        mocks.conversation = turn;
        return turn;
      },
    );
    await render();
    expect(card()).toBeNull();

    await send("I want to kill myself");
    await waitFor(() => card() !== null);

    expect(mocks.sendChatMessage).toHaveBeenCalledWith({
      content: "I want to kill myself",
    });
    expect(container.textContent).toContain("I want to kill myself");
    expect(card()).not.toBeNull();
    // It just arrived, so it is announced.
    expect(card()!.getAttribute("role")).toBe("alert");
    expect(card()!.querySelector('a[href="tel:911"]')).not.toBeNull();
    expect(card()!.querySelector('a[href="sms:988"]')).not.toBeNull();
    expect(
      card()!.querySelector('a[href="https://findahelpline.com/"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="chat-send-error"]'),
    ).toBeNull();
  });

  it("renders a stored crisis_support message from history as the card", async () => {
    mocks.conversation = crisisTurn("earlier message");
    await render();

    expect(container.textContent).toContain("earlier message");
    expect(card()).not.toBeNull();
    // Loaded from history, so it is not re-announced.
    expect(card()!.getAttribute("role")).toBeNull();
    // The card replaces the plain-text bubble rather than duplicating it.
    expect(container.textContent).not.toContain(CRISIS_TEXT);
  });
});

describe("onboarding after a crisis turn", () => {
  // Fake server for the onboarding flow: profile updates merge into the user,
  // and appends land in the conversation. A user answer containing "suicide"
  // comes back as a crisis turn, like the real detector.
  function fakeOnboardingServer() {
    mocks.updateProfile.mockImplementation(
      async (patch: Record<string, unknown>) => {
        Object.assign(mocks.user, patch);
        return { user: { ...mocks.user } };
      },
    );
    mocks.appendChatMessage.mockImplementation(
      async ({ role, content }: { role: string; content: string }) => {
        if (role === "user" && content.includes("suicide")) {
          const turn = crisisTurn(content);
          mocks.conversation = turn;
          return turn;
        }
        const base = mocks.conversation ?? crisisTurn("");
        mocks.conversation = {
          ...base,
          messages: [
            ...(mocks.conversation?.messages ?? []),
            {
              id: 100 + (mocks.conversation?.messages.length ?? 0),
              conversationId: 7,
              role: role as "user" | "assistant",
              content,
              createdAt: "2026-10-16T12:01:00.000Z",
            },
          ],
        };
        return mocks.conversation;
      },
    );
  }

  function resume() {
    return act(async () => {
      (
        container.querySelector(
          '[data-testid="onboarding-resume"]',
        ) as HTMLButtonElement
      ).click();
    });
  }

  it("pauses instead of asking the next question, then resumes on request", async () => {
    // Name and birthday answered; the next step asks what feels heavy.
    mocks.user = {
      id: "user-1",
      firstName: "Sam",
      preferredName: "Sam",
      birthday: "1990-01-01",
      onboardedAt: null,
    };
    fakeOnboardingServer();
    await render();

    await send("honestly I think about suicide a lot");
    await waitFor(() => paused() !== null);

    expect(mocks.updateProfile).toHaveBeenCalledWith({
      struggles: "honestly I think about suicide a lot",
    });
    // Only the answer was written: no scripted follow-up question.
    expect(mocks.appendChatMessage).toHaveBeenCalledTimes(1);
    expect(mocks.appendChatMessage).toHaveBeenCalledWith({
      role: "user",
      content: "honestly I think about suicide a lot",
    });
    expect(card()!.getAttribute("role")).toBe("alert");
    expect(input()).toBeNull();
    expect(container.textContent).not.toContain("real strengths");

    await resume();
    await waitFor(() => input() !== null);

    expect(mocks.appendChatMessage).toHaveBeenLastCalledWith({
      role: "assistant",
      content: expect.stringContaining("real strengths"),
    });
    expect(paused()).toBeNull();
    expect(container.textContent).toContain("real strengths");
  });

  it("finishes onboarding on resume when the crisis came on the last question", async () => {
    mocks.user = {
      id: "user-1",
      firstName: "Sam",
      preferredName: "Sam",
      birthday: "1990-01-01",
      struggles: "work",
      strengths: "patience",
      onboardedAt: null,
    };
    fakeOnboardingServer();
    await render();

    await send("nothing, I think about suicide");
    await waitFor(() => paused() !== null);
    // Onboarding is not marked complete while paused.
    expect(mocks.user.onboardedAt).toBeNull();

    await resume();
    await waitFor(() => input() !== null);

    expect(mocks.updateProfile).toHaveBeenLastCalledWith({
      onboardedAt: expect.any(String),
    });
    expect(mocks.appendChatMessage).toHaveBeenLastCalledWith({
      role: "assistant",
      content: expect.stringContaining("Thank you, Sam."),
    });
  });

  it("stays paused after a reload until they choose to continue", async () => {
    mocks.user = {
      id: "user-1",
      firstName: "Sam",
      preferredName: "Sam",
      birthday: "1990-01-01",
      struggles: "honestly I think about suicide a lot",
      onboardedAt: null,
    };
    mocks.conversation = crisisTurn("honestly I think about suicide a lot");
    await render();

    expect(paused()).not.toBeNull();
    expect(input()).toBeNull();
    expect(card()!.getAttribute("role")).toBeNull();
  });
});

describe("onboarding first bubble and send failures", () => {
  it("asks the real current step when earlier answers are already saved", async () => {
    mocks.user = {
      id: "user-1",
      firstName: "Sam",
      preferredName: "Sam",
      birthday: "1990-01-01",
      onboardedAt: null,
    };
    mocks.updateProfile.mockResolvedValue({});
    mocks.appendChatMessage.mockResolvedValue({ messages: [] });
    await render();

    expect(container.textContent).toContain("What feels heavy for you");
    expect(container.textContent).not.toContain("What should I call you?");

    await send("work stress");
    expect(mocks.updateProfile).toHaveBeenCalledWith({
      struggles: "work stress",
    });
  });

  it("keeps the answer and shows an error when an onboarding save fails", async () => {
    mocks.user = { id: "user-1", firstName: "Sam", onboardedAt: null };
    mocks.updateProfile.mockRejectedValue(new Error("network down"));
    await render();

    await send("Sammy");
    await waitFor(
      () =>
        container.querySelector('[data-testid="chat-send-error"]') !== null,
    );
    expect(input()!.value).toBe("Sammy");
    expect(mocks.appendChatMessage).not.toHaveBeenCalled();
  });
});
