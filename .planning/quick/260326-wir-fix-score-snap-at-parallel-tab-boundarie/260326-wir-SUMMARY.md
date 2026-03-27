# Quick Task 260326-wir: Fix score snap at parallel tab boundaries — Summary

**Completed:** 2026-03-27

## What Changed

**`export-service/src/browser/parallelCapture.ts`**

Added a warm-up phase to `captureChunk`. Before capturing its assigned frame range, each non-first tab runs 10 preceding frames through `setFrame` without taking screenshots. This allows the animation state (camera position, transition progress) to be correctly reproduced, so mid-transition camera easing continues smoothly across tab boundaries.

## How It Works

With the previous fix (260326-vur), the first frame of each tab snapped to the correct target position. But this created a different artifact: if tab 1 ended mid-transition (camera easing from A to B), tab 2 would snap to B immediately, skipping the remaining ease-out frames.

The warm-up fixes this by replaying the animation state leading up to the boundary. 10 warm-up frames (333ms at 30fps) covers the full 200ms transition duration with margin.

## Verification

- TypeScript compilation passes
- Warm-up only runs for non-first tabs (startFrame > 0)
- No screenshots taken during warm-up (no wasted disk I/O)
