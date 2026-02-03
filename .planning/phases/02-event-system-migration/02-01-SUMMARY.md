---
phase: 02-event-system-migration
plan: 01
subsystem: events
tags: [verovio, timemap, musical-events, dom-positions, bpm-animation]

# Dependency graph
requires:
  - phase: 01-core-verovio-integration
    provides: "Verovio WASM toolkit, useVerovio hook, renderToMIDI timing data"
provides:
  - "getEventsFromVerovio() function extracting MusicalEventWithY[] from Verovio timemap"
  - "MusicalEventWithY interface exported from getEvents.ts"
  - "renderToTimemap type declaration in verovio-augments.d.ts"
  - "RegularRenderer wired to populate events after each Verovio render"
affects: [03-animation-and-camera, 04-synced-editor-migration]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Verovio timemap API for beat onset extraction (qstamp / 4 = whole-note fractions)"
    - "DOM getBoundingClientRect for Y position extraction relative to container"
    - "requestAnimationFrame guard before DOM queries on Verovio SVG"

key-files:
  created: []
  modified:
    - "src/types/verovio-augments.d.ts"
    - "src/lib/getEvents.ts"
    - "src/renderers/RegularRenderer.tsx"

key-decisions:
  - "qstamp divided by 4 converts quarter-note units to whole-note fractions matching OSMD RealValue convention"
  - "Rests excluded from timemap by default (no includeRests option) to match existing OSMD behavior"
  - "First svgId used for Y position extraction per event (representative note in chord)"

patterns-established:
  - "getEventsFromVerovio(toolkit, container) pattern for Verovio event extraction"
  - "MusicalEventWithY extends MusicalEvent with y field for vertical scrolling"

# Metrics
duration: 1min
completed: 2026-02-03
---

# Phase 2 Plan 01: Event System Migration Summary

**Verovio timemap event extraction producing MusicalEventWithY[] with beat onsets and DOM Y positions, wired into RegularRenderer for BPM scrolling**

## Performance

- **Duration:** 1 min
- **Started:** 2026-02-03T22:22:21Z
- **Completed:** 2026-02-03T22:23:47Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Created getEventsFromVerovio() that extracts events from Verovio renderToTimemap API with qstamp-to-RealValue conversion
- Exported MusicalEventWithY interface and wired event extraction into RegularRenderer's post-render rAF callback
- BPM animation pipeline now consumes Verovio-sourced events with correct Y positions for vertical camera scrolling
- Preserved original getEvents() function for SyncEditor backward compatibility

## Task Commits

Each task was committed atomically:

1. **Task 1: Add renderToTimemap type and create getEventsFromVerovio function** - `7c1bf16` (feat)
2. **Task 2: Wire event extraction into RegularRenderer after Verovio SVG render** - `b7e762a` (feat)

## Files Created/Modified
- `src/types/verovio-augments.d.ts` - Added renderToTimemap() method declaration to VerovioToolkit class
- `src/lib/getEvents.ts` - Added getEventsFromVerovio() function and MusicalEventWithY interface export
- `src/renderers/RegularRenderer.tsx` - Imported and called getEventsFromVerovio in post-render rAF, removed local MusicalEventWithY interface

## Decisions Made
- qstamp / 4 conversion: Verovio timemap uses quarter-note units (qstamp), divided by 4 to produce whole-note fractions matching OSMD's RealValue convention that interpolateTimestamps() expects
- Rests excluded by default: No includeRests option passed to renderToTimemap, matching existing OSMD behavior that explicitly skips rests
- First svgId for Y position: Uses the first note ID in each event's svgIds array for getBoundingClientRect Y extraction (representative of chord position)
- toolkit added to useEffect deps: Safe because toolkit changes alongside svgString (both from useVerovio)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- MusicalEventWithY[] pipeline complete: events flow from Verovio timemap through DOM Y extraction into RegularRenderer state
- interpolateTimestamps() receives compatible events via syncAnchors useEffect
- Phase 3 (Animation and Camera) can now build on event data for notehead animation and camera scrolling validation
- Phase 2 timing model concern (MIDI milliseconds vs beat fractions) resolved: qstamp/4 produces correct whole-note fractions

---
*Phase: 02-event-system-migration*
*Completed: 2026-02-03*
