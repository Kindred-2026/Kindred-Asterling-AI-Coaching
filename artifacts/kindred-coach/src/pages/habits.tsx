import {
  getGetTodaySummaryQueryKey,
  useListHabits,
  useCreateHabit,
  useDeleteHabit,
  useLogHabitEntry,
  useListHabitEntries,
  useGetStreaks,
  getListHabitsQueryKey,
  getGetStreaksQueryKey,
  getListHabitEntriesQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ListTodo, Plus, Trash2, CheckCircle2, Circle, Flame } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

function HabitCard({ habit, streaks }: { habit: any; streaks: any[] }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const today = format(new Date(), "yyyy-MM-dd");
  const streak = streaks?.find((s) => s.habitId === habit.id);

  const { data: entries } = useListHabitEntries(habit.id, {
    query: { queryKey: getListHabitEntriesQueryKey(habit.id) },
  });
  const logEntry = useLogHabitEntry();
  const deleteHabit = useDeleteHabit();

  const todayEntry = entries?.find((e) => e.date === today);
  const completedToday = todayEntry?.completed === true;
  const progress = Math.min(100, Math.round(((habit.completedCount ?? 0) / habit.targetDays) * 100));

  const handleToggle = () => {
    if (completedToday) return;
    logEntry.mutate(
      { id: habit.id, data: { date: today, completed: true } },
      {
        onSuccess: () => {
          toast({ title: "Habit logged", description: `${habit.name} — nice work.` });
          queryClient.invalidateQueries({ queryKey: getListHabitEntriesQueryKey(habit.id) });
          queryClient.invalidateQueries({ queryKey: getListHabitsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetStreaksQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetTodaySummaryQueryKey() });
        },
      }
    );
  };

  const handleDelete = () => {
    deleteHabit.mutate(
      { id: habit.id },
      {
        onSuccess: () => {
          toast({ title: "Habit removed" });
          queryClient.invalidateQueries({ queryKey: getListHabitsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetStreaksQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetTodaySummaryQueryKey() });
        },
      }
    );
  };

  return (
    <Card className="border-border shadow-none" data-testid={`card-habit-${habit.id}`}>
      <CardContent className="p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 flex-1">
            <button
              onClick={handleToggle}
              disabled={completedToday || logEntry.isPending}
              aria-label={completedToday ? "Mark as incomplete" : "Mark as complete"}
              data-testid={`button-toggle-habit-${habit.id}`}
              className="mt-0.5 shrink-0 transition-transform hover:scale-110"
            >
              {completedToday ? (
                <CheckCircle2 className="w-6 h-6 text-primary" />
              ) : (
                <Circle className="w-6 h-6 text-muted-foreground hover:text-primary transition-colors" />
              )}
            </button>
            <div className="space-y-0.5 flex-1">
              <p className={cn("font-medium text-foreground", completedToday && "line-through text-muted-foreground")}>
                {habit.name}
              </p>
              {habit.description && (
                <p className="text-sm text-muted-foreground">{habit.description}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {streak && streak.currentStreak > 0 && (
              <div className="flex items-center gap-1 text-secondary">
                <Flame className="w-4 h-4" />
                <span className="text-sm font-semibold">{streak.currentStreak}</span>
              </div>
            )}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <button
                  disabled={deleteHabit.isPending}
                  aria-label="Delete habit"
                  data-testid={`button-delete-habit-${habit.id}`}
                  className="text-muted-foreground hover:text-destructive transition-colors p-1"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete habit?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently remove "{habit.name}" and all its tracked history.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90 border-destructive">
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Day {habit.completedCount ?? 0} of {habit.targetDays}</span>
            <span>{progress}%</span>
          </div>
          <Progress value={progress} className="h-1.5" />
        </div>
      </CardContent>
    </Card>
  );
}

export default function Habits() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [targetDays, setTargetDays] = useState("90");

  const { data: habits, isLoading } = useListHabits({ query: { queryKey: getListHabitsQueryKey() } });
  const streakParams = { tzOffset: new Date().getTimezoneOffset() };
  const { data: streaks } = useGetStreaks(streakParams, { query: { queryKey: getGetStreaksQueryKey(streakParams) } });
  const createHabit = useCreateHabit();

  const handleCreate = () => {
    if (!newName.trim()) return;
    createHabit.mutate(
      {
        data: {
          name: newName.trim(),
          description: newDescription.trim() || undefined,
          targetDays: parseInt(targetDays, 10) || 90,
          startDate: format(new Date(), "yyyy-MM-dd"),
        },
      },
      {
        onSuccess: () => {
          toast({ title: "Habit created", description: `${newName} added to your tracker.` });
          queryClient.invalidateQueries({ queryKey: getListHabitsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetStreaksQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetTodaySummaryQueryKey() });
          setNewName("");
          setNewDescription("");
          setTargetDays("90");
          setOpen(false);
        },
      }
    );
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-12">
      <header className="flex items-start justify-between pt-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-serif text-foreground tracking-tight flex items-center gap-3">
            <ListTodo className="w-8 h-8 text-primary" />
            Habits
          </h1>
          <p className="text-muted-foreground text-lg">Build consistency, one day at a time.</p>
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" className="shrink-0 mt-1 gap-1.5" data-testid="button-add-habit">
              <Plus className="w-4 h-4" />
              New Habit
            </Button>
          </DialogTrigger>
          <DialogContent className="signed-in-sheet sm:max-w-md" aria-describedby={undefined}>
            <DialogHeader>
              <DialogTitle>Add a New Habit</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <Label htmlFor="habit-name">Habit name</Label>
                <Input
                  placeholder="E.g., Morning reflection, Hydrate, Evening walk"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  id="habit-name" data-testid="input-habit-name"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="habit-description">Description (optional)</Label>
                <Input
                  placeholder="A short note about why it matters"
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  id="habit-description" data-testid="input-habit-description"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="target-days">Target days</Label>
                <Input
                  type="number"
                  min="1"
                  max="365"
                  value={targetDays}
                  onChange={(e) => setTargetDays(e.target.value)}
                  id="target-days" data-testid="input-target-days"
                />
              </div>
              <Button
                onClick={handleCreate}
                disabled={!newName.trim() || createHabit.isPending}
                className="w-full"
                data-testid="button-confirm-add-habit"
              >
                {createHabit.isPending ? "Adding..." : "Add Habit"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </header>

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
        </div>
      ) : habits && habits.length > 0 ? (
        <div className="space-y-3">
          {habits.map((habit) => (
            <HabitCard key={habit.id} habit={habit} streaks={streaks ?? []} />
          ))}
        </div>
      ) : (
        <Card className="border-dashed bg-transparent shadow-none">
          <CardContent className="p-12 text-center space-y-4">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto">
              <ListTodo className="w-8 h-8 text-muted-foreground" />
            </div>
            <div>
              <p className="font-medium text-foreground">No habits yet</p>
              <p className="text-sm text-muted-foreground mt-1">
                Start with one small thing you want to do consistently.
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => setOpen(true)}
              data-testid="button-create-first-habit"
            >
              Create your first habit
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
