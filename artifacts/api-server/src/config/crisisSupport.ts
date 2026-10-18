/**
 * Clinically reviewed copy/configuration for the crisis interception path.
 *
 * Changes to this file require review by the Safety owner. Resource links are
 * checked quarterly and may be changed without changing chat/model prompts.
 * The chat UI renders the same resources in
 * `artifacts/kindred-coach/src/lib/crisisResources.ts`; keep the two in step.
 */
export const CRISIS_SUPPORT_CONFIG = {
  review: {
    owner: "Safety",
    version: "2026-10-16",
    nextResourceReview: "2027-01-16",
  },
  // Stored as the content of the `crisis_support` chat message, so it must
  // stand on its own as plain text (archive export, account export, model
  // history) even where the resource card is not rendered.
  response: [
    "I'm really sorry you're going through this. Kindred is not medical care or an emergency service, so please reach out to people who can help right now:",
    "• If you are in immediate danger, call 911 (Canada and the US) or your local emergency number.",
    "• In Canada or the US, call or text 9-8-8, free and 24/7. In Canada that reaches the 9-8-8 Suicide Crisis Helpline; in the US, the 988 Suicide & Crisis Lifeline.",
    "• Anywhere else, find a local helpline at findahelpline.com.",
  ].join("\n"),
  disclaimer: "Kindred is not medical care or an emergency service.",
  falsePositiveLabel: "This doesn’t apply",
  falsePositiveInstruction:
    "If this doesn’t apply to you, rephrase your message to keep coaching.",
  // Resources are listed for every region at once: the API does not infer,
  // request, or retain the person's country or region.
  resources: [
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
  ],
} as const;

export const SAFETY_EVENT_POLICY = {
  retentionClass: "security_safety_30d",
  maximumRetentionDays: 30,
  accessClass: "security_response_only",
  permittedRoles: ["security-incident-responder", "safety-lead"],
  purpose: "abuse monitoring and safety-control assurance",
} as const;
