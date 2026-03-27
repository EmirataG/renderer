# Quick Task 260327-dab: Fix client-side export to match preview dimensions and animations

**Completed:** 2026-03-27
**Commit:** fa734a9

## Changes

### `src/lib/clientExport/index.ts`

**Bug 1: Dynamic viewport dimensions**
- Previously hardcoded `1920x1080` viewport
- Now loads background image to read `naturalWidth`/`naturalHeight` and uses those as viewport dimensions
- Falls back to `1920x1080` when no background image (matching preview behavior)
- This fixes cascading issues: `containerHeight`, camera scrolling, and score positioning all derive from viewport dimensions

**Bug 2: fill="none" CSS preservation**
- Added `[fill="none"] { fill: none !important; }` to both:
  - `buildScoreColorCss()` (DOM-based rendering during animation)
  - `inlineScoreColorInSvg()` (SVG rasterization for canvas)
- Prevents scoreColor from overriding SVG elements that should have no fill (e.g., staff line backgrounds)
- Matches the preview's `.preview-score svg [fill="none"]` CSS rule

## Impact

Client-side exported videos now match the preview's:
- Aspect ratio and dimensions (derived from background image)
- Camera scrolling behavior (correct containerHeight)
- Visual rendering (correct fill="none" preservation)
