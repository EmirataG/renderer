---
phase: quick-58
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/ScoreRegionEditor.tsx
autonomous: true
requirements: [QUICK-58]

must_haves:
  truths:
    - "By default (perspectiveMode off), white resize corner handles are visible and diamond handles are hidden"
    - "Clicking the perspective toggle button activates perspectiveMode, hiding resize handles and showing diamond handles"
    - "Clicking the toggle again deactivates perspectiveMode, restoring resize handles and hiding diamonds"
    - "Help text updates to reflect the current mode"
  artifacts:
    - path: "src/components/ScoreRegionEditor.tsx"
      provides: "Perspective mode toggle with conditional handle visibility"
      contains: "perspectiveMode"
  key_links:
    - from: "perspectiveMode state"
      to: "Rnd resizeHandleComponent prop"
      via: "conditional empty object vs ResizeHandle components"
      pattern: "perspectiveMode.*resizeHandleComponent"
    - from: "perspectiveMode state"
      to: "corner diamond handles"
      via: "conditional rendering of cornerPositions.map block"
      pattern: "perspectiveMode.*cornerPositions"
---

<objective>
Add a perspective mode toggle button to ScoreRegionEditor so that diamond perspective handles and white resize handles are never shown simultaneously, fixing the overlap/inaccessibility issue.

Purpose: Diamond perspective corner handles are currently hidden behind the Rnd white square resize handles because they live in separate stacking contexts. A toggle lets the user switch between resize mode (default) and perspective mode.
Output: Updated ScoreRegionEditor.tsx with toggle button and conditional handle visibility.
</objective>

<execution_context>
@/Users/emirahmed/.claude/get-shit-done/workflows/execute-plan.md
@/Users/emirahmed/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/components/ScoreRegionEditor.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add perspectiveMode toggle with conditional handle visibility</name>
  <files>src/components/ScoreRegionEditor.tsx</files>
  <action>
  In ScoreRegionEditor.tsx, make the following changes:

  1. Add state: `const [perspectiveMode, setPerspectiveMode] = useState(false);`

  2. Add a toggle button next to the rotation handle circle (inside the rotation handle container div, positioned to the right of the circle). Place it as a sibling of the handle circle div, inside the same parent flex container. Adjust the parent container:
     - Change flexDirection to 'row' with alignItems 'flex-start' and a small gap (6px)
     - The rotation circle stays as-is
     - Add a new button element for perspective toggle:
       - Same size as rotation handle (22x22)
       - Round (borderRadius 50%)
       - White background with #525252 border (matching rotation handle style)
       - When perspectiveMode is active: use cyan (#06b6d4) background with white border to indicate active state
       - Contains a diamond/perspective SVG icon (a simple diamond shape: rotated square)
       - onClick: toggle perspectiveMode
       - cursor: pointer
       - Title attribute: "Toggle perspective mode"
     - Move the connecting line below the row (it should still connect from the center down to the region)

  3. Conditionally render perspective corner handles:
     - Only render the `cornerPositions.map(...)` block when `perspectiveMode` is true

  4. Conditionally pass resize handle components to Rnd:
     - When `perspectiveMode` is true: pass `resizeHandleComponent={{}}` (empty object, hides corner handles)
     - When `perspectiveMode` is false: pass the current `resizeHandleComponent` with ResizeHandle components

  5. Update the help text inside the Rnd child div:
     - When perspectiveMode is false: "Drag to move . Corners to resize . Top handle to rotate"
     - When perspectiveMode is true: "Drag to move . Diamond handles for perspective . Click button to exit"

  Do NOT change any perspective transform logic, rotation logic, or region drag/resize behavior.
  </action>
  <verify>
  Run `npx tsc --noEmit` to confirm no type errors. Visually verify in browser: default mode shows white resize handles and no diamonds; clicking toggle shows diamonds and hides resize handles; clicking again restores original state.
  </verify>
  <done>
  perspectiveMode toggle button appears next to rotation handle. Default state shows resize handles only. Active state shows diamond handles only. Help text reflects current mode. No regressions in drag, resize, rotate, or perspective functionality.
  </done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` passes with no errors
- Default view: white square resize handles visible at corners, no cyan diamond handles
- After clicking toggle: cyan diamond handles visible, white resize handles gone, toggle button highlighted
- After clicking toggle again: back to default state
- Rotation handle still works in both modes
- Drag and resize still work in resize mode
- Perspective drag still works in perspective mode
- Help text changes based on mode
</verification>

<success_criteria>
- Toggle button visually matches rotation handle styling (same size, circular, consistent with editor UI)
- Default mode = resize handles visible, diamonds hidden
- Perspective mode = diamonds visible, resize handles hidden
- Mode switch is instant with no layout jank
- All existing functionality (drag, resize, rotate, perspective) unaffected
</success_criteria>

<output>
After completion, create `.planning/quick/58-add-perspective-toggle-button-so-diamond/58-SUMMARY.md`
</output>
