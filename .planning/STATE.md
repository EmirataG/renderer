# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-09)

**Core value:** Scores render correctly and efficiently -- high-quality engraving with smooth playback, even on long scores.
**Current focus:** v1.4 Backend Video Export

## Current Position

Phase: 20 - Docker & Fly.io Deployment
Plan: 1 of 2
Status: In Progress
Last activity: 2026-02-11 - Completed quick task 41: Fix score region glitch by disabling zoom/pan during editing

Progress: [#####-----] 1/2 plans

## Performance Metrics

**Velocity:**

- Total plans completed: 29
- Average duration: 2.3 min
- Total execution time: 66 min

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

_Updated after each plan completion_

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.

- 15-01: Placed export-service/ inside renderer repo (git root is renderer/, not Manuscript/)
- 15-01: Used TypeBox for single-source schema + type derivation (eliminates drift)
- 15-02: Audio files streamed to disk via pipeline() (not buffered in memory)
- 15-02: Fastify multipart plugin rejects non-multipart at plugin level (406)
- 15-03: ExportRequest accepts raw Map and serializes via Object.fromEntries() internally
- 15-03: MusicXML sent as Blob file (not text field) to avoid 1MB field size limit
- 16-01: propAudioDuration naming to avoid shadowing state variable audioDuration
- 16-01: Virtualization bypass via extractionDoneRef staying false (reuses existing mount condition)
- 16-01: Dynamic import() in main.tsx for code splitting (RenderApp and App in separate chunks)
- 17-01: generic-pool for browser pooling with testOnBorrow validation
- 17-01: decorateReply: false on @fastify/static to avoid plugin conflicts
- 17-01: frontendDistPath resolved via import.meta.dirname for ESM compatibility
- 17-02: Frame buffers collected in memory for Phase 17; Phase 18 will pipe to FFmpeg stdin
- 17-02: evaluateOnNewDocument called BEFORE page.goto() for config injection ordering
- 17-02: (job as any) cast for frameBuffers to avoid premature ExportJob type changes
- 18-01: Direct child_process.spawn over fluent-ffmpeg (archived May 2025)
- 18-01: Two-step encode+mux: stdin piping for frames, then separate mux pass for audio
- 18-01: CRF 18 veryfast preset for visually lossless quality on score animations (changed from medium in quick-24)
- 18-01: Always transcode audio to AAC (simplicity over conditional codec copy)
- 19-01: EventEmitter over callback pattern for decoupled progress consumption
- 19-01: 250ms throttle interval (4 events/sec max) to prevent WebSocket flood
- 19-01: Progress state stored on ExportJob for reconnection sync (not just emitted)
- 19-01: Double abort check in captureFrames (before evaluate AND before screenshot)
- 19-02: Side-effect import '@fastify/websocket' for type augmentation in route files
- 19-02: Params cast on websocket route (generic type param breaks overload matching)
- 19-02: createReadStream + manual headers for download (decorateReply: false prevents sendFile)
- 20-01: Pin Puppeteer Docker image to 24.37.2 matching project puppeteer dependency
- 20-01: PUPPETEER_SKIP_DOWNLOAD=true to use base image Chrome (avoid 300MB re-download)
- 20-01: pptruser for runtime security (non-root Chrome execution)

### Roadmap Evolution

- Phase 13.1 reverted -- unplayed styling feature did not work correctly
- Phase 15 (Playhead Cursor) removed from v1.3 before shipping

### Pending Todos

None.

### Blockers/Concerns

None.

## Session Continuity

Last session: 2026-02-11
Stopped at: Completed quick-41 (fix score region glitch - disable zoom/pan during editing)
Resume file: None
Next: 20-02-PLAN.md (fly.toml and deployment)

### Quick Tasks Completed

- quick-002: Smooth camera interpolation using lerp() - removes CSS transition stuttering
- quick-003: Staff line vertical alignment across sections using Y offset extraction (REVERTED in quick-004)
- quick-004: Revert quick-003 staff alignment + add music font selector to inspector
- quick-005: Fix music font selector - add fontLoadAll: true to Verovio hooks
- quick-006: Revert Phase 13.1 (Unplayed Score Styling) - feature didn't work correctly
- quick-007: Performance optimizations - useMemo CSS, binary search timeline, useShallow Zustand, pre-compiled regex
- quick-009: Fix export video - dynamic viewport from bg image, full-frame render mode sizing, cubic ease-in-out camera interpolation
- quick-010: Fix squished export (scoreRegion scaling), JPEG screenshots, 30fps default
- quick-011: Fix stale dist -- export was loading Feb 9 build; add FRONTEND_URL config for dev
- quick-012: CSS scale from WIDTH=980 matching reference app pattern -- score, borders, region all scale correctly
- quick-012b: Fix export camera -- simulate CSS transition on post-clamp cameraY to match preview discrete motion model
- quick-013: Fix export camera coordinate mismatch -- getBoundingClientRect includes CSS scale but pageOffsets don't; normalize with domScale
- quick-014: Remove inspector controls (shadow, hide unplayed, smooth reveal, audio preview) + enlarge sync play/pause icons
- quick-015: Fix export ENOENT -- musicXml file lookup by prefix instead of hardcoded .xml extension
- quick-016: Fix preview overflow (overflow-hidden on content area) + sticky export bar at sidebar bottom
- quick-017: Fix preview scroll (overflow-auto not overflow-hidden) + min-h-0 on sidebar content for visible export bar
- quick-018: Fix preview top clipping (m-auto centering instead of flex items-center) + overflow-hidden on aside
- quick-019: Sticky bottom playback bar in SyncEditor (min-h-0 on score, flex-shrink-0 on controls)
- quick-020: Portal transport bar (Play/Pause/Reset) from RegularRenderer to sticky bottom of preview view via createPortal
- quick-021: React.memo on RegularRenderer -- export progress re-renders killed notehead CSS transitions via dangerouslySetInnerHTML style tag replacement
- quick-022: ScoreRegionEditor grunge styling + fixed-position buttons at viewport bottom
- quick-023: Exact CSS cubic-bezier(0, 0, 0.58, 1) evaluator replaces power-curve approximation in export camera easing
- quick-024: FFmpeg preset medium → veryfast for 3-5x faster export encoding
- quick-025: Delta-based notehead animation in export -- O(active_window) per-frame DOM mutations instead of O(N) reset-all
- quick-030: Resize reset button (w-12 h-12) + anchor action buttons with monotonic timestamp validation
- quick-031: Fix sync header -- remove legacy anchor label, constant h-14 height
- quick-032: Remove event boxes from sync view, show only Remove Anchor when anchored
- quick-035: Revert 33/34, unified coloring effect + measure-once container width
- quick-036: CSS-based anchor/selection coloring + [&_svg]:max-w-none fixed scaling
- quick-037: w-fit on scoreRef so score container scrolls instead of compressing SVG
- quick-038: Fix invisible SVG -- fixed pixel width on scoreRef instead of w-fit
- quick-039: Hide instrument labels checkbox in inspector + CSS display:none on .label, threaded through export pipeline
- quick-040: Extend hideLabels CSS to also hide .labelAbbr (abbreviated instrument labels) in both renderers
- quick-041: Fix score region glitch -- disable zoom/pan during region editing, reset to 1x on entry via TransformWrapper ref
