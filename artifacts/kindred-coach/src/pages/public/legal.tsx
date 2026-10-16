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

/** Bump both whenever any published legal text changes. */
export const LEGAL_VERSION = "1.3";
export const LEGAL_EFFECTIVE_DATE = "October 17, 2026";

function LegalPage({
  published = false,
  title,
  summary,
  governingLaw,
  pdfHref,
  sections,
}: LegalPageProps) {
  const metadata = [
    [
      "Version",
      published ? LEGAL_VERSION : `${LEGAL_VERSION} (Final Review Draft)`,
    ],
    ["Effective date", LEGAL_EFFECTIVE_DATE],
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

const PRIVACY_EMAIL = "kindredaicoach@gmail.com";
const SUPPORT_EMAIL = "kindred_support@kindred-asterling-ai-coaching.com";
const MAILING_ADDRESS =
  "202 - 10249 119 ST NW, Edmonton, AB T5K 2Y6, Canada";

const contactList = list([
  `Privacy Officer (privacy questions, access and deletion requests): Landon Syroid, ${PRIVACY_EMAIL}`,
  `Customer and account support, billing and refunds: ${SUPPORT_EMAIL}`,
  `Mailing address: ${MAILING_ADDRESS}`,
]);

const privacySections: LegalSection[] = [
  {
    heading: "1. Who We Are & How to Reach Our Privacy Officer",
    blocks: [
      paragraph(
        'Kindred Asterling AI Coaching ("Kindred", "we", "us", or "our") is an Alberta sole proprietorship owned and operated by Landon Syroid in Edmonton, Alberta, Canada. Landon Syroid is our Privacy Officer and is responsible for how we handle personal information.',
      ),
      paragraph(
        "We handle personal information under the Alberta Personal Information Protection Act (PIPA, SA 2003, c P-6.5) and, where it applies, the federal Personal Information Protection and Electronic Documents Act (PIPEDA, SC 2000, c 5). This policy applies to the Kindred web app at kindred-asterling-ai-coaching.com and to our website at kindred-asterling-ai.xyz.",
      ),
      contactList,
    ],
  },
  {
    heading: "2. Personal Information We Collect",
    blocks: [
      paragraph(
        "We collect the information you give us and a small amount of technical information needed to run the Service:",
      ),
      list(
        [
          "Account information: your email address, name, email verification status, and sign-in identifiers from our sign-in provider, Auth0. If you sign in with Google, Google shares your name, email address and profile picture with us.",
          "Profile and onboarding information: your preferred name and, if you choose to give them, your birthday, a short bio, and what you share about your struggles, strengths and interests.",
          "Wellness and coaching information: morning check-ins, evening reflections, mood scores, body scan notes, habits, medication names, doses, schedules and notes, personal goals, journal entries, and your conversations with the AI coach. Some of this is health information, which we treat as sensitive.",
          "Voice recordings: if you use voice features, the audio you record is sent for transcription and the coach's reply may be turned into speech. We do not keep the audio after it is transcribed.",
          "Reminder settings: the reminders you set up, your timezone, and, if you turn on text-message reminders, your mobile phone number. We keep a record of reminders sent.",
          "Subscription and beta information: your plan (Yearly or Lifetime Access), payment references and transaction IDs from our payment processor, Helcim, and, if you joined the beta, your beta access record. We never see or store your full card number.",
          "Usage and technical information: a daily count of chat messages (to apply the daily message limit), security events, error logs, and error reports and performance samples sent to our error-monitoring provider. Your IP address is used briefly to limit abusive traffic; our application logs do not record your IP address or the content of your entries.",
        ],
        true,
      ),
      paragraph(
        "You choose what wellness information to enter. Most profile and wellness fields are optional, and you can edit or delete them at any time.",
      ),
    ],
  },
  {
    heading: "3. Why We Use Your Information",
    blocks: [
      list([
        "To provide the coaching chat, check-ins, reflections, habit and medication tracking, and progress views you ask for.",
        "To personalize coaching replies using the parts of your history that relate to what you are talking about (see our AI Use Disclosure).",
        "To send the reminders you set up by email or text message.",
        "To manage your account, beta access and subscription, and to process payments and refunds.",
        "To keep the Service secure, prevent abuse, and fix problems.",
        "To understand how features are used so we can improve them (see Product Analytics in section 4).",
        "To meet our legal, tax and accounting obligations.",
      ]),
      paragraph(
        "We do not sell your personal information, and we do not use it for advertising. We do not use your wellness information or conversations to train AI models. Under Anthropic's commercial terms, Anthropic does not use requests sent through its API to train its models.",
      ),
    ],
  },
  {
    heading: "4. Service Providers & Storage Outside Canada",
    blocks: [
      paragraph(
        "We use the service providers below. Each receives only the information it needs for its task. Some are located outside Canada, mainly in the United States. Information stored or processed outside Canada is subject to the laws of that country and may be accessed by its courts, law enforcement and national security authorities.",
      ),
      list([
        "Hosting and database - DigitalOcean (Toronto, Ontario, Canada): runs the Kindred app and stores your account in a managed PostgreSQL database.",
        "AI coaching - Anthropic (United States): Claude models generate coaching replies. The message you send, recent conversation history and the related wellness information described in our AI Use Disclosure are sent to Anthropic for each reply. Anthropic's commercial API terms govern how long it keeps these requests.",
        "Sign-in - Auth0 by Okta (Canadian region): account sign-in and session security.",
        "Payments - Helcim (Calgary, Alberta, Canada): checkout, subscription billing and refunds.",
        "Email - Resend (United States): account emails and email reminders.",
        "Text messages - Twilio (United States): text-message reminders, only if you turn them on.",
        "Voice - ElevenLabs (United States): speech-to-text and text-to-speech, only when you use voice features.",
        "Website and network - Cloudflare (global network): DNS for the app domain, and hosting of our website at kindred-asterling-ai.xyz, including request logs for that website.",
        "Web fonts - Google Fonts (United States): pages load fonts from Google, which receives your IP address and browser details when a page loads.",
        "Error monitoring - Sentry (United States): when something goes wrong in the app or on our servers, Sentry receives an error report, and a sample of performance data: the error message and where in our code it happened, the page or API route involved, your browser, operating system and device type, and timing information. We configure Sentry not to store IP addresses, the content of your entries or chat messages, or request bodies, and error reports are not linked to your name or email address.",
        "Product analytics - Amplitude (United States): our servers report actions such as \"Morning Check-in Completed\" or \"Habit Logged\" under a scrambled identifier, with no name, email or entry content. Where our coaching-chat analytics are switched on, Amplitude also receives the text of chat messages and coaching replies, with automated redaction of personal identifiers, and the names of the information the coach looked up (for example, medication status), linked to your account ID.",
      ]),
      paragraph(
        `You can ask our Privacy Officer at ${PRIVACY_EMAIL} for written information about how we use service providers outside Canada, or any question about them.`,
      ),
    ],
  },
  {
    heading: "5. Google Sign-In & Former Google Calendar Integration",
    blocks: [
      list([
        "Google sign-in: if you sign in with Google, we receive only your basic profile (name, email address, profile picture). Our use of information received from Google APIs follows the Google API Services User Data Policy, including its Limited Use requirements. It is never sold, used for advertising, or used to train AI models.",
        "Calendar removed: Kindred no longer connects to Google Calendar. Connection tokens saved before the integration was removed can no longer be decrypted or used, and they are deleted.",
        "You can remove Kindred from the third-party connections in your Google Account at any time.",
      ]),
    ],
  },
  {
    heading: "6. How Long We Keep Information",
    blocks: [
      list([
        "Account, profile, wellness and coaching information: until you delete it or delete your account.",
        "Reminder delivery records and daily message counts: while your account is open.",
        "Database backups: kept by our hosting provider for no more than 35 days. Deleted information may remain in a backup until that backup expires; we do not restore deleted accounts from backups.",
        "Server and security logs: no more than 12 months.",
        "Error reports and performance data held by Sentry: no more than 90 days.",
        "Payment and transaction records held by Helcim: as long as tax and accounting law requires, up to 7 years.",
      ]),
    ],
  },
  {
    heading: "7. Your Rights: Access, Correction, Export & Deletion",
    blocks: [
      paragraph("You can:"),
      list([
        "Download a copy of your data at any time with \"Download my data\" in the app, or ask us for access to the personal information we hold about you and how it has been used and disclosed.",
        "Correct your information in the app, or ask us to correct it.",
        "Delete your account in the app. This cancels any Yearly renewal and immediately deletes your account and everything stored with it from our live database.",
        "Withdraw consent to optional processing, such as text-message reminders or voice features, by turning them off in the app.",
      ]),
      callout(
        `When you delete your account, we cancel any Yearly renewal with Helcim before anything is deleted, so you will not be charged again. If we cannot reach Helcim to cancel it, nothing is deleted and the app asks you to try again; you can also email ${SUPPORT_EMAIL}.\n\nTo also have your sign-in record at Auth0 and analytics records at Amplitude deleted, email our Privacy Officer and we will delete them within 30 days.`,
      ),
      paragraph(
        `To make a request, email our Privacy Officer at ${PRIVACY_EMAIL}. We will confirm your identity and respond within 30 days. If you are not satisfied with our response, you can complain to the Office of the Information and Privacy Commissioner of Alberta (oipc.ab.ca) or, where federal law applies, the Office of the Privacy Commissioner of Canada (priv.gc.ca).`,
      ),
    ],
  },
  {
    heading: "8. Security & Breach Notification",
    blocks: [
      paragraph(
        "We protect information with encryption in transit (HTTPS), a managed database that our hosting provider encrypts at rest, access to production data limited to the proprietor, and automated scanning of our software dependencies for known vulnerabilities. No system is perfectly secure.",
      ),
      paragraph(
        "If a loss of or unauthorized access to personal information creates a real risk of significant harm, we will notify the Information and Privacy Commissioner of Alberta without unreasonable delay, as section 34.1 of PIPA requires, and we will notify the people affected.",
      ),
    ],
  },
  {
    heading: "9. Age & Changes to This Policy",
    blocks: [
      paragraph(
        "Kindred is only for adults aged 18 and older. We do not knowingly collect personal information from anyone under 18; if we learn we have, we delete it.",
      ),
      paragraph(
        "When we change this policy, we update the version and effective date at the top of this page. If a change materially affects how we use information we already hold, we will tell you by email or in the app before it takes effect.",
      ),
    ],
  },
];

const termsSections: LegalSection[] = [
  {
    heading: "1. Agreement to Terms & Eligibility",
    blocks: [
      paragraph(
        'These Terms and Conditions ("Terms") are an agreement between you and Landon Syroid, operating as Kindred Asterling AI Coaching ("Kindred", "we", "us", or "our"), for the Kindred web app and related services (the "Service").',
      ),
      paragraph(
        "By creating an account or using the Service, you agree to these Terms. Our Privacy Policy explains how we handle your personal information. If you do not agree, do not use the Service.",
      ),
      paragraph(
        "You must be at least 18 years old to create an account or use the Service.",
      ),
    ],
  },
  {
    heading: "2. What Kindred Is & Is Not",
    blocks: [
      paragraph(
        "Kindred provides AI-assisted personal coaching, reflection journaling, habit and medication tracking, reminders, and progress views. Coaching replies are written by an AI system, not a person.",
      ),
      callout(
        "IMPORTANT: KINDRED IS A WELLNESS AND PERSONAL DEVELOPMENT TOOL. IT IS NOT A HEALTHCARE PROVIDER, THERAPIST, CRISIS SERVICE, OR FINANCIAL ADVISOR, AND IT DOES NOT PROVIDE MEDICAL, PSYCHOLOGICAL, LEGAL, OR FINANCIAL ADVICE. IF YOU ARE IN CRISIS OR DANGER, CALL 911, OR CALL OR TEXT 9-8-8 IN CANADA OR THE UNITED STATES. SEE OUR HEALTH INFORMATION DISCLAIMER.",
      ),
      list([
        "AI output can be wrong, incomplete or inappropriate. Use your own judgment and check important information with a qualified professional.",
        "Daily message limit: to keep the Service available for everyone, coaching chat is limited to a number of messages per day (currently 100). We may change this limit.",
        "Beta access: during our beta, some accounts receive free access. Beta access may change, be limited to a set number of people, or end, and beta features may be incomplete.",
      ]),
    ],
  },
  {
    heading: "3. Plans, Billing, Cancellation & Refunds",
    blocks: [
      subheading("A. Prices & Payment"),
      list([
        "Plans: Yearly ($49.99 CAD per year) and Lifetime Access ($79.99 CAD, one payment). Prices are in Canadian dollars and do not include applicable sales taxes, which are added at checkout.",
        "Payments are processed by Helcim. We never see or store your full card number.",
        "The price, taxes and plan terms shown at checkout apply to your purchase. After you buy, you will receive a receipt by email.",
      ]),
      subheading("B. Yearly Plans Renew Automatically"),
      list([
        "A Yearly plan renews automatically every year and is charged to your saved payment method at the start of each renewal year, until you cancel.",
        "If the yearly price changes, we will email you at least 30 days before the renewal that the new price applies to.",
        `You can cancel renewal at any time from the billing link in your Profile, or by emailing ${SUPPORT_EMAIL}. Cancelling stops future renewals; you keep access until the end of the year you paid for.`,
        `Deleting your Kindred account cancels renewal with Helcim automatically before anything is deleted, so you will not be charged again, and ends your access right away. If the cancellation cannot be completed, your account is not deleted; try again, or email ${SUPPORT_EMAIL}.`,
      ]),
      subheading("C. 30-Day Refund"),
      paragraph(
        `If you are not satisfied, you can ask for a full refund within 30 days of your first Yearly payment or your Lifetime Access payment. Email ${SUPPORT_EMAIL}. We refund to your original payment method within 15 days of approving the request. This does not limit any refund or cancellation right you have under the consumer protection law where you live.`,
      ),
      subheading('D. What "Lifetime Access" Means'),
      paragraph(
        '"Lifetime Access" means access to Kindred\'s core features, including features we add to the core plan later, for as long as we operate the Service. It is tied to the life of the Service, not your lifetime. If we decide to shut down the Service, we will email Lifetime Access holders at least 60 days before it closes, and you will be able to download your data before then.',
      ),
    ],
  },
  {
    heading: "4. Acceptable Use",
    blocks: [
      paragraph("You agree not to:"),
      list([
        "Use the Service for anything unlawful, harassing, defamatory, fraudulent or harmful.",
        "Reverse-engineer, decompile, scrape or crawl the Service, or try to extract its source code or prompts.",
        "Interfere with the security or performance of the Service, or get around the daily message limit or other limits.",
        "Enter another person's health or confidential information without their permission.",
        "Share your account with someone else.",
        "Rely on AI output for emergency, medical, psychiatric or other life-critical decisions.",
      ]),
    ],
  },
  {
    heading: "5. Your Content & Our Intellectual Property",
    blocks: [
      list([
        "Your content: you own what you enter into the Service. You give Kindred a limited, non-exclusive, royalty-free licence to host, process and display it only as needed to run the Service for you and as described in our Privacy Policy. This licence ends when you delete the content or your account, except for copies that remain in backups until they expire.",
        "AI replies: you may use the coaching replies you receive for your own personal purposes.",
        "Kindred: the software, design, branding and documentation of the Service belong to Landon Syroid and are protected by intellectual property laws.",
      ]),
    ],
  },
  {
    heading: "6. Suspension & Ending the Agreement",
    blocks: [
      list([
        "You can stop using the Service at any time and delete your account from the app.",
        "We may suspend or close an account that seriously or repeatedly breaks these Terms, or where needed to protect people or the Service. Where reasonable, we will tell you first and give you a chance to fix the problem and download your data.",
        "If we close a paid account without cause, we will refund the unused part of a Yearly plan, or a fair share of a Lifetime Access payment.",
      ]),
    ],
  },
  {
    heading: "7. Disclaimer of Warranties",
    blocks: [
      callout(
        'TO THE EXTENT THE LAW ALLOWS, THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE", WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE AND NON-INFRINGEMENT. WE DO NOT PROMISE THAT THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE OR ACCURATE. SOME LAWS, INCLUDING CONSUMER PROTECTION LAWS, DO NOT ALLOW THESE WARRANTIES TO BE EXCLUDED; WHERE THEY APPLY, THIS SECTION DOES NOT.',
      ),
    ],
  },
  {
    heading: "8. Limitation of Liability",
    blocks: [
      callout(
        "TO THE EXTENT THE LAW ALLOWS, KINDRED, ITS PROPRIETOR, CONTRACTORS AND SUPPLIERS ARE NOT LIABLE FOR INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY OR PUNITIVE DAMAGES, OR FOR LOST PROFITS, DATA OR GOODWILL, ARISING FROM YOUR USE OF OR INABILITY TO USE THE SERVICE.",
      ),
      paragraph(
        "TO THE EXTENT THE LAW ALLOWS, OUR TOTAL LIABILITY FOR ALL CLAIMS RELATING TO THE SERVICE OR THESE TERMS IS LIMITED TO THE GREATER OF (1) THE AMOUNT YOU PAID US IN THE 12 MONTHS BEFORE THE EVENT THAT GAVE RISE TO THE CLAIM, OR (2) FIFTY CANADIAN DOLLARS ($50.00 CAD).",
      ),
      paragraph(
        "NOTHING IN THESE TERMS LIMITS OR EXCLUDES LIABILITY FOR DEATH OR PERSONAL INJURY CAUSED BY NEGLIGENCE, FOR FRAUD OR WILFUL MISCONDUCT, OR ANY RIGHT YOU HAVE UNDER CONSUMER PROTECTION LAW THAT CANNOT BE WAIVED, INCLUDING UNDER THE ALBERTA CONSUMER PROTECTION ACT (RSA 2000, c C-26.3).",
      ),
    ],
  },
  {
    heading: "9. Disputes & Governing Law",
    blocks: [
      subheading("A. Talk to Us First"),
      paragraph(
        `Before starting a legal claim, please contact us at ${SUPPORT_EMAIL} and give us 30 days to try to resolve the problem. This does not stop you from contacting a consumer protection agency, and it does not apply to urgent claims or limitation deadlines.`,
      ),
      subheading("B. Governing Law & Courts"),
      paragraph(
        "These Terms are governed by the laws of the Province of Alberta and the federal laws of Canada that apply there. Disputes will be heard by the courts of Alberta sitting in Edmonton, including the Alberta Court of Justice for smaller claims.",
      ),
      paragraph(
        "If you are a consumer and the law where you live gives you the right to have that law apply or to bring a claim in your local courts, these Terms do not take that right away.",
      ),
    ],
  },
  {
    heading: "10. Changes to These Terms & General",
    blocks: [
      list([
        "We may update these Terms. We will post the new version with a new effective date and, for changes that materially affect you, email you at least 30 days before they take effect. If you do not agree, you can cancel and stop using the Service before the change takes effect; if you are within a paid period, you can ask for a refund of the unused part of a Yearly plan.",
        "If any part of these Terms is found unenforceable, the rest still applies.",
        "These Terms, the Privacy Policy and the documents they refer to are the whole agreement between you and Kindred about the Service.",
        "You may not transfer your account or these Terms. We may transfer them to a business that takes over the Service, and we will tell you if we do.",
      ]),
    ],
  },
  {
    heading: "11. Contact",
    blocks: [contactList],
  },
];

const healthSections: LegalSection[] = [
  {
    heading: "1. Kindred Is Not Medical or Clinical Care",
    blocks: [
      paragraph(
        'Kindred Asterling AI Coaching ("Kindred", "we", "us", or "our"), operated by Landon Syroid in Edmonton, Alberta, Canada, is an AI-assisted wellness coaching and personal reflection app. Coaching replies are written by an AI system, not a person.',
      ),
      callout(
        "KINDRED IS NOT A LICENSED HEALTHCARE PROVIDER, THERAPIST, MEDICAL CLINIC, CRISIS SERVICE, OR PSYCHIATRIC FACILITY.",
      ),
      list([
        "No medical or therapeutic advice: AI coaching replies, reflection prompts, body scan notes and progress views are for personal reflection and general information only.",
        "No diagnosis or treatment: Kindred does not diagnose, treat, prevent or cure any physical or mental health condition. It does not replace a physician, psychiatrist, psychologist, counsellor or other healthcare professional.",
        "Using Kindred alongside care: you may use Kindred to organize your thoughts, including before appointments, but decisions about your health belong with you and your care providers.",
      ]),
    ],
  },
  {
    heading: "2. Medication & Habit Tracking",
    blocks: [
      paragraph(
        "Medication tracking and reminders are a personal log you set up yourself.",
      ),
      list([
        "Kindred does not prescribe, review, adjust or check medications, doses or schedules.",
        "Kindred does not check for drug interactions, side effects or whether a medication is right for you.",
        "Reminders can be delayed or fail. Do not rely on Kindred as your only reminder for doses that matter to your health.",
        "Talk to your doctor or pharmacist before starting, changing or stopping any medication or supplement.",
      ]),
    ],
  },
  {
    heading: "3. Emergencies & Crisis Support",
    blocks: [
      paragraph(
        "Kindred is not monitored by people and cannot respond to emergencies. The AI may not recognize that you are in crisis.",
      ),
      callout(
        "If you are in danger or thinking about harming yourself, get help now:\n- Call 911, or go to the nearest emergency department.\n- In Canada or the United States, call or text 9-8-8 for the Suicide Crisis Helpline (Canada) or the 988 Suicide & Crisis Lifeline (United States).\n- Elsewhere, contact your local emergency number or crisis line (findahelpline.com lists services by country).",
      ),
    ],
  },
  {
    heading: "4. No Guaranteed Outcomes",
    blocks: [
      paragraph(
        "We do not promise any particular personal, psychological, career or physical result from using Kindred.",
      ),
      paragraph(
        "AI output can be wrong. Check important information and use your own judgment before acting on any coaching reply.",
      ),
    ],
  },
  {
    heading: "5. Adults Only",
    blocks: [
      paragraph(
        "Kindred is only for adults aged 18 and older and is not directed to anyone under 18.",
      ),
    ],
  },
];

const transparencySections: LegalSection[] = [
  {
    heading: "1. Scope & Purpose",
    blocks: [
      paragraph(
        'Kindred Asterling AI Coaching ("Kindred", "we", "us", or "our"), an Alberta sole proprietorship operated by Landon Syroid in Edmonton, Alberta, Canada, uses generative AI to write coaching replies. This disclosure explains where AI is used, what information it receives, who provides it, and its limits.',
      ),
      paragraph(
        "When you chat with Kindred, you are talking to an AI system, not a person.",
      ),
    ],
  },
  {
    heading: "2. Where AI Is Used",
    blocks: [
      list([
        "Coaching chat: AI writes the coach's replies to the messages you send. Onboarding questions are pre-written, but your onboarding answers become part of the conversation history the AI sees.",
        "Voice (when you use it): your recording is transcribed to text by ElevenLabs before it is sent to the coach, and the coach's reply may be read aloud using an AI voice.",
      ]),
      paragraph(
        "AI does not make decisions about your account, access, billing or eligibility.",
      ),
    ],
  },
  {
    heading: "3. What Information the AI Receives",
    blocks: [
      paragraph("For each coaching reply, the AI provider receives:"),
      list([
        "The message you just sent and recent conversation history (up to the last 24 messages).",
        "Your preferred name and any profile details you chose to give: birthday, bio, struggles, strengths and interests.",
        "When relevant to what you are discussing, recent records from your account: morning check-ins, evening reflections, body scans, habits and streaks, and today's medications, including names, doses, status and notes.",
      ]),
      paragraph(
        "Kindred selects only the categories that relate to your current message, from your own account only, and limits how many records and characters are sent. It does not send your whole history with every message.",
      ),
    ],
  },
  {
    heading: "4. AI Providers & Data Use",
    blocks: [
      list([
        "AI model: coaching replies are generated by Anthropic's Claude models through the Anthropic API, processed in the United States. Anthropic's commercial API terms govern how long it keeps requests. Under those terms, Anthropic does not use API requests to train its models.",
        "Kindred does not use your conversations or wellness information to train AI models.",
        "Analytics: where our coaching-chat analytics are switched on, Amplitude (United States) receives the text of chat messages and replies, with automated redaction of personal identifiers. See section 4 of our Privacy Policy.",
        "Your control: you can download your conversations with \"Download my data\" and delete them by deleting your account.",
      ]),
    ],
  },
  {
    heading: "5. Limits of AI",
    blocks: [
      list([
        "AI output is probabilistic. Replies can be inaccurate, incomplete, inconsistent or inappropriate.",
        "The AI has no feelings, professional credentials or clinical training, and it does not know facts about you beyond what is described in section 3.",
        "Do not rely on AI replies as the only basis for health, legal, financial or other important decisions, and never in an emergency. See our Health Information Disclaimer.",
      ]),
    ],
  },
  {
    heading: "6. Canadian Privacy Principles for Generative AI",
    blocks: [
      paragraph(
        "This disclosure follows the Principles for responsible, trustworthy and privacy-protective generative AI technologies issued in December 2023 by Canada's federal, provincial and territorial privacy commissioners, including the Office of the Privacy Commissioner of Canada and the Office of the Information and Privacy Commissioner of Alberta. In particular, we:",
      ),
      list([
        "Tell you that you are interacting with AI and what information it receives.",
        "Limit AI use to the coaching features you ask for.",
        "Let you access, download and delete your conversations.",
      ]),
    ],
  },
];

const cookieSections: LegalSection[] = [
  {
    heading: "1. Scope",
    blocks: [
      paragraph(
        'This notice explains the cookies, browser storage and other technologies used by the Kindred app (kindred-asterling-ai-coaching.com) and website (kindred-asterling-ai.xyz), operated by Landon Syroid as Kindred Asterling AI Coaching ("Kindred", "we", "us", or "our") in Edmonton, Alberta, Canada.',
      ),
      paragraph(
        "We do not use advertising cookies, cross-site tracking or data brokers.",
      ),
    ],
  },
  {
    heading: "2. What We Use",
    blocks: [
      subheading("A. Strictly Necessary"),
      list([
        "Sign-in (Auth0): Auth0 sets cookies on its sign-in pages to keep you signed in and protect against forged requests. The app keeps your sign-in tokens in memory rather than in browser storage.",
        "Security and delivery (DigitalOcean and Cloudflare): our hosting and network providers may set security cookies, such as bot-protection cookies, and use request information to route traffic and block attacks.",
      ]),
      subheading("B. Preferences"),
      list([
        "Browser local storage: remembers your colour theme (kindred-theme) and whether the sidebar is collapsed (kindred:sidebar-collapsed). This stays on your device.",
      ]),
      subheading("C. Third-Party Resources"),
      list([
        "Google Fonts: our pages load fonts from Google, which receives your IP address and browser details when a page loads.",
        "Checkout: payment pages are hosted by Helcim on its own site, under Helcim's own cookie and privacy policies.",
      ]),
      subheading("D. Logs & Analytics"),
      list([
        "Server logs: our servers and hosting providers keep technical logs to run and secure the Service. App logs do not record your IP address or the content of your entries.",
        "Website logs: Cloudflare keeps request logs for our website at kindred-asterling-ai.xyz.",
        "Error monitoring: if an error happens in your browser, the app sends an error report and performance timing to Sentry, as described in section 4 of our Privacy Policy. The monitoring code is part of the app itself, not a separate tracking script, and it does not set cookies.",
        "Product analytics: our servers send usage events to Amplitude, as described in section 4 of our Privacy Policy. No analytics cookies or tracking scripts are placed in your browser.",
        "We do not use Google Analytics, Meta (Facebook) Pixel, TikTok Pixel or other advertising trackers. Links to other sites are plain links with no tracking scripts.",
      ]),
    ],
  },
  {
    heading: "3. Your Choices",
    blocks: [
      list([
        "You can block or delete cookies and local storage in your browser settings.",
        "If you block the strictly necessary cookies, you will not be able to sign in.",
      ]),
    ],
  },
  {
    heading: "4. Contact",
    blocks: [contactList],
  },
];

const marketingSections: LegalSection[] = [
  {
    heading: "1. Messages We Send Today",
    blocks: [
      paragraph(
        "Kindred currently sends only messages you need or ask for:",
      ),
      list([
        "Account messages: sign-in, verification and security emails, and payment receipts from Helcim.",
        "Reminders you set up: check-in, habit and medication reminders, by email or, if you turn it on, by text message. Reminder text such as \"Time for your medication dose\" may appear on your lock screen.",
      ]),
      paragraph(
        "We do not currently send promotional emails or texts, and we do not sell or share your email address or phone number for marketing.",
      ),
    ],
  },
  {
    heading: "2. Stopping Reminders",
    blocks: [
      list([
        "Turn reminders, email reminders or text-message reminders off at any time on the Reminders page in the app.",
        "Reply STOP to any Kindred text message to stop text messages.",
        "Account and security messages are part of the Service and continue while you have an account.",
      ]),
    ],
  },
  {
    heading: "3. If We Send Promotional Messages",
    blocks: [
      paragraph(
        "If we start sending promotional messages, we will follow Canada's Anti-Spam Legislation (CASL, SC 2010, c 23):",
      ),
      list([
        "We will only send them to people who choose to receive them, using an opt-in that is unchecked by default and separate from accepting our Terms.",
        "Every promotional message will identify Landon Syroid, operating as Kindred Asterling AI Coaching, with our mailing address and contact email.",
        "Every promotional message will include a free unsubscribe link that works for at least 60 days. We will act on unsubscribe requests within 10 business days.",
        "Unsubscribing from promotions will not stop account messages or reminders you set up.",
      ]),
    ],
  },
  {
    heading: "4. Contact",
    blocks: [contactList],
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
      summary="This disclosure explains where Kindred uses AI, what information the AI receives, who provides it, and the limits of AI-generated replies."
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
      summary="This notice explains the cookies, browser storage, third-party resources and analytics used by the Kindred app and website."
      pdfHref="/legal-documents/cookie-and-tracking-technologies-notice.pdf"
      sections={cookieSections}
    />
  );
}

export function MarketingConsent() {
  return (
    <LegalPage
      published
      title="Email, Text & Marketing Messages"
      summary="This notice explains the emails and text messages Kindred sends, how to stop them, and how we handle consent for any promotional messages."
      pdfHref="/legal-documents/marketing-consent-and-casl-compliance-protocol.pdf"
      sections={marketingSections}
    />
  );
}
