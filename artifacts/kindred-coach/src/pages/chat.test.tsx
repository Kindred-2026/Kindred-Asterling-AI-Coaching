import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ChatConversationWithMessages,
  ChatTurnResponse,
} from "@workspace/api-client-react";

const mocks = vi.hoisted(() => ({
  conversation: null as ChatConversationWithMessages | null,
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
        queryFn: async () => ({
          user: {
            id: "user-1",
            firstName: "Sam",
            preferredName: "Sam",
            onboardedAt: "2026-10-01T00:00:00.000Z",
          },
        }),
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
  await waitFor(() => input() !== null);
}

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
