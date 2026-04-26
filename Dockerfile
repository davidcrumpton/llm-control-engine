# ==============================================================================
# LLM Control Engine — Multi-Stage Docker Build
# ==============================================================================
# Stages:
#   1. deps       — Install production + dev dependencies
#   2. build      — Compile TypeScript to JavaScript
#   3. test       — Run tests against the compiled output (optional CI gate)
#   4. production — Minimal runtime image with only prod deps + compiled JS
# ==============================================================================

# ------------------------------------------------------------------------------
# Stage 1: Dependencies
# ------------------------------------------------------------------------------
FROM node:22-alpine3.20 AS deps

# dumb-init handles PID 1 responsibilities (signal forwarding, zombie reaping)
RUN apk add --no-cache dumb-init

WORKDIR /app

# Copy package files first for layer caching
COPY package.json package-lock.json ./

# Install ALL dependencies (dev + prod) for the build stage
RUN npm ci

# ------------------------------------------------------------------------------
# Stage 2: Build
# ------------------------------------------------------------------------------
FROM deps AS build

WORKDIR /app

# Copy source and configs needed for compilation
COPY tsconfig.json tsconfig.build.json ./
COPY src/ ./src/

# Compile TypeScript
RUN npm run build

# Prune dev dependencies — only production deps remain
RUN npm prune --production

# ------------------------------------------------------------------------------
# Stage 3: Test (optional — run with: docker build --target test .)
# ------------------------------------------------------------------------------
FROM deps AS test

WORKDIR /app

COPY tsconfig.json tsconfig.build.json vitest.config.ts ./
COPY src/ ./src/
COPY tests/ ./tests/

# Run the full test suite
RUN npm run test:ci

# ------------------------------------------------------------------------------
# Stage 4: Production
# ------------------------------------------------------------------------------
FROM node:22-alpine3.20 AS production

# Metadata
LABEL maintainer="LLM Control Engine"
LABEL description="Modular LLM control engine with multi-provider support"

# Import dumb-init from deps stage
COPY --from=deps /usr/bin/dumb-init /usr/bin/dumb-init

# Security: run as non-root
RUN addgroup -g 1001 -S engine && \
    adduser -S engine -u 1001 -G engine

WORKDIR /app

# Copy only what we need: pruned node_modules + compiled output
COPY --from=build --chown=engine:engine /app/node_modules ./node_modules
COPY --from=build --chown=engine:engine /app/dist ./dist
COPY --from=build --chown=engine:engine /app/package.json ./

USER engine

# Health check — adjust the endpoint to match your CLI health command
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "process.exit(0)"

CMD ["llmctrlx"]