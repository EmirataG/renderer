---
phase: quick-33
plan: 1
subsystem: ui
tags: [sync-editor, anchors, bug-fix]
key-files:
  modified:
    - src/components/SyncEditor.tsx
duration: 1min
completed: 2026-02-11
---

# Quick Task 33: Fix Anchor Notes Not Staying Green

## Root Cause
The anchor coloring useEffect had deps `[events, anchors, anchorsKey]` but was missing `selectedEventId`.
When the user changed selection, the effect didn't re-run, so anchored notes weren't repainted green
after selection transitions.

## Fix
Added `selectedEventId` to the dependency array: `[events, anchors, anchorsKey, selectedEventId]`.
Now every selection change triggers a full anchor repaint, ensuring all anchored notes stay green.
