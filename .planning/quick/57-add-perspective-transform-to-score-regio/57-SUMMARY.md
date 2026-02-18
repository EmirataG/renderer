---
phase: quick-57
plan: 01
subsystem: ui
tags: [css-transforms, matrix3d, perspective, homography, score-region]

requires:
  - phase: quick-54
    provides: rotation transform infrastructure (ScoreRegion.rotation, rotation wrapper in renderers)
provides:
  - PerspectiveCorners interface and optional perspective field on ScoreRegion
  - computeMatrix3d/hasPerspective utility for CSS matrix3d homography from corner offsets
  - Draggable diamond corner handles in ScoreRegionEditor for perspective adjustment
  - Perspective wrapper div in RegularRenderer, SingleLineRenderer, and export standalone
affects: [renderers, export-service, score-region, auto-save]

tech-stack:
  added: []
  patterns: [nested-wrapper-composition, homography-dlt, perspective-inner-rotation-outer]

key-files:
  created:
    - src/lib/perspectiveTransform.ts
  modified:
    - src/types/score.ts
    - src/types/project.ts
    - src/types/global.d.ts
    - export-service/src/shared/exportSettings.ts
    - export-service/src/browser/pageSetup.ts
    - export-service/src/standalone/render.ts
    - src/components/ScoreRegionEditor.tsx
    - src/renderers/RegularRenderer.tsx
    - src/renderers/SingleLineRenderer.tsx

key-decisions:
  - "Nested wrapper approach: rotation on outer div, perspective on inner div for clean composition"
  - "DLT homography solver via Gaussian elimination with partial pivoting (no external deps)"
  - "Duplicated computeMatrix3d in export service render.ts (same pattern as animation.ts duplication)"

patterns-established:
  - "Nested transform wrappers: rotation wrapper > perspective wrapper > content (composable transforms)"
  - "Diamond-shaped handles (rotated squares) for perspective vs square handles for resize"

requirements-completed: [QUICK-57]

duration: 4min
completed: 2026-02-17
---

# Quick Task 57: Perspective Transform Summary

**CSS matrix3d perspective distortion via draggable corner handles on score region, using DLT homography solver**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-18T02:13:06Z
- **Completed:** 2026-02-18T02:17:16Z
- **Tasks:** 3
- **Files modified:** 10

## Accomplishments
- Extended ScoreRegion type with PerspectiveCorners across all 6 type definition locations
- Created perspectiveTransform.ts utility with homography solver (Gaussian elimination + DLT)
- Added 4 cyan diamond drag handles in ScoreRegionEditor for independent corner perspective adjustment
- Applied matrix3d perspective transform in RegularRenderer, SingleLineRenderer, and export standalone

## Task Commits

Each task was committed atomically:

1. **Task 1: Add perspective field to ScoreRegion type and create matrix3d utility** - `238c5fe` (feat)
2. **Task 2: Add perspective corner handles to ScoreRegionEditor** - `da0e84f` (feat)
3. **Task 3: Apply perspective matrix3d in renderers and export service** - `8c4c8fe` (feat)

## Files Created/Modified
- `src/lib/perspectiveTransform.ts` - CSS matrix3d computation from corner offsets via DLT homography
- `src/types/score.ts` - PerspectiveCorners interface, ScoreRegion.perspective field
- `src/types/project.ts` - Inline scoreRegion perspective field
- `src/types/global.d.ts` - ExportConfig scoreRegion perspective field
- `export-service/src/shared/exportSettings.ts` - TypeBox schema for perspective
- `export-service/src/browser/pageSetup.ts` - ExportConfig perspective type
- `export-service/src/standalone/render.ts` - Duplicated perspective functions + perspective wrapper DOM
- `src/components/ScoreRegionEditor.tsx` - Diamond perspective handles, buildRegion helper, preview overlay
- `src/renderers/RegularRenderer.tsx` - Perspective wrapper div with matrix3d inside rotation wrapper
- `src/renderers/SingleLineRenderer.tsx` - Same perspective wrapper pattern

## Decisions Made
- Nested wrapper composition: rotation on outer div (center origin), perspective on inner div (0 0 origin) -- avoids transform-origin conflict
- DLT homography solver implemented inline with Gaussian elimination and partial pivoting, no external dependencies
- Duplicated computeMatrix3d/hasPerspective in export service render.ts following the established pattern of self-contained export logic (same as animation.ts)
- Diamond-shaped (rotated 45deg square) cyan handles visually distinguish perspective from resize handles

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Perspective transform fully integrated across editor, preview renderers, and export pipeline
- Auto-save works automatically since perspective is nested inside scoreRegion

---
*Quick Task: 57*
*Completed: 2026-02-17*
