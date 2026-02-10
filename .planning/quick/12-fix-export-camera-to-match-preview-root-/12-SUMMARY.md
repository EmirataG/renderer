# Quick Task 12: Fix Export Camera to Match Preview

## What Changed

**File:** `src/renderers/RegularRenderer.tsx`

### Root Cause
The export video camera used a fundamentally different motion model than the preview:
- **Preview:** Discrete camera jumps to event Y, smoothed by CSS `transition: transform 200ms ease-out` on the post-clamp `cameraY` (translateY value)
- **Export:** Continuous inter-event Y interpolation with cubic easing on raw `targetY` (before clamping), plus a special first-event hack

These produce visibly different results because:
1. CSS transitions interpolate the final transform value (after clamping), not the raw input
2. Discrete jumps + CSS smoothing ≠ continuous interpolation between events

### Fix
Replaced the entire camera section in `setTimestamp` with a CSS transition simulation:
- Added 3 refs (`cameraTransitionFrom`, `cameraTransitionTarget`, `cameraTransitionStart`) to track transition state
- Computes target cameraY with centering + clamping (same math as `applyCamera`)
- Detects target changes (>0.5px threshold) and starts new 200ms transition
- Interpolates visual cameraY with cubic ease-out, bypassing `applyCamera`

### Behavior Now
- **Frame 0:** Camera at top (cameraY=0), first line fully visible
- **Over 200ms:** Smooth ease-out to centered position on first event
- **Within a system:** Camera stays still (no interpolation)
- **System change:** Discrete transition triggered, 200ms cubic ease-out to new position
- **Matches preview exactly** in both initial position and ongoing scrolling

## Commit
`ef46d76`
