import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  sdk: { isLoading: false, isAuthenticated: true, user: { given_name: "Test", email: "test@example.test" }, error: undefined,
    getAccessTokenSilently: vi.fn(), loginWithRedirect: vi.fn(), logout: vi.fn() },
  provider: {} as any,
}));
vi.mock("@auth0/auth0-react", () => ({
  Auth0Provider: (props: any) => { mocks.provider = props; return props.children; },
  useAuth0: () => mocks.sdk,
}));
import { AuthProvider, useAuth, PublicAuthProvider } from "./auth";
let state: ReturnType<typeof useAuth>;
function Consumer() { state = useAuth(); return createElement("p", null, state.isSignedIn ? "Signed in" : "Signed out"); }
let root: Root; let container: HTMLDivElement;
beforeEach(() => {
  vi.clearAllMocks(); mocks.sdk.isAuthenticated = true;
  vi.stubEnv("VITE_AUTH0_DOMAIN", "tenant.auth0.com"); vi.stubEnv("VITE_AUTH0_CLIENT_ID", "client"); vi.stubEnv("VITE_AUTH0_AUDIENCE", "https://kindred.test/api");
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllEnvs(); });
async function render() { await act(async () => root.render(createElement(AuthProvider, null, createElement(Consumer)))); }
describe("Auth0 integration boundary", () => {
  it("supplies API access tokens only for signed-in users", async () => {
    mocks.sdk.getAccessTokenSilently.mockResolvedValue("api-access-token"); await render();
    expect(await state.getToken()).toBe("api-access-token");
    mocks.sdk.isAuthenticated = false; await render();
    expect(await state.getToken()).toBeNull(); expect(mocks.sdk.getAccessTokenSilently).toHaveBeenCalledTimes(1);
  });
  it("preserves a safe login destination and rejects an external redirect", async () => {
    await render(); await act(async () => state.login("/talk?session=one#reply", true));
    expect(mocks.sdk.loginWithRedirect).toHaveBeenLastCalledWith({ appState: { returnTo: "/talk?session=one#reply" }, authorizationParams: { screen_hint: "signup" } });
    await act(async () => state.login("https://attacker.invalid"));
    expect(mocks.sdk.loginWithRedirect).toHaveBeenLastCalledWith({ appState: { returnTo: "/today" }, authorizationParams: {} });
  });
  it("asks Universal Login for the passwordless email connection by name", async () => {
    await render(); await act(async () => state.login("/today", false, "email"));
    expect(mocks.sdk.loginWithRedirect).toHaveBeenLastCalledWith({ appState: { returnTo: "/today" }, authorizationParams: { connection: "email" } });
  });
  it("reports a failed redirect instead of leaving an unhandled rejection", async () => {
    mocks.sdk.loginWithRedirect.mockRejectedValueOnce(new Error("Network")); await render();
    await act(async () => state.login("/today")); expect(state.error).toBeInstanceOf(Error);
  });
  it("validates the callback destination before changing history", async () => {
    await render(); const replace = vi.spyOn(window.history, "replaceState");
    mocks.provider.onRedirectCallback({ returnTo: "//attacker.invalid" });
    expect(replace).toHaveBeenLastCalledWith({}, "", "/today"); replace.mockRestore();
  });
  it("provides a static public context for prerendering", async () => {
    await act(async () => root.render(createElement(PublicAuthProvider, null, createElement(Consumer))));
    expect(state.isSignedIn).toBe(false); expect(await state.getToken()).toBeNull();
    expect(mocks.sdk.getAccessTokenSilently).not.toHaveBeenCalled();
  });
});
