import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authState: { isLoaded: true, isSignedIn: false },
  search: "",
  assign: vi.fn(),
  login: vi.fn(),
  fallbackRedirectUrl: "",
  signInUrl: "",
}));

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ ...mocks.authState, login: mocks.login }),
}));

vi.mock("wouter", () => ({
  useSearch: () => mocks.search,
}));

vi.mock("@/assets/brand/logo-poster.jpg", () => ({ default: "poster.jpg" }));

import Signup from "./signup";

describe("Signup returnTo validation", () => {
  let container: HTMLDivElement;
  let root: Root;
  let originalLocation: Location;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authState.isLoaded = true;
    mocks.authState.isSignedIn = false;
    mocks.search = "";
    mocks.fallbackRedirectUrl = "";
    mocks.signInUrl = "";
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    originalLocation = window.location;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { assign: mocks.assign },
    });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: originalLocation,
    });
  });

  it("passes a validated destination to Auth0 and back to sign in", async () => {
    mocks.search = "returnTo=%2Fapp%2Freminders";

    await act(async () => {
      root.render(createElement(Signup));
    });

    await act(async () => container.querySelector("button")!.click());
    expect(mocks.login).toHaveBeenCalledWith("/app/reminders", true);
    expect(container.querySelector("a")?.getAttribute("href")).toBe("/login?returnTo=%2Fapp%2Freminders");
  });

  it("collapses unsafe destinations to canonical /today", async () => {
    mocks.search = "returnTo=https%3A%2F%2Fevil.example.com";

    await act(async () => {
      root.render(createElement(Signup));
    });

    await act(async () => container.querySelector("button")!.click());
    expect(mocks.login).toHaveBeenCalledWith("/today", true);
    expect(container.querySelector("a")?.getAttribute("href")).toBe("/login?returnTo=%2Ftoday");
  });

  it("redirects an already signed-in visitor safely", async () => {
    mocks.authState.isSignedIn = true;
    mocks.search = "returnTo=%2Fapp%2Freminders";

    await act(async () => {
      root.render(createElement(Signup));
    });

    expect(mocks.assign).toHaveBeenCalledWith("/app/reminders");
  });
});
