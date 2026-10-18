import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeAll, afterAll, expect, it, vi } from "vitest";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import {
  db,
  usersTable,
  betaGrantsTable,
  closeDatabase,
} from "@workspace/db";
import {
  registerTestClerkIdentity,
  revokeTestClerkIdentity,
} from "../../../api-server/src/middlewares/testClerkIdentityAdapter";
import api from "../../../api-server/src/app";

const auth = vi.hoisted(() => {
  return { token: "", loaded: false, getToken: async () => auth.token };
});
vi.mock("@/lib/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth")>()),
  AuthProvider: ({ children }: { children: import("react").ReactNode }) =>
    children,
  useAuth: () => ({
    isLoaded: auth.loaded,
    isSignedIn: auth.loaded,
    user: auth.loaded
      ? { id: "journey-test", firstName: null, email: "journey@example.test" }
      : null,
    error: undefined,
    getToken: auth.getToken,
    signOut: vi.fn(),
    login: vi.fn(),
  }),
}));
vi.mock("@/components/intercom-messenger", () => ({
  IntercomMessenger: () => null,
}));
import App from "../../src/App";

let server: Server;
let root: Root;
let container: HTMLDivElement;
let origin: string;
const nativeFetch = globalThis.fetch;

beforeAll(async () => {
  auth.token = registerTestClerkIdentity({
    id: "journey-test",
    email: "journey@example.test",
  });
  await db
    .insert(usersTable)
    .values({ id: "journey-test", email: "journey@example.test" });
  // Product routes are gated on an owner, beta or paid entitlement. Journey
  // users are beta testers, so give this one the same grant a real tester has.
  await db.insert(betaGrantsTable).values({ userId: "journey-test" });
  await new Promise<void>((resolve) => {
    server = api.listen(0, "127.0.0.1", resolve);
  });
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  vi.stubGlobal(
    "fetch",
    (input: string | URL | Request, options?: RequestInit) => {
      const path = String(input);
      if (!path.startsWith("/api/"))
        throw new Error(`Unexpected external request in journey test`);
      return nativeFetch(origin + path, options);
    },
  );
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  window.matchMedia = vi.fn().mockImplementation((media: string) => ({
    matches: media.includes("reduced-motion"),
    media,
    addEventListener() {},
    removeEventListener() {},
  }));
  Element.prototype.scrollTo = vi.fn();
  // The evening recommendation is time-dependent. Only the application's clock
  // is fixed; HTTP and Mongo still use real timers and the isolated test database.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-08T18:00:00-06:00"));
  window.history.replaceState(null, "", "/today");
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterAll(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  revokeTestClerkIdentity(auth.token);
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await closeDatabase();
});
async function until(assertion: () => void) {
  await vi.waitFor(
    async () => {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });
      assertion();
    },
    { timeout: 6000 },
  );
}
async function click(selector: string) {
  const element = document.querySelector<HTMLElement>(selector);
  expect(element).not.toBeNull();
  await act(async () => element!.click());
}
async function fill(selector: string, value: string) {
  const element = document.querySelector<
    HTMLInputElement | HTMLTextAreaElement
  >(selector)!;
  expect(element).not.toBeNull();
  const prototype =
    element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(
      element,
      value,
    );
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
function nextStep(title: string) {
  return until(() =>
    expect(
      document.querySelector('[data-testid="next-step-title"]')?.textContent,
    ).toBe(title),
  );
}
async function today() {
  await click('[data-testid="nav-primary-today"]');
}

it("completes the daily loop through real forms, routes, HTTP saves and MongoDB", async () => {
  // Seed only optional scheduled work; all journal completion uses the UI.
  const headers = {
    authorization: `Bearer ${auth.token}`,
    "content-type": "application/json",
  };
  const habit = await nativeFetch(origin + "/api/habits", {
    method: "POST",
    headers,
    body: JSON.stringify({
      name: "Test daily habit",
      targetDays: 7,
      startDate: "2026-09-08",
    }),
  });
  expect(habit.status).toBe(201);
  const { id: habitId } = await habit.json();
  const medication = await nativeFetch(origin + "/api/medications", {
    method: "POST",
    headers,
    body: JSON.stringify({
      name: "TEST ONLY schedule",
      dosage: "Synthetic test",
      times: ["08:00"],
    }),
  });
  expect(medication.status).toBe(201);
  const { id: medicationId } = await medication.json();
  await act(async () => root.render(createElement(App)));
  // Real hosted sign-in resolves after the app has mounted. Exercise that
  // transition so cache cleanup cannot strand the first account request.
  auth.loaded = true;
  await act(async () => root.render(createElement(App)));
  await nextStep("Begin your day");
  await click('[data-testid="next-step-action"]');
  await until(() =>
    expect(document.querySelector('input[name="goal1"]')).not.toBeNull(),
  );
  await fill('input[name="goal1"]', "Synthetic daily-flow check");
  await click('main button[type="submit"]');
  await until(() =>
    expect(container.textContent).toContain("You've checked in today"),
  );
  await today();
  await nextStep("Record your medication");
  await click('[data-testid="next-step-action"]');
  await until(() =>
    expect(
      document.querySelector(
        `[data-testid="toggle-dose-${medicationId}-08:00"]`,
      ),
    ).not.toBeNull(),
  );
  await click(`[data-testid="toggle-dose-${medicationId}-08:00"]`);
  await until(() =>
    expect(
      document
        .querySelector(`[data-testid="toggle-dose-${medicationId}-08:00"]`)
        ?.getAttribute("aria-label"),
    ).toBe("Mark dose as not taken"),
  );
  await today();
  await nextStep("Notice what's here");
  await click('[data-testid="next-step-action"]');
  await until(() =>
    expect(document.querySelector('[data-testid="core-happy"]')).not.toBeNull(),
  );
  await click('[data-testid="core-happy"]');
  await click('[data-testid="feeling-happy"]');
  await click('[data-testid="button-log-scan"]');
  await until(() =>
    expect(
      document.querySelector('[data-testid^="card-scan-"]'),
    ).not.toBeNull(),
  );
  await today();
  await nextStep("Tend a small habit");
  await click('[data-testid="next-step-action"]');
  await until(() =>
    expect(
      document.querySelector(`[data-testid="button-toggle-habit-${habitId}"]`),
    ).not.toBeNull(),
  );
  await click(`[data-testid="button-toggle-habit-${habitId}"]`);
  await until(() =>
    expect(
      document.querySelector<HTMLButtonElement>(
        `[data-testid="button-toggle-habit-${habitId}"]`,
      )?.disabled,
    ).toBe(true),
  );
  await today();
  await nextStep("Close the day");
  await click('[data-testid="next-step-action"]');
  await until(() =>
    expect(
      document.querySelector('[data-testid="textarea-wins"]'),
    ).not.toBeNull(),
  );
  await fill(
    '[data-testid="textarea-wins"]',
    "Completed the synthetic daily loop",
  );
  await click('[data-testid="mood-good"]');
  await click('[data-testid="button-save-evening"]');
  await until(() =>
    expect(container.textContent).toContain("Great work today"),
  );
  await today();
  await nextStep("You're on track");
  const summary = await nativeFetch(
    origin + "/api/dashboard/today?tzOffset=360",
    { headers },
  ).then((r) => r.json());
  expect(summary).toMatchObject({
    morningDone: true,
    bodyScansCount: 1,
    habitsCompletedToday: 1,
    eveningDone: true,
  });
});
