---
phase: quick-61
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/App.tsx
  - src/renderers/RegularRenderer.tsx
  - src/renderers/SingleLineRenderer.tsx
autonomous: true
requirements: [FIX-DRAG, FIX-THICK-SVG]
---

<objective>
Fix two issues: 1) Background moves when dragging score region in edit mode, 2) Some SVG elements (hairpins, slurs) appear unusually thick.
</objective>

<tasks>
<task type="auto">
  <name>Task 1: Disable panning during region editing and fix SVG fill override</name>
  <files>src/App.tsx, src/renderers/RegularRenderer.tsx, src/renderers/SingleLineRenderer.tsx</files>
  <action>
1. Add `disabled: isEditingRegion` to TransformWrapper's panning config
2. Add CSS rule `.preview-score svg [fill="none"] { fill: none !important; }` in both renderers to prevent the blanket `svg path { fill: scoreColor }` from overriding Verovio's fill="none" on stroke-only elements
  </action>
  <done>Region drag no longer pans background. Stroke-only SVG elements render correctly.</done>
</task>
</tasks>
