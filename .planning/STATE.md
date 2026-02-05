# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-04)

**Core value:** Scores render correctly and efficiently -- high-quality engraving with smooth playback, even on long scores.
**Current focus:** Phase 7 - Event Position Caching

## Current Position

Phase: 7 of 9 (Event Position Caching)
Plan: --
Status: Ready to plan
Last activity: 2026-02-04 -- Completed Phase 6 (Paginated Rendering & Camera)

Progress: [########..] 80% (v1.0 complete, v1.1 Phase 6 complete)

## Performance Metrics

**Velocity:**
- Total plans completed: 8
- Average duration: 2 min
- Total execution time: 15 min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1 - Core Verovio Integration | 2/2 | 4 min | 2 min |
| 2 - Event System Migration | 1/1 | 1 min | 1 min |
| 2.1 - Sync-Only Playback | 2/2 | 4 min | 2 min |
| 6 - Paginated Rendering | 3/3 | 6 min | 2 min |

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

### Pending Todos

None.

### Blockers/Concerns

- Memory still high with paginated rendering -- all pages mounted. Phase 8 (virtual scrolling) will bound memory.
- Puppeteer frame capture requires all animated elements in DOM at screenshot time
- Event extraction happens on every render -- Phase 7 will cache events

## Session Continuity

Last session: 2026-02-04
Stopped at: Completed Phase 6 -- ready for Phase 7 planning
Resume file: None
