---
phase: quick-36
plan: 1
subsystem: ui
tags: [sync-editor, anchors, css, scaling]
key-files:
  modified:
    - src/components/SyncEditor.tsx
key-decisions:
  - "CSS rules in style element for anchor (green) and selection (blue) coloring"
  - "Inline styles only for playback animation (orange) — overrides CSS, cleared to restore"
  - "colorRule() helper generates CSS selectors including g.chord:has() for shared stems"
  - "[&_svg]:max-w-none overrides Tailwind preflight svg max-width:100%"
  - "Removed getBaseColor/applyNoteColor/clearNoteColor — replaced with CSS approach"
duration: 1min
completed: 2026-02-11
---

# Quick Task 36: CSS-Based Coloring + Fixed Score Scaling

## Root Causes
1. **Coloring**: Inline DOM style manipulation was fragile — React re-renders could wipe styles.
   CSS rules in a style element cascade automatically regardless of DOM timing.
2. **Scaling**: Tailwind's `svg { max-width: 100% }` caused SVGs to scale with container.

## Fix
- Anchor/selection colors now generated as CSS rules in the style element
- Playback animation (orange) still uses inline styles (overrides CSS, cleared on stop)
- `[&_svg]:max-w-none` on scoreRef prevents responsive SVG scaling
- Removed getBaseColor callback (no longer needed)
