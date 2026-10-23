import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  user: {} as Record<string, unknown>,
}));

vi.mock("@workspace/api-client-react", () => ({
  getGetCurrentAuthUserQueryKey: () => ["/api/auth/user"],
  getGetReminderSettingsQueryKey: () => ["/api/reminders"],
  useGetCurrentAuthUser: () => ({
    data: { user: mocks.user },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useGetReminderSettings: () => ({
    data: SETTINGS,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  updateReminderSettings: vi.fn(),
}));

const SETTINGS = {
  morningEnabled: true,
  morningTime: "08:00",
  medicationEnabled: false,
  eveningEnabled: false,
  eveningTime: "21:00",
  smsEnabled: false,
  emailEnabled: true,
};

import Reminders from "./reminders";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

async function render() {
  const client = new QueryClient();
  await act(async () =>
    root.render(
      createElement(QueryClientProvider, { client }, createElement(Reminders)),
    ),
  );
}

const status = () =>
  container.querySelector('[data-testid="reminders-save-status"]')
    ?.textContent;

describe("Reminders dirty state", () => {
  it("is up to date on a fresh load that used the detected timezone", async () => {
    mocks.user = { id: "u1", phone: null, timezone: null };
    await render();
    const timezone = container.querySelector<HTMLInputElement>(
      '[data-testid="reminders-timezone"]',
    )!;
    expect(timezone.value).not.toBe("");
    expect(status()).toBe("Up to date.");
  });

  it("is up to date on a fresh load with a saved timezone", async () => {
    mocks.user = { id: "u1", phone: null, timezone: "America/Toronto" };
    await render();
    expect(status()).toBe("Up to date.");
  });
});
