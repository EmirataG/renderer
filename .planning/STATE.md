# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-04)

**Core value:** Scores render correctly and efficiently — high-quality engraving with smooth playback, even on long scores.
**Current focus:** Milestone v1.1 - Efficiency (defining requirements)

## Current Position

Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements for v1.1
Last activity: 2026-02-04 — Milestone v1.1 started (merged remaining migration cleanup)

Progress: New milestone

## Performance Metrics

**Velocity (from v1.0 migration):**
- Total plans completed: 5
- Average duration: 2 min
- Total execution time: 9 min

**By Phase (v1.0):**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1 - Core Verovio Integration | 2/2 | 4 min | 2 min |
| 2 - Event System Migration | 1/1 | 1 min | 1 min |
| 2.1 - Sync-Only Playback | 2/2 | 4 min | 2 min |

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [v1.0]: Lazy singleton WASM pattern (ensureModule) for single-load guarantee
- [v1.0]: renderToMIDI() called after every render to pre-populate timing data
- [v1.0]: qstamp / 4 converts quarter-note units to whole-note fractions
- [v1.0]: BPM playback permanently removed; sync-only mode is the sole playback path
- [v1.0]: Transport gating requires audio + first AND last event sync anchors
- [v1.0]: Camera uses g.system DOM elements for Y positions (no threshold heuristics)
- [v1.0]: CSS.escape() used for SVG ID selectors to handle Verovio's ID format
- [v1.1]: Canvas rendering rejected — paginated SVG is the efficiency path
- [v1.1]: Remaining OSMD cleanup merged into efficiency milestone

### Roadmap Evolution

- v1.0 migration Phases 1, 2, 2.1 completed via GSD workflow
- v1.0 Phase 3 (camera fix, animation verification) completed via quick fixes
- v1.0 Phase 4 (SyncEditor) absorbed into Phase 2.1
- v1.0 Phase 5 (OSMD removal) merged into v1.1 as CLN-01
- v1.1 milestone started: efficiency + cleanup

### Pending Todos

None.

### Blockers/Concerns

- Current single-page SVG approach causes 6GB+ memory on long scores — primary motivation for v1.1
- Paginated rendering requires adapting camera, event extraction, and animation systems that all assume single continuous SVG
- Verovio page-by-page rendering changes coordinate systems — event Y positions become page-relative

## Session Continuity

Last session: 2026-02-04
Stopped at: Starting v1.1 milestone — defining requirements
Resume file: None
