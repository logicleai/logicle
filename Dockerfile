# ---------------------
# Stage 1: Builder
# ---------------------
# This is the build stage where we build the NextJS application.
FROM node:20.17.0-alpine AS builder

ENV BUILD_STANDALONE=true
# Temporarily setting the DATABASE_URL to a file in /tmp to ensure accessibility to the db directory during the build process.
ENV DATABASE_URL=file:///tmp/logicle.sqlite

# Set the working directory inside the Docker image
WORKDIR /app

# Copy project's package.json and package-lock.json to use Docker layer caching
COPY logicle/package.json logicle/package-lock.json ./

# Install all npm dependencies for the project
RUN npm install

# Copy the rest of the application code into the image
COPY logicle/ .

# Build the application which also compiles all assets
RUN NODE_ENV=production npm run build



# ---------------------
# Final Stage: Runtime
# ---------------------
# This is the final production stage where we prepare the runtime environment.
FROM node:20.9.0-alpine

# Set the working directory inside the Docker image
WORKDIR /app

# Install kysely globally to enable database migrations at app startup
RUN npm install -g kysely

# Create and set permissions for the .next directory to hold NextJS cache
RUN mkdir .next && chown node:node .next

# Explicitly create the cache directory and set permissions
RUN mkdir -p .next/cache && chown node:node .next/cache

# Create directories and set recursive ownership to node user for /data and its subdirectories
RUN mkdir -p /data/sqlite && mkdir -p /data/files && chown -R node:node /data

# Copy built assets from the 'builder' stage to appropriate locations
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Switch to the non-root 'node' for security reasons
USER node

# Indicate the port on which the application will be accessible
EXPOSE 3000

# Start the Next.js standalone server.
CMD ["node", "server.js"]