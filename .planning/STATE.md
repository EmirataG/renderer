# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-07)

**Core value:** Scores render correctly and efficiently -- high-quality engraving with smooth playback, even on long scores.
**Current focus:** v1.3 Canvas SingleLineRenderer (Konva.js migration)

## Current Position

Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 2026-02-07 — Milestone v1.3 started, v1.2 SVG virtualization abandoned

Progress: [========= ] 85% (v1.0 complete, v1.1 complete, v1.2 abandoned, v1.3 starting)

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
| 12 - SingleLineRenderer Core | 2/2 | 8 min | 4 min |

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [v1.0]: Camera uses g.system DOM elements for Y positions (no threshold heuristics)
- [v1.0]: BPM playback permanently removed; sync-only mode is the sole playback path
- [v1.1]: Canvas rendering rejected -- paginated SVG is the efficiency path
- [v1.1]: No new npm dependencies needed -- Verovio pagination API + React + Zustand suffice
- [v1.2]: SVG section virtualization abandoned -- React state timing in RAF loops caused camera snapping
- [v1.3]: Konva.js chosen over PixiJS -- better SVG compat, built-in tweening, no WebGL edge cases
- [v1.3]: Only SingleLineRenderer migrates to canvas -- RegularRenderer stays SVG

### v1.3 Research Insights

Key findings from Konva.js vs PixiJS research:

- **Performance**: PixiJS 2-3x faster (WebGL), but Konva sufficient for our object count
- **SVG handling**: Konva can load via Image or parse paths manually
- **Animation**: Konva has built-in Tween with easing, PixiJS requires GSAP
- **Hit testing**: Konva built-in per-shape events, PixiJS more manual
- **Caching**: Both excellent -- Konva layer.cache(), PixiJS cacheAsTexture()
- **Mobile**: Konva uses Canvas2D (universal), PixiJS has WebGL edge cases

Architecture approach:
```
Verovio SVG → SVG Parser → Konva Shapes → Cached Layers → Stage
                ↓
         Store note IDs + bounding boxes for hit testing
```

### Roadmap Evolution

- Phase 13 (SVG Section Virtualization) abandoned -- React state timing issues unfixable
- v1.2 incomplete, pivoting to v1.3 Canvas approach

### Pending Todos

None.

### Blockers/Concerns

- SVG-to-Konva conversion complexity unknown -- main technical risk
- Puppeteer frame capture deferred (canvas toDataURL simpler but not integrated yet)

## Session Continuity

Last session: 2026-02-07
Stopped at: New milestone v1.3 initialization
Resume file: None
Next: Define requirements and roadmap for Canvas migration

### Quick Tasks Completed

- quick-002: Smooth camera interpolation using lerp() - removes CSS transition stuttering
- quick-003: Staff line vertical alignment across sections using Y offset extraction (REVERTED in quick-004)
- quick-004: Revert quick-003 staff alignment + add music font selector to inspector
- quick-005: Fix music font selector - add fontLoadAll: true to Verovio hooks
- quick-006: Revert Phase 13.1 (Unplayed Score Styling) - feature didn't work correctly
- quick-007: Performance optimizations - useMemo CSS, binary search timeline, useShallow Zustand, pre-compiled regex
