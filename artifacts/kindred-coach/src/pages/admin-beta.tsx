import { FormEvent, useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { Search, UserCheck, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface BetaUser {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  emailVerifiedAt: string | null;
  createdAt: string;
}

interface BetaGrant {
  id: string;
  userId: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  grantedAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  kind: "open" | "reserved";
}

interface BetaPool {
  total: number;
  taken: number;
  left: number;
}

interface BetaSpots {
  open: BetaPool;
  reserved: BetaPool;
}

async function api<T>(
  path: string,
  getToken: () => Promise<string | null>,
  init?: RequestInit,
): Promise<T> {
  const token = await getToken();
  const response = await fetch(path, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok)
    throw new Error(data.error ?? `Request failed (${response.status})`);
  return data;
}

export default function AdminBeta() {
  const { getToken } = useAuth();
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<BetaUser[]>([]);
  const [grants, setGrants] = useState<BetaGrant[]>([]);
  const [spots, setSpots] = useState<BetaSpots | null>(null);
  const [opensAt, setOpensAt] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

  const loadGrants = useCallback(async () => {
    const data = await api<{
      grants: BetaGrant[];
      spots: BetaSpots;
      opensAt: string | null;
    }>("/api/admin/beta/grants", getToken);
    setGrants(data.grants);
    setSpots(data.spots);
    setOpensAt(data.opensAt);
  }, [getToken]);

  useEffect(() => {
    loadGrants().catch((error: Error) => setMessage(error.message));
  }, [loadGrants]);

  async function search(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    if (query.trim().length < 2) {
      setUsers([]);
      return;
    }
    try {
      const data = await api<{ users: BetaUser[] }>(
        `/api/admin/users?q=${encodeURIComponent(query.trim())}`,
        getToken,
      );
      setUsers(data.users);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Search failed");
    }
  }

  async function grant(userId: string) {
    setBusyUserId(userId);
    setMessage(null);
    try {
      await api("/api/admin/beta/grant", getToken, {
        method: "POST",
        body: JSON.stringify({ userId }),
      });
      setMessage("Beta access granted.");
      await loadGrants();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Grant failed");
    } finally {
      setBusyUserId(null);
    }
  }

  async function revoke(userId: string) {
    setBusyUserId(userId);
    setMessage(null);
    try {
      await api("/api/admin/beta/revoke", getToken, {
        method: "POST",
        body: JSON.stringify({ userId }),
      });
      setMessage("Beta access revoked.");
      await loadGrants();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Revoke failed");
    } finally {
      setBusyUserId(null);
    }
  }

  const activeUserIds = new Set(
    grants
      .filter(
        (grant) =>
          !grant.revokedAt &&
          (!grant.expiresAt || new Date(grant.expiresAt) > new Date()),
      )
      .map((grant) => grant.userId),
  );

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Beta access</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Anyone with a verified email can claim an open spot. Granting access
          here uses a spot reserved for friends, so grant it only after they
          have verified their email.
        </p>
        {opensAt && new Date(opensAt) > new Date() ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Open spots unlock{" "}
            {new Date(opensAt).toLocaleString(undefined, {
              dateStyle: "long",
              timeStyle: "short",
            })}
            .
          </p>
        ) : null}
      </header>

      {spots ? (
        <dl className="grid grid-cols-2 gap-3">
          <div className="rounded-md border px-4 py-3">
            <dt className="text-xs text-muted-foreground">Open spots</dt>
            <dd className="text-sm font-medium">
              {spots.open.taken} of {spots.open.total} claimed
            </dd>
          </div>
          <div className="rounded-md border px-4 py-3">
            <dt className="text-xs text-muted-foreground">
              Reserved for friends
            </dt>
            <dd className="text-sm font-medium">
              {spots.reserved.taken} of {spots.reserved.total} used
            </dd>
          </div>
        </dl>
      ) : null}

      <form onSubmit={search} className="flex gap-2">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by email"
          type="search"
        />
        <Button type="submit" aria-label="Search users">
          <Search className="h-4 w-4" />
          Search
        </Button>
      </form>

      {message ? (
        <p className="text-sm text-muted-foreground">{message}</p>
      ) : null}

      {users.length > 0 ? (
        <section>
          <h2 className="mb-3 text-sm font-medium">Search results</h2>
          <div className="divide-y rounded-md border">
            {users.map((user) => {
              const active = activeUserIds.has(user.id);
              return (
                <div
                  key={user.id}
                  className="flex items-center justify-between gap-4 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {user.email ?? "No email"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {user.emailVerifiedAt ? "Verified" : "Not verified"}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant={active ? "outline" : "default"}
                    disabled={
                      busyUserId === user.id ||
                      (!active && !user.emailVerifiedAt)
                    }
                    onClick={() => (active ? revoke(user.id) : grant(user.id))}
                  >
                    {active ? (
                      <UserX className="h-4 w-4" />
                    ) : (
                      <UserCheck className="h-4 w-4" />
                    )}
                    {active ? "Revoke" : "Grant"}
                  </Button>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      <section>
        <h2 className="mb-3 text-sm font-medium">Grant history</h2>
        <div className="divide-y rounded-md border">
          {grants.length === 0 ? (
            <p className="px-4 py-5 text-sm text-muted-foreground">
              No beta grants yet.
            </p>
          ) : (
            grants.map((grant) => (
              <div key={grant.id} className="px-4 py-3">
                <div className="flex items-center justify-between gap-4">
                  <p className="truncate text-sm font-medium">
                    {grant.email ?? grant.userId}
                  </p>
                  <span className="text-xs text-muted-foreground">
                    {grant.kind === "reserved" ? "Reserved" : "Open spot"} ·{" "}
                    {grant.revokedAt
                      ? "Revoked"
                      : grant.expiresAt &&
                          new Date(grant.expiresAt) <= new Date()
                        ? "Expired"
                        : "Active"}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Granted {new Date(grant.grantedAt).toLocaleDateString()}
                </p>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
