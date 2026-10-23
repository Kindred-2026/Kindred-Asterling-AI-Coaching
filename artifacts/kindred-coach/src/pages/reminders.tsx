import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetCurrentAuthUser,
  getGetCurrentAuthUserQueryKey,
  useGetReminderSettings,
  getGetReminderSettingsQueryKey,
  updateReminderSettings,
} from "@workspace/api-client-react";
import {
  Bell,
  Save,
  Sunrise,
  Sunset,
  Pill,
  Smartphone,
  Mail,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { QueryErrorState } from "@/components/query-error-state";

type FormState = {
  phone: string;
  timezone: string;
  morningEnabled: boolean;
  morningTime: string;
  medicationEnabled: boolean;
  eveningEnabled: boolean;
  eveningTime: string;
  smsEnabled: boolean;
  emailEnabled: boolean;
};

const EMPTY: FormState = {
  phone: "",
  timezone: "",
  morningEnabled: false,
  morningTime: "08:00",
  medicationEnabled: false,
  eveningEnabled: false,
  eveningTime: "21:00",
  smsEnabled: false,
  emailEnabled: true,
};

function detectTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  } catch {
    return "";
  }
}

function Toggle({
  checked,
  onChange,
  label,
  testId,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  testId?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      data-testid={testId}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
        checked ? "bg-primary" : "bg-muted-foreground/30",
      )}
    >
      <span
        className={cn(
          "inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform",
          checked ? "translate-x-5" : "translate-x-0.5",
        )}
      />
    </button>
  );
}

export default function Reminders() {
  const qc = useQueryClient();
  const {
    data: authData,
    isLoading: userLoading,
    isError: userError,
    refetch: refetchUser,
  } = useGetCurrentAuthUser({
    query: { queryKey: getGetCurrentAuthUserQueryKey() },
  });
  const {
    data: settings,
    isLoading: settingsLoading,
    isError: settingsError,
    refetch: refetchSettings,
  } = useGetReminderSettings({
    query: { queryKey: getGetReminderSettingsQueryKey() },
  });

  const user = authData?.user ?? null;

  const [form, setForm] = useState<FormState>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Hydrate the form once both the user and reminder settings are available.
  useEffect(() => {
    if (!user || !settings || loaded) return;
    setForm({
      phone: user.phone ?? "",
      timezone: user.timezone || detectTimezone(),
      morningEnabled: settings.morningEnabled,
      morningTime: settings.morningTime,
      medicationEnabled: settings.medicationEnabled,
      eveningEnabled: settings.eveningEnabled,
      eveningTime: settings.eveningTime,
      smsEnabled: settings.smsEnabled,
      emailEnabled: settings.emailEnabled,
    });
    setLoaded(true);
  }, [user, settings, loaded]);

  if (userLoading || settingsLoading) {
    return <p className="text-sm text-muted-foreground">Loading reminders…</p>;
  }
  if (userError || settingsError || !user || !settings) {
    return (
      <QueryErrorState
        title="Reminders unavailable"
        message="Kindred could not load your reminder settings. Your existing settings have not been changed."
        onRetry={() => {
          void Promise.all([refetchUser(), refetchSettings()]);
        }}
      />
    );
  }

  function setField<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      // Single atomic call: phone/timezone (saved on the profile) and the
      // reminder prefs are persisted together server-side, so there's never a
      // partial save where one sticks and the other doesn't.
      await updateReminderSettings({
        morningEnabled: form.morningEnabled,
        morningTime: form.morningTime,
        medicationEnabled: form.medicationEnabled,
        eveningEnabled: form.eveningEnabled,
        eveningTime: form.eveningTime,
        smsEnabled: form.smsEnabled,
        emailEnabled: form.emailEnabled,
        phone: form.phone.trim() || null,
        timezone: form.timezone.trim() || null,
      });
      await Promise.all([
        qc.invalidateQueries({ queryKey: getGetCurrentAuthUserQueryKey() }),
        qc.invalidateQueries({ queryKey: getGetReminderSettingsQueryKey() }),
      ]);
      setSavedAt(Date.now());
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Couldn't save your reminders. Please try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  const dirty =
    loaded &&
    (form.phone !== (user.phone ?? "") ||
      // Compare against what the form was hydrated with, including the
      // detected fallback, so a fresh load isn't "unsaved".
      form.timezone !== (user.timezone || detectTimezone()) ||
      form.morningEnabled !== settings.morningEnabled ||
      form.morningTime !== settings.morningTime ||
      form.medicationEnabled !== settings.medicationEnabled ||
      form.eveningEnabled !== settings.eveningEnabled ||
      form.eveningTime !== settings.eveningTime ||
      form.smsEnabled !== settings.smsEnabled ||
      form.emailEnabled !== settings.emailEnabled);

  const fieldClass =
    "w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30";

  const smsNeedsPhone = form.smsEnabled && !form.phone.trim();
  const noChannel = !form.smsEnabled && !form.emailEnabled;

  return (
    <div className="space-y-6 pb-12">
      <header>
        <h1 className="text-2xl font-serif text-primary tracking-tight">
          Reminders
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Let Kindred nudge you at the right moments — by text, email, or both.
        </p>
      </header>

      {/* How you'd like to hear from Kindred */}
      <section className="rounded-lg border border-border bg-card p-5 space-y-5">
        <div>
          <h2 className="text-sm font-medium">How should Kindred reach you?</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Pick one or both. Reminders go out at the times you set below, in
            your local time.
          </p>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <Mail className="w-4 h-4 text-muted-foreground" />
              <div>
                <p className="text-sm">Email</p>
                <p className="text-[11px] text-muted-foreground">
                  Sent to {user.email ?? "your account email"}
                </p>
              </div>
            </div>
            <Toggle
              checked={form.emailEnabled}
              onChange={(v) => setField("emailEnabled", v)}
              label="Email reminders"
              testId="reminders-email-toggle"
            />
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <Smartphone className="w-4 h-4 text-muted-foreground" />
              <div>
                <p className="text-sm">Text message</p>
                <p className="text-[11px] text-muted-foreground">
                  Sent to your phone number below
                </p>
              </div>
            </div>
            <Toggle
              checked={form.smsEnabled}
              onChange={(v) => setField("smsEnabled", v)}
              label="Text reminders"
              testId="reminders-sms-toggle"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs text-muted-foreground mb-1">
            Phone number{" "}
            {form.smsEnabled && (
              <span className="text-primary">(needed for texts)</span>
            )}
          </label>
          <input
            type="tel"
            value={form.phone}
            onChange={(e) => setField("phone", e.target.value)}
            className={fieldClass}
            placeholder="+1 555 123 4567"
            data-testid="reminders-phone"
          />
          {smsNeedsPhone && (
            <p className="text-[11px] text-destructive mt-1">
              Add a phone number to receive text reminders.
            </p>
          )}
        </div>

        <div>
          <label className="block text-xs text-muted-foreground mb-1">
            Your timezone
          </label>
          <input
            value={form.timezone}
            onChange={(e) => setField("timezone", e.target.value)}
            className={fieldClass}
            placeholder="e.g. America/New_York"
            data-testid="reminders-timezone"
          />
          <p className="text-[11px] text-muted-foreground/80 mt-1">
            Auto-detected from your device. Reminder times use this.
          </p>
        </div>
      </section>

      {/* What to be reminded about */}
      <section className="rounded-lg border border-border bg-card p-5 space-y-5">
        <div>
          <h2 className="text-sm font-medium">
            What should Kindred remind you about?
          </h2>
        </div>

        {/* Morning */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-2.5">
            <Sunrise className="w-4 h-4 text-muted-foreground mt-0.5" />
            <div>
              <p className="text-sm">Morning check-in</p>
              <p className="text-[11px] text-muted-foreground">
                Start the day with a mental-load check-in.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {form.morningEnabled && (
              <input
                type="time"
                value={form.morningTime}
                onChange={(e) => setField("morningTime", e.target.value)}
                className="rounded-md border border-border bg-background px-2 py-1 text-sm"
                data-testid="reminders-morning-time"
              />
            )}
            <Toggle
              checked={form.morningEnabled}
              onChange={(v) => setField("morningEnabled", v)}
              label="Morning reminder"
              testId="reminders-morning-toggle"
            />
          </div>
        </div>

        {/* Medication */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-2.5">
            <Pill className="w-4 h-4 text-muted-foreground mt-0.5" />
            <div>
              <p className="text-sm">Medication doses</p>
              <p className="text-[11px] text-muted-foreground">
                Reminds you at each dose time from your Medications schedule.
              </p>
            </div>
          </div>
          <Toggle
            checked={form.medicationEnabled}
            onChange={(v) => setField("medicationEnabled", v)}
            label="Medication reminders"
            testId="reminders-medication-toggle"
          />
        </div>

        {/* Evening */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-2.5">
            <Sunset className="w-4 h-4 text-muted-foreground mt-0.5" />
            <div>
              <p className="text-sm">Evening reflection</p>
              <p className="text-[11px] text-muted-foreground">
                Wind down and reflect before bed.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {form.eveningEnabled && (
              <input
                type="time"
                value={form.eveningTime}
                onChange={(e) => setField("eveningTime", e.target.value)}
                className="rounded-md border border-border bg-background px-2 py-1 text-sm"
                data-testid="reminders-evening-time"
              />
            )}
            <Toggle
              checked={form.eveningEnabled}
              onChange={(v) => setField("eveningEnabled", v)}
              label="Evening reminder"
              testId="reminders-evening-toggle"
            />
          </div>
        </div>
      </section>

      {/* Save bar */}
      <div className="sticky bottom-0 flex items-center justify-between gap-3 rounded-lg border border-border bg-card/95 backdrop-blur p-3">
        <p
          className={cn(
            "text-xs",
            error ? "text-destructive" : "text-muted-foreground",
          )}
          data-testid="reminders-save-status"
        >
          {error
            ? error
            : noChannel
              ? "Turn on text or email to receive reminders."
              : dirty
                ? "You have unsaved changes."
                : savedAt
                  ? "All changes saved."
                  : "Up to date."}
        </p>
        <button
          onClick={handleSave}
          disabled={saving || !dirty}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          data-testid="reminders-save"
        >
          {saving ? (
            <Bell className="w-4 h-4 animate-pulse" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          {saving ? "Saving…" : "Save reminders"}
        </button>
      </div>
    </div>
  );
}
