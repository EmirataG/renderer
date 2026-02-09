---
phase: 16-frontend-render-mode
plan: 01
subsystem: ui
tags: [react, puppeteer, headless, render-mode, code-splitting, verovio]

# Dependency graph
requires:
  - phase: 15-backend-foundation-settings-transfer
    provides: ExportSettings TypeBox schema, export-service backend
provides:
  - renderMode prop on RegularRenderer (disables virtualization + transitions)
  - RenderApp.tsx wrapper reading __EXPORT_CONFIG__ and rendering score
  - ExportConfig global type declarations for Puppeteer injection
  - Dynamic import routing in main.tsx (App vs RenderApp)
  - window.rendererReady readiness signal for backend polling
  - audioDuration prop override (no audio element in render mode)
affects: [17-puppeteer-integration]

# Tech tracking
tech-stack:
  added: []
  patterns: [dynamic-import-routing, render-mode-prop-pattern, zustand-state-injection]

key-files:
  created:
    - src/RenderApp.tsx
  modified:
    - src/renderers/RegularRenderer.tsx
    - src/types/global.d.ts
    - src/main.tsx

key-decisions:
  - "propAudioDuration naming to avoid shadowing state variable audioDuration"
  - "Virtualization bypass via extractionDoneRef staying false (reuses existing mount condition)"
  - "Dynamic import() in main.tsx for code splitting -- RenderApp and App in separate chunks"

patterns-established:
  - "Render mode prop pattern: renderMode boolean conditionally disables interactive features"
  - "Config injection pattern: window.__EXPORT_CONFIG__ set by evaluateOnNewDocument before scripts"

# Metrics
duration: 3min
completed: 2026-02-09
---

# Phase 16 Plan 01: Frontend Render Mode Summary

**Headless render mode with renderMode prop disabling virtualization/transitions, RenderApp wrapper reading __EXPORT_CONFIG__, and dynamic import routing in main.tsx**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-09T16:50:06Z
- **Completed:** 2026-02-09T16:53:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- RegularRenderer accepts renderMode and audioDuration props: virtualization stays disabled, camera transition is "none", audioDuration set from prop
- window.rendererReady signal set when animation controller exposed, cleared on cleanup
- ExportConfig interface in global.d.ts mirrors backend ExportSettings schema plus runtime fields (musicXml, syncAnchors, audioDuration, bgUrl)
- main.tsx dynamically routes to RenderApp or App based on __EXPORT_CONFIG__ presence
- RenderApp injects sync anchors into Zustand before mounting RegularRenderer with all config props
- Production build code-splits RenderApp (1.2 KB) and App (123 KB) into separate chunks

## Task Commits

Each task was committed atomically:

1. **Task 1: Add renderMode and audioDuration props to RegularRenderer** - `9197f3c` (feat)
2. **Task 2: Create ExportConfig types, entry routing, and RenderApp** - `1c9ec7a` (feat)

## Files Created/Modified
- `src/renderers/RegularRenderer.tsx` - renderMode/audioDuration props, virtualization bypass, transition disable, rendererReady signal, getFps fix
- `src/types/global.d.ts` - ExportConfig interface, rendererReady/animationController Window declarations
- `src/main.tsx` - Dynamic import routing between App and RenderApp based on __EXPORT_CONFIG__
- `src/RenderApp.tsx` - Minimal render-mode wrapper reading config, injecting sync anchors, rendering RegularRenderer

## Decisions Made
- Used `propAudioDuration` naming in destructuring to avoid shadowing the `audioDuration` state variable
- Virtualization bypass works by keeping `extractionDoneRef.current = false` in render mode, which reuses the existing `!extractionDoneRef.current || visiblePages.has(i)` mount condition to keep all pages mounted
- Dynamic `import()` in main.tsx ensures App code is never loaded in render mode and vice versa, producing separate Vite chunks
- Fixed `getFps` to return actual `fps` prop value instead of hardcoded 30

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed getFps returning hardcoded 30 instead of actual fps prop**
- **Found during:** Task 1 (animation controller useEffect)
- **Issue:** getFps was hardcoded to return 30, but should return the actual fps prop value
- **Fix:** Changed `getFps: () => 30` to `getFps: () => fps`
- **Files modified:** src/renderers/RegularRenderer.tsx
- **Verification:** TypeScript compiles, grep confirms change
- **Committed in:** 9197f3c (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Bug fix was specified in the plan's Task 1 action item 6. Executed as planned.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Frontend render mode is complete and ready for Phase 17 (Puppeteer Integration)
- Puppeteer can inject __EXPORT_CONFIG__ via evaluateOnNewDocument, poll window.rendererReady, then use window.animationController for frame capture
- All 19 ExportConfig fields are typed and passed through to RegularRenderer
- Interactive mode (no __EXPORT_CONFIG__) works identically to before

## Self-Check: PASSED

All 4 source files exist. Both task commits (9197f3c, 1c9ec7a) verified in git log. SUMMARY.md created.

---
*Phase: 16-frontend-render-mode*
*Completed: 2026-02-09*
