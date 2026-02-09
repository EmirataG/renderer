# Project Research Summary

**Project:** Manuscript Renderer v1.4 - Backend Video Export
**Domain:** Headless browser video export service for browser-based music notation renderer
**Researched:** 2026-02-09
**Confidence:** HIGH

## Executive Summary

Backend video export for browser-based animation tools follows a well-established pattern: headless Chrome captures frame-by-frame screenshots, FFmpeg encodes them into H.264 MP4 with muxed audio, and progress streams back to the client via WebSocket. This architecture is used by Remotion, timecut, and dozens of other tools. The critical insight for Manuscript is that the hard part is already done—the existing `window.animationController.setFrame(frameNumber, fps)` API was specifically designed for Puppeteer integration, providing deterministic, synchronous frame positioning with zero timing dependencies.

The recommended stack is Fastify (HTTP + WebSocket), Puppeteer (headless Chrome), FFmpeg via child_process.spawn (frame encoding), and Docker on Fly.io (deployment). The architecture is a monorepo sibling package that builds and serves the frontend, opens it in Puppeteer, injects all user settings via `evaluateOnNewDocument`, then loops through frames piping each screenshot buffer to FFmpeg's stdin. Zero new frontend dependencies—all additions are backend-only in a separate `export-service/` directory.

The key risks are page virtualization hiding notes during capture, WASM initialization timing races, Chrome process leaks under concurrent renders, and FFmpeg pipe backpressure deadlocks. All are preventable with proper architecture: disable virtualization in render mode, poll for readiness signals, use a browser pool with semaphore-controlled concurrency, and implement drain-aware stdin writes.

## Key Findings

### Recommended Stack

**Core technologies selected for minimal complexity and maximum reliability:**

- **Fastify v5**: HTTP server framework—3-4x faster than Express, built-in TypeScript support, official WebSocket plugin, and included Pino structured logging
- **Puppeteer v24**: Headless Chrome control—industry standard, bundles Chrome for Testing, synchronous `page.evaluate()` for frame-by-frame capture
- **FFmpeg via child_process.spawn**: Video encoding—direct process control, no deprecated wrapper libraries (fluent-ffmpeg is archived), simple stdin pipe for frames
- **Docker on Fly.io**: Deployment—official Puppeteer Docker image as base, auto-stop/auto-start for cost efficiency, scale-to-zero when idle

**Critical decision: NO wrapper library for FFmpeg.** The backend always runs the same FFmpeg command (read PNG frames from stdin, encode H.264 MP4). Direct `spawn()` is simpler, more debuggable, and avoids the archived fluent-ffmpeg dependency.

**Version requirements:** Node.js 22 LTS (required by Fastify v5 and Puppeteer 24), FFmpeg 6.x+ in Docker via apt-get, all Fastify v5 plugins require Node 20+ minimum.

### Expected Features

**Must have (table stakes):**
- Export trigger with settings transfer—all App.tsx state (colors, fonts, scale, region, animation params, sync anchors) must reproduce exactly in headless Chrome
- Deterministic frame-by-frame rendering—output must match browser preview frame-for-frame using existing `setFrame()` API
- Audio muxing into final MP4—score videos are useless without synced audio
- Progress feedback with percentage—export takes 30s-10min, users need deterministic progress (frame 450/900 = 50%)
- Resolution selection (1080p minimum)—users uploading to YouTube expect Full HD
- H.264 MP4 output with universal playback—yuv420p pixel format, faststart flag for streaming
- Error reporting—if export fails (Chrome crash, FFmpeg error, OOM), user must see clear message
- Export validation—prevent export when audio/MusicXML/sync anchors missing

**Should have (differentiators):**
- Resolution presets (720p/1080p/4K)—highest-value, lowest-effort differentiator, just viewport dimensions + FFmpeg scaling
- Estimated export time before starting—users can decide if they want to wait, reduces abandonment
- Frame rate selection (30/60 fps)—already exposed via `window.animationController.getFps()`
- Cancel in-progress export—prevents frustration when users realize settings are wrong

**Defer (v2+):**
- Export queue with status (needs BullMQ + Redis infrastructure)
- Export history / re-download (needs file storage + metadata DB)
- Aspect ratio presets for 9:16 vertical (TikTok/Reels) and 1:1 square (Instagram)
- Concurrent multi-user support (scale later with worker pool)

**Anti-features (explicitly do NOT build):**
- Client-side video encoding—MediaRecorder produces WebM not MP4, audio sync unreliable, Canvas capture misses SVG details
- Real-time export preview—users already have browser preview, adds complexity for zero value
- Pause/resume export—Puppeteer state expensive to serialize, easier to restart from scratch
- Browser-based FFmpeg (ffmpeg.wasm)—10-50x slower than native, memory-constrained

### Architecture Approach

The architecture is a **monorepo sibling package** (`export-service/`) with independent dependencies from the frontend. The backend builds and serves the built frontend, launches Puppeteer, injects settings via `page.evaluateOnNewDocument()`, waits for `window.rendererReady`, then loops through `setFrame(n, fps)` + `page.screenshot()` piping PNG buffers to FFmpeg's stdin for H.264 encoding.

**Major components:**
1. **HTTP Server (Fastify)** — Accept export requests, serve built frontend, CORS, file delivery
2. **JobManager** — Job queue, state machine (queued → preparing → rendering → encoding → complete), cleanup, concurrency limits
3. **Browser (Puppeteer)** — Launch, page setup, state injection via `__EXPORT_CONFIG__`, readiness polling
4. **CaptureLoop** — Frame iteration: `page.evaluate(setFrame)` → `page.screenshot()` → write to FFmpeg stdin
5. **Encoder (FFmpeg)** — Spawn FFmpeg with image2pipe input, H.264 encoding, audio mux, drain-aware backpressure handling
6. **WebSocket Progress** — Stream progress events to client (frame count, percentage, ETA, stage labels)
7. **Frontend RenderApp (new)** — Minimal wrapper that reads `window.__EXPORT_CONFIG__`, injects sync anchors into Zustand store, renders RegularRenderer with all virtualization/transitions disabled

**Data flow:** Client uploads MusicXML + audio + settings → Backend creates job, stores files to temp dir → Returns jobId → Client connects WebSocket → Backend launches Chrome, navigates to `/app?render=true`, waits for readiness → Frame capture loop pipes to FFmpeg stdin → Progress streamed via WebSocket → MP4 served for download → Cleanup temp files.

**Critical integration point:** Settings transfer uses `page.evaluateOnNewDocument()` to inject `window.__EXPORT_CONFIG__` object with all App.tsx state. Sync anchors (Map) serialized as plain object via `Object.fromEntries()`, then reconstructed in frontend via `new Map(Object.entries())`.

### Critical Pitfalls

1. **Page virtualization hides notes during frame capture** — RegularRenderer mounts only visible pages + 1-page buffer. When `setTimestamp()` updates camera, `setVisiblePages()` is a batched React state update—DOM not updated before screenshot. **Solution:** Disable virtualization entirely in render mode with `renderMode` prop, or mount all pages unconditionally. **Impact:** Missing notes in video, blank regions where pages should be. **Phase:** Backend service implementation—MUST resolve before first successful render.

2. **Verovio WASM not ready when Puppeteer starts frame capture** — WASM loads asynchronously, toolkit creation takes 300-1000ms. If Puppeteer calls `window.animationController.setFrame()` before initialization completes, it gets `TypeError: undefined`. **Solution:** Expose `window.rendererReady` flag, poll with `page.waitForFunction()` with generous timeout (30s). Verify event count > 0 before starting. **Impact:** Export crashes with undefined error, or renders with missing music symbols. **Phase:** Backend service implementation—the VERY FIRST integration test.

3. **Chrome process leak and OOM under concurrent renders** — Each export needs 100-300MB of Chrome memory. On 2GB machine, 3+ concurrent Chrome instances cause OOM. Pages that error mid-render without cleanup leave orphaned Chrome processes. **Solution:** Browser pool with semaphore-controlled max concurrency (2 for 2GB machine), always close pages in finally blocks, recycle browser after N renders. **Impact:** OOM kill, all in-progress exports lost, unpredictable crashes. **Phase:** Backend service architecture—design before implementing render endpoint.

4. **FFmpeg pipe backpressure deadlock** — PNG screenshots (100KB-500KB each) written to FFmpeg stdin faster than it can consume. Pipe buffer fills, `write()` returns false. If ignored, Node.js buffers in memory → OOM. If awaited drain without proper FFmpeg startup flags, deadlock. **Solution:** Respect backpressure with drain-aware writes, use `ultrafast` + `zerolatency` FFmpeg presets to minimize startup buffering, or fallback to disk-based frame capture. **Impact:** Export hangs indefinitely, memory grows unbounded, OOM crash. **Phase:** FFmpeg integration—implement correct pipe handling from the start.

5. **CSS transition on camera breaks frame-accurate capture** — RegularRenderer camera has `transition: "transform 200ms ease-out"`. When `setTimestamp()` updates camera position, it animates over 200ms. Puppeteer screenshots immediately, capturing camera mid-transition. **Solution:** Inject `* { transition: none !important; }` in render mode via `page.evaluate()`. **Impact:** Camera lags behind notes by ~200ms, elastic scrolling effect in video. **Phase:** Puppeteer frame capture—add before first test render.

## Implications for Roadmap

Based on research, suggested phase structure groups by technical dependencies and pitfall mitigation:

### Phase 1: Backend Foundation & Settings Transfer
**Rationale:** Must establish data contract between frontend and backend before any rendering. Settings serialization is the foundation—all other phases depend on it.

**Delivers:**
- Fastify HTTP server with CORS, multipart upload, static file serving
- POST /api/export endpoint accepting MusicXML + audio + settings + syncAnchors
- Settings validation (schema, Map serialization round-trip, missing fields)
- Job state management (create jobId, store to temp dir, track lifecycle)
- Shared TypeScript types for ExportRequest, ExportSettings, JobStatus

**Addresses:**
- Settings transfer to backend (FEATURES: table stakes)
- Export validation (FEATURES: table stakes)
- Pitfall #12: Map serialization loses syncAnchors

**Avoids:**
- Starting Puppeteer integration without validated data contract
- Building on top of broken settings transfer

**Research flag:** Standard patterns—Fastify + multipart documented, no phase-specific research needed.

---

### Phase 2: Frontend Render Mode
**Rationale:** Must prepare frontend for headless Chrome before backend can use it. Render mode disables UI, virtualization, and CSS transitions—all prerequisites for frame capture.

**Delivers:**
- `window.__EXPORT_CONFIG__` interface in global.d.ts
- RenderApp.tsx wrapper that injects config, disables UI chrome
- RegularRenderer `renderMode` prop: skips virtualization, removes camera transition, sizes to viewport
- `window.rendererReady` signal for Puppeteer to poll
- Vite build served by backend at `/app`

**Addresses:**
- Deterministic frame-by-frame rendering (FEATURES: table stakes)
- No UI/virtualization for export mode (ARCHITECTURE: render mode wrapper)

**Avoids:**
- Pitfall #1: Page virtualization hides notes
- Pitfall #11: CSS transition breaks frame accuracy
- Pitfall #2: WASM readiness races (readiness signal prevents)

**Research flag:** Codebase modifications—no research, just implementation of known changes.

---

### Phase 3: Puppeteer Integration & Frame Capture
**Rationale:** Core rendering engine. Must wait for Phase 2 (frontend render mode) to complete. This phase is highest-risk for timing issues.

**Delivers:**
- Browser pool with semaphore-controlled concurrency
- Puppeteer launch configuration (Docker-compatible args)
- Page setup: viewport sizing, `evaluateOnNewDocument` for config injection
- Readiness polling: `waitForFunction` for `window.rendererReady` and event count verification
- Frame capture loop: `setFrame(n, fps)` → `page.screenshot({ optimizeForSpeed: true })` → buffer
- Finally-block cleanup for page/browser on error

**Addresses:**
- Deterministic frame-by-frame rendering (FEATURES: table stakes)
- Resolution selection (FEATURES: table stakes via viewport)
- Browser pool and concurrency (ARCHITECTURE: browser manager component)

**Avoids:**
- Pitfall #2: WASM not ready (polls for readiness)
- Pitfall #5: Chrome process leak (browser pool + finally blocks)
- Pitfall #7: Viewport/DPI mismatch (explicit viewport configuration)

**Research flag:** **Needs research** during planning—Puppeteer screenshot performance characteristics, optimal viewport settings for different resolutions, readiness detection heuristics need validation.

---

### Phase 4: FFmpeg Encoding & Audio Mux
**Rationale:** Depends on Phase 3 (frame capture buffers). FFmpeg must consume frames as Puppeteer produces them.

**Delivers:**
- FFmpeg spawn with image2pipe stdin, H.264 encoding, yuv420p pixel format
- Drain-aware backpressure handling for stdin writes
- Audio muxing with `-shortest` flag for duration alignment
- Frame count verification: `Math.ceil(duration * fps)`
- Output file with `-movflags +faststart` for streaming playback

**Addresses:**
- Audio muxing into final MP4 (FEATURES: table stakes)
- H.264 MP4 output (FEATURES: table stakes)
- FFmpeg encoding component (ARCHITECTURE)

**Avoids:**
- Pitfall #4: Frame timing drift (uses frame index, not wall clock)
- Pitfall #6: Pipe backpressure deadlock (drain-aware writes)
- Pitfall #13: Output not web-compatible (correct FFmpeg flags)

**Research flag:** Standard patterns—FFmpeg image2pipe with stdin is well-documented, no phase-specific research needed.

---

### Phase 5: Progress Streaming & Download
**Rationale:** Depends on Phases 3-4 (frame capture and encoding). WebSocket must decouple from job lifecycle to handle disconnections.

**Delivers:**
- @fastify/websocket route at /ws?jobId=xxx
- Progress messages: queued, preparing, rendering (frame/total/percent/eta), encoding, complete
- Stage-weighted progress calculation (preparing 5%, rendering 75%, encoding 15%, muxing 5%)
- Reconnection support with state sync
- HTTP polling fallback: GET /api/export/:jobId/status
- Download endpoint: GET /api/export/:jobId/download

**Addresses:**
- Progress feedback with percentage (FEATURES: table stakes)
- Download delivery (FEATURES: table stakes)
- Error reporting (FEATURES: table stakes)
- WebSocket progress component (ARCHITECTURE)

**Avoids:**
- Pitfall #8: WebSocket drops mid-export (lifecycle decoupled, reconnection support)
- Pitfall #15: Progress inaccuracy (stage-weighted, smoothed updates)

**Research flag:** Standard patterns—WebSocket progress streaming is well-documented, no phase-specific research needed.

---

### Phase 6: Docker Image & Fly.io Deployment
**Rationale:** Depends on all backend functionality (Phases 1, 3-5). Must validate full stack in production environment.

**Delivers:**
- Dockerfile based on `ghcr.io/puppeteer/puppeteer:24` with FFmpeg added
- Font packages (fonts-liberation, fonts-noto) for text rendering
- Multi-stage build to minimize image size
- fly.toml with auto-stop/auto-start, performance-2x machine size
- Pre-launch Chrome at server startup for warm starts
- Temp file cleanup on job completion/error
- Health check endpoint at /health

**Addresses:**
- Containerized deployment (STACK: Docker configuration)
- Fly.io deployment (STACK: Fly.io configuration)
- Download endpoint (ARCHITECTURE: file serving)

**Avoids:**
- Pitfall #3: Missing fonts in Docker (fonts-liberation, fonts-noto installed)
- Pitfall #10: Cold start timeout (suspend mode, pre-launch Chrome)
- Pitfall #14: Temp file cleanup (finally-block cleanup)
- Pitfall #16: Docker image too large (multi-stage build, Puppeteer base image)

**Research flag:** Standard patterns—Puppeteer Docker image and Fly.io deployment are well-documented, no phase-specific research needed.

---

### Phase 7: Resolution Presets & Enhanced UX
**Rationale:** Depends on Phase 5 (basic export working). High-value differentiators that require minimal additional effort.

**Delivers:**
- Resolution presets: 720p (fast), 1080p (default), 4K (via deviceScaleFactor)
- Export time estimation based on frame count × calibrated ms/frame
- Frame rate selection (30/60 fps)
- Cancel in-progress export with cleanup
- Custom output filename

**Addresses:**
- Resolution presets (FEATURES: should have—highest-value differentiator)
- Estimated export time (FEATURES: should have)
- Frame rate selection (FEATURES: should have)
- Cancel export (FEATURES: should have)

**Avoids:**
- Premature optimization (wait until basic export proven)

**Research flag:** Standard patterns—resolution presets are just viewport + FFmpeg scaling, no research needed.

---

### Phase Ordering Rationale

1. **Backend foundation first** (Phase 1) establishes data contract and validates settings transfer—all other phases depend on this working correctly
2. **Frontend render mode** (Phase 2) must precede Puppeteer integration—can't capture frames until render mode exists
3. **Frame capture before encoding** (Phases 3 → 4) follows natural pipeline dependency
4. **Progress streaming after core pipeline** (Phase 5) adds observability to working export
5. **Deployment after functionality** (Phase 6) validates full stack in production
6. **Enhanced UX last** (Phase 7) builds on proven foundation

**Dependency chain:**
- Phase 2 depends on Phase 1 (needs settings schema)
- Phase 3 depends on Phase 2 (needs render mode)
- Phase 4 depends on Phase 3 (needs frame buffers)
- Phase 5 depends on Phases 3-4 (needs job progress to stream)
- Phase 6 depends on all backend phases (deploys complete service)
- Phase 7 depends on Phase 6 (enhances working export)

**Pitfall avoidance strategy:**
- Critical pitfalls (#1, #2, #5, #6, #11, #12) addressed in Phases 1-4 before deployment
- Moderate pitfalls (#8, #15) addressed in Phase 5
- Minor pitfalls (#3, #10, #14, #16) addressed in Phase 6
- No deferred pitfalls—all mitigated before launch

### Research Flags

**Needs research during planning:**
- **Phase 3 (Puppeteer Integration):** Screenshot performance characteristics at different resolutions, optimal viewport configurations, readiness detection heuristics—these need empirical validation during planning

**Standard patterns (skip research-phase):**
- **Phase 1:** Fastify + multipart upload is well-documented
- **Phase 2:** Codebase modifications, no external research needed
- **Phase 4:** FFmpeg image2pipe with stdin is standard approach
- **Phase 5:** WebSocket progress streaming is well-documented
- **Phase 6:** Puppeteer Docker image and Fly.io deployment have official guides
- **Phase 7:** Resolution presets are just configuration changes

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All versions verified on npm/official docs. Fastify v5 + Puppeteer v24 + FFmpeg via spawn is proven architecture. No deprecated dependencies. |
| Features | HIGH | Existing `window.animationController` API explicitly designed for this use case. Table stakes features match industry expectations (Remotion, timecut, musescore.com). |
| Architecture | HIGH | Direct codebase analysis confirms frontend readiness. RegularRenderer.setTimestamp is stateless/synchronous. Monorepo sibling pattern avoids dependency conflicts. |
| Pitfalls | HIGH | Critical pitfalls (#1, #2, #5, #6) verified via codebase analysis and official Puppeteer/FFmpeg docs. Prevention strategies proven by community (timecut, Remotion patterns). |

**Overall confidence:** HIGH

The combination of codebase analysis (existing animationController API designed for Puppeteer), official documentation (Puppeteer v24, Fastify v5, FFmpeg), and proven patterns (Remotion's frame-by-frame approach, timecut's stdin piping) provides strong confidence in the recommended approach. The only areas requiring empirical validation are Phase 3 screenshot performance characteristics and optimal viewport configurations, which can be addressed during phase planning.

### Gaps to Address

**Audio duration without audio element:** Frontend uses `audioRef.current.duration` for duration. In render mode, there is no `<audio>` element. **Mitigation:** Backend runs `ffprobe -v quiet -print_format json -show_format audioFile` to get duration, injects as `exportConfig.audioDuration`. Client also sends duration as hint, backend verifies match.

**Background image injection method:** Two options—base64 data URL (simpler, works for images up to ~5MB) or backend-served HTTP URL (better for large images). **Mitigation:** Start with data URL approach (Option A). If performance suffers with large backgrounds, switch to HTTP serving (Option B) in Phase 7 enhancements.

**Browser pool vs single instance:** Unclear whether to launch one browser per export or maintain a browser pool. **Mitigation:** Start with one browser per export (simplest). Profile memory usage. Add pooling only if startup latency (~2-3s) becomes a bottleneck.

**FFmpeg encoding speed calibration:** Export time estimates depend on ms/frame, which varies by hardware. **Mitigation:** After first few exports, backend calibrates `avgMsPerFrame` for the deployed server hardware. Display "Estimated: ~X minutes" based on calibrated value.

## Sources

### Primary (HIGH confidence)

**Codebase analysis:**
- `src/renderers/RegularRenderer.tsx` — virtualization logic, camera CSS transition, setTimestamp implementation, animationController exposure
- `src/lib/animationController.ts` — frame-by-frame API design, synchronous setFrame/setTimestamp
- `src/hooks/useVerovio.ts` — WASM initialization, font loading, async rendering pipeline
- `src/App.tsx` — complete settings model that must transfer to backend
- `src/types/global.d.ts` — window.animationController interface

**Official documentation:**
- [Puppeteer npm v24.37.2](https://www.npmjs.com/package/puppeteer) — Version verification, changelog
- [Puppeteer Docker Guide](https://pptr.dev/guides/docker) — Official Docker image, required flags, non-root setup
- [Puppeteer ScreenshotOptions API](https://pptr.dev/api/puppeteer.screenshotoptions) — optimizeForSpeed, encoding, type options
- [Puppeteer page.evaluateOnNewDocument](https://pptr.dev/api/puppeteer.page.evaluateonnewdocument) — State injection before page scripts
- [Fastify npm v5.7.4](https://www.npmjs.com/package/fastify) — Version verification
- [Fastify Official Documentation](https://fastify.dev/) — v5 plugin ecosystem, TypeScript support
- [@fastify/websocket npm v11.2.0](https://www.npmjs.com/package/@fastify/websocket) — WebSocket plugin
- [Node.js Releases](https://nodejs.org/en/about/previous-releases) — v22.22.0 LTS verification
- [Node.js crypto.randomUUID](https://nodejs.org/api/crypto.html#cryptorandomuuidoptions) — Built-in UUID generation
- [FFmpeg Documentation](https://ffmpeg.org/ffmpeg.html) — image2pipe, codec options, audio muxing
- [fluent-ffmpeg archived May 2025](https://github.com/fluent-ffmpeg/node-fluent-ffmpeg) — Deprecation confirmation
- [Fly.io Auto-stop/Auto-start](https://fly.io/docs/launch/autostop-autostart/) — Machine lifecycle
- [Fly.io Machine Sizing](https://fly.io/docs/machines/guides-examples/machine-sizing/) — performance-2x specs

### Secondary (MEDIUM confidence)

**Implementation patterns:**
- [Remotion renderMedia() API](https://www.remotion.dev/docs/renderer/render-media) — Progress callbacks, codec options, audio handling
- [Remotion renderFrames() API](https://www.remotion.dev/docs/renderer/render-frames) — Frame-level progress, onFrameUpdate callback
- [timecut GitHub](https://github.com/tungs/timecut) — Virtual time approach for frame-by-frame capture
- [Bannerbear: 8 Tips for Faster Puppeteer Screenshots](https://www.bannerbear.com/blog/ways-to-speed-up-puppeteer-screenshots/) — optimizeForSpeed performance
- [ScreenshotOne: optimizeForSpeed analysis](https://screenshotone.com/blog/optimize-for-speed-when-rendering-screenshots-in-puppeteer-and-chrome-devtools-protocol/) — Chrome DevTools Protocol optimizations
- [Producing Real-time Video with Node.js and FFmpeg](https://ofarukcaki.medium.com/producing-real-time-video-with-node-js-and-ffmpeg-a59ac27461a1) — stdin pipe pattern
- [Puppeteer Cluster](https://github.com/thomasdondorf/puppeteer-cluster) — Browser pool concurrency models
- [The Hidden Cost of Headless Browsers: Memory Leak Journey](https://medium.com/@matveev.dina/the-hidden-cost-of-headless-browsers-a-puppeteer-memory-leak-journey-027e41291367) — Process recycling strategies
- [WebSocket Reliability in Realtime](https://ably.com/topic/websocket-reliability-in-realtime-infrastructure) — Reconnection, keep-alive

### Tertiary (LOW confidence)

**Performance tuning:**
- [Puppeteer Issue #736: Slow screenshots on large viewports](https://github.com/puppeteer/puppeteer/issues/736) — 4K viewport performance concerns
- [Puppeteer Screenshot Frame Artifacts](https://github.com/puppeteer/puppeteer/issues/7530) — Rendering artifacts during capture
- [Smart Interface Design Patterns: Progress UX](https://smart-interface-design-patterns.com/articles/designing-better-loading-progress-ux/) — Progress bar best practices

---

*Research completed: 2026-02-09*
*Ready for roadmap: yes*
