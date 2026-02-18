---
phase: quick-59
status: complete
duration: 1 min
commits: ["67917a0"]
---

## Summary

Fixed perspective diamond handles being intercepted by Rnd resize handlers in ScoreRegionEditor.

## Root Cause

The diamond handles (in the rotation wrapper div) and the Rnd component are sibling divs. Even when `resizeHandleComponent` was set to empty `{}`, the Rnd library still creates invisible resize grab areas on edges/corners. The Rnd wrapper appeared AFTER the rotation wrapper in the DOM, so it sat on top and intercepted mousedown events.

## Changes

**src/components/ScoreRegionEditor.tsx:**
- Added `enableResizing={!perspectiveMode}` to Rnd — fully disables all resize hit areas in perspective mode
- Changed rotation wrapper z-index from static `10` to `perspectiveMode ? 20 : 10` — ensures diamond handles sit above Rnd in z-order

## Result

Diamond handles are now accessible and functional in perspective mode. Dragging them adjusts perspective corner offsets independently as intended.
