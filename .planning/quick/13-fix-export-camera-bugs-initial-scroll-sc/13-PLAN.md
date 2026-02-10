---
phase: quick-13
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/lib/getEvents.ts
autonomous: true
---

# Fix export camera bugs: initial scroll + scroll-to-end

## Root Cause

`computeEventPositions()` uses `getBoundingClientRect()` which returns viewport coordinates
that include CSS transforms. In the export, RenderApp wraps RegularRenderer in
`scale(viewportWidth/980)`. This inflates all `localY` measurements by the scaleFactor,
while `pageOffsets` remain in pre-scale CSS pixels — creating a coordinate space mismatch.

## Fix

Detect DOM scale factor: `container.getBoundingClientRect().width / container.clientWidth`
Divide all `localY` measurements by the scale factor to normalize to pre-transform space.
