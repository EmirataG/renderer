# Roadmap: Manuscript Renderer

## Milestones

- **v1.0 Migration** - Phases 1-5 (shipped 2015-02-04)
- **v1.1 Efficiency** - Phases 6-9 (shipped 2015-02-05)
- **v1.2 SingleLineRenderer** - Phases 10-13 (paused)
- **v1.3 Performance & Polish** - Phase 14 (shipped 2026-02-09)
- **v1.4 Backend Video Export** - Phases 15-21 (in progress)

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

## v1.4 Backend Video Export (In Progress)

**Milestone Goal:** Deploy a backend service that renders the exact preview animation in a headless browser, captures frames, and encodes to MP4 for download.

**Target features:**
- Export button in browser UI sends all settings + data to backend
- Headless Chromium replays animation frame-by-frame via existing animationController API
- FFmpeg encodes frames to MP4 at user-configurable resolution/framerate
- WebSocket streams real-time progress back to browser
- Direct download when rendering completes
- Multiple concurrent exports supported
- Deployed on Fly.io with Docker (Chrome + FFmpeg)

### Phase 15: Backend Foundation & Settings Transfer

**Goal:** Backend server accepts export requests with complete settings transfer from frontend.

**Dependencies:** None (first phase)

**Requirements:** SRV-01, SRV-02, SRV-04

**Plans:** 3 plans

Plans:
- [ ] 15-01-PLAN.md -- Scaffold export-service project with TypeBox schema, validation, and shared types
- [ ] 15-02-PLAN.md -- Fastify server, multipart export route, job manager, temp file lifecycle
- [ ] 15-03-PLAN.md -- Frontend export client utility and end-to-end contract verification

**Success Criteria:**
1. User can trigger export from browser, backend receives MusicXML + audio + all settings via multipart upload
2. Backend validates settings (schema, Map serialization, missing fields) and rejects incomplete exports with clear error message
3. Backend creates unique jobId and stores uploaded files to temporary directory
4. Backend cleans up temporary files after export completion or failure

### Phase 16: Frontend Render Mode

**Goal:** Frontend can run in headless Chrome with all virtualization and transitions disabled for frame capture.

**Dependencies:** Phase 15 (needs settings schema from backend)

**Requirements:** RND-02, RND-03, RND-04

**Success Criteria:**
1. Frontend reads `window.__EXPORT_CONFIG__` and injects all settings (score region, colors, fonts, animation params, sync anchors) into application state
2. Frontend disables page virtualization in render mode (all pages mounted for complete score visibility)
3. Frontend disables CSS transitions in render mode (camera moves instantly without animation)
4. Frontend exposes `window.rendererReady` signal that backend can poll before starting frame capture

### Phase 17: Puppeteer Integration & Frame Capture

**Goal:** Backend captures animation frames using headless Chrome with exact preview output.

**Dependencies:** Phase 16 (needs render mode frontend)

**Requirements:** SRV-03, RND-01

**Success Criteria:**
1. Backend launches headless Chrome with browser pool managing concurrent exports (max 2-3 concurrent)
2. Backend injects export config via `evaluateOnNewDocument`, waits for `rendererReady` signal, verifies event count > 0
3. Backend captures each frame by calling `setFrame(n, fps)` then `page.screenshot()`, producing PNG buffers matching preview exactly
4. Backend closes browser/page in finally blocks to prevent process leaks on error

### Phase 18: FFmpeg Encoding & Audio Mux

**Goal:** Backend encodes captured frames to H.264 MP4 with synced audio.

**Dependencies:** Phase 17 (needs frame capture buffers)

**Requirements:** VID-01, VID-02, VID-03

**Success Criteria:**
1. Backend spawns FFmpeg process reading PNG frames from stdin, encoding to H.264 MP4 with yuv420p pixel format
2. Backend muxes original audio file into MP4 with correct sync (duration matches video)
3. Backend writes MP4 with faststart flag enabled for streaming playback
4. Backend handles FFmpeg backpressure with drain-aware stdin writes to prevent memory bloat

### Phase 19: Progress Streaming & Download

**Goal:** User sees real-time export progress and downloads completed MP4.

**Dependencies:** Phases 17-18 (needs frame capture and encoding pipeline)

**Requirements:** PRG-01, PRG-02, PRG-03, PRG-04

**Success Criteria:**
1. User connects to WebSocket and receives real-time progress updates (frame count, percentage, stage labels)
2. User can download completed MP4 directly from browser via download endpoint
3. User sees clear error message in browser when export fails (Chrome crash, FFmpeg error, validation failure)
4. User can cancel in-progress export, backend stops frame capture and cleans up resources
5. WebSocket supports reconnection with state sync if connection drops mid-export

### Phase 20: Docker Image & Fly.io Deployment

**Goal:** Backend service deployed on Fly.io with full production infrastructure.

**Dependencies:** All backend phases (15, 17-19)

**Requirements:** DEP-01, DEP-02

**Success Criteria:**
1. Docker image builds successfully based on Puppeteer base image with FFmpeg and fonts installed
2. Backend deploys to Fly.io with auto-stop/auto-start enabled for cost efficiency when idle
3. Backend survives cold starts with acceptable latency (< 30s from idle to first frame capture)
4. Backend successfully exports video end-to-end in production environment (upload -> capture -> encode -> download)

### Phase 21: Resolution Presets & Enhanced UX

**Goal:** Users can configure export resolution and framerate with time estimation.

**Dependencies:** Phase 20 (needs working production export)

**Requirements:** CFG-01, CFG-02, UI-01, UI-02

**Success Criteria:**
1. User selects resolution preset (720p, 1080p, 4K) before export, backend applies correct viewport dimensions
2. User selects frame rate (30 or 60 fps), backend captures at specified rate
3. User sees estimated export time before starting based on frame count and calibrated performance data
4. User sees export button in browser that triggers export with current settings
5. User sees progress displayed in browser during rendering with percentage and stage information

## Progress

| Phase | Status | Plans | Tasks | Completion |
|-------|--------|-------|-------|------------|
| 15 - Backend Foundation & Settings Transfer | Planned | 0/3 | 0/6 | 0% |
| 16 - Frontend Render Mode | Pending | 0/? | 0/? | 0% |
| 17 - Puppeteer Integration & Frame Capture | Pending | 0/? | 0/? | 0% |
| 18 - FFmpeg Encoding & Audio Mux | Pending | 0/? | 0/? | 0% |
| 19 - Progress Streaming & Download | Pending | 0/? | 0/? | 0% |
| 20 - Docker Image & Fly.io Deployment | Pending | 0/? | 0/? | 0% |
| 21 - Resolution Presets & Enhanced UX | Pending | 0/? | 0/? | 0% |

**Milestone v1.4 Coverage:**
- Total requirements: 21
- Mapped to phases: 21
- Unmapped: 0
- Coverage: 100%
