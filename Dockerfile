# syntax=docker/dockerfile:1.10
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
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

COPY artifacts/api-server artifacts/api-server
COPY artifacts/kindred-coach artifacts/kindred-coach
COPY lib/api-client-react lib/api-client-react
COPY lib/api-zod lib/api-zod
COPY lib/db lib/db
COPY tsconfig.base.json ./

ARG VITE_AUTH0_DOMAIN
ARG VITE_AUTH0_CLIENT_ID
ARG VITE_AUTH0_AUDIENCE
ENV VITE_AUTH0_DOMAIN=$VITE_AUTH0_DOMAIN \
    VITE_AUTH0_CLIENT_ID=$VITE_AUTH0_CLIENT_ID \
    VITE_AUTH0_AUDIENCE=$VITE_AUTH0_AUDIENCE
# These identifiers are public. Accept build arguments or optional BuildKit
# secret mounts; never pass a client secret to the browser build.
RUN --mount=type=secret,id=VITE_AUTH0_DOMAIN,env=VITE_AUTH0_DOMAIN,required=false \
    --mount=type=secret,id=VITE_AUTH0_CLIENT_ID,env=VITE_AUTH0_CLIENT_ID,required=false \
    --mount=type=secret,id=VITE_AUTH0_AUDIENCE,env=VITE_AUTH0_AUDIENCE,required=false \
    export NODE_ENV=production \
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
CMD ["node", "--enable-source-maps", "artifacts/api-server/dist/index.mjs"]
