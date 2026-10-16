# Claude connectors for Kindred

How Kindred team members connect Claude (claude.ai and Claude Code) to the services we run on. The goal: no tokens in files, no per-repo setup, and a few sign-in clicks per person.

## How it fits together

| Service | Where it is configured | How each person signs in |
| --- | --- | --- |
| DigitalOcean (App Platform, databases, everything else) | claude.ai organization connector | OAuth, click **Connect** once |
| Slack, Linear, Figma, Cloudflare, Google Workspace | claude.ai organization connectors (already added) | OAuth, click **Connect** once |
| GitHub | `kindred-mcp` plugin in this repo | Your `gh auth login` session |
| Auth0 | One command per person | Browser device login, token kept in the system keychain |
| PostgreSQL, Kubernetes, Hellō | `kindred-mcp` plugin in this repo | See [the plugin README](../plugins/kindred-mcp/README.md) |

Organization connectors are added once by an org owner on claude.ai. They then show up in claude.ai chat and in every Claude Code session signed in to the org, listed as `claude.ai <name>` in `claude mcp list`. Each person still signs in with their own account, so access follows their own permissions in that service.

## One-time: org owner

Add DigitalOcean as an organization connector on claude.ai: **Admin settings → Connectors → Add custom connector**, with:

- Name: `DigitalOcean`
- URL: `https://mcp.digitalocean.com/mcp`

Leave the OAuth client fields empty. DigitalOcean's remote servers support OAuth sign-in, so no API token is needed ([DigitalOcean docs](https://docs.digitalocean.com/reference/mcp/configure-mcp/)). That URL is the MCP Router, which fronts App Platform, Databases, Kubernetes, Spaces and the other DigitalOcean servers.

## Each person: setup checklist

Run these once, on your own machine and with your own accounts.

1. **Connect the org connectors.** In claude.ai, open **Settings → Connectors** and click **Connect** on DigitalOcean and any others that show "Needs authentication". In Claude Code you can do the same from `/mcp`.
2. **GitHub CLI.** Install [`gh`](https://cli.github.com/), then:

   ```bash
   gh auth login --web
   ```

3. **uv** (for the PostgreSQL server):

   ```bash
   curl -LsSf https://astral.sh/uv/install.sh | sh
   ```

4. **Install the plugin.** From the repository root, in Claude Code:

   ```
   /plugin marketplace add ./
   /plugin install kindred-mcp@kindred
   ```

   It asks for a PostgreSQL URI. Use a read-only role on `kindred-db` (see [the plugin README](../plugins/kindred-mcp/README.md#postgresql-on-digitalocean)).

5. **Auth0.** Run this, choose **User** when it asks for a scope, and approve the device login in the browser:

   ```bash
   npx -y @auth0/auth0-mcp-server@0.1.0-beta.19 init --client claude-code --read-only
   ```

   `--read-only` exposes only list/get tools. Drop it only for a task that needs changes, and rerun with it afterwards. `npx -y @auth0/auth0-mcp-server@0.1.0-beta.19 logout` removes the stored token.

6. **Check.** Restart Claude Code, then:

   ```bash
   claude mcp list
   ```

   Every server should show Connected. For one that says "Needs authentication", run `/mcp` in Claude Code and sign in.

## Rules

- Never paste a token into chat, `.mcp.json`, `.env.dev.example` or any tracked file. App secrets still go in DigitalOcean App Platform encrypted variables (see [SECRET_INVENTORY.md](../SECRET_INVENTORY.md)).
- Prefer OAuth or an existing CLI login over a personal access token. If a service only offers tokens, give it the narrowest scope it allows and an expiry date.
- When someone leaves the team, remove them from the claude.ai org and from each service. Their connector tokens stop working with their accounts.

## Composio

[Composio](https://composio.dev/) runs one hosted MCP endpoint that handles OAuth for hundreds of apps. It is not used for the services above because:

- Every service above already has an official server with OAuth or CLI sign-in, so Composio would add a step rather than remove one.
- Composio would hold OAuth tokens for every connected app in one third-party account. That conflicts with the least-privilege rules in [SECRET_INVENTORY.md](../SECRET_INVENTORY.md).

Use it only for a service with no official MCP server that Claude genuinely needs. Add it as one more org connector, connect only that app through it, and record it in SECRET_INVENTORY.md.
