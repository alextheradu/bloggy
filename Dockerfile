# syntax=docker/dockerfile:1

# Multi-arch, compile-once:
#   every build stage is pinned to $BUILDPLATFORM (the x86 server), so
#   `astro check && astro build` runs ONCE, natively, no matter how many
#   --platform targets you ask for. Only the final `runtime` stage is
#   per-arch, and it has no RUN steps (just COPY), so arm64 needs no QEMU.
#
#   single arch (Dokploy default):  docker build -t blog .
#   x86 + Pi swarm:                 docker buildx build --platform linux/amd64,linux/arm64 -t <registry>/blog:latest --push .

# ---- deps: full install on the build host (dev deps needed for the build) ----
FROM --platform=$BUILDPLATFORM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --no-audit --no-fund

# ---- build: native on the build host, arch-independent JS output ----
FROM deps AS build
COPY . .
RUN npm run build

# ---- prod-deps: cross-install runtime node_modules for the TARGET arch ----
# Still runs on the build host; npm's --os/--cpu/--libc pick the matching
# optional native packages (sharp, lightningcss, tailwind oxide, rolldown...)
# for the target instead of the host. Scripts are skipped: they'd run x86
# node against arm binaries, and nothing at runtime needs them.
FROM --platform=$BUILDPLATFORM node:22-slim AS prod-deps
ARG TARGETARCH
ARG TARGETVARIANT
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    case "$TARGETARCH" in \
      amd64) cpu=x64 ;; \
      arm64) cpu=arm64 ;; \
      arm)   cpu=arm ;; \
      *) echo "unsupported TARGETARCH=$TARGETARCH" >&2; exit 1 ;; \
    esac \
 && npm ci --omit=dev --no-audit --no-fund --ignore-scripts \
      --os=linux --cpu="$cpu" --libc=glibc

# ---- runtime: per target arch, COPY only ----
FROM node:22-slim AS runtime
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4321
WORKDIR /app

COPY --from=build --chown=node:node /app/package.json ./
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node drizzle ./drizzle
COPY --chown=node:node scripts ./scripts

USER node
EXPOSE 4321

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4321)+'/blog/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# migrations first (idempotent, waits for postgres), then the server
CMD ["sh", "-c", "node scripts/migrate.mjs && exec node dist/server/entry.mjs"]
