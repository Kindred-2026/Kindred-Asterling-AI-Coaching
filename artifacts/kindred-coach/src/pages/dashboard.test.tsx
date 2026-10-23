import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  summary: null as any,
  summaryLoading: true,
  summaryError: false,
  medications: [] as any[],
  medicationsLoading: true,
  medicationsError: false,
  moodTrend: [] as any[],
  moodLoading: false,
  moodError: false,
  refetchSummary: vi.fn(),
  streaks: [] as any[],
}));

vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: any) =>
    createElement("a", { href, ...rest }, children),
}));

vi.mock("@workspace/api-client-react", () => ({
  useGetTodaySummary: () => ({
    data: mocks.summary,
    isLoading: mocks.summaryLoading,
    isError: mocks.summaryError,
    refetch: mocks.refetchSummary,
  }),
  useGetStreaks: () => ({ data: mocks.streaks, isLoading: false, isError: false, refetch: vi.fn() }),
  useGetMoodTrend: () => ({
    data: mocks.moodTrend,
    isLoading: mocks.moodLoading,
    isError: mocks.moodError,
    refetch: vi.fn(),
  }),
  useListMedications: () => ({
    data: mocks.medications,
    isLoading: mocks.medicationsLoading,
    isError: mocks.medicationsError,
    refetch: vi.fn(),
  }),
  getGetTodaySummaryQueryKey: () => ["/api/dashboard/today"],
  getGetStreaksQueryKey: () => ["/api/dashboard/streaks"],
  getGetMoodTrendQueryKey: () => ["/api/dashboard/mood-trend"],
  getListMedicationsQueryKey: () => ["/api/medications"],
}));

// Keep analytics children out of the component-under-test's render tree so this
// suite stays focused on the Today experience itself.
vi.mock("@/components/dashboard/positive-affirmations", () => ({
  PositiveAffirmations: () => null,
}));
vi.mock("@/components/charts/weekly-habit-completion", () => ({
  WeeklyHabitCompletion: () => null,
}));

import { default as Dashboard } from "./dashboard";

describe("Dashboard (Today experience)", () => {
  let container: HTMLDivElement;
  let root: Root;
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.summary = null;
    mocks.summaryLoading = true;
    mocks.summaryError = false;
    mocks.medications = [];
    mocks.medicationsLoading = true;
    mocks.medicationsError = false;
    mocks.moodTrend = [];
    mocks.moodLoading = false;
    mocks.moodError = false;
    mocks.streaks = [];
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    queryClient.clear();
  });

  function renderDashboard() {
    return act(async () => {
      root.render(
        createElement(
          QueryClientProvider,
          { client: queryClient },
          createElement(Dashboard),
        ),
      );
    });
  }

  it("shows a skeleton (no next action) while the summary loads", async () => {
    mocks.summaryLoading = true;
    await renderDashboard();
    expect(container.querySelector('[data-testid="next-step-title"]')).toBeNull();
  });

  it("shows a retry action when Today data fails, without inferring a next step", async () => {
    mocks.summaryLoading = false;
    mocks.summaryError = true;
    await renderDashboard();
    expect(container.textContent).toContain("Today's data is unavailable");
    expect(container.querySelector('[data-testid="query-error-state"]'))
      .not.toBeNull();
    expect(container.querySelector('[data-testid="next-step-title"]')).toBeNull();
  });

  it("does not leave the daily-journey skeleton visible when Today data fails", async () => {
    mocks.summaryLoading = false;
    mocks.summaryError = true;
    await renderDashboard();

    // The retryable error is the whole story: no lingering journey skeleton
    // and no journey content derived from missing data.
    expect(container.querySelector('[data-testid="query-error-state"]'))
      .not.toBeNull();
    expect(container.querySelector('[data-testid="daily-journey-skeleton"]'))
      .toBeNull();
    for (const anchor of ["Begin", "Notice", "Tend", "Close"]) {
      expect(container.textContent).not.toContain(anchor);
    }
  });

  it("renders the dominant next step with the correct action destination", async () => {
    mocks.summaryLoading = false;
    mocks.summary = {
      morningDone: false,
      eveningDone: false,
      bodyScansCount: 0,
      habitsCompletedToday: 0,
      totalHabits: 0,
      currentMentalLoad: null,
    };
    mocks.medicationsLoading = false;
    mocks.medications = [];
    await renderDashboard();

    const title = container.querySelector('[data-testid="next-step-title"]');
    expect(title).not.toBeNull();
    expect(title!.textContent).toContain("Begin your day");

    const action = container.querySelector('[data-testid="next-step-action"]');
    expect(action).not.toBeNull();
    expect(action!.getAttribute("href")).toBe("/app/morning");
  });

  it("renders the calm completed state when everything is done", async () => {
    mocks.summaryLoading = false;
    mocks.summary = {
      morningDone: true,
      eveningDone: true,
      bodyScansCount: 1,
      habitsCompletedToday: 1,
      totalHabits: 1,
      currentMentalLoad: "clear",
    };
    mocks.medicationsLoading = false;
    mocks.medications = [
      {
        id: 1,
        name: "Med A",
        dosage: "10mg",
        times: ["08:00"],
        doses: [{ scheduledTime: "08:00", takenAt: "yes", effectiveness: null }],
      },
    ];
    await renderDashboard();

    expect(container.querySelector('[data-testid="next-step-title"]')!.textContent)
      .toContain("on track");
    // No action link in the completed state.
    expect(container.querySelector('[data-testid="next-step-action"]')).toBeNull();
  });

  it("renders the four-anchor daily journey", async () => {
    mocks.summaryLoading = false;
    mocks.summary = {
      morningDone: true,
      eveningDone: false,
      bodyScansCount: 2,
      habitsCompletedToday: 1,
      totalHabits: 1,
      currentMentalLoad: "mild",
    };
    mocks.medicationsLoading = false;
    mocks.medications = [];
    await renderDashboard();

    for (const anchor of ["Begin", "Notice", "Tend", "Close"]) {
      expect(container.textContent).toContain(anchor);
    }
  });

  it("renders medication timing without blanking the page on failure", async () => {
    mocks.summaryLoading = false;
    mocks.summary = {
      morningDone: true,
      eveningDone: true,
      bodyScansCount: 1,
      habitsCompletedToday: 1,
      totalHabits: 1,
      currentMentalLoad: "clear",
    };
    mocks.medicationsLoading = false;
    mocks.medicationsError = true;
    await renderDashboard();

    // The page still renders the next-step (on-track) state despite med failure.
    expect(container.querySelector('[data-testid="next-step-title"]')).not.toBeNull();
    expect(container.textContent).toContain("Medications couldn't load");
    expect(container.querySelector('[data-testid="medication-retry"]')!.className)
      .toContain("min-h-11");
  });

  it("holds the next step and journey skeletons while medications still load", async () => {
    mocks.summaryLoading = false;
    mocks.summary = {
      morningDone: true,
      eveningDone: true,
      bodyScansCount: 1,
      habitsCompletedToday: 1,
      totalHabits: 1,
      currentMentalLoad: "clear",
    };
    // Summary is loaded but medications are still in flight.
    mocks.medicationsLoading = true;
    await renderDashboard();

    expect(container.querySelector('[data-testid="next-step-title"]')).toBeNull();
    // Journey anchors must not be derived from a half-loaded state.
    for (const anchor of ["Begin", "Notice", "Tend", "Close"]) {
      expect(container.textContent).not.toContain(anchor);
    }
  });

  it("marks Tend unavailable on medication failure without claiming nothing scheduled", async () => {
    mocks.summaryLoading = false;
    mocks.summary = {
      morningDone: true,
      eveningDone: true,
      bodyScansCount: 1,
      habitsCompletedToday: 0,
      totalHabits: 0,
      currentMentalLoad: "clear",
    };
    mocks.medicationsLoading = false;
    mocks.medicationsError = true;
    await renderDashboard();

    expect(container.textContent).toContain("Medication unavailable");
    expect(container.textContent).not.toContain("Nothing scheduled");
  });

  it("renders accessible recorded/not-recorded dose labels", async () => {
    mocks.summaryLoading = false;
    mocks.summary = {
      morningDone: true,
      eveningDone: true,
      bodyScansCount: 1,
      habitsCompletedToday: 1,
      totalHabits: 1,
      currentMentalLoad: "clear",
    };
    mocks.medicationsLoading = false;
    mocks.medications = [
      {
        id: 1,
        name: "Med A",
        dosage: "10mg",
        times: ["08:00", "20:00"],
        doses: [
          { scheduledTime: "08:00", takenAt: "yes", effectiveness: null },
          { scheduledTime: "20:00", takenAt: null, effectiveness: null },
        ],
      },
    ];
    await renderDashboard();

    expect(container.textContent).toContain("08:00 — Recorded");
    expect(container.textContent).toContain("20:00 — Not recorded");
  });

  it("gives the next-step CTA and Open medications at least a 44px touch target", async () => {
    mocks.summaryLoading = false;
    mocks.summary = {
      morningDone: false,
      eveningDone: false,
      bodyScansCount: 0,
      habitsCompletedToday: 0,
      totalHabits: 0,
      currentMentalLoad: null,
    };
    mocks.medicationsLoading = false;
    mocks.medications = [];
    await renderDashboard();

    // min-h-11 is Tailwind's 44px minimum touch target.
    for (const testid of ["next-step-action", "medications-today-link"]) {
      const el = container.querySelector(`[data-testid="${testid}"]`);
      expect(el).not.toBeNull();
      expect(el!.className).toContain("min-h-11");
      expect(el!.className).toContain("inline-flex");
    }
  });

  it("shows a retryable error for medication-effectiveness failures", async () => {
    mocks.summaryLoading = false;
    mocks.summary = {
      morningDone: true,
      eveningDone: true,
      bodyScansCount: 1,
      habitsCompletedToday: 1,
      totalHabits: 1,
      currentMentalLoad: "clear",
    };
    mocks.medicationsLoading = false;
    mocks.medications = [];
    mocks.moodLoading = false;
    mocks.moodError = true;
    mocks.moodTrend = [];
    await renderDashboard();

    expect(container.querySelector('[data-testid="medication-effectiveness-error"]'))
      .not.toBeNull();
    expect(container.textContent).toContain("Medication effectiveness couldn't load");
    expect(container.textContent).not.toContain("Not enough data yet");
    expect(
      container.querySelector('[data-testid="medication-effectiveness-retry"]')!
        .className,
    ).toContain("min-h-11");
  });

  it("shows the genuine empty state for medication-effectiveness with no data", async () => {
    mocks.summaryLoading = false;
    mocks.summary = {
      morningDone: true,
      eveningDone: true,
      bodyScansCount: 1,
      habitsCompletedToday: 1,
      totalHabits: 1,
      currentMentalLoad: "clear",
    };
    mocks.medicationsLoading = false;
    mocks.medications = [];
    mocks.moodLoading = false;
    mocks.moodError = false;
    mocks.moodTrend = [];
    await renderDashboard();

    expect(container.textContent).toContain("Not enough data yet");
    expect(container.querySelector('[data-testid="medication-effectiveness-error"]'))
      .toBeNull();
  });

  it("lists only unbroken streaks as active", async () => {
    mocks.summaryLoading = false;
    mocks.streaks = [
      { habitId: 1, habitName: "Broken walk", currentStreak: 0, longestStreak: 5 },
      { habitId: 2, habitName: "Daily reading", currentStreak: 3, longestStreak: 3 },
    ];
    await renderDashboard();
    expect(container.textContent).toContain("Daily reading");
    expect(container.textContent).not.toContain("Broken walk");
  });

  it("shows the empty state when every streak is broken", async () => {
    mocks.summaryLoading = false;
    mocks.streaks = [
      { habitId: 1, habitName: "Broken walk", currentStreak: 0, longestStreak: 5 },
    ];
    await renderDashboard();
    expect(container.textContent).toContain("No active streaks yet");
    expect(container.textContent).not.toContain("Broken walk");
  });
});
