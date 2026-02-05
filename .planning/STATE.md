# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-05)

**Core value:** Scores render correctly and efficiently -- high-quality engraving with smooth playback, even on long scores.
**Current focus:** v1.2 SingleLineRenderer (Defining requirements)

## Current Position

Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 2026-02-05 — Milestone v1.2 started

Progress: [          ] 0% (v1.0 complete, v1.1 complete, v1.2 started)

## Performance Metrics

**Velocity:**
- Total plans completed: 12
- Average duration: 2.0 min
- Total execution time: 25 min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1 - Core Verovio Integration | 2/2 | 4 min | 2 min |
| 2 - Event System Migration | 1/1 | 1 min | 1 min |
| 2.1 - Sync-Only Playback | 2/2 | 4 min | 2 min |
| 6 - Paginated Rendering | 3/3 | 6 min | 2 min |
| 7 - Event Position Caching | 2/2 | 6 min | 3 min |
| 8 - Virtual Scrolling | 1/1 | 2 min | 2 min |
| 9 - OSMD Cleanup | 1/1 | 2 min | 2 min |

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [v1.0]: Camera uses g.system DOM elements for Y positions (no threshold heuristics)
- [v1.0]: BPM playback permanently removed; sync-only mode is the sole playback path
- [v1.1]: Canvas rendering rejected -- paginated SVG is the efficiency path
- [v1.1]: No new npm dependencies needed -- Verovio pagination API + React + Zustand suffice
- [v1.1]: Virtual scroll libraries rejected -- CSS transform camera incompatible with scroll-based models
- [v1.1]: Puppeteer render mode disables virtual scrolling (all pages mounted)
- [v1.1]: pageHeight: 2970 (A4 default) enables Verovio pagination; zero margins for flush stacking
- [v1.1]: Removed adjustPageHeight -- incompatible with fixed-height pagination mode
- [v1.1]: getEventsFromVerovio backward-compatible via optional params -- SyncEditor unchanged
- [v1.1]: Flush SVG stacking via CSS (lineHeight:0, fontSize:0, display:block) -- no negative margins
- [v1.1]: Lookup indices (eventById, eventsByPage) built at setEvents time, not in selectors
- [v1.1]: Two-phase extraction: pure timemap first, DOM positions second
- [v1.1]: SyncEditor reads from shared cache (no duplicate extraction)
- [v1.1]: Cache validity uses reference equality (svgPagesRef === svgPages)
- [v1.1]: interpolateTimestamps made generic for InterpolatableEvent
- [v1.1]: Set<number> for visiblePageIndices enables O(1) has() checks in render loop
- [v1.1]: Placeholder divs use pageHeights[i] for correct layout spacing
- [v1.1]: Unmounted pages set pageContainerRefs to null explicitly
- [v1.1]: OSMD fully removed -- Verovio is sole rendering engine

### Pending Todos

None.

### Blockers/Concerns

- Puppeteer frame capture requires all animated elements in DOM at screenshot time (handled: render mode mounts all pages)
- Event extraction now happens once per svgPages change (Phase 7 resolved this)
- Memory now bounded: max 3 pages mounted during playback (Phase 8 resolved this)

## Session Continuity

Last session: 2026-02-05
Stopped at: Started v1.2 milestone — SingleLineRenderer
Resume file: None
