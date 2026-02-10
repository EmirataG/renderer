---
phase: quick-23
plan: 01
subsystem: rendering
tags: [cubic-bezier, easing, css-transition, export, camera, animation]

requires:
  - phase: quick-12b
    provides: "CSS transition simulation in setTimestamp"
provides:
  - "Exact CSS ease-out cubic-bezier evaluator for export camera"
  - "cubicBezierEase() generic helper for any cubic-bezier curve"
affects: [export-video, camera-scrolling]

tech-stack:
  added: []
  patterns: ["Newton-Raphson cubic-bezier solver for CSS transition simulation"]

key-files:
  created: []
  modified:
    - src/renderers/RegularRenderer.tsx

key-decisions:
  - "Newton-Raphson with 8 iterations for cubic-bezier solving (sufficient precision for 60fps)"
  - "Module-level helper functions (not inside component) for zero allocation overhead"

patterns-established:
  - "cubicBezierEase(x1, y1, x2, y2, t) for matching any CSS cubic-bezier curve in JS"

duration: 1min
completed: 2026-02-10
---

# Quick Task 23: Export Scrolling Easing Fix Summary

**Exact CSS cubic-bezier(0, 0, 0.58, 1) evaluator replaces power-curve approximation in export camera simulation**

## Performance

- **Duration:** 1 min
- **Started:** 2026-02-10T14:00:54Z
- **Completed:** 2026-02-10T14:01:49Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Replaced `1 - Math.pow(1 - t, 3)` power-curve approximation with mathematically exact CSS ease-out evaluation
- Added generic `cubicBezierEase()` Newton-Raphson solver that can match any CSS cubic-bezier curve
- Export video camera scrolling now produces identical easing to the browser's native CSS `transition: transform 200ms ease-out`

## Task Commits

Each task was committed atomically:

1. **Task 1: Replace power-curve approximation with exact CSS cubic-bezier evaluator** - `8b77f72` (fix)

## Files Created/Modified
- `src/renderers/RegularRenderer.tsx` - Added `cubicBezierEase()` and `cssEaseOut()` module-level helpers; replaced power-curve easing in `setTimestamp()` camera simulation

## Decisions Made
- Newton-Raphson with 8 iterations chosen for cubic-bezier solving -- provides sub-pixel precision at 60fps while keeping computation minimal
- Helper functions placed at module level (not inside component) to avoid re-creation on each render and keep zero allocation overhead
- Generic `cubicBezierEase(x1, y1, x2, y2, t)` signature allows reuse for other CSS timing functions if needed

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

---
*Quick task: 23*
*Completed: 2026-02-10*
