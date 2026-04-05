# Quick Task 29: Fix preview zoom/pan

## Goal
Fix two bugs from quick-28: overflow-hidden broke scrolling, and all wheel events were intercepted (preventing normal scroll).

## Tasks

### Task 1: Restore overflow-auto and fix wheel handler
- **File:** `src/App.tsx`
- **Changes:**
  1. `overflow-hidden` → `overflow-auto` on preview container (line 816) — tall content must scroll
  2. Wheel handler: only intercept when `e.ctrlKey` is true (trackpad pinch-to-zoom). Regular scroll passes through for normal overflow-auto behavior.
  3. Gesture handlers moved from `document` to `container` level (simpler, matches working SyncEditor pattern)
