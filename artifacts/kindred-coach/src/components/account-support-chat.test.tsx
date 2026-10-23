import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getToken: vi.fn(),
  messenger: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ getToken: mocks.getToken }),
}));

vi.mock("@/components/intercom-messenger", () => ({
  IntercomMessenger: (props: unknown) => {
    mocks.messenger(props);
    return null;
  },
}));

import { AccountSupportChat } from "./account-support-chat";

describe("AccountSupportChat", () => {
  let container: HTMLDivElement;
  let root: Root;
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getToken.mockResolvedValue("api-token");
    vi.stubGlobal("fetch", fetchMock);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  async function render() {
    await act(async () => {
      root.render(createElement(AccountSupportChat));
    });
  }

  it("shows nothing when support chat is not set up", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 404 }));
    await render();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/account/intercom",
      expect.objectContaining({ headers: { Authorization: "Bearer api-token" } }),
    );
    expect(mocks.messenger).not.toHaveBeenCalled();
  });

  it("boots the Messenger with the token the API signed", async () => {
    const userJwt = crypto.randomUUID();
    fetchMock.mockResolvedValue(
      Response.json({
        appId: "test-app",
        userJwt,
        name: "Ada",
        createdAt: 1700000000,
      }),
    );
    await render();
    expect(mocks.messenger).toHaveBeenLastCalledWith({
      appId: "test-app",
      user: { userJwt, name: "Ada", createdAt: 1700000000 },
    });
  });
});
