---
phase: 07-event-position-caching
plan: 01
subsystem: performance
tags: [zustand, caching, events, verovio, timemap]

# Dependency graph
requires:
  - phase: 06-paginated-rendering
    provides: Page containers and offsets for Y position computation
provides:
  - CachedEvent type with pageIndex and globalY fields
  - Zustand eventStore with lookup indices (eventById, eventsByPage)
  - Two-phase extraction: extractTimemapEvents (pure) + computeEventPositions (DOM)
affects:
  - 07-02 (RegularRenderer integration)
  - 08-virtual-scrolling (uses eventsByPage for viewport windowing)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Two-phase data extraction (pure timemap first, DOM positions second)
    - Map-based lookup indices built at set time (not in selectors)

key-files:
  created:
    - src/stores/eventStore.ts
  modified:
    - src/lib/getEvents.ts

key-decisions:
  - "Lookup indices built in setEvents action, not derived in selectors"
  - "svgPagesRef stored for cache invalidation checks"
  - "Import CachedEvent as type-only to avoid circular dependencies"

patterns-established:
  - "Two-phase extraction pattern: pure data extraction followed by DOM measurement"
  - "Event caching with reference-based invalidation"

# Metrics
duration: 3min
completed: 2026-02-04
---

# Phase 7 Plan 01: Event Cache Infrastructure Summary

**Zustand eventStore with CachedEvent type and two-phase extraction functions for separating pure timemap data from DOM-dependent Y positions**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-04T20:45:00Z
- **Completed:** 2026-02-04T20:48:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Created Zustand eventStore with CachedEvent interface including pageIndex and globalY
- Built O(1) lookup indices (eventById, eventsByPage) in setEvents action
- Added extractTimemapEvents() for pure timemap extraction (no DOM dependency)
- Added computeEventPositions() for DOM-dependent position computation
- Maintained full backward compatibility with existing getEventsFromVerovio()

## Task Commits

Each task was committed atomically:

1. **Task 1: Create eventStore.ts with CachedEvent type and Zustand store** - `726fb9d` (feat)
2. **Task 2: Refactor getEvents.ts with two-phase extraction functions** - `a42897c` (feat)

## Files Created/Modified
- `src/stores/eventStore.ts` - New Zustand store for cached events with lookup indices
- `src/lib/getEvents.ts` - Added TimemapEvent interface and two-phase extraction functions

## Decisions Made
- **Lookup indices built at set time:** Rather than using Zustand selectors to derive indices, eventById and eventsByPage Maps are built inside setEvents action. This ensures proper reference stability and avoids selector recomputation.
- **svgPagesRef for invalidation:** Store keeps reference to svgPages array to detect when cache needs rebuilding.
- **Type-only import:** CachedEvent imported with `import type` to ensure no runtime circular dependency between getEvents.ts and eventStore.ts.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Event cache infrastructure ready for RegularRenderer integration (Plan 02)
- extractTimemapEvents and computeEventPositions ready to replace direct getEventsFromVerovio calls
- eventStore ready to cache events and provide lookup indices for Phase 8 virtual scrolling

---
*Phase: 07-event-position-caching*
*Completed: 2026-02-04*
