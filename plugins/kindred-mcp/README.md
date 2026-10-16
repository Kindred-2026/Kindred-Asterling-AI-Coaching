# kindred-mcp

Claude Code plugin that bundles the MCP servers used for Kindred-Asterling infrastructure work.

DigitalOcean, Slack, Linear, Figma and Cloudflare are not in this plugin: they are claude.ai organization connectors, which reach every Claude Code session in the org automatically. Auth0 is set up per person with one command. See [docs/claude-connectors.md](../../docs/claude-connectors.md) for the full setup.

| Server       | Command                          | Auth                                                   |
| ------------ | -------------------------------- | ------------------------------------------------------ |
| `kubernetes` | `npx -y mcp-server-kubernetes@4.1.7` | Your default kubeconfig (`~/.kube/config` or `$KUBECONFIG`) |
| `postgres`   | `uvx postgres-mcp==0.3.0` | `database_uri` plugin option (sensitive, see below) |
| `github`     | HTTP: `https://api.githubcopilot.com/mcp/` | Your `gh auth login` session, read fresh on each connection (no token stored) |
| `hello-coop` | HTTP: `https://admin-mcp.hello.coop/` | Hellō account OAuth via `/mcp` (1-hour tokens)    |

## Prerequisites

- Node.js (for `npx`)
- [uv](https://docs.astral.sh/uv/) (for `uvx`)
- [GitHub CLI](https://cli.github.com/), logged in with `gh auth login --web`

## GitHub

The `github` server's `headersHelper` runs `gh auth token` each time Claude Code connects and sends it as the bearer token. Nothing is written to the repo or to Claude Code's settings, and `gh auth logout` cuts the server off. The server gets the same access as your `gh` login (`gh auth status` lists its scopes).

## PostgreSQL on DigitalOcean

The database is the DigitalOcean Managed PostgreSQL cluster `kindred-db` (Toronto). To reach it from your machine:

1. In the DigitalOcean dashboard, add your current IP under the cluster's **Trusted sources**.
2. Use the connection URI of a read-only role, ending in `?sslmode=require`, as the `database_uri` option. Never use the app's own role or the `doadmin` user.

Remove your IP from Trusted sources when you no longer need access.

## Pinned versions

Downloaded servers are pinned to exact, reviewed releases so a new upstream publish can't run with your kubeconfig or database credentials without a repo change:

| Package | Version | Notes |
| --- | --- | --- |
| `mcp-server-kubernetes` (npm) | 4.1.7 | |
| `postgres-mcp` (PyPI) | 0.3.0 | |
| `mcp` (PyPI) | 1.30.0 | `postgres-mcp` breaks on the 2.x SDK (`mcp.server.fastmcp` was renamed) |

To update: bump the version in `.mcp.json`, review the upstream changelog, confirm `claude mcp list` shows the server connected, bump the plugin `version` in `plugin.json`, and open a PR.

## Hellō admin server

`hello-coop` manages Hellō apps (create, read, update, redirect URIs, logos, client secrets). It cannot delete apps. Review redirect URI changes before approving them, and move any secret from `create_secret` straight into a secrets manager instead of leaving it in chat.

## Install

From the repository root, in Claude Code:

```
/plugin marketplace add ./
/plugin install kindred-mcp@kindred
```

On enable, Claude Code prompts for:

- **PostgreSQL connection URI**: masked on entry and never written to `settings.json` or the repo. Claude Code keeps it in the macOS Keychain where available; on platforms without a supported keychain (including Linux) it falls back to `~/.claude/.credentials.json`. Use a least-privilege, read-only database role, and make sure that file is readable only by you (`chmod 600`).
- **PostgreSQL access mode**: `restricted` (read-only, default) or `unrestricted`. Keep `restricted` for staging and production.

Change the options later with `/config`, or re-enter the URI from `/plugin`.

## Validate

```
claude plugin validate ./plugins/kindred-mcp
```
