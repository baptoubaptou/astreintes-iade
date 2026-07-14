# syntax=docker/dockerfile:1

# Image Debian slim (glibc) : bcrypt et le moteur Prisma SQLite sont fiables sur ARM64.
# Alpine (musl) a été écarté après test : compilation bcrypt plus fragile, binaires Prisma moins prévisibles.
FROM node:22-bookworm-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS deps
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ openssl \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS build
COPY . .
# Base éphémère pour le build : Next.js pré-rend certaines pages qui interrogent Prisma.
ENV DATABASE_URL="file:./build.db"
RUN npx prisma generate \
  && npx prisma migrate deploy \
  && npm run build

# CLI Prisma isolée avec toutes ses dépendances (effect, @prisma/config, engines…)
FROM base AS prisma-migrate
WORKDIR /migrate
RUN npm install prisma@6.19.3

FROM base AS runtime
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl gosu \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs

COPY --from=build /app/public ./public
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
# Ne pas embarquer de secrets éventuellement générés au build Next.js
RUN rm -f /app/.env
COPY --from=build /app/prisma ./prisma
COPY --from=prisma-migrate /migrate/node_modules ./prisma-migrate/node_modules
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=build /app/node_modules/bcrypt ./node_modules/bcrypt
COPY --from=build /app/package.json ./package.json
COPY docker-entrypoint.sh /app/docker-entrypoint.sh

RUN chmod +x /app/docker-entrypoint.sh

EXPOSE 3000

ENTRYPOINT ["/app/docker-entrypoint.sh"]
