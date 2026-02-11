# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-11)

**Core value:** Scores render correctly and efficiently -- high-quality engraving with smooth playback, even on long scores.
**Current focus:** v2.0 Next.js Migration & Firebase

## Current Position

Phase: 23 of 26 (Firebase Authentication)
Plan: 1 of 2 complete
Status: In Progress
Last activity: 2026-02-11 -- Completed 23-01 (Firebase SDKs, session route, login page)

Progress: [##........] 15%

## Performance Metrics

**Velocity:**

- Total plans completed: 32
- Average duration: 2.3 min
- Total execution time: 75 min

**By Phase:**

| Phase                             | Plans | Total | Avg/Plan |
| --------------------------------- | ----- | ----- | -------- |
| 1 - Core Verovio Integration      | 2/2   | 4 min | 2 min    |
| 2 - Event System Migration        | 1/1   | 1 min | 1 min    |
| 2.1 - Sync-Only Playback          | 2/2   | 4 min | 2 min    |
| 6 - Paginated Rendering           | 3/3   | 6 min | 2 min    |
| 7 - Event Position Caching        | 2/2   | 6 min | 3 min    |
| 8 - Virtual Scrolling             | 1/1   | 2 min | 2 min    |
| 9 - OSMD Cleanup                  | 1/1   | 2 min | 2 min    |
| 10 - Single-Line Verovio Hook     | 1/1   | 3 min | 3 min    |
| 11 - Single-Line Event Extraction | 1/1   | 3 min | 3 min    |
| 12 - SingleLineRenderer Core      | 1/2   | 4 min | 4 min    |
| 13 - Section Virtualization       | 2/3   | 6 min | 3 min    |
| 14 - Page Virtualization          | 2/2   | 5 min | 2.5 min  |
| 15 - Backend Foundation           | 3/3   | 6 min | 2 min    |
| 16 - Frontend Render Mode         | 1/1   | 3 min | 3 min    |
| 17 - Puppeteer Integration        | 2/2   | 4 min | 2 min    |
| 18 - FFmpeg Encoding & Audio Mux  | 1/1   | 2 min | 2 min    |
| 19 - Progress Streaming & DL      | 2/2   | 4 min | 2 min    |
| 20 - Docker & Fly.io Deployment   | 1/2   | 1 min | 1 min    |
| 22 - Next.js Scaffold & Migration | 2/2   | 6 min | 3 min    |
| 23 - Firebase Authentication      | 1/2   | 3 min | 3 min    |

_Updated after each plan completion_

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.

- 22-01: Disabled noUncheckedSideEffectImports (Next.js lacks plain CSS type declarations)
- 22-01: No webpack WASM config needed (verovio embeds WASM inline in JS)
- 22-01: Single dynamic({ ssr: false }) boundary wraps entire App component
- 22-02: Dedicated /render route for Puppeteer uses same dynamic({ ssr: false }) pattern loading RenderApp
- 22-02: Export service frontendUrl default changed to http://localhost:3000/render
- 23-01: Added @/ path alias to tsconfig.json for clean imports across the project
- 23-01: Firebase Admin SDK initializes without credentials when env vars missing (build-time safety)
- 23-01: Login page uses force-dynamic to prevent SSR prerender failure from Firebase client SDK

### Pending Todos

None.

### Blockers/Concerns

- ~~Turbopack + Verovio WASM interaction untested~~ RESOLVED: Validated in 22-01, builds cleanly
- Firestore offline persistence could conflict with auto-save debounce (investigate in Phase 26)

## Session Continuity

Last session: 2026-02-11
Stopped at: Completed 23-01-PLAN.md
Resume file: None
Next: 23-02-PLAN.md (route protection via proxy.ts and sign-out)
