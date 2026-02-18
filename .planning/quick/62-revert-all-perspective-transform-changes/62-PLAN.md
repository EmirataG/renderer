---
phase: quick-62
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/types/score.ts
  - src/types/project.ts
  - src/types/global.d.ts
  - export-service/src/shared/exportSettings.ts
  - export-service/src/browser/pageSetup.ts
  - export-service/src/standalone/render.ts
  - src/lib/perspectiveTransform.ts (deleted)
  - src/components/ScoreRegionEditor.tsx
  - src/renderers/RegularRenderer.tsx
  - src/renderers/SingleLineRenderer.tsx
autonomous: true
requirements: [REVERT-PERSPECTIVE]
---

<objective>
Revert all perspective transform changes from quick tasks 57-60. The feature was too glitchy (SVG rendering artifacts, blinking, thick strokes). Retained non-perspective fixes from quick 61 (SVG fill rule, panning disable during editing).
</objective>

<tasks>
<task type="auto">
  <name>Task 1: Revert all perspective code to pre-quick-57 state</name>
  <files>All files listed above</files>
  <action>
Restored all files to their state at commit 8fd78b1 (pre-quick-57), then re-applied the non-perspective fixes from quick 61.
  </action>
  <done>All perspective code removed. App back to rotation-only score region editing.</done>
</task>
</tasks>
