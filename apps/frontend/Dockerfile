# syntax=docker/dockerfile:1
FROM node:24.21.0-bookworm-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS dependencies
ENV CI=true HUSKY=0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY .husky/install.mjs ./.husky/install.mjs
# Use the exact package manager version declared by the app.
RUN npm install --global "$(node --print 'require("./package.json").packageManager')"
RUN --mount=type=cache,id=frontend-pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --store-dir=/pnpm/store

FROM dependencies AS builder
COPY . .
# Only public configuration is allowed in build arguments; never pass auth secrets here.
ARG NEXT_PUBLIC_SITE_URL=http://localhost:3000
ARG SEO_INDEXABLE=false
ENV NODE_ENV=production \
    NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL} \
    SEO_INDEXABLE=${SEO_INDEXABLE}
# public is optional in the foundation, but must be copied when assets are added.
RUN mkdir -p public && pnpm build

FROM base AS runner
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD ["node", "-e", "fetch('http://127.0.0.1:3000/fa', {signal: AbortSignal.timeout(3000), redirect: 'error'}).then(r => process.exit(r.status === 200 ? 0 : 1)).catch(() => process.exit(1))"]
CMD ["node", "server.js"]
