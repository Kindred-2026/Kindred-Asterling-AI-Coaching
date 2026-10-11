import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ getToken: vi.fn(), fetch: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ getToken: mocks.getToken }),
}));
import BetaChecklist from "./beta-checklist";
import {
  BETA_CHECKLIST,
  BETA_CHECKLIST_ITEM_IDS,
} from "@/lib/beta-checklist";
let root: Root;
let container: HTMLDivElement;
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.getToken.mockResolvedValue("token-1");
  vi.stubGlobal("fetch", mocks.fetch);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
async function render() {
  await act(async () => root.render(createElement(BetaChecklist)));
}
const box = (label: string) =>
  [...container.querySelectorAll("label")]
    .find((node) => node.textContent?.includes(label))!
    .querySelector("input") as HTMLInputElement;
const progress = () =>
  container.querySelector('[data-testid="beta-checklist-progress"]')
    ?.textContent;
const total = BETA_CHECKLIST_ITEM_IDS.length;

describe("beta checklist page", () => {
  it("shows the saved ticks from the tester's account", async () => {
    mocks.fetch.mockResolvedValueOnce(json({ checked: ["signup-create"] }));
    await render();
    expect(mocks.fetch).toHaveBeenCalledWith(
      "/api/beta-checklist",
      expect.objectContaining({
        headers: { Authorization: "Bearer token-1" },
      }),
    );
    expect(box("Create an account and verify your email").checked).toBe(true);
    expect(progress()).toBe(`1 of ${total} done`);
  });

  it("saves a tick to the account", async () => {
    mocks.fetch
      .mockResolvedValueOnce(json({ checked: [] }))
      .mockResolvedValueOnce(json({ checked: ["habits-add"] }));
    await render();
    await act(async () =>
      box("Add a habit with a short note").click(),
    );
    expect(mocks.fetch).toHaveBeenLastCalledWith(
      "/api/beta-checklist",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ itemId: "habits-add", checked: true }),
      }),
    );
    expect(box("Add a habit with a short note").checked).toBe(true);
    expect(progress()).toBe(`1 of ${total} done`);
  });

  it("undoes the tick and says so when saving fails", async () => {
    mocks.fetch
      .mockResolvedValueOnce(json({ checked: [] }))
      .mockResolvedValueOnce(json({ error: "nope" }, 500));
    await render();
    await act(async () => box("Switch between light and dark mode").click());
    expect(box("Switch between light and dark mode").checked).toBe(false);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "didn't save",
    );
  });

  it("offers a retry when the checklist cannot load", async () => {
    mocks.fetch
      .mockResolvedValueOnce(json({ error: "down" }, 500))
      .mockResolvedValueOnce(json({ checked: [] }));
    await render();
    expect(container.textContent).toContain("Checklist unavailable");
    await act(async () =>
      [...container.querySelectorAll("button")]
        .find((b) => b.textContent?.includes("Try again"))!
        .click(),
    );
    expect(progress()).toBe(`0 of ${total} done`);
  });

  it("uses unique, stable item ids", () => {
    expect(new Set(BETA_CHECKLIST_ITEM_IDS).size).toBe(total);
    for (const id of BETA_CHECKLIST_ITEM_IDS) {
      expect(id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      expect(id.length).toBeLessThanOrEqual(64);
    }
    expect(BETA_CHECKLIST.length).toBe(12);
  });
});
