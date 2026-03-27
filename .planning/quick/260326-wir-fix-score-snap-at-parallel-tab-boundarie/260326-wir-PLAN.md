# Quick Task 260326-wir: Fix score snap at parallel tab boundaries

**Created:** 2026-03-27
**Status:** Complete

## Problem

When parallel capture tabs stitch together, the camera snaps to the next position instead of smoothly scrolling. This happens because each tab has independent animation state — if tab 1 ends mid-transition, tab 2 starts at the final target position, skipping the remaining ease-out frames.

## Task 1: Add warm-up frames before capture

**Files:** `export-service/src/browser/parallelCapture.ts`
**Action:** Before the capture loop, run `WARMUP_FRAMES` (10) preceding frames through `setFrame` without taking screenshots. This builds up correct animation state including mid-transition camera positions.
**Verify:** Type-check passes, warm-up only runs for non-first tabs (startFrame > 0).
**Done:** Camera transitions are seamlessly continued across tab boundaries.
