# kindred-mcp

Claude Code plugin that bundles the MCP servers used for Kindred-Asterling infrastructure work.

| Server       | Command                          | Auth                                                   |
| ------------ | -------------------------------- | ------------------------------------------------------ |
| `kubernetes` | `npx -y mcp-server-kubernetes@1.0.0` | Your default kubeconfig (`~/.kube/config` or `$KUBECONFIG`) |
| `postgres`   | `uvx --with mcp==1.26.0 postgres-mcp==0.3.0` | `database_uri` plugin option (stored in secure storage) |
| `fly`        | `fly mcp server` (via `scripts/fly-mcp.mjs`) | Your existing `fly auth login` session                 |
| `hello-coop` | HTTP: `https://admin-mcp.hello.coop/` | Hellō account OAuth via `/mcp` (1-hour tokens)    |

## Prerequisites

- Node.js (for `npx`)
- [uv](https://docs.astral.sh/uv/) (for `uvx`)
- [flyctl](https://fly.io/docs/flyctl/install/), logged in with `fly auth login`

## Pinned infrastructure dependencies

The Kubernetes server is pinned to `mcp-server-kubernetes@1.0.0`, and the PostgreSQL server is pinned to `postgres-mcp==0.3.0` with the reviewed Python MCP SDK `mcp==1.26.0`. These pins are intentional: do not remove or widen them. Review dependency updates as a pull request, including release notes and a validation of the server's Kubernetes/database access, before changing `.mcp.json`.

## Fly wrapper

`scripts/fly-mcp.mjs` runs `fly mcp server` but rejects the MCP `server/discover` probe. flyctl 0.4.108 advertises protocol 2026-07-28 yet never answers `tools/list` in that mode, so Claude Code timed out fetching its tools. Remove the wrapper once flyctl fixes this.

## PostgreSQL through Fly

The staging database is on Fly's private network. Keep a tunnel open while using the `postgres` server:

```bash
fly mpg proxy w76geop28dnrplk4
```

and set the connection URI host to `127.0.0.1:16380`. `postgres-mcp` is run with `mcp<2` because it breaks on the 2.x Python SDK.

## Hellō admin server

`hello-coop` manages Hellō apps (create, read, update, redirect URIs, logos, client secrets). It cannot delete apps. Review redirect URI changes before approving them, and move any secret from `create_secret` straight into a secrets manager instead of leaving it in chat.

## Install

From the repository root, in Claude Code:

```
/plugin marketplace add ./
/plugin install kindred-mcp@kindred
```

On enable, Claude Code prompts for:

- **PostgreSQL connection URI**: masked and stored in the OS credential store, never written to `settings.json` or the repo.
- **PostgreSQL access mode**: `restricted` (read-only, default) or `unrestricted`. Keep `restricted` for staging and production.

Change the options later with `/config`, or re-enter the URI from `/plugin`.

## Validate

```
claude plugin validate ./plugins/kindred-mcp
```
