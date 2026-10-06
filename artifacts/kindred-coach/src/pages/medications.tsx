import * as RadioGroup from "@radix-ui/react-radio-group";
import { useId, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListMedications,
  getListMedicationsQueryKey,
  createMedication,
  updateMedication,
  deleteMedication,
  logMedicationTaken,
  unlogMedicationTaken,
  type MedicationWithStatus,
  type MedicationDoseStatus,
} from "@workspace/api-client-react";
import {
  Pill,
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
  Clock,
  Sparkles,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
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

type FormState = {
  name: string;
  dosage: string;
  times: string[];
  notes: string;
};

const INPUT_CLASS =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30";

const EMPTY_FORM: FormState = {
  name: "",
  dosage: "",
  times: ["08:00"],
  notes: "",
};
const RATING_VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function formatTimeLabel(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return hhmm;
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = ((h + 11) % 12) + 1;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

function ratingTone(n: number): string {
  if (n <= 3) return "text-amber-600 dark:text-amber-400";
  if (n <= 6) return "text-foreground";
  return "text-primary";
}

function normalizeTimes(times: string[]): string[] {
  return Array.from(new Set(times.map((t) => t.trim())))
    .filter((t) => TIME_RE.test(t))
    .sort();
}

function failureDescription(err: unknown): string {
  const status =
    typeof err === "object" && err !== null && "status" in err
      ? Number((err as { status: unknown }).status)
      : NaN;
  if (status === 401 || status === 403) {
    return "Your session may have expired or your plan doesn't allow this. Sign in again and retry.";
  }
  if (status === 400) {
    return "Please check the details you entered and try again.";
  }
  return Number.isFinite(status)
    ? `Something went wrong (error ${status}). Please try again.`
    : "Something went wrong. Check your connection and try again.";
}

export default function Medications() {
  const qc = useQueryClient();
  const { toast } = useToast();

  function reportFailure(title: string, err: unknown) {
    toast({ title, description: failureDescription(err), variant: "destructive" });
  }
  // Resolve "today's doses" in the device's local day, matching how doses are
  // recorded — so a dose toggled near midnight stays attached to the right day.
  const listParams = { tzOffset: new Date().getTimezoneOffset() };
  const { data: meds = [], isLoading } = useListMedications(listParams, {
    query: { queryKey: getListMedicationsQueryKey(listParams) },
  });

  const [editingId, setEditingId] = useState<number | "new" | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);

  function startNew() {
    setForm(EMPTY_FORM);
    setEditingId("new");
  }

  function startEdit(m: MedicationWithStatus) {
    setForm({
      name: m.name,
      dosage: m.dosage,
      times: m.times.length > 0 ? [...m.times] : ["08:00"],
      notes: m.notes ?? "",
    });
    setEditingId(m.id);
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  async function refresh() {
    await qc.invalidateQueries({ queryKey: getListMedicationsQueryKey() });
  }

  async function handleSave() {
    if (!form.name.trim() || !form.dosage.trim()) return;
    const times = normalizeTimes(form.times);
    if (times.length === 0) return;
    setBusy(true);
    try {
      const payload = {
        name: form.name.trim(),
        dosage: form.dosage.trim(),
        times,
        notes: form.notes.trim() ? form.notes.trim() : null,
      };
      if (editingId === "new") {
        await createMedication(payload);
      } else if (typeof editingId === "number") {
        await updateMedication(editingId, payload);
      }
      cancelEdit();
      await refresh();
    } catch (err) {
      reportFailure("Couldn't save medication", err);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this medication?")) return;
    setBusy(true);
    try {
      await deleteMedication(id);
      if (editingId === id) cancelEdit();
      await refresh();
    } catch (err) {
      reportFailure("Couldn't delete medication", err);
    } finally {
      setBusy(false);
    }
  }

  async function toggleDose(
    m: MedicationWithStatus,
    dose: MedicationDoseStatus,
  ) {
    setBusy(true);
    try {
      const tzOffset = new Date().getTimezoneOffset();
      if (dose.takenAt) {
        await unlogMedicationTaken(m.id, {
          scheduledTime: dose.scheduledTime,
          tzOffset,
        });
      } else {
        await logMedicationTaken(m.id, {
          scheduledTime: dose.scheduledTime,
          tzOffset,
        });
      }
      await refresh();
    } catch (err) {
      reportFailure("Couldn't update dose", err);
    } finally {
      setBusy(false);
    }
  }

  async function rateDose(
    m: MedicationWithStatus,
    dose: MedicationDoseStatus,
    score: number,
  ) {
    setBusy(true);
    try {
      // Logging is idempotent on the server — this both marks the dose taken
      // (if needed) and sets its effectiveness in one call.
      await logMedicationTaken(m.id, {
        scheduledTime: dose.scheduledTime,
        effectiveness: score,
        tzOffset: new Date().getTimezoneOffset(),
      });
      await refresh();
    } catch (err) {
      reportFailure("Couldn't save rating", err);
    } finally {
      setBusy(false);
    }
  }

  const totalDoses = meds.reduce((sum, m) => sum + m.doses.length, 0);
  const takenDoses = meds.reduce(
    (sum, m) => sum + m.doses.filter((d) => d.takenAt).length,
    0,
  );

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-serif text-primary tracking-tight">
            Medications
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Track your schedule, mark each dose as taken, and rate how well it's
            working — Kindred uses your ratings to spot patterns over time.
          </p>
        </div>
        <button
          onClick={startNew}
          disabled={editingId === "new"}
          className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          data-testid="add-medication"
        >
          <Plus className="w-4 h-4" /> Add
        </button>
      </header>

      {!isLoading && meds.length > 0 && (
        <div className="rounded-lg border border-border bg-card px-4 py-3 text-sm flex items-center justify-between">
          <span className="text-muted-foreground">Today's doses</span>
          <span className="font-medium" data-testid="dose-counter">
            {takenDoses} / {totalDoses} taken
          </span>
        </div>
      )}

      {editingId === "new" && (
        <MedForm
          form={form}
          setForm={setForm}
          onSave={handleSave}
          onCancel={cancelEdit}
          busy={busy}
          title="New medication"
        />
      )}

      <div className="space-y-3">
        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {!isLoading && meds.length === 0 && editingId !== "new" && (
          <div className="rounded-lg border border-dashed border-border p-8 text-center">
            <Pill
              className="w-8 h-8 mx-auto text-muted-foreground/60"
              strokeWidth={1.5}
            />
            <p className="mt-3 text-sm text-muted-foreground">
              No medications yet. Add one to start tracking.
            </p>
          </div>
        )}
        {meds.map((m) =>
          editingId === m.id ? (
            <MedForm
              key={m.id}
              form={form}
              setForm={setForm}
              onSave={handleSave}
              onCancel={cancelEdit}
              busy={busy}
              title="Edit medication"
            />
          ) : (
            <MedRow
              key={m.id}
              med={m}
              onToggleDose={(dose) => toggleDose(m, dose)}
              onEdit={() => startEdit(m)}
              onDelete={() => handleDelete(m.id)}
              onRateDose={(dose, score) => rateDose(m, dose, score)}
              busy={busy}
            />
          ),
        )}
      </div>
    </div>
  );
}

function MedRow({
  med,
  onToggleDose,
  onEdit,
  onDelete,
  onRateDose,
  busy,
}: {
  med: MedicationWithStatus;
  onToggleDose: (dose: MedicationDoseStatus) => void;
  onEdit: () => void;
  onDelete: () => void;
  onRateDose: (dose: MedicationDoseStatus, score: number) => void;
  busy: boolean;
}) {
  const avg = med.recentEffectivenessAvg;
  const avgCount = med.recentEffectivenessCount;
  const allTaken = med.doses.length > 0 && med.doses.every((d) => d.takenAt);

  return (
    <div
      className={cn(
        "rounded-lg border bg-card p-4 transition-colors",
        allTaken ? "border-primary/40 bg-primary/5" : "border-border",
      )}
      data-testid={`med-row-${med.id}`}
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
          <Pill className="w-5 h-5 text-primary" strokeWidth={2} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <h3 className="font-medium truncate">{med.name}</h3>
            <span className="text-sm text-muted-foreground">{med.dosage}</span>
            {avg !== null && avgCount > 0 && (
              <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
                <Sparkles className="w-3 h-3" />
                7-day avg{" "}
                <span
                  className={cn("font-medium", ratingTone(Math.round(avg)))}
                >
                  {avg.toFixed(1)}/10
                </span>
                <span className="text-muted-foreground/70">({avgCount})</span>
              </span>
            )}
          </div>
          {med.notes && (
            <p className="text-xs text-muted-foreground/80 mt-1.5 italic">
              {med.notes}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={onEdit}
            disabled={busy}
            className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            aria-label={`Edit ${med.name}`}
            data-testid={`edit-med-${med.id}`}
          >
            <Pencil className="w-4 h-4" />
          </button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button
                disabled={busy}
                className="p-2 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                aria-label={`Delete ${med.name}`}
                data-testid={`delete-med-${med.id}`}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete medication?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently remove "{med.name}" and all its tracked history.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={onDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90 border-destructive">
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* Per-dose check-off + rating */}
      <div className="mt-4 space-y-3">
        {med.doses.map((dose) => (
          <DoseControl
            key={dose.scheduledTime}
            med={med}
            dose={dose}
            onToggle={() => onToggleDose(dose)}
            onRate={(score) => onRateDose(dose, score)}
            busy={busy}
          />
        ))}
      </div>
    </div>
  );
}

function DoseControl({
  med,
  dose,
  onToggle,
  onRate,
  busy,
}: {
  med: MedicationWithStatus;
  dose: MedicationDoseStatus;
  onToggle: () => void;
  onRate: (score: number) => void;
  busy: boolean;
}) {
  const taken = !!dose.takenAt;
  const todayScore = dose.effectiveness ?? null;

  return (
    <div
      className={cn(
        "rounded-lg border p-3",
        taken ? "border-primary/30 bg-primary/5" : "border-border/70",
      )}
      data-testid={`dose-${med.id}-${dose.scheduledTime}`}
    >
      <div className="flex items-center gap-3">
        <button
          onClick={onToggle}
          disabled={busy}
          className={cn(
            "w-9 h-9 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors",
            taken
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border hover:border-primary/60",
          )}
          aria-label={taken ? "Mark dose as not taken" : "Mark dose as taken"}
          data-testid={`toggle-dose-${med.id}-${dose.scheduledTime}`}
        >
          {taken && <Check className="w-4 h-4" strokeWidth={3} />}
        </button>
        <div className="flex items-center gap-1.5 text-sm">
          <Clock className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="font-medium">
            {formatTimeLabel(dose.scheduledTime)}
          </span>
          {taken && dose.takenAt && (
            <span className="text-xs text-primary">
              · taken {format(parseISO(dose.takenAt), "p")}
            </span>
          )}
        </div>
      </div>

      <div className="mt-2.5">
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1.5">
          <span>How well is this dose working today?</span>
          {todayScore !== null && (
            <span className={cn("font-medium", ratingTone(todayScore))}>
              {todayScore}/10
            </span>
          )}
        </div>
        <RadioGroup.Root
          className="flex flex-wrap gap-1"
          value={todayScore === null ? "" : String(todayScore)}
          onValueChange={(value) => onRate(Number(value))}
          disabled={busy}
          aria-label="Effectiveness 1 to 10"
        >
          {RATING_VALUES.map((n) => {
            const selected = todayScore === n;
            return (
              <RadioGroup.Item
                key={n}
                disabled={busy}
                value={String(n)}
                aria-checked={selected}
                aria-label={`Rate ${n} out of 10`}
                data-testid={`rate-dose-${med.id}-${dose.scheduledTime}-${n}`}
                className={cn(
                  "w-7 h-7 sm:w-8 sm:h-8 text-xs font-medium rounded-md border transition-colors",
                  selected
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground",
                )}
              >
                {n}
              </RadioGroup.Item>
            );
          })}
        </RadioGroup.Root>
      </div>
    </div>
  );
}

function FormInput({
  label,
  value,
  onChange,
  placeholder,
  testId,
  containerClassName,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  testId: string;
  containerClassName?: string;
}) {
  const id = useId();
  return (
    <div className={containerClassName}>
      <label htmlFor={id} className="block text-xs text-muted-foreground mb-1">
        {label}
      </label>
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={INPUT_CLASS}
        placeholder={placeholder}
        data-testid={testId}
      />
    </div>
  );
}

function ScheduledTimesInput({
  times,
  onChange,
}: {
  times: string[];
  onChange: (times: string[]) => void;
}) {
  function setTime(idx: number, value: string) {
    const next = [...times];
    next[idx] = value;
    onChange(next);
  }
  function addTime() {
    onChange([...times, "20:00"]);
  }
  function removeTime(idx: number) {
    if (times.length <= 1) return;
    onChange(times.filter((_, i) => i !== idx));
  }

  const validTimes = normalizeTimes(times).length;

  return (
    <div className="sm:col-span-2">
      <label className="block text-xs text-muted-foreground mb-1">
        Scheduled times
      </label>
      <div className="space-y-2">
        {times.map((t, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <input
              type="time"
              aria-label={`Scheduled time ${idx + 1}`}
              value={t}
              onChange={(e) => setTime(idx, e.target.value)}
              className={cn(INPUT_CLASS, "max-w-[10rem]")}
              data-testid={`form-time-${idx}`}
            />
            <button
              onClick={() => removeTime(idx)}
              disabled={times.length <= 1}
              className="p-2 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 disabled:opacity-30 transition-colors"
              aria-label={`Remove scheduled time ${idx + 1}`}
              data-testid={`remove-time-${idx}`}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
      <button
        onClick={addTime}
        className="mt-2 flex items-center gap-1.5 text-sm text-primary hover:underline"
        data-testid="add-time"
      >
        <Plus className="w-4 h-4" /> Add another time
      </button>
      {validTimes === 0 && (
        <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1.5">
          Add at least one valid time.
        </p>
      )}
    </div>
  );
}

function MedForm({
  form,
  setForm,
  onSave,
  onCancel,
  busy,
  title,
}: {
  form: FormState;
  setForm: (f: FormState) => void;
  onSave: () => void;
  onCancel: () => void;
  busy: boolean;
  title: string;
}) {
  const validTimes = normalizeTimes(form.times).length;

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-sm">{title}</h3>
        <button
          onClick={onCancel}
          className="p-1 rounded-md text-muted-foreground hover:text-foreground"
          aria-label="Cancel"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <FormInput
          label="Name"
          value={form.name}
          onChange={(val) => setForm({ ...form, name: val })}
          placeholder="e.g. Sertraline"
          testId="form-name"
        />
        <FormInput
          label="Dosage"
          value={form.dosage}
          onChange={(val) => setForm({ ...form, dosage: val })}
          placeholder="e.g. 50mg"
          testId="form-dosage"
        />
        <ScheduledTimesInput
          times={form.times}
          onChange={(times) => setForm({ ...form, times })}
        />
        <FormInput
          label="Notes (optional)"
          value={form.notes}
          onChange={(val) => setForm({ ...form, notes: val })}
          placeholder="e.g. with food"
          testId="form-notes"
          containerClassName="sm:col-span-2"
        />
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <button
          onClick={onCancel}
          className="px-3 py-2 text-sm rounded-md text-muted-foreground hover:text-foreground hover:bg-accent"
        >
          Cancel
        </button>
        <button
          onClick={onSave}
          disabled={
            busy || !form.name.trim() || !form.dosage.trim() || validTimes === 0
          }
          className="px-3 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          data-testid="form-save"
        >
          Save
        </button>
      </div>
    </div>
  );
}
