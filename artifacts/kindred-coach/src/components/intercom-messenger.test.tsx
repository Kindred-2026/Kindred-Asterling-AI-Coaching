import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  Intercom: vi.fn(),
  boot: vi.fn(),
  shutdown: vi.fn(),
}));

vi.mock("@intercom/messenger-js-sdk", () => ({
  Intercom: mocks.Intercom,
  boot: mocks.boot,
  shutdown: mocks.shutdown,
}));

import {
  INTERCOM_APP_ID,
  IntercomMessenger,
  shutdownIntercom,
} from "./intercom-messenger";

describe("IntercomMessenger", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.clearAllMocks();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("is off outside the marketing-only build", () => {
    expect(INTERCOM_APP_ID).toBeNull();
  });

  it("loads nothing without an app ID", () => {
    act(() => root.render(createElement(IntercomMessenger)));
    expect(mocks.Intercom).not.toHaveBeenCalled();
    expect(mocks.boot).not.toHaveBeenCalled();
  });

  it("loads the widget once, shuts it down on unmount and boots it again on return", () => {
    act(() =>
      root.render(createElement(IntercomMessenger, { appId: "test-app" })),
    );
    expect(mocks.Intercom).toHaveBeenCalledWith({ app_id: "test-app" });

    act(() => root.render(createElement("div")));
    expect(mocks.shutdown).toHaveBeenCalledTimes(1);

    act(() =>
      root.render(createElement(IntercomMessenger, { appId: "test-app" })),
    );
    expect(mocks.Intercom).toHaveBeenCalledTimes(1);
    expect(mocks.boot).toHaveBeenCalledWith({ app_id: "test-app" });
  });

  it("boots a signed-in user with the signed token and display details", () => {
    const userJwt = crypto.randomUUID();
    act(() =>
      root.render(
        createElement(IntercomMessenger, {
          appId: "test-app",
          user: { userJwt, name: "Ada", createdAt: 1700000000 },
        }),
      ),
    );
    const settings = mocks.boot.mock.calls.at(-1)?.[0];
    expect(settings).toEqual({
      app_id: "test-app",
      intercom_user_jwt: userJwt,
      name: "Ada",
      created_at: 1700000000,
    });
    expect(settings).not.toHaveProperty("user_id");
    expect(settings).not.toHaveProperty("email");
  });

  it("shuts the session down on sign-out once the widget has loaded", () => {
    shutdownIntercom();
    expect(mocks.shutdown).toHaveBeenCalledTimes(1);
  });
});
