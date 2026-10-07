import { useAuth } from "@/lib/auth";
import { useEffect } from "react";
import { useSearch } from "wouter";
import logoPoster from "@/assets/brand/logo-poster.jpg";
import { resolveReturnDestination } from "@/lib/routing";

export default function Login() {
  const { isSignedIn, isLoaded, login, error } = useAuth();
  const params = new URLSearchParams(useSearch());
  const returnTo = resolveReturnDestination(params.get("returnTo"));
  const signUpUrl = `/signup?returnTo=${encodeURIComponent(returnTo)}`;

  useEffect(() => {
    if (isLoaded && isSignedIn) {
      window.location.assign(returnTo);
    }
  }, [isLoaded, isSignedIn, returnTo]);

  if (!isLoaded || isSignedIn) return null;

  return (
    <div className="flex min-h-screen items-center justify-center gap-8 bg-background px-6 py-10">
      <img
        src={logoPoster}
        alt="Kindred Asterling — AI Coaching"
        className="hidden w-48 rounded-2xl shadow-2xl ring-1 ring-border/40 lg:block"
      />
      <div className="w-full max-w-md">
        <h1 className="mb-4 text-2xl font-serif">Sign in</h1>
        <p className="mb-6 text-muted-foreground">Continue securely with Auth0.</p>
        {error && <p role="alert" className="mb-4 text-destructive">Sign-in could not be completed. Please try again.</p>}
        <button className="w-full rounded-lg bg-primary px-4 py-3 text-primary-foreground" onClick={() => void login(returnTo, false)}>
          Sign in
        </button>
        <button className="mt-3 w-full rounded-lg border border-border px-4 py-3" onClick={() => void login(returnTo, false, "email")}>
          Email me a sign-in code
        </button>
        <a className="mt-4 block underline" href={signUpUrl}> New to Kindred? Create an account</a>
      </div>
    </div>
  );
}
