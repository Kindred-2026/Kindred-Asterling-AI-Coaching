import { Link } from "wouter";
import {
  ArrowRight,
  Brain,
  CalendarCheck,
  HeartHandshake,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  Sunrise,
  Sunset,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CONFIGURED_SOCIAL_LINKS } from "@/config/social-links";

const RHYTHM = [
  {
    icon: Sunrise,
    title: "Begin with intention",
    body: "Track mood, sleep quality, and cognitive load before the day builds momentum.",
  },
  {
    icon: MessageCircle,
    title: "Reflect in real time",
    body: "Deconstruct recurring patterns, rehearse alternative responses, or organize thoughts for upcoming clinical sessions.",
  },
  {
    icon: Sunset,
    title: "Close with perspective",
    body: "Acknowledge daily progress, evaluate stress points, and set a manageable tone for tomorrow.",
  },
];

const BENEFITS = [
  {
    icon: Brain,
    title: "Recognize patterns",
    body: "Synthesize daily reflections, habits, and check-ins into a unified behavioral narrative.",
  },
  {
    icon: CalendarCheck,
    title: "Prepare for appointments",
    body: "Track meaningful shifts between sessions to maximize time with your care team.",
  },
  {
    icon: HeartHandshake,
    title: "Reinforce human care",
    body: "Deepen self-awareness between visits while maintaining appropriate clinical boundaries.",
  },
];

export default function Landing() {
  return (
    <div>
      <section className="relative isolate overflow-hidden brand-night text-foreground">
        <div className="pointer-events-none absolute -right-32 -top-40 h-[30rem] w-[30rem] rounded-full bg-secondary/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-48 left-1/3 h-80 w-80 rounded-full bg-background/10 blur-3xl" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-5 py-20 md:px-8 md:py-28 lg:grid-cols-[1.15fr_0.75fr] lg:py-32">
          <div>
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-secondary">
              <Sparkles className="h-4 w-4" /> Private AI coaching for daily
              life
            </p>
            <h1 className="mt-5 max-w-3xl font-serif text-5xl font-medium leading-[1.02] tracking-[-0.04em] text-balance md:text-6xl lg:text-7xl">
              A steadier way to understand your patterns.
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-8 text-foreground/75 md:text-lg">
              Kindred Asterling is a private AI companion for daily reflection,
              habit tracking, and honest dialogue—supporting you in the spaces
              between human care.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button
                asChild
                size="lg"
                className="bg-secondary text-secondary-foreground hover:bg-secondary/90"
              >
                <Link href="/pricing">
                  Explore membership <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="border-foreground/30 bg-transparent text-foreground hover:bg-foreground/10 hover:text-foreground"
              >
                <Link href="/about">See how Kindred works</Link>
              </Button>
            </div>
            <div className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-xs text-foreground/65">
              <span className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-secondary" /> Private by
                design
              </span>
              <span className="flex items-center gap-2">
                <HeartHandshake className="h-4 w-4 text-secondary" />{" "}
                Complements human care
              </span>
            </div>
          </div>

          <aside className="rounded-[1.5rem] border border-foreground/15 bg-foreground/[0.07] p-6 shadow-2xl backdrop-blur md:p-8">
            <div className="flex items-center gap-2 border-b border-foreground/15 pb-5 text-xs font-semibold uppercase tracking-[0.14em] text-secondary">
              <span className="h-2 w-2 rounded-full bg-secondary ring-4 ring-secondary/15" />
              A moment with Kindred
            </div>
            <blockquote className="my-7 font-serif text-2xl leading-relaxed text-foreground">
              “You do not have to solve the whole week tonight. What would make
              the next hour feel more manageable?”
            </blockquote>
            <div className="flex items-center justify-between rounded-xl bg-background px-4 py-3 text-sm font-medium text-foreground">
              One small step
              <ArrowRight className="h-4 w-4 text-primary" />
            </div>
          </aside>
        </div>
      </section>

      <section
        className="border-b border-border bg-card/70"
        aria-label="Trust and safety"
      >
        <div className="mx-auto grid max-w-6xl gap-5 px-5 py-6 text-sm sm:grid-cols-3 md:px-8">
          <div>
            <p className="font-semibold text-foreground">
              Explicitly Artificial
            </p>
            <p className="mt-1 text-muted-foreground">
              Clear identification with zero pretense of human clinical identity.
            </p>
          </div>
          <div>
            <p className="font-semibold text-foreground">
              Privately Anchored
            </p>
            <p className="mt-1 text-muted-foreground">
              Built strictly around confidential, user-owned data.
            </p>
          </div>
          <div>
            <p className="font-semibold text-foreground">
              Adjunctive Support
            </p>
            <p className="mt-1 text-muted-foreground">
              Designed to complement, never replace, professional care.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-20 md:px-8 md:py-24">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            A steadier daily rhythm
          </p>
          <h2 className="mt-3 font-serif text-4xl font-medium tracking-tight text-foreground md:text-5xl">
            Support that fits into your day.
          </h2>
          <p className="mt-4 text-base leading-7 text-muted-foreground">
            Every prompt serves a distinct purpose, making daily reflection
            grounding rather than overwhelming.
          </p>
        </div>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {RHYTHM.map(({ icon: Icon, title, body }, index) => (
            <Card
              key={title}
              className="h-full border-border/80 bg-card/80 shadow-sm"
            >
              <CardContent className="p-7">
                <div className="flex items-center justify-between">
                  <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="font-serif text-2xl text-primary/25">
                    0{index + 1}
                  </span>
                </div>
                <h3 className="mt-7 font-serif text-xl font-medium text-foreground">
                  {title}
                </h3>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">
                  {body}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="bg-muted/55">
        <div className="mx-auto max-w-6xl px-5 py-20 md:px-8 md:py-24">
          <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                Practical benefits
              </p>
              <h2 className="mt-3 font-serif text-4xl font-medium tracking-tight text-foreground">
                Turn reflection into actionable insight.
              </h2>
              <p className="mt-4 text-base leading-7 text-muted-foreground">
                Kindred organizes subtle daily signals that are easily missed
                when days are viewed in isolation.
              </p>
            </div>
            <div className="grid gap-4">
              {BENEFITS.map(({ icon: Icon, title, body }) => (
                <div
                  key={title}
                  className="flex gap-4 rounded-2xl border border-border bg-card p-5"
                >
                  <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary/25 text-primary">
                    <Icon className="h-5 w-5" />
                  </span>
                  <div>
                    <h3 className="font-serif text-lg font-medium text-foreground">
                      {title}
                    </h3>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      {body}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-20 md:px-8 md:py-24">
        <div className="grid gap-5 md:grid-cols-3">
          <Card className="bg-card/80">
            <CardContent className="p-7">
              <Brain className="h-6 w-6 text-primary" />
              <h2 className="mt-5 font-serif text-xl font-medium">
                Grounded in Research
              </h2>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                Informed by cognitive neuroscience, behavioral health, and
                addiction recovery science.
              </p>
              <Link
                href="/science"
                className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-primary"
              >
                Explore the science <ArrowRight className="h-4 w-4" />
              </Link>
            </CardContent>
          </Card>
          <Card className="bg-card/80">
            <CardContent className="p-7">
              <ShieldCheck className="h-6 w-6 text-primary" />
              <h2 className="mt-5 font-serif text-xl font-medium">
                Privacy &amp; Transparency
              </h2>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                Clear boundaries regarding data persistence, memory management,
                and AI capabilities.
              </p>
              <Link
                href="/legal/privacy"
                className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-primary"
              >
                Read the privacy policy <ArrowRight className="h-4 w-4" />
              </Link>
            </CardContent>
          </Card>
          <Card className="bg-card/80">
            <CardContent className="p-7">
              <HeartHandshake className="h-6 w-6 text-primary" />
              <h2 className="mt-5 font-serif text-xl font-medium">
                Human-Centered Care
              </h2>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                A dedicated wellness companion—distinct from clinical therapy,
                medical treatment, or crisis intervention.
              </p>
              <Link
                href="/legal/health-disclaimer"
                className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-primary"
              >
                Read the health disclaimer <ArrowRight className="h-4 w-4" />
              </Link>
            </CardContent>
          </Card>
        </div>
      </section>

      {CONFIGURED_SOCIAL_LINKS.length > 0 && (
        <section className="border-y border-border bg-card/70">
          <div className="mx-auto flex max-w-6xl flex-col gap-5 px-5 py-8 sm:flex-row sm:items-center sm:justify-between md:px-8">
            <div>
              <h2 className="font-serif text-xl font-medium text-foreground">
                Stay connected with Kindred
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Community news and practical encouragement.
              </p>
            </div>
            <nav
              className="flex flex-wrap gap-2"
              aria-label="Kindred Asterling social networks"
            >
              {CONFIGURED_SOCIAL_LINKS.map((social) => (
                <a
                  key={social.platform}
                  href={social.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Follow Kindred Asterling on ${social.label}`}
                  title={social.label}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-background text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
                >
                  <social.icon className="h-4 w-4" />
                </a>
              ))}
            </nav>
          </div>
        </section>
      )}

      <section className="brand-night px-5 py-20 text-center text-foreground md:px-8 md:py-24">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-secondary">
          Ready when you are
        </p>
        <h2 className="mx-auto mt-4 max-w-3xl font-serif text-4xl font-medium tracking-tight md:text-5xl">
          Make space for one honest next step.
        </h2>
        <Button
          asChild
          size="lg"
          className="mt-8 bg-secondary text-secondary-foreground hover:bg-secondary/90"
        >
          <Link href="/pricing">
            Explore membership <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </section>
    </div>
  );
}
