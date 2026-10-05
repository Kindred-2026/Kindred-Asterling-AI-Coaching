# Tracing proxy Worker

Cloudflare Worker that proxies to the Fly.io API server with Workers traces enabled
(`observability.traces`, 100% sampling, metadata only: method, path, status code).

Deploy (not part of the pnpm workspace, so it does not touch the lockfile):

```bash
npx wrangler deploy
```

Limits: the Anthropic/OpenAI calls run inside the Fly app, so traces show proxy
requests, not model calls or tool runs. Agent-level spans need the AI calls to
run on Workers.
