---
phase: 22-nextjs-scaffold-and-migration
plan: 01
subsystem: infra
tags: [next.js, turbopack, app-router, vite-migration, ssr]

# Dependency graph
requires: []
provides:
  - "Next.js 16 App Router scaffold with Turbopack"
  - "Client-only boundary wrapping entire App via dynamic({ ssr: false })"
  - "Catch-all SPA route at /[[...slug]]"
  - "Root layout replacing index.html"
  - "process.env.NODE_ENV replacing import.meta.env.DEV"
affects: [22-02-PLAN, phase-23, phase-24, phase-25, phase-26]

# Tech tracking
tech-stack:
  added: [next@16.1.6, @types/node]
  removed: [vite, @vitejs/plugin-react, vite-plugin-wasm, vite-plugin-top-level-await]
  patterns: [app-router-catch-all-spa, dynamic-ssr-false-boundary, server-component-layout]

key-files:
  created:
    - next.config.ts
    - src/app/layout.tsx
    - src/app/[[...slug]]/page.tsx
    - src/app/[[...slug]]/client.tsx
  modified:
    - package.json
    - tsconfig.json
    - .gitignore
    - src/App.tsx
  deleted:
    - vite.config.ts
    - index.html
    - src/main.tsx
    - src/vite-env.d.ts
    - tsconfig.app.json

key-decisions:
  - "Disabled noUncheckedSideEffectImports: Next.js global.d.ts only declares *.module.css, not plain CSS side-effect imports"
  - "Kept minimal next.config.ts with no webpack/WASM config: verovio embeds WASM inline in JS bundle"
  - "Single dynamic({ ssr: false }) boundary wraps entire App component: cleanest migration path"

patterns-established:
  - "App Router catch-all: /[[...slug]]/page.tsx as server shell, client.tsx as CSR boundary"
  - "Environment detection: process.env.NODE_ENV !== 'production' replaces import.meta.env.DEV"

# Metrics
duration: 3min
completed: 2026-02-11
---

# Phase 22 Plan 01: Next.js Scaffold and Vite Migration Summary

**Next.js 16 App Router with Turbopack replacing Vite SPA, single dynamic({ ssr: false }) boundary wrapping entire editor**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-11T17:23:14Z
- **Completed:** 2026-02-11T17:26:43Z
- **Tasks:** 3
- **Files modified:** 12 (7 created, 5 deleted, 4 modified)

## Accomplishments
- Replaced Vite with Next.js 16 as the application framework
- Created App Router catch-all route with client-only boundary for SPA behavior
- Migrated all import.meta.env.DEV to process.env.NODE_ENV
- Removed all Vite artifacts (config, plugins, entry files, type declarations)
- Verified dev server starts with Turbopack and production build succeeds

## Task Commits

Each task was committed atomically:

1. **Task 1: Install Next.js and create App Router scaffold** - `795307e` (feat)
2. **Task 2: Migrate code from Vite to Next.js and remove Vite artifacts** - `8ea9df1` (feat)
3. **Task 3: Verify Next.js dev server starts and Verovio renders** - `8bde289` (chore)

## Files Created/Modified
- `next.config.ts` - Minimal Next.js configuration (Turbopack default)
- `src/app/layout.tsx` - Root layout replacing index.html, imports global CSS
- `src/app/[[...slug]]/page.tsx` - Catch-all server component shell with generateStaticParams
- `src/app/[[...slug]]/client.tsx` - Client boundary with dynamic(() => import('../../App'), { ssr: false })
- `package.json` - Scripts updated to next dev/build/start, Vite deps removed, Next.js added
- `tsconfig.json` - Merged tsconfig.app.json settings, added Next.js plugin and includes
- `.gitignore` - Added .next and next-env.d.ts entries
- `src/App.tsx` - Replaced 3 import.meta.env.DEV references with process.env.NODE_ENV

## Decisions Made
- **Disabled noUncheckedSideEffectImports:** Next.js global.d.ts only provides type declarations for CSS modules (*.module.css), not plain CSS side-effect imports. This TypeScript 5.9 flag was causing build failures on `import '../index.css'` in layout.tsx.
- **No webpack WASM config needed:** Verovio embeds WASM inline in its JS bundle, so Turbopack handles it as a regular module without special configuration.
- **Single CSR boundary pattern:** Wrapping the entire App component in one dynamic({ ssr: false }) call is the cleanest migration path -- avoids needing to audit every component for SSR compatibility.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Disabled noUncheckedSideEffectImports in tsconfig.json**
- **Found during:** Task 3 (Build verification)
- **Issue:** `next build` failed with "Cannot find module '../index.css'" because TypeScript's noUncheckedSideEffectImports requires type declarations for all side-effect imports, but Next.js only declares *.module.css types
- **Fix:** Set noUncheckedSideEffectImports to false in tsconfig.json
- **Files modified:** tsconfig.json
- **Verification:** `next build` completed successfully after the fix
- **Committed in:** 8bde289 (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary for build to succeed. No scope creep. Next.js auto-modifications to tsconfig (resolveJsonModule, @types/node) were also accepted as standard framework behavior.

## Issues Encountered
- Next.js automatically installed @types/node and modified tsconfig.json (adding resolveJsonModule, reformatting, adding .next/dev/types include) -- this is standard Next.js behavior on first dev server start.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Next.js framework swap complete, ready for Plan 02 (/render route for Puppeteer export)
- Turbopack + Verovio WASM interaction validated: no SSR crashes, builds cleanly
- All existing editor components preserved as client components behind single CSR boundary

---
*Phase: 22-nextjs-scaffold-and-migration*
*Completed: 2026-02-11*
