---
phase: quick-31
plan: 1
subsystem: ui
tags: [sync-editor, header, cleanup]
key-files:
  modified:
    - src/components/SyncEditor.tsx
duration: 1min
completed: 2026-02-11
---

# Quick Task 31: Fix Sync Header Cleanup

**Removed redundant anchor label, constant header height**

## Accomplishments
- Removed legacy "Anchor" badge span that duplicated the "Remove Anchor" button's indication
- Header now has constant `h-14` height regardless of content
- Anchor and Anchor to Playhead buttons remain visible when event is anchored (no change needed — they were already showing)
