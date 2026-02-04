---
phase: 06-paginated-rendering-and-camera
plan: 01
subsystem: rendering
tags: [verovio, pagination, svg, react-hooks, multi-page]

# Dependency graph
requires:
  - phase: 01-core-verovio-integration
    provides: useVerovio hook with single-page rendering
provides:
  - "Multi-page useVerovio hook returning svgPages[], pageHeights[], pageOffsets[], totalHeight"
  - "Verovio type declarations for getPageWithElement and redoLayout"
affects: [06-02 event system page mapping, 06-03 RegularRenderer pagination, 06-04 SyncEditor pagination, 06-05 camera system]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Paginated SVG rendering via getPageCount + renderToSVG loop"
    - "Page height extraction from SVG string attributes (no DOM parsing)"
    - "Cumulative offset table for flush page stacking"

key-files:
  modified:
    - src/hooks/useVerovio.ts
    - src/types/verovio-augments.d.ts

key-decisions:
  - "pageHeight: 2970 (Verovio A4 default) enables pagination vs 60000 single-page"
  - "Zero page margins (pageMarginTop: 0, pageMarginBottom: 0) for flush stacking"
  - "Removed adjustPageHeight option -- incompatible with fixed-height pagination"
  - "renderToMIDI called after loadData (before rendering loop) for timing queries"

patterns-established:
  - "Multi-page data shape: svgPages[], pageHeights[], pageOffsets[], totalHeight"
  - "SVG height regex extraction with viewBox fallback"

# Metrics
duration: 1min
completed: 2026-02-04
---

# Phase 6 Plan 01: Multi-Page useVerovio Hook Summary

**Paginated Verovio rendering hook returning svgPages[] with page heights, offsets, and total height metadata for downstream scroll/camera consumption**

## Performance

- **Duration:** 1 min
- **Started:** 2026-02-04T17:20:29Z
- **Completed:** 2026-02-04T17:21:43Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Verovio type declarations extended with getPageWithElement and redoLayout methods
- useVerovio hook refactored from single svgString to paginated svgPages[] array
- Page height extraction from SVG strings with viewBox fallback
- Cumulative offset table computed for flush page stacking
- Verovio options set to A4 page height (2970) with zero margins for pagination

## Task Commits

Each task was committed atomically:

1. **Task 1: Add missing Verovio type declarations** - `07938de` (feat)
2. **Task 2: Refactor useVerovio to multi-page rendering** - `3d9a8c0` (feat)

## Files Created/Modified
- `src/types/verovio-augments.d.ts` - Added getPageWithElement and redoLayout declarations to VerovioToolkit class
- `src/hooks/useVerovio.ts` - Refactored from single-page to multi-page pagination rendering with offset metadata

## Decisions Made
- Used pageHeight: 2970 (Verovio A4 default) to enable natural pagination instead of 60000 (single giant page)
- Removed adjustPageHeight option as it conflicts with fixed-height pagination mode
- Zero margins (pageMarginTop: 0, pageMarginBottom: 0) for flush page stacking without gaps
- renderToMIDI called after loadData but before the rendering loop to ensure timing queries work

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- svgPages[] and offset metadata ready for RegularRenderer (Plan 03) and SyncEditor (Plan 04) consumption
- Type declarations for getPageWithElement ready for event system page mapping (Plan 02)
- Consumers (RegularRenderer, SyncEditor) still reference removed svgString -- will be updated in Plans 02/03

---
*Phase: 06-paginated-rendering-and-camera*
*Completed: 2026-02-04*
