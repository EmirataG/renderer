# Roadmap: Manuscript Renderer

## Milestones

- **v1.0 Migration** - Phases 1-5 (shipped 2015-02-04)
- **v1.1 Efficiency** - Phases 6-9 (shipped 2015-02-05)
- **v1.2 SingleLineRenderer** - Phases 10-13 (paused)
- **v1.3 Performance & Polish** - Phase 14 (shipped 2026-02-09)
- **v1.4 Backend Video Export** - Phases 15-21 (shipped 2026-02-11)
- **v2.0 Next.js Migration & Firebase** - Phases 22-26 (in progress)

## Phases

<details>
<summary>v1.0 Migration (Phases 1-5) - SHIPPED 2015-02-04</summary>

Replaced OSMD rendering engine with Verovio across the entire application. Five phases: Core Verovio Integration, Event System Migration, Sync-Only Playback (inserted), Animation and Camera, SyncEditor Migration. All validated requirements confirmed working. OSMD removal deferred to v1.1 cleanup.

- [x] Phase 1: Core Verovio Integration (2 plans)
- [x] Phase 2: Event System Migration (1 plan)
- [x] Phase 2.1: Sync-Only Playback & SyncEditor Verovio (2 plans, inserted)
- [x] Phase 3: Animation and Camera (completed informally)
- [x] Phase 4: SyncEditor Migration (absorbed into Phase 2.1)
- [x] Phase 5: Validation and Cleanup (completed informally, OSMD removal deferred)

</details>

<details>
<summary>v1.1 Efficiency (Phases 6-9) - SHIPPED 2015-02-05</summary>

Reduced memory usage and improved rendering performance for long scores through paginated rendering, event position caching, and virtual scrolling. Removed legacy OSMD dependency.

- [x] Phase 6: Paginated Rendering & Camera (3 plans)
- [x] Phase 7: Event Position Caching (2 plans)
- [x] Phase 8: Virtual Scrolling (1 plan)
- [x] Phase 9: OSMD Cleanup (1 plan)

</details>

<details>
<summary>v1.2 SingleLineRenderer (Phases 10-13) - PAUSED</summary>

**Milestone Goal:** Add a new renderer that displays scores as a single horizontal line with smooth camera tracking and lazy section loading for performance. Music scrolls beneath a fixed center point while notehead animations highlight active notes.

- [x] **Phase 10: Single-Line Verovio Hook** - Section-based horizontal rendering with Verovio
- [x] **Phase 11: Single-Line Event Extraction** - Extract events with X coordinates and section assignments
- [x] **Phase 12: SingleLineRenderer Core** - Horizontal camera, animation, and smooth scrolling
- [ ] **Phase 13: Section Virtualization** - Lazy section loading with seamless transitions (paused)
- [ ] **Phase 13.1: Unplayed Score Styling** - Visual differentiation of played vs unplayed score regions (paused)

</details>

<details>
<summary>v1.3 Performance & Polish (Phase 14) - SHIPPED 2026-02-09</summary>

Page virtualization for RegularRenderer: only visible pages + buffer mounted in DOM, placeholder divs for unmounted pages, seamless page stacking via adjustPageHeight + viewBox trimming. Removed isRenderMode flag.

- [x] **Phase 14: Page Virtualization** - Camera-driven visible page range, conditional rendering, placeholder divs, seamless page stacking (2 plans)

</details>

<details>
<summary>v1.4 Backend Video Export (Phases 15-21) - SHIPPED 2026-02-11</summary>

Backend export service with Puppeteer frame capture, FFmpeg encoding, WebSocket progress streaming, and Docker deployment. Configurable resolution and framerate with browser UX.

- [x] Phase 15: Backend Foundation & Settings Transfer (3 plans)
- [x] Phase 16: Frontend Render Mode (1 plan)
- [x] Phase 17: Puppeteer Integration & Frame Capture (2 plans)
- [x] Phase 18: FFmpeg Encoding & Audio Mux (1 plan)
- [x] Phase 19: Progress Streaming & Download (2 plans)
- [x] Phase 20: Docker Image & Fly.io Deployment (2 plans)
- [x] Phase 21: Resolution Presets & Enhanced UX (1 plan)

</details>

## v2.0 Next.js Migration & Firebase (In Progress)

**Milestone Goal:** Migrate from Vite SPA to Next.js, add Firebase authentication (Google sign-in), project persistence (Firestore + Storage), a project dashboard, and debounced auto-save. Existing editor functionality preserved unchanged.

**Target features:**
- Next.js 16 App Router replacing Vite SPA (existing React components migrate)
- Google sign-in via Firebase Auth with httpOnly session cookies
- Project creation modal: upload score + audio, choose view mode
- Project dashboard: grid of cards with thumbnails, name, last edited
- All project data persisted: settings in Firestore, files in Firebase Storage
- Debounced auto-save on any change
- Score and audio files immutable after creation; background image changeable anytime

### Phase 22: Next.js Scaffold & Migration

**Goal:** App runs on Next.js 16 App Router with all existing editor functionality preserved.

**Dependencies:** None (foundation phase)

**Requirements:** MIG-01, MIG-02, MIG-03, MIG-04, MIG-05

**Success Criteria** (what must be TRUE):
1. App loads in browser via Next.js dev server with Turbopack bundler
2. Verovio WASM loads and renders MusicXML to SVG inside a client-only boundary (no SSR crashes)
3. All existing editor features work identically to the Vite SPA (rendering, playback, animation, sync, camera, score region)
4. Environment variables use NEXT_PUBLIC_ prefix and work in both dev and build
5. Export service communicates with the Next.js app (HTTP/WebSocket integration functional)

**Plans:** 2 plans

Plans:
- [x] 22-01-PLAN.md -- Scaffold Next.js App Router, migrate from Vite, verify dev server and build
- [x] 22-02-PLAN.md -- Create /render route for export service, human-verify full functional parity

### Phase 22.1: Self-Contained Export Service (INSERTED)

**Goal:** Export service bundles its own rendering page internally. Puppeteer navigates to its own server instead of the frontend. Frontend /render route and RenderApp.tsx removed.
**Depends on:** Phase 22
**Plans:** 2 plans

Plans:
- [x] 22.1-01-PLAN.md -- Create standalone vanilla JS rendering page with shared animation module, border generator, and esbuild build tooling
- [x] 22.1-02-PLAN.md -- Wire standalone page into Fastify server, update Puppeteer config, delete frontend /render route and RenderApp.tsx, human-verify export pipeline

### Phase 23: Firebase Authentication

**Goal:** Users can securely sign in with Google and access protected pages.

**Dependencies:** Phase 22 (needs Next.js app running)

**Requirements:** AUTH-01, AUTH-02, AUTH-03, AUTH-04

**Success Criteria** (what must be TRUE):
1. User can sign in with their Google account from a login page
2. User session persists across browser refresh without re-authentication (httpOnly session cookie)
3. Unauthenticated users visiting any editor or dashboard page are redirected to the login page
4. User can sign out and is returned to the login page

**Plans:** 2 plans

Plans:
- [x] 23-01-PLAN.md -- Install Firebase SDKs, create client/admin singletons, session Route Handler, and login page with Google sign-in
- [ ] 23-02-PLAN.md -- Add proxy.ts route protection, sign-out button, and human-verify complete auth flow

### Phase 24: Project Dashboard & CRUD

**Goal:** Users can create, browse, open, and delete projects from a dashboard.

**Dependencies:** Phase 23 (needs authenticated user identity for project ownership)

**Requirements:** PROJ-01, PROJ-02, PROJ-04, PROJ-05, PROJ-06

**Success Criteria** (what must be TRUE):
1. User can create a new project by uploading a score file and audio file through a creation modal
2. Creation modal shows "Page view" as active and "Single line" as disabled with "coming soon" label
3. User sees a dashboard with a grid of project cards showing background image thumbnail, project name, and last edited date
4. User can click a project card to open the editor with that project loaded
5. User can delete a project from the dashboard and it is permanently removed

**Plans:** 3 plans

Plans:
- [x] 24-01-PLAN.md -- Data layer: Project types, Firestore singleton, file validation extensions, and CRUD API Route Handlers
- [x] 24-02-PLAN.md -- Route restructuring: dashboard at /, editor at /project/[id], Toast action support, MEI validation
- [x] 24-03-PLAN.md -- Dashboard UI: project grid, CreateProjectModal (two-step), ProjectCard, delete with undo, human-verify

### Phase 25: Firebase Storage & File Persistence

**Goal:** All project files persist in Firebase Storage with user-scoped security.

**Dependencies:** Phase 24 (needs project documents in Firestore to store file URLs)

**Requirements:** STOR-01, STOR-02, STOR-03, STOR-04, STOR-05, STOR-06, PROJ-03

**Success Criteria** (what must be TRUE):
1. Score and audio files upload to Firebase Storage during project creation and are retrievable across sessions
2. Background images upload to Firebase Storage when set in the inspector and persist across sessions
3. All files are stored under user-scoped paths (users/{uid}/projects/{projectId}/...)
4. Score and audio files cannot be changed or re-uploaded after project creation (immutable)
5. Security rules prevent users from reading or writing other users' files and project documents

**Plans:** 3 plans

Plans:
- [x] 25-01-PLAN.md -- Storage singleton, Project type extension, FormData file uploads in project creation, cascade delete
- [x] 25-02-PLAN.md -- GET project endpoint, project loading in editor, background image upload/replace, immutable score/audio
- [x] 25-03-PLAN.md -- Firestore and Storage security rules, human-verify full end-to-end storage flow

### Phase 26: Auto-Save & Data Persistence

**Goal:** All project data auto-saves seamlessly and loads completely when reopened.

**Dependencies:** Phase 25 (file URLs must be stored before save payload is complete)

**Requirements:** PERS-01, PERS-02, PERS-03, PERS-04, PERS-05, PERS-06

**Success Criteria** (what must be TRUE):
1. Changing any project setting (color, scale, font, border, animation options, score region) auto-saves to Firestore after a brief pause
2. Sync anchors (sparse Map data) persist correctly and restore with the same values when reopened
3. Save status indicator shows "Saving...", "Saved", or "Error" reflecting the current save state
4. Opening a project from the dashboard loads all settings, anchors, and background image exactly as last saved
5. Background image URL persists in Firestore and the image loads visually when the project is reopened

**Plans:** 2 plans

Plans:
- [ ] 26-01-PLAN.md -- Data layer: projectStore (Zustand), extended Project type, subscribeWithSelector on syncStore, PATCH endpoint
- [ ] 26-02-PLAN.md -- Auto-save engine, App.tsx settings migration to projectStore, settings loading from API, SaveIndicator

## Progress

| Phase | Status | Plans | Completion |
|-------|--------|-------|------------|
| 22 - Next.js Scaffold & Migration | ✓ Complete (2026-02-11) | 2/2 | 100% |
| 22.1 - Self-Contained Export Service | ✓ Complete (2026-02-11) | 2/2 | 100% |
| 23 - Firebase Authentication | Planned | 0/2 | 0% |
| 24 - Project Dashboard & CRUD | ✓ Complete (2026-02-11) | 3/3 | 100% |
| 25 - Firebase Storage & File Persistence | ✓ Complete (2026-02-11) | 3/3 | 100% |
| 26 - Auto-Save & Data Persistence | Planned | 0/2 | 0% |

**Milestone v2.0 Coverage:**
- Total requirements: 27
- Mapped to phases: 27
- Unmapped: 0
- Coverage: 100%
