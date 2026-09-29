import {
  Check,
  ShieldCheck,
  Lock,
  HeartHandshake,
  Sparkles,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { CheckoutButton } from "@/components/checkout-button";

const YEARLY_FEATURES = [
  "Full access to Kindred, your AI companion",
  "Daily Begin / Throughout / Close rhythm",
  "Medication & behavior tracking",
  "Self-assessments and progress view",
  "Journal, profile, and customization",
];

const LIFETIME_FEATURES = [
  "Everything in the yearly plan",
  "One payment, lifetime access",
  "All future features included",
  "Support the pilot directly",
];

const TRUST = [
  { icon: Lock, label: "Private by design — your reflections stay yours" },
  { icon: ShieldCheck, label: "Secure checkout with end-to-end encryption" },
  { icon: HeartHandshake, label: "A companion to care, never a replacement" },
];

export default function Pricing() {
  return (
    <div>
      <section className="relative isolate overflow-hidden brand-night text-foreground">
        <div className="pointer-events-none absolute -right-32 -top-40 h-[30rem] w-[30rem] rounded-full bg-secondary/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-48 left-1/4 h-80 w-80 rounded-full bg-background/10 blur-3xl" />
        <div className="relative mx-auto max-w-4xl px-5 py-20 text-center md:px-8 md:py-28">
          <p className="flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-secondary">
            <Sparkles className="h-4 w-4" /> One clear choice
          </p>
          <h1 className="mt-5 font-serif text-5xl font-medium leading-[1.04] tracking-[-0.04em] text-balance md:text-6xl">
            Simple, honest pricing.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-base leading-8 text-foreground/75 md:text-lg">
            Choose the plan that fits. You'll sign in first, then complete a
            secure checkout — access unlocks automatically once payment clears.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-5 py-16 md:px-8 md:py-24">
        <div className="mb-10 max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            Membership options
          </p>
          <h2 className="mt-3 font-serif text-3xl font-medium tracking-tight md:text-4xl">
            Choose the pace that feels right.
          </h2>
        </div>
        <div className="grid gap-5 md:grid-cols-2">
          {/* Yearly */}
          <Card className="flex h-full flex-col rounded-2xl border-border/80 bg-card/80 shadow-sm">
            <CardHeader className="p-7 pb-5">
              <CardTitle className="font-serif text-2xl">Yearly</CardTitle>
              <CardDescription>For the ongoing work.</CardDescription>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="font-serif text-4xl font-medium text-foreground">
                  $49.99
                </span>
                <span className="text-muted-foreground">/ year</span>
              </div>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col px-7 pb-7">
              <ul className="flex-1 space-y-3">
                {YEARLY_FEATURES.map((f) => (
                  <li key={f} className="flex gap-3 text-sm text-foreground">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span className="text-muted-foreground">{f}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-6">
                <CheckoutButton
                  planType="yearly"
                  label="Start Yearly Plan"
                  variant="outline"
                />
              </div>
            </CardContent>
          </Card>

          {/* Lifetime */}
          <Card className="relative flex h-full flex-col overflow-hidden rounded-2xl border-primary/30 bg-card shadow-md ring-1 ring-primary/20">
            <div className="absolute right-5 top-5 rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-secondary-foreground">
              Best value
            </div>
            <CardHeader className="p-7 pb-5">
              <CardTitle className="font-serif text-2xl">Lifetime</CardTitle>
              <CardDescription>One payment. Forever.</CardDescription>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="font-serif text-4xl font-medium text-foreground">
                  $79.99
                </span>
                <span className="text-muted-foreground">once</span>
              </div>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col px-7 pb-7">
              <ul className="flex-1 space-y-3">
                {LIFETIME_FEATURES.map((f) => (
                  <li key={f} className="flex gap-3 text-sm text-foreground">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span className="text-muted-foreground">{f}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-6">
                <CheckoutButton
                  planType="lifetime"
                  label="Get Lifetime Access"
                />
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="bg-muted/55">
        <div className="mx-auto max-w-5xl px-5 py-16 md:px-8 md:py-20">
          <div className="grid gap-5 sm:grid-cols-3">
            {TRUST.map((t) => (
              <div
                key={t.label}
                className="flex items-start gap-3 rounded-2xl border border-border bg-card p-5"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary/15 text-secondary">
                  <t.icon className="h-4 w-4" />
                </span>
                <span className="text-sm leading-snug text-muted-foreground">
                  {t.label}
                </span>
              </div>
            ))}
          </div>

          <div className="mt-8 text-center">
            <p className="text-muted-foreground text-sm">
              Already have a subscription?{" "}
              <a
                href="https://kindred-asterling-ai.helcim.app/login"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-primary underline underline-offset-2 hover:text-primary/80"
              >
                Manage your billing
              </a>
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
