---
phase: "36"
plan: 1
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/SyncEditor.tsx
autonomous: true
---

<objective>
Actually fix anchor coloring and score scaling.

Root cause (coloring): Inline DOM style manipulation (applyNoteColor/clearNoteColor) was inherently
fragile — styles get wiped when React re-renders SVG content. Switching to CSS rules in a style
element makes coloring immune to DOM updates since CSS cascades automatically.

Root cause (scaling): Tailwind preflight adds `svg { max-width: 100% }` which makes Verovio SVGs
scale responsively. Override with max-w-none.

Approach:
1. Replace inline style coloring with CSS-rule-based coloring in the style element
2. Keep inline styles ONLY for playback animation (orange, which overrides CSS)
3. Add [&_svg]:max-w-none to prevent SVG responsive scaling
4. Measure container width once (already done)
</objective>
