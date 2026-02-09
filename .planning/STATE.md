# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-08)

**Core value:** Scores render correctly and efficiently -- high-quality engraving with smooth playback, even on long scores.
**Current focus:** v1.3 Performance & Polish (RegularRenderer virtualization, cursor, polish)

## Current Position

Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 2026-02-08 — Milestone v1.3 started

Progress: [          ] 0%

## Performance Metrics

**Velocity:**
- Total plans completed: 17
- Average duration: 2.4 min
- Total execution time: 41 min

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
| 13 - Section Virtualization | 2/3 | 6 min | 3 min |

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
- [v1.2]: Staff alignment reverted -- quick-003 approach didn't work correctly
- [v1.2]: Music font selectable via dropdown (Bravura, Petaluma, Leland, Gootville, Leipzig)
- [v1.2]: cameraX state tracks camera position for section virtualization
- [v1.2]: visibleSectionIndices useMemo computes current section +/- 1 buffer
- [v1.2]: Placeholder divs maintain refs for consistent DOM structure
- [v1.2]: 1-measure overlap for seamless section boundaries (tied notes/slurs continuity)
- [v1.2]: Overlap width = (overlapMeasures / totalRenderedMeasures) * sectionWidth
- [v1.2]: Clip-path inset(0 0 0 Xpx) + negative margin for seamless display

### v1.2 Research Insights

Key findings from research/SUMMARY.md:

- Verovio `breaks: 'none'` forces single horizontal system (verified in official docs)
- Verovio `select({ measureRange })` renders specific measure ranges as sections
- Asymmetric camera centering (30% from left) recommended for horizontal reading
- Section overlap (1-2 measures) needed for tied notes/slurs continuity
- Axis confusion (Y/X) is a critical pitfall -- use explicit type aliases

### Roadmap Evolution

- Phase 13.1 reverted -- unplayed styling feature did not work correctly

### Pending Todos

None.

### Blockers/Concerns

- Puppeteer frame capture deferred to future milestone (not in v1.2 scope)
- Browser SVG width limits (~32767px) may constrain section sizes on very long scores

## Session Continuity

Last session: 2026-02-08
Stopped at: Completed Phase 13-02 (seamless section boundaries)
Resume file: None
Next: Continue with Phase 13-03 (visibility prefetching)

### Quick Tasks Completed

- quick-002: Smooth camera interpolation using lerp() - removes CSS transition stuttering
- quick-003: Staff line vertical alignment across sections using Y offset extraction (REVERTED in quick-004)
- quick-004: Revert quick-003 staff alignment + add music font selector to inspector
- quick-005: Fix music font selector - add fontLoadAll: true to Verovio hooks
- quick-006: Revert Phase 13.1 (Unplayed Score Styling) - feature didn't work correctly
- quick-007: Performance optimizations - useMemo CSS, binary search timeline, useShallow Zustand, pre-compiled regex
