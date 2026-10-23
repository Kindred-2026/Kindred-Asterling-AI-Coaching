import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider, useMutation } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ toast: vi.fn() }));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: mocks.toast }),
}));

vi.mock("@workspace/api-client-react", () => ({
  getListBodyScansQueryKey: () => ["/api/body-scans"],
  getGetTodaySummaryQueryKey: () => ["/api/dashboard/today"],
  useListBodyScans: () => ({ data: [], isLoading: false }),
  useCreateBodyScan: () =>
    useMutation({
      mutationFn: () =>
        Promise.reject(Object.assign(new Error("Unauthorized"), { status: 401 })),
    }),
}));

import Scans from "./scans";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  mocks.toast.mockReset();
});

function typeInto(el: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("Scans save failure", () => {
  it("shows a destructive toast when the save fails", async () => {
    await act(async () =>
      root.render(
        createElement(
          QueryClientProvider,
          { client: new QueryClient() },
          createElement(Scans),
        ),
      ),
    );

    await act(async () =>
      typeInto(
        container.querySelector<HTMLInputElement>('[data-testid="input-feeling-search"]')!,
        "happy",
      ),
    );
    await act(async () =>
      container
        .querySelector<HTMLButtonElement>('[data-testid="search-results"] button')!
        .click(),
    );
    await act(async () =>
      container.querySelector<HTMLButtonElement>('[data-testid="button-log-scan"]')!.click(),
    );

    await vi.waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith({
        title: "Couldn't save body scan",
        description:
          "Your session may have expired or your plan doesn't allow this. Sign in again and retry.",
        variant: "destructive",
      }),
    );
  });
});
