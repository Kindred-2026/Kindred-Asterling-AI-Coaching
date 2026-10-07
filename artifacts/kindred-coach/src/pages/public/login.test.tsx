import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authState: { isLoaded: true, isSignedIn: false },
  search: "",
  assign: vi.fn(),
  login: vi.fn(),
  fallbackRedirectUrl: "",
  signUpUrl: "",
}));

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ ...mocks.authState, login: mocks.login }),
}));

vi.mock("wouter", () => ({
  useSearch: () => mocks.search,
}));

vi.mock("@/assets/brand/logo-poster.jpg", () => ({ default: "poster.jpg" }));

import Login from "./login";

describe("Login returnTo validation", () => {
  let container: HTMLDivElement;
  let root: Root;
  let originalLocation: Location;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authState.isLoaded = true;
    mocks.authState.isSignedIn = false;
    mocks.search = "";
    mocks.fallbackRedirectUrl = "";
    mocks.signUpUrl = "";
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    // jsdom does not implement navigation; capture `window.location.assign`.
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

  it("passes a validated safe return destination to Auth0 login", async () => {
    mocks.search = "returnTo=%2Fpricing";

    await act(async () => {
      root.render(createElement(Login));
    });

    await act(async () => container.querySelector("button")!.click());
    expect(mocks.login).toHaveBeenCalledWith("/pricing", false);
    expect(container.querySelector("a")?.getAttribute("href")).toBe("/signup?returnTo=%2Fpricing");
  });

  it("offers an emailed sign-in code through Auth0's email connection", async () => {
    mocks.search = "returnTo=%2Fpricing";

    await act(async () => {
      root.render(createElement(Login));
    });

    const codeButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Email me a sign-in code",
    );
    await act(async () => codeButton!.click());
    expect(mocks.login).toHaveBeenCalledWith("/pricing", false, "email");
  });

  it("collapses an unsafe return destination to /today in Auth0 login", async () => {
    mocks.search = "returnTo=https%3A%2F%2Fevil.example.com";

    await act(async () => {
      root.render(createElement(Login));
    });

    await act(async () => container.querySelector("button")!.click());
    expect(mocks.login).toHaveBeenCalledWith("/today", false);
  });

  it("navigates a signed-in visitor to a safe return destination", async () => {
    mocks.authState.isSignedIn = true;
    mocks.search = "returnTo=%2Fpricing";

    await act(async () => {
      root.render(createElement(Login));
    });

    expect(mocks.assign).toHaveBeenCalledWith("/pricing");
  });

  it("never navigates a signed-in visitor to an unsafe external URL", async () => {
    mocks.authState.isSignedIn = true;
    mocks.search = "returnTo=https%3A%2F%2Fevil.example.com";

    await act(async () => {
      root.render(createElement(Login));
    });

    expect(mocks.assign).toHaveBeenCalledWith("/today");
    expect(mocks.assign).not.toHaveBeenCalledWith(
      expect.stringContaining("evil.example.com"),
    );
  });
});
