---
phase: "31"
plan: 1
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/SyncEditor.tsx
autonomous: true
---

<objective>
Fix sync editor header: remove redundant "Anchor" badge label, keep anchor/playhead buttons visible when anchored, set constant header height.
</objective>

<tasks>
1. Remove legacy "Anchor" badge span (lines 638-642) — redundant since "Remove Anchor" button already indicates anchor state
2. Keep "Anchor" and "Anchor to Playhead" buttons visible regardless of anchor state (they were already visible)
3. Add `h-14` to header div for constant height
</tasks>
