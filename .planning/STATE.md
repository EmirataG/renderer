# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-04)

**Core value:** Scores render correctly and efficiently -- high-quality engraving with smooth playback, even on long scores.
**Current focus:** Phase 6 - Paginated Rendering & Camera

## Current Position

Phase: 6 of 9 (Paginated Rendering & Camera)
Plan: 1 of 3 in phase
Status: In progress
Last activity: 2026-02-04 -- Completed 06-01-PLAN.md (multi-page useVerovio hook)

Progress: [######....] 60% (v1.0 complete, v1.1 Plan 01 done)

## Performance Metrics

**Velocity:**
- Total plans completed: 6
- Average duration: 2 min
- Total execution time: 10 min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1 - Core Verovio Integration | 2/2 | 4 min | 2 min |
| 2 - Event System Migration | 1/1 | 1 min | 1 min |
| 2.1 - Sync-Only Playback | 2/2 | 4 min | 2 min |
| 6 - Paginated Rendering | 1/3 | 1 min | 1 min |

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

### Pending Todos

None.

### Blockers/Concerns

- Single-page SVG causes 6GB+ memory on long scores -- Phase 6 addresses root cause
- Paginated rendering changes coordinate systems -- event Y positions become page-relative + global offset
- getBoundingClientRect coordinate space mismatch risk across page boundaries
- Puppeteer frame capture requires all animated elements in DOM at screenshot time

## Session Continuity

Last session: 2026-02-04T17:21:43Z
Stopped at: Completed 06-01-PLAN.md (multi-page useVerovio hook)
Resume file: None
