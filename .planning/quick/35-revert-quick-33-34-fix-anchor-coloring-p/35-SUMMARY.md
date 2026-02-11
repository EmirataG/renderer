---
phase: quick-35
plan: 1
subsystem: ui
tags: [sync-editor, anchors, coloring, performance]
key-files:
  modified:
    - src/components/SyncEditor.tsx
key-decisions:
  - "Single unified coloring effect replaces separate anchor/selection effects"
  - "Clear-all-then-repaint approach eliminates timing bugs between effects"
  - "Measure container width once via ResizeObserver.disconnect() -- no Verovio re-renders"
  - "Removed prevSelectedIdRef tracking (no longer needed with unified effect)"
duration: 1min
completed: 2026-02-11
---

# Quick Task 35: Revert quick-33/34, Fix Anchor Coloring Properly

## Root Cause
The anchor coloring used TWO separate useEffect hooks (one for anchors, one for selection)
that raced with each other and with async Verovio SVG DOM updates. Adding deps to individual
effects couldn't fix the fundamental timing problem.

## Fix
Replaced both effects with a SINGLE unified coloring effect that:
1. Clears ALL note colors
2. Paints anchored notes green
3. Paints selected note blue (overrides green)
4. Re-applies playing note orange (overrides everything)

Depends on [events, anchors, anchorsKey, selectedEventId, svgPages] — fires on ANY state change
that affects coloring. The clear-then-repaint approach is O(n) but eliminates all timing bugs.

Also: ResizeObserver disconnects after first measurement (Verovio never re-renders on resize).
