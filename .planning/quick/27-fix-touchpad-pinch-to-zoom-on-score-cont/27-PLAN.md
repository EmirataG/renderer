# Quick Task 27: Fix touchpad pinch-to-zoom on score container

## Goal
Prevent browser-level page zoom when pinch-to-zoom gesture occurs over the score container. Apply zoom only to the score.

## Tasks

### Task 1: Fix touchpad pinch-to-zoom interception
- **File:** `src/components/SyncEditor.tsx`
- **Changes:**
  1. Add `touch-action: none` CSS on the score container div — tells the browser to not handle touch/gesture events at the compositor level
  2. Add `gesturestart`/`gesturechange` event listeners (Safari uses non-standard gesture events instead of wheel+ctrlKey for trackpad pinch)
  3. Both listeners call `preventDefault()` and apply zoom to the score container
- **Rationale:** Chrome sends trackpad pinch as `wheel` with `ctrlKey: true` (already handled), but the browser's native zoom can intercept before JS. `touch-action: none` prevents this. Safari needs separate gesture event handling.
