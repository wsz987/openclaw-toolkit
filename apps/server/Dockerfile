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
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/server/node_modules apps/server/node_modules
COPY --from=builder /app/apps/server/.next/standalone apps/server/.next/standalone
# The standalone server runs from apps/server, so Next resolves both locations there.
COPY --from=builder /app/apps/server/.next/static apps/server/.next/standalone/apps/server/.next/static
COPY --from=builder /app/apps/server/public apps/server/.next/standalone/apps/server/public
RUN find apps/server/.next/standalone \( -name "*.test.ts" -o -name "*.test.tsx" \) -delete

USER node
VOLUME ["/data"]
EXPOSE 31421
# 直接启动 Next standalone 产物。数据库目录与迁移由应用启动时自动完成
# （src/db/client.ts 的 getDb() 会建目录并跑 drizzle 迁移），无需额外脚本。
CMD ["node", "apps/server/.next/standalone/apps/server/server.js"]
