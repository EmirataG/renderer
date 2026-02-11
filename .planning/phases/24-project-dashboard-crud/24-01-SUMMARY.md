---
phase: 24-project-dashboard-crud
plan: 01
subsystem: api
tags: [firestore, firebase-admin, crud, route-handler, project-types, file-validation]

# Dependency graph
requires:
  - phase: 23-firebase-authentication
    provides: Firebase Admin SDK singleton (adminAuth), session cookie Route Handler, server-only pattern
provides:
  - Project and CreateProjectInput TypeScript interfaces
  - Firestore lazy singleton with server-only guard (getDb, FieldValue)
  - GET /api/projects (list user projects ordered by updatedAt desc)
  - POST /api/projects (create project with server timestamps)
  - DELETE /api/projects/[id] (remove project after ownership check)
  - Extended file validation (.mxl, .mei for scores; .mp3, .wav only for audio)
affects: [24-02, 24-03, dashboard-ui, project-creation-modal, editor-routing]

# Tech tracking
tech-stack:
  added: []
  patterns: [firestore-admin-singleton, route-handler-auth-verification, server-timestamp-serialization]

key-files:
  created:
    - src/types/project.ts
    - src/lib/firestore.ts
    - src/app/api/projects/route.ts
    - src/app/api/projects/[id]/route.ts
  modified:
    - src/lib/fileValidation.ts

key-decisions:
  - "Firestore singleton triggers adminAuth Proxy access to ensure app initialization before getFirestore()"
  - "POST validates name as non-empty trimmed string, returns 400 for invalid input"
  - "Audio file types narrowed to .mp3 and .wav only per user decision"

patterns-established:
  - "Firestore singleton: lazy getDb() with server-only import guard"
  - "Route Handler auth: getAuthenticatedUser() helper verifying __session cookie via adminAuth.verifySessionCookie"
  - "Timestamp serialization: Firestore Timestamps converted to ISO strings via .toDate().toISOString() in Route Handlers"
  - "Ownership check: doc.data().userId !== user.uid returns 403 Forbidden"

# Metrics
duration: 2min
completed: 2026-02-11
---

# Phase 24 Plan 01: Project Data Layer Summary

**Firestore singleton, Project type definitions, file validation extensions (.mxl/.mei), and CRUD API Route Handlers with auth and ownership checks**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-11T21:44:05Z
- **Completed:** 2026-02-11T21:46:29Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Project and CreateProjectInput TypeScript interfaces with all required fields (id, userId, name, viewMode, timestamps)
- Firestore lazy singleton module with server-only guard that safely initializes via adminAuth Proxy access
- Extended file validation: .mxl and .mei added to musicxml extensions, audio narrowed to .mp3/.wav, MEI/MXL MIME types added
- Full CRUD API: GET lists projects by updatedAt desc, POST creates with validation and server timestamps, DELETE with ownership verification
- All routes return appropriate HTTP status codes (401, 400, 403, 404)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create Project types, Firestore singleton, and extend file validation** - `d1d8d0d` (feat)
2. **Task 2: Create project CRUD API Route Handlers** - `45d5a41` (feat)

## Files Created/Modified
- `src/types/project.ts` - Project and CreateProjectInput interfaces for client-side project representation
- `src/lib/firestore.ts` - Firestore Admin SDK lazy singleton with server-only guard, exports getDb and FieldValue
- `src/lib/fileValidation.ts` - Extended with .mxl/.mei extensions, narrowed audio to .mp3/.wav, added MEI/MXL MIME mappings
- `src/app/api/projects/route.ts` - GET (list user projects) and POST (create project) Route Handlers
- `src/app/api/projects/[id]/route.ts` - DELETE Route Handler with existence check and ownership verification

## Decisions Made
- Firestore singleton uses `void adminAuth` to trigger the Proxy in firebase-admin.ts, ensuring the Firebase Admin app is initialized before `getFirestore()` is called -- avoids "default app does not exist" error
- POST handler trims project name and validates it as a non-empty string before creation
- Audio file types narrowed from [.mp3, .wav, .ogg, .m4a] to [.mp3, .wav] per user constraint from CONTEXT.md
- Removed ogg/m4a MIME mappings alongside extension removal for consistency

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required

Firestore must be enabled in the Firebase Console before the project CRUD APIs will work at runtime:
1. Go to Firebase Console > Build > Firestore Database
2. Click "Create database" (Native mode, any region)
3. The composite index for `userId` + `updatedAt` will be auto-suggested by Firestore when the first query runs (click the URL in the error message to create it)

## Next Phase Readiness
- Project data layer complete: types, Firestore access, and all CRUD endpoints built and type-checked
- Ready for Plan 02: Dashboard UI with project grid, creation modal, and delete with undo
- Runtime testing requires Firestore enabled in Firebase Console and composite index created

## Self-Check: PASSED

All 5 created/modified files verified present. Both task commits (d1d8d0d, 45d5a41) verified in git history.

---
*Phase: 24-project-dashboard-crud*
*Completed: 2026-02-11*
