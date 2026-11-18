# syntax=docker/dockerfile:1

# ---- deps: full install (dev deps needed for the build) ----
FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# ---- build ----
FROM deps AS build
COPY . .
RUN npm run build \
 && npm prune --omit=dev --no-audit --no-fund

# ---- runtime ----
FROM node:22-slim AS runtime
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4321
WORKDIR /app

COPY --from=build --chown=node:node /app/package.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node drizzle ./drizzle
COPY --chown=node:node scripts ./scripts

USER node
EXPOSE 4321

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4321)+'/blog/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# migrations first (idempotent, waits for postgres), then the server
CMD ["sh", "-c", "node scripts/migrate.mjs && exec node dist/server/entry.mjs"]
