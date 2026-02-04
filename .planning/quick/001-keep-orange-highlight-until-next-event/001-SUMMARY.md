---
quick: 001
description: Keep active note orange highlight until next event
date: 2026-02-04
---

## Problem

In the SyncEditor, during audio playback the orange highlight on the currently-playing note would flash briefly and disappear. The selection/anchor styling effect (which clears all colors and reapplies anchor/selection colors) was overwriting the orange highlight applied by the animation loop.

## Fix

Added a re-application of the orange playing color at the end of the selection/anchor styling effect. After clearing and reapplying anchor (green) and selection (blue) colors, the effect now checks if a note is currently playing and re-applies orange to it.

## Files Modified

- `src/components/SyncEditor.tsx` — Added orange re-apply after selection/anchor styling (4 lines)

## Verification

- `npx tsc --noEmit` passes
