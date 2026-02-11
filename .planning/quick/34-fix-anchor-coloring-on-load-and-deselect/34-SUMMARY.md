---
phase: quick-34
plan: 1
subsystem: ui
tags: [sync-editor, anchors, verovio, performance]
key-files:
  modified:
    - src/components/SyncEditor.tsx
key-decisions:
  - "Measure container width once via ResizeObserver then disconnect (no Verovio re-renders on resize)"
  - "Add svgPages to anchor effect deps so greens are applied after each SVG DOM creation"
duration: 1min
completed: 2026-02-11
---

# Quick Task 34: Fix Anchor Coloring and Constant Container Width

## Accomplishments
- ResizeObserver now disconnects after first measurement — window resizing never causes Verovio to re-render
- Anchor coloring effect now depends on svgPages — greens are applied after every SVG DOM creation
- Combined fix eliminates the root cause (SVG DOM replacement wiping styles) and the symptom (effect not re-firing)
