import {
  useCreateMorningLog,
  useListMorningLogs,
  getListMorningLogsQueryKey,
  getGetTodaySummaryQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Sunrise, CheckCircle2, Loader2 } from "lucide-react";
import { format } from "date-fns";

const morningSchema = z.object({
  mentalLoadLevel: z.enum(["clear", "mild", "moderate", "enormous"]),
  goal1: z.string().min(1, "Please set a goal"),
  goal2: z.string().optional(),
  goal3: z.string().optional(),
  notes: z.string().optional(),
});

export default function Morning() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const today = format(new Date(), "yyyy-MM-dd");

  const { data: logs, isLoading: isLoadingLogs } = useListMorningLogs({
    query: { queryKey: getListMorningLogsQueryKey() },
  });

  const createLog = useCreateMorningLog();

  const form = useForm<z.infer<typeof morningSchema>>({
    resolver: zodResolver(morningSchema),
    defaultValues: {
      mentalLoadLevel: "mild",
      goal1: "",
      goal2: "",
      goal3: "",
      notes: "",
    },
  });

  const hasLoggedToday = logs?.some((log) => log.date.startsWith(today));

  const onSubmit = (data: z.infer<typeof morningSchema>) => {
    const miniGoals = [data.goal1, data.goal2, data.goal3].filter(
      Boolean,
    ) as string[];

    createLog.mutate(
      {
        data: {
          date: today,
          mentalLoadLevel: data.mentalLoadLevel,
          miniGoals,
          notes: data.notes,
        },
      },
      {
        onSuccess: () => {
          toast({
            title: "Morning log saved",
            description: "Have a wonderful day.",
          });
          queryClient.invalidateQueries({
            queryKey: getListMorningLogsQueryKey(),
          });
          queryClient.invalidateQueries({
            queryKey: getGetTodaySummaryQueryKey(),
          });
        },
        onError: () => {
          toast({
            title: "Couldn't save morning log",
            description: "Check your connection and try again.",
            variant: "destructive",
          });
        },
      },
    );
  };

  if (isLoadingLogs)
    return (
      <div className="p-8 text-center text-muted-foreground animate-pulse">
        Loading...
      </div>
    );

  if (hasLoggedToday) {
    return (
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
        <header className="space-y-2 pt-4">
          <h1 className="text-3xl font-serif text-foreground tracking-tight">
            Morning Check-in
          </h1>
        </header>
        <Card className="border-none shadow-sm bg-primary/5 text-center p-12">
          <CardContent className="space-y-4">
            <div className="w-16 h-16 bg-primary/20 text-primary rounded-full flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-medium">You've checked in today</h3>
            <p className="text-muted-foreground">
              Focus on those mini goals. You've got this.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-12">
      <header className="space-y-2 pt-4">
        <h1 className="text-3xl font-serif text-foreground tracking-tight flex items-center gap-3">
          <Sunrise className="w-8 h-8 text-primary" />
          Morning
        </h1>
        <p className="text-muted-foreground text-lg">
          Set the tone for the day ahead.
        </p>
      </header>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          <Card className="border-border shadow-sm">
            <CardContent className="p-6 space-y-6">
              <FormField
                control={form.control}
                name="mentalLoadLevel"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-base font-medium">
                      How clear is your mind right now?
                    </FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger className="h-12 bg-background">
                          <SelectValue placeholder="Select mental load" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="clear">Clear and focused</SelectItem>
                        <SelectItem value="mild">
                          A little scattered, but manageable
                        </SelectItem>
                        <SelectItem value="moderate">
                          Feeling somewhat heavy or busy
                        </SelectItem>
                        <SelectItem value="enormous">
                          Enormous load, feeling overwhelmed
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="space-y-4">
                <Label className="text-base font-medium block">
                  What are 1-3 tiny things you can accomplish today?
                </Label>
                <FormField
                  control={form.control}
                  name="goal1"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="sr-only">Goal 1 (required)</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="1. E.g., Drink a glass of water"
                          className="h-12 bg-background"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="goal2"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="sr-only">Goal 2 (optional)</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="2. (Optional)"
                          className="h-12 bg-background"
                          {...field}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="goal3"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="sr-only">Goal 3 (optional)</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="3. (Optional)"
                          className="h-12 bg-background"
                          {...field}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-base font-medium">
                      Anything else on your mind?
                    </FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Write it down here..."
                        className="min-h-[100px] resize-none bg-background"
                        {...field}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Button
            type="submit"
            className="w-full h-14 text-lg font-medium shadow-md flex items-center justify-center"
            disabled={createLog.isPending}
          >
            {createLog.isPending && (
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
            )}
            {createLog.isPending ? "Saving..." : "Start My Day"}
          </Button>
        </form>
      </Form>
    </div>
  );
}
