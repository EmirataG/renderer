# Quick Task 260326-vur: Fix scrolling behaviour in exported video

**Created:** 2026-03-27
**Status:** Complete

## Problem

Exported videos occasionally show a brief "scroll up then back down" artifact. This occurs at frame boundaries where parallel capture tabs begin their chunk.

## Root Cause

Each parallel capture tab creates a fresh `AnimationState` with `cameraY = 0` and `transitionTarget = 0`. When a non-first tab (e.g. tab 2 starting at frame 401) calls `setTimestamp` for the first time, the camera target changes from 0 to the actual mid-score position. This triggers a 200ms ease-out transition **from Y=0**, causing ~6 frames of the camera animating from the top of the score back to the correct position.

## Task 1: Snap camera on first frame instead of transitioning

**Files:** `export-service/src/standalone/animation.ts`
**Action:** When `state.eventIndex === -1` (first frame), set `transitionFrom = newTargetCameraY` so the "transition" is a no-op snap to the correct position.
**Verify:** Type-check passes, no transition from Y=0 on first frame.
**Done:** Camera snaps to correct position on first frame of each parallel tab.
