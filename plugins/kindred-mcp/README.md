# kindred-mcp

Claude Code plugin that bundles the MCP servers used for Kindred-Asterling infrastructure work.

| Server       | Command                          | Auth                                                   |
| ------------ | -------------------------------- | ------------------------------------------------------ |
| `kubernetes` | `npx -y mcp-server-kubernetes@4.1.7` | Your default kubeconfig (`~/.kube/config` or `$KUBECONFIG`) |
| `postgres`   | `uvx postgres-mcp==0.3.0` | `database_uri` plugin option (sensitive, see below) |
| `fly`        | `fly mcp server` (via `scripts/fly-mcp.mjs`) | Your existing `fly auth login` session                 |
| `hello-coop` | HTTP: `https://admin-mcp.hello.coop/` | Hellō account OAuth via `/mcp` (1-hour tokens)    |

## Prerequisites

- Node.js (for `npx`)
- [uv](https://docs.astral.sh/uv/) (for `uvx`)
- [flyctl](https://fly.io/docs/flyctl/install/), logged in with `fly auth login`

## Fly wrapper

`scripts/fly-mcp.mjs` runs `fly mcp server` but rejects the MCP `server/discover` probe. flyctl 0.4.108 advertises protocol 2026-07-28 yet never answers `tools/list` in that mode, so Claude Code timed out fetching its tools. Remove the wrapper once flyctl fixes this.

## PostgreSQL through Fly

The staging database is on Fly's private network. Keep a tunnel open while using the `postgres` server:

```bash
fly mpg proxy w76geop28dnrplk4
```

and set the connection URI host to `127.0.0.1:16380`. 

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
