import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  getToken: vi.fn(),
  signOut: vi.fn(),
  fetch: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ getToken: mocks.getToken, signOut: mocks.signOut }),
}));
import { AccountData } from "./account-data";
let root: Root;
let container: HTMLDivElement;
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
const button = (name: string) =>
  [...container.querySelectorAll("button")].find(
    (node) => node.textContent === name,
  )!;
async function render() {
  await act(async () => root.render(createElement(AccountData)));
}
describe("account data controls", () => {
  it("downloads the export with the user's token", async () => {
    mocks.fetch.mockResolvedValueOnce(new Response("{}", { status: 200 }));
    URL.createObjectURL = vi.fn(() => "blob:export");
    URL.revokeObjectURL = vi.fn();
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    await render();
    await act(async () => button("Download my data").click());
    expect(mocks.fetch).toHaveBeenCalledWith(
      "/api/account/export",
      expect.objectContaining({
        headers: { Authorization: "Bearer token-1" },
      }),
    );
    expect(click).toHaveBeenCalled();
    expect(container.textContent).toContain("Your data download has started.");
  });
  it("requires confirmation before deleting, then signs out", async () => {
    mocks.fetch.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await render();
    await act(async () => button("Delete my account").click());
    expect(mocks.fetch).not.toHaveBeenCalled();
    await act(async () => button("Permanently delete").click());
    expect(mocks.fetch).toHaveBeenCalledWith(
      "/api/account",
      expect.objectContaining({ method: "DELETE" }),
    );
    expect(mocks.signOut).toHaveBeenCalled();
  });
  it("does not sign out or claim success when deletion fails", async () => {
    mocks.fetch.mockResolvedValueOnce(new Response(null, { status: 500 }));
    await render();
    await act(async () => button("Delete my account").click());
    await act(async () => button("Permanently delete").click());
    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "Nothing was removed",
    );
  });
});
