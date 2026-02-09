# Feature Landscape: Backend Video Export Service

**Domain:** Server-side video rendering from browser-based animated music score
**Researched:** 2026-02-09
**Confidence:** HIGH (architecture verified against existing codebase, industry patterns well-documented)

## Executive Summary

Backend video export for browser-based animation tools follows a well-established pattern: user triggers export with settings, backend spawns headless browser, steps through animation frame-by-frame capturing screenshots, FFmpeg encodes frames into MP4 with muxed audio, and the user downloads the result. This is exactly the approach Remotion, timecut, musescore.com, and dozens of other tools use.

The key insight for Manuscript is that the hard part is already done. The existing `window.animationController` API (`setFrame`, `setTimestamp`, `getDuration`, `isAnimationReady`) was specifically designed for Puppeteer integration. The backend service needs to: load the renderer with settings, wait for `isAnimationReady()`, loop through frames calling `setFrame(n, fps)` + `page.screenshot()`, then pipe frames to FFmpeg with the audio file.

The UX features that matter most are: deterministic progress reporting (users must see "frame 450/900 - 50%"), resolution presets (1080p default, 720p fast, 4K premium), and reliable error recovery. The features that do NOT matter: real-time preview of the export, pause/resume of export jobs, or client-side rendering fallbacks.

---

## Table Stakes

Features users expect from any video export in an animation tool. Missing any of these makes the product feel broken or amateur.

| Feature | Why Expected | Complexity | Depends On |
|---------|--------------|------------|------------|
| **Export trigger button** | Users need a clear "Export Video" action in the UI | Low | Settings serialization |
| **Settings transfer to backend** | All customizations (colors, fonts, scale, region, animation timing, sync anchors) must reproduce exactly | Medium | Existing App.tsx state model |
| **Deterministic frame-by-frame rendering** | Output must match browser preview frame-for-frame; no timing drift | Medium | Existing `window.animationController.setFrame()` |
| **Audio muxing into final MP4** | Score videos are useless without the synced audio track | Low | FFmpeg `-i audio -i video` merge |
| **Progress feedback with percentage** | Export takes 30s-10min; users need to know it is working and how far along | Medium | SSE or polling from backend |
| **Resolution selection (at least 1080p)** | Users uploading to YouTube/social expect Full HD minimum | Low | Puppeteer viewport sizing |
| **H.264 MP4 output** | Universal playback compatibility; every platform accepts H.264 MP4 | Low | FFmpeg libx264 encoding |
| **Download delivery** | User must receive the final MP4 file | Low | HTTP file response or presigned URL |
| **Error reporting** | If export fails (Chrome crash, FFmpeg error, OOM), user must see a clear message | Medium | Error boundary + job status tracking |
| **Export validation** | Prevent export when required data is missing (no audio, no MusicXML, no sync anchors) | Low | Frontend validation before API call |

### Settings That Must Transfer

Based on analysis of `App.tsx` state (lines 22-111), the following settings define the visual output and must be sent to the backend:

| Setting Category | Specific Settings | Source |
|-----------------|-------------------|--------|
| **Files** | MusicXML content, audio file, background image | File uploads |
| **Score appearance** | `scoreColor`, `scoreScale`, `musicFont`, `scoreShadowDistance`, `scoreBorder` | App.tsx state |
| **Score region** | `scoreRegion` (x, y, width, height percentages) | ScoreRegionEditor |
| **Note animation** | `activeNoteheadColor`, `activeNoteheadScale`, `activeNoteheadEntryMs`, `activeNoteheadHoldMs`, `activeNoteheadExitMs`, `colorFullNote` | App.tsx state |
| **Playback** | `fps`, `hideUnplayedNotes`, `smoothReveal` | App.tsx state |
| **Sync data** | `anchors` Map from useSyncStore | Zustand store |
| **Renderer mode** | `renderer=single-line` query param | URL param |

### Progress Feedback Specification

Based on research of Remotion's `onFrameUpdate` callback and UX best practices for long-running tasks:

**Required progress data points:**
- Current frame number / total frames (e.g., "Frame 450 / 900")
- Percentage complete (deterministic: `currentFrame / totalFrames * 100`)
- Elapsed time
- Estimated time remaining (computed from frames-per-second throughput)
- Current stage label: "Preparing...", "Rendering frames...", "Encoding video...", "Muxing audio...", "Complete"

**UX requirements:**
- Progress bar must be determinate (not a spinner) once rendering starts
- Progress percentage must increase monotonically (never go backward)
- Allow user to continue using the application while export runs in background
- Show a non-blocking notification/toast when export completes

**Transport mechanism:** Server-Sent Events (SSE) is the recommended approach. SSE is unidirectional (server to client), works over standard HTTP, auto-reconnects on connection drop, and is simpler than WebSockets for this use case. The backend sends progress events; the frontend renders them.

---

## Differentiators

Features that set the product apart. Not expected by users, but valued and impressive when present.

| Feature | Value Proposition | Complexity | Depends On |
|---------|-------------------|------------|------------|
| **Resolution presets** (720p/1080p/4K) | Users can choose quality vs. speed tradeoff; 4K for professional use | Low | Viewport + FFmpeg scaling |
| **Estimated export time before starting** | Users can decide if they want to wait; reduces abandonment | Low | Frame count x avg ms/frame benchmark |
| **Frame rate selection** (30/60 fps) | 60fps for smooth playback; 30fps for smaller files | Low | Already exposed via `window.animationController.getFps()` |
| **Export queue with status** | Multiple exports can be queued; user sees all job statuses | Medium | BullMQ job queue + Redis |
| **Cancel in-progress export** | User can abort if they realize settings are wrong | Medium | Job cancellation + cleanup |
| **Concurrent export jobs** | Multiple users (or same user) can export simultaneously | Medium | Worker pool + resource limits |
| **JPEG frame capture mode** | 2-5x smaller frame files = faster disk I/O during capture | Low | Puppeteer `screenshot({ type: 'jpeg', quality: 95 })` |
| **Custom output filename** | User can name their exported file | Low | Frontend input, passed to download |
| **Export history** | User can re-download previously exported videos | Medium | File storage + metadata DB |
| **Bitrate control** | Advanced users want to control output file size | Low | FFmpeg CRF or bitrate params |
| **Aspect ratio presets** | 16:9 (YouTube), 9:16 (TikTok/Reels), 1:1 (Instagram) | Medium | Viewport + crop/padding logic |

### Differentiator Analysis

**Resolution presets** are the highest-value, lowest-effort differentiator. Implementation is just changing the Puppeteer viewport dimensions and FFmpeg output scaling. Users who create content for YouTube (1080p), Instagram (1080x1080), or professional presentations (4K) will expect this.

**Estimated export time** is surprisingly impactful for UX. Before the user commits to waiting, show "Estimated: ~2 minutes for 1080p, 30fps, 180 seconds of audio." This is calculable from: `(audioDuration * fps) * avgMsPerFrame`. After a few exports, the backend can calibrate `avgMsPerFrame` for the server hardware.

**Cancel in-progress export** prevents frustration. Users frequently realize they forgot to change a color or the wrong audio file was uploaded. Without cancel, they must wait for the full export to complete before trying again. Implementation: Remotion uses `cancelSignal` pattern; for custom Puppeteer loop, check a `cancelled` flag between frames.

**Aspect ratio presets** would be a strong differentiator for social media content creators. Most music animation competitors only output 16:9. Supporting 9:16 vertical video for TikTok/Reels and 1:1 square for Instagram would be unique.

---

## Anti-Features

Features to explicitly NOT build. Common mistakes in this domain.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Client-side video encoding** | Browsers cannot reliably encode H.264 MP4 with audio mux; MediaRecorder produces WebM with inconsistent quality; massive CPU usage freezes the UI | Server-side rendering with Puppeteer + FFmpeg |
| **Real-time export preview** | Attempting to show a live preview of the rendering process adds massive complexity for zero user value (they already have the browser preview) | Show frame count progress and estimated time |
| **Pause/resume export** | Puppeteer browser state is expensive to serialize/restore; frames on disk are cheap; easier to restart than pause | Cancel and restart from scratch if needed |
| **WebM output format** | Limited platform support compared to MP4; YouTube re-encodes anyway; Safari/iOS playback issues | H.264 MP4 only (add codecs later if requested) |
| **Client-side frame capture** | `canvas.toBlob()` or `html2canvas` cannot capture SVG animations with the fidelity of a real browser; font rendering differs; shadows/borders break | Puppeteer headless Chrome for pixel-perfect capture |
| **Export without audio** | Score animation videos without audio are nearly useless; the sync IS the product | Require audio file before enabling export; export button disabled without audio |
| **Real-time streaming export** | Streaming partial video while encoding is technically possible but adds massive complexity (fragmented MP4, HLS) for minimal benefit | Complete the full render, then deliver the file |
| **Automatic social media upload** | OAuth integrations with YouTube/TikTok/Instagram are maintenance nightmares; API changes constantly; authentication UX is complex | Provide downloadable MP4; user uploads to their platform |
| **Lossless/ProRes output** | File sizes are enormous (10-50x larger); users creating social media content do not need broadcast-quality codecs | H.264 with quality presets (CRF 18-23) covers all use cases |
| **Browser-based FFmpeg (ffmpeg.wasm)** | Too slow for production use (10-50x slower than native FFmpeg); WASM has memory limits; no hardware acceleration | Native FFmpeg on the server |
| **Per-frame retry logic** | If a single frame fails to render, retrying that one frame adds complexity and may produce visual discontinuity; better to fail fast | Retry the entire export job if it fails; individual frame failures indicate a systemic issue |

### Anti-Pattern Deep Dive: Client-Side Encoding

The most common mistake in this domain is attempting to encode video client-side using MediaRecorder or ffmpeg.wasm. Here is why this fails for Manuscript specifically:

1. **MediaRecorder produces WebM, not MP4.** Converting WebM to MP4 client-side requires ffmpeg.wasm, which is 10-50x slower than native.
2. **Audio sync is unreliable.** MediaRecorder captures real-time, meaning any browser jank (GC pause, layout thrash) causes dropped frames and audio drift.
3. **Canvas capture misses SVG details.** The Verovio SVG rendering uses DOM elements (`<use>`, `<g>`, inline styles) that `html2canvas` cannot faithfully reproduce.
4. **The existing `window.animationController` API was designed for server-side capture.** It provides deterministic, frame-accurate positioning specifically for Puppeteer to call synchronously and screenshot.

The server-side approach with Puppeteer is not just better -- it is the architecture the existing codebase was built for.

---

## Feature Dependencies

```
Audio File (required)
MusicXML File (required)
Sync Anchors (required)
    |
    v
Settings Serialization (gather all App.tsx state)
    |
    v
Export API Endpoint (receives settings + files)
    |
    +---> Job Queue (BullMQ + Redis)
    |         |
    |         v
    |     Worker Process
    |         |
    |         +---> Puppeteer: Load renderer page with settings
    |         |         |
    |         |         v
    |         |     Wait for isAnimationReady() === true
    |         |         |
    |         |         v
    |         |     Frame Loop: setFrame(n, fps) -> screenshot()
    |         |         |
    |         |         +---> SSE Progress Events to client
    |         |         |
    |         |         v
    |         |     FFmpeg: Encode frames to video
    |         |         |
    |         |         v
    |         |     FFmpeg: Mux audio into MP4
    |         |
    |         v
    |     Store output MP4
    |
    v
Download Endpoint (serve MP4 to client)
```

**Critical Path:**
1. Settings serialization (must capture ALL state from App.tsx)
2. Backend API + job queue
3. Puppeteer frame capture loop (core render engine)
4. FFmpeg encoding + audio mux
5. Progress reporting (SSE)
6. File delivery

**Dependency chain:**
- Export validation depends on: settings serialization
- Frame capture depends on: Puppeteer loading the renderer page with correct settings
- FFmpeg encoding depends on: frame capture completing
- Audio mux depends on: FFmpeg encoding completing + having the audio file
- Download depends on: audio mux completing
- Progress reporting is parallel to frame capture (reports as frames complete)

---

## MVP Recommendation

For Backend Video Export v1.0, prioritize in this order:

### Must Have (Table Stakes)

1. **Settings serialization** -- Gather all App.tsx state into a JSON payload; this is the contract between frontend and backend
2. **Export API endpoint** -- POST endpoint that accepts settings + files, returns job ID
3. **Puppeteer frame capture loop** -- Load renderer page, inject settings via URL params or `page.evaluate`, loop `setFrame(n) -> screenshot()` for all frames
4. **FFmpeg frame encoding** -- Pipe screenshots to FFmpeg as image sequence, encode H.264 MP4
5. **Audio muxing** -- FFmpeg merges audio track into the video MP4
6. **Progress via SSE** -- Stream frame progress to frontend during render
7. **Download endpoint** -- Serve completed MP4 to user
8. **Error handling** -- Clear error messages for: Chrome crash, FFmpeg failure, missing files, timeout
9. **Export validation** -- Disable export button when audio/XML/anchors missing; show why
10. **1080p default resolution** -- 1920x1080 viewport for Puppeteer

### Should Have (High-Value Differentiators)

11. **Resolution presets** -- 720p (fast), 1080p (default), 4K (quality)
12. **Cancel export** -- Abort in-progress job, clean up temp files
13. **Export time estimate** -- Show estimated duration before user starts
14. **30/60 FPS selection** -- Let user choose frame rate

### Defer to Later

- Export queue with multiple concurrent jobs (needs Redis infrastructure)
- Export history / re-download
- Aspect ratio presets (9:16, 1:1)
- Custom filename
- Bitrate control
- Concurrent multi-user support (scale later)

---

## Rendering Pipeline Specification

Based on analysis of the existing `window.animationController` API and Puppeteer screenshot best practices.

### Frame Capture Strategy: Deterministic Stepping (Not Real-Time)

The existing animationController uses **virtual time**, not wall-clock time. Puppeteer calls `setFrame(frameNumber, fps)` which internally calls `setTimestamp(frameNumber / fps)`. This positions the animation deterministically -- no timing drift, no dropped frames, no jank.

**Capture loop pseudocode:**
```
totalFrames = duration * fps
for frame = 0 to totalFrames:
    page.evaluate(window.animationController.setFrame(frame, fps))
    page.screenshot({ path: `frame_${frame}.png` })
    reportProgress(frame, totalFrames)
```

This approach is identical to how Remotion's `renderFrames()` works and how `timecut`/`timesnap` capture animations.

### Screenshot Format Decision

| Format | Speed | File Size | Quality | Recommendation |
|--------|-------|-----------|---------|----------------|
| PNG | Baseline | Large (2-5MB/frame) | Lossless | Use for quality-critical renders |
| JPEG 95% | Same speed* | Small (200-400KB/frame) | Near-lossless | **Default -- best balance** |
| JPEG 80% | Same speed* | Smaller (100-200KB/frame) | Visible artifacts | Only for draft/preview exports |

*Puppeteer screenshot speed is dominated by rendering, not encoding. JPEG vs PNG encoding difference is negligible per Bannerbear benchmarks. However, disk I/O is 5-10x less with JPEG, which matters for long scores.

**Recommendation:** Use JPEG at quality 95 with `optimizeForSpeed: true` as the default. This minimizes disk I/O during the frame capture phase without visible quality loss in the final H.264 encoded output.

### FFmpeg Encoding Command

```bash
ffmpeg -framerate {fps} -i frame_%05d.jpg \
       -i audio.mp3 \
       -c:v libx264 -preset medium -crf 20 \
       -c:a aac -b:a 192k \
       -pix_fmt yuv420p \
       -movflags +faststart \
       -shortest \
       output.mp4
```

**Key flags:**
- `-crf 20`: High quality (range 0-51; 18 is visually lossless, 23 is default, 20 is a good balance)
- `-preset medium`: Balance of encoding speed and compression
- `-pix_fmt yuv420p`: Required for universal player compatibility
- `-movflags +faststart`: Moves metadata to start of file for progressive download/streaming
- `-shortest`: Stops encoding when the shorter stream ends (handles duration mismatches)
- `-c:a aac -b:a 192k`: High-quality AAC audio encoding

### Resolution Presets

| Preset | Viewport | FFmpeg Scale | Est. Speed | File Size (3min video) |
|--------|----------|-------------|------------|----------------------|
| 720p | 1280x720 | None | ~3-5 min | ~30-50 MB |
| 1080p (default) | 1920x1080 | None | ~5-10 min | ~60-100 MB |
| 4K | 1920x1080* | `-vf scale=3840:2160` | ~10-20 min | ~200-400 MB |

*For 4K: Capture at 1080p viewport with 2x device pixel ratio (`page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 2 })`), then scale up. This avoids the extreme slowness of 4K viewports in Puppeteer (which is a known performance issue per GitHub issue #736) while maintaining crisp SVG rendering.

---

## Progress UX Specification

### Stage-Based Progress Model

Export progress has four discrete stages. Each stage reports independently:

| Stage | Weight | Progress Source | User-Visible Label |
|-------|--------|----------------|-------------------|
| Preparing | 5% | Binary (ready or not) | "Preparing renderer..." |
| Rendering frames | 75% | `currentFrame / totalFrames` | "Rendering frame 450/900 (50%)" |
| Encoding video | 15% | FFmpeg stderr progress parsing | "Encoding video..." |
| Muxing audio | 5% | Binary (done or not) | "Adding audio track..." |

**Weighted progress calculation:**
```
overall = stageWeight * stageProgress
```

Example at frame 450/900:
```
preparing:  5% * 1.0 = 5%
rendering: 75% * 0.5 = 37.5%
encoding:  0%
muxing:    0%
total = 42.5%
```

### SSE Event Format

```json
{
  "type": "progress",
  "stage": "rendering",
  "currentFrame": 450,
  "totalFrames": 900,
  "stageProgress": 0.5,
  "overallProgress": 0.425,
  "elapsed": 45000,
  "estimatedRemaining": 45000,
  "fps": 10.0
}
```

```json
{
  "type": "complete",
  "downloadUrl": "/api/export/abc123/download",
  "fileSize": 85234567,
  "duration": 92000
}
```

```json
{
  "type": "error",
  "message": "Chrome process crashed during frame 234",
  "stage": "rendering",
  "recoverable": true
}
```

---

## Error Handling Specification

### Error Categories

| Error | When | User Message | Recoverable |
|-------|------|-------------|-------------|
| Missing audio file | Validation | "Audio file is required for video export" | Yes (upload audio) |
| Missing sync anchors | Validation | "Set at least 2 sync points before exporting" | Yes (open sync editor) |
| Chrome launch failure | Preparation | "Export service unavailable. Please try again." | Yes (retry) |
| Chrome crash mid-render | Rendering | "Export failed during rendering. Please try again." | Yes (retry) |
| Screenshot timeout | Rendering | "A frame took too long to render. Try reducing resolution." | Yes (lower resolution) |
| FFmpeg encoding failure | Encoding | "Video encoding failed. Please try again." | Yes (retry) |
| Disk space exhaustion | Rendering/Encoding | "Server storage full. Please try again later." | No (admin action needed) |
| Export timeout (>30min) | Any stage | "Export took too long. Try a shorter audio file or lower resolution." | Yes (adjust settings) |
| Memory exhaustion (OOM) | Rendering | "Export ran out of memory. Try 720p resolution." | Yes (lower resolution) |

### Cleanup on Failure

When an export fails at any stage, the backend must:
1. Kill the Puppeteer browser process (prevent zombie Chrome)
2. Delete temporary frame files from disk
3. Delete partial output video
4. Report error to client via SSE
5. Mark job as failed in queue

---

## Competitor Analysis

### How Competitors Handle Video Export

| Product | Export Method | Progress | Resolution | Audio |
|---------|-------------|----------|------------|-------|
| **musescore.com** | Server-side render, email download link | "May take minutes to an hour" | Fixed | Synth audio only |
| **Remotion** | Puppeteer + FFmpeg pipeline | Frame-level progress callback | Any (viewport-based) | Full audio mux |
| **Canva** | Server-side render, in-app download | Progress bar | Fixed presets | Full audio |
| **timecut** | Puppeteer + virtual time + FFmpeg | Console output | Configurable | No audio mux |
| **score-util** | SVG extraction + ImageMagick + FFmpeg | None | Fixed | MuseScore synth |

**Key takeaway:** Manuscript's existing `window.animationController` API puts it architecturally ahead of most competitors. musescore.com's "may take an hour" with email delivery is the low bar. Remotion's frame-level progress with SSE is the high bar. Aim for Remotion-level UX quality.

---

## Export Trigger UI Specification

### Button Placement and State

The Export Video button should be in the sidebar (Inspector panel), below the existing sections:

**Button states:**
| State | Appearance | Tooltip |
|-------|-----------|---------|
| Disabled (no audio) | Grayed out | "Upload an audio file to enable export" |
| Disabled (no anchors) | Grayed out | "Set sync points to enable export" |
| Disabled (no MusicXML) | Grayed out | "Upload a MusicXML file to enable export" |
| Ready | Active, styled like `grunge-btn` | "Export as MP4 video" |
| Exporting | Progress bar replaces button | Shows percentage and stage |
| Complete | Download button | "Download video (85 MB)" |
| Error | Error message + retry button | Error description |

### Export Modal/Panel

When user clicks "Export Video", show a brief configuration panel:

| Setting | Options | Default |
|---------|---------|---------|
| Resolution | 720p, 1080p, 4K | 1080p |
| Frame Rate | 30 fps, 60 fps | 30 fps |
| Quality | Standard, High | High |

Then a "Start Export" confirmation button. The export runs in the background -- user can continue editing settings, but changes will not affect the in-progress export.

---

## Sources

### HIGH Confidence (Official Documentation, Verified)

- [Remotion renderMedia() API](https://www.remotion.dev/docs/renderer/render-media) -- Progress callbacks, codec options, quality settings, audio handling
- [Remotion renderFrames() API](https://www.remotion.dev/docs/renderer/render-frames) -- `onFrameUpdate` callback, frame-level progress, concurrency
- [Puppeteer Screenshots Guide](https://pptr.dev/guides/screenshots) -- `optimizeForSpeed`, format options, viewport control
- [Puppeteer Headless Modes](https://pptr.dev/guides/headless-modes) -- Headless Chrome architecture
- [FFmpeg Documentation](https://ffmpeg.org/ffmpeg.html) -- Image sequence encoding, audio muxing, H.264 options
- [BullMQ Documentation](https://docs.bullmq.io) -- Job queue concurrency, worker pools, job lifecycle

### MEDIUM Confidence (Multiple Sources Agree)

- [Bannerbear: 8 Tips for Faster Puppeteer Screenshots](https://www.bannerbear.com/blog/ways-to-speed-up-puppeteer-screenshots/) -- JPEG vs PNG performance characteristics
- [ScreenshotOne: optimizeForSpeed analysis](https://screenshotone.com/blog/optimize-for-speed-when-rendering-screenshots-in-puppeteer-and-chrome-devtools-protocol/) -- Faster encoding options
- [timecut GitHub](https://github.com/tungs/timecut) -- Virtual time approach for frame-by-frame capture
- [timesnap GitHub](https://github.com/tungs/timesnap) -- Time-function overwriting for deterministic screenshots
- [Gumlet: FFmpeg Images to Video](https://www.gumlet.com/learn/ffmpeg-images-to-video/) -- Image sequence best practices
- [Shotstack: FFmpeg Images to Video](https://shotstack.io/learn/use-ffmpeg-to-convert-images-to-video/) -- Codec and pixel format recommendations
- [Smart Interface Design Patterns: Progress UX](https://smart-interface-design-patterns.com/articles/designing-better-loading-progress-ux/) -- Progress bar best practices for long tasks
- [DigitalOcean: SSE in Node.js](https://www.digitalocean.com/community/tutorials/nodejs-server-sent-events-build-realtime-app) -- SSE implementation patterns

### LOW Confidence (Single Source, Needs Validation)

- [Puppeteer Issue #736: Slow screenshots on large viewports](https://github.com/puppeteer/puppeteer/issues/736) -- 4K viewport performance concerns
- [MuseScore video export discussion](https://musescore.org/en/node/327380) -- Competitor approach to scrolling video export
- [score-util GitHub](https://github.com/keijokapp/score-util) -- Alternative SVG-to-video approach for MuseScore
- [Puppeteer Issue #7530: Screenshot frame artifacts](https://github.com/puppeteer/puppeteer/issues/7530) -- Potential rendering artifacts during capture

### Codebase Analysis (Direct Verification)

- `src/types/global.d.ts` -- `window.setAnimationFrame`, `setAnimationTimestamp`, `getAnimationDuration`, `isAnimationReady` API
- `src/lib/animationController.ts` -- `AnimationControllerConfig`, synchronous `setTimestamp` for frame capture
- `src/renderers/RegularRenderer.tsx` lines 685-714 -- `window.animationController` exposure for Puppeteer
- `src/renderers/SingleLineRenderer.tsx` lines 762-775 -- Same API exposed for single-line mode
- `src/App.tsx` lines 22-111 -- Complete settings model that must transfer to backend

---

## Confidence Assessment

| Area | Confidence | Reason |
|------|------------|--------|
| Frame capture approach | HIGH | Existing `window.animationController` API explicitly designed for this; Remotion/timecut validate the pattern |
| FFmpeg encoding pipeline | HIGH | Well-documented, standard approach; thousands of production examples |
| Progress reporting via SSE | HIGH | Standard pattern for long-running tasks; multiple implementation guides available |
| Settings serialization | HIGH | Direct codebase analysis of App.tsx state model |
| Resolution/quality presets | MEDIUM | Standard industry presets; 4K viewport performance needs empirical testing |
| Export time estimates | MEDIUM | Depends on server hardware; needs calibration after initial implementation |
| Concurrent job handling | MEDIUM | BullMQ is battle-tested, but resource limits per-job need empirical tuning |
| Audio muxing edge cases | LOW | Duration mismatches, codec compatibility need testing with real audio files |
