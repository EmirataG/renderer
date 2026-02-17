---
phase: quick-56
plan: 01
subsystem: ui
tags: [react, blob-url, optimistic-update, background-image]

requires:
  - phase: 25-firebase-storage
    provides: Background image upload endpoint and proxy routes
provides:
  - Single-load background image upload with optimistic blob URL preview
affects: [background-image, export, upload]

tech-stack:
  added: []
  patterns: [optimistic-blob-url-kept-as-display-source]

key-files:
  created: []
  modified:
    - src/components/UploadDropZone.tsx

key-decisions:
  - "Blob URL kept as display source after upload succeeds (never revoked on success) to avoid double image load"
  - "File object passed in optimistic onImageUpload call so bgFile is set for export without needing second callback"

patterns-established:
  - "Optimistic blob URL pattern: create blob URL for immediate preview, upload in background, keep blob URL as display source on success"

requirements-completed: [FIX-BG-DOUBLE-LOAD]

duration: 1min
completed: 2026-02-17
---

# Quick Task 56: Fix Background Image Loading Twice Summary

**Eliminated double bgUrl state update by keeping optimistic blob URL as display source and passing File object for export**

## Performance

- **Duration:** 1 min
- **Started:** 2026-02-17T20:46:18Z
- **Completed:** 2026-02-17T20:47:02Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Background image now renders exactly once when user selects a new image (no flash/flicker when toast appears)
- File object passed in initial onImageUpload call ensures bgFile state is set for export
- Upload still persists to Firebase Storage; page reload loads from server proxy URL as before

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix processImage to avoid double bgUrl update** - `866b946` (fix)

## Files Created/Modified
- `src/components/UploadDropZone.tsx` - Removed second onImageUpload call after upload success; pass File object in optimistic call

## Decisions Made
- Blob URL is never revoked on successful upload -- it remains valid for the entire page session and serves as the display source. This avoids the second state update that caused the image to reload.
- File object is passed as third argument to onImageUpload in the optimistic call, so App.tsx sets bgFile immediately. This ensures export works without needing the server URL.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Background image upload flow is now clean with single-load behavior
- No blockers or concerns

## Self-Check: PASSED

- FOUND: src/components/UploadDropZone.tsx
- FOUND: commit 866b946
- FOUND: 56-SUMMARY.md

---
*Phase: quick-56*
*Completed: 2026-02-17*
