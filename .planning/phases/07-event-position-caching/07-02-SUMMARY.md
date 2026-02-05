---
phase: 07-event-position-caching
plan: 02
subsystem: rendering
tags: [zustand, caching, react, verovio, events]

# Dependency graph
requires:
  - phase: 07-01
    provides: eventStore with CachedEvent type and two-phase extraction functions
provides:
  - RegularRenderer wired to eventStore for caching
  - SyncEditor reading from shared eventStore cache
  - Cache invalidation on svgPages reference change
affects: [08-virtual-scrolling, 09-optimization]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Zustand store selectors for component-specific cache access
    - Generic interpolateTimestamps function accepting InterpolatableEvent

key-files:
  created: []
  modified:
    - src/renderers/RegularRenderer.tsx
    - src/components/SyncEditor.tsx
    - src/lib/interpolation.ts
    - src/lib/animationController.ts

key-decisions:
  - "SyncEditor reads from shared cache instead of local extraction"
  - "Cache validity check uses reference equality (svgPagesRef === svgPages)"
  - "interpolateTimestamps made generic to accept both MusicalEvent and CachedEvent"

patterns-established:
  - "Component reads events via useEventStore selector"
  - "One component (RegularRenderer) writes to cache, others read"

# Metrics
duration: 3min
completed: 2026-02-04
---

# Phase 7 Plan 02: Component Cache Integration Summary

**RegularRenderer and SyncEditor wired to shared eventStore -- single extraction point with cache invalidation on svgPages change**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-04
- **Completed:** 2026-02-04
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- RegularRenderer extracts events once and stores in eventStore cache
- SyncEditor reads from shared cache (no duplicate extraction)
- Cache invalidates automatically when svgPages reference changes
- Type system updated to support both MusicalEvent and CachedEvent in interpolation

## Task Commits

Each task was committed atomically:

1. **Task 1: Update RegularRenderer to use eventStore for caching** - `d9c40a9` (feat)
2. **Task 2: Update SyncEditor to read from shared eventStore cache** - `fd26eaa` (feat)

## Files Created/Modified

- `src/renderers/RegularRenderer.tsx` - Now uses useEventStore for event caching with two-phase extraction
- `src/components/SyncEditor.tsx` - Now reads events from shared eventStore cache
- `src/lib/interpolation.ts` - Made interpolateTimestamps generic to accept InterpolatableEvent
- `src/lib/animationController.ts` - Updated config type to use minimal AnimatableEvent interface

## Decisions Made

1. **SyncEditor relies on RegularRenderer cache** - SyncEditor doesn't extract events itself. It reads from the shared cache populated by RegularRenderer. This is the normal flow: user loads score in preview tab (RegularRenderer populates cache), then switches to sync tab (SyncEditor reads cache).

2. **Cache validity uses reference equality** - The check `svgPagesRef === svgPages` uses reference equality rather than deep comparison. This works because Verovio returns a new array on each render, so reference change indicates content change.

3. **Generic interpolateTimestamps** - Updated to accept any type extending InterpolatableEvent (id, beatOnset, beatDuration, svgIds). This allows both MusicalEvent (with x) and CachedEvent (with globalY, pageIndex) to be interpolated.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Type compatibility between CachedEvent and MusicalEvent**
- **Found during:** Task 1 (RegularRenderer integration)
- **Issue:** interpolateTimestamps expected MusicalEvent[] but CachedEvent lacks `x` property
- **Fix:** Made interpolateTimestamps generic with InterpolatableEvent interface containing only required fields
- **Files modified:** src/lib/interpolation.ts, src/lib/animationController.ts
- **Verification:** Build passes, types compile correctly
- **Committed in:** d9c40a9 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Type fix required for correct compilation. No scope creep.

## Issues Encountered

None - implementation proceeded smoothly after type fix.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Event caching complete: single extraction point, shared cache, automatic invalidation
- Phase 8 (Virtual Scrolling) can now leverage eventsByPage index for efficient page-based rendering
- Performance improvement ready: no more redundant event extraction on tab switch

---
*Phase: 07-event-position-caching*
*Completed: 2026-02-04*
