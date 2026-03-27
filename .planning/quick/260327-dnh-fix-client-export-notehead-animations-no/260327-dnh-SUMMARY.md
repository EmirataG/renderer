# Quick Task 260327-dnh Summary

**Completed:** 2026-03-27
**Commits:** 965a976, f547008

## Fixes

### 1. ID prefixing (f547008)
Prefix all SVG element IDs in the hidden export container with `_ce_` to prevent collision with the preview's identical Verovio IDs. Applied after `computeEventPositions` (needs original IDs for toolkit) but before the animation loop. Also updates internal `href`/`xlink:href` references.

### 2. CSS specificity fix (f547008)
Removed `use` from the explicit CSS element selector in `inlineScoreColorInSvg`. CSS rules override SVG presentation attributes, so `use { fill: scoreColor }` was preventing animated fill from showing. Now `use` elements inherit fill from the root `<svg fill="...">` attribute, which inline animation styles properly override.

### 3. Quality improvements (965a976)
- Bitrate: 8 Mbps → 20 Mbps
- Max dimension: 1080 → 1920
- SVG-to-attribute promotion for fill/stroke/transform
