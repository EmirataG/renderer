---
phase: quick-60
status: complete
duration: 1 min
commits: ["fabb98d"]
---

## Summary

Fixed rendering artifacts (blinking, disappearing SVG elements, thick strokes) when perspective transform is applied to score region.

## Root Causes

1. **Conditional perspective wrapper**: `{hasPerspectiveTransform ? <wrapper>{content}</wrapper> : content}` caused React to unmount/remount all SVG children when perspective toggled. This triggered DOM removal/reinsertion, event re-extraction, and visible blinking across the entire app.

2. **Excessive GPU compositing layers**: `will-change: transform` on every `.preview-score g.notehead` created hundreds of individual GPU layers. Combined with `matrix3d()` on a parent wrapper, the browser couldn't handle the compositing load, causing SVG elements to disappear or render with wrong stroke thickness.

## Changes

**src/renderers/RegularRenderer.tsx + src/renderers/SingleLineRenderer.tsx:**
- Always mount the perspective wrapper div — conditionally apply transform/transformOrigin only when perspective is active (prevents React unmount/remount cycle)
- Replaced `will-change: transform` on noteheads with `transform-box: fill-box; transform-origin: center;` (preserves animation requirements without creating GPU layers)
