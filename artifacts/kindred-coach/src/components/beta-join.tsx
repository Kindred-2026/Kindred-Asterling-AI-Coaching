import { type ReactNode, useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";

type BetaState = "open" | "full" | "not_open";

interface BetaStatus {
  state: BetaState;
  opensAt: string | null;
  spotsLeft: number;
  emailVerified: boolean;
}

async function betaRequest(
  path: string,
  getToken: () => Promise<string | null>,
  init?: RequestInit,
): Promise<{ ok: boolean; body: Record<string, unknown> }> {
  const token = await getToken();
  const res = await fetch(path, {
    ...init,
    credentials: "include",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok, body };
}

const isBetaState = (value: unknown): value is BetaState =>
  value === "open" || value === "full" || value === "not_open";

function formatOpensAt(opensAt: string | null): string {
  if (!opensAt) return "soon";
  return new Date(opensAt).toLocaleString(undefined, {
    dateStyle: "long",
    timeStyle: "short",
  });
}

// Shown to signed-in people without access. Kindred's beta is first come,
// first served, so anyone with a verified email can claim an open spot here.
export function BetaJoin({
  onJoined,
  onSignOut,
}: {
  onJoined: () => void;
  onSignOut: () => void;
}) {
  const { getToken } = useAuth();
  const [status, setStatus] = useState<BetaStatus | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState("");

  const load = useCallback(() => {
    setLoadFailed(false);
    betaRequest("/api/beta/status", getToken)
      .then(({ ok, body }) => {
        if (!ok || !isBetaState(body.state)) throw new Error("Unavailable");
        setStatus(body as unknown as BetaStatus);
      })
      .catch(() => setLoadFailed(true));
  }, [getToken]);

  useEffect(load, [load]);

  const join = async () => {
    setJoining(true);
    setJoinError("");
    try {
      const { ok, body } = await betaRequest("/api/beta/join", getToken, {
        method: "POST",
      });
      if (ok) {
        onJoined();
        return;
      }
      if (isBetaState(body.state)) {
        setStatus((current) =>
          current
            ? { ...current, state: body.state as BetaState, spotsLeft: 0 }
            : current,
        );
      } else {
        setJoinError(
          typeof body.error === "string"
            ? body.error
            : "That didn't work. Try again.",
        );
      }
    } catch {
      setJoinError("That didn't work. Check your connection and try again.");
    }
    setJoining(false);
  };

  let title: string;
  let body: string;
  let action: ReactNode = null;
  if (loadFailed) {
    title = "We couldn't check the beta";
    body = "Something went wrong while checking for open beta spots.";
    action = (
      <Button variant="outline" onClick={load}>
        Try again
      </Button>
    );
  } else if (!status) {
    return (
      <p role="status" className="p-8">
        Checking for beta spots…
      </p>
    );
  } else if (!status.emailVerified) {
    title = "Verify your email to join the beta";
    body =
      "Open the link we emailed you, then sign out and sign back in to claim a beta spot.";
  } else if (status.state === "not_open") {
    title = "The Kindred beta opens soon";
    body = `Beta spots open on ${formatOpensAt(status.opensAt)}, first come, first served. Come back then to claim one.`;
    action = (
      <Button variant="outline" onClick={load}>
        Check again
      </Button>
    );
  } else if (status.state === "full") {
    title = "The Kindred beta is full";
    body =
      "Every beta spot has been claimed. Thanks for signing up. If the Kindred team saved you a spot, ask them to turn on access for the email you signed in with.";
  } else {
    title = "Join the Kindred beta";
    body = `Beta spots are first come, first served. ${status.spotsLeft} ${
      status.spotsLeft === 1 ? "spot is" : "spots are"
    } left.`;
    action = (
      <Button onClick={() => void join()} disabled={joining}>
        {joining ? "Joining…" : "Join the beta"}
      </Button>
    );
  }

  return (
    <main className="mx-auto max-w-lg space-y-4 p-8" role="alert">
      <h1 className="text-2xl font-serif">{title}</h1>
      <p>{body}</p>
      {joinError ? <p className="text-sm text-destructive">{joinError}</p> : null}
      {action}
      <div>
        <button className="underline" onClick={onSignOut}>
          Sign out
        </button>
      </div>
    </main>
  );
}
