import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider, useMutation } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ toast: vi.fn() }));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: mocks.toast }),
}));

vi.mock("@workspace/api-client-react", () => ({
  getListMorningLogsQueryKey: () => ["/api/morning-logs"],
  getGetTodaySummaryQueryKey: () => ["/api/dashboard/today"],
  useListMorningLogs: () => ({ data: [], isLoading: false }),
  useCreateMorningLog: () =>
    useMutation({
      mutationFn: () => Promise.reject(new TypeError("Failed to fetch")),
    }),
}));

import Morning from "./morning";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
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

describe("Morning save failure", () => {
  it("shows a destructive toast when the save fails", async () => {
    await act(async () =>
      root.render(
        createElement(
          QueryClientProvider,
          { client: new QueryClient() },
          createElement(Morning),
        ),
      ),
    );

    await act(async () =>
      typeInto(
        container.querySelector<HTMLInputElement>('input[name="goal1"]')!,
        "Drink water",
      ),
    );
    await act(async () =>
      container.querySelector<HTMLButtonElement>('button[type="submit"]')!.click(),
    );

    await vi.waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith({
        title: "Couldn't save morning log",
        description: "Something went wrong. Check your connection and try again.",
        variant: "destructive",
      }),
    );
  });
});
