# ── Stage 1: Build ──────────────────────────────────────────────────
FROM node:20-bookworm-slim AS builder

WORKDIR /app

# Install deps first (layer cache)
COPY package.json package-lock.json ./
RUN npm ci

# Copy source & build scripts
COPY tsconfig.json build-standalone.mjs ./
COPY src/ src/

# Bundle standalone render page (Verovio WASM + render HTML)
RUN npm run build:standalone

# Compile TypeScript
RUN npm run build

# Prune to production-only node_modules
RUN npm ci --omit=dev

# ── Stage 2: Runtime ───────────────────────────────────────────────
FROM node:20-bookworm-slim

# System deps: Chromium, FFmpeg, dumb-init, fonts for music notation
RUN apt-get update && apt-get install -y --no-install-recommends \
      chromium \
      ffmpeg \
      dumb-init \
      fonts-noto \
      fonts-noto-cjk \
    && rm -rf /var/lib/apt/lists/*

# Tell Puppeteer to skip bundled Chromium and use the system one
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

# Copy build artifacts from builder
COPY --from=builder /app/dist/ dist/
COPY --from=builder /app/standalone-dist/ standalone-dist/
COPY --from=builder /app/node_modules/ node_modules/
COPY --from=builder /app/package.json package.json

# dumb-init as PID 1 for proper signal forwarding
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/server.js"]
