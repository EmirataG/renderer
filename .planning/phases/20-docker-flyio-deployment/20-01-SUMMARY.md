---
phase: 20-docker-flyio-deployment
plan: 01
subsystem: infra
tags: [docker, puppeteer, ffmpeg, dockerfile, multi-stage-build, graceful-shutdown]

# Dependency graph
requires:
  - phase: 19-progress-streaming-download
    provides: Complete export-service with Fastify + Puppeteer + FFmpeg pipeline
provides:
  - Multi-stage Dockerfile packaging Chrome + FFmpeg + frontend dist + backend dist
  - .dockerignore for lean build context
  - Environment-driven PORT configuration (process.env.PORT with fallback)
  - SIGTERM/SIGINT graceful shutdown for Fly.io auto-stop
affects: [20-02-fly-toml-deployment]

# Tech tracking
tech-stack:
  added: [ghcr.io/puppeteer/puppeteer:24.37.2]
  patterns: [multi-stage-docker-build, env-driven-config, graceful-shutdown]

key-files:
  created: [Dockerfile, .dockerignore]
  modified: [export-service/src/shared/config.ts, export-service/src/server.ts]

key-decisions:
  - "Pin Puppeteer Docker image to 24.37.2 matching project puppeteer dependency"
  - "PUPPETEER_SKIP_DOWNLOAD=true to use base image Chrome (avoid 300MB re-download)"
  - "pptruser for runtime security (non-root Chrome execution)"

patterns-established:
  - "Multi-stage build: frontend-build + backend-build + runtime"
  - "ENV-driven config with fallback for local dev compatibility"

# Metrics
duration: 1min
completed: 2026-02-09
---

# Phase 20 Plan 01: Docker Image & Production Readiness Summary

**Multi-stage Dockerfile with Puppeteer 24.37.2 base, FFmpeg, env-driven PORT, and SIGTERM graceful shutdown**

## Performance

- **Duration:** 1 min
- **Started:** 2026-02-09T21:36:40Z
- **Completed:** 2026-02-09T21:38:06Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Three-stage Dockerfile: frontend Vite build, backend TypeScript build, Puppeteer runtime with FFmpeg
- Environment-driven PORT configuration with parseInt and fallback to 3001
- SIGTERM and SIGINT graceful shutdown triggering server.close() for clean browser pool and timer cleanup
- .dockerignore excluding node_modules, dist, .git, .planning, demo for fast build context

## Task Commits

Each task was committed atomically:

1. **Task 1: Create Dockerfile and .dockerignore** - `cfb3389` (feat)
2. **Task 2: Update config for env PORT and add SIGTERM graceful shutdown** - `285b24d` (feat)

## Files Created/Modified
- `Dockerfile` - Three-stage multi-stage Docker build for the complete export service
- `.dockerignore` - Build context exclusions (node_modules, dist, .git, .planning, demo)
- `export-service/src/shared/config.ts` - PORT from process.env with fallback to 3001
- `export-service/src/server.ts` - SIGTERM/SIGINT handlers calling server.close()

## Decisions Made
- Pinned Puppeteer Docker image to 24.37.2 matching the project's puppeteer npm dependency version
- Set PUPPETEER_SKIP_DOWNLOAD=true before npm ci to avoid re-downloading Chrome (base image already has it)
- Run as pptruser (non-root) at runtime for security; USER root only during apt-get install ffmpeg
- Build stages use node:22-bookworm-slim (matching project Node.js version) while runtime uses Puppeteer image (Node 24, but ES2022 output is compatible)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Dockerfile ready for `docker build -t manuscript-export .`
- fly.toml configuration needed (Plan 20-02) for Fly.io deployment
- No blockers for Plan 20-02

## Self-Check: PASSED

All files exist, all commits verified, all content checks passed.

---
*Phase: 20-docker-flyio-deployment*
*Completed: 2026-02-09*
