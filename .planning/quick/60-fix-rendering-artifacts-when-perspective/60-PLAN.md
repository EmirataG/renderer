---
phase: quick-60
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/renderers/RegularRenderer.tsx
  - src/renderers/SingleLineRenderer.tsx
autonomous: true
requirements: [FIX-PERSPECTIVE-RENDERING]
---

<objective>
Fix rendering artifacts (blinking, disappearing SVG elements, thick strokes) when perspective transform is applied.

Root causes:
1. Conditional rendering `{hasPerspectiveTransform ? <wrapper>{content}</wrapper> : content}` causes React to unmount/remount all SVG children when perspective toggles, triggering DOM removal/reinsertion, re-extraction, and visible blinking.
2. `will-change: transform` on every `.preview-score g.notehead` creates hundreds of individual GPU compositing layers. Combined with `matrix3d()` on a parent, the browser can't handle the compositing load, causing SVG elements to disappear or render with wrong stroke thickness.
</objective>

<tasks>
<task type="auto">
  <name>Task 1: Fix perspective wrapper and notehead GPU layers in both renderers</name>
  <files>src/renderers/RegularRenderer.tsx, src/renderers/SingleLineRenderer.tsx</files>
  <action>
1. Always mount the perspective wrapper div (don't conditionally render). Apply transform/transformOrigin only when hasPerspectiveTransform is true.
2. Replace `will-change: transform` on `.preview-score g.notehead` with `transform-box: fill-box; transform-origin: center;` (these are needed for animations but don't create GPU layers).
  </action>
  <done>No more blinking, SVG rendering quality preserved under matrix3d.</done>
</task>
</tasks>
