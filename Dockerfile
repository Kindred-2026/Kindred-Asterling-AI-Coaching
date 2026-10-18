FROM node:24-bookworm-slim AS build

ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    NODE_ENV=development
WORKDIR /app
RUN apt-get update \
 && apt-get install --yes --no-install-recommends ca-certificates \
 && update-ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && corepack enable \
 && corepack prepare pnpm@10.28.1 --activate

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc tsconfig*.json ./
COPY artifacts/api-server/package.json artifacts/api-server/package.json
COPY artifacts/kindred-coach/package.json artifacts/kindred-coach/package.json
COPY lib/api-client-react/package.json lib/api-client-react/package.json
COPY lib/api-spec/package.json lib/api-spec/package.json
COPY lib/api-zod/package.json lib/api-zod/package.json
COPY lib/db/package.json lib/db/package.json
COPY scripts/package.json scripts/package.json
# Plain Dockerfile syntax only (no RUN --mount), so the image also builds
# where BuildKit is unavailable, as reported for DigitalOcean App Platform.
RUN pnpm install --frozen-lockfile

COPY artifacts/api-server artifacts/api-server
COPY artifacts/kindred-coach artifacts/kindred-coach
COPY lib/api-client-react lib/api-client-react
COPY lib/api-zod lib/api-zod
COPY lib/db lib/db
COPY tsconfig.base.json ./

ARG VITE_AUTH0_DOMAIN
ARG VITE_AUTH0_CLIENT_ID
ARG VITE_AUTH0_AUDIENCE
# Optional domain split (docs/DOMAIN_SPLIT.md): the marketing website's URL.
# Empty keeps the website and app on one domain.
ARG VITE_MARKETING_SITE_URL=""
# Optional: the public Sentry DSN. Empty leaves browser error reporting off.
ARG VITE_SENTRY_DSN=""
ENV VITE_AUTH0_DOMAIN=$VITE_AUTH0_DOMAIN \
    VITE_AUTH0_CLIENT_ID=$VITE_AUTH0_CLIENT_ID \
    VITE_AUTH0_AUDIENCE=$VITE_AUTH0_AUDIENCE \
    VITE_MARKETING_SITE_URL=$VITE_MARKETING_SITE_URL \
    VITE_SENTRY_DSN=$VITE_SENTRY_DSN
# These identifiers are public build arguments (App Platform build-time
# variables, or --build-arg); never pass a client secret to the browser build.
# Optional: uploads source maps to Sentry. Read only by the build tools in this
# stage, never written to an image ENV or copied to the runtime image.
ARG SENTRY_AUTH_TOKEN=""
RUN export NODE_ENV=production SENTRY_AUTH_TOKEN="$SENTRY_AUTH_TOKEN" \
 && pnpm --filter @workspace/kindred-coach run build:deployment \
 && pnpm --filter @workspace/api-server run build \
 && pnpm --filter @workspace/api-server deploy --prod --legacy /app/runtime

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production \
    PORT=8080
WORKDIR /app
RUN groupadd --system --gid 10001 kindred \
 && useradd --system --uid 10001 --gid kindred --home-dir /app kindred
COPY --from=build --chown=kindred:kindred /app/runtime/node_modules ./node_modules
COPY --from=build --chown=kindred:kindred /app/artifacts/api-server/dist ./artifacts/api-server/dist
COPY --from=build --chown=kindred:kindred /app/artifacts/kindred-coach/dist/public ./artifacts/kindred-coach/dist/public
USER kindred
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "--enable-source-maps", "--import", "./artifacts/api-server/dist/instrument.mjs", "artifacts/api-server/dist/index.mjs"]
