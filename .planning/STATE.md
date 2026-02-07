# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-05)

**Core value:** Scores render correctly and efficiently -- high-quality engraving with smooth playback, even on long scores.
**Current focus:** v1.2 SingleLineRenderer (Phase 12: SingleLineRenderer Core)

## Current Position

Phase: 12 - SingleLineRenderer Core
Plan: 01 of 2
Status: In progress
Last activity: 2026-02-06 -- Completed 12-01-PLAN.md

Progress: [===       ] 25% (v1.0 complete, v1.1 complete, v1.2 phases 10-12.01 complete)

## Performance Metrics

**Velocity:**
- Total plans completed: 15
- Average duration: 2.3 min
- Total execution time: 35 min

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
| 10 - Single-Line Verovio Hook | 1/1 | 3 min | 3 min |
| 11 - Single-Line Event Extraction | 1/1 | 3 min | 3 min |
| 12 - SingleLineRenderer Core | 1/2 | 4 min | 4 min |

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
- [v1.2]: Default 15 measures per section for balanced viewport rendering
- [v1.2]: Horizontal rendering uses breaks: 'none' + pageWidth: 100000 for single system
- [v1.2]: Section isolation via toolkit.select({ measureRange }) + redoLayout() + renderToSVG(1)
- [v1.2]: CachedEvent extended with optional sectionIndex, localX, globalX for horizontal positioning
- [v1.2]: DOM search across sections (not Verovio API) for reliable horizontal element lookup
- [v1.2]: Camera centers active note at 50% viewport (horizontal mode)
- [v1.2]: Section container refs for element queries to avoid cross-section ID collisions
- [v1.2]: Inline camera logic (not extracted to hook) per YAGNI principle
- [v1.2]: Camera interpolates position per-frame using lerp() -- no CSS transitions
- [v1.2]: Staff alignment via Y offset extraction from SVG paths and translateY offset

### v1.2 Research Insights

Key findings from research/SUMMARY.md:

- Verovio `breaks: 'none'` forces single horizontal system (verified in official docs)
- Verovio `select({ measureRange })` renders specific measure ranges as sections
- Asymmetric camera centering (30% from left) recommended for horizontal reading
- Section overlap (1-2 measures) needed for tied notes/slurs continuity
- Axis confusion (Y/X) is a critical pitfall -- use explicit type aliases

### Pending Todos

None.

### Blockers/Concerns

- Puppeteer frame capture deferred to future milestone (not in v1.2 scope)
- Section boundary seams are critical UX -- Phase 13 must validate seamless transitions
- Browser SVG width limits (~32767px) may constrain section sizes on very long scores

## Session Continuity

Last session: 2026-02-07
Stopped at: Completed quick-003-PLAN.md (Staff Line Alignment)
Resume file: None
Next: `/gsd:execute-plan 12-02` (Integration)

### Quick Tasks Completed

- quick-002: Smooth camera interpolation using lerp() - removes CSS transition stuttering
- quick-003: Staff line vertical alignment across sections using Y offset extraction
