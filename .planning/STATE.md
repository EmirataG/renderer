# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-11)

**Core value:** Scores render correctly and efficiently -- high-quality engraving with smooth playback, even on long scores.
**Current focus:** v2.0 Next.js Migration & Firebase

## Current Position

Phase: 26 of 26 (Auto-Save & Data Persistence)
Plan: 2 of 2 complete
Status: Complete
Last activity: 2026-02-18 - Completed quick task 58: add perspective toggle button to score region editor

Progress: [##########] 42/42

## Performance Metrics

**Velocity:**

- Total plans completed: 42
- Average duration: 2.7 min
- Total execution time: 113 min

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
| 22.1 - Self-Contained Export Svc  | 2/2   | 9 min | 4.5 min  |
| 23 - Firebase Authentication      | 1/2   | 3 min | 3 min    |
| 24 - Project Dashboard & CRUD     | 3/3   | 10 min | 3.3 min |
| 25 - Firebase Storage & File Pers | 3/3   | 13 min | 4.3 min |
| 26 - Auto-Save & Data Persistence| 2/2   | 6 min  | 3 min   |

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
- 22.1-01: Duplicated animation/interpolation logic in export-service (simpler than shared repo-root module)
- 22.1-02: Switched from verovio UMD (Node-only) to verovio/wasm + verovio/esm ESM imports for browser compat
- 22.1-02: esbuild format changed from IIFE to ESM to support import.meta.url for WASM loader
- 22.1-02: frontendUrl changed to localhost:3001/render (export service serves its own page)
- 24-01: Firestore singleton triggers adminAuth Proxy access to ensure app initialization before getFirestore()
- 24-01: Audio file types narrowed to .mp3 and .wav only per user decision
- 24-02: Toast action button dismissed after onClick (prevents double-action)
- 24-02: Dropped XML declaration requirement from isLikelyMusicXML for broader format support
- 24-03: Firestore structure changed to users/{uid}/projects/{id} subcollection (no composite index, inherent scoping)
- 24-03: firebase-admin.ts fixed to reuse existing app instead of deleting all apps on init
- 24-03: userId field removed from Project type (ownership implicit in Firestore path)
- 25-01: Storage singleton triggers adminAuth proxy access (same pattern as firestore.ts)
- 25-01: File validation duplicated server-side to avoid importing browser-only fileValidation.ts
- 25-01: Parallel file upload via Promise.all for score and audio
- 25-02: Audio state type allows null File for URL-loaded projects (export uses non-null assertion)
- 25-02: Background route deletes all existing background files by prefix before uploading replacement
- 25-02: UploadDropZone restricts to image-only uploads when projectId is set (immutable score/audio)
- 25-03: Lazy getBucket() singleton replaces module-level bucket export (Firebase Admin init race fix)
- 25-03: Score and audio served through API proxy endpoints instead of direct Storage URLs (CORS)
- 25-03: Background route updated to use getBucket() for consistency with lazy init pattern
- 26-01: Settings stored as flat top-level Firestore fields (not nested under settings key)
- 26-01: PATCH endpoint whitelists 16 settings fields to prevent arbitrary writes
- 26-01: Project type uses string for scoreBorder (Firestore returns plain string, store casts to BorderStyle)
- 26-02: Auto-save subscribes externally (not in React) to avoid lifecycle coupling
- 26-02: initAutoSave called AFTER loadSettings to prevent spurious save on project open
- 26-02: getSaveableSettings explicitly picks 16 keys instead of rest-spread (TypeScript index signature compatibility)

### Roadmap Evolution

- Phase 22.1 inserted after Phase 22: Self-Contained Export Service (URGENT)

### Pending Todos

None.

### Blockers/Concerns

- ~~Turbopack + Verovio WASM interaction untested~~ RESOLVED: Validated in 22-01, builds cleanly
- ~~Firestore offline persistence could conflict with auto-save debounce (investigate in Phase 26)~~ RESOLVED: Auto-save uses server-side PATCH via fetch, not client-side Firestore SDK -- no offline persistence conflict

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 43 | fix notehead z-index so colored noteheads render above stems in SVG | 2026-02-12 | 8c2bc69 | [43-fix-notehead-z-index-so-colored-notehead](./quick/43-fix-notehead-z-index-so-colored-notehead/) |
| 44 | display background image in project card thumbnail | 2026-02-12 | f366f91 | [44-update-the-project-dashboard-code-so-tha](./quick/44-update-the-project-dashboard-code-so-tha/) |
| 45 | move score region edit buttons from image overlay to inspector panel | 2026-02-12 | c5d284f | [45-move-score-region-edit-buttons-from-imag](./quick/45-move-score-region-edit-buttons-from-imag/) |
| 46 | remove getDownloadURL overhead from file uploads (2-10s faster project creation) | 2026-02-12 | 3b1f2d8 | [46-investigate-why-creating-a-project-takes](./quick/46-investigate-why-creating-a-project-takes/) |
| 47 | add duplicate project option in project card menu | 2026-02-12 | dd3468c | [47-add-duplicate-project-option-in-project-](./quick/47-add-duplicate-project-option-in-project-/) |
| 48 | ~~stream audio from Firebase Storage and set preload=metadata~~ REVERTED (55e2e53) | 2026-02-12 | 3528e86 | [48-investigate-why-first-audio-playback-is-](./quick/48-investigate-why-first-audio-playback-is-/) |
| 49 | ~~fix note highlighting regression~~ REVERTED (55e2e53) | 2026-02-12 | 18d7526 | [49-fix-note-highlighting-regression-after-a](./quick/49-fix-note-highlighting-regression-after-a/) |
| 50 | revert transportMessage guard and add TRANSPORT_DEBUG diagnostics | 2026-02-12 | 5f36b00 | [50-revert-transport-message-fix-and-add-dia](./quick/50-revert-transport-message-fix-and-add-dia/) |
| 51 | fix event extraction race condition (containerWidth dep) and remove diagnostic logs | 2026-02-12 | 754bf65 | [51-fix-event-extraction-race-events-never-e](./quick/51-fix-event-extraction-race-events-never-e/) |
| 52 | fix project card thumbnails not showing background images on dashboard | 2026-02-12 | e90e711 | [52-fix-project-card-thumbnails-not-showing-](./quick/52-fix-project-card-thumbnails-not-showing-/) |
| 53 | auto-reset score region when background image changes | 2026-02-12 | a28d31e | [53-when-the-background-image-is-changed-the](./quick/53-when-the-background-image-is-changed-the/) |
| 54 | add rotation handle to score region editor with CSS transform in renderers and export | 2026-02-13 | 47d3d73 | [54-add-an-option-to-rotate-the-score-region](./quick/54-add-an-option-to-rotate-the-score-region/) |
| 55 | add route protection middleware redirecting unauthenticated users to /login | 2026-02-13 | f4afd91 | [55-add-route-protection-so-unauthenticated-](./quick/55-add-route-protection-so-unauthenticated-/) |
| 56 | fix background image loading twice when selecting new image in project | 2026-02-17 | 866b946 | [56-fix-background-image-loading-twice-when-](./quick/56-fix-background-image-loading-twice-when-/) |
| 57 | add perspective transform to score region via CSS matrix3d and corner handles | 2026-02-18 | 8c4c8fe | [57-add-perspective-transform-to-score-regio](./quick/57-add-perspective-transform-to-score-regio/) |
| 58 | add perspective toggle button so diamond and resize handles don't overlap | 2026-02-18 | 0ca2e8d | [58-add-perspective-toggle-button-so-diamond](./quick/58-add-perspective-toggle-button-so-diamond/) |

## Session Continuity

Last session: 2026-02-18
Stopped at: Completed quick-58 (add perspective toggle button to score region editor)
Resume file: None
Next: All plans complete (42/42)
