# Quick Task 10: Fix Export Video Squished Content, JPEG Screenshots, 30fps

## Performance
- **Duration:** 2 min
- **Tasks:** 1
- **Files modified:** 5

## Root Cause

The score was squished in the top-left because:
1. **scoreRegion coordinates were set at WIDTH=980 scale** in the interactive editor but used verbatim at 1920px viewport in render mode
2. **Background image rendered twice** -- once in RenderApp outer div (correct) and again inside RegularRenderer (duplicate), causing the "bigger duplicate" visual artifact

## Changes

1. **`src/RenderApp.tsx`** -- Scale scoreRegion by `viewportWidth / 980` before passing to RegularRenderer. Removed `bgUrl` prop to RegularRenderer (background already handled by outer div).

2. **`export-service/src/browser/captureFrames.ts`** -- Changed screenshot format from PNG to JPEG (quality 90) for ~2-3x faster per-frame capture.

3. **`export-service/src/encoding/encodeVideo.ts`** -- Changed FFmpeg input codec from `png` to `mjpeg` to match JPEG screenshots.

4. **`src/App.tsx`** -- Default FPS changed from 60 to 30.

## Commit
- `006b3f2`: feat(quick-10): fix export video sizing, JPEG screenshots, 30fps default

## Decisions
- Scale factor = `viewportWidth / 980` (980 is the interactive editor's WIDTH constant)
- JPEG quality 90 -- visually lossless for H.264 input, significant speed improvement
- 30fps default -- sufficient for score animation, halves capture time
