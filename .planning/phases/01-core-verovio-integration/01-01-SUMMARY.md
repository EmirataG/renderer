---
phase: 01-core-verovio-integration
plan: 01
subsystem: infra
tags: [verovio, wasm, vite, react-hooks, musicxml-validation]

# Dependency graph
requires:
  - phase: none
    provides: first phase, no prior dependencies
provides:
  - Singleton WASM module loader (verovioService.ts)
  - React hook for Verovio lifecycle (useVerovio.ts)
  - TypeScript type declarations for verovio/wasm and verovio/esm
  - Vite WASM plugin configuration
  - Verovio-based MusicXML validation (no OSMD dependency)
affects: [01-02, 02-01, 03-01, 04-01]

# Tech tracking
tech-stack:
  added: [verovio@^6.0.1, vite-plugin-wasm@^3.5.0, vite-plugin-top-level-await@^1.6.0, "@types/verovio@^5.1.0"]
  patterns: [singleton-wasm-module, toolkit-factory, useRef-for-wasm-objects, lazy-wasm-init]

key-files:
  created:
    - src/lib/verovioService.ts
    - src/hooks/useVerovio.ts
    - src/types/verovio-augments.d.ts
  modified:
    - package.json
    - package-lock.json
    - vite.config.ts
    - src/lib/musicxmlValidation.ts

key-decisions:
  - "verovio-augments.d.ts created proactively for verovio/wasm and verovio/esm ESM entry points"
  - "WASM module cached via lazy singleton pattern (ensureModule) for single-load guarantee"
  - "useVerovio hook calls renderToMIDI() after every render to pre-populate timing data"
  - "MusicXML validation uses toolkit.getPageCount() as rough measure count proxy"

patterns-established:
  - "Singleton WASM: createVerovioModule() called once, cached in module scope"
  - "Toolkit factory: createToolkit() returns new VerovioToolkit per consumer"
  - "useRef for toolkit: WASM-backed C++ objects stored in useRef, not useState"
  - "Init sequence: loadData -> renderToSVG -> renderToMIDI (strict order)"

# Metrics
duration: 2min
completed: 2026-02-03
---

# Phase 1 Plan 1: Verovio WASM Setup Summary

**Verovio WASM singleton service, React hook, Vite WASM plugins, and MusicXML validation migrated from OSMD to Verovio**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-03T18:54:54Z
- **Completed:** 2026-02-03T18:57:10Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Verovio WASM loads successfully in both Vite dev and production build modes
- Singleton verovioService.ts ensures WASM binary loaded only once across all consumers
- useVerovio React hook provides complete render lifecycle (load, setOptions, loadData, renderToSVG, renderToMIDI)
- MusicXML validation migrated from OSMD DOM-based validation to Verovio toolkit.loadData() with zero DOM dependency
- TypeScript augmentations cover all Verovio methods needed through Phase 4

## Task Commits

Each task was committed atomically:

1. **Task 1: Install Verovio dependencies, configure Vite, create service layer and hook** - `5609b00` (feat)
2. **Task 2: Migrate MusicXML validation from OSMD to Verovio** - `36595e3` (feat)

## Files Created/Modified
- `src/lib/verovioService.ts` - Singleton WASM module loader with createToolkit() factory and isReady promise
- `src/hooks/useVerovio.ts` - React hook returning svgString, toolkit ref, isLoading, error states
- `src/types/verovio-augments.d.ts` - Module declarations for verovio/wasm and verovio/esm with full method signatures
- `vite.config.ts` - Added wasm() and topLevelAwait() plugins, optimizeDeps.exclude for verovio
- `package.json` - Added verovio, @types/verovio, vite-plugin-wasm, vite-plugin-top-level-await
- `package-lock.json` - Lock file updated with 91 new packages
- `src/lib/musicxmlValidation.ts` - Replaced OSMD with Verovio createToolkit for validation

## Decisions Made
- Created verovio-augments.d.ts proactively rather than relying on @types/verovio coverage of ESM entry points
- Used lazy singleton pattern for WASM module (not eager loading) to avoid blocking app startup
- renderToMIDI() called after every render in useVerovio hook to pre-populate timing data for later phases
- MusicXML validation uses getPageCount() as measure count proxy since Verovio does not expose source measure data like OSMD did

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Verovio WASM infrastructure ready for consumption by RegularRenderer in plan 01-02
- createToolkit() and useVerovio() hook ready for RegularRenderer rendering swap
- MusicXML validation already using Verovio (no OSMD dependency in validation path)
- Key concern from STATE.md (WASM loading in both dev and production) validated successfully

---
*Phase: 01-core-verovio-integration*
*Completed: 2026-02-03*
