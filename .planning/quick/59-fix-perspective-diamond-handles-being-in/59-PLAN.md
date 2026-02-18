---
phase: quick-59
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/ScoreRegionEditor.tsx
autonomous: true
requirements: [FIX-PERSPECTIVE-HANDLES]
---

<objective>
Fix perspective diamond handles being intercepted by Rnd resize/drag handlers.

Root cause: The diamond handles (in the rotation wrapper div) and the Rnd component are sibling divs. Even when `resizeHandleComponent` is empty `{}`, the Rnd library still creates invisible resize grab areas on edges/corners. The Rnd wrapper appears AFTER the rotation wrapper in the DOM, so it sits on top and intercepts mousedown events before the diamonds can receive them.

Fix: Two changes when `perspectiveMode` is true:
1. Set `enableResizing={false}` on Rnd to fully disable all resize hit areas
2. Raise the rotation wrapper's z-index above the Rnd (z-index 20 vs 10) so diamonds are in front
</objective>

<tasks>

<task type="auto">
  <name>Task 1: Disable Rnd resizing and raise diamond z-index in perspective mode</name>
  <files>src/components/ScoreRegionEditor.tsx</files>
  <action>
Two changes in the JSX:

1. On the Rnd component (line ~398), add `enableResizing={!perspectiveMode}` prop
2. On the rotation wrapper div (line ~218), change zIndex from static `10` to `perspectiveMode ? 20 : 10`

This ensures that in perspective mode:
- Rnd's invisible resize hit areas are completely disabled (not just hidden)
- The rotation wrapper (with diamond handles) sits above the Rnd in z-order
  </action>
  <verify>
1. `npx tsc --noEmit` passes
2. Open app, enter edit region, toggle perspective mode, drag diamond handles — they should move independently without triggering Rnd resize
  </verify>
  <done>Diamond handles are accessible and functional in perspective mode. Rnd resize is disabled. Z-ordering is correct.</done>
</task>

</tasks>

<output>
After completion, create `.planning/quick/59-fix-perspective-diamond-handles-being-in/59-SUMMARY.md`
</output>
