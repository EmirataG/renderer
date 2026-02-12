---
phase: quick
plan: 51
subsystem: renderers
tags: [bugfix, race-condition, event-extraction, cleanup]
dependency-graph:
  requires: []
  provides: [reliable-event-extraction]
  affects: [RegularRenderer, SingleLineRenderer, App, eventStore, useVerovio]
key-files:
  modified:
    - src/renderers/RegularRenderer.tsx
    - src/renderers/SingleLineRenderer.tsx
    - src/App.tsx
    - src/stores/eventStore.ts
    - src/hooks/useVerovio.ts
decisions:
  - "51-01: Added containerWidth to both RegularRenderer and SingleLineRenderer extraction effect deps"
metrics:
  duration: 3 min
  completed: 2026-02-12
---

# Quick Task 51: Fix Event Extraction Race Condition Summary

**One-liner:** Fixed race where SVG extraction effect never re-fires when scoreRef mounts after Verovio renders, plus removed all diagnostic logs from investigation.

## What Was Done

### Task 1: Fix extraction effect deps in RegularRenderer
Added `containerWidth` to the SVG extraction useEffect dependency array in `RegularRenderer.tsx`. The root cause was that `containerWidth` starts at 0 (before the background image loads), which prevents `scoreRef` from mounting (guard at line 875 returns early). When Verovio completes rendering before the image loads, the extraction effect fires with `scoreRef.current = null` and early-returns. Since `containerWidth` was not in the dep array, the effect never re-fires when the score div finally mounts, leaving `events` empty and the play button grayed out.

### Task 2: Remove all diagnostic console.log statements
Removed all debug logging added during quick tasks 48-50 investigation from five files:
- **RegularRenderer.tsx**: 15 console.log statements (audio effect, SVG extraction, transport gating, animation controller)
- **SingleLineRenderer.tsx**: 6 console.log/warn statements (transport gating, event extraction, element lookup, controller)
- **App.tsx**: 6 console.log statements (project load/cleanup lifecycle)
- **eventStore.ts**: 2 console.log statements (setEvents, invalidate)
- **useVerovio.ts**: 5 console.log statements (render lifecycle, cleanup)

Kept the two original `console.warn` statements for "Verovio SVG not found in DOM after rAF" in both renderers.

### Task 3: Apply same fix to SingleLineRenderer
SingleLineRenderer had the identical race condition: extraction deps were `[sections, svgPagesRef, toolkit, sectionOffsets, setEventsInStore]` without `containerWidth`. Applied the same fix.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] SingleLineRenderer had additional diagnostic logs not listed in plan**
- **Found during:** Task 2
- **Issue:** SingleLineRenderer had extraction logs, element-not-found debug warnings, and controller logs beyond just the transport gating log mentioned in the plan
- **Fix:** Removed all diagnostic logs, keeping only the original pre-existing Verovio SVG warning
- **Files modified:** src/renderers/SingleLineRenderer.tsx
- **Commit:** be61e7b

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 1a83e90 | fix(quick-51): add containerWidth to SVG extraction effect deps |
| 2 | be61e7b | chore(quick-51): remove all diagnostic console.log statements |
| 3 | 754bf65 | fix(quick-51): apply same containerWidth fix to SingleLineRenderer |

## Verification

- TypeScript compilation: PASSED (no errors)
- Diagnostic log audit: PASSED (only 2 original console.warn remain)

## Self-Check: PASSED
