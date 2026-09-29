import { Brain, ExternalLink, HeartHandshake, Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

const PILLARS = [
  {
    name: "Marc Lewis",
    title: "Addiction as Deep Learning",
    body: "Addiction reflects neuroplastic learning rather than chronic disease. The neural mechanisms that entrench compulsive habits also enable cognitive rewiring and recovery.",
    source: {
      label: "The Biology of Desire (2015) — Basic Books",
      href: "https://www.basicbooks.com/titles/marc-lewis/the-biology-of-desire/9780465049165/",
    },
  },
  {
    name: "Kevin McCauley",
    title: "Hijacked Reward Circuits",
    body: "Addiction dysregulates neural circuits governing reward, memory, and stress. Resulting hypofrontality significantly impairs cognitive insight and voluntary choice.",
    source: {
      label: "Pleasure Unwoven (2009) — Institute for Addiction Study",
      href: "https://www.instituteforaddictionstudy.com/pleasure-unwoven",
    },
  },
  {
    name: "Judith Grisel",
    title: "The Neurological Cycle",
    body: "Homeostatic adaptation drives chemical tolerance and withdrawal, locking the brain in a continuous struggle to restore baseline equilibrium.",
    source: {
      label: "Never Enough (2019) — Doubleday",
      href: "https://www.penguinrandomhouse.com/books/567263/never-enough-by-judith-grisel/",
    },
  },
  {
    name: "The ACE Framework",
    title: "Environment & Genetics",
    body: "Adverse Childhood Experiences interact with genetic predispositions to alter baseline hedonic function and elevate susceptibility to addiction.",
    source: {
      label: "Felitti et al. (1998) — American Journal of Preventive Medicine",
      href: "https://pubmed.ncbi.nlm.nih.gov/9635069/",
    },
  },
];

const BIBLIOGRAPHY = [
  {
    citation:
      "Lewis, M. (2015). The Biology of Desire: Why Addiction Is Not a Disease. Basic Books.",
    href: "https://www.basicbooks.com/titles/marc-lewis/the-biology-of-desire/9780465049165/",
  },
  {
    citation:
      "McCauley, K. (2009). Pleasure Unwoven: An Explanation of the Brain Disease of Addiction [Film]. Institute for Addiction Study.",
    href: "https://www.instituteforaddictionstudy.com/pleasure-unwoven",
  },
  {
    citation:
      "Grisel, J. (2019). Never Enough: The Neuroscience and Experience of Addiction. Doubleday.",
    href: "https://www.penguinrandomhouse.com/books/567263/never-enough-by-judith-grisel/",
  },
  {
    citation:
      "Felitti, V. J., Anda, R. F., Nordenberg, D., Williamson, D. F., Spitz, A. M., Edwards, V., … Marks, J. S. (1998). Relationship of childhood abuse and household dysfunction to many of the leading causes of death in adults. American Journal of Preventive Medicine, 14(4), 245–258.",
    href: "https://pubmed.ncbi.nlm.nih.gov/9635069/",
  },
  {
    citation:
      "Linehan, M. M. (1993). Cognitive-Behavioral Treatment of Borderline Personality Disorder. Guilford Press.",
    href: "https://www.guilford.com/books/Cognitive-Behavioral-Treatment-of-Borderline-Personality-Disorder/Linehan/9780898621839",
  },
  {
    citation:
      "Beck, A. T. (1979). Cognitive Therapy of Depression. Guilford Press.",
    href: "https://www.guilford.com/books/Cognitive-Therapy-of-Depression/Beck-Rush-Shaw-Emery/9780898629194",
  },
];

export default function Science() {
  return (
    <div>
      <section className="relative isolate overflow-hidden brand-night text-foreground">
        <div className="pointer-events-none absolute -right-32 -top-40 h-[30rem] w-[30rem] rounded-full bg-secondary/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-48 left-1/4 h-80 w-80 rounded-full bg-background/10 blur-3xl" />
        <div className="relative mx-auto max-w-4xl px-5 py-20 text-center md:px-8 md:py-28">
          <p className="flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-secondary">
            <Sparkles className="h-4 w-4" /> Research & responsibility
          </p>
          <h1 className="mt-5 font-serif text-5xl font-medium leading-[1.04] tracking-[-0.04em] text-balance md:text-6xl">
            Kindred is anchored in peer-reviewed science.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-base leading-8 text-foreground/75 md:text-lg">
            We approach the mind with intellectual respect, drawing from
            cognitive neuroscience, addiction science, and behavioral health.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-16 md:px-8 md:py-24">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          The thinking behind Kindred
        </p>
        <h2 className="mb-10 mt-3 font-serif text-3xl font-medium tracking-tight text-foreground md:text-4xl">
          Research pillars
        </h2>
        <div className="grid gap-5 md:grid-cols-2">
          {PILLARS.map((p) => (
            <Card
              key={p.name}
              className="h-full rounded-2xl border-border/80 bg-card/80 shadow-sm"
            >
              <CardContent className="flex h-full flex-col p-7">
                <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                  {p.name}
                </p>
                <h3 className="mt-2 font-serif text-xl font-medium text-foreground">
                  {p.title}
                </h3>
                <p className="mt-3 flex-1 text-sm leading-relaxed text-muted-foreground">
                  {p.body}
                </p>
                <a
                  href={p.source.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
                >
                  <ExternalLink className="h-3 w-3 shrink-0" />
                  {p.source.label}
                </a>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="bg-muted/55">
        <div className="mx-auto grid max-w-6xl gap-5 px-5 py-16 md:px-8 md:py-20 lg:grid-cols-2">
          <Card className="rounded-2xl bg-card">
            <CardContent className="p-7 md:p-9">
              <Brain className="h-6 w-6 text-primary" />
              <h2 className="font-serif text-2xl font-medium tracking-tight text-foreground">
                Evidence-Based Techniques
              </h2>
              <p className="mt-4 text-base leading-relaxed text-muted-foreground">
                Recovery requires active habit reorganization supported by
                community and deliberate practice. Kindred integrates modalities
                such as Cognitive Behavioral Therapy (CBT) and Dialectical
                Behavior Therapy (DBT) to strengthen emotional regulation and
                distress tolerance.
              </p>
            </CardContent>
          </Card>
          <Card className="rounded-2xl bg-card">
            <CardContent className="p-7 md:p-9">
              <HeartHandshake className="h-6 w-6 text-primary" />
              <h2 className="mt-5 font-serif text-2xl font-medium tracking-tight text-foreground">
                The Ethical Landscape
              </h2>
              <p className="mt-4 text-base leading-relaxed text-muted-foreground">
                While AI excels at pattern recognition and reflective coaching,
                it lacks affective empathy and clinical judgment. Human
                connection remains indispensable; Kindred operates strictly as
                an adjunct within these defined boundaries.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-5 pt-16 md:px-8 md:pt-20">
        <div className="rounded-2xl border border-border bg-card/80 p-7">
          <h2 className="font-serif text-xl font-medium tracking-tight text-foreground">
            Who writes and reviews this
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            This page is written and reviewed by the Kindred Asterling team,
            drawing on lived experience and the peer-reviewed sources listed
            below. Kindred Asterling offers wellness support and is not a
            substitute for professional medical or mental-health care.
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Last reviewed: June 2026
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-5 pb-24 pt-12 md:px-8">
        <h2 className="font-serif text-xl font-medium tracking-tight text-foreground">
          Sources
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The research pillars and techniques described above draw on the
          following published works.
        </p>
        <ol className="mt-6 space-y-4">
          {BIBLIOGRAPHY.map((b, i) => (
            <li
              key={i}
              className="flex gap-3 text-sm leading-relaxed text-muted-foreground"
            >
              <span className="shrink-0 font-medium text-foreground">
                {i + 1}.
              </span>
              <span>
                {b.citation}{" "}
                <a
                  href={b.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                >
                  <ExternalLink className="h-3 w-3" />
                  View source
                </a>
              </span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
