---
phase: quick-9
plan: 01
subsystem: export
tags: [puppeteer, ffmpeg, viewport, camera-interpolation, render-mode]

# Dependency graph
requires:
  - phase: 17-puppeteer-integration
    provides: "Page setup, frame capture, browser pooling"
  - phase: 18-ffmpeg-encoding
    provides: "FFmpeg encode pipeline with viewport dimensions"
provides:
  - "Dynamic viewport derived from background image dimensions"
  - "Viewport-aware RegularRenderer sizing in render mode"
  - "Smooth cubic ease-in-out camera interpolation in setTimestamp"
affects: [export-service, render-mode, video-output]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "PNG/JPEG/WEBP header parsing for dimensions without dependencies"
    - "Cubic ease-in-out interpolation (3t^2 - 2t^3) for camera scrolling"

key-files:
  created: []
  modified:
    - "export-service/src/browser/pageSetup.ts"
    - "export-service/src/jobs/jobManager.ts"
    - "src/types/global.d.ts"
    - "src/RenderApp.tsx"
    - "src/renderers/RegularRenderer.tsx"

key-decisions:
  - "Parse image dimensions from buffer headers (PNG/JPEG/WEBP) without adding any new npm dependency"
  - "Cubic ease-in-out (3t^2 - 2t^3) for smooth camera movement between system Y positions"
  - "viewportWidth/viewportHeight on ExportConfig for end-to-end dimension propagation"

patterns-established:
  - "Viewport override pattern: optional viewportWidth/viewportHeight props short-circuit WIDTH=980 scaling"

# Metrics
duration: 2min
completed: 2026-02-10
---

# Quick Task 9: Fix Export Video Sizing and Camera Summary

**Dynamic viewport from background image dimensions, full-frame score rendering, and cubic ease-in-out camera interpolation for exported video**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-10T00:12:05Z
- **Completed:** 2026-02-10T00:14:22Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Exported video dimensions now derive from background image (PNG/JPEG/WEBP header parsing) instead of hardcoded 1920x1080
- Score animation fills entire video frame via viewport override props (not squished into a 980px box)
- Camera scrolling in render mode uses cubic ease-in-out interpolation between system boundaries for smooth frame-by-frame movement
- Interactive mode completely unchanged -- WIDTH=980 scaling and CSS transition camera preserved

## Task Commits

Each task was committed atomically:

1. **Task 1: Dynamic viewport from background image + pass to frontend** - `bdbe665` (feat)
2. **Task 2: Fix RenderApp + RegularRenderer sizing and smooth camera interpolation** - `377e53e` (feat)

## Files Created/Modified
- `export-service/src/browser/pageSetup.ts` - Renamed buildBgDataUrl to buildBgInfo with dimension parsing; added viewportWidth/viewportHeight to ExportConfig; added getViewportFromConfig helper
- `export-service/src/jobs/jobManager.ts` - Uses config-derived viewport instead of hardcoded 1920x1080
- `src/types/global.d.ts` - Added viewportWidth/viewportHeight to frontend ExportConfig interface
- `src/RenderApp.tsx` - Passes viewport dimensions to RegularRenderer; uses pixel values instead of vw/vh
- `src/renderers/RegularRenderer.tsx` - Added viewportWidth/viewportHeight props; setDims short-circuits for render mode; setTimestamp uses cubic ease-in-out camera Y interpolation

## Decisions Made
- Parse image dimensions from raw buffer headers (PNG bytes 16-23, JPEG SOF0 marker, WEBP RIFF header) to avoid adding image-size or sharp dependency
- Use cubic ease-in-out (3t^2 - 2t^3) smoothstep for camera interpolation -- natural-feeling acceleration/deceleration between systems
- Propagate viewportWidth/viewportHeight through ExportConfig end-to-end (backend parses -> config carries -> frontend uses) rather than having frontend re-derive from bgUrl

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Export pipeline now produces correctly-sized video with smooth camera movement
- Ready for end-to-end testing with actual background images of various aspect ratios

## Self-Check: PASSED

All 5 modified files verified on disk. Both task commits (bdbe665, 377e53e) verified in git log.

---
*Quick Task: 9-fix-export-video*
*Completed: 2026-02-10*
