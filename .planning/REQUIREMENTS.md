# Requirements: Manuscript Renderer v2.0

**Defined:** 2026-02-11
**Core Value:** Scores render correctly and efficiently -- high-quality engraving with smooth playback, even on long scores.

## v2.0 Requirements

Requirements for Next.js migration and Firebase integration. Each maps to roadmap phases.

### Migration

- [ ] **MIG-01**: App runs on Next.js 16 App Router replacing Vite SPA
- [ ] **MIG-02**: Verovio WASM loads correctly in client-only boundary (dynamic ssr:false)
- [ ] **MIG-03**: All existing editor functionality preserved after migration (rendering, playback, animation, sync)
- [ ] **MIG-04**: Environment variables migrated from import.meta.env to process.env/NEXT_PUBLIC_
- [ ] **MIG-05**: Export service integration works from Next.js app

### Authentication

- [ ] **AUTH-01**: User can sign in with Google via Firebase Auth
- [ ] **AUTH-02**: User session persists across browser refresh (httpOnly session cookie)
- [ ] **AUTH-03**: Unauthenticated users are redirected to login page
- [ ] **AUTH-04**: User can sign out

### Projects

- [ ] **PROJ-01**: User can create a new project by uploading score file (xml/musicxml/mxl/mei) and audio file (mp3/wav)
- [ ] **PROJ-02**: Project creation modal shows view mode cards: "Page view" (active) and "Single line" (disabled, "coming soon")
- [ ] **PROJ-03**: Score and audio files are immutable after project creation
- [ ] **PROJ-04**: User sees a dashboard with grid of project cards showing background image thumbnail, project name, and last edited date
- [ ] **PROJ-05**: User can open a project from dashboard to enter the editor
- [ ] **PROJ-06**: User can delete a project from the dashboard

### Storage

- [ ] **STOR-01**: Score files are uploaded to Firebase Storage on project creation
- [ ] **STOR-02**: Audio files are uploaded to Firebase Storage on project creation
- [ ] **STOR-03**: Background images are uploaded to Firebase Storage when set in inspector
- [ ] **STOR-04**: Files are stored under user-scoped paths (users/{uid}/projects/{projectId}/...)
- [ ] **STOR-05**: Firestore security rules enforce ownership (only owner can read/write own projects)
- [ ] **STOR-06**: Storage security rules enforce ownership (only owner can read/write own files)

### Persistence

- [ ] **PERS-01**: All project settings persist to Firestore (score color, scale, font, border, animation options, score region)
- [ ] **PERS-02**: Sync anchors (Map) persist correctly to Firestore via Object.fromEntries/Object.entries serialization
- [ ] **PERS-03**: Changes auto-save with debounce (1500ms) on any project data change
- [ ] **PERS-04**: Save status indicator shows current state (saving/saved/error)
- [ ] **PERS-05**: Project loads all settings from Firestore when opened from dashboard
- [ ] **PERS-06**: Background image URL persists in Firestore and loads on project open

## Future Requirements

Deferred to future milestones. Tracked but not in current roadmap.

### View Modes

- **VIEW-01**: User can create a project with "Single line" view mode
- **VIEW-02**: SingleLineRenderer works with Firebase persistence

### Collaboration

- **COLLAB-01**: User can share a project with other users
- **COLLAB-02**: Multiple users can view the same project simultaneously

### Export Integration

- **EXPORT-01**: Export service authenticates requests via Firebase Auth
- **EXPORT-02**: Export service reads files from Firebase Storage directly

## Out of Scope

| Feature | Reason |
|---------|--------|
| Mobile support | Desktop-first, not in scope for any milestone |
| Email/password auth | Google sign-in only per user requirement |
| Real-time collaboration | High complexity, single-user editing is sufficient |
| Project sharing | Not needed for v2.0, defer to future |
| Offline mode | Firestore offline persistence disabled to keep save status clear |
| Single line view mode | Deferred, shown as "coming soon" in creation modal |
| Fly.io deployment | Deferred from v1.4, export service works locally |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| MIG-01 | Phase 22 | Pending |
| MIG-02 | Phase 22 | Pending |
| MIG-03 | Phase 22 | Pending |
| MIG-04 | Phase 22 | Pending |
| MIG-05 | Phase 22 | Pending |
| AUTH-01 | Phase 23 | Pending |
| AUTH-02 | Phase 23 | Pending |
| AUTH-03 | Phase 23 | Pending |
| AUTH-04 | Phase 23 | Pending |
| PROJ-01 | Phase 24 | Pending |
| PROJ-02 | Phase 24 | Pending |
| PROJ-03 | Phase 25 | Pending |
| PROJ-04 | Phase 24 | Pending |
| PROJ-05 | Phase 24 | Pending |
| PROJ-06 | Phase 24 | Pending |
| STOR-01 | Phase 25 | Pending |
| STOR-02 | Phase 25 | Pending |
| STOR-03 | Phase 25 | Pending |
| STOR-04 | Phase 25 | Pending |
| STOR-05 | Phase 25 | Pending |
| STOR-06 | Phase 25 | Pending |
| PERS-01 | Phase 26 | Pending |
| PERS-02 | Phase 26 | Pending |
| PERS-03 | Phase 26 | Pending |
| PERS-04 | Phase 26 | Pending |
| PERS-05 | Phase 26 | Pending |
| PERS-06 | Phase 26 | Pending |

**Coverage:**
- v2.0 requirements: 27 total
- Mapped to phases: 27
- Unmapped: 0
- Coverage: 100%

---
*Requirements defined: 2026-02-11*
*Last updated: 2026-02-11 after roadmap creation*
