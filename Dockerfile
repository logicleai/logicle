# syntax=docker/dockerfile:1.5

# Pin this to a released analyzer version (or digest) when updating it.
ARG FILE_ANALYZER_IMAGE=ghcr.io/logicleai/mcp-file-analyzer:0.6.0

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

RUN npm install -g node-gyp pnpm@10.10.0

ENV BUILD_STANDALONE=true
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

# Build the application which also compiles all assets — reuse Next.js cache
RUN --mount=type=cache,id=next-cache,target=/app/.next/cache \
    NODE_ENV=production pnpm build


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
RUN mkdir -p apps/frontend/.next/cache /data/sqlite /data/files \
    && chown -R node:node apps/frontend/.next /data

# Copy built assets from the 'builder' stage to appropriate locations
COPY --from=builder /app/apps/frontend/public ./apps/frontend/public
COPY --from=builder /app/apps/frontend/.next/standalone ./
COPY --from=builder /app/apps/frontend/.next/static ./apps/frontend/.next/static
COPY --from=builder /app/dist-server ./dist-server
COPY --from=builder /app/.env ./.env
COPY --from=file-analyzer /mcp-file-analyzer /usr/local/bin/mcp-file-analyzer

# Switch to the non-root 'node' for security reasons
USER node

EXPOSE 3000

ENV NODE_ENV=production
# Start the Next.js standalone server.
CMD ["node", "--enable-source-maps", "dist-server/server.js"]
