---
phase: quick-007
plan: 01
subsystem: rendering
tags: [performance, optimization, react, zustand, binary-search]

dependency-graph:
  requires: [phase-12]
  provides:
    - Memoized CSS in both renderers
    - O(log n) timeline lookup via binary search
    - Batched Zustand state reads via useShallow
    - Pre-compiled regex patterns in Verovio hooks
  affects: []

tech-stack:
  added: []
  patterns:
    - "useMemo for derived CSS strings"
    - "Binary search for sorted event lookup"
    - "useShallow for batched Zustand selectors"
    - "Module-scoped regex for compile-once patterns"

file-tracking:
  key-files:
    created: []
    modified:
      - src/renderers/SingleLineRenderer.tsx
      - src/renderers/RegularRenderer.tsx
      - src/hooks/useSingleLineVerovio.ts
      - src/hooks/useVerovio.ts

decisions: []

metrics:
  duration: "2 min"
  completed: "2026-02-07"
---

# Quick Task 007: Performance Optimizations Summary

Memoized CSS, binary search for timeline lookup, useShallow for Zustand, pre-compiled regex patterns.

## What Was Done

### Task 1: Memoize CSS and Binary Search in Renderers (3e9166a)

**SingleLineRenderer.tsx and RegularRenderer.tsx:**

1. **useMemo for scoreColorCss** - Wrapped template literal CSS in `useMemo(() => ..., [scoreColor])` to prevent CSS string recreation on every render

2. **Binary search for getEventAtTimestamp** - Replaced O(n) reverse loop with O(log n) binary search:
   ```typescript
   let low = 0;
   let high = interpolatedEvents.length - 1;
   let result = -1;
   while (low <= high) {
     const mid = Math.floor((low + high) / 2);
     if (interpolatedEvents[mid].computedTimestamp <= timestampSec) {
       result = mid;
       low = mid + 1;
     } else {
       high = mid - 1;
     }
   }
   ```

3. **Binary search in setTimestamp** - Same optimization for the Puppeteer frame capture callback

4. **useShallow for Zustand** - Combined three separate selectors into one batched selector:
   ```typescript
   const { events, svgPagesRef, setEvents: setEventsInStore } = useEventStore(
     useShallow((state) => ({
       events: state.events,
       svgPagesRef: state.svgPagesRef,
       setEvents: state.setEvents,
     }))
   );
   ```

### Task 2: Pre-compile Regex Patterns (697e647)

**useSingleLineVerovio.ts:**
- Moved `WIDTH_REGEX`, `HEIGHT_REGEX`, `VIEWBOX_REGEX`, `MEASURE_REGEX` to module scope
- Added `lastIndex` reset for global regex safe reuse

**useVerovio.ts:**
- Moved `HEIGHT_REGEX`, `VIEWBOX_HEIGHT_REGEX` to module scope

## Performance Impact

| Optimization | Impact | Benefit |
|-------------|--------|---------|
| useMemo CSS | HIGH | Prevents ~35-line CSS string recreation on every frame |
| Binary search | MEDIUM | O(log n) vs O(n) for 1000+ event scores during 60fps playback |
| useShallow | HIGH | Prevents re-renders when unrelated store fields change |
| Pre-compiled regex | MEDIUM | Eliminates regex compilation overhead per SVG parse |

## Deviations from Plan

None - plan executed exactly as written.

## Verification

- Build passes with no TypeScript errors
- No behavior changes - purely performance improvements
- All optimizations are low-risk and well-understood React patterns

## Files Modified

| File | Changes |
|------|---------|
| `src/renderers/SingleLineRenderer.tsx` | useMemo, binary search, useShallow |
| `src/renderers/RegularRenderer.tsx` | useMemo, binary search, useShallow |
| `src/hooks/useSingleLineVerovio.ts` | Pre-compiled regex patterns |
| `src/hooks/useVerovio.ts` | Pre-compiled regex patterns |

## Commits

1. `3e9166a` - perf(quick-007): memoize CSS and use binary search in renderers
2. `697e647` - perf(quick-007): pre-compile regex patterns in Verovio hooks
