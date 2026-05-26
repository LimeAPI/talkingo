# Multi-stage Dockerfile for standalone deployment of Talkingo Web
# Includes the shared package at build time.
#
# Build: docker build -t talkingo-web -f apps/web/Dockerfile .
# Run:   docker run -p 3000:3000 --env-file apps/web/.env.local talkingo-web

FROM node:20-alpine AS base
WORKDIR /app

# Install dependencies
FROM base AS deps
COPY package.json package-lock.json* ./
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/
RUN npm ci --workspace=@talkingo/web

# Build
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY packages/shared ./packages/shared
COPY apps/web ./apps/web
COPY package.json ./
WORKDIR /app/apps/web
RUN npm run build

# Production
FROM base AS runner
ENV NODE_ENV=production
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared ./packages/shared
COPY --from=builder /app/apps/web/.next ./apps/web/.next
COPY --from=builder /app/apps/web/public ./apps/web/public
COPY --from=builder /app/apps/web/server.ts ./apps/web/server.ts
COPY --from=builder /app/apps/web/package.json ./apps/web/package.json
COPY --from=builder /app/apps/web/next.config.ts ./apps/web/next.config.ts
COPY --from=builder /app/package.json ./
WORKDIR /app/apps/web
EXPOSE 3000
CMD ["npx", "tsx", "server.ts"]
