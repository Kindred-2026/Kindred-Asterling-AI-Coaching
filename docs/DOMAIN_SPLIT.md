# Domain split: marketing website and app

Goal: the public website (landing, about, science, pricing, legal pages) moves
to its own domain, `kindred-asterling-ai.xyz`, and `kindred-asterling-ai-coaching.com` serves only the
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
- No second domain name appeared anywhere in the repository. The owner chose
  `kindred-asterling-ai.xyz` on 2026-10-05.

## How the split works in code

Two build/runtime settings, both off by default so a plain build is unchanged.

| Setting | Where | Effect |
| --- | --- | --- |
| `VITE_MARKETING_SITE_URL` | Frontend build for the app domain | `/` renders the sign-in page and is prerendered as a `noindex` shell. `/about`, `/science` and `/legal/*` send the browser to the marketing domain. Header and footer links point there. `/pricing` (checkout) and `/payment-success` (Helcim return) stay on the app |
| `MARKETING_SITE_URL` | Fly runtime env for the API server | Server-side 301 for `/about`, `/science`, `/legal/*`, `/legal-documents/*`, `sitemap.xml` and `llms.txt` to the marketing domain; `robots.txt` disallows everything |
| `VITE_APP_URL` | Frontend build for the marketing domain | No Auth0 on this site. Sign in, checkout, `/login`, `/signup`, `/payment-success` and every signed-in page go to the app domain. Pricing stays as an information page whose checkout buttons go to the app's sign-in and return to the app's `/pricing` |

Either split setting also points the prerendered canonical links (marketing
build), the JSON-LD graph, `robots.txt`, `sitemap.xml` and `llms.txt` at the
marketing domain (`VITE_MARKETING_SITE_URL`, else `kindred-asterling-ai.xyz`).
Unsplit builds keep `kindred-asterling-ai-coaching.com`.

The Auth0 callback (`/?code=…&state=…`) stays on the app root, so the Auth0
application's callback, logout and web-origin URLs need no change for the app
domain. The marketing domain never signs anyone in and is not added to Auth0.

## Rollout (each step needs the owner's go-ahead)

1. `kindred-asterling-ai.xyz` is registered at Spaceship. Add it to
   Cloudflare as a site (free plan) and replace its nameservers in Spaceship
   with the two Cloudflare gives you. The registration stays at Spaceship.
2. Create a Cloudflare Worker connected to this repository (**Workers &
   Pages → Create → Continue with GitHub**). `wrangler.jsonc` at the
   repository root serves the build output as static assets:
   - Project name: `kindred-asterling-ai-website` (must match `wrangler.jsonc`)
   - Build command: `VITE_APP_URL=https://kindred-asterling-ai-coaching.com pnpm --filter @workspace/kindred-coach run build`
   - Deploy command: `npx wrangler deploy`
   - Root directory: empty. `.node-version` pins Node 24.
   - After the first deploy, add `kindred-asterling-ai.xyz` and
     `www.kindred-asterling-ai.xyz` under the Worker's **Settings → Domains &
     Routes**.

   The marketing build needs no Auth0 settings. It writes a `_headers` file
   with the same security headers as the app, and paths without a
   prerendered page get the SPA shell.
3. Check the marketing site end to end (pages, legal PDFs, Sign in and
   checkout handing off to the app).
4. Rebuild and deploy the Fly app. `fly.toml` sets `VITE_MARKETING_SITE_URL`
   (`[build.args]`) and `MARKETING_SITE_URL` (`[env]`) to
   `https://kindred-asterling-ai.xyz`, so either the "Deploy to Fly.io"
   workflow or a plain `fly deploy` picks them up.
5. In Google Search Console, add the new domain and file a change of address
   from the old one.

Rollback: remove both settings from `fly.toml` and redeploy the Fly app; the
old single-site behaviour returns. The marketing deploy can stay up.
