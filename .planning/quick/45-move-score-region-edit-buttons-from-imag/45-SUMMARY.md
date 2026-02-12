---
phase: quick-45
plan: 01
subsystem: ui
tags: [react, inspector, score-region, ux]

# Dependency graph
requires: []
provides:
  - Inspector-inline score region editing controls (Use Full Background + Done)
  - Clean ScoreRegionEditor overlay without built-in buttons
affects: [ScoreRegionEditor, App inspector panel]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Conditional button rendering in inspector based on editing state

key-files:
  created: []
  modified:
    - src/components/ScoreRegionEditor.tsx
    - src/App.tsx

key-decisions:
  - "Confirmation dialog rendered from App.tsx as fixed overlay (same z-index pattern as before)"
  - "showResetConfirm state reset when Done is clicked to prevent stale dialog"

# Metrics
duration: 2min
completed: 2026-02-12
---

# Quick Task 45: Move Score Region Edit Buttons from Image Overlay to Inspector Panel

**Score region editing buttons (Use Full Background + Done) relocated from floating overlay bar to inspector panel with inline confirmation dialog**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-12T14:14:42Z
- **Completed:** 2026-02-12T14:17:02Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Removed all buttons, confirmation dialog, and onClose prop from ScoreRegionEditor (now renders only backdrop + draggable Rnd region)
- Added conditional rendering in App.tsx inspector: shows Edit Score Region when idle, shows Use Full Background + Done side-by-side when editing
- Moved reset confirmation dialog to App.tsx as a fixed overlay with same styling

## Task Commits

Each task was committed atomically:

1. **Task 1: Remove buttons and dialogs from ScoreRegionEditor** - `9ba8f84` (refactor)
2. **Task 2: Move buttons into inspector panel in App.tsx** - `c5d284f` (feat)

## Files Created/Modified
- `src/components/ScoreRegionEditor.tsx` - Stripped to only backdrop overlay and draggable Rnd region; removed onClose prop, showConfirm state, all button JSX and confirmation dialog
- `src/App.tsx` - Added showResetConfirm state; conditional inspector rendering (Edit button vs Use Full Background + Done); reset confirmation dialog; removed onClose prop from ScoreRegionEditor usage

## Decisions Made
- Confirmation dialog rendered from App.tsx as a fixed overlay (z-[70]) using the same styling pattern that was previously in ScoreRegionEditor
- showResetConfirm is explicitly reset to false when Done is clicked, preventing stale dialog state

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## Self-Check: PASSED
- All modified files exist on disk
- Both task commits verified: 9ba8f84, c5d284f
