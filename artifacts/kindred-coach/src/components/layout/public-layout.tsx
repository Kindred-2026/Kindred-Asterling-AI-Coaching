import { ReactNode, useState } from "react";
import { Link } from "wouter";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import logoMark from "@/assets/brand/logo-mark.png";
import { CONFIGURED_SOCIAL_LINKS } from "@/config/social-links";

function signInToApp() {
  window.location.href = "/login";
}

const NAV_LINKS = [
  { label: "Science", href: "/science" },
  { label: "About", href: "/about" },
  { label: "Pricing", href: "/pricing" },
];

const LEGAL_LINKS = [
  { label: "Privacy", href: "/legal/privacy" },
  { label: "Terms", href: "/legal/terms" },
  { label: "Health Disclaimer", href: "/legal/health-disclaimer" },
  { label: "AI Disclosure", href: "/legal/ai-disclosure" },
  { label: "Cookies", href: "/legal/cookies" },
  { label: "Marketing Consent", href: "/legal/marketing-consent" },
];

function PublicHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 md:px-8">
        <Link
          href="/"
          className="flex items-center gap-2.5"
          onClick={() => setOpen(false)}
        >
          <img
            src={logoMark}
            alt="Kindred Asterling"
            className="h-9 w-9 rounded-full object-cover"
          />
          <span className="font-serif text-lg font-medium tracking-tight text-foreground">
            Kindred Asterling
          </span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {l.label}
            </Link>
          ))}
          <button
            onClick={signInToApp}
            className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Sign In
          </button>
          <Button asChild size="sm" className="ml-2">
            <Link href="/pricing">Explore membership</Link>
          </Button>
        </nav>

        <div className="flex items-center gap-2 md:hidden">
          <Button asChild size="sm">
            <Link href="/pricing">Membership</Link>
          </Button>
          <button
            onClick={() => setOpen((v) => !v)}
            className="rounded-md p-2 text-foreground hover:bg-muted"
            aria-label={open ? "Close menu" : "Open menu"}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-border/60 bg-background md:hidden">
          <nav className="mx-auto flex max-w-6xl flex-col px-5 py-3">
            {NAV_LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="rounded-md px-2 py-3 text-sm font-medium text-foreground hover:bg-muted"
              >
                {l.label}
              </Link>
            ))}
            <button
              onClick={() => {
                setOpen(false);
                signInToApp();
              }}
              className="rounded-md px-2 py-3 text-left text-sm font-medium text-foreground hover:bg-muted"
            >
              Sign In
            </button>
          </nav>
        </div>
      )}
    </header>
  );
}

function PublicFooter() {
  return (
    <footer className="border-t border-border/60 bg-sidebar">
      <div className="mx-auto max-w-6xl px-5 py-12 md:px-8">
        <div className="flex flex-col gap-8 md:flex-row md:items-start md:justify-between">
          <div className="max-w-sm">
            <div className="flex items-center gap-2.5">
              <img
                src={logoMark}
                alt="Kindred Asterling"
                className="h-8 w-8 rounded-full object-cover"
              />
              <span className="font-serif text-base font-medium text-foreground">
                Kindred Asterling
              </span>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              An AI companion grounded in cognitive neuroscience — a
              transparent, compassionate supplement to human care, never a
              replacement for it.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-x-10 gap-y-8 sm:grid-cols-3">
            <div className="flex flex-col gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-foreground">
                Explore
              </p>
              {NAV_LINKS.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  {l.label}
                </Link>
              ))}
            </div>
            <div className="flex flex-col gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-foreground">
                Legal
              </p>
              {LEGAL_LINKS.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  {l.label}
                </Link>
              ))}
            </div>
            {CONFIGURED_SOCIAL_LINKS.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-foreground">
                  Follow
                </p>
                <div className="flex flex-wrap gap-2">
                  {CONFIGURED_SOCIAL_LINKS.map((link) => (
                    <a
                      key={link.platform}
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={link.label}
                      title={link.label}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
                    >
                      <link.icon className="h-4 w-4" />
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
        <p className="mt-10 text-xs text-muted-foreground/70">
          © {new Date().getFullYear()} Kindred Asterling AI Coaching. Kindred is
          a companion to clinical care—not a substitute for professional help.
        </p>
      </div>
    </footer>
  );
}

export function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div
      className={cn(
        "public-site flex min-h-screen flex-col bg-background text-foreground",
      )}
    >
      <PublicHeader />
      <main className="flex-1">{children}</main>
      <PublicFooter />
    </div>
  );
}
