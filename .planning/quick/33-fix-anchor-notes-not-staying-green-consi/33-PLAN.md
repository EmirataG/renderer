---
phase: "33"
plan: 1
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/SyncEditor.tsx
autonomous: true
---

<objective>
Fix anchored notes not staying green when selection changes.

Root cause: The anchor color useEffect depended on [events, anchors, anchorsKey] but NOT selectedEventId.
When selection changed, the anchor effect didn't re-run, so anchored notes that lost their green
(or were never repainted after selection transitions) stayed in default color.

Fix: Add selectedEventId to the anchor effect's dependency array so it re-paints all anchors green
on every selection change.
</objective>
