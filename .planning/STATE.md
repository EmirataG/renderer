# Project State: Manuscript Renderer

## Project Reference

**Core Value:** Scores render correctly and efficiently -- high-quality engraving with smooth playback, even on long scores.

**Current Milestone:** v1.3 PixiJS SingleLineRenderer

**Current Focus:** Migrate SingleLineRenderer from SVG to PixiJS WebGL rendering for smooth 60fps scrolling and GPU-accelerated highlighting.

## Current Position

**Phase:** Not started (researching domain)
**Plan:** —
**Status:** Researching
**Progress:** [__________] 0%
**Last activity:** 2026-02-08 - Milestone v1.3 started, Konva reverted

## Milestone Progress

| Phase | Name | Status |
|-------|------|--------|
| 14 | SVG-to-Texture Pipeline | Planned |
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
| Plans Completed | 0 |
| Blockers Encountered | 0 |

## Accumulated Context

### Key Decisions

| Decision | Rationale | Phase |
|----------|-----------|-------|
| PixiJS over Konva | Canvas 2D is CPU-bound; PixiJS WebGL provides true GPU rendering | Research |
| SVG-to-texture approach | Avoids path parsing, handles fonts/coords automatically | Research |
| Tint for highlighting | GPU shader operation, no redraw required | Research |
| Render groups for camera | v8 feature enables GPU-accelerated container transforms | Research |

### Lessons from Konva Attempt

| Issue | Root Cause | PixiJS Solution |
|-------|------------|-----------------|
| Glitchy scrolling | Canvas 2D redraws on every position change | WebGL transforms are GPU-accelerated |
| Slow highlighting | Layer cache doesn't prevent stage redraws | Tint is a shader uniform |
| 23fps effective | CPU-bound rendering | WebGL benchmarks at 60fps |

### v1.2 Decisions (carried forward)

- Verovio `breaks: 'none'` forces single horizontal system
- Section isolation via `toolkit.select({ measureRange })`
- CachedEvent has sectionIndex, localX, globalX for horizontal positioning
- Camera centers active note at 50% viewport (horizontal mode)
- 1-measure overlap for seamless section boundaries

### Technical Debt

None yet — fresh start on new branch.

### Outstanding TODOs

- [ ] Research PixiJS ecosystem (stack, features, architecture, pitfalls)
- [ ] Define requirements for v1.3
- [ ] Create roadmap with phases
- [ ] Install PixiJS and React bindings
- [ ] Create SVG-to-texture conversion module
- [ ] Create PixiSingleLineRenderer component

### Blockers

None.

## Session Continuity

### Last Session

**Date:** 2026-02-08
**Completed:** Reverted Konva work, created feature/pixi-migration branch
**Context:** Starting fresh with PixiJS after discovering Konva's Canvas 2D limitations. Full research phase next.

### Next Session

**Start with:** Review research outputs, define requirements
**Key files:**
- `.planning/research/SUMMARY.md` (after research)
- `.planning/REQUIREMENTS.md` (after definition)

### Recovery Commands

```bash
# Check current branch
git branch --show-current

# Check milestone status
cat .planning/PROJECT.md | grep -A 20 "Current Milestone"

# Check research outputs
ls -la .planning/research/
```

### Quick Tasks Completed (Historical)

- quick-002: Smooth camera interpolation using lerp() - removes CSS transition stuttering
- quick-003: Staff line vertical alignment across sections using Y offset extraction (REVERTED in quick-004)
- quick-004: Revert quick-003 staff alignment + add music font selector to inspector
- quick-005: Fix music font selector - add fontLoadAll: true to Verovio hooks
- quick-006: Revert Phase 13.1 (Unplayed Score Styling) - feature didn't work correctly
- quick-007: Performance optimizations - useMemo CSS, binary search timeline, useShallow Zustand, pre-compiled regex

---
*Last updated: 2026-02-08*
*Milestone: v1.3 PixiJS SingleLineRenderer*
*Status: Researching*
