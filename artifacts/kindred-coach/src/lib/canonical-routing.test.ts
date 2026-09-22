import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LEGACY_PRIMARY_ROUTE_REDIRECTS, PRIMARY_PAGES } from "./routing";

const auth = vi.hoisted(() => {

  return {
    isLoaded: true,
    isSignedIn: true,
    sessionLoaded: true,
    status: "active",
    getToken: vi.fn(),
    accountError: null as { status: number } | null,
  };
});
vi.mock("@/lib/auth", () => ({
  AuthProvider: ({ children }: any) => children,
  useAuth: () => auth,
}));

vi.mock("@workspace/api-client-react", () => ({ setAuthTokenGetter: vi.fn(), getGetCurrentAuthUserQueryKey: () => ["auth-user"], useGetCurrentAuthUser: () => ({ error: auth.accountError, isLoading: false, refetch: vi.fn() }) }));
vi.mock("@/hooks/use-theme", () => ({
  ThemeProvider: ({ children }: any) => children,
}));
vi.mock("@/components/layout/app-layout", () => ({
  AppLayout: ({ children }: any) => children,
}));
vi.mock("@/components/layout/public-layout", () => ({
  PublicLayout: ({ children }: any) => children,
}));
vi.mock("@/components/ui/toaster", () => ({ Toaster: () => null }));
vi.mock("@/pages/dashboard", () => ({
  default: () => createElement("div", { "data-page": "Today" }, "Today"),
}));
vi.mock("@/pages/chat", () => ({
  default: () => createElement("div", { "data-page": "Talk" }, "Talk"),
}));
vi.mock("@/pages/reports", () => ({
  default: () => createElement("div", { "data-page": "Insights" }, "Insights"),
}));
vi.mock("@/pages/profile", () => ({
  default: () => createElement("div", { "data-page": "You" }, "You"),
}));
vi.mock("@/pages/morning", () => ({
  default: () => createElement("div", { "data-page": "Morning" }, "Morning"),
}));
vi.mock("@/pages/scans", () => ({
  default: () => createElement("div", { "data-page": "Scans" }, "Scans"),
}));
vi.mock("@/pages/evening", () => ({
  default: () => createElement("div", { "data-page": "Evening" }, "Evening"),
}));
vi.mock("@/pages/habits", () => ({
  default: () => createElement("div", { "data-page": "Habits" }, "Habits"),
}));
vi.mock("@/pages/medications", () => ({
  default: () =>
    createElement("div", { "data-page": "Medications" }, "Medications"),
}));
vi.mock("@/pages/calendar", () => ({
  default: () => createElement("div", { "data-page": "Calendar" }, "Calendar"),
}));
vi.mock("@/pages/reminders", () => ({
  default: () =>
    createElement("div", { "data-page": "Reminders" }, "Reminders"),
}));
vi.mock("@/pages/account", () => ({
  default: () => createElement("div", { "data-page": "Account" }, "Account"),
}));
vi.mock("@/pages/archive", () => ({
  default: () => createElement("div", { "data-page": "Archive" }, "Archive"),
}));
vi.mock("@/pages/admin-beta", () => ({
  default: () => createElement("div", { "data-page": "Admin" }, "Admin"),
}));
vi.mock("@/pages/not-found", () => ({
  default: () =>
    createElement("div", { "data-page": "Not found" }, "Not found"),
}));
vi.mock("@/pages/public/landing", () => ({
  default: () => createElement("div", { "data-page": "Landing" }, "Landing"),
}));
vi.mock("@/pages/public/about", () => ({
  default: () => createElement("div", { "data-page": "About" }, "About"),
}));
vi.mock("@/pages/public/science", () => ({
  default: () => createElement("div", { "data-page": "Science" }, "Science"),
}));
vi.mock("@/pages/public/pricing", () => ({
  default: () => createElement("div", { "data-page": "Pricing" }, "Pricing"),
}));
vi.mock("@/pages/public/payment-success", () => ({
  default: () =>
    createElement("div", { "data-page": "Payment success" }, "Payment success"),
}));
vi.mock("@/pages/public/login", () => ({
  default: () => createElement("div", { "data-page": "Login" }, "Login"),
}));
vi.mock("@/pages/public/signup", () => ({
  default: () => createElement("div", { "data-page": "Signup" }, "Signup"),
}));

import App from "@/App";

let container: HTMLDivElement;
let root: Root;
async function renderAt(path: string) {
  window.history.replaceState({ bookmark: true }, "", path);
  await act(async () => root.render(createElement(App)));
}
function currentUrl() {
  return (
    window.location.pathname + window.location.search + window.location.hash
  );
}
function expectPage(name: string) {
  expect(container.querySelector(`[data-page="${name}"]`)).not.toBeNull();
}
beforeEach(() => {
  Object.assign(auth, {
    isLoaded: true,
    isSignedIn: true,
    sessionLoaded: true,
    status: "active",
  });
  document.title = "Public page";
  document.head.innerHTML =
    '<title>Public page</title><link rel="canonical" href="http://localhost/"><meta name="robots" content="index, follow"><meta property="og:url" content="http://localhost/">';
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.stubEnv("BASE_URL", "/");
});

describe("canonical signed-in routing through App", () => {
  it.each(Object.entries(PRIMARY_PAGES))(
    "opens %s directly",
    async (path, page) => {
      await renderAt(`${path}?view=weekly#details`);
      expectPage(page);
      expect(currentUrl()).toBe(`${path}?view=weekly#details`);
      expect(document.title).toBe(`${page} | Kindred Asterling`);
      expect(
        document.querySelector('link[rel="canonical"]')?.getAttribute("href"),
      ).toBe(window.location.origin + path);
      expect(
        document.querySelector('meta[name="robots"]')?.getAttribute("content"),
      ).toBe("noindex, nofollow");
    },
  );

  it.each(Object.entries(LEGACY_PRIMARY_ROUTE_REDIRECTS))(
    "replaces %s with %s without losing deep-link data",
    async (from, to) => {
      const suffix = "?session=a%2Fb&tag=one&tag=two#reply";
      window.history.replaceState({ bookmark: true }, "", `${from}/${suffix}`);
      const replace = vi.spyOn(window.history, "replaceState");
      const length = window.history.length;
      await act(async () => root.render(createElement(App)));
      expect(currentUrl()).toBe(to + suffix);
      expectPage(PRIMARY_PAGES[to]);
      expect(window.history.length).toBe(length);
      expect(replace).toHaveBeenCalledTimes(1);
      expect(window.history.state).toEqual({ bookmark: true });
    },
  );

  it.each([
    ["morning", "Morning"],
    ["scans", "Scans"],
    ["evening", "Evening"],
    ["habits", "Habits"],
    ["medications", "Medications"],
    ["calendar", "Calendar"],
    ["reminders", "Reminders"],
    ["account", "Account"],
    ["archive", "Archive"],
    ["admin/beta", "Admin"],
  ])("keeps /app/%s deep links working", async (slug, page) => {
    const path = `/app/${slug}?connected=true#details`;
    await renderAt(path);
    expectPage(page);
    expect(currentUrl()).toBe(path);
  });

  it.each([
    "/today",
    "/talk",
    "/insights",
    "/you",
    ...Object.keys(LEGACY_PRIMARY_ROUTE_REDIRECTS),
    "/app/calendar",
    "/app/account",
  ])("preserves signed-out %s through public login", async (path) => {
    auth.isSignedIn = false;
    const destination = `${path}?session=a%2Fb#details`;
    await renderAt(destination);
    expectPage("Login");
    expect(window.location.pathname).toBe("/login");
    expect(new URLSearchParams(window.location.search).get("returnTo")).toBe(
      destination,
    );
  });

  it("explains an identity migration conflict without showing private pages", async () => {
    auth.accountError = { status: 409 };
    await renderAt("/today");
    expect(container.textContent).toContain("Link your existing Kindred account");
    expect(container.querySelector('[data-page="Today"]')).toBeNull();
    auth.accountError = null;
  });

  it("waits for Auth0 readiness before mounting a page", async () => {
    auth.isLoaded = false;
    await renderAt("/today");
    expect(container.textContent).toBe("");
    auth.isLoaded = true;
    await act(async () => root.render(createElement(App)));
    expectPage("Today");
  });

  it.each(["choose-organization", "reset-password", "setup-mfa"])(
    "redirects legacy task URL %s to account security",
    async (task) => {
      await renderAt(`/app/session-tasks/${task}`);
      expect(currentUrl()).toBe("/app/account");
      expectPage("Account");
    },
  );

  it("updates metadata during client navigation and restores public metadata", async () => {
    await renderAt("/");
    expectPage("Landing");
    await act(async () =>
      window.history.pushState(null, "", "/talk?session=two#reply"),
    );
    expectPage("Talk");
    expect(
      document.querySelector('link[rel="canonical"]')?.getAttribute("href"),
    ).toBe(window.location.origin + "/talk");
    await act(async () => window.history.pushState(null, "", "/pricing"));
    expectPage("Pricing");
    expect(document.title).toBe("Public page");
    expect(
      document.querySelector('meta[name="robots"]')?.getAttribute("content"),
    ).toBe("index, follow");
  });

  it("supports a configured site base without adding /app to primary routes", async () => {
    vi.stubEnv("BASE_URL", "/preview/");
    await renderAt("/preview/app/chat?session=one#reply");
    expect(currentUrl()).toBe("/preview/talk?session=one#reply");
    expectPage("Talk");
  });

  it.each(["/app/unknown", "/today/unknown", "/application", "/calendar"])(
    "does not collapse unknown %s to Today",
    async (path) => {
      await renderAt(path);
      expectPage("Not found");
      expect(currentUrl()).toBe(path);
    },
  );
});

describe("public legal navigation", () => {
  it.each([
    ["privacy", "Privacy Policy"],
    ["terms", "Terms and Conditions"],
    ["health-disclaimer", "Health Information Disclaimer"],
    ["ai-disclosure", "AI Use Disclosure"],
    ["cookies", "Cookie and Analytics Notice"],
    ["marketing-consent", "Marketing Consent Language"],
  ])("opens %s through client navigation and returns home", async (slug, title) => {
    auth.isSignedIn = false;
    await renderAt("/");
    await act(async () => {
      window.history.pushState(null, "", `/legal/${slug}`);
    });
    expect(container.querySelector("h1")?.textContent).toBe(title);
    expect(container.querySelector('a[download]')).not.toBeNull();
    await act(async () => {
      window.history.pushState(null, "", "/");
    });
    expect(container.querySelector("h1")).toBeNull();
    expectPage("Landing");
  });
});
