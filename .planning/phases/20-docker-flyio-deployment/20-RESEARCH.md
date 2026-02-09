# Phase 20: Docker Image & Fly.io Deployment - Research

**Researched:** 2026-02-09
**Domain:** Docker containerization, Fly.io PaaS deployment, Puppeteer/Chrome in containers, FFmpeg in containers
**Confidence:** HIGH

## Summary

This phase packages the existing export-service (Fastify + Puppeteer + FFmpeg) into a Docker image and deploys it to Fly.io with auto-stop/auto-start for cost efficiency. The core challenge is building a Docker image that includes Chrome (for Puppeteer), FFmpeg (for video encoding), system fonts, and both the frontend build output and the backend compiled code -- all while keeping the image lean and cold starts fast.

Fly.io is not a traditional container platform -- it uses Docker images as a packaging format but runs them in lightweight VMs (Firecracker microVMs). This means `--no-sandbox` is the standard approach for Chrome (no `SYS_ADMIN` capability needed), and Fly.io provides its own init process (no tini required). The auto-stop/auto-start feature is built into the Fly Proxy and configured via `fly.toml`, with machines stopping after idle periods and restarting on incoming requests.

The export-service currently has zero environment variable usage -- port, host, paths, and all config is hardcoded in `config.ts`. This must be updated to read `PORT` from environment (Fly.io convention) and to resolve the frontend dist path correctly within the Docker filesystem layout.

**Primary recommendation:** Use `ghcr.io/puppeteer/puppeteer` as the base image (includes Node.js 24 + Chrome + fonts on Debian Bookworm), add FFmpeg via `apt-get`, use a multi-stage build for the frontend + backend, and deploy with `fly deploy`. Configure `shared-cpu-2x` with 2GB RAM and auto-stop/auto-start enabled.

## Standard Stack

### Core

| Tool | Version | Purpose | Why Standard |
|------|---------|---------|--------------|
| Docker | N/A (build tool) | Containerize the export-service | Required by Fly.io for deployment |
| Fly.io (flyctl) | Latest | PaaS deployment target | Specified in phase requirements |
| `ghcr.io/puppeteer/puppeteer` | Match project's Puppeteer 24.x | Base Docker image with Chrome + Node.js + fonts | Official Puppeteer team image, pre-installs Chrome for Testing + system deps + fonts |
| FFmpeg | Debian bookworm repo (6.1.x) | Video encoding (already used by export-service) | `apt-get install ffmpeg` on Bookworm; used by `encodeVideo.ts` and `muxAudio.ts` |

### Supporting

| Tool | Purpose | When to Use |
|------|---------|-------------|
| `.dockerignore` | Exclude node_modules, dist, .git from build context | Always -- critical for build speed and image size |
| `fly.toml` | Fly.io app configuration | Required for every Fly.io deployment |
| `fly secrets` | Secure environment variable injection | If any secrets needed in future (none currently) |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `ghcr.io/puppeteer/puppeteer` base | `node:24-bookworm-slim` + manual Chrome install | More control but more maintenance; must manually track Chrome deps, font packages, and dbus config. The official image handles all of this. |
| Debian `ffmpeg` package | Static FFmpeg binary (`mwader/static-ffmpeg`) | Smaller but adds multi-stage copy complexity; Debian repo version is sufficient for libx264+AAC needs |
| `fly deploy` (remote build) | Local `docker build` + `fly deploy --image` | Remote build is simpler (no local Docker needed), but local build is faster for iteration |

**No new npm packages needed.** This phase is purely infrastructure (Docker + Fly.io config).

## Architecture Patterns

### Recommended Project Structure (new files)

```
renderer/                          # Git root
├── export-service/
│   ├── Dockerfile                 # NEW: Multi-stage Docker build
│   ├── .dockerignore              # NEW: Build context exclusions
│   ├── fly.toml                   # NEW: Fly.io app configuration
│   ├── src/
│   │   └── shared/
│   │       └── config.ts          # MODIFIED: Read PORT from env
│   └── ...
└── ...
```

### Pattern 1: Multi-Stage Docker Build

**What:** Separate build stages for frontend and backend, then copy artifacts into a runtime stage based on the Puppeteer image.
**When to use:** When you need build tools (TypeScript, Vite) during build but not at runtime.

```dockerfile
# Stage 1: Build frontend (Vite)
FROM node:22-bookworm-slim AS frontend-build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build
# Output: /app/dist/

# Stage 2: Build backend (TypeScript)
FROM node:22-bookworm-slim AS backend-build
WORKDIR /app/export-service
COPY export-service/package.json export-service/package-lock.json ./
RUN npm ci
COPY export-service/ .
RUN npm run build
# Output: /app/export-service/dist/

# Stage 3: Runtime (Puppeteer base + FFmpeg)
FROM ghcr.io/puppeteer/puppeteer:latest
USER root
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy frontend dist
COPY --from=frontend-build /app/dist ./dist

# Copy backend dist + production deps
COPY --from=backend-build /app/export-service/dist ./export-service/dist
COPY export-service/package.json export-service/package-lock.json ./export-service/
RUN cd export-service && npm ci --omit=dev

# Switch to non-root user for runtime
USER pptruser

EXPOSE 8080
ENV PORT=8080
CMD ["node", "export-service/dist/server.js"]
```

**Source:** Patterns from Puppeteer Docker docs (https://pptr.dev/guides/docker) and Fly.io Node.js guides (https://fly.io/docs/js/the-basics/dockerfiles/).

### Pattern 2: Fly.io Configuration with Auto-Stop/Auto-Start

**What:** Configure `fly.toml` so the machine stops when idle and restarts on incoming requests.
**When to use:** Cost efficiency for low-traffic/bursty workloads (export jobs are bursty).

```toml
app = "manuscript-export"
primary_region = "iad"

[build]
  dockerfile = "export-service/Dockerfile"

[env]
  NODE_ENV = "production"

[http_service]
  internal_port = 8080
  force_https = true
  auto_stop_machines = "stop"
  auto_start_machines = true
  min_machines_running = 0

  [http_service.concurrency]
    type = "requests"
    soft_limit = 2
    hard_limit = 4

[[http_service.checks]]
  grace_period = "30s"
  interval = "30s"
  method = "GET"
  path = "/health"
  timeout = "5s"

[[vm]]
  size = "shared-cpu-2x"
  memory = "2gb"
```

**Source:** Fly.io configuration reference (https://fly.io/docs/reference/configuration/).

### Pattern 3: Environment-Driven Config for PORT

**What:** The export-service config must read `PORT` from `process.env` with a fallback.
**When to use:** Required for Fly.io deployment (and all cloud platforms).

```typescript
// config.ts - production-ready pattern
export const config = {
  port: parseInt(process.env.PORT ?? '3001', 10),
  host: '0.0.0.0',
  // ... rest unchanged
} as const;
```

**Why:** Fly.io sets `internal_port` in fly.toml and expects the app to listen on that port. The convention is to match via `PORT` env var. The default `8080` is Fly.io's standard, but we set it explicitly in `[env]` in fly.toml.

### Pattern 4: Frontend Dist Path Resolution in Docker

**What:** The `frontendDistPath` currently uses `join(import.meta.dirname, '../../../dist')` which resolves correctly in the local dev layout (`export-service/dist/shared/config.js` -> `renderer/dist/`). In Docker, the paths will be different.
**When to use:** When the Docker filesystem layout differs from the dev layout.

The Docker layout will be:
```
/app/
├── dist/                    # Frontend build output
└── export-service/
    └── dist/
        └── shared/
            └── config.js    # import.meta.dirname = /app/export-service/dist/shared
```

So `join(import.meta.dirname, '../../../dist')` resolves to `/app/dist/` which is CORRECT. The relative path `../../../dist` from `export-service/dist/shared/` goes up three levels to `/app/` and then into `dist/`. **No path change needed if the Docker layout mirrors the local layout.**

### Anti-Patterns to Avoid

- **Running as root in production:** The Puppeteer base image provides `pptruser` (UID 10042). Switch back to this user after installing system packages. Running Chrome as root without `--no-sandbox` will fail; running with `--no-sandbox` as root is a security risk.
- **Including node_modules in Docker build context:** Without `.dockerignore`, the entire `node_modules/` (especially Puppeteer's cached Chrome) gets sent to the builder. This can add 500MB+ to build context.
- **Using `npm install` instead of `npm ci` in Dockerfile:** `npm install` can modify `package-lock.json` and produce non-deterministic builds. Always use `npm ci` in Docker.
- **Hardcoding port without env override:** Fly.io expects the app to listen on the port specified by `internal_port` in `fly.toml`. Hardcoded ports that don't match will cause health check failures.
- **Adding tini/dumb-init to Dockerfile:** Fly.io provides its own init process. Adding tini causes PID 1 conflicts and generates warnings.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Chrome + deps in Docker | Manual apt-get for Chrome + 20 dependency packages | `ghcr.io/puppeteer/puppeteer` base image | Chrome has complex system dependencies (dbus, fonts, shared libs); the official image handles all of them |
| Process management / init | tini, dumb-init, or custom init scripts | Fly.io's built-in init | Fly.io runs a minimal init as PID 1; adding another causes conflicts |
| SSL/HTTPS termination | Custom HTTPS setup in Fastify | Fly Proxy (automatic HTTPS with `force_https = true`) | Fly.io handles TLS termination at the proxy layer |
| Health checking infrastructure | Custom health check endpoints beyond /health | Fly.io's `[[http_service.checks]]` config | The existing `/health` route returning `{ status: 'ok' }` is sufficient |

**Key insight:** The export-service is already fully built and working locally. This phase is purely about packaging (Docker) and deploying (Fly.io) -- not about changing application logic. The only code change needed is making the port configurable via environment variable.

## Common Pitfalls

### Pitfall 1: Chrome Sandbox Failures on Fly.io

**What goes wrong:** Chrome crashes on startup with sandbox errors.
**Why it happens:** Fly.io runs apps in Firecracker microVMs, not Docker containers. Chrome's sandbox requires kernel features that may not be available.
**How to avoid:** Always launch Puppeteer with `--no-sandbox` and `--disable-setuid-sandbox` flags. The export-service already does this in `browserPool.ts`.
**Warning signs:** `No usable sandbox!` error in logs.

### Pitfall 2: /dev/shm Too Small (64MB Default)

**What goes wrong:** Chrome crashes or tabs crash with "Page crashed!" errors when rendering complex pages.
**Why it happens:** Docker defaults `/dev/shm` to 64MB. Chrome uses shared memory extensively.
**How to avoid:** The export-service already passes `--disable-dev-shm-usage` in `browserPool.ts`, which writes shared memory to `/tmp` instead. This is the correct approach for Fly.io (no way to configure `/dev/shm` size).
**Warning signs:** Random tab crashes, especially on pages with large DOM trees.

### Pitfall 3: Health Check Timeout During Cold Start

**What goes wrong:** Fly.io marks the machine as unhealthy during cold start because the health check fails.
**Why it happens:** Cold start involves booting the VM + starting Node.js + loading the app. If the grace period is too short, the health check fires before the app is ready.
**How to avoid:** Set `grace_period = "30s"` on health checks. The success criterion says < 30s cold start, so 30s grace period provides adequate buffer.
**Warning signs:** Deployment succeeds but machines get marked unhealthy immediately.

### Pitfall 4: Puppeteer Downloads Chrome Again Inside Docker

**What goes wrong:** `npm ci` triggers Puppeteer's postinstall script which downloads Chrome for Testing (~300MB), even though Chrome is already in the base image.
**Why it happens:** Puppeteer's postinstall hook downloads a browser unless explicitly told not to.
**How to avoid:** Set `ENV PUPPETEER_SKIP_DOWNLOAD=true` in the Dockerfile before `npm ci`. The base image already has Chrome installed at its default path.
**Warning signs:** Docker build takes unexpectedly long; image size bloated by ~300MB.

### Pitfall 5: Frontend Dist Not Found at Runtime

**What goes wrong:** Fastify static plugin fails to serve frontend, Puppeteer page.goto() gets 404.
**Why it happens:** The `frontendDistPath` in `config.ts` uses `import.meta.dirname` relative path. If the Docker COPY layout doesn't match the expected relative structure, the path resolves incorrectly.
**How to avoid:** Verify the Docker layout matches: `export-service/dist/shared/config.js` must be exactly 3 directories below the frontend `dist/` directory. The recommended Docker layout (`/app/dist/` and `/app/export-service/dist/`) preserves this.
**Warning signs:** `ENOENT` errors for `index.html` in server logs; blank page in Puppeteer screenshots.

### Pitfall 6: Out of Memory on shared-cpu-1x

**What goes wrong:** Machine OOM-killed during video export.
**Why it happens:** Chrome alone needs ~500MB-1GB. Add FFmpeg encoding + Node.js + frame buffers, and 256MB or 512MB is not enough.
**How to avoid:** Use `shared-cpu-2x` with 2GB RAM. Chrome minimum is ~1GB; with FFmpeg and Node.js overhead, 2GB provides adequate headroom.
**Warning signs:** Machine exits with code 137 (OOM killed).

### Pitfall 7: Build Context Too Large

**What goes wrong:** `docker build` or `fly deploy` takes 5+ minutes to send build context.
**Why it happens:** Without `.dockerignore`, the entire `node_modules/` (both root and export-service), plus Puppeteer's cached Chrome binary, gets sent.
**How to avoid:** Create a `.dockerignore` that excludes `node_modules/`, `dist/`, `.git/`, `export-service/node_modules/`, `export-service/dist/`.
**Warning signs:** "Sending build context to Docker daemon" shows hundreds of MB.

### Pitfall 8: Wrong Puppeteer Executable Path

**What goes wrong:** Puppeteer tries to use its bundled Chrome path but finds nothing (because download was skipped).
**Why it happens:** With `PUPPETEER_SKIP_DOWNLOAD=true`, there's no Chrome at Puppeteer's expected cache path. But the base image installs Chrome at Puppeteer's default cache location for the `pptruser`.
**How to avoid:** When using `ghcr.io/puppeteer/puppeteer` base image AND `PUPPETEER_SKIP_DOWNLOAD=true`, ensure the `PUPPETEER_CACHE_DIR` env var points to the base image's cache (which is `/home/pptruser/.cache/puppeteer`). Alternatively, rely on the base image's Chrome and don't skip downloads (only relevant if re-running `npm ci` in the image).
**Warning signs:** `Could not find Chrome (ver X.Y.Z)` error at runtime.

## Code Examples

Verified patterns from official sources and codebase analysis:

### Complete Dockerfile

```dockerfile
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
FROM ghcr.io/puppeteer/puppeteer:latest

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

# Switch to non-root user
USER pptruser

ENV PORT=8080
ENV NODE_ENV=production

EXPOSE 8080
CMD ["node", "export-service/dist/server.js"]
```

**Source:** Based on Puppeteer Docker guide (https://pptr.dev/guides/docker), Fly.io Dockerfile patterns (https://fly.io/docs/js/the-basics/dockerfiles/).

### Complete fly.toml

```toml
app = "manuscript-export"
primary_region = "iad"

[build]
  dockerfile = "export-service/Dockerfile"

[env]
  NODE_ENV = "production"
  PORT = "8080"

[http_service]
  internal_port = 8080
  force_https = true
  auto_stop_machines = "stop"
  auto_start_machines = true
  min_machines_running = 0

  [http_service.concurrency]
    type = "requests"
    soft_limit = 2
    hard_limit = 4

[[http_service.checks]]
  grace_period = "30s"
  interval = "30s"
  method = "GET"
  path = "/health"
  timeout = "5s"

[[vm]]
  size = "shared-cpu-2x"
  memory = "2gb"
```

**Source:** Fly.io configuration reference (https://fly.io/docs/reference/configuration/).

### .dockerignore

```
node_modules/
dist/
export-service/node_modules/
export-service/dist/
.git/
.gitignore
.planning/
demo/
*.md
.DS_Store
```

### Config Change: Environment-Driven PORT

```typescript
// export-service/src/shared/config.ts
// Change port line from:
//   port: 3001,
// To:
export const config = {
  port: parseInt(process.env.PORT ?? '3001', 10),
  // ... rest unchanged
} as const;
```

### Graceful Shutdown for Fly.io Auto-Stop

The server already has `server.addHook('onClose', ...)` for cleanup. For Fly.io auto-stop, add SIGTERM handling in `server.ts`:

```typescript
// In main() after server.listen():
const shutdown = async () => {
  await server.close(); // Triggers onClose hooks (cleanup timer, browser pool)
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
```

**Source:** Fly.io sends SIGTERM before stopping a machine. Node.js best practice for Docker (https://github.com/goldbergyoni/nodebestpractices/blob/master/sections/docker/graceful-shutdown.md).

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true` env var | `PUPPETEER_SKIP_DOWNLOAD=true` or `.puppeteerrc.cjs` with `skipDownload` | Puppeteer 21+ (2023) | Old env var still works but new name is preferred |
| `google-chrome-stable` from Google APT repo | `ghcr.io/puppeteer/puppeteer` official Docker image | 2023+ | Official image handles all Chrome deps automatically |
| `--headless` flag (old headless) | `headless: true` or `headless: "new"` (new headless) | Puppeteer 21+ | New headless is default; old headless deprecated |
| `fly.toml` `[[services]]` section | `[http_service]` section | Fly.io Apps v2 (2023) | Old `[[services]]` still works but `[http_service]` is preferred |
| `auto_stop_machines = true/false` | `auto_stop_machines = "off"/"stop"/"suspend"` | Fly.io 2024 | String values replace boolean; `"suspend"` is new option for faster restarts |
| Tini as init process in Docker | Fly.io built-in init | Always on Fly.io | Adding tini causes PID 1 conflicts and warnings |

**Deprecated/outdated:**
- `PUPPETEER_SKIP_CHROMIUM_DOWNLOAD`: Still works but `PUPPETEER_SKIP_DOWNLOAD` is the current name
- `[[services]]` in fly.toml: Replaced by `[http_service]` in Fly.io Apps v2
- `auto_stop_machines = true`: Now uses string values `"stop"` / `"suspend"` / `"off"`

## Open Questions

1. **Dockerfile context root**
   - What we know: The `fly.toml` is placed in `export-service/` but the Docker build needs access to the root `renderer/` directory for the frontend build. The `[build]` section in `fly.toml` can specify `dockerfile` path.
   - What's unclear: Whether `fly.toml` should live at the repo root (simpler build context) or in `export-service/` (closer to the service). If at the root, `fly deploy` works naturally. If in `export-service/`, we need `fly deploy --dockerfile ../Dockerfile` or similar.
   - Recommendation: Place `fly.toml` at the repo root (`renderer/`). The Dockerfile can also be at the root. This gives the simplest build context that includes both frontend source and export-service source. The `[build]` section can specify `dockerfile = "Dockerfile"`.

2. **Puppeteer base image Node.js version alignment**
   - What we know: The official `ghcr.io/puppeteer/puppeteer:latest` uses Node.js 24 (Bookworm). The project currently runs on Node.js 22.14.0. The build stages use `node:22-bookworm-slim`.
   - What's unclear: Whether the minor version difference between build (node 22) and runtime (node 24 in Puppeteer image) causes issues. The compiled JS is ES2022 target, which both support.
   - Recommendation: Pin the Puppeteer image to a specific version tag (e.g., `ghcr.io/puppeteer/puppeteer:24.37.2` matching the project's Puppeteer version). If this uses Node 24, the ES2022 output is compatible. Alternatively, use a specific older tag that uses Node 22. Test locally with `docker build` to verify.

3. **Concurrency limits for export jobs**
   - What we know: Each export job uses one browser instance + one FFmpeg process. The browser pool allows up to 3 browsers. With 2GB RAM, realistically 1 concurrent export is safe.
   - What's unclear: Whether `soft_limit = 2` / `hard_limit = 4` in fly.toml is appropriate, or if it should be `soft_limit = 1` / `hard_limit = 2` given memory constraints.
   - Recommendation: Start with `soft_limit = 1` / `hard_limit = 2`. A single export at a time is realistic for the memory budget. Additional requests will queue at the Fly Proxy level.

4. **Cold start target (< 30s)**
   - What we know: Fly.io machine cold starts are typically 1-3 seconds for the VM itself. Node.js startup + module loading adds time. Puppeteer browser launch adds more.
   - What's unclear: The total cold start time from stopped machine to first frame capture. The browser pool creates browsers lazily (min: 0), so the first export request also triggers browser launch.
   - Recommendation: The 30s target is for "idle to first frame capture." The health check `/health` will respond much faster (just Node.js startup). Browser acquisition (up to 30s timeout in config) is the bottleneck. Total should be well under 30s for the health check, and the first export request may take 5-10s extra for browser launch. This is acceptable per the success criteria.

## Sources

### Primary (HIGH confidence)
- Puppeteer Docker guide: https://pptr.dev/guides/docker - Official Docker image, Dockerfile, runtime requirements
- Puppeteer official Dockerfile: https://github.com/puppeteer/puppeteer/blob/main/docker/Dockerfile - Base image structure (Node 24 Bookworm, pptruser, fonts, dbus)
- Fly.io configuration reference: https://fly.io/docs/reference/configuration/ - Complete fly.toml syntax
- Fly.io autostop/autostart: https://fly.io/docs/launch/autostop-autostart/ - Auto-stop/auto-start configuration
- Fly.io Docker docs: https://fly.io/docs/blueprints/working-with-docker/ - "Fly.io doesn't run Docker containers, uses images as packaging format"
- Fly.io Node.js listening ports: https://fly.io/docs/js/the-basics/listening-ports/ - PORT environment variable convention

### Secondary (MEDIUM confidence)
- Fly.io community: Running Puppeteer on Fly.io: https://community.fly.io/t/how-can-i-run-puppeteer-on-fly-io/5435 - --no-sandbox required, 1GB RAM minimum
- Fly.io community: Init process discussion: https://community.fly.io/t/should-we-use-an-init-process-in-our-dockerfiles/25858 - No tini needed, Fly provides init
- Blog: Puppeteer with Docker on Fly.io: https://macarthur.me/posts/puppeteer-with-docker/ - Working Dockerfile patterns
- Blog: Deploying Puppeteer on Fly.io: https://willschenk.com/labnotes/2024/deploying_puppeteer_on_fly.io/ - Real deployment example
- Puppeteer configuration: https://pptr.dev/guides/configuration - PUPPETEER_SKIP_DOWNLOAD, cacheDirectory, executablePath
- Fly.io autostop/autostart reference: https://fly.io/docs/reference/fly-proxy-autostop-autostart/ - Detailed proxy behavior, soft_limit role

### Tertiary (LOW confidence)
- Fly.io machine cold start times: Community reports of 1-3 second VM boot, but no official benchmarks for Node.js + Puppeteer workloads
- Fly.io pricing: ~$6.79/month for shared-cpu-1x with 1GB RAM based on community reports; shared-cpu-2x with 2GB would be approximately double

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Official Puppeteer Docker image is well-documented; Fly.io config syntax is stable and well-documented
- Architecture: HIGH - Multi-stage Docker builds are a well-established pattern; fly.toml configuration is straightforward
- Pitfalls: HIGH - Chrome-in-Docker pitfalls are extremely well-documented across the Puppeteer community; Fly.io-specific issues are covered in community forums
- Cold start timing: MEDIUM - VM boot is fast, but total cold start including Node.js + browser launch has no official benchmarks

**Research date:** 2026-02-09
**Valid until:** 2026-03-09 (30 days -- Docker and Fly.io patterns are stable)
