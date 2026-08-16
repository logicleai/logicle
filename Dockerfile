# syntax=docker/dockerfile:1.5

# Pin this to a released analyzer version (or digest) when updating it.
ARG FILE_ANALYZER_IMAGE=ghcr.io/logicleai/mcp-file-analyzer:0.8.0

# ---------------------
# Stage 1: File analyzer
# ---------------------
FROM ${FILE_ANALYZER_IMAGE} AS file-analyzer

# ---------------------
# Stage 2: Builder
# ---------------------
# This is the build stage where we build the NextJS application.
FROM node:24-bookworm-slim AS builder

# Accept optional version at build time: --build-arg APP_VERSION=1.2.3
ARG APP_VERSION

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ python3-pip python3-setuptools \
    pkg-config \
    libcairo2-dev libpango1.0-dev libgif-dev libpixman-1-dev libjpeg62-turbo-dev librsvg2-dev \
    libvips-dev \
    && ln -sf python3 /usr/bin/python \
    && rm -rf /var/lib/apt/lists/*

RUN npm install -g node-gyp pnpm@10.22.0

# Temporarily setting the DATABASE_URL to a file in /tmp to ensure accessibility to the db directory during the build process.
ENV DATABASE_URL=file:///tmp/logicle.sqlite
# Set pnpm store path in a known position... which we'll mount as a cache volume later
ENV PNPM_STORE_PATH=/pnpm/store

WORKDIR /app

# Copy dependency manifests and patch files to use Docker layer caching
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY patches ./patches
# Vendored local file dependency required by package.json ("xlsx": "file:vendor/xlsx")
COPY vendor/xlsx ./vendor/xlsx

# Install deps — mounting the pnpm store into a cache volume
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

# Copy the rest of the application code into the image
# (This copy would otherwise overwrite any earlier edits to package.json,
# so we patch AFTER this step.)
COPY . .

# If APP_VERSION is provided, patch package.json's "version" before build.
# Using Node to safely edit JSON without extra tools.
RUN if [ -n "${APP_VERSION}" ]; then \
      echo "Patching package.json version to ${APP_VERSION}"; \
      node -e "const fs=require('fs'); const p=JSON.parse(fs.readFileSync('package.json','utf8')); p.version='${APP_VERSION}'; fs.writeFileSync('package.json', JSON.stringify(p,null,2)+'\n');"; \
    else \
      echo 'APP_VERSION not provided; leaving package.json as-is'; \
    fi

# Build the application which also compiles all assets — reuse Next.js cache.
# apps/frontend builds to a fully static export (output: 'export' in
# next.config.ts — no Next server runtime, so nothing left to trace/bundle
# incorrectly); dist-server (the custom backend + static-file server) is a
# separate tsup bundle that still needs real node_modules at runtime.
RUN --mount=type=cache,id=next-cache,target=/app/.next/cache \
    NODE_ENV=production pnpm build

# apps/backend is its own workspace package (apps/backend/package.json)
# declaring only what backend code — plus packages/core and
# packages/file-analyzer, pulled in via tsconfig path aliases and inlined by
# tsup, not via node_modules — actually imports. `pnpm deploy` resolves a
# fresh, correctly-pruned node_modules from just that declaration, which
# excludes the ~50 frontend-only packages (Radix UI, Tailwind, icon packs,
# CodeMirror, etc.) that a plain `pnpm install --prod` at the repo root
# would otherwise still include (there being only one shared package.json
# before this split). `pnpm prune --prod` was tried first instead of a
# real workspace split and rejected — see git history — it misclassified
# real runtime deps like better-sqlite3 as devDependencies-safe-to-drop.
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm --filter=@logicleai/backend deploy --prod /app/deploy-backend

# `pnpm deploy` resolves apps/backend's own declared dependencies correctly,
# but a few of those are themselves only reachable via optional/unused
# integration paths (verified by `grep` over dist-server's actual bundled
# output, not package.json classification) and safe to drop:
#  - next + @next/swc-*: only imported dynamically in server.ts, gated on
#    dev mode (see the `await import('next')` there) — never resolved once
#    NODE_ENV=production.
#  - mermaid (+ its own deps mathjax/cytoscape-fcose/mermaid-parser):
#    exceljs/docx's optional diagram-embedding integration, never actually
#    invoked by any code path dist-server bundles.
RUN rm -rf \
    /app/deploy-backend/node_modules/next \
    /app/deploy-backend/node_modules/.pnpm/next@* \
    /app/deploy-backend/node_modules/.pnpm/@next+swc-* \
    /app/deploy-backend/node_modules/mermaid \
    /app/deploy-backend/node_modules/.pnpm/mermaid@* \
    /app/deploy-backend/node_modules/.pnpm/@mermaid-js+* \
    /app/deploy-backend/node_modules/.pnpm/@mathjax+*


# ---------------------
# Stage 3: Runtime
# ---------------------
FROM node:24-bookworm-slim

WORKDIR /app

# Install kysely globally to enable database migrations at app startup
RUN npm install -g kysely

# Runtime libraries for native modules (sharp/canvas), plus the renderer used by
# mcp-file-analyzer for Office document previews.
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    libcairo2 libpango-1.0-0 libgif7 libpixman-1-0 libjpeg62-turbo librsvg2-2 libvips42 \
    libreoffice-core-nogui \
    libreoffice-impress-nogui \
    libreoffice-writer-nogui \
    libreoffice-calc-nogui \
    fonts-liberation \
    fonts-dejavu-core \
    fonts-noto-core \
    poppler-utils \
    && rm -rf /var/lib/apt/lists/*

# Create and set permissions for directories
RUN mkdir -p /data/sqlite /data/files \
    && chown -R node:node /data

# Copy built assets from the 'builder' stage to appropriate locations.
# apps/frontend/out is the static export served directly by dist-server
# (see apps/backend/lib/staticFrontend.ts) — no `.next/standalone` dance.
COPY --from=builder /app/apps/frontend/out ./apps/frontend/out
COPY --from=builder /app/dist-server ./dist-server
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/deploy-backend/node_modules ./node_modules
COPY --from=file-analyzer /mcp-file-analyzer /usr/local/bin/mcp-file-analyzer

# Switch to the non-root 'node' for security reasons
USER node

EXPOSE 3000

ENV NODE_ENV=production
# apps/frontend is a static export served by dist-server itself (see
# apps/backend/lib/staticFrontend.ts) — there is no separate Next server.
CMD ["node", "--enable-source-maps", "dist-server/server.js"]
