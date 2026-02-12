# Plan: Fix Event Extraction Race Condition

## Goal
Fix bug where play button stays grayed out (eventsLength: 0) because event extraction never happens after Verovio renders SVG pages.

## Root Cause
The SVG extraction effect in `RegularRenderer.tsx` depends on `[svgPages, svgPagesRef, toolkit, pageOffsets, setEventsInStore]` but NOT on `containerWidth`/`containerHeight`. The `scoreRef` div only mounts when `containerWidth > 0` (guard at ~line 875). When Verovio completes before the background image loads, the extraction effect fires with `scoreRef.current = null` and never re-fires because its deps don't change when `containerWidth` later becomes non-zero.

## Tasks

### Task 1: Add containerWidth to extraction effect deps
**File:** `src/renderers/RegularRenderer.tsx`

Add `containerWidth` to the SVG extraction effect's dependency array. This ensures the effect re-fires when the score div becomes available (containerWidth changes from 0 to non-zero).

Change the deps from:
```
[svgPages, svgPagesRef, toolkit, pageOffsets, setEventsInStore]
```
to:
```
[svgPages, svgPagesRef, toolkit, pageOffsets, setEventsInStore, containerWidth]
```

### Task 2: Remove diagnostic logs
**Files:** `src/renderers/RegularRenderer.tsx`, `src/renderers/SingleLineRenderer.tsx`, `src/App.tsx`, `src/stores/eventStore.ts`, `src/hooks/useVerovio.ts`

Remove all `console.log` / `console.warn` debug statements added during investigation (prefixed with `[RegularRenderer]`, `[SingleLineRenderer]`, `[App]`, `[eventStore]`, `[useVerovio]`).

### Task 3: Apply same fix to SingleLineRenderer
**File:** `src/renderers/SingleLineRenderer.tsx`

Check if SingleLineRenderer has the same extraction pattern and apply the equivalent fix if needed.
