---
phase: quick
plan: 008
subsystem: ui
tags: [react, virtualization, animation, performance]

# Metrics
duration: 10min
completed: 2026-02-08
---

# Quick Task 008: Fix Section Virtualization Animation Issues

**Fixed camera jumping to beginning and animations stopping during section transitions**

## Problem

During playback with section virtualization:
1. Camera would snap back to the beginning at random points
2. Highlight animations would stop being applied when crossing section boundaries

## Root Causes

1. **Camera reset in effect**: The Verovio section rendering effect had lines that reset `currentXRef.current = 0` and called `applyCamera(0)`. This effect ran unexpectedly during section changes.

2. **Stale closure in animation loop**: `visibleSectionIndicesRef` was updated via React effects, which lag behind the actual camera position. When sections changed, animations were being skipped because the visibility check used stale data.

## Fixes Applied

### Fix 1: Remove camera reset from effect
```diff
-    // Camera starts at left
-    currentXRef.current = 0;
-    applyCamera(0);
+    // NOTE: Camera position is NOT reset here. Initial position is 0 from state.
+    // During playback, camera is controlled by animateSync.
```

### Fix 2: Compute visible sections from camera position
```typescript
// Added helper function
const computeVisibleSections = useCallback((camX: number): Set<number> => {
  // Compute directly from camera position, not from React state
});

// In animation loop:
const currentVisibleIndices = computeVisibleSections(currentXRef.current);
```

### Fix 3: Reset properly resets section state
```typescript
function reset() {
  // ...
  lastSectionRef.current = 0;
  setCurrentSectionIndex(0);
}
```

## Commits

- `307b65c`: fix(13): fix stale closures in animation loop
- `e3c5154`: fix(13): remove camera reset from section effect
- `40dc03c`: fix(13): compute visible sections from camera position in animation loop

## Files Modified

- `src/renderers/SingleLineRenderer.tsx`

## Testing

Refresh the app and verify:
1. Camera scrolls smoothly without jumping back
2. Notehead animations apply consistently during playback
3. Section transitions are seamless with no animation gaps

---
*Quick Task: 008*
*Completed: 2026-02-08*
