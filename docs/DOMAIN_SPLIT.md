# Domain split: marketing website and app

Goal: the public website (landing, about, science, pricing, legal pages) moves
to its own domain, and `kindred-asterling-ai-coaching.com` serves only the
app, whose root is the sign-in page.

## Where things stood (2026-10-05)

- No earlier code, config or branch for the split exists in this repository.
  Every commit that mentions the domain (`3edfc1e`, `d871a13`, `5b67293`,
  `258ae6b`) treats `kindred-asterling-ai-coaching.com` as the single site
  for both the website and the app.
- One Fly app (`kindred-asterling-ai-coaching`) serves the API and one React
  build. That build contains the marketing pages and the app, and `/` is the
  landing page.
- `robots.txt`, `sitemap.xml`, `llms.txt`, `index.html` JSON-LD and
  `scripts/prerender.mjs` hard-code `kindred-asterling-ai-coaching.com` as the
  marketing origin.
- No second domain name appears anywhere in the repository.

## How the split works in code

Two build/runtime settings, both off by default so a plain build is unchanged.

| Setting | Where | Effect |
| --- | --- | --- |
| `VITE_MARKETING_SITE_URL` | Frontend build for the app domain | `/` renders the sign-in page and is prerendered as a `noindex` shell. `/about`, `/science` and `/legal/*` send the browser to the marketing domain. Header and footer links point there. `/pricing` (checkout) and `/payment-success` (Helcim return) stay on the app |
| `MARKETING_SITE_URL` | Fly runtime env for the API server | Server-side 301 for `/about`, `/science`, `/legal/*`, `/legal-documents/*`, `sitemap.xml` and `llms.txt` to the marketing domain; `robots.txt` disallows everything |
| `VITE_APP_URL` | Frontend build for the marketing domain | No Auth0 on this site. Sign in, checkout, `/login`, `/signup`, `/payment-success` and every signed-in page go to the app domain. Pricing stays as an information page whose checkout buttons go to the app's sign-in and return to the app's `/pricing` |

The Auth0 callback (`/?code=…&state=…`) stays on the app root, so the Auth0
application's callback, logout and web-origin URLs need no change for the app
domain. The marketing domain never signs anyone in and is not added to Auth0.

## Rollout (each step needs the owner's go-ahead)

1. Pick and register the marketing domain, and add it to Cloudflare.
2. Point the hard-coded marketing origin (`public/robots.txt`,
   `public/sitemap.xml`, `public/llms.txt`, `index.html` JSON-LD and
   `SITE_ORIGIN` in `scripts/prerender.mjs`) at the new domain in a follow-up
   PR.
3. Build the marketing site and publish `artifacts/kindred-coach/dist/public`
   to Cloudflare Pages on the new domain:
   `VITE_APP_URL=https://kindred-asterling-ai-coaching.com pnpm --filter @workspace/kindred-coach run build`.
4. Check the marketing site end to end (pages, legal PDFs, Sign in and
   checkout handing off to the app).
5. Rebuild and deploy the Fly app with
   `VITE_MARKETING_SITE_URL` (build arg) and `MARKETING_SITE_URL`
   (`fly.toml` `[env]`) set to the marketing domain.
6. In Google Search Console, add the new domain and file a change of address
   from the old one.

Rollback: unset both settings and redeploy the Fly app; the old single-site
behaviour returns. The marketing deploy can stay up.
