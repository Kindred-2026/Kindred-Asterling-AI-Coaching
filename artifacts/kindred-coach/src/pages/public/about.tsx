import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import logoMark from "@/assets/brand/logo-mark.png";

export default function About() {
  return (
    <div>
      <section className="relative overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{
            background:
              "radial-gradient(60% 50% at 50% 0%, hsl(var(--primary) / 0.16), transparent 70%)",
          }}
        />
        <div className="relative mx-auto max-w-3xl px-5 pb-12 pt-20 text-center md:px-8 md:pt-24">
          <h1 className="font-serif text-4xl font-medium leading-tight tracking-tight text-foreground md:text-5xl">
            Built from curiosity about the human brain.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground md:text-lg">
            Kindred was born from a genuine fascination with why we get stuck,
            why we reach for escape, and how we find our way back.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-5 py-12 md:px-8">
        <Card>
          <CardContent className="px-6 py-10 md:px-10">
            <h2 className="font-serif text-2xl font-medium tracking-tight text-foreground">
              Our Mission
            </h2>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground">
              We believe artificial intelligence should serve as a compassionate
              supplement to human care, never its replacement. Technology must
              strengthen human connection and resilience—guiding individuals to
              recognize patterns, evaluate progress, and mindfully return to
              their intentions. We commit to complete transparency: we identify
              the AI explicitly, state its boundaries plainly, and ensure human
              connection remains the cornerstone of recovery.
            </p>
          </CardContent>
        </Card>
      </section>

      <section
        className="mx-auto max-w-3xl px-5 pb-12 md:px-8"
        aria-labelledby="founder-note"
      >
        <figure className="rounded-2xl border border-border bg-card px-6 py-10 md:px-10">
          <div className="flex items-center gap-3">
            <img
              src={logoMark}
              alt=""
              className="h-10 w-10 rounded-full object-cover"
            />
            <h2
              id="founder-note"
              className="font-serif text-2xl font-medium tracking-tight text-foreground"
            >
              A note from the founder
            </h2>
          </div>
          <blockquote className="mt-6 space-y-4 text-base leading-relaxed text-muted-foreground">
            <p>
              I didn&rsquo;t build Kindred from the outside looking in.
              I&rsquo;ve lived with my own mental health struggles: the heavy
              days, the racing thoughts, the stretches when getting through the
              week took everything I had. What changed things for me
              wasn&rsquo;t one big breakthrough. It was learning cognitive
              therapy tools and practicing them every day: noticing a thought
              before it runs the show, questioning the story it tells, writing
              things down, and taking one small, manageable step at a time.
              Slowly, life became more sustainable. It didn&rsquo;t become
              perfect, but it became steadier and easier to carry.
            </p>
            <p>
              Kindred is built on those same habits. The morning check-in, the
              reflection during the day and the evening close are the rhythms
              that helped me, turned into something anyone can use between the
              moments of human care. It isn&rsquo;t a replacement for
              therapists, doctors or the people in your corner, and it never
              will be.
            </p>
            <p>
              My hope and dream is simple: to empower and motivate you toward a
              mindset you can actually keep up, especially when life gets a
              little stormy. You don&rsquo;t have to have it all figured out.
              You just need a place to start, and a companion to help you keep
              going.
            </p>
          </blockquote>
          <figcaption className="mt-8 border-t border-border pt-5">
            <p className="font-serif text-lg text-foreground">
              Landon Reese Syroid
            </p>
            <p className="text-sm text-secondary">Founder &amp; Developer</p>
          </figcaption>
        </figure>

        <h2 className="mt-12 font-serif text-2xl font-medium tracking-tight text-foreground">
          Review &amp; Medical Disclaimer
        </h2>
        <p className="mt-4 text-base italic leading-relaxed text-muted-foreground">
          Written and reviewed by the Kindred Asterling team.
        </p>
        <p className="mt-4 text-base leading-relaxed text-muted-foreground">
          Our team pairs lived recovery experience with rigorous study in
          cognitive neuroscience and addiction research. Kindred Asterling
          provides wellness and peer support; it is not a substitute for
          clinical medical or mental health treatment.
        </p>
        <p className="mt-6 text-base italic text-muted-foreground">
          Last reviewed: June 2026
        </p>
      </section>

      <section className="mx-auto max-w-3xl px-5 pb-24 md:px-8">
        <Card className="overflow-hidden">
          <CardContent className="relative px-6 py-12 text-center md:px-10">
            <h2 className="font-serif text-2xl font-medium tracking-tight text-foreground md:text-3xl">
              Explore the pilot
            </h2>
            <p className="mx-auto mt-3 max-w-lg text-muted-foreground">
              See the plans and start a free trial whenever you're ready.
            </p>
            <div className="mt-7 flex justify-center">
              <Button asChild size="lg">
                <Link href="/pricing">Explore membership</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
