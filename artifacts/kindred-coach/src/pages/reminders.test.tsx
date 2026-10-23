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

describe("Reminders save guard", () => {
  const save = () =>
    container.querySelector<HTMLButtonElement>(
      '[data-testid="reminders-save"]',
    )!;
  const toggle = (id: string) =>
    act(async () =>
      container
        .querySelector<HTMLButtonElement>(`[data-testid="${id}"]`)!
        .click(),
    );

  beforeEach(() => {
    mocks.user = { id: "u1", phone: null, timezone: "America/Toronto" };
  });

  it("blocks saving text reminders with no phone number", async () => {
    await render();
    await toggle("reminders-sms-toggle");
    expect(save().disabled).toBe(true);
    expect(status()).toBe("Add a phone number to receive text reminders.");
  });

  it("blocks saving a reminder with no channel to send it on", async () => {
    await render();
    await toggle("reminders-email-toggle");
    expect(save().disabled).toBe(true);
    expect(status()).toBe("Turn on text or email to receive reminders.");
  });

  it("allows switching every reminder and channel off", async () => {
    await render();
    await toggle("reminders-morning-toggle");
    await toggle("reminders-email-toggle");
    expect(save().disabled).toBe(false);
    expect(status()).toBe("You have unsaved changes.");
  });
});
