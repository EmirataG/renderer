---
phase: quick-61
status: complete
duration: 1 min
commits: ["4c5aeee"]
---

## Summary

Fixed two issues: background dragging during region editing, and unusually thick SVG elements.

## Changes

**src/App.tsx:**
- Added `disabled: isEditingRegion` to TransformWrapper's panning config — prevents background from panning when dragging the score region in edit mode

**src/renderers/RegularRenderer.tsx + SingleLineRenderer.tsx:**
- Added CSS rule `.preview-score svg [fill="none"] { fill: none !important; }` — preserves Verovio's `fill="none"` on stroke-only SVG elements (hairpins, slurs, ties, etc.) that was being overridden by the blanket `svg path { fill: scoreColor }` rule

## Root Cause

1. **Drag issue**: `TransformWrapper` from react-zoom-pan-pinch wraps both the renderer and ScoreRegionEditor overlay. Panning was always active (`activationKeys: []`), so dragging the region also triggered panning.

2. **Thick strokes**: CSS author rules (`.preview-score svg path { fill: scoreColor }`) have higher specificity than SVG presentation attributes (`fill="none"` has specificity 0). This caused stroke-only elements to get filled, making them appear thick/solid.
