---
phase: quick-46
plan: 01
subsystem: api
tags: [firebase-storage, performance, getDownloadURL, upload]

requires:
  - phase: 25-firebase-storage
    provides: "uploadFile utility with getDownloadURL, background route"
provides:
  - "uploadFile returns storage path instead of download URL (zero network overhead)"
  - "Background PUT returns proxy URL for immediate frontend display"
affects: [storage, project-creation, background-upload]

tech-stack:
  added: []
  patterns:
    - "Storage paths as boolean flags in Firestore (truthy = file exists)"
    - "Proxy URLs returned to frontend instead of Firebase download URLs"

key-files:
  created: []
  modified:
    - src/lib/storage.ts
    - src/app/api/projects/[id]/background/route.ts

key-decisions:
  - "Storage paths serve as boolean flags in Firestore (truthy = file exists, then proxy endpoint used)"
  - "Background PUT returns proxy URL to frontend, not storage path"

patterns-established:
  - "Never call getDownloadURL -- all files served through API proxy endpoints"

duration: 1min
completed: 2026-02-12
---

# Quick Task 46: Remove getDownloadURL Overhead from File Uploads

**Eliminated 2-10 second getDownloadURL delay from project creation by returning storage paths directly and proxy URLs for background images**

## Performance

- **Duration:** 1 min
- **Started:** 2026-02-12T16:00:14Z
- **Completed:** 2026-02-12T16:01:18Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Removed `getDownloadURL` entirely from codebase -- zero calls remain
- `uploadFile` now returns storage path directly (no network round-trip to Google Cloud Storage)
- Project creation is faster by 2-10 seconds (eliminated two `getDownloadURL` calls)
- Background PUT route returns proxy URL `/api/projects/{id}/background` for immediate frontend display

## Task Commits

Each task was committed atomically:

1. **Task 1: Remove getDownloadURL from uploadFile, return storage path** - `2e89958` (perf)
2. **Task 2: Fix background route to return proxy URL instead of Firebase URL** - `3b1f2d8` (perf)

## Files Created/Modified
- `src/lib/storage.ts` - Removed getDownloadURL import; uploadFile returns storagePath directly
- `src/app/api/projects/[id]/background/route.ts` - PUT response returns proxy URL instead of storage path

## Decisions Made
- Storage paths serve as boolean flags in Firestore (truthy = file exists). Score/audio URLs were already only used as boolean checks in App.tsx, so storage paths work identically.
- Background PUT returns proxy URL `/api/projects/{id}/background` to frontend since UploadDropZone uses the response value as an img src.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All file uploads are now faster (no getDownloadURL overhead)
- The pattern of using API proxy endpoints for all file serving is now consistent across the codebase

---
*Quick Task: 46*
*Completed: 2026-02-12*
