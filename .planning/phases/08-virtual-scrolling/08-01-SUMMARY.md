---
phase: 08-virtual-scrolling
plan: 01
subsystem: renderer
tags: [react, useMemo, virtual-scrolling, conditional-rendering, memory-optimization]

# Dependency graph
requires:
  - phase: 06-paginated-rendering
    provides: pageHeights, pageOffsets, totalHeight, pageCount from useVerovio
  - phase: 07-event-position-caching
    provides: Events with pageIndex for page-aware processing
provides:
  - visiblePageIndices useMemo computation from cameraY
  - Conditional page rendering (SVG vs placeholder divs)
  - Memory-bounded rendering (max 3 pages mounted during playback)
affects:
  - Phase 9 (if any future performance work)
  - Render mode (Puppeteer) - mounts all pages

# Tech tracking
tech-stack:
  added: []
  patterns:
    - useMemo for derived visibility state from camera position
    - Conditional rendering with placeholder divs for unmounted pages
    - Set-based page index lookup for O(1) visibility checks

key-files:
  created: []
  modified:
    - src/renderers/RegularRenderer.tsx

key-decisions:
  - "cameraY state updated in applyCamera for visibility recalculation"
  - "Set<number> for visiblePageIndices enables O(1) has() checks"
  - "Placeholder divs use pageHeights[i] for correct layout spacing"
  - "Unmounted pages set pageContainerRefs to null explicitly"

patterns-established:
  - "Virtual scrolling: compute visible indices from camera position, render conditionally"
  - "Short score optimization: mount all pages when pageCount <= 3"
  - "Render mode override: always mount all pages for Puppeteer capture"

# Metrics
duration: 1min 28sec
completed: 2026-02-05
---

# Phase 8 Plan 1: Virtual Scrolling Core Summary

**Memory-bounded rendering via useMemo-driven visible page indices with conditional SVG/placeholder rendering**

## Performance

- **Duration:** 1 min 28 sec
- **Started:** 2026-02-05T17:50:13Z
- **Completed:** 2026-02-05T17:51:41Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- cameraY state tracks camera position for visibility calculation
- visiblePageIndices useMemo computes which pages to mount (current +/- 1)
- Conditional rendering shows SVG for visible pages, placeholder divs for unmounted
- Short scores (3 or fewer pages) mount all pages
- Render mode (?render=true) mounts all pages for Puppeteer frame capture

## Task Commits

Each task was committed atomically:

1. **Task 1: Add cameraY state tracking** - `5da64d9` (feat)
2. **Task 2: Compute visiblePageIndices and conditional rendering** - `5d397ae` (feat)

## Files Created/Modified
- `src/renderers/RegularRenderer.tsx` - Added cameraY state, visiblePageIndices useMemo, conditional page rendering

## Decisions Made
- Used `Set<number>` for visiblePageIndices for O(1) `has()` checks in render loop
- Renamed local `cameraY` variable to `newCameraY` in applyCamera to avoid shadowing state variable
- Set `pageContainerRefs.current[i] = null` for unmounted pages to prevent stale refs in computeEventPositions

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Virtual scrolling core complete
- Memory is now bounded regardless of score length (max 3 pages mounted during playback)
- Event extraction in Phase 7 already filters null refs, so it works seamlessly with virtual scrolling
- Ready for verification testing with long scores

---
*Phase: 08-virtual-scrolling*
*Completed: 2026-02-05*
