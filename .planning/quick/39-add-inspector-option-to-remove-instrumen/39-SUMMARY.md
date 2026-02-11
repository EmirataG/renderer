---
phase: quick-39
plan: 01
subsystem: ui
tags: [verovio, css, inspector, score-appearance, export-pipeline]

# Dependency graph
requires:
  - phase: 16-frontend-render-mode
    provides: RenderApp.tsx export pipeline and ExportConfig injection
provides:
  - hideLabels checkbox in inspector Score Appearance section
  - CSS-based instrument label hiding in preview and export
affects: [score-appearance, export-settings]

# Tech tracking
tech-stack:
  added: []
  patterns: [CSS display:none for Verovio element class hiding]

key-files:
  created: []
  modified:
    - src/App.tsx
    - src/renderers/RegularRenderer.tsx
    - src/renderers/SingleLineRenderer.tsx
    - src/lib/exportClient.ts
    - src/types/global.d.ts
    - src/RenderApp.tsx
    - export-service/src/shared/exportSettings.ts
    - export-service/src/browser/pageSetup.ts

key-decisions:
  - "CSS display:none on .label class to hide Verovio instrument labels (non-destructive, toggle-friendly)"

patterns-established:
  - "Inspector checkbox -> CSS rule pattern: boolean state drives conditional CSS string in scoreColorCss useMemo"

# Metrics
duration: 2min
completed: 2026-02-11
---

# Quick Task 39: Add Inspector Option to Remove Instrument Labels Summary

**Inspector checkbox hides Verovio `.label` elements via CSS display:none, threaded through full export pipeline**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-11T03:38:00Z
- **Completed:** 2026-02-11T03:40:59Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- Added "Hide Instrument Labels" checkbox in Score Appearance section of inspector
- CSS-based label hiding using `.preview-score .label { display: none !important }` when enabled
- Full export pipeline threading: ExportSettings -> ExportConfig -> RenderApp -> RegularRenderer
- Both RegularRenderer and SingleLineRenderer support the hideLabels prop

## Task Commits

Each task was committed atomically:

1. **Task 1: Add hideLabels state and checkbox to inspector** - `f9723ec` (feat)
2. **Task 2: Implement CSS-based label hiding and thread through export pipeline** - `bcc504a` (feat)

## Files Created/Modified
- `src/App.tsx` - hideLabels state, checkbox UI, prop threading to renderers, export settings inclusion
- `src/renderers/RegularRenderer.tsx` - hideLabels prop in interface/destructure, CSS rule in scoreColorCss
- `src/renderers/SingleLineRenderer.tsx` - hideLabels prop in interface/destructure, CSS rule in scoreColorCss
- `src/lib/exportClient.ts` - hideLabels field in ExportSettings interface
- `src/types/global.d.ts` - hideLabels field in ExportConfig global interface
- `src/RenderApp.tsx` - Pass hideLabels from config to RegularRenderer
- `export-service/src/shared/exportSettings.ts` - hideLabels in TypeBox ExportSettingsSchema
- `export-service/src/browser/pageSetup.ts` - hideLabels in ExportConfig interface and buildExportConfig

## Decisions Made
- CSS `display: none !important` on `.label` class -- non-destructive approach that doesn't modify SVG DOM, easily toggled

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added hideLabels to SingleLineRenderer**
- **Found during:** Task 2 (build verification)
- **Issue:** Plan only specified RegularRenderer but App.tsx passes hideLabels to SingleLineRenderer too, causing TS2322
- **Fix:** Added hideLabels to SingleLineRenderer Props interface, destructured props, and scoreColorCss useMemo
- **Files modified:** src/renderers/SingleLineRenderer.tsx
- **Verification:** `npm run build` succeeds
- **Committed in:** bcc504a (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Auto-fix necessary for build success. SingleLineRenderer was a natural extension of the same pattern.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- hideLabels setting is fully operational in preview and export pipeline
- No blockers

## Self-Check: PASSED

All 8 modified files verified present. Both task commits (f9723ec, bcc504a) verified in git log.

---
*Quick Task: 39*
*Completed: 2026-02-11*
