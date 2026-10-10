import { useState } from "react";
import { useAuth } from "@/lib/auth";

async function authorizedFetch(
  path: string,
  getToken: () => Promise<string | null>,
  init?: RequestInit,
) {
  const token = await getToken();
  const res = await fetch(path, {
    ...init,
    credentials: "include",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return res;
}

export function AccountData() {
  const { getToken, signOut } = useAuth();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const run = async (operation: () => Promise<void>, failure: string) => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await operation();
    } catch {
      setError(failure);
    } finally {
      setBusy(false);
    }
  };

  const download = () =>
    run(async () => {
      const res = await authorizedFetch("/api/account/export", getToken);
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = "kindred-account-export.json";
      a.click();
      URL.revokeObjectURL(url);
      setMessage("Your data download has started.");
    }, "Your data could not be downloaded. Try again, or contact Kindred support.");

  const remove = () =>
    run(async () => {
      await authorizedFetch("/api/account", getToken, { method: "DELETE" });
      setConfirming(false);
      setMessage("Your Kindred account has been deleted. Signing you out…");
      await signOut();
    }, "Your account could not be deleted. Nothing was removed. Try again, or contact Kindred support.");

  return (
    <section className="mt-10 max-w-xl space-y-5" aria-label="Your data">
      <div>
        <h2 className="text-lg font-serif text-primary">Your data</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Download a copy of everything Kindred stores about you, or delete
          your account and all of its data.
        </p>
      </div>
      {error && (
        <p role="alert" className="rounded-lg border border-destructive p-4">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      <div className="flex flex-wrap gap-3">
        <button
          className="rounded-lg border border-border px-4 py-2"
          disabled={busy}
          onClick={() => void download()}
        >
          Download my data
        </button>
        {!confirming && (
          <button
            className="rounded-lg border border-destructive px-4 py-2 text-destructive"
            disabled={busy}
            onClick={() => setConfirming(true)}
          >
            Delete my account
          </button>
        )}
      </div>
      {confirming && (
        <div
          className="space-y-3 rounded-lg border border-destructive p-4"
          role="group"
          aria-label="Confirm account deletion"
        >
          <p>
            Delete your Kindred account? Your check-ins, chats, habits,
            medications, reminders and reports are removed permanently and
            cannot be recovered. Download your data first if you want a copy.
          </p>
          <button
            className="mr-4 rounded-lg bg-destructive px-4 py-2 text-destructive-foreground"
            disabled={busy}
            onClick={() => void remove()}
          >
            Permanently delete
          </button>
          <button
            className="underline"
            disabled={busy}
            onClick={() => setConfirming(false)}
          >
            Cancel
          </button>
        </div>
      )}
    </section>
  );
}
