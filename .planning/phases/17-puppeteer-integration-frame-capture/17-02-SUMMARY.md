---
phase: 17-puppeteer-integration-frame-capture
plan: 02
subsystem: infra
tags: [puppeteer, frame-capture, page-setup, evaluateOnNewDocument, async-generator, headless-chrome]

# Dependency graph
requires:
  - phase: 17-puppeteer-integration-frame-capture
    plan: 01
    provides: "Browser pool with generic-pool lifecycle and @fastify/static serving frontend"
  - phase: 16-frontend-render-mode
    provides: "RenderApp entry with window.__EXPORT_CONFIG__ detection and animationController exposure"
provides:
  - "Page setup with ExportConfig injection via evaluateOnNewDocument before navigation"
  - "Readiness polling via waitForFunction on window.rendererReady"
  - "Duration verification via animationController.getDuration()"
  - "Frame capture async generator yielding PNG Uint8Array buffers per frame"
  - "renderJob orchestrator wiring pool acquire, page setup, capture, cleanup"
  - "Fire-and-forget render trigger from export route after job creation"
affects: [18-ffmpeg-encoding, export-pipeline]

# Tech tracking
tech-stack:
  added: []
  patterns: [evaluateOnNewDocument-config-injection, async-generator-frame-capture, fire-and-forget-background-job, try-finally-resource-cleanup]

key-files:
  created:
    - export-service/src/browser/pageSetup.ts
    - export-service/src/browser/captureFrames.ts
  modified:
    - export-service/src/jobs/jobManager.ts
    - export-service/src/routes/export.ts

key-decisions:
  - "Frame buffers collected in memory for Phase 17 validation; Phase 18 will pipe directly to FFmpeg stdin"
  - "evaluateOnNewDocument called BEFORE page.goto() to ensure config is available when page scripts run"
  - "(job as any) cast for frameBuffers to avoid modifying ExportJob type before Phase 18 redesign"

patterns-established:
  - "Config injection pattern: evaluateOnNewDocument -> goto -> waitForFunction readiness -> verify duration"
  - "Async generator frame capture: setFrame(n, fps) -> screenshot() -> yield buffer per frame"
  - "Resource cleanup in finally: page.close() -> context.close() -> browserPool.release(), each in own try/catch"

# Metrics
duration: 2min
completed: 2026-02-09
---

# Phase 17 Plan 02: Page Setup, Frame Capture, and Render Job Orchestrator Summary

**Puppeteer page setup with evaluateOnNewDocument config injection, async generator frame capture via setFrame+screenshot, and renderJob orchestrator wiring browser pool to export route**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-09T17:20:17Z
- **Completed:** 2026-02-09T17:22:14Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Page setup module: builds ExportConfig from job data, injects via evaluateOnNewDocument before navigation, polls rendererReady, verifies getDuration() > 0
- Frame capture async generator: loops totalFrames calling setFrame(n, fps) then page.screenshot() yielding PNG Uint8Array per frame
- renderJob orchestrator: acquires browser from pool, wires setupPage and captureFrames, updates job status (rendering -> complete/error), cleans up page/context/browser in finally blocks
- Export route triggers renderJob fire-and-forget with .catch() error logging after job creation

## Task Commits

Each task was committed atomically:

1. **Task 1: Create page setup and frame capture modules** - `ebdcb5f` (feat)
2. **Task 2: Create renderJob orchestrator and wire export route** - `f4099f5` (feat)

## Files Created/Modified
- `export-service/src/browser/pageSetup.ts` - ExportConfig interface, buildExportConfig from job data, setupPage with config injection + readiness wait + duration verification
- `export-service/src/browser/captureFrames.ts` - Async generator yielding {buffer, frame, totalFrames} per frame via setFrame + screenshot
- `export-service/src/jobs/jobManager.ts` - Added renderJob method orchestrating pool acquire, page setup, frame capture, cleanup in finally
- `export-service/src/routes/export.ts` - Added fire-and-forget renderJob trigger after job creation

## Decisions Made
- Frame buffers collected in memory array for Phase 17 validation; Phase 18 will refactor to pipe directly to FFmpeg stdin
- Used evaluateOnNewDocument BEFORE page.goto() to ensure ExportConfig is available when page scripts execute
- Used (job as any) cast for frameBuffers/frameCount to avoid modifying ExportJob type prematurely before Phase 18 buffer flow redesign

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Complete frame capture pipeline produces PNG buffers ready for Phase 18 (FFmpeg encoding)
- renderJob orchestrator is the integration point where FFmpeg stdin piping will replace in-memory buffer collection
- Browser pool acquire/release and page cleanup patterns are established for production use

## Self-Check: PASSED

All files verified present. All commits verified in git log.

---
*Phase: 17-puppeteer-integration-frame-capture*
*Completed: 2026-02-09*
