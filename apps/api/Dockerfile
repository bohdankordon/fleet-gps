# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Stage: base -- common Node 24 runtime base. Debian slim is used (rather than
# Alpine/musl) so Prisma's native schema engine and any other glibc-linked
# native dependencies work without fragile musl workarounds.
# ---------------------------------------------------------------------------
FROM node:24-slim AS base
WORKDIR /workspace
# OpenSSL + CA certificates are required by Prisma native schema engine
# detection and by Node HTTPS (provider/TLS) verification.
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
RUN groupadd --gid 10001 appuser \
    && useradd --uid 10001 --gid appuser --create-home --shell /usr/sbin/nologin appuser

# ---------------------------------------------------------------------------
# Stage: builder -- full workspace install and production build.
# ---------------------------------------------------------------------------
FROM base AS builder
WORKDIR /workspace
COPY . .
RUN npm ci
RUN npm run equgps:build
RUN npm run api:build

# ---------------------------------------------------------------------------
# Stage: migrate -- one-shot Prisma migration job. This intentionally keeps the
# Prisma CLI (a devDependency) so operators can run "prisma migrate deploy".
# The application runtime image below does NOT contain the CLI and therefore
# cannot run migrations as a startup side effect.
# ---------------------------------------------------------------------------
FROM builder AS migrate
WORKDIR /workspace/apps/api
ENTRYPOINT ["npx", "prisma"]

# ---------------------------------------------------------------------------
# Stage: runtime -- production dependencies and build output only, non-root.
# ---------------------------------------------------------------------------
FROM base AS runtime
ENV NODE_ENV=production
WORKDIR /workspace
COPY --from=builder /workspace/package.json /workspace/package-lock.json ./
COPY --from=builder /workspace/apps/api/package.json ./apps/api/package.json
COPY --from=builder /workspace/apps/web/package.json ./apps/web/package.json
COPY --from=builder /workspace/packages/equgps/package.json ./packages/equgps/package.json
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=builder --chown=appuser:appuser /workspace/packages/equgps/dist ./packages/equgps/dist
COPY --from=builder --chown=appuser:appuser /workspace/apps/api/dist ./apps/api/dist
USER appuser
EXPOSE 3000
CMD ["node", "apps/api/dist/main.js"]
