---
phase: quick-41
plan: 01
type: execute
wave: 1
depends_on: []
files_modified: [src/App.tsx]
autonomous: true

must_haves:
  truths:
    - "Score region editor shaded area precisely coincides with actual score content at any zoom level"
    - "Zoom and pan are disabled while region editing is active"
    - "Zoom resets to 1x when entering region edit mode"
    - "Zoom and pan resume normally after closing region editor"
  artifacts:
    - path: "src/App.tsx"
      provides: "TransformWrapper ref + disabled prop + resetTransform on edit entry"
      contains: "transformRef"
  key_links:
    - from: "isEditingRegion state"
      to: "TransformWrapper disabled prop"
      via: "disabled={isEditingRegion}"
      pattern: "disabled=\\{isEditingRegion\\}"
    - from: "setIsEditingRegion(true) button handler"
      to: "transformRef.current.resetTransform()"
      via: "reset zoom before entering edit mode"
      pattern: "resetTransform"
---

<objective>
Fix the score region glitch where the shaded region editor overlay does not coincide with actual score content when zoom/pan is active. The root cause is that react-rnd (drag/resize) operates in screen-space coordinates while react-zoom-pan-pinch applies CSS transforms, causing coordinate mismatch at non-1x zoom.

Purpose: Eliminate region placement inaccuracy by disabling zoom/pan during editing and resetting to 1x on edit entry.
Output: Modified App.tsx with TransformWrapper ref, disabled prop, and resetTransform call.
</objective>

<execution_context>
@/Users/emirahmed/.claude/get-shit-done/workflows/execute-plan.md
@/Users/emirahmed/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/App.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Disable zoom/pan during region editing and reset transform on entry</name>
  <files>src/App.tsx</files>
  <action>
In src/App.tsx, make three changes:

1. Add a ref for TransformWrapper. Import `ReactZoomPanPinchContentRef` from "react-zoom-pan-pinch" (line 14). Create a ref:
   ```
   const transformRef = useRef<ReactZoomPanPinchContentRef>(null);
   ```

2. Add `ref={transformRef}` and `disabled={isEditingRegion}` props to the TransformWrapper component (currently at line 693):
   ```tsx
   <TransformWrapper
     ref={transformRef}
     disabled={isEditingRegion}
     minScale={0.25}
     maxScale={5}
     panning={{ activationKeys: ["Alt"] }}
     doubleClick={{ mode: "reset" }}
   >
   ```

3. Modify the "Edit Region" button onClick handler (currently at line 419) to reset the transform before entering edit mode. Replace `onClick={() => setIsEditingRegion(true)}` with:
   ```tsx
   onClick={() => {
     transformRef.current?.resetTransform(0);
     setIsEditingRegion(true);
   }}
   ```
   The `0` argument means instant reset (no animation), so the region editor opens at 1x zoom immediately with no visual delay.

Note: The `disabled` prop on TransformWrapper prevents all zoom/pan/pinch interactions while true. When the user closes the region editor (setIsEditingRegion(false)), disabled becomes false and zoom/pan resumes automatically. No cleanup needed.
  </action>
  <verify>
    - TypeScript compiles: `cd /Users/emirahmed/Desktop/Manuscript/renderer && npx tsc --noEmit`
    - Grep confirms ref creation: grep "transformRef" src/App.tsx
    - Grep confirms disabled prop: grep "disabled={isEditingRegion}" src/App.tsx
    - Grep confirms resetTransform call: grep "resetTransform" src/App.tsx
  </verify>
  <done>
    - TransformWrapper has ref and disabled={isEditingRegion} prop
    - Edit Region button resets zoom to 1x (instant, no animation) before activating edit mode
    - Zoom/pan is locked while region editor is open
    - Zoom/pan resumes when region editor is closed
    - TypeScript compiles without errors
  </done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` passes (no type errors)
- Open app, zoom in on score preview, click Edit Region: zoom resets to 1x and region overlay aligns with score
- While editing region, scroll wheel / pinch / Alt+drag do NOT zoom or pan
- Close region editor, zoom/pan works normally again
</verification>

<success_criteria>
- Score region editor overlay precisely matches score content position regardless of prior zoom state
- Zero coordinate mismatch between shaded region and actual score
- Zoom/pan disabled during editing, re-enabled after
</success_criteria>

<output>
After completion, create `.planning/quick/41-investigate-score-region-glitch-shaded-r/41-SUMMARY.md`
</output>
