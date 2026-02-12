---
phase: 43-fix-notehead-z-index
plan: 01
subsystem: ui
tags: [svg, verovio, notehead, animation, z-index, dom-reorder]

# Dependency graph
requires:
  - phase: 01-core-verovio
    provides: "Verovio SVG rendering pipeline"
provides:
  - "reorderNoteheadsAboveStems utility for SVG DOM reordering"
  - "Colored noteheads visible above stems in both renderers"
affects: [RegularRenderer, SingleLineRenderer, noteAnimation, export-rendering]

# Tech tracking
tech-stack:
  added: []
  patterns: ["SVG DOM reorder for painter's order (appendChild to move last)"]

key-files:
  created: []
  modified:
    - src/lib/noteAnimation.ts
    - src/renderers/RegularRenderer.tsx
    - src/renderers/SingleLineRenderer.tsx

key-decisions:
  - "Universal notehead reorder via querySelectorAll('g.notehead') + appendChild -- handles both single notes and chords"
  - "Reorder runs once per SVG render (in rAF callback), not per animation frame"
  - "Reorder placed before resetNoteheadAnimations so DOM order is correct before any style reset"

patterns-established:
  - "SVG painter's order fix: move target element to lastChild via appendChild (DOM move, not clone)"

# Metrics
duration: 1min
completed: 2026-02-12
---

# Quick Task 43: Fix Notehead Z-Index Summary

**SVG DOM reordering utility moves g.notehead to last child of g.note, ensuring colored noteheads paint above stems in both renderers**

## Performance

- **Duration:** ~1 min
- **Started:** 2026-02-12T02:56:25Z
- **Completed:** 2026-02-12T02:57:16Z
- **Tasks:** 1
- **Files modified:** 3

## Accomplishments
- Created `reorderNoteheadsAboveStems` utility that moves all `g.notehead` elements to be the last child of their parent, fixing SVG painter's order
- Integrated into RegularRenderer (paginated mode) SVG render useEffect
- Integrated into SingleLineRenderer (horizontal mode) SVG render useEffect
- Colored noteheads now render visibly above stems during playback animation and export

## Task Commits

Each task was committed atomically:

1. **Task 1: Create DOM reordering utility and integrate into both renderers** - `6f6de9b` (fix)

## Files Created/Modified
- `src/lib/noteAnimation.ts` - Added `reorderNoteheadsAboveStems` export function
- `src/renderers/RegularRenderer.tsx` - Import + call reorderNoteheadsAboveStems in SVG render useEffect
- `src/renderers/SingleLineRenderer.tsx` - Import + call reorderNoteheadsAboveStems in SVG render useEffect

## Decisions Made
- Used universal `querySelectorAll('g.notehead')` approach rather than targeting specific note/chord structures -- simpler and handles all Verovio output patterns
- Placed reorder call before `resetNoteheadAnimations` so DOM is correctly ordered before any style operations
- No changes needed to `animationController.ts` -- it applies color to existing DOM elements; the reorder from renderers persists

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Fix is self-contained; no follow-up work needed
- Export rendering (Puppeteer) benefits automatically since DOM reorder persists

## Self-Check: PASSED

- All 3 modified files exist on disk
- Commit `6f6de9b` exists in git log
- `reorderNoteheadsAboveStems` found in all 3 files (1 definition, 2 imports + calls)
- TypeScript compiles cleanly (`npx tsc --noEmit`)

---
*Quick Task: 43-fix-notehead-z-index*
*Completed: 2026-02-12*
