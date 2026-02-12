---
phase: quick-47
plan: 01
subsystem: api, ui
tags: [firebase-storage, firestore, duplicate, project-management]

# Dependency graph
requires:
  - phase: 24-project-dashboard-crud
    provides: ProjectCard, Dashboard, project CRUD API
  - phase: 25-firebase-storage
    provides: uploadFile, getBucket, storage helpers
provides:
  - POST /api/projects/[id]/duplicate endpoint
  - Duplicate button in project card three-dot menu
affects: [dashboard, project-management]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Storage file copy via download + re-upload pattern"

key-files:
  created:
    - src/app/api/projects/[id]/duplicate/route.ts
  modified:
    - src/components/ProjectCard.tsx
    - src/components/Dashboard.tsx

key-decisions:
  - "File copy uses download + uploadFile (no server-side copy API in Firebase Admin)"
  - "New project gets fresh createdAt/updatedAt timestamps via FieldValue.serverTimestamp()"

# Metrics
duration: 1min
completed: 2026-02-12
---

# Quick Task 47: Add Duplicate Project Option Summary

**Full project duplication (Firestore doc + Storage files) via three-dot menu with "Copy of [name]" naming**

## Performance

- **Duration:** 1 min
- **Started:** 2026-02-12T16:16:27Z
- **Completed:** 2026-02-12T16:17:48Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- POST /api/projects/[id]/duplicate endpoint copies Firestore document and all Storage files (score, audio, background)
- Duplicate button added to project card dropdown menu above Delete
- Dashboard handler calls API, prepends new project to grid, and shows success toast

## Task Commits

Each task was committed atomically:

1. **Task 1: Create POST /api/projects/[id]/duplicate endpoint** - `0dab57b` (feat)
2. **Task 2: Add Duplicate button to ProjectCard and wire up in Dashboard** - `dd3468c` (feat)

## Files Created/Modified
- `src/app/api/projects/[id]/duplicate/route.ts` - POST endpoint that copies Firestore doc + Storage files to new project
- `src/components/ProjectCard.tsx` - Added onDuplicate prop and Duplicate button above Delete in dropdown
- `src/components/Dashboard.tsx` - Added handleDuplicate callback that calls API and prepends new project

## Decisions Made
- File copy uses download() + uploadFile() pattern since Firebase Admin SDK lacks server-side copy
- New project gets fresh timestamps (not copied from source)
- Storage URL fields only included if the source project had them

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Duplicate feature is fully functional end-to-end
- No blockers or concerns

## Self-Check: PASSED

All files verified present on disk. All commit hashes verified in git log.

---
*Quick Task: 47*
*Completed: 2026-02-12*
