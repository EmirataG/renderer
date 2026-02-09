# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-09)

**Core value:** Scores render correctly and efficiently -- high-quality engraving with smooth playback, even on long scores.
**Current focus:** v1.4 Backend Video Export

## Current Position

Phase: 15 - Backend Foundation & Settings Transfer
Plan: 3 of 3
Status: Phase Complete
Last activity: 2026-02-09 — Completed 15-03 (Frontend export client + E2E contract verification)

Progress: [##########] 3/3 plans

## Performance Metrics

**Velocity:**

- Total plans completed: 22
- Average duration: 2.4 min
- Total execution time: 52 min

**By Phase:**

| Phase                             | Plans | Total | Avg/Plan |
| --------------------------------- | ----- | ----- | -------- |
| 1 - Core Verovio Integration      | 2/2   | 4 min | 2 min    |
| 2 - Event System Migration        | 1/1   | 1 min | 1 min    |
| 2.1 - Sync-Only Playback          | 2/2   | 4 min | 2 min    |
| 6 - Paginated Rendering           | 3/3   | 6 min | 2 min    |
| 7 - Event Position Caching        | 2/2   | 6 min | 3 min    |
| 8 - Virtual Scrolling             | 1/1   | 2 min | 2 min    |
| 9 - OSMD Cleanup                  | 1/1   | 2 min | 2 min    |
| 10 - Single-Line Verovio Hook     | 1/1   | 3 min | 3 min    |
| 11 - Single-Line Event Extraction | 1/1   | 3 min | 3 min    |
| 12 - SingleLineRenderer Core      | 1/2   | 4 min | 4 min    |
| 13 - Section Virtualization       | 2/3   | 6 min | 3 min    |
| 14 - Page Virtualization          | 2/2   | 5 min | 2.5 min  |
| 15 - Backend Foundation           | 3/3   | 6 min | 2 min    |

_Updated after each plan completion_

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.

- 15-01: Placed export-service/ inside renderer repo (git root is renderer/, not Manuscript/)
- 15-01: Used TypeBox for single-source schema + type derivation (eliminates drift)
- 15-02: Audio files streamed to disk via pipeline() (not buffered in memory)
- 15-02: Fastify multipart plugin rejects non-multipart at plugin level (406)
- 15-03: ExportRequest accepts raw Map and serializes via Object.fromEntries() internally
- 15-03: MusicXML sent as Blob file (not text field) to avoid 1MB field size limit

### Roadmap Evolution

- Phase 13.1 reverted -- unplayed styling feature did not work correctly
- Phase 15 (Playhead Cursor) removed from v1.3 before shipping

### Pending Todos

None.

### Blockers/Concerns

None.

## Session Continuity

Last session: 2026-02-09
Stopped at: Completed 15-03-PLAN.md (Phase 15 complete)
Resume file: None
Next: Next phase (16+)

### Quick Tasks Completed

- quick-002: Smooth camera interpolation using lerp() - removes CSS transition stuttering
- quick-003: Staff line vertical alignment across sections using Y offset extraction (REVERTED in quick-004)
- quick-004: Revert quick-003 staff alignment + add music font selector to inspector
- quick-005: Fix music font selector - add fontLoadAll: true to Verovio hooks
- quick-006: Revert Phase 13.1 (Unplayed Score Styling) - feature didn't work correctly
- quick-007: Performance optimizations - useMemo CSS, binary search timeline, useShallow Zustand, pre-compiled regex
