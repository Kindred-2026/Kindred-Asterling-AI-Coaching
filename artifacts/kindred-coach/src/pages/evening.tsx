import * as RadioGroup from "@radix-ui/react-radio-group";
import {
  useCreateEveningReport,
  useListEveningReports,
  getListEveningReportsQueryKey,
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
} from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { VoiceInputButton } from "@/components/voice-input-button";
import { appendTranscript } from "@/lib/voice-api";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { useToast } from "@/hooks/use-toast";
import { failureDescription } from "@/lib/failure-description";
import { useQueryClient } from "@tanstack/react-query";
import { Sunset, CheckCircle2, Star, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

const MOODS = ["Great", "Good", "Okay", "Difficult", "Rough"];

const eveningSchema = z.object({
  medicationEffectiveness: z.number().min(1).max(10),
  overallMood: z.string().optional(),
  wins: z.string().optional(),
  challenges: z.string().optional(),
  tomorrowIntent: z.string().optional(),
});

export default function Evening() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const today = format(new Date(), "yyyy-MM-dd");

  const { data: reports, isLoading } = useListEveningReports({
    query: { queryKey: getListEveningReportsQueryKey() },
  });
  const createReport = useCreateEveningReport();

  const form = useForm<z.infer<typeof eveningSchema>>({
    resolver: zodResolver(eveningSchema),
    defaultValues: {
      medicationEffectiveness: 5,
      overallMood: "",
      wins: "",
      challenges: "",
      tomorrowIntent: "",
    },
  });

  const hasReportedToday = reports?.some((r) => r.date.startsWith(today));

  const onSubmit = (data: z.infer<typeof eveningSchema>) => {
    createReport.mutate(
      {
        data: {
          date: today,
          medicationEffectiveness: data.medicationEffectiveness,
          overallMood: data.overallMood || undefined,
          wins: data.wins || undefined,
          challenges: data.challenges || undefined,
          tomorrowIntent: data.tomorrowIntent || undefined,
        },
      },
      {
        onSuccess: () => {
          toast({ title: "Evening report saved", description: "Rest well." });
          queryClient.invalidateQueries({
            queryKey: getListEveningReportsQueryKey(),
          });
          queryClient.invalidateQueries({
            queryKey: getGetTodaySummaryQueryKey(),
          });
        },
        onError: (err) => {
          toast({
            title: "Couldn't save evening report",
            description: failureDescription(err),
            variant: "destructive",
          });
        },
      },
    );
  };

  if (isLoading)
    return (
      <div className="p-8 text-center text-muted-foreground animate-pulse">
        Loading...
      </div>
    );

  if (hasReportedToday) {
    return (
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
        <header className="space-y-2 pt-4">
          <h1 className="text-3xl font-serif text-foreground tracking-tight">
            Evening Report
          </h1>
        </header>
        <Card className="border-none shadow-sm bg-secondary/5 text-center p-12">
          <CardContent className="space-y-4">
            <div className="w-16 h-16 bg-secondary/20 text-secondary rounded-full flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-medium">Great work today</h3>
            <p className="text-muted-foreground">
              You've reflected on your day. Rest and recharge.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const medEffectiveness = form.watch("medicationEffectiveness");
  const selectedMood = form.watch("overallMood");

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-12">
      <header className="space-y-2 pt-4">
        <h1 className="text-3xl font-serif text-foreground tracking-tight flex items-center gap-3">
          <Sunset className="w-8 h-8 text-secondary" />
          Evening
        </h1>
        <p className="text-muted-foreground text-lg">
          A moment to close the loop on your day.
        </p>
      </header>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Card className="border-border shadow-sm">
            <CardContent className="p-6 space-y-8">
              <FormField
                control={form.control}
                name="medicationEffectiveness"
                render={({ field }) => (
                  <FormItem className="space-y-4">
                    <FormLabel className="text-base font-medium">
                      How effective was your medication today?
                      <span className="ml-2 text-primary font-semibold">
                        {field.value}/10
                      </span>
                    </FormLabel>
                    <FormControl>
                      <Slider
                        value={[field.value]}
                        onValueChange={([v]) => field.onChange(v)}
                        min={1}
                        max={10}
                        step={1}
                        className="w-full"
                        aria-label="Medication effectiveness"
                        data-testid="slider-medication"
                      />
                    </FormControl>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Not effective</span>
                      <span>Highly effective</span>
                    </div>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="overallMood"
                render={({ field }) => (
                  <FormItem className="space-y-3">
                    <FormLabel className="text-base font-medium">
                      Overall, how was your day?
                    </FormLabel>
                    <RadioGroup.Root
                      className="flex gap-2 flex-wrap"
                      value={selectedMood}
                      onValueChange={field.onChange}
                      aria-label="Overall mood"
                    >
                      {MOODS.map((mood) => (
                        <RadioGroup.Item
                          key={mood}
                          type="button"
                          value={mood}
                          aria-checked={selectedMood === mood}
                          data-testid={`mood-${mood.toLowerCase()}`}
                          className={cn(
                            "px-4 py-2 rounded-full text-sm font-medium border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                            selectedMood === mood
                              ? "bg-secondary text-secondary-foreground border-secondary shadow-sm"
                              : "bg-background border-border hover:border-secondary/50 hover:bg-secondary/5",
                          )}
                        >
                          {mood}
                        </RadioGroup.Item>
                      ))}
                    </RadioGroup.Root>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="wins"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center justify-between gap-2">
                      <FormLabel className="text-base font-medium flex items-center gap-2">
                        <Star className="w-4 h-4 text-primary" />
                        What went well?
                      </FormLabel>
                      <VoiceInputButton
                        onTranscript={(text) =>
                          field.onChange(appendTranscript(field.value, text))
                        }
                      />
                    </div>
                    <FormControl>
                      <Textarea
                        placeholder="Even small wins count..."
                        className="resize-none bg-background min-h-[80px]"
                        data-testid="textarea-wins"
                        {...field}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="challenges"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center justify-between gap-2">
                      <FormLabel className="text-base font-medium">
                        What was hard?
                      </FormLabel>
                      <VoiceInputButton
                        onTranscript={(text) =>
                          field.onChange(appendTranscript(field.value, text))
                        }
                      />
                    </div>
                    <FormControl>
                      <Textarea
                        placeholder="What felt difficult or draining today?"
                        className="resize-none bg-background min-h-[80px]"
                        data-testid="textarea-challenges"
                        {...field}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="tomorrowIntent"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center justify-between gap-2">
                      <FormLabel className="text-base font-medium">
                        Intention for tomorrow
                      </FormLabel>
                      <VoiceInputButton
                        onTranscript={(text) =>
                          field.onChange(appendTranscript(field.value, text))
                        }
                      />
                    </div>
                    <FormControl>
                      <Textarea
                        placeholder="One thing you want to carry into tomorrow..."
                        className="resize-none bg-background min-h-[80px]"
                        data-testid="textarea-tomorrow"
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
            disabled={createReport.isPending}
            className="w-full h-14 text-lg font-medium shadow-md flex items-center justify-center"
            data-testid="button-save-evening"
          >
            {createReport.isPending && (
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
            )}
            {createReport.isPending ? "Saving..." : "Close Out My Day"}
          </Button>
        </form>
      </Form>
    </div>
  );
}
