---
phase: quick-37
plan: 1
duration: 1min
completed: 2026-02-11
---
# Quick Task 37: Fix Score Container Overflow

Added `w-fit` (width: fit-content) to the inner scoreRef div. This lets the SVG keep its intrinsic
pixel width instead of being compressed by the flex layout. The parent `overflow-auto` container
now scrolls when the score is wider than the viewport.
