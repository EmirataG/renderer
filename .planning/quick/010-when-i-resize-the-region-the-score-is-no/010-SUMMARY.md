---
quick_task: 010
type: execute
completed: 2026-02-09
duration: 51s
files_modified: [src/renderers/PixiSingleLineRenderer.tsx]
---

# Quick Task 010: Fix Score Centering on Viewport Resize

**One-liner:** Add static camera positioning to center score horizontally when not playing, recalculating on viewport dimension changes.

## Problem

When the score region was resized, the camera position was not recalculated, leaving the score off-center. The camera started at x=0 and only updated during playback via CameraController.

## Solution

Added a `staticCameraXRef` to track the centered position when not playing:

1. **Calculate centered position** when viewport or score dimensions change:
   - If score is narrower than viewport: center it with `(viewportWidth - scaledTotalWidth) / 2`
   - If score is wider than viewport: start at left edge (x=0)

2. **Apply static position** via useEffect when:
   - `viewportWidth` changes
   - `scaledTotalWidth` changes
   - `isPlaying` becomes false

3. **Reset button** now explicitly resets camera to the centered position

## Changes Made

**src/renderers/PixiSingleLineRenderer.tsx:**
- Added `staticCameraXRef` ref to track centered camera position
- Added useEffect to calculate and apply centered position when dimensions change
- Added useEffect to reset camera position when playback stops
- Updated Reset button to reset camera to centered position
- Changed pixiContainer x prop to use `staticCameraXRef.current`

## Key Code

```typescript
// Calculate and apply static camera position when not playing
useEffect(() => {
  if (isPlaying) return;

  let newStaticX = 0;
  if (scaledTotalWidth < viewportWidth) {
    newStaticX = (viewportWidth - scaledTotalWidth) / 2;
  }

  staticCameraXRef.current = newStaticX;

  if (cameraContainerRef.current) {
    cameraContainerRef.current.position.x = newStaticX;
  }
}, [viewportWidth, scaledTotalWidth, isPlaying]);
```

## Commits

| Hash | Description |
|------|-------------|
| 4b31a37 | fix(010): center score when viewport resizes |

## Verification

- [x] TypeScript compiles without errors
- [x] Score is horizontally centered when initially loaded
- [x] Score stays centered when region is resized
- [x] Reset button re-centers the score

## Deviations from Plan

None - plan executed exactly as written.
