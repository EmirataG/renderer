# Quick Task 260327-dnh: Fix client export notehead animations

## Root Causes

1. **Duplicate SVG IDs** — Preview and export container both have Verovio SVGs with identical IDs. `scoreEl.querySelector('#note-id')` fails when duplicate IDs exist in the document.

2. **CSS specificity** — `inlineScoreColorInSvg` had `use { fill: scoreColor }` which overrides both SVG fill attributes and promoted fill from animation.

3. **Low bitrate** — 8 Mbps vs backend's CRF 23 (~20-30 Mbps equivalent).

## Tasks

1. Prefix export container SVG IDs with `_ce_` after position computation
2. Remove `use` from CSS selector; set fill on root svg for inheritance
3. Increase bitrate to 20 Mbps and max dimension to 1920
