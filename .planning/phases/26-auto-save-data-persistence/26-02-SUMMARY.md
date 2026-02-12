---
phase: 26-auto-save-data-persistence
plan: 02
subsystem: ui, api
tags: [zustand, auto-save, debounce, subscribeWithSelector, save-indicator, project-settings]

# Dependency graph
requires:
  - phase: 26-auto-save-data-persistence
    provides: "projectStore with 16 settings + subscribeWithSelector, PATCH endpoint, DEFAULT_SETTINGS"
  - phase: 25-firebase-storage-file-persistence
    provides: "Project load flow in App.tsx, file proxy endpoints"
provides:
  - "Debounced auto-save engine with external Zustand subscriptions on settings and anchors"
  - "SaveIndicator component showing save status lifecycle"
  - "App.tsx fully wired to projectStore for all 16 settings"
  - "Settings and anchors loaded from API response into stores on project open"
affects: [end-to-end-persistence, project-settings, sync-anchors]

# Tech tracking
tech-stack:
  added: []
  patterns: [external-zustand-subscription-auto-save, debounced-patch, save-status-lifecycle]

key-files:
  created:
    - src/lib/autoSave.ts
    - src/components/SaveIndicator.tsx
  modified:
    - src/App.tsx

key-decisions:
  - "Auto-save subscribes externally (not in React) to avoid lifecycle coupling"
  - "initAutoSave called AFTER loadSettings to prevent spurious save on project open"
  - "getSaveableSettings explicitly picks 16 keys instead of rest-spread (TypeScript index signature compatibility)"

patterns-established:
  - "External Zustand subscription for side effects: subscribe outside React, return cleanup function"
  - "Save status lifecycle: idle -> saving -> saved (3s dismiss) -> idle"
  - "Settings migration: useState replaced with useProjectStore selectors + setSetting action"

# Metrics
duration: 4min
completed: 2026-02-12
---

# Phase 26 Plan 02: Auto-Save Wiring Summary

**Debounced auto-save engine with 1500ms PATCH debounce, App.tsx migrated from 16 useState calls to projectStore, SaveIndicator in Inspector header**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-12T01:05:43Z
- **Completed:** 2026-02-12T01:09:42Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Created auto-save engine that subscribes externally to projectStore (JSON deep equality) and syncStore (Map value equality) with 1500ms debounce
- Migrated all 16 saveable settings from individual useState calls to useProjectStore selectors with setSetting action
- Settings and anchors load from GET /api/projects/[id] response with DEFAULT_SETTINGS fallback on project open
- SaveIndicator shows saving/saved/error states in Inspector header, auto-dismisses "Saved" after 3 seconds
- Auto-save initializes AFTER loadSettings completes, preventing spurious save on initial project load

## Task Commits

Each task was committed atomically:

1. **Task 1: Create auto-save engine and SaveIndicator** - `494de21` (feat)
2. **Task 2: Wire App.tsx to projectStore and initialize auto-save** - `d914b37` (feat)

## Files Created/Modified
- `src/lib/autoSave.ts` - Debounced auto-save engine with external Zustand subscriptions, PATCH to API, save status lifecycle
- `src/components/SaveIndicator.tsx` - Minimal save status indicator (idle/saving/saved/error) with hover error detail
- `src/App.tsx` - All 16 settings from projectStore, settings + anchors loaded from API, auto-save initialized after load, SaveIndicator in header

## Decisions Made
- Auto-save subscribes externally (not in React) using `useProjectStore.subscribe()` to avoid component lifecycle coupling -- subscriptions live as long as the project is open
- `initAutoSave()` called AFTER `loadSettings()` and anchor restoration to prevent the initial bulk state update from triggering a spurious save to the API
- `getSaveableSettings` explicitly picks 16 settings keys instead of using rest-spread destructuring, because TypeScript's `ProjectStore` interface lacks an index signature needed for `Record<string, unknown>` assignment

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed getSaveableSettings type error with explicit key picking**
- **Found during:** Task 1 (auto-save engine creation)
- **Issue:** Plan suggested destructuring non-settings fields and spreading the rest, but ProjectStore interface lacks `Record<string, unknown>` index signature, causing TS2345
- **Fix:** Replaced rest-spread with explicit property picking of all 16 settings keys
- **Files modified:** src/lib/autoSave.ts
- **Verification:** `npx tsc --noEmit` passes with zero errors
- **Committed in:** `494de21` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Minor implementation detail change for TypeScript compatibility. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- End-to-end auto-save persistence is fully wired: settings changes and anchor changes trigger debounced PATCH saves to Firestore
- Project open loads all persisted settings and anchors, restoring the exact state from last save
- This completes Phase 26 (Auto-Save & Data Persistence) -- all plans executed

## Self-Check: PASSED

All files confirmed present. All commit hashes verified in git log.

---
*Phase: 26-auto-save-data-persistence*
*Completed: 2026-02-12*
