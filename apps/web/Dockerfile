# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Stage: base -- common Node 24 runtime base.
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
# Stage: builder -- full workspace install and Next standalone production build.
# ---------------------------------------------------------------------------
FROM base AS builder
WORKDIR /workspace
ARG NEXT_PUBLIC_MAP_STYLE_URL=""
ENV NEXT_PUBLIC_MAP_STYLE_URL=${NEXT_PUBLIC_MAP_STYLE_URL}
COPY . .
RUN npm ci
RUN npm run web:standalone:build

# ---------------------------------------------------------------------------
# Stage: runtime -- canonical Next standalone output only, non-root.
# ---------------------------------------------------------------------------
FROM base AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=builder --chown=appuser:appuser /workspace/apps/web/.next/standalone ./
USER appuser
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
