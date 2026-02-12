---
phase: quick-53
plan: 01
subsystem: ui
tags: [react, zustand, score-region, background-image]

# Dependency graph
requires:
  - phase: 25-firebase-storage
    provides: background image upload via UploadDropZone
  - phase: 26-auto-save
    provides: setSetting auto-persists scoreRegion to Firestore
provides:
  - Auto-reset of scoreRegion when background image changes
affects: [score-region, background-upload]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Reset dependent settings in upload handler (not useEffect) to avoid overwriting initial load"

key-files:
  created: []
  modified:
    - src/App.tsx

key-decisions:
  - "Reset scoreRegion in handleImageUpload (not useEffect on bgUrl) to avoid overwriting saved region on project load"

patterns-established:
  - "Upload handler reset: clear dependent settings directly in the handler, not via reactive effects, so initial load from Firestore is preserved"

# Metrics
duration: 1min
completed: 2026-02-12
---

# Quick Task 53: Auto-Reset Score Region on Background Change

**Reset scoreRegion to null in handleImageUpload so stale region dimensions from the previous image are cleared automatically**

## Performance

- **Duration:** 1 min
- **Started:** 2026-02-12T20:32:48Z
- **Completed:** 2026-02-12T20:33:28Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Score region auto-resets to null (full background) when user uploads a new background image
- Score region auto-resets to null (full default container) when user removes background image
- Score region editor closes automatically on background change
- Initial project load still preserves saved scoreRegion from Firestore (unchanged)

## Task Commits

Each task was committed atomically:

1. **Task 1: Reset scoreRegion to null in handleImageUpload** - `a28d31e` (fix)

## Files Created/Modified
- `src/App.tsx` - Added `setSetting("scoreRegion", null)` and `setIsEditingRegion(false)` in handleImageUpload

## Decisions Made
- Reset scoreRegion in the upload handler function rather than via a useEffect on bgUrl. This is critical because a useEffect would also fire on initial project load when bgUrl is set from Firestore, which would overwrite the saved scoreRegion. The handler approach only fires on user-initiated background changes.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Score region auto-reset complete, no follow-up needed

## Self-Check: PASSED

- [x] src/App.tsx - FOUND
- [x] Commit a28d31e - FOUND
- [x] 53-SUMMARY.md - FOUND

---
*Phase: quick-53*
*Completed: 2026-02-12*
