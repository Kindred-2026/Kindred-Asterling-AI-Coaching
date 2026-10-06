import { Link } from "wouter";
import {
  useGetTodaySummary,
  useGetStreaks,
  useGetMoodTrend,
  useListMedications,
  getGetTodaySummaryQueryKey,
  getGetStreaksQueryKey,
  getGetMoodTrendQueryKey,
  getListMedicationsQueryKey,
  type MedicationWithStatus,
  type HabitStreak,
  type MoodTrendPoint,
} from "@workspace/api-client-react";
import {
  ArrowRight,
  Sunrise,
  Sunset,
  Flame,
  Activity,
  CheckCircle2,
  Circle,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import { WeeklyHabitCompletion } from "@/components/charts/weekly-habit-completion";
import { PositiveAffirmations } from "@/components/dashboard/positive-affirmations";
import { QueryErrorState } from "@/components/query-error-state";
import {
  deriveNextStep,
  deriveDailyJourney,
  type TodayInputs,
} from "@/lib/today";

export default function Dashboard() {
  const todayParams = { tzOffset: new Date().getTimezoneOffset() };
  const {
    data: summary,
    isLoading: isLoadingSummary,
    isError: summaryError,
    refetch: refetchSummary,
  } = useGetTodaySummary(todayParams, { query: { queryKey: getGetTodaySummaryQueryKey(todayParams) } });
  const {
    data: streaks,
    isLoading: isLoadingStreaks,
    isError: streaksError,
    refetch: refetchStreaks,
  } = useGetStreaks(todayParams, { query: { queryKey: getGetStreaksQueryKey(todayParams) } });
  const {
    data: moodTrend,
    isLoading: isLoadingMood,
    isError: moodError,
    refetch: refetchMood,
  } = useGetMoodTrend(todayParams, { query: { queryKey: getGetMoodTrendQueryKey(todayParams) } });
  // Resolve "today's doses" in the device's local day, matching /medications.
  const medListParams = { tzOffset: new Date().getTimezoneOffset() };
  const {
    data: medications,
    isLoading: isLoadingMedications,
    isError: medicationsError,
    refetch: refetchMedications,
  } = useListMedications(medListParams, {
    query: { queryKey: getListMedicationsQueryKey(medListParams) },
  });

  const doses = medications?.flatMap((m) => m.doses) ?? null;

  // Build the pure helper inputs only once real (non-error) summary data exists
  // AND medication data has finished loading (success or failure). We never
  // derive a next step or journey from data that is still in flight.
  const inputsReady = Boolean(summary) && !isLoadingMedications;
  const inputs: TodayInputs | null = inputsReady && summary
    ? {
        morningDone: summary.morningDone,
        eveningDone: summary.eveningDone,
        bodyScansCount: summary.bodyScansCount,
        habitsCompletedToday: summary.habitsCompletedToday,
        totalHabits: summary.totalHabits,
        doses,
        medicationsUnavailable: Boolean(medicationsError),
        medicationsLoading: isLoadingMedications,
      }
    : null;

  const nextStep = inputs ? deriveNextStep(inputs, new Date()) : null;
  const journey = inputs ? deriveDailyJourney(inputs) : [];

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 fill-mode-both motion-reduce:animate-none">
      <header className="space-y-2 pt-4">
        <h1 className="text-3xl font-serif text-foreground tracking-tight">
          Today
        </h1>
        <p className="text-muted-foreground text-lg">
          What's the most helpful next step for you right now?
        </p>
      </header>

      {/* A single dominant next-step (only when data is loadable; errors get a retry). */}
      {summaryError ? (
        <QueryErrorState
          title="Today's data is unavailable"
          message="Kindred couldn't load your check-ins for today. Try again before doing anything else."
          onRetry={() => void refetchSummary()}
        />
      ) : isLoadingSummary || !nextStep ? (
        <Skeleton className="h-40 w-full rounded-xl" />
      ) : (
        <NextStepPanel step={nextStep} />
      )}

      {/* Compact four-anchor daily journey. Never left as a skeleton when the
          summary itself failed — the retryable error above is the whole story. */}
      {!summaryError && (isLoadingSummary || !inputs ? (
        <Card className="border-none shadow-sm bg-card">
          <CardContent className="p-5">
            <Skeleton className="h-24 w-full rounded-lg" data-testid="daily-journey-skeleton" />
          </CardContent>
        </Card>
      ) : (
        <DailyJourney journey={journey} />
      ))}

      {/* Positive affirmations, secondary to the next-step panel. */}
      <PositiveAffirmations />

      {/* Real medication timing for today (read-only; editing lives on /medications). */}
      <MedicationTiming
        medications={medications}
        isLoading={isLoadingMedications}
        isError={Boolean(medicationsError)}
        onRetry={() => void refetchMedications()}
      />

      {/* Secondary "Recent patterns" analytics. */}
      <section aria-label="Recent patterns" className="space-y-8">
        <div>
          <h2 className="font-serif text-2xl text-foreground tracking-tight">
            Recent patterns
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            A longer view of the quiet work.
          </p>
        </div>

        <WeeklyHabitCompletion />

        <MedicationEffectivenessCard
          moodTrend={moodTrend}
          isLoading={isLoadingMood}
          isError={Boolean(moodError)}
          onRetry={() => void refetchMood()}
        />

        <StreaksSection
          streaks={streaks}
          isLoading={isLoadingStreaks}
          isError={Boolean(streaksError)}
        />
      </section>
    </div>
  );
}

function NextStepPanel({ step }: { step: ReturnType<typeof deriveNextStep> }) {
  const onTrack = step.kind === "on-track";
  return (
    <Card className="border-none shadow-sm bg-primary/5 overflow-hidden">
      <CardContent className="p-6 md:p-8">
        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-4">
            <div
              className={cn(
                "p-3 rounded-full shrink-0",
                onTrack
                  ? "bg-primary/15 text-primary"
                  : "bg-secondary/20 text-secondary",
              )}
            >
              {onTrack ? (
                <CheckCircle2 className="w-7 h-7" strokeWidth={2} />
              ) : (
                <ArrowRight className="w-7 h-7" strokeWidth={2} />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Next gentle step
              </p>
              <h2
                className="mt-1 font-serif text-2xl text-foreground leading-tight"
                data-testid="next-step-title"
              >
                {step.title}
              </h2>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                {step.body}
              </p>
            </div>
          </div>
          {!onTrack && (
            <div className="sm:pl-[3.25rem]">
              <Button
                asChild
                size="lg"
                className="min-h-11 h-auto max-w-full whitespace-normal px-4 py-3 text-center"
                data-testid="next-step-action"
              >
                <Link href={step.href}>{step.cta}</Link>
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function DailyJourney({
  journey,
}: {
  journey: ReturnType<typeof deriveDailyJourney>;
}) {
  return (
    <section aria-label="Your day" className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        Your day
      </h2>
      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {journey.map((step) => (
          <li key={step.anchor}>
            <Link
              href={step.href}
              className={cn(
                "flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              )}
              aria-current={undefined}
            >
              <span
                className={cn(
                  "shrink-0 w-2.5 h-2.5 rounded-full",
                  step.complete ? "bg-primary" : "bg-muted-foreground/40",
                )}
                aria-hidden="true"
              />
              <span className="flex-1 min-w-0">
                <span className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {step.anchor}
                </span>
                <span className="block text-sm font-medium text-foreground">
                  {step.label}
                </span>
                <span className="block text-xs text-muted-foreground mt-0.5">
                  {step.status}
                </span>
              </span>
              <span
                className="shrink-0"
                aria-label={step.complete ? "Complete" : "Incomplete"}
              >
                {step.complete ? (
                  <CheckCircle2 className="w-5 h-5 text-primary" strokeWidth={2} />
                ) : (
                  <Circle className="w-5 h-5 text-muted-foreground" strokeWidth={2} />
                )}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function MedicationTiming({
  medications,
  isLoading,
  isError,
  onRetry,
}: {
  medications: MedicationWithStatus[] | undefined;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}) {
  return (
    <Card className="border-none shadow-sm bg-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <CardTitle className="font-serif text-xl">Medication today</CardTitle>
          </div>
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="min-h-11 md:min-h-8"
            data-testid="medications-today-link"
          >
            <Link href="/app/medications">Open medications</Link>
          </Button>
        </div>
        <CardDescription>Scheduled times and whether each dose is recorded</CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        {isLoading ? (
          <Skeleton className="h-16 w-full rounded-lg" />
        ) : isError ? (
          <div className="text-sm text-muted-foreground py-3 flex items-center justify-between gap-3">
            <span>Medications couldn't load just now.</span>
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex min-h-11 items-center px-2 text-xs font-medium text-primary underline underline-offset-2 md:min-h-8"
              data-testid="medication-retry"
            >
              Try again
            </button>
          </div>
        ) : !medications || medications.length === 0 ? (
          <p className="text-sm text-muted-foreground py-3">
            No medications scheduled.
          </p>
        ) : (
          <ul className="space-y-3">
            {medications.map((med) => (
              <li key={med.id} className="space-y-1.5">
                <p className="text-sm font-medium text-foreground">
                  {med.name}
                  {med.dosage && (
                    <span className="text-muted-foreground font-normal">
                      {" "}
                      · {med.dosage}
                    </span>
                  )}
                </p>
                    <ul className="flex flex-wrap gap-2">
                      {med.doses.map((dose) => {
                        const taken = !!dose.takenAt;
                        return (
                          <li
                            key={dose.scheduledTime}
                            className={cn(
                              "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium",
                              taken
                                ? "bg-primary/10 text-primary"
                                : "bg-muted text-muted-foreground",
                            )}
                          >
                            {taken ? (
                              <CheckCircle2 className="w-3.5 h-3.5" strokeWidth={2} aria-hidden="true" />
                            ) : (
                              <Circle className="w-3.5 h-3.5" strokeWidth={2} aria-hidden="true" />
                            )}
                            <span>
                              {dose.scheduledTime} — {taken ? "Recorded" : "Not recorded"}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function MedicationEffectivenessCard({
  moodTrend,
  isLoading,
  isError,
  onRetry,
}: {
  moodTrend: MoodTrendPoint[] | undefined;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}) {
  return (
    <Card className="border-none shadow-sm bg-card overflow-hidden relative">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-medium flex items-center gap-2">
          <Activity className="w-4 h-4 text-primary" />
          Medication Effectiveness
        </CardTitle>
        <CardDescription>How effective your medication felt over the last 7 days</CardDescription>
      </CardHeader>
      <CardContent className="pt-4 pb-6">
        {isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : moodTrend && moodTrend.length > 0 ? (
          <div
            className="h-40 w-full"
            role="img"
            aria-label="Medication effectiveness over the last 7 days, rated 1 to 10"
          >
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={moodTrend}
                margin={{ top: 10, right: 0, left: -20, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="colorMedicationEffectiveness" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="5%"
                      stopColor="hsl(var(--primary))"
                      stopOpacity={0.3}
                    />
                    <stop
                      offset="95%"
                      stopColor="hsl(var(--primary))"
                      stopOpacity={0}
                    />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="date"
                  tickFormatter={(val) => format(parseISO(val), "MMM d")}
                  axisLine={false}
                  tickLine={false}
                  tick={{
                    fill: "hsl(var(--muted-foreground))",
                    fontSize: 12,
                  }}
                  dy={10}
                />
                <YAxis hide domain={[0, 10]} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                  }}
                  labelStyle={{ color: "hsl(var(--muted-foreground))" }}
                  formatter={(value) => [`${value} / 10`, "Medication effectiveness"]}
                />
                <Area
                  type="monotone"
                  dataKey="medicationEffectiveness"
                  name="Medication effectiveness"
                  stroke="hsl(var(--primary))"
                  fillOpacity={1}
                  fill="url(#colorMedicationEffectiveness)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : isError ? (
          <div
            className="h-40 flex flex-col items-center justify-center gap-2 text-muted-foreground text-sm"
            data-testid="medication-effectiveness-error"
          >
            <span>Medication effectiveness couldn't load.</span>
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex min-h-11 items-center px-2 text-xs font-medium text-primary underline underline-offset-2 md:min-h-8"
              data-testid="medication-effectiveness-retry"
            >
              Try again
            </button>
          </div>
        ) : (
          <div className="h-40 flex items-center justify-center text-muted-foreground text-sm">
            Not enough data yet
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StreaksSection({
  streaks,
  isLoading,
  isError,
}: {
  streaks: HabitStreak[] | undefined;
  isLoading: boolean;
  isError: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium text-foreground flex items-center gap-2">
          <Flame className="w-5 h-5 text-secondary" />
          Active Streaks
        </h3>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-16 w-full rounded-xl" />
        </div>
      ) : isError ? (
        <Card className="border-dashed bg-transparent shadow-none">
          <CardContent className="p-8 text-center text-muted-foreground">
            Streaks couldn't load just now.
          </CardContent>
        </Card>
      ) : streaks && streaks.length > 0 ? (
        <div className="space-y-3">
          {streaks.map((streak) => (
            <Card key={streak.habitId} className="border-border shadow-none">
              <CardContent className="p-4 flex items-center justify-between">
                <div className="space-y-1">
                  <p className="font-medium text-foreground">
                    {streak.habitName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Longest: {streak.longestStreak} days
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-serif text-secondary">
                    {streak.currentStreak}
                  </span>
                  <span className="text-sm text-muted-foreground">days</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="border-dashed bg-transparent shadow-none">
          <CardContent className="p-8 text-center text-muted-foreground">
            No active streaks yet. Head to Habits to start building!
          </CardContent>
        </Card>
      )}
    </div>
  );
}
