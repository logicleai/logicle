# ---------------------
# Stage 1: Builder
# ---------------------
# This is the build stage where we build the NextJS application.
# syntax directive enables --mount support
# syntax=docker/dockerfile:1.5
FROM node:22-alpine AS builder

# Accept optional version at build time: --build-arg APP_VERSION=1.2.3
ARG APP_VERSION

RUN apk add --no-cache python3 make g++ py3-pip py3-setuptools \
    && ln -sf python3 /usr/bin/python

RUN npm install -g node-gyp pnpm@10.10.0

ENV BUILD_STANDALONE=true
# Temporarily setting the DATABASE_URL to a file in /tmp to ensure accessibility to the db directory during the build process.
ENV DATABASE_URL=file:///tmp/logicle.sqlite
# Set pnpm store path in a known position... which we'll mount as a cache volume later
ENV PNPM_STORE_PATH=/pnpm/store

WORKDIR /app

# Copy project's package.json and pnpm-lock.yaml to use Docker layer caching
COPY logicle/package.json logicle/pnpm-lock.yaml logicle/pnpm-workspace.yaml ./

# Install deps — mounting the pnpm store into a cache volume
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

# Copy the rest of the application code into the image
# (This copy would otherwise overwrite any earlier edits to package.json,
# so we patch AFTER this step.)
COPY logicle/ .

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

WORKDIR /app/.next/standalone

RUN ls -l
RUN ls -l node_modules

# Hack jose into node_modules, next.js does not detect the dependency
RUN npm pack jose@6.0.11 && mkdir -p node_modules/jose && tar -xzf jose*.tgz -C node_modules/jose --strip-components=1 && rm jose-*tgz
RUN npm pack openid-client@6.4.2 && mkdir -p node_modules/openid-client && tar -xzf openid-client-*.tgz -C node_modules/openid-client --strip-components=1 && rm openid-client-*tgz
RUN npm pack oauth4webapi@3.4.1 && mkdir -p node_modules/oauth4webapi && tar -xzf oauth4webapi-*.tgz -C node_modules/oauth4webapi --strip-components=1 && rm oauth4webapi-*tgz

RUN ls -l
RUN ls -l node_modules

# ---------------------
# Final Stage: Runtime
# ---------------------
FROM node:22-alpine

WORKDIR /app

# Install kysely globally to enable database migrations at app startup
RUN npm install -g kysely

# Create and set permissions for directories
RUN mkdir -p .next/cache /data/sqlite /data/files \
    && chown -R node:node .next /data

# Copy built assets from the 'builder' stage to appropriate locations
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Switch to the non-root 'node' for security reasons
USER node

EXPOSE 3000

# Start the Next.js standalone server.
CMD ["node", "server.js"]