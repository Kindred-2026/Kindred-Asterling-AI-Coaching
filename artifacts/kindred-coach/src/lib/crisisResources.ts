import type { CrisisResource } from "@workspace/api-client-react";

// Mirrors `resources` in artifacts/api-server/src/config/crisisSupport.ts,
// which is the Safety-reviewed source. Stored crisis_support messages carry
// only text, so the card needs these to render links for history on reload.
// Every region is listed at once; Kindred never infers where someone is.
export const CRISIS_RESOURCES: CrisisResource[] = [
  {
    id: "emergency",
    region: "Immediate danger",
    name: "Emergency services",
    description:
      "Call 911 in Canada and the US, or your local emergency number.",
    contacts: [{ kind: "call", label: "Call 911", href: "tel:911" }],
  },
  {
    id: "ca-988",
    region: "Canada",
    name: "9-8-8 Suicide Crisis Helpline",
    description: "Call or text 9-8-8, free and 24/7.",
    contacts: [
      { kind: "call", label: "Call 9-8-8", href: "tel:988" },
      { kind: "text", label: "Text 9-8-8", href: "sms:988" },
    ],
  },
  {
    id: "us-988",
    region: "United States",
    name: "988 Suicide & Crisis Lifeline",
    description: "Call or text 988, free and 24/7.",
    contacts: [
      { kind: "call", label: "Call 988", href: "tel:988" },
      { kind: "text", label: "Text 988", href: "sms:988" },
    ],
  },
  {
    id: "international",
    region: "Everywhere else",
    name: "Find A Helpline",
    description: "Choose your country to find free, local support.",
    contacts: [
      {
        kind: "web",
        label: "findahelpline.com",
        href: "https://findahelpline.com/",
      },
    ],
  },
];

export const CRISIS_DISCLAIMER =
  "Kindred is not medical care or an emergency service.";
export const CRISIS_FALSE_POSITIVE =
  "If this doesn’t apply to you, rephrase your message to keep coaching.";
