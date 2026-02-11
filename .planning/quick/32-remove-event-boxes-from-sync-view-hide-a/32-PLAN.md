---
phase: "32"
plan: 1
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/SyncEditor.tsx
autonomous: true
---

<objective>
Remove event boxes from bottom of sync view and show only "Remove Anchor" when note is already anchored.
</objective>

<tasks>
1. Remove event list panel (interpolatedEvents.map buttons) from bottom of sync view
2. Restructure anchor buttons: when anchored show only "Remove Anchor", otherwise show "Anchor" + "Anchor to Playhead"
</tasks>
