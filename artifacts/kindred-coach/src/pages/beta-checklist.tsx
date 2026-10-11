import { useCallback, useEffect, useRef, useState } from "react";
import { ClipboardCheck } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Progress } from "@/components/ui/progress";
import { QueryErrorState } from "@/components/query-error-state";
import {
  BETA_CHECKLIST,
  BETA_CHECKLIST_ITEM_IDS,
} from "@/lib/beta-checklist";

type LoadState = "loading" | "ready" | "error";

async function checklistRequest(
  getToken: () => Promise<string | null>,
  init?: RequestInit,
): Promise<string[]> {
  const token = await getToken();
  const res = await fetch("/api/beta-checklist", {
    ...init,
    credentials: "include",
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  const data = (await res.json()) as { checked?: unknown };
  return Array.isArray(data.checked)
    ? data.checked.filter((id): id is string => typeof id === "string")
    : [];
}

export default function BetaChecklist() {
  const { getToken } = useAuth();
  const [state, setState] = useState<LoadState>("loading");
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [saveError, setSaveError] = useState("");
  // Saves run one after another so the last tap always wins on the server.
  const saveQueue = useRef<Promise<unknown>>(Promise.resolve());

  const load = useCallback(() => {
    setState("loading");
    checklistRequest(getToken)
      .then((ids) => {
        setChecked(new Set(ids));
        setState("ready");
      })
      .catch(() => setState("error"));
  }, [getToken]);

  useEffect(load, [load]);

  const toggle = (itemId: string, next: boolean) => {
    setSaveError("");
    setChecked((current) => {
      const updated = new Set(current);
      if (next) updated.add(itemId);
      else updated.delete(itemId);
      return updated;
    });
    saveQueue.current = saveQueue.current.then(() =>
      checklistRequest(getToken, {
        method: "PUT",
        body: JSON.stringify({ itemId, checked: next }),
      }).catch(() => {
        setChecked((current) => {
          const reverted = new Set(current);
          if (next) reverted.delete(itemId);
          else reverted.add(itemId);
          return reverted;
        });
        setSaveError("That change didn't save. Check your connection and try again.");
      }),
    );
  };

  const done = BETA_CHECKLIST_ITEM_IDS.filter((id) => checked.has(id)).length;
  const total = BETA_CHECKLIST_ITEM_IDS.length;

  return (
    <div className="space-y-8 pb-12">
      <header className="space-y-1 pt-4">
        <h1 className="text-3xl font-serif text-foreground tracking-tight flex items-center gap-3">
          <ClipboardCheck className="w-8 h-8 text-primary" />
          Beta checklist
        </h1>
        <p className="text-muted-foreground text-lg">
          Tick each item as you try it. Your progress saves to your account.
        </p>
        <p className="text-sm text-muted-foreground">
          Found a problem? Send it to Landon on Slack with the page, what you
          did, what happened, and a screenshot if you can.
        </p>
      </header>

      {state === "error" ? (
        <QueryErrorState
          title="Checklist unavailable"
          message="Your checklist couldn't load just now."
          onRetry={load}
        />
      ) : state === "loading" ? (
        <p role="status" className="text-sm text-muted-foreground">
          Loading your checklist…
        </p>
      ) : (
        <>
          <section aria-label="Checklist progress" className="space-y-2">
            <p className="text-sm font-medium" data-testid="beta-checklist-progress">
              {done} of {total} done
            </p>
            <Progress value={total ? (done / total) * 100 : 0} />
            {saveError ? (
              <p role="alert" className="text-sm text-destructive">
                {saveError}
              </p>
            ) : null}
          </section>

          {BETA_CHECKLIST.map((group, index) => {
            const groupDone = group.items.filter((item) =>
              checked.has(item.id),
            ).length;
            return (
              <section
                key={group.id}
                aria-labelledby={`beta-group-${group.id}`}
                className="rounded-xl border border-border bg-card p-5"
              >
                <div className="mb-3 flex items-baseline justify-between gap-3">
                  <h2
                    id={`beta-group-${group.id}`}
                    className="font-medium text-foreground"
                  >
                    {index + 1}. {group.title}
                  </h2>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {groupDone}/{group.items.length}
                  </span>
                </div>
                {group.note ? (
                  <p className="mb-3 text-sm text-muted-foreground">
                    {group.note}
                  </p>
                ) : null}
                <ul className="space-y-1">
                  {group.items.map((item) => (
                    <li key={item.id}>
                      <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-md px-2 py-2 hover:bg-muted">
                        <input
                          type="checkbox"
                          className="mt-0.5 h-5 w-5 shrink-0 accent-primary"
                          checked={checked.has(item.id)}
                          onChange={(event) =>
                            toggle(item.id, event.target.checked)
                          }
                        />
                        <span
                          className={
                            checked.has(item.id)
                              ? "text-sm text-muted-foreground line-through"
                              : "text-sm text-foreground"
                          }
                        >
                          {item.label}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </>
      )}
    </div>
  );
}
