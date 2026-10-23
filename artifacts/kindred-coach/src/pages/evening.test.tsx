import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider, useMutation } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ toast: vi.fn() }));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: mocks.toast }),
}));

vi.mock("@workspace/api-client-react", () => ({
  getListEveningReportsQueryKey: () => ["/api/evening-reports"],
  getGetTodaySummaryQueryKey: () => ["/api/dashboard/today"],
  useListEveningReports: () => ({ data: [], isLoading: false }),
  useCreateEveningReport: () =>
    useMutation({
      mutationFn: () =>
        Promise.reject(Object.assign(new Error("Server error"), { status: 500 })),
    }),
}));

import Evening from "./evening";

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

describe("Evening save failure", () => {
  it("shows a destructive toast when the save fails", async () => {
    await act(async () =>
      root.render(
        createElement(
          QueryClientProvider,
          { client: new QueryClient() },
          createElement(Evening),
        ),
      ),
    );

    await act(async () =>
      container
        .querySelector<HTMLButtonElement>('[data-testid="button-save-evening"]')!
        .click(),
    );

    await vi.waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith({
        title: "Couldn't save evening report",
        description: "Something went wrong (error 500). Please try again.",
        variant: "destructive",
      }),
    );
  });
});
