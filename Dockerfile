# ============================================================
# Stage 1: Build frontend (Vite + React)
# ============================================================
FROM node:22-bookworm-slim AS frontend-build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html vite.config.ts tsconfig.json tsconfig.app.json postcss.config.js ./
COPY src/ ./src/
RUN npm run build

# ============================================================
# Stage 2: Build backend (TypeScript)
# ============================================================
FROM node:22-bookworm-slim AS backend-build
WORKDIR /app/export-service
COPY export-service/package.json export-service/package-lock.json ./
RUN npm ci
COPY export-service/tsconfig.json ./
COPY export-service/src/ ./src/
RUN npm run build

# ============================================================
# Stage 3: Production runtime
# ============================================================
FROM ghcr.io/puppeteer/puppeteer:24.37.2

# Install FFmpeg as root
USER root
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy frontend build output
COPY --from=frontend-build /app/dist ./dist/

# Copy backend compiled output
COPY --from=backend-build /app/export-service/dist ./export-service/dist/

# Copy backend package files and install production deps only
COPY export-service/package.json export-service/package-lock.json ./export-service/
ENV PUPPETEER_SKIP_DOWNLOAD=true
RUN cd export-service && npm ci --omit=dev

# Switch to non-root user for runtime security
USER pptruser

ENV PORT=8080
ENV NODE_ENV=production

EXPOSE 8080
CMD ["node", "export-service/dist/server.js"]
