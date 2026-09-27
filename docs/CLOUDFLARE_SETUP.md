# Cloudflare setup (custom domain, firewall, AI Gateway)

Kindred runs on Fly.io. Cloudflare sits in front of it for three things:

1. **DNS + HTTPS** for the custom domain.
2. **Security**: proxy, WAF, bot protection and rate limiting.
3. **AI Gateway** in front of the Anthropic API (logging, rate and spend limits).
   Anthropic still bills the AI usage. Cloudflare doesn't need any credits for this.

The examples use `kindred.example.com`. Replace it with your real domain everywhere.

## 1. Custom domain

1. Add the domain to Cloudflare (**Add a domain**, Free plan), then change the
   nameservers at your registrar to the two Cloudflare gives you. Wait until
   Cloudflare shows the domain as **Active**.
2. Ask Fly for a certificate for each hostname you will use:

   ```sh
   fly certs add kindred.example.com --app kindred-asterling-ai-coaching
   fly certs add www.kindred.example.com --app kindred-asterling-ai-coaching
   ```

   Fly prints the DNS records it needs: an `A` and an `AAAA` address, plus an
   `_acme-challenge` `CNAME`. Run `fly ips list --app kindred-asterling-ai-coaching`
   if you need the addresses again.
3. In Cloudflare **DNS → Records**, add:
   - `A` `@` → the Fly IPv4 address, **Proxied** (orange cloud)
   - `AAAA` `@` → the Fly IPv6 address, **Proxied**
   - `CNAME` `www` → `kindred.example.com`, **Proxied**
   - `CNAME` `_acme-challenge` (and `_acme-challenge.www`) → the target Fly
     printed, **DNS only** (grey cloud). This lets Fly issue the certificate
     even though traffic is proxied.
4. Wait for `fly certs show kindred.example.com --app kindred-asterling-ai-coaching`
   to report the certificate as issued.
5. In Cloudflare **SSL/TLS → Overview**, set the mode to **Full (strict)**.
   Never use **Flexible**: it causes redirect loops because the app forces HTTPS.
6. Point the app at the new domain. In `fly.toml`, change
   `APP_PUBLIC_URL = 'https://kindred.example.com'` and add
   `TRUST_PROXY_HOPS = '2'` (see below), then deploy. The app only accepts
   browser API calls from `APP_PUBLIC_URL` and its `www.` variant, so use the
   custom domain after this. The `fly.dev` address stops working for signed-in use.
7. In **Auth0 → Applications → Kindred (SPA) → Settings**, add
   `https://kindred.example.com/` (and the `www.` form if you use it) to
   **Allowed Callback URLs** and **Allowed Logout URLs**, and add the same
   addresses without the trailing slash to **Allowed Web Origins**.

### Why `TRUST_PROXY_HOPS = '2'`

Per-user and per-IP rate limits need the visitor's real IP address. With only
Fly in front, the app trusts one proxy hop. With Cloudflare → Fly, there are
two, so set `TRUST_PROXY_HOPS = '2'`. If you don't, every visitor looks like a
Cloudflare server and they all share one rate limit. Only set it once the
proxied domain is live and in use.

## 2. Security (all on the Free plan)

- **SSL/TLS → Edge Certificates**: turn on **Always Use HTTPS**, and set
  **Minimum TLS Version** to 1.2.
- **Security → Bots**: turn on **Bot Fight Mode**.
- **Security → WAF → Managed rules**: turn on the **Cloudflare Free Managed
  Ruleset**.
- **Security → WAF → Rate limiting rules**: add one rule. Match if the URI
  path starts with `/api/`, allow 100 requests per 10 seconds per IP, and
  **Block** for 10 seconds. The app has its own per-user limits too; this
  just stops floods early.
- **Caching → Configuration**: leave the defaults. Cloudflare doesn't cache
  `/api/` JSON responses by default, and the app's HTML is safe to cache.
- Don't turn on **Rocket Loader** or HTML **Auto Minify**. They rewrite the
  app's JavaScript and can break sign-in.

## 3. AI Gateway for Claude

1. In Cloudflare go to **AI → AI Gateway → Create Gateway**. Name it
   `kindred`.
2. In the gateway's **Settings**:
   - Turn **Authenticated Gateway** on and create a token. That token becomes
     `CLOUDFLARE_AI_GATEWAY_TOKEN`.
   - Turn **Cache responses** off.
   - Turn off request/response body logging if it's offered. The app also
     sends `cf-aig-collect-log-payload: false` on every request.
   - Optionally set **Rate limiting** and a **spend limit** as a safety net.
3. Copy your **Account ID** from the Cloudflare dashboard's account home page.
   The Claude endpoint is:

   ```text
   https://gateway.ai.cloudflare.com/v1/<ACCOUNT_ID>/kindred/anthropic
   ```

4. In `fly.toml` under `[env]`, add
   `ANTHROPIC_BASE_URL = 'https://gateway.ai.cloudflare.com/v1/<ACCOUNT_ID>/kindred/anthropic'`.
   Then store the token as a secret:

   ```sh
   fly secrets import --app kindred-asterling-ai-coaching --stage
   # type CLOUDFLARE_AI_GATEWAY_TOKEN=<token>, press Enter, then Ctrl-D
   ```

5. Deploy, send a chat message, and check that the request appears in the
   gateway's **Logs** tab.

`ANTHROPIC_API_KEY` stays as it is: the gateway passes it on to Anthropic.
To stop using the gateway, remove `ANTHROPIC_BASE_URL` and redeploy. The app
then calls Anthropic directly.
