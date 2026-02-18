---
phase: quick-62
status: complete
duration: 1 min
commits: ["1cd705b"]
---

## Summary

Reverted all perspective transform changes from quick tasks 57-60. The CSS matrix3d-based perspective feature caused rendering artifacts (blinking, disappearing SVG elements, thick strokes) due to fundamental incompatibilities between CSS 3D transforms and SVG rendering in browsers.

## What was removed

- `src/lib/perspectiveTransform.ts` — deleted (matrix3d homography utility)
- `PerspectiveCorners` interface and `perspective` field from `ScoreRegion` in all 6 type locations
- Perspective corner handles (cyan diamonds) and toggle button from `ScoreRegionEditor`
- Perspective wrapper div from `RegularRenderer` and `SingleLineRenderer`
- Perspective functions and wrapper from export service `render.ts`

## What was retained

- SVG `fill="none"` preservation CSS rule from quick-61 (fixes thick hairpins/slurs)
- TransformWrapper panning disabled during region editing from quick-61
- `will-change: transform` on noteheads (restored to original)

## Reverted quick tasks

| # | Description | Status |
|---|-------------|--------|
| 57 | add perspective transform to score region | REVERTED |
| 58 | add perspective toggle button | REVERTED |
| 59 | fix perspective diamond handles | REVERTED |
| 60 | fix perspective rendering artifacts | REVERTED |
