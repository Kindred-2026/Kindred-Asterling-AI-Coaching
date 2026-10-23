import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createMorningLog: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("@workspace/api-client-react", async () => {
  const { useMutation } = await import("@tanstack/react-query");
  return {
    getListMorningLogsQueryKey: () => ["/api/morning-logs"],
    getGetTodaySummaryQueryKey: () => ["/api/dashboard/today"],
    useListMorningLogs: () => ({ data: [], isLoading: false }),
    useCreateMorningLog: () =>
      useMutation({ mutationFn: mocks.createMorningLog }),
  };
});

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: mocks.toast }),
}));

import Morning from "./morning";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.clearAllMocks();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

async function waitFor(check: () => boolean) {
  for (let i = 0; i < 50 && !check(); i++) {
    await act(async () => new Promise((resolve) => setTimeout(resolve, 10)));
  }
  expect(check()).toBe(true);
}

describe("Morning check-in", () => {
  it("tells the user when the save fails", async () => {
    mocks.createMorningLog.mockRejectedValue(new Error("network down"));
    await act(async () =>
      root.render(
        createElement(
          QueryClientProvider,
          {
            client: new QueryClient({
              defaultOptions: { mutations: { retry: false } },
            }),
          },
          createElement(Morning),
        ),
      ),
    );

    const goal = container.querySelector<HTMLInputElement>(
      'input[name="goal1"]',
    )!;
    const setValue = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!;
    await act(async () => {
      setValue.call(goal, "Drink a glass of water");
      goal.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () =>
      container
        .querySelector<HTMLButtonElement>('button[type="submit"]')!
        .click(),
    );

    await waitFor(() => mocks.toast.mock.calls.length > 0);
    expect(mocks.createMorningLog).toHaveBeenCalled();
    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Couldn't save morning log",
        variant: "destructive",
      }),
    );
  });
});
