# Project State: Manuscript Renderer

## Project Reference

**Core Value:** Scores render correctly and efficiently -- high-quality engraving with smooth playback, even on long scores.

**Current Milestone:** v1.3 PixiJS SingleLineRenderer

**Current Focus:** Migrate SingleLineRenderer from SVG to PixiJS WebGL rendering for smooth 60fps scrolling and GPU-accelerated highlighting.

## Current Position

**Phase:** 14 of 19 (SVG-to-Texture Pipeline)
**Plan:** 1 of 2 complete
**Status:** In progress
**Progress:** [=_________] 8%
**Last activity:** 2026-02-08 - Completed 14-01-PLAN.md

## Milestone Progress

| Phase | Name | Status |
|-------|------|--------|
| 14 | SVG-to-Texture Pipeline | In progress (1/2 plans) |
| 15 | Basic PixiJS Renderer | Planned |
| 16 | Camera System | Planned |
| 17 | Note Highlighting | Planned |
| 18 | Section Virtualization | Planned |
| 19 | Integration and Polish | Planned |

## Performance Metrics

**Historical (v1.0-v1.2):**
- Total plans completed: 17
- Average duration: 2.4 min
- Total execution time: 41 min

**v1.3 Progress:**
| Metric | Value |
|--------|-------|
| Milestone Start | 2026-02-08 |
| Phases Completed | 0/6 |
| Plans Completed | 1 |
| Blockers Encountered | 0 |

## Accumulated Context

### Key Decisions

| Decision | Rationale | Phase |
|----------|-----------|-------|
| PixiJS over Konva | Canvas 2D is CPU-bound; PixiJS WebGL provides true GPU rendering | Research |
| SVG-to-texture approach | Avoids path parsing, handles fonts/coords automatically | Research |
| Tint for highlighting | GPU shader operation, no redraw required | Research |
| Render groups for camera | v8 feature enables GPU-accelerated container transforms | Research |
| Section-level tinting | Simpler than per-note; entire section tints when active | Research |
| Data URI + image.decode() pipeline | PixiJS v8 pattern for SVG-to-texture conversion | 14-01 |
| Pre-compiled regex for color preprocessing | Module-scope regex avoids repeated compilation | 14-01 |
| Composite cache key | Content fingerprint + scale + font for efficient caching | 14-01 |

### Lessons from Konva Attempt

| Issue | Root Cause | PixiJS Solution |
|-------|------------|-----------------|
| Glitchy scrolling | Canvas 2D redraws on every position change | WebGL transforms are GPU-accelerated |
| Slow highlighting | Layer cache doesn't prevent stage redraws | Tint is a shader uniform |
| 23fps effective | CPU-bound rendering | WebGL benchmarks at 60fps |

### Outstanding TODOs

- [x] Install PixiJS packages (done in 14-01)
- [x] Create svgToTexture.ts conversion module (done in 14-01)
- [ ] Add texture size limits and tests (14-02)
- [ ] Install @pixi/react package (Phase 15)
- [ ] Create PixiSingleLineRenderer component (Phase 15)

### Blockers

None.

## Session Continuity

### Last Session

**Date:** 2026-02-08
**Completed:** Plan 14-01 (SVG-to-Texture Pipeline foundation)
**Context:** Created svgToTexture.ts module with PixiJS v8.16.0. Module provides color preprocessing, caching, and batch conversion functions.

### Next Session

**Start with:** Execute 14-02-PLAN.md to add texture size limits and tests
**Key files:**
- `.planning/phases/14-svg-to-texture-pipeline/14-01-SUMMARY.md` (what was built)
- `src/lib/svgToTexture.ts` (module to enhance)

### Recovery Commands

```bash
# Check current branch
git branch --show-current

# Check what was built
cat src/lib/svgToTexture.ts | head -50

# Verify PixiJS installed
npm ls pixi.js
```

---
*Last updated: 2026-02-08*
*Milestone: v1.3 PixiJS SingleLineRenderer*
*Status: Phase 14 plan 1/2 complete*
