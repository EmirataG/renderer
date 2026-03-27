# Quick Task 260327-dnh: Fix client export animations and quality

## Task 1: Promote CSS to SVG attributes for animation visibility

SVG-as-image rendering (data URL → Image) doesn't reliably apply CSS `style.fill` on `use` elements to their shadow content. Fix by promoting inline CSS fill/stroke/transform to SVG attributes before serialization.

**Files:** `src/lib/clientExport/index.ts`

## Task 2: Increase video quality

Bitrate was 8 Mbps (backend uses CRF 23 ≈ 20-30 Mbps). Max dimension was capped to 1080. Fix both.

**Files:** `src/lib/clientExport/encode.ts`, `src/lib/clientExport/index.ts`
