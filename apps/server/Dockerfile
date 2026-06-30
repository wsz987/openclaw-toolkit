# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /app

FROM base AS deps
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/desktop/package.json apps/desktop/package.json
COPY apps/server/package.json apps/server/package.json
RUN pnpm install --frozen-lockfile --filter @openclaw-toolkit/server...

FROM deps AS builder
COPY apps/server apps/server
RUN pnpm --dir apps/server build

FROM base AS runner
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=31421
ENV SQLITE_DB_PATH=/data/server.sqlite
ENV RELEASE_STORAGE_DIR=/data/releases
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && mkdir -p /data/releases \
  && chown -R node:node /data /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/server/package.json apps/server/package.json
COPY apps/server/drizzle.config.ts apps/server/drizzle.config.ts
COPY apps/server/drizzle apps/server/drizzle
COPY apps/server/scripts apps/server/scripts
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/server/node_modules apps/server/node_modules
COPY --from=builder /app/apps/server/.next/standalone apps/server/.next/standalone
COPY --from=builder /app/apps/server/.next/static apps/server/.next/static
COPY --from=builder /app/apps/server/public apps/server/public
RUN find apps/server/.next/standalone \( -name "*.test.ts" -o -name "*.test.tsx" \) -delete

USER node
VOLUME ["/data"]
EXPOSE 31421
CMD ["pnpm", "--dir", "apps/server", "start:docker"]
