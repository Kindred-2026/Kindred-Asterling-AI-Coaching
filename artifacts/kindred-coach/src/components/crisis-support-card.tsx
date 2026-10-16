import { useId } from "react";
import { Globe, LifeBuoy, MessageSquare, Phone } from "lucide-react";
import type { CrisisResourceContact } from "@workspace/api-client-react";
import {
  CRISIS_DISCLAIMER,
  CRISIS_FALSE_POSITIVE,
  CRISIS_RESOURCES,
} from "@/lib/crisisResources";

const CONTACT_ICONS: Record<CrisisResourceContact["kind"], typeof Phone> = {
  call: Phone,
  text: MessageSquare,
  web: Globe,
};

// Kindred's reply when the server's crisis detector matched a user message.
// `live` marks a card that just arrived in this session so screen readers
// announce it; cards loaded from history render quietly.
export function CrisisSupportCard({ live = false }: { live?: boolean }) {
  const headingId = useId();
  return (
    <section
      role={live ? "alert" : undefined}
      aria-labelledby={headingId}
      className="w-full max-w-md rounded-2xl rounded-bl-sm border border-destructive/40 bg-card p-4 text-sm text-foreground shadow-sm"
      data-testid="crisis-support-card"
    >
      <div className="flex items-start gap-2.5">
        <LifeBuoy
          className="mt-0.5 h-5 w-5 shrink-0 text-destructive"
          aria-hidden="true"
        />
        <div>
          <h2 id={headingId} className="font-medium">
            You deserve support right now
          </h2>
          <p className="mt-1 leading-6 text-muted-foreground">
            I'm really sorry you're going through this. {CRISIS_DISCLAIMER}{" "}
            Please reach out to people who can help.
          </p>
        </div>
      </div>
      <ul className="mt-3 space-y-2.5">
        {CRISIS_RESOURCES.map((resource) => (
          <li
            key={resource.id}
            className={`rounded-xl border px-3 py-2.5 ${
              resource.id === "emergency"
                ? "border-destructive/40 bg-destructive/5"
                : "border-border"
            }`}
            data-testid={`crisis-resource-${resource.id}`}
          >
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {resource.region}
            </p>
            <p className="mt-0.5 font-medium">{resource.name}</p>
            <p className="text-muted-foreground">{resource.description}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {resource.contacts.map((contact) => {
                const Icon = CONTACT_ICONS[contact.kind];
                const external = contact.kind === "web";
                return (
                  <a
                    key={contact.href}
                    href={contact.href}
                    target={external ? "_blank" : undefined}
                    rel={external ? "noopener noreferrer" : undefined}
                    className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-3 text-xs font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                    {contact.label}
                  </a>
                );
              })}
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs leading-5 text-muted-foreground">
        {CRISIS_FALSE_POSITIVE}
      </p>
    </section>
  );
}
