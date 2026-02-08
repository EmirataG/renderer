---
status: testing
phase: 02-event-system-migration
source: [02-01-SUMMARY.md]
started: 2026-02-03T22:30:00Z
updated: 2026-02-03T22:30:00Z
---

## Current Test

number: 1
name: Event Extraction from Score
expected: |
  Load a MusicXML file via drag-drop. Open browser DevTools console.
  After the score renders, you should NOT see any errors about renderToTimemap.
  The score should render normally as before.
awaiting: user response

## Tests

### 1. Event Extraction from Score
expected: Load a MusicXML file via drag-drop. Open browser DevTools console. After the score renders, you should NOT see any errors about renderToTimemap. The score should render normally as before.
result: [pending]

### 2. BPM Playback Scrolling
expected: With a score loaded, click Play. The score should scroll vertically through the music at the configured BPM, with the camera moving smoothly downward through the systems (lines of music).
result: [pending]

### 3. Score Rendering Unchanged
expected: The score still renders with correct color styling and responds to scale/zoom changes. Changing the score color recolors all elements including noteheads. Changing the scale slider causes the score to re-render at the new size.
result: [pending]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0

## Gaps

[none yet]
