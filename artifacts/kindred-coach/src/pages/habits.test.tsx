import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider, useMutation } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ toast: vi.fn() }));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: mocks.toast }),
}));

vi.mock("@workspace/api-client-react", () => {
  const failingMutation = () =>
    useMutation({
      mutationFn: () =>
        Promise.reject(Object.assign(new Error("Server error"), { status: 500 })),
    });
  return {
    getGetTodaySummaryQueryKey: () => ["/api/dashboard/today"],
    getListHabitsQueryKey: () => ["/api/habits"],
    getGetStreaksQueryKey: () => ["/api/habits/streaks"],
    getListHabitEntriesQueryKey: (id: number) => [`/api/habits/${id}/entries`],
    useListHabits: () => ({
      data: [{ id: 7, name: "Hydrate", description: null, targetDays: 90, completedCount: 0 }],
      isLoading: false,
    }),
    useGetStreaks: () => ({ data: [] }),
    useListHabitEntries: () => ({ data: [] }),
    useLogHabitEntry: failingMutation,
    useDeleteHabit: failingMutation,
    useCreateHabit: failingMutation,
  };
});

import Habits, { parseTargetDays } from "./habits";

describe("parseTargetDays", () => {
  it.each([
    ["1", 1],
    ["30", 30],
    [" 365 ", 365],
  ])("keeps %j", (raw, expected) => {
    expect(parseTargetDays(raw)).toBe(expected);
  });

  it.each(["", "0", "-5", "366", "1000", "12.5", "abc", "12abc"])(
    "falls back to 90 for %j",
    (raw) => {
      expect(parseTargetDays(raw)).toBe(90);
    },
  );
});

describe("Habits save failures", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () =>
      root.render(
        createElement(
          QueryClientProvider,
          { client: new QueryClient() },
          createElement(Habits),
        ),
      ),
    );
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
    mocks.toast.mockReset();
  });

  function click(selector: string) {
    return act(async () => document.querySelector<HTMLButtonElement>(selector)!.click());
  }

  async function expectFailureToast(title: string) {
    await vi.waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith({
        title,
        description: "Something went wrong (error 500). Please try again.",
        variant: "destructive",
      }),
    );
  }

  it("shows a destructive toast when logging a habit fails", async () => {
    await click('[data-testid="button-toggle-habit-7"]');
    await expectFailureToast("Couldn't log habit");
  });

  it("shows a destructive toast when deleting a habit fails", async () => {
    await click('[data-testid="button-delete-habit-7"]');
    const action = [...document.querySelectorAll("button")].find(
      (b) => b.textContent === "Delete",
    )!;
    await act(async () => action.click());
    await expectFailureToast("Couldn't delete habit");
  });

  it("shows a destructive toast when creating a habit fails", async () => {
    await click('[data-testid="button-add-habit"]');
    const name = document.querySelector<HTMLInputElement>('[data-testid="input-habit-name"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
        name,
        "Stretch",
      );
      name.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await click('[data-testid="button-confirm-add-habit"]');
    await expectFailureToast("Couldn't create habit");
  });
});
