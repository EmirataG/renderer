---
phase: 10-single-line-verovio-hook
plan: 01
subsystem: rendering
tags: [verovio, react-hooks, svg, musicxml, horizontal-rendering]

# Dependency graph
requires:
  - phase: 01-core-verovio-integration
    provides: verovioService with createToolkit()
  - phase: 09-osmd-cleanup
    provides: clean Verovio-only codebase
provides:
  - useSingleLineVerovio hook for horizontal section rendering
  - VerovioSelection type for select() API
  - Section-based rendering with widths and offsets
affects: [11-horizontal-camera, 12-single-line-renderer, 13-polish-integration]

# Tech tracking
tech-stack:
  added: []
  patterns: [breaks-none-rendering, select-measurerange-sectioning]

key-files:
  created:
    - src/hooks/useSingleLineVerovio.ts
  modified:
    - src/types/verovio-augments.d.ts

key-decisions:
  - "Default 15 measures per section for balanced viewport rendering"
  - "Extract width from SVG width attribute first, viewBox as fallback"
  - "Clear selection after rendering all sections for clean state"

patterns-established:
  - "Horizontal rendering: breaks: 'none' + pageWidth: 100000 forces single system"
  - "Section isolation: toolkit.select({ measureRange }) + redoLayout() + renderToSVG(1)"
  - "Width extraction: parse SVG width attribute or viewBox"

# Metrics
duration: 3min
completed: 2026-02-05
---

# Phase 10 Plan 01: Single-Line Verovio Hook Summary

**useSingleLineVerovio hook for horizontal MusicXML rendering with Verovio select() API for measure-range sectioning**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-05T18:25:00Z
- **Completed:** 2026-02-05T18:28:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Added `select()` method type definition to verovio-augments.d.ts with VerovioSelection interface
- Created useSingleLineVerovio hook (183 lines) following useVerovio.ts patterns
- Hook renders MusicXML as horizontal sections using `breaks: 'none'` configuration
- Section-based rendering via `select({ measureRange })` API with configurable measures per section

## Task Commits

Each task was committed atomically:

1. **Task 1: Add select() type definition to verovio-augments.d.ts** - `d8bdd9c` (feat)
2. **Task 2: Create useSingleLineVerovio hook** - `e50a553` (feat)

## Files Created/Modified
- `src/types/verovio-augments.d.ts` - Added select() method and VerovioSelection interface
- `src/hooks/useSingleLineVerovio.ts` - New hook for horizontal section-based rendering

## Decisions Made
- Default 15 measures per section (within 10-20 range specified in requirements)
- Width extraction prioritizes SVG width attribute, falls back to viewBox parsing
- Selection cleared after section rendering for clean toolkit state
- renderToMIDI() called after loadData to enable timing queries (following useVerovio.ts pattern)

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- useSingleLineVerovio hook ready for use by SingleLineRenderer component
- Hook provides all data needed for horizontal layout: sections[], sectionWidths[], sectionOffsets[], totalWidth
- Camera positioning (Phase 11) can use sectionOffsets for viewport calculations
- SingleLineRenderer (Phase 12) can render sections using the hook output

---
*Phase: 10-single-line-verovio-hook*
*Completed: 2026-02-05*
