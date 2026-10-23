import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getToken: vi.fn(),
  authUser: null as unknown,
}));

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ getToken: mocks.getToken, signOut: vi.fn() }),
}));

vi.mock("@workspace/api-client-react", () => ({
  getGetCurrentAuthUserQueryKey: () => ["/api/auth/user"],
  useGetCurrentAuthUser: () => ({ data: mocks.authUser }),
}));

vi.mock("@/hooks/use-theme", () => ({
  useTheme: () => ({ theme: "quiet-sage", setTheme: vi.fn() }),
  THEME_OPTIONS: [
    { value: "quiet-sage", label: "Quiet Sage", swatches: ["#000"] },
  ],
}));

vi.mock("@/assets/brand/logo-mark.png", () => ({ default: "logo.png" }));

import { TooltipProvider } from "@/components/ui/tooltip";

import { AppLayout } from "./app-layout";

function renderAppLayout() {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const tree = createElement(
    QueryClientProvider,
    { client: queryClient },
    createElement(
      TooltipProvider,
      null,
      createElement(AppLayout, { children: null }),
    ),
  );
  return { container, root, tree, queryClient };
}

describe("AppLayout", () => {
  let render: ReturnType<typeof renderAppLayout>;

  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    window.history.replaceState(null, "", "/today");
    mocks.authUser = null;
    render = renderAppLayout();
  });

  afterEach(async () => {
    await act(async () => render.root.unmount());
    render.container.remove();
    render.queryClient.clear();
  });

  it("renders the four primary destinations on desktop", async () => {
    await act(async () => {
      render.root.render(render.tree);
    });

    const container = render.container;
    for (const area of ["today", "talk", "insights", "you"]) {
      expect(
        container.querySelector(`[data-testid="nav-primary-${area}"]`),
      ).not.toBeNull();
      expect(
        container
          .querySelector(`[data-testid="nav-primary-${area}"]`)
          ?.getAttribute("href"),
      ).toBe(`/${area}`);
    }
    expect(
      container.querySelectorAll('[data-testid^="nav-primary-"]'),
    ).toHaveLength(4);
  });

  it("marks the active primary destination with aria-current", async () => {
    window.history.replaceState(null, "", "/talk");
    await act(async () => {
      render.root.render(render.tree);
    });

    const talk = render.container.querySelector(
      '[data-testid="nav-primary-talk"]',
    );
    expect(talk).not.toBeNull();
    expect(talk!.getAttribute("aria-current")).toBe("page");
    expect(
      render.container
        .querySelector('[data-testid="nav-primary-today"]')!
        .getAttribute("aria-current"),
    ).toBeNull();
  });

  it("groups a daily-routine route under the Today primary area", async () => {
    window.history.replaceState(null, "", "/app/morning");
    await act(async () => {
      render.root.render(render.tree);
    });

    expect(
      render.container
        .querySelector('[data-testid="nav-primary-today"]')!
        .getAttribute("aria-current"),
    ).toBe("page");
  });

  it("renders the fixed mobile bottom nav with four destinations and a More menu", async () => {
    await act(async () => {
      render.root.render(render.tree);
    });

    const bottomNav = render.container.querySelector(
      'nav[aria-label="Primary navigation"].md\\:hidden',
    );
    expect(bottomNav).not.toBeNull();
    // Four destinations + the "More" trigger share the bottom nav.
    expect(
      render.container.querySelector('[data-testid="mobile-more-trigger"]'),
    ).not.toBeNull();
    const links = bottomNav!.querySelectorAll("a");
    expect(links).toHaveLength(4);
    const labels = Array.from(links).map((a) => a.textContent);
    expect(labels).toEqual(["Today", "Talk", "Insights", "You"]);
    expect(Array.from(links).map((link) => link.getAttribute("href"))).toEqual([
      "/today",
      "/talk",
      "/insights",
      "/you",
    ]);
  });

  it("hides the desktop sidebar on small screens and shows it on large screens", async () => {
    await act(async () => {
      render.root.render(render.tree);
    });

    // Desktop sidebar is `hidden md:flex`; bottom nav is `md:hidden`.
    const sidebar = render.container.querySelector(
      'aside[aria-label="Primary navigation"].hidden',
    );
    expect(sidebar).not.toBeNull();
    expect(sidebar!.className).toContain("md:flex");

    const bottomNav = render.container.querySelector(
      'nav[aria-label="Primary navigation"].md\\:hidden',
    );
    expect(bottomNav).not.toBeNull();
  });

  it("closes the mobile More sheet after choosing a destination", async () => {
    await act(async () => {
      render.root.render(render.tree);
    });

    const moreTrigger = render.container.querySelector<HTMLButtonElement>(
      '[data-testid="mobile-more-trigger"]',
    );
    expect(moreTrigger).not.toBeNull();

    await act(async () => {
      moreTrigger!.click();
    });

    const openSheet = document.querySelector(
      '[role="dialog"][data-state="open"]',
    );
    expect(openSheet).not.toBeNull();
    const morningLink = Array.from(openSheet!.querySelectorAll("a")).find(
      (link) => link.textContent === "Morning",
    );
    expect(morningLink).not.toBeUndefined();
    expect(morningLink!.getAttribute("href")).toBe("/app/morning");

    await act(async () => {
      morningLink!.click();
    });

    expect(
      document.querySelector('[role="dialog"][data-state="open"]'),
    ).toBeNull();
    expect(window.location.pathname).toBe("/app/morning");
  });

  it("offers a keyboard skip link to the main landmark", async () => {
    await act(async () => render.root.render(render.tree));
    const skip = render.container.querySelector<HTMLAnchorElement>('a[href="#main-content"]')!;
    expect(skip.textContent).toBe("Skip to main content");
    await act(async () => skip.click());
    expect(document.activeElement).toBe(render.container.querySelector("main"));
    expect(render.container.querySelectorAll("main")).toHaveLength(1);
    expect(render.container.querySelector("aside h1")).toBeNull();
  });

  it("keeps every collapsed destination named for screen readers", async () => {
    await act(async () => render.root.render(render.tree));
    await act(async () => render.container.querySelector<HTMLButtonElement>('[data-testid="sidebar-toggle"]')!.click());
    for (const link of render.container.querySelectorAll("aside a")) {
      expect(link.getAttribute("aria-label")?.length).toBeGreaterThan(0);
    }
    expect(render.container.querySelector('[data-testid="sidebar-toggle"]')?.getAttribute("aria-expanded")).toBe("false");
  });

  it("still renders when localStorage throws on read", async () => {
    const getItem = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new DOMException("blocked", "SecurityError");
      });
    try {
      await act(async () => render.root.render(render.tree));
      expect(render.container.querySelector('[data-testid="sidebar-toggle"]')).not.toBeNull();
    } finally {
      getItem.mockRestore();
    }
  });

  it("shows initials for non-Latin names", async () => {
    mocks.authUser = { user: { id: "u1", preferredName: "Иван Петров", email: null } };
    await act(async () => render.root.render(render.tree));
    expect(render.container.querySelector("aside")?.textContent).toContain("ИП");
  });

  it("moves focus into content after navigation", async () => {
    await act(async () => render.root.render(render.tree));
    await act(async () => render.container.querySelector<HTMLAnchorElement>('[data-testid="nav-primary-talk"]')!.click());
    expect(window.location.pathname).toBe("/talk");
    expect(document.activeElement).toBe(render.container.querySelector("main"));
  });
});
