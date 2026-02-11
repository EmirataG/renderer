---
phase: 25-firebase-storage-file-persistence
plan: 03
subsystem: security
tags: [firebase, firestore-rules, storage-rules, cors, proxy]

# Dependency graph
requires:
  - phase: 25-01
    provides: Storage singleton and file upload infrastructure
  - phase: 25-02
    provides: File retrieval and editor integration
provides:
  - Firestore security rules with user-scoped project document access
  - Storage security rules with user-scoped file access and 50MB size limit
  - Server-side proxy endpoints for score and audio (CORS bypass)
  - Lazy getBucket() singleton preventing Firebase init race conditions
affects: [26-auto-save, firebase-deploy]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Lazy singleton for Firebase Storage bucket (getBucket() instead of module-level export)"
    - "Server-side proxy pattern for Storage files to avoid CORS"

key-files:
  created:
    - firestore.rules
    - storage.rules
    - src/app/api/projects/[id]/score/route.ts
    - src/app/api/projects/[id]/audio/route.ts
  modified:
    - src/lib/storage.ts
    - src/app/api/projects/[id]/background/route.ts
    - src/App.tsx

key-decisions:
  - "Lazy getBucket() singleton replaces module-level bucket export to prevent Firebase Admin init race"
  - "Score and audio served through API proxy endpoints instead of direct Storage URLs (CORS)"
  - "Background route updated to use getBucket() for consistency"

patterns-established:
  - "getBucket() lazy init: Always call getBucket() instead of importing bucket directly"
  - "Storage proxy pattern: Browser fetches /api/projects/[id]/score and /api/projects/[id]/audio instead of signed URLs"

# Metrics
duration: 8min
completed: 2026-02-11
---

# Phase 25 Plan 03: Security Rules & Verification Summary

**Firestore and Storage security rules with defense-in-depth access control, plus server-side proxy endpoints for CORS-safe file delivery**

## Performance

- **Duration:** 8 min (including human verification)
- **Started:** 2026-02-11T23:00:00Z
- **Completed:** 2026-02-11T23:24:18Z
- **Tasks:** 2 (1 auto + 1 human-verify checkpoint)
- **Files modified:** 7

## Accomplishments
- Created Firestore security rules enforcing user-scoped project document access (`request.auth.uid == userId`)
- Created Storage security rules enforcing user-scoped file access with 50MB write limit
- Fixed Firebase Storage init race condition with lazy `getBucket()` singleton pattern
- Added server-side proxy endpoints for score XML and audio files to bypass CORS restrictions
- Full end-to-end Storage integration verified by human: create, load, refresh persistence, background upload, immutability, cascade delete

## Task Commits

Each task was committed atomically:

1. **Task 1: Create Firestore and Storage security rules** - `ada3c2e` (feat)
2. **Task 2: Human verification checkpoint** - APPROVED (no commit)

**Bug fix commits during verification:**
- `7376344` - fix: lazy getBucket() singleton to prevent Firebase init race
- `c1c2200` - fix: proxy score and audio through API endpoints to avoid CORS

## Files Created/Modified
- `firestore.rules` - Firestore security rules: user-scoped project document access, default deny
- `storage.rules` - Storage security rules: user-scoped file access, 50MB write limit, default deny
- `src/app/api/projects/[id]/score/route.ts` - Server proxy for score XML from Storage
- `src/app/api/projects/[id]/audio/route.ts` - Server proxy for audio from Storage with range request support
- `src/lib/storage.ts` - Changed from module-level `bucket` export to lazy `getBucket()` function
- `src/app/api/projects/[id]/background/route.ts` - Updated to use `getBucket()` instead of `bucket`
- `src/App.tsx` - Uses proxy URLs (`/api/projects/[id]/score`) instead of direct Storage URLs

## Decisions Made
- **Lazy getBucket() singleton:** Module-level `bucket` export caused Firebase Admin init race conditions when imported before Firebase was initialized. Changed to a lazy `getBucket()` function that initializes on first call.
- **Server-side proxy for Storage files:** Direct browser fetches to Firebase Storage URLs failed with CORS errors. Added `/api/projects/[id]/score` and `/api/projects/[id]/audio` proxy endpoints that fetch from Storage server-side and forward to the browser.
- **Background route consistency:** Updated the existing background upload route to use `getBucket()` for consistency with the new lazy initialization pattern.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed Firebase Storage init race condition**
- **Found during:** Task 2 (human verification)
- **Issue:** Module-level `const bucket = getStorage().bucket()` in storage.ts executed before Firebase Admin was initialized, causing crashes
- **Fix:** Changed to lazy `getBucket()` function that initializes the bucket singleton on first call
- **Files modified:** src/lib/storage.ts, src/app/api/projects/[id]/background/route.ts
- **Verification:** Storage operations work correctly after fix
- **Committed in:** 7376344

**2. [Rule 3 - Blocking] Added server-side proxy endpoints for CORS bypass**
- **Found during:** Task 2 (human verification)
- **Issue:** Browser could not fetch score XML and audio files directly from Firebase Storage URLs due to CORS policy
- **Fix:** Created /api/projects/[id]/score and /api/projects/[id]/audio proxy endpoints that fetch from Storage server-side
- **Files modified:** src/app/api/projects/[id]/score/route.ts, src/app/api/projects/[id]/audio/route.ts, src/App.tsx
- **Verification:** Score and audio load correctly in the editor via proxy URLs
- **Committed in:** c1c2200

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking)
**Impact on plan:** Both fixes were necessary for the Storage integration to function in the browser. The proxy pattern is a standard approach for server-side Storage access. No scope creep.

## Issues Encountered
- Firebase Storage init race: Resolved by switching to lazy initialization pattern (see deviation 1)
- CORS on direct Storage URLs: Resolved by server-side proxy endpoints (see deviation 2)

## User Setup Required
None - security rules files are created at the project root and ready for deployment via `firebase deploy --only firestore:rules,storage` when the user configures the Firebase CLI.

## Next Phase Readiness
- Phase 25 (Firebase Storage & File Persistence) is now fully complete
- All three plans delivered: storage infrastructure, file retrieval/editor integration, security rules
- Ready for Phase 26 (Auto-save and project settings) which builds on the Storage foundation
- Note: Firestore offline persistence could conflict with auto-save debounce (flagged in STATE.md blockers)

## Self-Check: PASSED

All 7 files verified present. All 3 commits verified in git history.

---
*Phase: 25-firebase-storage-file-persistence*
*Completed: 2026-02-11*
