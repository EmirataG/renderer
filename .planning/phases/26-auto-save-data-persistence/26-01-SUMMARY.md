---
phase: 26-auto-save-data-persistence
plan: 01
subsystem: database, api
tags: [zustand, firestore, subscribeWithSelector, auto-save, project-settings]

# Dependency graph
requires:
  - phase: 24-project-dashboard-crud
    provides: "Firestore project CRUD, getDb/FieldValue from firestore.ts"
  - phase: 25-firebase-storage-file-persistence
    provides: "Project type with file fields, GET/DELETE route handlers"
provides:
  - "projectStore with 16 saveable settings and subscribeWithSelector middleware"
  - "DEFAULT_SETTINGS object for fallback during load"
  - "PATCH /api/projects/[id] endpoint for partial project updates"
  - "Extended Project interface with settings and anchors fields"
  - "syncStore with subscribeWithSelector for external anchor subscriptions"
affects: [26-02-auto-save-wiring, project-settings, sync-anchors]

# Tech tracking
tech-stack:
  added: []
  patterns: [zustand-subscribeWithSelector, whitelist-based-patch, flat-firestore-fields]

key-files:
  created:
    - src/stores/projectStore.ts
  modified:
    - src/stores/syncStore.ts
    - src/types/project.ts
    - src/app/api/projects/[id]/route.ts

key-decisions:
  - "Settings stored as flat top-level Firestore fields (not nested under settings key)"
  - "PATCH endpoint whitelists 16 settings fields to prevent arbitrary writes"
  - "Project type uses string for scoreBorder (Firestore returns plain string, store casts to BorderStyle)"

patterns-established:
  - "subscribeWithSelector on Zustand stores: enables external subscription with custom equality for auto-save"
  - "Whitelist-based PATCH: only allowed fields pass through to Firestore update"

# Metrics
duration: 2min
completed: 2026-02-12
---

# Phase 26 Plan 01: Data Layer for Auto-Save Summary

**Zustand projectStore with 16 settings + subscribeWithSelector, PATCH endpoint with field whitelisting, and extended Project type with anchors**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-12T01:01:48Z
- **Completed:** 2026-02-12T01:03:32Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Centralized projectStore holding all 16 saveable settings with typed accessors and save status tracking
- PATCH /api/projects/[id] endpoint with field whitelisting, server timestamp, and session auth
- syncStore wrapped in subscribeWithSelector for external auto-save subscriptions on anchors
- Project interface extended with all optional settings fields and anchors Record type

## Task Commits

Each task was committed atomically:

1. **Task 1: Create projectStore and extend types** - `a0f9e1c` (feat)
2. **Task 2: Add PATCH endpoint for partial project update** - `4096e68` (feat)

## Files Created/Modified
- `src/stores/projectStore.ts` - Zustand store with 16 settings, save status, subscribeWithSelector middleware, DEFAULT_SETTINGS export
- `src/stores/syncStore.ts` - Added subscribeWithSelector middleware wrapping existing store creator
- `src/types/project.ts` - Extended Project interface with optional settings fields and anchors
- `src/app/api/projects/[id]/route.ts` - Added PATCH handler with whitelist, FieldValue.serverTimestamp()

## Decisions Made
- Settings stored as flat top-level Firestore fields (not nested under a `settings` key) to match research document schema and simplify queries
- PATCH endpoint whitelists 16 specific settings fields to prevent clients from overwriting name, URLs, or other protected fields
- Project type uses `string` for `scoreBorder` (Firestore returns plain string); the projectStore casts it to `BorderStyle` enum

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- projectStore, syncStore with subscribeWithSelector, and PATCH endpoint are ready for Plan 02 to wire auto-save debounce and settings loading
- DEFAULT_SETTINGS exported for fallback values during project load

## Self-Check: PASSED

All files confirmed present. All commit hashes verified in git log.

---
*Phase: 26-auto-save-data-persistence*
*Completed: 2026-02-12*
