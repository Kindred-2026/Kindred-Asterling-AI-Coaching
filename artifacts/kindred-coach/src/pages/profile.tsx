import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetCurrentAuthUser,
  getGetCurrentAuthUserQueryKey,
  updateProfile,
  useGetTodayAffirmation,
  getGetTodayAffirmationQueryKey,
} from "@workspace/api-client-react";
import { useUser } from "@/lib/auth";
import {
  User,
  Save,
  Quote,
  Sparkles,
  AlertCircle,
  ShieldCheck,
} from "lucide-react";
import { Link } from "wouter";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import { QueryErrorState } from "@/components/query-error-state";

type FormState = {
  preferredName: string;
  birthday: string;
  struggles: string;
  strengths: string;
  interests: string;
  bio: string;
  motivationalQuote: string;
};

const EMPTY: FormState = {
  preferredName: "",
  birthday: "",
  struggles: "",
  strengths: "",
  interests: "",
  bio: "",
  motivationalQuote: "",
};

function safeFormatDate(s: string | null | undefined): string | null {
  if (!s) return null;
  try {
    return format(parseISO(s), "PP");
  } catch {
    return s;
  }
}

export default function Profile() {
  const qc = useQueryClient();
  const { user: authUser } = useUser();
  const { data, isLoading, isError, refetch } = useGetCurrentAuthUser({
    query: { queryKey: getGetCurrentAuthUserQueryKey() },
  });
  const { data: todayAff } = useGetTodayAffirmation({
    query: { queryKey: getGetTodayAffirmationQueryKey() },
  });

  const user = data?.user ?? null;

  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    setForm({
      preferredName: user.preferredName ?? "",
      birthday: user.birthday ?? "",
      struggles: user.struggles ?? "",
      strengths: user.strengths ?? "",
      interests: user.interests ?? "",
      bio: user.bio ?? "",
      motivationalQuote: user.motivationalQuote ?? "",
    });
  }, [user]);

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading profile…</p>;
  }
  if (isError || !user) {
    return (
      <QueryErrorState
        title="Profile unavailable"
        message="Kindred could not load your profile. Check your connection and try again."
        onRetry={() => void refetch()}
      />
    );
  }

  const displayName =
    form.preferredName.trim() ||
    user.preferredName ||
    user.firstName ||
    user.email ||
    "You";
  const initials = (displayName.match(/\b\w/g) ?? [])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  function setField<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await updateProfile({
        preferredName: form.preferredName.trim() || null,
        birthday: form.birthday.trim() || null,
        struggles: form.struggles.trim() || null,
        strengths: form.strengths.trim() || null,
        interests: form.interests.trim() || null,
        bio: form.bio.trim() || null,
        motivationalQuote: form.motivationalQuote.trim() || null,
      });
      await qc.invalidateQueries({ queryKey: getGetCurrentAuthUserQueryKey() });
      setSavedAt(Date.now());
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Couldn't save your changes. Please try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  const dirty =
    form.preferredName !== (user.preferredName ?? "") ||
    form.birthday !== (user.birthday ?? "") ||
    form.struggles !== (user.struggles ?? "") ||
    form.strengths !== (user.strengths ?? "") ||
    form.interests !== (user.interests ?? "") ||
    form.bio !== (user.bio ?? "") ||
    form.motivationalQuote !== (user.motivationalQuote ?? "");

  const fieldClass =
    "w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30";

  return (
    <div className="space-y-6 pb-12">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-serif text-primary tracking-tight">
            Profile
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Keep this up to date — Kindred uses what you share here to make your
            coaching chats feel more like you.
          </p>
        </div>
        <Link
          href="/app/account"
          className="flex min-h-11 shrink-0 items-center gap-2 rounded-lg border border-border px-3 text-xs font-medium text-muted-foreground hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          data-testid="you-account-link"
        >
          <ShieldCheck className="w-3.5 h-3.5" strokeWidth={2} />
          Account security
        </Link>
      </header>

      {/* Identity card */}
      <section className="rounded-lg border border-border bg-card p-5">
        <div className="flex items-center gap-4">
          {user.profileImageUrl ? (
            <img
              src={user.profileImageUrl}
              alt=""
              className="w-16 h-16 rounded-full object-cover border border-border"
            />
          ) : (
            <div className="w-16 h-16 rounded-full bg-primary/15 flex items-center justify-center text-primary text-xl font-semibold">
              {initials || <User className="w-7 h-7" />}
            </div>
          )}
          <div className="min-w-0">
            <p className="text-lg font-medium truncate">{displayName}</p>
            {user.email && (
              <p className="text-sm text-muted-foreground truncate">
                {user.email}
              </p>
            )}
            {safeFormatDate(user.birthday) && (
              <p className="text-xs text-muted-foreground mt-0.5">
                Born {safeFormatDate(user.birthday)}
              </p>
            )}
          </div>
        </div>

        {form.motivationalQuote.trim() ? (
          <blockquote className="mt-5 pl-4 border-l-2 border-primary/40 text-sm italic text-foreground/90">
            <Quote className="inline w-3.5 h-3.5 mr-1 text-primary/60" />
            {form.motivationalQuote}
          </blockquote>
        ) : todayAff?.text ? (
          <div className="mt-5 rounded-md bg-primary/5 px-4 py-3 text-sm">
            <div className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-primary/80 mb-1">
              <Sparkles className="w-3.5 h-3.5" />
              Today's affirmation
            </div>
            <p className="italic text-foreground/90">{todayAff.text}</p>
          </div>
        ) : null}

        <div className="mt-5 border-t border-border pt-4">
          <a
            href="https://kindred-asterling-ai.helcim.app/login"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-primary underline underline-offset-2 hover:text-primary/80"
          >
            Manage billing & subscription
          </a>
        </div>
      </section>

      {/* Editable fields */}
      <section className="rounded-lg border border-border bg-card p-5 space-y-5">
        <div>
          <h2 className="text-sm font-medium">Personal details</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            How you'd like to be addressed and remembered.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-muted-foreground mb-1">
              Preferred name
            </label>
            <input
              value={form.preferredName}
              onChange={(e) => setField("preferredName", e.target.value)}
              className={fieldClass}
              placeholder={authUser?.firstName ?? "What should I call you?"}
              data-testid="profile-preferredName"
            />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">
              Birthday
            </label>
            <input
              type="date"
              value={form.birthday}
              onChange={(e) => setField("birthday", e.target.value)}
              className={fieldClass}
              data-testid="profile-birthday"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs text-muted-foreground mb-1">
            About you (bio)
          </label>
          <textarea
            value={form.bio}
            onChange={(e) => setField("bio", e.target.value)}
            rows={4}
            className={cn(fieldClass, "resize-y leading-relaxed")}
            placeholder="A few sentences about who you are, where you're at in life, or anything you'd want Kindred to keep in mind."
            data-testid="profile-bio"
          />
        </div>

        <div>
          <label className="block text-xs text-muted-foreground mb-1">
            Motivational quote
          </label>
          <input
            value={form.motivationalQuote}
            onChange={(e) => setField("motivationalQuote", e.target.value)}
            className={fieldClass}
            placeholder="A line that grounds you."
            data-testid="profile-quote"
          />
          <p className="text-[11px] text-muted-foreground/80 mt-1">
            Shown at the top of your profile and referenced occasionally in
            chat.
          </p>
        </div>
      </section>

      {/* Reflection fields */}
      <section className="rounded-lg border border-border bg-card p-5 space-y-5">
        <div>
          <h2 className="text-sm font-medium">What Kindred should know</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            These shape how the AI talks with you. Update them anytime your
            situation changes.
          </p>
        </div>

        <div>
          <label className="block text-xs text-muted-foreground mb-1">
            What you're working through
          </label>
          <textarea
            value={form.struggles}
            onChange={(e) => setField("struggles", e.target.value)}
            rows={3}
            className={cn(fieldClass, "resize-y leading-relaxed")}
            placeholder="e.g. anxious mornings, healing from burnout, a tough chapter at work."
            data-testid="profile-struggles"
          />
        </div>

        <div>
          <label className="block text-xs text-muted-foreground mb-1">
            Your strengths
          </label>
          <textarea
            value={form.strengths}
            onChange={(e) => setField("strengths", e.target.value)}
            rows={2}
            className={cn(fieldClass, "resize-y leading-relaxed")}
            placeholder="e.g. patient with people, curious, dependable."
            data-testid="profile-strengths"
          />
        </div>

        <div>
          <label className="block text-xs text-muted-foreground mb-1">
            Interests
          </label>
          <textarea
            value={form.interests}
            onChange={(e) => setField("interests", e.target.value)}
            rows={2}
            className={cn(fieldClass, "resize-y leading-relaxed")}
            placeholder="e.g. hiking, science fiction, cooking new things on Sundays."
            data-testid="profile-interests"
          />
        </div>
      </section>

      {/* Save bar */}
      <div className="sticky bottom-0 flex items-center justify-between gap-3 rounded-lg border border-border bg-card/95 backdrop-blur p-3">
        <p
          className={cn(
            "text-xs",
            error ? "text-destructive" : "text-muted-foreground",
          )}
          data-testid="profile-save-status"
        >
          {error
            ? error
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
          data-testid="profile-save"
        >
          <Save className="w-4 h-4" />
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </div>
  );
}
