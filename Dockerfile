FROM node:20-alpine AS base

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

# --- Dependencies ---
FROM base AS deps
WORKDIR /app

COPY package.json pnpm-lock.yaml .npmrc ./
RUN pnpm install --frozen-lockfile

# --- Prisma CLI (migrations only; not part of the Next.js standalone trace) ---
FROM base AS prisma-cli
WORKDIR /prisma
ARG PRISMA_VERSION=7.4.1
RUN npm init -y >/dev/null && npm install --no-audit --no-fund prisma@${PRISMA_VERSION} dotenv

# --- Builder ---
FROM base AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma client (no DB needed at build time)
RUN pnpm prisma generate

# Build Next.js (standalone output)
RUN pnpm build

# --- Runner ---
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Prisma's schema engine needs OpenSSL on Alpine
RUN apk add --no-cache openssl

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy public assets
COPY --from=builder /app/public ./public

# Copy standalone build output
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Prisma CLI, schema, migrations and config live in /prisma and are used by scripts/start.sh
COPY --from=prisma-cli --chown=nextjs:nodejs /prisma/node_modules /prisma/node_modules
COPY --from=builder --chown=nextjs:nodejs /app/prisma /prisma/prisma
COPY --from=builder --chown=nextjs:nodejs /app/prisma.config.ts /prisma/prisma.config.ts
COPY --from=builder /app/src/generated/prisma ./src/generated/prisma
COPY --chown=nextjs:nodejs scripts/start.sh ./start.sh

# Create storage directories
RUN mkdir -p /data/storage /tmp/orbit-storage && chown -R nextjs:nodejs /data/storage /tmp/orbit-storage

USER nextjs

EXPOSE 3000

CMD ["./start.sh"]
