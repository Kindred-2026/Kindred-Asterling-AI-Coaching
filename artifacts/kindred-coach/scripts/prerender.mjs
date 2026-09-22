/**
 * Post-build prerender script.
 *
 * Runs after `vite build` to generate route-specific static HTML files for
 * every public marketing page. Each file gets its own <head> metadata
 * (title, description, canonical, Open Graph, Twitter Card, robots) and the
 * server-rendered page body — making content visible to AI crawlers, social
 * bots, and search engines without running JavaScript.
 *
 * Usage (called automatically by the `build` npm script):
 *   node scripts/prerender.mjs
 */

import { execSync } from "child_process";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import {
  PRIMARY_PAGES,
  SECONDARY_PAGES,
  LEGACY_PRIMARY_ROUTE_REDIRECTS,
  signedInPage,
} from "../src/lib/routing.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

// ---------------------------------------------------------------------------
// Route definitions
// ---------------------------------------------------------------------------

const SITE_NAME = "Kindred Asterling";

const ROUTES = [
  // Private routes receive metadata and an empty SPA shell, never member data.
  ...Object.keys({
    ...PRIMARY_PAGES,
    ...SECONDARY_PAGES,
    ...LEGACY_PRIMARY_ROUTE_REDIRECTS,
  }).map((path) => {
    const page = signedInPage(path);
    return {
      path,
      canonicalPath: page.canonicalPath,
      outputFile: `${path.slice(1)}/index.html`,
      title: `${page.title} | ${SITE_NAME}`,
      description: "Sign in to access your Kindred workspace.",
      ogTitle: `${page.title} | ${SITE_NAME}`,
      ogDescription: "Your private Kindred workspace.",
      robots: "noindex, nofollow",
      private: true,
    };
  }),
  {
    path: "/",
    outputFile: "index.html",
    title: "Kindred Asterling — AI Coaching",
    description:
      "Kindred Asterling is your personal daily wellness companion and AI coach. Track habits, medications, and journal with AI support grounded in cognitive neuroscience.",
    ogTitle: "Kindred Asterling — AI Coaching",
    ogDescription:
      "Your personal daily wellness companion and AI coach — grounded in cognitive neuroscience.",
    robots: "index, follow",
  },
  {
    path: "/about",
    outputFile: "about/index.html",
    title: `About ${SITE_NAME} | AI Wellness Companion`,
    description:
      "Built from curiosity about the human brain. Learn how Kindred Asterling uses AI coaching informed by cognitive neuroscience to support your daily wellness journey.",
    ogTitle: `About ${SITE_NAME}`,
    ogDescription:
      "Built from curiosity about the human brain — an AI companion grounded in cognitive neuroscience.",
    robots: "index, follow",
    schema: "article",
  },
  {
    path: "/science",
    outputFile: "science/index.html",
    title: `The Science Behind ${SITE_NAME} | AI Wellness Coach`,
    description:
      "Kindred Asterling's approach is grounded in the neuroscience of habit, motivation, and change — drawing on the work of Marc Lewis, Kevin McCauley, Judith Grisel, and the ACE framework.",
    ogTitle: `The Science Behind ${SITE_NAME}`,
    ogDescription:
      "Habit, motivation, and change — the neuroscience framework behind Kindred Asterling.",
    robots: "index, follow",
    schema: "article",
  },
  {
    path: "/pricing",
    outputFile: "pricing/index.html",
    title: `${SITE_NAME} Pricing | AI Wellness Companion Plans`,
    description:
      "Compare Kindred Asterling plans and get started. AI-supported wellness check-ins, habit and medication tracking, and personal coaching — available as a yearly or lifetime membership.",
    ogTitle: `${SITE_NAME} Pricing`,
    ogDescription:
      "Compare plans for Kindred Asterling and get started with AI-supported wellness coaching.",
    robots: "index, follow",
    schema: {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "Kindred Asterling — AI Coaching",
      applicationCategory: "HealthApplication",
      operatingSystem: "Web",
      url: "https://kindred-asterling-ai-coaching.com/",
      description:
        "An AI wellness companion grounded in cognitive neuroscience — daily journaling, habit tracking, medication adherence, and personalized coaching with Kindred.",
      publisher: {
        "@type": "Organization",
        name: "Kindred Asterling",
        url: "https://kindred-asterling-ai-coaching.com/",
      },
      offers: [
        {
          "@type": "Offer",
          name: "Yearly Plan",
          price: "49.99",
          priceCurrency: "USD",
          description:
            "Full access to Kindred AI coaching — daily rhythm, medication & behavior tracking, self-assessments, journal, and progress view. Billed annually.",
          eligibleDuration: "P1Y",
          url: "https://kindred-asterling-ai-coaching.com/pricing",
        },
        {
          "@type": "Offer",
          name: "Lifetime Plan",
          price: "79.99",
          priceCurrency: "USD",
          description:
            "One payment for lifetime access to Kindred AI coaching — all current features and all future updates included.",
          url: "https://kindred-asterling-ai-coaching.com/pricing",
        },
      ],
    },
  },
  {
    path: "/payment-success",
    outputFile: "payment-success/index.html",
    title: `Payment Successful | ${SITE_NAME}`,
    description: "Your payment was received. Accessing Kindred Asterling.",
    ogTitle: `Payment Successful | ${SITE_NAME}`,
    ogDescription: "Your payment was received.",
    robots: "noindex, nofollow",
  },
  ...[
    ["privacy", "Privacy Policy", "How Kindred handles personal information."],
    ["terms", "Terms and Conditions", "Terms for using the Kindred service."],
    [
      "health-disclaimer",
      "Health Information Disclaimer",
      "Important boundaries for Kindred's wellness and coaching features.",
    ],
    [
      "ai-disclosure",
      "AI Use Disclosure",
      "How Kindred uses AI and relevant user context.",
    ],
    [
      "cookies",
      "Cookie and Analytics Notice",
      "Essential browser technologies used by Kindred.",
    ],
    [
      "marketing-consent",
      "Marketing Consent Language",
      "Marketing consent and unsubscribe information for Kindred communications.",
    ],
  ].map(([slug, label, description]) => ({
    path: `/legal/${slug}`,
    outputFile: `legal/${slug}/index.html`,
    title: `${label} | ${SITE_NAME}`,
    description,
    ogTitle: `${label} | ${SITE_NAME}`,
    ogDescription: description,
    robots: "index, follow",
  })),
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getProductionOrigin() {
  if (process.env.APP_PUBLIC_URL) {
    return process.env.APP_PUBLIC_URL.replace(/\/+$/, "");
  }
  return "https://kindred-asterling-ai-coaching.com";
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ---------------------------------------------------------------------------
// Structured data (JSON-LD)
//
// Authorship / review trust signals and offer schema are emitted into the
// prerendered <head> so non-rendering crawlers (and AI fetchers) see them in
// the initial HTML. Canonical brand origin is fixed here to match the global
// Organization/WebSite graph in index.html.
// ---------------------------------------------------------------------------

const SITE_ORIGIN = "https://kindred-asterling-ai-coaching.com";
// Last date the health-adjacent public content was reviewed (ISO 8601).
const CONTENT_REVIEWED_ISO = "2026-06-28";

const PUBLISHER = {
  "@type": "Organization",
  name: SITE_NAME,
  url: `${SITE_ORIGIN}/`,
  logo: {
    "@type": "ImageObject",
    url: `${SITE_ORIGIN}/favicon.png`,
  },
};

const CONTENT_AUTHOR = {
  "@type": "Organization",
  name: `The ${SITE_NAME} team`,
  url: `${SITE_ORIGIN}/about`,
};

function articleSchema({ headline, description, urlPath }) {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline,
    description,
    author: CONTENT_AUTHOR,
    publisher: PUBLISHER,
    dateModified: CONTENT_REVIEWED_ISO,
    mainEntityOfPage: `${SITE_ORIGIN}${urlPath}`,
  };
}

// Serialize JSON-LD for safe inline embedding in a <script> tag. Escaping `<`
// prevents a `</script>` sequence in any string field from breaking out.
function serializeJsonLd(schema) {
  return JSON.stringify(schema).replace(/</g, "\\u003c");
}

function buildHead(route, origin) {
  const canonicalPath = route.canonicalPath ?? route.path;
  const canonical = origin
    ? `${origin}${canonicalPath === "/" ? "" : canonicalPath}`
    : "";
  const ogImage = origin ? `${origin}/opengraph.jpg` : "/opengraph.jpg";

  const lines = [
    `<title>${escapeHtml(route.title)}</title>`,
    `<meta name="description" content="${escapeHtml(route.description)}" />`,
    `<meta name="robots" content="${route.robots}" />`,
  ];

  if (canonical) {
    lines.push(`<link rel="canonical" href="${canonical}" />`);
  }

  lines.push(
    `<meta property="og:title" content="${escapeHtml(route.ogTitle)}" />`,
    `<meta property="og:description" content="${escapeHtml(route.ogDescription)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${escapeHtml(SITE_NAME)}" />`,
    `<meta property="og:locale" content="en_US" />`,
    `<meta property="og:image" content="${ogImage}" />`,
    `<meta property="og:image:width" content="1280" />`,
    `<meta property="og:image:height" content="720" />`,
    `<meta property="og:image:alt" content="${escapeHtml(SITE_NAME)}" />`,
  );

  if (canonical) {
    lines.push(`<meta property="og:url" content="${canonical}" />`);
  }

  // twitter:site intentionally omitted: no official X/Twitter handle is finalized
  // yet. Add `<meta name="twitter:site" content="@handle" />` here (and in
  // index.html) once the brand account is confirmed.
  lines.push(
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escapeHtml(route.ogTitle)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(route.ogDescription)}" />`,
    `<meta name="twitter:image" content="${ogImage}" />`,
  );

  const jsonLd =
    route.schema === "article"
      ? articleSchema({
          headline: route.ogTitle,
          description: route.description,
          urlPath: route.path,
        })
      : route.schema && typeof route.schema === "object"
        ? route.schema
        : null;
  if (jsonLd) {
    lines.push(
      `<script type="application/ld+json">${serializeJsonLd(jsonLd)}</script>`,
    );
  }

  return lines.join("\n    ");
}

// Replace the entire metadata block in the HTML shell. We match from
// <title> through the last twitter:description meta so we can swap it
// wholesale for each route's own block.
const META_PLACEHOLDER_RE =
  /<title>[\s\S]*?<\/title>[\s\S]*?(?=<link rel="icon")/;

function injectHead(template, headBlock) {
  return template.replace(META_PLACEHOLDER_RE, `${headBlock}\n    `);
}

function injectBody(template, bodyHtml) {
  return template.replace(
    '<div id="root"></div>',
    `<div id="root">${bodyHtml}</div>`,
  );
}

// ---------------------------------------------------------------------------
// Build SSR bundle
// ---------------------------------------------------------------------------

console.log("▶ Building SSR bundle…");
execSync(
  "node_modules/.bin/vite build --ssr src/entry-server.tsx --outDir dist/server --emptyOutDir",
  { cwd: root, stdio: "inherit" },
);

// ---------------------------------------------------------------------------
// Load SSR module and client template
// ---------------------------------------------------------------------------

const { render } = await import(`${root}/dist/server/entry-server.js`);
const template = readFileSync(`${root}/dist/public/index.html`, "utf-8");
const origin = getProductionOrigin();

if (origin) {
  console.log(`▶ Using production origin: ${origin}`);
} else {
  console.log(
    "▶ No APP_PUBLIC_URL / REPLIT_DOMAINS set — canonical URLs and absolute OG image URLs omitted.",
  );
}

// ---------------------------------------------------------------------------
// Render each route
// ---------------------------------------------------------------------------

for (const route of ROUTES) {
  process.stdout.write(`  Rendering ${route.path} → ${route.outputFile} … `);

  let bodyHtml = "";
  try {
    bodyHtml = route.private ? "" : render(route.path);
  } catch (err) {
    console.warn(`\n  ⚠ SSR render failed for ${route.path}: ${err.message}`);
  }

  const headBlock = buildHead(route, origin);
  let html = injectHead(template, headBlock);
  if (bodyHtml) {
    html = injectBody(html, bodyHtml);
  }

  const outPath = resolve(root, "dist/public", route.outputFile);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, html, "utf-8");

  console.log("done");
}

console.log("✓ Prerender complete.");
