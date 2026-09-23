import type { ReactNode } from "react";

type LegalBlock =
  | { type: "paragraph"; content: ReactNode }
  | { type: "list"; items: ReactNode[]; ordered?: boolean }
  | { type: "subheading"; content: ReactNode }
  | { type: "callout"; content: ReactNode };

type LegalSection =
  | { heading: string; blocks: LegalBlock[] }
  | { heading: string; content: ReactNode | LegalBlock };

interface LegalPageProps {
  /** Marks a document as published and removes draft-only review warnings. */
  published?: boolean;
  title: string;
  summary: string;
  governingLaw?: string;
  pdfHref?: string;
  sections: LegalSection[];
}

const paragraph = (content: ReactNode): LegalBlock => ({
  type: "paragraph",
  content,
});

const list = (items: ReactNode[], ordered = false): LegalBlock => ({
  type: "list",
  items,
  ordered,
});

const subheading = (content: ReactNode): LegalBlock => ({
  type: "subheading",
  content,
});

const callout = (content: ReactNode): LegalBlock => ({
  type: "callout",
  content,
});

function renderBlock(block: LegalBlock, index: number) {
  if (block.type === "paragraph") {
    return <p key={index}>{block.content}</p>;
  }

  if (block.type === "subheading") {
    return (
      <h3 className="font-semibold text-foreground" key={index}>
        {block.content}
      </h3>
    );
  }

  if (block.type === "callout") {
    return (
      <div
        className="whitespace-pre-line rounded-xl border border-border bg-card p-5 text-foreground"
        key={index}
      >
        {block.content}
      </div>
    );
  }

  const ListTag = block.ordered ? "ol" : "ul";
  return (
    <ListTag
      className={`${block.ordered ? "list-decimal" : "list-disc"} space-y-2 pl-5`}
      key={index}
    >
      {block.items.map((item, itemIndex) => (
        <li key={itemIndex}>{item}</li>
      ))}
    </ListTag>
  );
}

function isLegalBlock(content: ReactNode | LegalBlock): content is LegalBlock {
  if (typeof content !== "object" || content === null || !("type" in content)) {
    return false;
  }

  const candidate = content as Partial<LegalBlock>;
  return (
    candidate.type === "paragraph" ||
    candidate.type === "list" ||
    candidate.type === "subheading" ||
    candidate.type === "callout"
  );
}

function renderLegacyContent(content: ReactNode | LegalBlock): ReactNode {
  if (isLegalBlock(content)) {
    return renderBlock(content, 0);
  }

  return content;
}

function LegalPage({
  published = false,
  title,
  summary,
  governingLaw,
  pdfHref,
  sections,
}: LegalPageProps) {
  const metadata = [
    ["Version", published ? "1.0" : "1.0 (Final Review Draft)"],
    ["Date", "August 24, 2026"],
    ...(governingLaw ? [["Governing law", governingLaw]] : []),
    ["Sole proprietor", "Landon Syroid d/b/a Kindred Asterling AI Coaching"],
    [
      "Status",
      published ? "Published" : "Subject to Final Legal Counsel Approval",
    ],
  ];

  return (
    <article className="mx-auto max-w-3xl px-5 py-16 md:px-8 md:py-20">
      <header className="border-b border-border pb-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          {published ? "Legal information" : "Working draft — not legal advice"}
        </p>
        <h1 className="mt-3 font-serif text-4xl font-medium tracking-tight text-foreground md:text-5xl">
          {title}
        </h1>
        <p className="mt-5 text-base leading-relaxed text-muted-foreground">
          {summary}
        </p>

        <dl className="mt-7 grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2">
          {metadata.map(([label, value]) => (
            <div className="bg-card px-4 py-3" key={label}>
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {label}
              </dt>
              <dd className="mt-1 text-sm leading-relaxed text-foreground">
                {value}
              </dd>
            </div>
          ))}
        </dl>

        {!published ? (
          <div className="mt-6 rounded-lg border border-amber-300/60 bg-amber-50 px-4 py-3 text-sm font-semibold uppercase tracking-wide text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
            Draft - for final legal review and execution - not for distribution
          </div>
        ) : null}

        {pdfHref ? (
          <a
            className="mt-5 inline-flex items-center rounded-md border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            href={pdfHref}
            download
          >
            Download PDF
          </a>
        ) : null}
      </header>

      <div className="mt-10 space-y-10">
        {sections.map((section) => (
          <section key={section.heading}>
            <h2 className="font-serif text-2xl font-medium text-foreground">
              {section.heading}
            </h2>
            <div className="mt-3 space-y-4 text-sm leading-7 text-muted-foreground">
              {"blocks" in section
                ? section.blocks.map(renderBlock)
                : renderLegacyContent(section.content)}
            </div>
          </section>
        ))}
      </div>
    </article>
  );
}

const privacySections: LegalSection[] = [
  {
    heading: "1. Organization & Privacy Officer",
    blocks: [
      paragraph(
        'Kindred Asterling AI Coaching ("Kindred", "we", "us", or "our") is an Alberta sole proprietorship owned and operated by Landon Syroid, located in Edmonton, Alberta, Canada.',
      ),
      paragraph(
        "We are dedicated to safeguarding your personal privacy and adhering strictly to the Alberta Personal Information Protection Act (PIPA, SA 2003, c P-6.5), the Canadian federal Personal Information Protection and Electronic Documents Act (PIPEDA, SC 2000, c 5), and international data protection standards.",
      ),
      subheading("Designated Privacy Officer Contact:"),
      list([
        "Privacy Inquiries & Access Requests: kindredaicoach@gmail.com",
        "Customer & Account Support: kindred_support@kindred-asterling-ai-coaching.com",
        "Mailing Address: 202 - 10249 119 ST NW, Edmonton, AB T5K 2Y6, Canada",
      ]),
    ],
  },
  {
    heading: "2. Personal Information We Collect",
    blocks: [
      paragraph(
        "We collect and process only the personal information strictly necessary to provide and operate the Service:",
      ),
      list(
        [
          "Account & Authentication Data: Email address, user identification tokens, account verification status, and name provided through our authentication partner, Auth0.",
          "Wellness, Reflection & Coaching Data: Self-submitted morning check-ins, evening reflections, mood scores, body scan notes, habit records, medication logs, personal goals, and chat interactions with the coaching AI.",
          "Retired Calendar Integration: Kindred no longer connects to Google Calendar or retrieves event information. Previously saved encrypted connection tokens remain available for user-initiated disconnection pending a connection audit.",
          "Subscription & Transaction Data: Payment references, plan tiers (Yearly or Lifetime Access), and transaction IDs processed securely through Helcim. We do not store or process raw credit card numbers.",
          "Operational & Security Telemetry: Server access logs, security events, quota tracking, and application error logs.",
        ],
        true,
      ),
    ],
  },
  {
    heading: "3. Purposes for Processing Personal Information",
    blocks: [
      paragraph(
        "We collect and process your personal information strictly for the following purposes:",
      ),
      list([
        "Delivering automated coaching dialogue, reflection prompts, and habit summaries.",
        "Personalizing conversational coaching pacing using interaction-scoped context minimization.",
        "Processing subscription payments, managing accounts, and preventing abuse or security breaches.",
        "Complying with Canadian accounting, tax, and statutory requirements.",
      ]),
      paragraph(
        "AI Training Exclusion: We do not sell your personal information. Personal wellness data, reflection logs, and coaching interactions are never used to train public or foundational machine learning models.",
      ),
    ],
  },
  {
    heading: "4. Third-Party Service Providers & Cross-Border Data Transfers",
    blocks: [
      paragraph(
        "To deliver our secure cloud platform, personal information may be transferred to and processed by vetted third-party service providers. In accordance with Section 13.1 of Alberta PIPA, please note that personal data transferred across provincial or international borders may be accessible to foreign regulatory or law enforcement authorities under lawful orders in the jurisdictions where those facilities are located:",
      ),
      list([
        "AI Processing: The model provider and processing region must be confirmed against the live deployment before this disclosure is published. The planned route is an OpenAI-compatible model through Cloudflare AI Gateway.",
        "Cloud Hosting & Infrastructure: The live hosting provider and database location must be confirmed before this disclosure is published. DigitalOcean App Platform and managed PostgreSQL are the planned target.",
        "Authentication & Identity: Auth0 (USA / Global) - secure session management.",
        "Payment Processing: Helcim (Calgary, AB, Canada) - PCI-DSS compliant checkout and subscription billing.",
        "Communications: Resend (transactional email), Twilio (SMS reminders, where enabled), and ElevenLabs (voice synthesis, where enabled).",
      ]),
    ],
  },
  {
    heading: "5. Google API Services User Data Policy & Limited Use",
    blocks: [
      paragraph(
        "Kindred's use and transfer to any other app of information received from Google APIs adheres strictly to the Google API Services User Data Policy, including the Limited Use requirements:",
      ),
      list([
        "Integration Retirement: New Google Calendar connections and event retrieval are disabled.",
        "Coaching Context: Google Calendar events and schedule-density signals are no longer supplied to coaching.",
        "No Secondary Marketing or AI Training: Google user data is never sold, transferred to data brokers, used for advertising, or used to train general-purpose AI models.",
        "Disconnection: The You page links to cleanup of previously saved Calendar access. Disconnection deletes the saved token from Kindred and attempts Google token revocation; access can also be removed in your Google Account.",
      ]),
    ],
  },
  {
    heading: "6. Retention Schedules, Access & Deletion Rights",
    blocks: [
      subheading("A. Retention Periods"),
      list([
        "Active Account & Coaching Records: Retained for the duration of your active account lifecycle.",
        "Server Backups: Automated encrypted backups are retained on a rolling 35-day cycle.",
        "Administrative & Security Logs: Retained for up to 12 months for security auditing.",
        "Billing & Transaction Records: Retained for up to 7 years to satisfy Canada Revenue Agency (CRA) tax obligations.",
      ]),
      subheading("B. Individual Rights Under Alberta PIPA"),
      paragraph(
        "Under Alberta PIPA and Canadian privacy legislation, you have the right to:",
      ),
      list([
        "Access and inspect the personal information we hold about you.",
        "Request corrections to inaccurate or incomplete personal records.",
        "Request account deletion and complete erasure of your coaching history.",
        "Withdraw consent for optional processing (e.g., calendar integration, marketing emails).",
      ]),
      paragraph(
        "To exercise any of these rights, submit a written request to our Privacy Officer at kindredaicoach@gmail.com. We respond to verified requests within thirty (30) days in compliance with statutory timelines.",
      ),
    ],
  },
  {
    heading: "7. Security Measures & Breach Notification",
    blocks: [
      paragraph(
        "We employ industry-standard administrative, physical, and technical safeguards, including TLS 1.3 encryption in transit, AES-256 encryption at rest for OAuth tokens, role-based access restrictions, and automated vulnerability monitoring.",
      ),
      paragraph(
        "In the event of a security incident involving personal information that poses a real risk of significant harm, we will promptly notify affected individuals and the Office of the Information and Privacy Commissioner of Alberta (OIPC) in compliance with Section 34.1 of Alberta PIPA.",
      ),
    ],
  },
];

const termsSections: LegalSection[] = [
  {
    heading: "1. Agreement to Terms & Eligibility",
    blocks: [
      paragraph(
        'These Terms and Conditions ("Terms") constitute a legally binding agreement between you ("User", "you", or "your") and Landon Syroid, operating as Kindred Asterling AI Coaching ("Kindred", "we", "us", or "our"), governing your access to and use of the Kindred web application and associated services (the "Service").',
      ),
      paragraph(
        "By registering an account, accessing, or using the Service, you acknowledge that you have read, understood, and agree to be bound by these Terms and our Privacy Policy. If you do not agree to these Terms, you must not access or use the Service.",
      ),
      paragraph(
        "Age Requirement (Adults 18+ Only): You must be at least eighteen (18) years of age to create an account or use the Service. By accessing the Service, you represent and warrant that you are at least 18 years old. Minors are strictly prohibited from creating accounts or using the Service.",
      ),
    ],
  },
  {
    heading: "2. Service Description & Non-Clinical Coaching",
    blocks: [
      paragraph(
        "Kindred provides automated, artificial intelligence-assisted personal coaching, daily reflection journaling, habit tracking, and progress visualization tools.",
      ),
      callout(
        "IMPORTANT NOTICE - NO PROFESSIONAL ADVICE: THE SERVICE IS AN INFORMATIONAL WELLNESS AND PERSONAL DEVELOPMENT TOOL ONLY. KINDRED IS NOT A HEALTHCARE PROVIDER, MENTAL HEALTH CLINIC, PSYCHIATRIC FACILITY, OR FINANCIAL ADVISOR. CONTENT AND OUTPUTS GENERATED BY THE SERVICE DO NOT CONSTITUTE MEDICAL, PSYCHOLOGICAL, LEGAL, OR FINANCIAL ADVICE, AND ARE NOT A SUBSTITUTE FOR EVALUATION BY A LICENSED PROFESSIONAL.",
      ),
    ],
  },
  {
    heading: "3. Subscriptions, Pricing, Lifetime Access & Refunds",
    blocks: [
      subheading("A. Pricing & Billing"),
      list([
        "Payment Processing: All subscription fees (e.g., $49.99 CAD/year) and one-time fees (e.g., $79.99 CAD Lifetime Access) are processed securely through Helcim. All fees are denominated in Canadian Dollars (CAD) unless otherwise indicated, plus applicable sales taxes (e.g., GST).",
        "Annual Subscriptions: Annual plans renew automatically at the end of each billing cycle unless cancelled prior to the renewal date.",
      ]),
      subheading("B. 30-Day Cancellation & Refund Policy"),
      paragraph(
        "You may cancel your initial subscription purchase within thirty (30) calendar days of purchase to receive a full refund. Refund requests should be submitted to kindred_support@kindred-asterling-ai-coaching.com.",
      ),
      subheading('C. Definition of "Lifetime Access"'),
      paragraph(
        '"Lifetime Access" refers to access to the core features of the Kindred platform for the commercial operational lifespan of the software service. It does not guarantee perpetual operation in perpetuity. In the event of planned service discontinuation or platform retirement, Kindred will provide registered Lifetime Access holders with at least sixty (60) calendar days\' advance written notice via email.',
      ),
    ],
  },
  {
    heading: "4. Acceptable Use Policy",
    blocks: [
      paragraph("You agree not to:"),
      list([
        "Use the Service for any unlawful, harassing, defamatory, fraudulent, or harmful purpose.",
        "Reverse-engineer, decompile, crawl, or attempt to extract source code or underlying AI models.",
        "Interfere with or disrupt the integrity, security, or performance of our cloud infrastructure.",
        "Input confidential or personal health data belonging to third parties without lawful authorization.",
        "Rely upon AI-generated outputs for emergency, medical, psychiatric, or life-critical decisions.",
      ]),
    ],
  },
  {
    heading: "5. Intellectual Property Rights",
    blocks: [
      list([
        "Platform Ownership: Kindred, its software, branding, user interfaces, documentation, and algorithms are the proprietary property of Landon Syroid and are protected by Canadian and international intellectual property laws.",
        "User Inputs & Data: You retain full ownership of the text, journal entries, and personal data you input into the Service. You grant Kindred a limited, non-exclusive, royalty-free license solely to host, process, and display such data as technically necessary to operate and deliver the Service.",
      ]),
    ],
  },
  {
    heading: "6. Disclaimer of Warranties",
    blocks: [
      callout(
        'TO THE MAXIMUM EXTENT PERMITTED UNDER THE LAWS OF THE PROVINCE OF ALBERTA AND APPLICABLE CANADIAN LAW, THE SERVICE IS PROVIDED ON AN "AS IS" AND "AS AVAILABLE" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS, IMPLIED, STATUTORY, OR OTHERWISE. KINDRED EXPRESSLY DISCLAIMS ALL IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, AND NON-INFRINGEMENT. WE DO NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, SECURE, OR ACCURATE.',
      ),
    ],
  },
  {
    heading: "7. Limitation of Liability",
    blocks: [
      callout(
        "TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT SHALL KINDRED, ITS PROPRIETOR, CONTRACTORS, OR SUPPLIERS BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE DAMAGES (INCLUDING LOSS OF PROFITS, DATA, GOODWILL, OR PERSONAL INJURY) ARISING OUT OF OR IN CONNECTION WITH YOUR USE OF OR INABILITY TO USE THE SERVICE.",
      ),
      paragraph(
        "OUR TOTAL AGGREGATE LIABILITY ARISING OUT OF OR RELATING TO THESE TERMS OR THE SERVICE SHALL NOT EXCEED THE GREATER OF:",
      ),
      list(
        [
          "THE TOTAL AMOUNT ACTUALLY PAID BY YOU TO KINDRED IN THE TWELVE (12) MONTHS IMMEDIATELY PRECEDING THE EVENT GIVING RISE TO LIABILITY; OR",
          "FIFTY CANADIAN DOLLARS ($50.00 CAD).",
        ],
        true,
      ),
      paragraph(
        "NOTHING IN THESE TERMS EXCLUDES OR LIMITS ANY MANDATORY CONSUMER RIGHTS THAT CANNOT BE CONTRACTUALLY WAIVED UNDER THE ALBERTA CONSUMER PROTECTION ACT (RSA 2000, c C-26.3).",
      ),
    ],
  },
  {
    heading: "8. Dispute Resolution & Governing Law",
    blocks: [
      subheading("A. Mandatory Informal Resolution"),
      paragraph(
        "Before initiating any formal legal claim, you agree to contact us at kindred_support@kindred-asterling-ai-coaching.com and attempt in good faith to resolve the dispute informally for at least thirty (30) days.",
      ),
      subheading("B. Governing Law & Forum Selection"),
      paragraph(
        "These Terms, your use of the Service, and any disputes arising hereunder shall be governed by and construed in accordance with the laws of the Province of Alberta and the federal laws of Canada applicable therein, without regard to conflict of law principles.",
      ),
      paragraph(
        "Subject to mandatory consumer protection laws, you irrevocably submit to the exclusive personal and subject-matter jurisdiction of the Courts of the Judicial District of Edmonton in the Province of Alberta, Canada.",
      ),
    ],
  },
  {
    heading: "9. Contact Information",
    blocks: [
      paragraph("For inquiries regarding these Terms:"),
      list([
        "Legal & Support Email: kindred_support@kindred-asterling-ai-coaching.com",
        "Privacy Officer Email: kindredaicoach@gmail.com",
        "Mailing Address: 202 - 10249 119 ST NW, Edmonton, AB T5K 2Y6, Canada",
      ]),
    ],
  },
];

const healthSections: LegalSection[] = [
  {
    heading: "1. Non-Medical and Non-Clinical Nature of the Service",
    blocks: [
      paragraph(
        'Kindred Asterling AI Coaching ("Kindred", "we", "us", or "our"), operated by Landon Syroid in Edmonton, Alberta, Canada, is an automated informational wellness coaching and personal reflection platform.',
      ),
      callout(
        "KINDRED IS NOT A LICENSED HEALTHCARE PROVIDER, MEDICAL CLINIC, CRISIS INTERVENTION CENTER, OR PSYCHIATRIC FACILITY.",
      ),
      list([
        "No Medical or Therapeutic Advice: All content, AI dialogue, morning/evening reflection prompts, body scan logs and generated progress summaries are provided exclusively for personal informational and educational purposes.",
        "No Clinical Diagnosis or Treatment: Kindred does not diagnose, treat, prevent, mitigate, or cure any physical, mental, psychiatric, or psychological illness, condition, or disorder. The Service is not a substitute for clinical judgment, medical examinations, or psychotherapy provided by a licensed physician, psychiatrist, registered psychologist, or healthcare professional.",
      ]),
    ],
  },
  {
    heading: "2. Medication & Habit Tracking Boundaries",
    blocks: [
      paragraph(
        "Medication tracking, schedule reminders, and habit check-in features within Kindred function solely as a self-directed personal organizational log.",
      ),
      list([
        "No Pharmaceutical Evaluation: Kindred does not prescribe, modify, evaluate, or adjust medications, dosages, or schedules.",
        "No Drug Interaction or Safety Checks: Kindred does not evaluate contraindications, drug interactions, side effects, or clinical efficacy.",
        "Mandatory Professional Consultation: Any decision to initiate, alter, taper, or discontinue prescription medications, over-the-counter drugs, or dietary supplements must be made under the direct supervision of a licensed physician or pharmacist.",
      ]),
    ],
  },
  {
    heading: "3. Emergency & Crisis Protocols",
    blocks: [
      paragraph(
        "Kindred is an automated system and is not monitored for emergencies, acute mental health crises, or medical urgency.",
      ),
      paragraph(
        "If you need urgent help, contact emergency services in your location or go to the nearest emergency department. In Canada and the United States, call 911 for immediate danger; crisis support is also available by calling or texting 988. In other jurisdictions, contact the local emergency service or national crisis support line.",
      ),
    ],
  },
  {
    heading: "4. Limitation on Outcomes & User Responsibility",
    blocks: [
      paragraph(
        "Kindred makes no guarantees, representations, or warranties regarding specific personal, psychological, educational, career, or physical outcomes resulting from using the platform.",
      ),
      paragraph(
        "Users maintain sole responsibility for verifying all information and applying independent judgment before acting on any coaching output.",
      ),
    ],
  },
  {
    heading: "5. Age Restriction (Adults 18+ Only)",
    blocks: [
      paragraph(
        "The Service is strictly designed and offered to individuals who are at least eighteen (18) years of age. Kindred is not directed to or intended for use by minors.",
      ),
    ],
  },
];

const transparencySections: LegalSection[] = [
  {
    heading: "1. Scope & Purpose",
    blocks: [
      paragraph(
        'Kindred Asterling AI Coaching ("Kindred", "we", "us", or "our"), operated by Landon Syroid as an Alberta sole proprietorship based in Edmonton, Alberta, Canada, integrates generative artificial intelligence to deliver conversational coaching, guided self-reflections, habit tracking, and structured personal summaries.',
      ),
      paragraph(
        "This Disclosure outlines where and how artificial intelligence operates within the Kindred platform, the technical and contextual boundaries enforced, and our strict adherence to Canadian privacy principles and consumer transparency standards.",
      ),
    ],
  },
  {
    heading: "2. Where AI Is Used",
    blocks: [
      paragraph(
        "Artificial intelligence is utilized within the Kindred platform strictly for the following functions:",
      ),
      list([
        "Conversational Coaching Dialogue: Generating interactive coaching prompts, reflective inquiries, and conversational responses based on user-initiated messages.",
        "Self-Assessment Summaries: Synthesizing user-submitted morning check-ins, evening reflections, body scans, and goal tracking into periodic progress overviews.",
        "Calendar Retirement: Calendar events and schedule-density signals are no longer used in AI coaching.",
      ]),
    ],
  },
  {
    heading: "3. Context Minimization & Privacy Architecture",
    blocks: [
      paragraph(
        "Kindred enforces strict technical constraints to ensure user data minimization:",
      ),
      list([
        "Interaction-Scoped Context: The context assembly engine retrieves only data categories relevant to the immediate user prompt rather than injecting complete historical archives into each AI prompt.",
        "User-Isolated Tenancy: All retrieval operations are strictly bounded to the authenticated user's account and governed by character and item limits.",
        "Provider Data Use: Personal reflections, journal logs, habit metrics, and chat conversations may be sent to the AI provider configured for the service. The applicable model provider's retention and training terms must be verified and disclosed before production use.",
      ]),
    ],
  },
  {
    heading: "4. Inherent Limitations & Operational Boundaries",
    blocks: [
      paragraph(
        "Users acknowledge and agree to the following inherent limitations of automated AI systems:",
      ),
      list([
        "Probabilistic Output: Generative AI produces probabilistic text. Outputs may occasionally be incomplete, inaccurate, or inconsistent with prior outputs.",
        "No Human Knowledge or Professional Credentials: Kindred is an automated software application. It possesses no human emotion, sentience, independent real-world knowledge, or professional certifications.",
        "Non-Consequential & Non-Clinical Utility: Kindred outputs are intended solely for personal reflection and organizational wellness. They must not be relied upon as the sole basis for consequential personal, legal, financial, or medical decisions.",
      ]),
    ],
  },
  {
    heading: "5. Technical Infrastructure & Providers",
    blocks: [
      list([
        "Production AI Inference: The actual model provider, hosting region, and retention controls must be confirmed from the live service configuration before this disclosure is published.",
        "Planned AI Route: OpenAI-compatible inference through Cloudflare AI Gateway, with the upstream model provider selected after privacy, contract, and quality review. This planned route is not evidence of a completed provider cutover.",
      ]),
    ],
  },
  {
    heading: "6. Canadian Privacy & Generative AI Standards",
    blocks: [
      paragraph(
        "This disclosure is structured to align with the Joint Principles for Generative AI Technologies issued by Canadian Federal, Provincial, and Territorial Privacy Authorities (including the Office of the Privacy Commissioner of Canada - OPC and the Office of the Information and Privacy Commissioner of Alberta - OIPC), upholding the principles of:",
      ),
      list([
        "Meaningful Consent & Transparency: Clear notification prior to user interaction with automated systems.",
        "Appropriate & Proportional Purpose: Restricting AI processing strictly to legitimate wellness coaching features.",
        "Individual Access & Rectification: Enabling users to inspect, export, and delete AI-generated summaries and chat histories upon request.",
      ]),
    ],
  },
];

const cookieSections: LegalSection[] = [
  {
    heading: "1. Scope & Commitment",
    blocks: [
      paragraph(
        'Kindred Asterling AI Coaching ("Kindred", "we", "us", or "our"), operated by Landon Syroid in Edmonton, Alberta, Canada, is committed to transparent and minimal data collection. This Notice explains the essential browser storage technologies, security cookies, and diagnostic tools used on the Kindred web application.',
      ),
      paragraph(
        "We do not engage in third-party behavioral advertising, cross-site tracking, or data brokering.",
      ),
    ],
  },
  {
    heading: "2. Categories of Technologies We Use",
    blocks: [
      subheading("A. Strictly Necessary & Authentication Technologies"),
      paragraph(
        "These technologies are essential for the operation, integrity, and security of the platform. The platform cannot function securely without them.",
      ),
      list([
        "Auth0 Authentication: Session cookies and local storage tokens utilized to maintain authenticated user sessions, verify identity, and defend against cross-site request forgery (CSRF).",
        "Hosting & Infrastructure Security: Technical routing, SSL termination, and DDoS protection headers set by our hosting and edge infrastructure (Contabo GmbH / Cloudflare).",
      ]),
      subheading("B. Functional & Interface Preference Storage"),
      list([
        "Browser LocalStorage: Stores client-side visual preferences, such as light/dark interface mode or user-selected view toggles, directly on your local device.",
      ]),
      subheading("C. Technical Diagnostics & Error Monitoring"),
      list([
        "Application and Hosting Logs: Technical server and infrastructure logs may be used to operate, secure, and troubleshoot the service.",
        "No Third-Party Browser Diagnostics: Kindred does not load a third-party browser analytics or error-reporting SDK.",
      ]),
    ],
  },
  {
    heading: "3. Explicit Exclusion of Advertising Trackers",
    blocks: [
      list([
        "No Advertising Networks: We do not deploy Google Analytics, Meta (Facebook) Pixels, TikTok pixels, or advertising tracking beacons.",
        "No Third-Party Social Widgets: Outbound links to external platforms in our site footer are standard hyperlinks and do not execute third-party tracking scripts or tracking beacons.",
      ]),
    ],
  },
  {
    heading: "4. User Controls & Managing Storage",
    blocks: [
      paragraph(
        "You can adjust your cookie and storage preferences at any time through your web browser settings:",
      ),
      list([
        "Disabling Storage: You can configure your browser to reject cookies or purge local storage caches.",
        "Impact on Core Services: Please note that disabling strictly necessary cookies and local storage will prevent you from signing in or maintaining an active coaching session.",
      ]),
    ],
  },
  {
    heading: "5. Inquiries",
    blocks: [
      paragraph(
        "For questions regarding our use of cookies and storage technologies, contact our Privacy Officer:",
      ),
      list([
        "Email: kindredaicoach@gmail.com",
        "Support: kindred_support@kindred-asterling-ai-coaching.com",
        "Mailing Address: 202 - 10249 119 ST NW, Edmonton, AB T5K 2Y6, Canada",
      ]),
    ],
  },
];

const marketingSections: LegalSection[] = [
  {
    heading: "1. Statutory Background & Standards",
    blocks: [
      paragraph(
        "Under Canada's Anti-Spam Legislation (CASL, SC 2010, c 23, s 10), the Canadian Radio-television and Telecommunications Commission (CRTC) regulations, and Innovation, Science and Economic Development Canada (ISED) guidelines, sending Commercial Electronic Messages (CEMs) requires:",
      ),
      list(
        [
          "Express, opt-in consent obtained prior to sending.",
          "Complete sender identification including physical mailing address and electronic contact.",
          "A functional, no-cost unsubscribe mechanism operational for at least 60 days post-transmission and executed without delay within 10 business days.",
        ],
        true,
      ),
    ],
  },
  {
    heading: "2. Recommended Front-End Opt-In UI Language",
    blocks: [
      paragraph(
        "To be implemented on registration and settings forms as an unchecked by default checkbox:",
      ),
      callout(
        "[ ] Yes, I would like to receive product announcements, coaching insights, and special promotional offers from Kindred Asterling AI Coaching by email. You may withdraw your consent and unsubscribe at any time using the link in any promotional email. Sender: Landon Syroid, operating as Kindred Asterling AI Coaching, 202 - 10249 119 ST NW, Edmonton, AB T5K 2Y6, Canada. Contact: kindred_support@kindred-asterling-ai-coaching.com.",
      ),
    ],
  },
  {
    heading: "3. Mandatory Email Footer Template",
    blocks: [
      paragraph(
        "All promotional and marketing emails dispatched by or on behalf of Kindred must include the following footer block:",
      ),
      callout(
        "You received this email because you opted in to receive news and offers from Kindred Asterling AI Coaching.\n\nSender Identification:\nLandon Syroid d/b/a Kindred Asterling AI Coaching\n202 - 10249 119 ST NW, Edmonton, AB T5K 2Y6, Canada\nSupport Email: kindred_support@kindred-asterling-ai-coaching.com\nTo stop receiving promotional emails, click here to unsubscribe: [Unsubscribe Link]\nUnsubscribe requests are processed immediately and within 10 business days at no cost.",
      ),
    ],
  },
  {
    heading: "4. Technical Record-Keeping & Proof of Consent",
    blocks: [
      paragraph(
        "To satisfy CASL evidentiary requirements, the database must capture an immutable audit log for every consent event:",
      ),
      list([
        "Identifier: Verified user email address and account ID.",
        "Timestamp: ISO 8601 UTC timestamp of affirmative opt-in.",
        "Source Form & URL: Registration screen, checkout modal, or profile preference page.",
        "Exact Policy Version: Text and version identifier of the consent clause displayed.",
        "IP Address & User Agent: Network telemetry recorded at the time of submission.",
        "Withdrawal Tracking: Date, time, and method of unsubscribe requests, with automatic suppression across all integrated email delivery services (e.g., Resend).",
      ]),
    ],
  },
  {
    heading: "5. Separation of Transactional vs. Marketing Communications",
    blocks: [
      paragraph(
        "Service-related communications (such as password resets, billing receipts from Helcim, mandatory security alerts, and direct coaching notifications requested by the user) are transactional messages and must not be bundled with promotional opt-ins or suppressed upon marketing unsubscribe.",
      ),
    ],
  },
];

export function PrivacyPolicy() {
  return (
    <LegalPage
      published
      title="Privacy Policy"
      summary="This Privacy Policy explains how Kindred Asterling AI Coaching collects, uses, safeguards, and discloses personal information."
      governingLaw="Alberta PIPA, PIPEDA & Canadian Privacy Law"
      pdfHref="/legal-documents/privacy-policy.pdf"
      sections={privacySections}
    />
  );
}

export function TermsAndConditions() {
  return (
    <LegalPage
      published
      title="Terms and Conditions"
      summary="These Terms and Conditions govern access to and use of the Kindred Asterling AI Coaching service."
      governingLaw="Province of Alberta & Federal Laws of Canada"
      pdfHref="/legal-documents/terms-and-conditions-of-service.pdf"
      sections={termsSections}
    />
  );
}

export function HealthDisclaimer() {
  return (
    <LegalPage
      published
      title="Health Information Disclaimer"
      summary="Kindred is an informational wellness and coaching tool. It is not a healthcare provider or emergency service."
      pdfHref="/legal-documents/health-information-and-non-clinical-disclaimer.pdf"
      sections={healthSections}
    />
  );
}

export function AIUseDisclosure() {
  return (
    <LegalPage
      published
      title="AI Use Disclosure"
      summary="This disclosure explains where Kindred uses AI, what context may be supplied, and the limitations of AI-generated output."
      pdfHref="/legal-documents/ai-use-and-transparency-disclosure.pdf"
      sections={transparencySections}
    />
  );
}

export function CookieNotice() {
  return (
    <LegalPage
      published
      title="Cookie and Analytics Notice"
      summary="This notice explains the essential browser storage technologies, security cookies, and diagnostic tools used by Kindred."
      pdfHref="/legal-documents/cookie-and-tracking-technologies-notice.pdf"
      sections={cookieSections}
    />
  );
}

export function MarketingConsent() {
  return (
    <LegalPage
      published
      title="Marketing Consent Language"
      summary="This document explains optional marketing consent, unsubscribe choices, and Kindred's commercial email requirements."
      pdfHref="/legal-documents/marketing-consent-and-casl-compliance-protocol.pdf"
      sections={marketingSections}
    />
  );
}
