import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sdk = vi.hoisted(() => ({
  Intercom: vi.fn(),
  boot: vi.fn(),
  shutdown: vi.fn(),
}));
vi.mock("@intercom/messenger-js-sdk", () => ({
  default: sdk.Intercom,
  boot: sdk.boot,
  shutdown: sdk.shutdown,
}));

import {
  INTERCOM_APP_ID,
  IntercomMessenger,
  resetIntercomForTests,
} from "./intercom-messenger";

const user = {
  id: "auth0|abc",
  name: "Ada Lovelace",
  email: "ada@example.com",
  createdAt: "2026-01-02T03:04:05.678Z",
};

describe("IntercomMessenger", () => {
  let roots: Root[];

  function render(element: ReactElement) {
    const root = createRoot(document.createElement("div"));
    roots.push(root);
    const rerender = (next: ReactElement) => act(() => root.render(next));
    rerender(element);
    return { rerender, unmount: () => act(() => root.unmount()) };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    resetIntercomForTests();
    roots = [];
  });

  afterEach(() => {
    act(() => roots.forEach((root) => root.unmount()));
  });

  it("boots anonymously for visitors", () => {
    render(<IntercomMessenger user={null} />);
    expect(sdk.Intercom).toHaveBeenCalledWith({ app_id: INTERCOM_APP_ID });
  });

  it("waits for auth to settle before the first boot", () => {
    const { rerender } = render(<IntercomMessenger user={null} ready={false} />);
    expect(sdk.Intercom).not.toHaveBeenCalled();
    rerender(<IntercomMessenger user={user} ready />);
    expect(sdk.Intercom).toHaveBeenCalledTimes(1);
    expect(sdk.Intercom).toHaveBeenCalledWith({
      app_id: INTERCOM_APP_ID,
      user_id: "auth0|abc",
      name: "Ada Lovelace",
      email: "ada@example.com",
      created_at: 1767323045,
    });
  });

  it("restarts as a visitor on sign-out so the account's conversations go", () => {
    const { rerender } = render(<IntercomMessenger user={user} />);
    rerender(<IntercomMessenger user={null} />);
    expect(sdk.shutdown).toHaveBeenCalledTimes(1);
    expect(sdk.boot).toHaveBeenCalledWith({
      app_id: INTERCOM_APP_ID,
      api_base: "https://api-iam.intercom.io",
    });
  });

  it("does not restart when a new tree mounts as the same person", () => {
    const first = render(<IntercomMessenger user={user} />);
    first.unmount();
    render(<IntercomMessenger user={{ ...user }} />);
    expect(sdk.Intercom).toHaveBeenCalledTimes(1);
    expect(sdk.shutdown).not.toHaveBeenCalled();
  });
});
