---
phase: 25-firebase-storage-file-persistence
plan: 01
subsystem: storage
tags: [firebase-storage, file-upload, formdata, multipart, cascade-delete]

# Dependency graph
requires:
  - phase: 24-project-dashboard-crud
    provides: "Firestore project CRUD, CreateProjectModal, firebase-admin singleton"
provides:
  - "Storage singleton (uploadFile, deleteProjectFiles) in src/lib/storage.ts"
  - "FormData-based project creation with server-side file upload"
  - "Cascade storage deletion on project delete"
  - "Extended Project type with file URL fields"
affects: [25-02, 25-03, 26]

# Tech tracking
tech-stack:
  added: [firebase-admin/storage]
  patterns: [storage-singleton-with-admin-proxy, formdata-route-handler, cascade-delete]

key-files:
  created:
    - src/lib/storage.ts
  modified:
    - src/types/project.ts
    - src/app/api/projects/route.ts
    - src/app/api/projects/[id]/route.ts
    - src/components/CreateProjectModal.tsx
    - next.config.ts

key-decisions:
  - "Storage singleton triggers adminAuth proxy access to ensure app init (same pattern as firestore.ts)"
  - "File validation duplicated server-side instead of importing fileValidation.ts to avoid client-only code"
  - "Parallel file upload with Promise.all for score and audio"

patterns-established:
  - "Storage path convention: users/{uid}/projects/{projectId}/{fileType}{ext}"
  - "FormData upload pattern: client sends FormData, route handler validates and uploads to Storage"

# Metrics
duration: 2min
completed: 2026-02-11
---

# Phase 25 Plan 01: Storage Infrastructure Summary

**Firebase Storage singleton with FormData-based project creation, user-scoped file upload paths, and cascade deletion on project delete**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-11T22:45:34Z
- **Completed:** 2026-02-11T22:47:28Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Created Firebase Storage admin singleton following the same lazy-init pattern as firestore.ts
- Rewrote project creation to accept FormData with score/audio files, upload to Storage, and persist URLs
- Added cascade storage deletion to project delete endpoint
- Extended Project type with optional file URL and filename fields for score, audio, and background
- Added server-side file extension and size validation (score: 10MB, audio: 50MB)
- Configured 60mb body size limit in next.config.ts for large audio uploads

## Task Commits

Each task was committed atomically:

1. **Task 1: Create storage singleton and extend Project type** - `8461cfe` (feat)
2. **Task 2: Integrate file uploads into project creation and cascade delete** - `5a952ed` (feat)

## Files Created/Modified
- `src/lib/storage.ts` - Firebase Storage admin singleton with uploadFile and deleteProjectFiles helpers
- `src/types/project.ts` - Extended Project interface with scoreUrl, audioUrl, backgroundUrl optional fields; removed unused CreateProjectInput
- `src/app/api/projects/route.ts` - POST handler rewritten to accept FormData, validate files, upload to Storage, store URLs in Firestore
- `src/app/api/projects/[id]/route.ts` - DELETE handler now calls deleteProjectFiles before Firestore delete
- `src/components/CreateProjectModal.tsx` - handleCreate sends FormData with score/audio files instead of JSON
- `next.config.ts` - Added experimental.serverActions.bodySizeLimit of 60mb

## Decisions Made
- Storage singleton uses same adminAuth proxy trigger pattern as firestore.ts (consistency)
- File validation constants duplicated server-side in route handler rather than importing from fileValidation.ts (which may pull browser-only code via its File type usage)
- Score and audio uploaded in parallel via Promise.all for better performance
- Storage paths use convention `users/{uid}/projects/{projectId}/score{ext}` for clean prefix-based deletion

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - Firebase Storage bucket is configured via the existing NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET env var.

## Next Phase Readiness
- Storage infrastructure ready for file retrieval (25-02: loading score/audio from Storage URLs)
- Project type has URL fields ready to be consumed by the editor/player components
- Background image upload fields prepared in Project type for future use

## Self-Check: PASSED

All 7 created/modified files verified present. Both task commits (8461cfe, 5a952ed) verified in git log. TypeScript type check passes.

---
*Phase: 25-firebase-storage-file-persistence*
*Completed: 2026-02-11*
