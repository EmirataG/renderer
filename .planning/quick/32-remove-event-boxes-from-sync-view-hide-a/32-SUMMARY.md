---
phase: quick-32
plan: 1
subsystem: ui
tags: [sync-editor, cleanup]
key-files:
  modified:
    - src/components/SyncEditor.tsx
duration: 1min
completed: 2026-02-11
---

# Quick Task 32: Remove Event Boxes, Fix Anchor Button Visibility

## Accomplishments
- Removed the event list panel (bottom bar with numbered event boxes) from sync view
- Restructured anchor buttons: anchored notes show only "Remove Anchor"; unanchored show "Anchor" + "Anchor to Playhead" (when paused)
