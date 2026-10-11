import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  getToken: vi.fn(),
  fetch: vi.fn(),
  onJoined: vi.fn(),
  onSignOut: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ getToken: mocks.getToken }),
}));
import { BetaJoin } from "./beta-join";
let root: Root;
let container: HTMLDivElement;
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });
const open = { state: "open", opensAt: null, spotsLeft: 3, emailVerified: true };
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
  await act(async () =>
    root.render(
      createElement(BetaJoin, {
        onJoined: mocks.onJoined,
        onSignOut: mocks.onSignOut,
      }),
    ),
  );
}
const button = (label: string) =>
  [...container.querySelectorAll("button")].find(
    (node) => node.textContent === label,
  );
const heading = () => container.querySelector("h1")?.textContent;

describe("beta join screen", () => {
  it("shows how many open spots are left", async () => {
    mocks.fetch.mockResolvedValueOnce(json(open));
    await render();
    expect(mocks.fetch).toHaveBeenCalledWith(
      "/api/beta/status",
      expect.objectContaining({
        headers: { Authorization: "Bearer token-1" },
      }),
    );
    expect(heading()).toBe("Join the Kindred beta");
    expect(container.textContent).toContain("3 spots are left.");
  });

  it("claims a spot and opens the app", async () => {
    mocks.fetch
      .mockResolvedValueOnce(json({ ...open, spotsLeft: 1 }))
      .mockResolvedValueOnce(json({ joined: true }));
    await render();
    expect(container.textContent).toContain("1 spot is left.");
    await act(async () => button("Join the beta")!.click());
    expect(mocks.fetch).toHaveBeenLastCalledWith(
      "/api/beta/join",
      expect.objectContaining({ method: "POST" }),
    );
    expect(mocks.onJoined).toHaveBeenCalledOnce();
  });

  it("says the beta is full when the last spot goes first", async () => {
    mocks.fetch
      .mockResolvedValueOnce(json(open))
      .mockResolvedValueOnce(
        json({ error: "The beta is full.", state: "full" }, 409),
      );
    await render();
    await act(async () => button("Join the beta")!.click());
    expect(mocks.onJoined).not.toHaveBeenCalled();
    expect(heading()).toBe("The Kindred beta is full");
    expect(button("Join the beta")).toBeUndefined();
  });

  it("points friends with a saved spot to the Kindred team when full", async () => {
    mocks.fetch.mockResolvedValueOnce(
      json({ ...open, state: "full", spotsLeft: 0 }),
    );
    await render();
    expect(heading()).toBe("The Kindred beta is full");
    expect(container.textContent).toContain("saved you a spot");
  });

  it("says when the beta opens", async () => {
    mocks.fetch.mockResolvedValueOnce(
      json({ ...open, state: "not_open", opensAt: "2026-10-12T04:00:00.000Z" }),
    );
    await render();
    expect(heading()).toBe("The Kindred beta opens soon");
    expect(container.textContent).toContain("2026");
    expect(button("Join the beta")).toBeUndefined();
    expect(button("Check again")).toBeDefined();
  });

  it("asks for a verified email first", async () => {
    mocks.fetch.mockResolvedValueOnce(json({ ...open, emailVerified: false }));
    await render();
    expect(heading()).toBe("Verify your email to join the beta");
    expect(button("Join the beta")).toBeUndefined();
  });

  it("offers a retry when the check fails", async () => {
    mocks.fetch
      .mockResolvedValueOnce(json({ error: "nope" }, 500))
      .mockResolvedValueOnce(json(open));
    await render();
    expect(heading()).toBe("We couldn't check the beta");
    await act(async () => button("Try again")!.click());
    expect(heading()).toBe("Join the Kindred beta");
  });

  it("keeps sign out available", async () => {
    mocks.fetch.mockResolvedValueOnce(json(open));
    await render();
    await act(async () => button("Sign out")!.click());
    expect(mocks.onSignOut).toHaveBeenCalledOnce();
  });
});
