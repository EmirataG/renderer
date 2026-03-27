# Quick Task 260326-wyz: Smart chunk splitting at system boundaries — Summary

**Completed:** 2026-03-27

## What Changed

### `export-service/src/standalone/render.ts`

Added `getChunkBoundaries(numChunks)` to the animation controller. It:
1. Scans events to find frames where the camera target changes (system boundaries)
2. Builds "danger zones" around each transition (frame + 200ms transition duration)
3. Places chunk split points at the nearest safe frame outside any danger zone
4. Returns `[0, split1, split2, ..., totalFrames]`

### `export-service/src/browser/parallelCapture.ts`

- Calls `getChunkBoundaries(numTabs)` from the first tab to get smart split points
- Uses those boundaries instead of naive even division
- Removed warm-up frames (no longer needed — chunks never start mid-transition)
- Logs chunk boundaries for debugging

## Why This Is Robust

The previous approaches were band-aids:
- **260326-vur** (first-frame snap): prevented transition from Y=0 but caused instant jumps
- **260326-wir** (warm-up frames): replayed state but added overhead and complexity

This approach is correct by construction: chunks are guaranteed to start where the camera is stable, so there's nothing to fix at runtime. The only remaining safety net is the first-frame snap in animation.ts, kept as a defensive fallback.
