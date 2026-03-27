# Quick Task 260327-dnh: Fix client export animations and quality

**Completed:** 2026-03-27

## Changes

### Animation visibility (`src/lib/clientExport/index.ts`)

Added `promoteCssToSvgAttributes()` — called before SVG serialization on each frame. Converts:
- Inline CSS `fill`/`stroke` on `use` elements → SVG `fill`/`stroke` attributes
- CSS `transform: scale(X)` on `g.notehead` → SVG `transform` attribute with translate-scale-translate (preserving center origin via `getBBox()`)
- Inline CSS `fill`/`stroke` on stem/accidental/flag groups → SVG attributes (for `colorFullNote` mode)

**Root cause:** SVG-as-image rendering doesn't apply CSS `style.fill` on `use` elements to their referenced shadow content. SVG attributes work reliably.

### Video quality

- **Bitrate:** 8 Mbps → 20 Mbps (matches backend CRF 23 equivalent)
- **Max dimension:** 1080 → 1920 (H.264 Level 5.1 supports up to 4096x2304)

## Files changed

- `src/lib/clientExport/index.ts` — promoteCssToSvgAttributes + max dim
- `src/lib/clientExport/encode.ts` — bitrate increase
