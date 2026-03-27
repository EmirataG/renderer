# Quick Task 260326-vur: Fix scrolling behaviour in exported video — Summary

**Completed:** 2026-03-27

## What Changed

**`export-service/src/standalone/animation.ts`** (lines 262-269)

Added a first-frame check in the camera transition logic. When `state.eventIndex === -1` (the very first `setTimestamp` call), the camera snaps directly to the target position instead of transitioning from Y=0. This prevents the "scroll up then back down" artifact that occurred at parallel capture tab boundaries.

## Root Cause Analysis

The parallel capture system splits frames across N browser tabs. Each tab initializes a fresh `AnimationState` with `cameraY = 0`. When tab 2 starts capturing at frame 401 (mid-score), the camera target changes from 0 to the actual position, triggering a 200ms ease-out transition from the top of the score. This produced ~6 frames of incorrect camera position at each tab boundary.

## Verification

- TypeScript compilation passes
- Fix is minimal (4 lines added) and only affects the first frame of each tab
- Normal transitions between systems are unaffected
