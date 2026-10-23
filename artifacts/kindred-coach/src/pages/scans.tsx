import {
  getGetTodaySummaryQueryKey,
  useCreateBodyScan,
  useListBodyScans,
  getListBodyScansQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useToast } from "@/hooks/use-toast";
import { failureDescription } from "@/lib/failure-description";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { ScanLine, Clock, Search, X, Loader2 } from "lucide-react";
import { format, parseISO } from "date-fns";
import { FEELINGS_WHEEL, searchFeelings } from "@/lib/feelings-wheel";

const MAX_FEELINGS = 20;

export default function Scans() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: scans, isLoading } = useListBodyScans({
    query: { queryKey: getListBodyScansQueryKey() },
  });
  const createScan = useCreateBodyScan();

  const [selectedFeelings, setSelectedFeelings] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [energyLevel, setEnergyLevel] = useState(5);
  const [physicalSensations, setPhysicalSensations] = useState("");
  const [notes, setNotes] = useState("");

  const trimmedQuery = query.trim();
  const searchResults = useMemo(
    () => searchFeelings(trimmedQuery),
    [trimmedQuery],
  );

  const toggleFeeling = (feeling: string) => {
    setSelectedFeelings((prev) => {
      if (prev.includes(feeling)) {
        return prev.filter((f) => f !== feeling);
      }
      if (prev.length >= MAX_FEELINGS) {
        toast({
          title: `That's the max (${MAX_FEELINGS})`,
          description: "Remove one to add another.",
          variant: "destructive",
        });
        return prev;
      }
      return [...prev, feeling];
    });
  };

  const handleSubmit = () => {
    if (selectedFeelings.length === 0) {
      toast({ title: "Select at least one feeling", variant: "destructive" });
      return;
    }
    createScan.mutate(
      {
        data: {
          feelings: selectedFeelings,
          energyLevel,
          physicalSensations: physicalSensations || undefined,
          notes: notes || undefined,
        },
      },
      {
        onSuccess: () => {
          toast({
            title: "Body scan logged",
            description: "Check-in recorded.",
          });
          queryClient.invalidateQueries({
            queryKey: getListBodyScansQueryKey(),
          });
          queryClient.invalidateQueries({ queryKey: getGetTodaySummaryQueryKey() });
          setSelectedFeelings([]);
          setQuery("");
          setEnergyLevel(5);
          setPhysicalSensations("");
          setNotes("");
        },
        onError: (err) => {
          toast({
            title: "Couldn't save body scan",
            description: failureDescription(err),
            variant: "destructive",
          });
        },
      },
    );
  };

  const FeelingPill = ({ label, hint }: { label: string; hint?: string }) => {
    const active = selectedFeelings.includes(label);
    return (
      <button
        type="button"
        onClick={() => toggleFeeling(label)}
        data-testid={`feeling-${label.toLowerCase().replace(/\s+/g, "-")}`}
        aria-pressed={active}
        className={cn(
          "px-3 py-1.5 rounded-full text-sm font-medium border transition-all duration-150",
          active
            ? "bg-primary text-primary-foreground border-primary shadow-sm"
            : "bg-background text-foreground border-border hover:border-primary/50 hover:bg-primary/5",
        )}
      >
        {label}
        {hint && (
          <span
            className={cn(
              "ml-1.5 text-xs",
              active ? "text-primary-foreground/70" : "text-muted-foreground",
            )}
          >
            {hint}
          </span>
        )}
      </button>
    );
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-12">
      <header className="space-y-2 pt-4">
        <h1 className="text-3xl font-serif text-foreground tracking-tight flex items-center gap-3">
          <ScanLine className="w-8 h-8 text-primary" />
          Body Scan
        </h1>
        <p className="text-muted-foreground text-lg">
          Pause and notice what's happening right now.
        </p>
      </header>

      <Card className="border-border shadow-sm">
        <CardContent className="p-6 space-y-7">
          <div className="space-y-3">
            <Label className="text-base font-medium">
              What are you feeling right now?
            </Label>
            <p className="text-sm text-muted-foreground">
              Search or browse the feelings wheel. Tag up to {MAX_FEELINGS}.
            </p>

            {selectedFeelings.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/40 p-3">
                <span className="text-xs font-medium text-muted-foreground mr-1">
                  {selectedFeelings.length} selected
                </span>
                {selectedFeelings.map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => toggleFeeling(f)}
                    data-testid={`selected-${f.toLowerCase().replace(/\s+/g, "-")}`}
                    className="group flex items-center gap-1 rounded-full bg-primary px-3 py-1 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
                  >
                    {f}
                    <X className="h-3.5 w-3.5 opacity-70 group-hover:opacity-100" />
                  </button>
                ))}
              </div>
            )}

            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search feelings (e.g. anxious, hopeful, numb)…"
                className="pl-9 bg-background"
                aria-label="Search feelings"
                  data-testid="input-feeling-search"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="Clear search"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {trimmedQuery ? (
              searchResults.length > 0 ? (
                <div
                  className="flex flex-wrap gap-2 pt-1"
                  data-testid="search-results"
                >
                  {searchResults.map((f) => (
                    <FeelingPill
                      key={f.label}
                      label={f.label}
                      hint={f.core !== f.label ? f.core : undefined}
                    />
                  ))}
                </div>
              ) : (
                <p className="pt-2 text-sm text-muted-foreground">
                  No feelings match "{trimmedQuery}".
                </p>
              )
            ) : (
              <Accordion type="multiple" className="w-full">
                {FEELINGS_WHEEL.map((core) => (
                  <AccordionItem key={core.name} value={core.name}>
                    <AccordionTrigger
                      className="text-base hover:no-underline"
                      data-testid={`core-${core.name.toLowerCase()}`}
                    >
                      <span className="flex items-center gap-2.5">
                        <span
                          className={cn("h-2.5 w-2.5 rounded-full", core.dot)}
                        />
                        {core.name}
                      </span>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="space-y-3 pt-1">
                        <FeelingPill label={core.name} />
                        {core.groups.map((g) => (
                          <div
                            key={g.secondary}
                            className="flex flex-wrap gap-2"
                          >
                            <FeelingPill label={g.secondary} />
                            {g.tertiary.map((t) => (
                              <FeelingPill key={t} label={t} />
                            ))}
                          </div>
                        ))}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            )}
          </div>

          <div className="space-y-4">
            <Label className="text-base font-medium">
              Energy Level: {energyLevel} / 10
            </Label>
            <Slider
              value={[energyLevel]}
              onValueChange={([v]) => setEnergyLevel(v)}
              min={1}
              max={10}
              step={1}
              className="w-full"
              aria-label="Energy level"
              data-testid="slider-energy"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Depleted</span>
              <span>Vibrant</span>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="scan-physical" className="text-base font-medium">
              Physical sensations (optional)
            </Label>
            <Textarea
              placeholder="E.g., tight chest, restless legs, heavy eyelids..."
              className="resize-none bg-background min-h-[80px]"
              value={physicalSensations}
              onChange={(e) => setPhysicalSensations(e.target.value)}
              id="scan-physical"
              data-testid="textarea-physical"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="scan-notes" className="text-base font-medium">
              Any additional notes? (optional)
            </Label>
            <Textarea
              placeholder="What triggered this check-in? Anything you want to remember?"
              className="resize-none bg-background min-h-[80px]"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              id="scan-notes"
              data-testid="textarea-notes"
            />
          </div>
        </CardContent>
      </Card>

      <Button
        onClick={handleSubmit}
        disabled={createScan.isPending}
        className="w-full h-14 text-lg font-medium shadow-md flex items-center justify-center"
        data-testid="button-log-scan"
      >
        {createScan.isPending && (
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
        )}
        {createScan.isPending ? "Saving..." : "Log This Scan"}
      </Button>

      {!isLoading && scans && scans.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-medium text-foreground flex items-center gap-2">
            <Clock className="w-5 h-5 text-muted-foreground" />
            Recent Scans
          </h2>
          <div className="space-y-3">
            {scans.slice(0, 5).map((scan) => (
              <Card
                key={scan.id}
                className="border-border shadow-none"
                data-testid={`card-scan-${scan.id}`}
              >
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">
                      {format(parseISO(scan.scannedAt), "MMM d, h:mm a")}
                    </span>
                    <span className="text-sm font-medium text-foreground">
                      Energy {scan.energyLevel}/10
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {scan.feelings.map((f) => (
                      <span
                        key={f}
                        className="px-2 py-0.5 bg-primary/10 text-primary text-xs rounded-full font-medium"
                      >
                        {f}
                      </span>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
