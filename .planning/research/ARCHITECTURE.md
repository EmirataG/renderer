# Architecture: Backend Video Export Service

**Domain:** Headless Chrome frame capture + FFmpeg encoding service for MusicXML score animation
**Researched:** 2026-02-09
**Confidence:** HIGH

---

## Executive Summary

The backend video export service captures the existing browser-based score renderer frame-by-frame in headless Chrome and encodes the frames into MP4 via FFmpeg. The architecture is a **monorepo sibling package** that builds and serves the frontend, opens it in Puppeteer, injects all user settings via `evaluateOnNewDocument`, then loops through `window.animationController.setFrame(n, fps)` piping each screenshot buffer to FFmpeg's stdin.

The critical insight from codebase analysis: the frontend already has a synchronous, stateless `setTimestamp()` function in `RegularRenderer` (lines 526-668) that computes exact animation state mathematically -- no CSS transitions, no timeouts, forces reflow before returning. This means each Puppeteer screenshot captures a pixel-perfect frame with zero timing dependencies. The backend simply needs to call this function, screenshot, and pipe.

---

## Recommended Architecture

```
Manuscript/
  renderer/              (existing frontend SPA)
  export-service/        (NEW: Node.js backend)
    src/
      server.ts          Entry point: HTTP + WebSocket server
      routes/
        export.ts        POST /api/export -- initiates export job
        status.ts        GET  /api/export/:jobId -- job status
        download.ts      GET  /api/export/:jobId/download -- serve MP4
      jobs/
        jobManager.ts    Job queue, state machine, cleanup
        renderJob.ts     Orchestrates Puppeteer + FFmpeg pipeline
      pipeline/
        browser.ts       Puppeteer lifecycle (launch, page, inject, close)
        captureLoop.ts   Frame-by-frame capture loop
        encoder.ts       FFmpeg child_process spawn + stdin pipe
      ws/
        progress.ts      WebSocket handler for real-time progress
      shared/
        types.ts         ExportRequest, ExportSettings, JobStatus
        config.ts        Server configuration (ports, paths, limits)
```

### Why Monorepo Sibling (Not Separate Repo, Not Same Package)

1. **Shared types:** `ExportSettings` mirrors the frontend's props interface exactly. Keeping them in the same repo ensures they stay in sync. A separate repo would drift.

2. **Frontend build access:** The backend needs to `vite build` the frontend and serve the `dist/` output. A sibling package in the same repo makes this a workspace script.

3. **Independent deployment:** The backend has completely different dependencies (Puppeteer, FFmpeg) and runs on a server, not in the browser. It should NOT be in the frontend's `package.json`.

4. **Not pnpm workspaces (yet):** The existing project uses npm (`package-lock.json` exists, no `pnpm-workspace.yaml`). Adding a sibling directory with its own `package.json` is the simplest approach. Workspace tooling can be added later if needed.

---

## Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| **HTTP Server** | Accept export requests, serve files, CORS | Routes, JobManager |
| **WebSocket Server** | Stream progress events to client | JobManager events |
| **JobManager** | Job queue, lifecycle, cleanup, concurrency | RenderJob, Progress |
| **RenderJob** | Orchestrate single export job | Browser, CaptureLoop, Encoder |
| **Browser** | Puppeteer lifecycle, page setup, state injection | Puppeteer API |
| **CaptureLoop** | Frame iteration, screenshot capture | Browser (page), Encoder (stdin) |
| **Encoder** | FFmpeg spawn, stdin pipe, output file | child_process, filesystem |
| **Frontend (modified)** | Render mode: no UI, no virtualization, full viewport | window.animationController |

---

## Data Flow

### 1. Export Request Flow

```
Browser (user clicks "Export Video")
  |
  | POST /api/export
  | Body: { musicXml, audioFile, syncAnchors, settings, resolution, fps }
  |
  v
HTTP Server
  |
  | Validate request, create jobId
  | Store uploaded files to temp directory
  |
  v
JobManager.enqueue(job)
  |
  | Queue job, enforce concurrency limit (1 active)
  | Return jobId to client immediately
  |
  v
Client opens WebSocket: ws://host/ws?jobId=xxx
  |
  | Receives: { type: 'progress', frame, totalFrames, percent }
  | Receives: { type: 'complete', downloadUrl }
  | Receives: { type: 'error', message }
```

### 2. Render Pipeline Flow (Inside RenderJob)

```
RenderJob.execute()
  |
  +-- 1. Browser.launch()
  |     Puppeteer.launch({ headless: true, args: [...] })
  |
  +-- 2. Browser.setupPage(settings, resolution)
  |     page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 })
  |     page.evaluateOnNewDocument(injectSettings, settings)
  |     page.goto(frontendUrl + '?render=true')
  |
  +-- 3. Browser.waitForReady()
  |     page.waitForFunction('window.animationController !== undefined')
  |     page.waitForFunction('window.animationController.getDuration() > 0')
  |
  +-- 4. Encoder.start(outputPath, fps, resolution)
  |     spawn('ffmpeg', ['-f','image2pipe','-framerate',fps,'-i','-',
  |       '-c:v','libx264','-pix_fmt','yuv420p','-crf','18',
  |       '-preset','medium', outputPath])
  |
  +-- 5. CaptureLoop.run(page, ffmpegStdin, totalFrames, fps)
  |     for frame = 0 to totalFrames:
  |       page.evaluate(f => window.animationController.setFrame(f, fps), frame)
  |       buffer = page.screenshot({ type: 'png', optimizeForSpeed: true })
  |       ffmpegStdin.write(buffer)
  |       emit('progress', { frame, totalFrames })
  |
  +-- 6. Encoder.finish()
  |     ffmpegStdin.end()
  |     await ffmpegProcess exit
  |
  +-- 7. Browser.close()
  |
  +-- 8. emit('complete', { downloadUrl })
```

### 3. State Injection Detail

The frontend App reads all settings from React useState. For render mode, the backend injects a `window.__EXPORT_CONFIG__` object BEFORE React loads. The App checks for this object and uses it instead of useState defaults.

```typescript
// Backend: browser.ts
await page.evaluateOnNewDocument((config) => {
  window.__EXPORT_CONFIG__ = config;
}, {
  musicXml: xmlContent,
  syncAnchors: Object.fromEntries(anchorsMap),  // Map -> plain object
  audioDuration: durationSeconds,                 // No audio element needed
  fps: 30,
  scoreColor: '#000000',
  scoreScale: 1.0,
  musicFont: 'Bravura',
  scoreRegion: null,
  scoreBorder: 'none',
  scoreShadowDistance: 0,
  hideUnplayedNotes: true,
  smoothReveal: true,
  activeNoteheadColor: '#000000',
  activeNoteheadScale: 1.2,
  activeNoteheadEntryMs: 50,
  activeNoteheadHoldMs: 200,
  activeNoteheadExitMs: 500,
  colorFullNote: false,
  bgUrl: null,  // Or base64 data URL
});
```

```typescript
// Frontend: App.tsx (modified)
const exportConfig = (window as any).__EXPORT_CONFIG__;
const isRenderMode = !!exportConfig;

// Use export config or interactive defaults
const [fps, setFps] = useState(exportConfig?.fps ?? 60);
const [scoreColor, setScoreColor] = useState(exportConfig?.scoreColor ?? '#000000');
// ... etc for all settings
```

### 4. Sync Anchors Injection

Sync anchors are a `Map<string, number>` in the frontend. Maps cannot be serialized to JSON. The backend serializes as a plain object, and the frontend reconstructs the Map.

```typescript
// Backend sends:
{ syncAnchors: { "evt-0": 0.0, "evt-5": 1.234, "evt-100": 45.678 } }

// Frontend reconstructs:
const anchorsMap = new Map(Object.entries(exportConfig.syncAnchors));
useSyncStore.setState({ anchors: anchorsMap });
```

### 5. MusicXML Content Injection

Two options for getting the MusicXML content to the page:

**Option A (recommended): Inject as string via evaluateOnNewDocument.**
The MusicXML is set on `window.__EXPORT_CONFIG__.musicXml`. The App reads it and sets state directly, bypassing the file upload UI.

**Option B: Serve the file and fetch it.**
Backend serves the file at `/api/files/:jobId/score.xml`. Frontend fetches on load. Adds an unnecessary network round-trip for data the backend already has.

Option A is simpler and eliminates latency. MusicXML files are typically 50KB-2MB, well within what `evaluateOnNewDocument` can handle.

### 6. Background Image Injection

Background images are binary files. Options:

**Option A (recommended for small images): Base64 data URL.**
Convert the uploaded image to a base64 data URL and inject via `window.__EXPORT_CONFIG__.bgUrl = 'data:image/png;base64,...'`. Works for images up to ~5MB.

**Option B (for large images): Serve via HTTP.**
Backend serves at `/api/files/:jobId/bg.png`. Pass URL to frontend. Better for very large images.

Start with Option A. If performance suffers, switch to B.

---

## Frontend Modifications for Render Mode

### New: Render Mode Detection

```typescript
// App.tsx or a new useRenderMode hook
const exportConfig = typeof window !== 'undefined'
  ? (window as any).__EXPORT_CONFIG__
  : null;
const isRenderMode = !!exportConfig;
```

### Modified: App.tsx

When `isRenderMode` is true:

1. **Skip UI:** Do not render sidebar, transport bar, tabs, upload zone
2. **Auto-load data:** Use `exportConfig.musicXml` directly instead of waiting for file upload
3. **Inject anchors:** Call `useSyncStore.setState({ anchors: new Map(...) })` on mount
4. **Set all settings from config:** Override every useState default with config values
5. **Render only the score viewport:** Full-screen RegularRenderer, no chrome

### Modified: RegularRenderer.tsx

When render mode is detected:

1. **Disable page virtualization:** Mount ALL pages. The existing `extractionDoneRef.current` gate already handles this -- pages mount for extraction, then virtualize. In render mode, skip the virtualization step entirely.

2. **Disable camera CSS transition:** Remove `transition: "transform 200ms ease-out"` from the camera div. Frame capture requires instant state, not animated transitions.

3. **Set viewport dimensions from export resolution:** The container should be sized to match the Puppeteer viewport exactly (e.g., 1920x1080), not the preview WIDTH constant of 980px.

4. **No audio element:** The `setTimestamp()` function already works without audio. It reads from `interpolatedEvents` and applies animation state mathematically. The `getDuration()` function returns `audioDuration` from state, which the backend injects via config.

5. **Expose readiness signal:** The existing `window.animationController` exposure already signals readiness. Add a more explicit signal:
   ```typescript
   (window as any).__EXPORT_READY__ = true;
   ```

### What Does NOT Need to Change

- `setTimestamp()` logic -- already stateless, synchronous, reflow-forcing
- `interpolateTimestamps()` -- pure function, works with any input
- `useVerovio` hook -- works the same, just with different container width
- `noteAnimation.ts` -- not used in render mode (setTimestamp does its own animation math)
- `getEvents.ts` -- extraction works identically
- `eventStore` / `syncStore` -- Zustand stores work fine in headless Chrome

---

## Patterns to Follow

### Pattern 1: Job State Machine

Jobs follow a strict lifecycle. No state skipping. Cleanup on every terminal state.

```
QUEUED -> PREPARING -> RENDERING -> ENCODING -> COMPLETE
                  \        \          \
                   \        \          +-> ERROR
                    \        +----------> ERROR
                     +-----------------> ERROR
```

```typescript
interface ExportJob {
  id: string;
  status: 'queued' | 'preparing' | 'rendering' | 'encoding' | 'complete' | 'error';
  progress: { frame: number; totalFrames: number; percent: number };
  createdAt: number;
  completedAt?: number;
  outputPath?: string;
  error?: string;
  tempDir: string;  // Cleaned up on terminal states
}
```

### Pattern 2: Puppeteer Screenshot to FFmpeg stdin Pipe

The core capture pattern. No intermediate files. Screenshots flow directly from Chrome to FFmpeg.

```typescript
// encoder.ts
import { spawn } from 'child_process';

function startEncoder(outputPath: string, fps: number, width: number, height: number) {
  const ffmpeg = spawn('ffmpeg', [
    '-y',                       // Overwrite output
    '-f', 'image2pipe',         // Read images from stdin
    '-framerate', String(fps),  // Input frame rate
    '-i', '-',                  // Read from stdin
    '-c:v', 'libx264',         // H.264 codec
    '-pix_fmt', 'yuv420p',     // Compatibility pixel format
    '-crf', '18',               // High quality (0=lossless, 23=default, 51=worst)
    '-preset', 'medium',        // Encoding speed/quality tradeoff
    '-vf', `scale=${width}:${height}`,  // Ensure exact resolution
    '-movflags', '+faststart',  // Web-optimized MP4
    outputPath,
  ]);

  return ffmpeg;
}

// captureLoop.ts
async function captureFrames(
  page: Page,
  ffmpegStdin: Writable,
  totalFrames: number,
  fps: number,
  onProgress: (frame: number) => void,
) {
  for (let frame = 0; frame <= totalFrames; frame++) {
    await page.evaluate(
      (f, r) => (window as any).animationController.setFrame(f, r),
      frame, fps,
    );

    const buffer = await page.screenshot({
      type: 'png',
      optimizeForSpeed: true,  // Faster PNG encoding (zlib q1)
      encoding: 'binary',
    });

    ffmpegStdin.write(buffer);
    onProgress(frame);
  }

  ffmpegStdin.end();
}
```

**Why PNG, not JPEG:** PNG is lossless. Music notation has thin lines (staff lines, stems) and sharp edges that JPEG compression visibly degrades. The file size difference is irrelevant since frames are piped to FFmpeg's stdin, not written to disk.

**Why `optimizeForSpeed: true`:** Reduces PNG compression from zlib default to level 1 (RLE encoding). For piped frames that are immediately consumed by FFmpeg, compression ratio is irrelevant -- encoding speed matters.

### Pattern 3: WebSocket Progress Protocol

Simple JSON messages over WebSocket. Client connects with job ID after initiating export.

```typescript
// Messages from server to client
type ProgressMessage =
  | { type: 'queued'; position: number }
  | { type: 'preparing'; message: string }
  | { type: 'rendering'; frame: number; totalFrames: number; percent: number; eta: number }
  | { type: 'encoding'; message: string }
  | { type: 'complete'; downloadUrl: string; duration: number; fileSize: number }
  | { type: 'error'; message: string; code: string };
```

ETA calculation: Track time per frame over a rolling window of 30 frames. Multiply by remaining frames.

### Pattern 4: Frontend Render Mode Wrapper

Instead of scattering render-mode checks throughout App.tsx, create a dedicated wrapper component.

```typescript
// RenderApp.tsx (new)
export default function RenderApp() {
  const config = (window as any).__EXPORT_CONFIG__;

  // Inject sync anchors into Zustand store
  useEffect(() => {
    const anchorsMap = new Map(
      Object.entries(config.syncAnchors).map(([k, v]) => [k, v as number])
    );
    useSyncStore.setState({ anchors: anchorsMap });
  }, []);

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden' }}>
      <RegularRenderer
        xml={config.musicXml}
        bgUrl={config.bgUrl}
        fps={config.fps}
        scoreColor={config.scoreColor}
        syncAnchors={/* from store */}
        scoreRegion={config.scoreRegion}
        scoreBorder={config.scoreBorder}
        scoreScale={config.scoreScale}
        musicFont={config.musicFont}
        activeNoteheadColor={config.activeNoteheadColor}
        activeNoteheadScale={config.activeNoteheadScale}
        activeNoteheadAnimationEntryMs={config.activeNoteheadEntryMs}
        activeNoteheadAnimationHoldMs={config.activeNoteheadHoldMs}
        activeNoteheadAnimationExitMs={config.activeNoteheadExitMs}
        colorFullNote={config.colorFullNote}
        renderMode={true}  // New prop: disables virtualization, transitions
      />
    </div>
  );
}

// main.tsx (modified)
const exportConfig = (window as any).__EXPORT_CONFIG__;
const RootComponent = exportConfig ? RenderApp : App;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RootComponent />
  </StrictMode>,
);
```

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Real-Time Capture (Recording Screen)

**What:** Using screen recording or CDP `Page.startScreencast` to capture video in real-time.
**Why bad:** Animation timing depends on browser performance. Frames may be dropped. Output will be inconsistent across hardware. At 30fps with 1080p, each frame only has 33ms -- not enough for Verovio rendering + screenshot.
**Instead:** Frame-by-frame capture with `setFrame()`. Each frame waits for the previous to complete. Deterministic, reproducible output regardless of hardware speed.

### Anti-Pattern 2: Writing Frame PNGs to Disk Then Encoding

**What:** Save each screenshot as `frame_0001.png`, then run `ffmpeg -i frame_%04d.png`.
**Why bad:** For a 3-minute video at 30fps = 5,400 frames. At ~2MB per 1080p PNG = 10.8GB of temp disk. Slow disk I/O. Cleanup complexity.
**Instead:** Pipe each PNG buffer directly to FFmpeg's stdin via `image2pipe`. Zero disk for frames.

### Anti-Pattern 3: Loading Frontend via file:// Protocol

**What:** `page.goto('file:///path/to/dist/index.html')`.
**Why bad:** WASM loading fails due to CORS restrictions on file:// URLs. Verovio's WASM module requires proper HTTP serving.
**Instead:** Serve the built frontend via a local HTTP server (e.g., `express.static(distPath)`). Navigate to `http://localhost:PORT`.

### Anti-Pattern 4: Injecting Settings via URL Query Parameters

**What:** Encoding all settings as URL params: `?scoreColor=%23000000&fps=30&musicFont=Bravura&...`.
**Why bad:** URL length limits (~2000 chars). MusicXML content is 50KB-2MB. Sync anchors can have hundreds of entries. Cannot encode binary data (background images).
**Instead:** `evaluateOnNewDocument` with a config object. No size limits. Supports any data type.

### Anti-Pattern 5: Using fluent-ffmpeg

**What:** Using the `fluent-ffmpeg` npm package for FFmpeg integration.
**Why bad:** The fluent-ffmpeg repository was **archived by the owner on May 22, 2025** and is now read-only. No further maintenance, bug fixes, or security patches. It wraps `child_process.spawn` anyway.
**Instead:** Use `child_process.spawn('ffmpeg', [...args])` directly. Full control over arguments. No abandoned dependency.

---

## Integration Points: New vs Modified

### New Components (Backend: export-service/)

| Component | File(s) | Purpose |
|-----------|---------|---------|
| HTTP Server | `server.ts` | Express server, routes, static file serving |
| Export Route | `routes/export.ts` | Accept export request, validate, enqueue job |
| Download Route | `routes/download.ts` | Serve completed MP4 files |
| Job Manager | `jobs/jobManager.ts` | Job queue, state machine, cleanup, concurrency |
| Render Job | `jobs/renderJob.ts` | Orchestrate single export pipeline |
| Browser Manager | `pipeline/browser.ts` | Puppeteer launch, page setup, state injection |
| Capture Loop | `pipeline/captureLoop.ts` | Frame-by-frame screenshot loop |
| FFmpeg Encoder | `pipeline/encoder.ts` | Spawn FFmpeg, pipe stdin, handle exit |
| WebSocket Progress | `ws/progress.ts` | Broadcast job progress to connected clients |
| Shared Types | `shared/types.ts` | ExportRequest, ExportSettings, JobStatus |

### Modified Components (Frontend: renderer/src/)

| Component | File | Change |
|-----------|------|--------|
| Entry Point | `main.tsx` | Detect `__EXPORT_CONFIG__`, render `RenderApp` or `App` |
| Render App | `RenderApp.tsx` (NEW) | Minimal wrapper for render mode |
| RegularRenderer | `renderers/RegularRenderer.tsx` | Add `renderMode` prop: skip virtualization, skip camera transition, size to viewport |
| Global Types | `types/global.d.ts` | Add `__EXPORT_CONFIG__` and `__EXPORT_READY__` to Window interface |

### Unchanged Components

| Component | Why Unchanged |
|-----------|---------------|
| `useVerovio.ts` | Works with any container width; no render-mode-specific logic needed |
| `interpolation.ts` | Pure function, works identically |
| `getEvents.ts` | Event extraction is render-mode-agnostic |
| `syncStore.ts` | Zustand store works in headless Chrome; state set programmatically |
| `eventStore.ts` | Caching works the same |
| `noteAnimation.ts` | Not used in render mode (setTimestamp computes inline) |
| `animationController.ts` | Module used only for internal state; window API exposed by RegularRenderer |
| `borders/` | Border components render SVG, work in headless Chrome |
| `SyncEditor.tsx` | Not rendered in render mode |
| `App.tsx` | Not rendered in render mode (RenderApp replaces it) |

---

## File Upload and Serving Strategy

### Upload Flow

```
Client                              Backend
  |                                    |
  |  POST /api/export                  |
  |  Content-Type: multipart/form-data |
  |  Fields:                           |
  |    musicXml (string)               |
  |    audioFile (binary, optional)    |
  |    bgImage (binary, optional)      |
  |    settings (JSON string)          |
  |    syncAnchors (JSON string)       |
  |                                    |
  v                                    v
                                  Create temp dir: /tmp/manuscript-export-{jobId}/
                                  Write musicXml to score.xml
                                  Write audioFile to audio.{ext}
                                  Write bgImage to bg.{ext}
                                  Parse settings JSON
                                  Compute audio duration (ffprobe)
                                  Enqueue job
                                  Return { jobId }
```

### Audio Duration Without Audio Element

The frontend uses `audioRef.current.duration` for duration. In render mode, there is no `<audio>` element. Two approaches:

**Use ffprobe (recommended):** The backend runs `ffprobe -v quiet -print_format json -show_format audioFile` to get duration. Inject as `exportConfig.audioDuration`.

**Client sends duration:** The frontend already knows the audio duration from the `<audio>` element. Include it in the export request.

Use both: client sends duration as a hint, backend verifies with ffprobe.

### Serving the Frontend App

The backend needs to serve the built frontend for Puppeteer to navigate to.

```typescript
// server.ts
import express from 'express';
import path from 'path';

const app = express();

// Serve the built frontend SPA
const frontendDist = path.resolve(__dirname, '../../renderer/dist');
app.use('/app', express.static(frontendDist));

// Serve job-specific files (background images)
app.use('/api/files', express.static(tempDir));
```

The backend builds the frontend at startup or uses a pre-built dist:

```bash
# In export-service/package.json scripts
"prebuild": "cd ../renderer && npm run build"
```

---

## Scalability Considerations

| Concern | At 1 user | At 10 users | At 100+ users |
|---------|-----------|-------------|---------------|
| **Concurrency** | 1 job at a time | Queue with 1-2 parallel jobs | Worker pool or separate machines |
| **Memory** | 1 Chrome instance (~300MB) | 2 instances (~600MB) | Need horizontal scaling |
| **Disk** | Temp files cleaned per-job | Same, no accumulation | Same |
| **CPU** | FFmpeg uses 1-2 cores per job | Need 4-8 cores | Offload to dedicated encoding server |
| **Latency** | Frame capture: ~50-100ms/frame at 1080p | Same per-job | Parallel workers reduce queue wait |
| **Total time** | 3min video at 30fps = 5400 frames * 80ms = ~7min | Same per-job, queued | Parallel workers |

### Export Time Estimation

For a 3-minute song at 30fps:
- Total frames: 3 * 60 * 30 = 5,400
- Per-frame: ~50ms setFrame + ~50ms screenshot = ~100ms
- Total capture: ~540 seconds (9 minutes)
- FFmpeg encoding: overlaps with capture (piped), adds ~30s finalization
- **Total: ~10 minutes for a 3-minute video at 30fps, 1080p**

This is acceptable for an async job. User sees progress via WebSocket.

### Optimization Opportunities (Future)

1. **Lower resolution for preview exports:** 720p cuts frame count and screenshot time
2. **JPEG screenshots for draft quality:** 3-5x faster than PNG, acceptable for preview
3. **Parallel frame capture:** Multiple browser tabs, each capturing a range of frames, merging afterward. Complex but potentially 4x faster.
4. **Hardware encoding:** `libx264` -> `h264_videotoolbox` (macOS) or `h264_nvenc` (NVIDIA). Significantly faster encoding.

---

## Puppeteer Launch Configuration

```typescript
const browser = await puppeteer.launch({
  headless: true,
  args: [
    '--no-sandbox',              // Required in Docker/CI
    '--disable-setuid-sandbox',  // Required in Docker/CI
    '--disable-dev-shm-usage',   // Use /tmp instead of /dev/shm (prevents OOM)
    '--disable-gpu',             // No GPU needed for 2D rendering
    '--disable-extensions',      // No browser extensions
    '--disable-background-timer-throttling',  // Prevent timer throttling
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--font-render-hinting=none',  // Consistent font rendering
    `--window-size=${width},${height}`,
  ],
  defaultViewport: {
    width: 1920,
    height: 1080,
    deviceScaleFactor: 1,  // 1 = exact pixel match; 2 = 2x retina
  },
});
```

---

## WebSocket Protocol Detail

### Connection

```
Client: ws://host:3001/ws?jobId=abc123
Server: Accept, register listener for jobId
```

### Messages (Server to Client)

```typescript
// Queued (waiting for other jobs to finish)
{ "type": "queued", "position": 2 }

// Preparing (launching browser, loading frontend)
{ "type": "preparing", "message": "Loading score..." }

// Rendering (frame capture in progress)
{ "type": "rendering", "frame": 150, "totalFrames": 5400, "percent": 2.78, "eta": 485 }

// Encoding finalization
{ "type": "encoding", "message": "Finalizing video..." }

// Complete
{ "type": "complete", "downloadUrl": "/api/export/abc123/download", "fileSize": 52428800 }

// Error
{ "type": "error", "message": "FFmpeg exited with code 1", "code": "ENCODER_FAILED" }
```

### Heartbeat

Server sends `{ "type": "ping" }` every 30s. Client responds with `{ "type": "pong" }`. Disconnect on 3 missed pongs.

---

## Error Handling Strategy

| Error | Detection | Recovery |
|-------|-----------|----------|
| Puppeteer launch fails | try/catch on `puppeteer.launch()` | Retry once, then fail job |
| Page navigation fails | `page.goto()` timeout | Rebuild frontend, retry once |
| `animationController` never appears | `waitForFunction` timeout (30s) | Fail job with "Renderer failed to initialize" |
| Screenshot fails | try/catch on `page.screenshot()` | Retry frame 3x, then fail job |
| FFmpeg exits non-zero | `ffmpeg.on('exit', code)` | Fail job with FFmpeg stderr |
| FFmpeg stdin backpressure | `write()` returns false | `await` drain event before next frame |
| Temp disk full | `write` ENOSPC error | Fail job, clean temp directory |
| Client disconnects WebSocket | `ws.on('close')` | Job continues (result downloadable later) |

### FFmpeg Backpressure Handling

Critical: FFmpeg may not consume frames as fast as Puppeteer produces them. The Node.js writable stream `write()` returns `false` when the internal buffer is full. Must respect this:

```typescript
async function writeFrame(stdin: Writable, buffer: Buffer): Promise<void> {
  const canContinue = stdin.write(buffer);
  if (!canContinue) {
    await new Promise<void>(resolve => stdin.once('drain', resolve));
  }
}
```

---

## Temp File Management

```
/tmp/manuscript-export-{jobId}/
  score.xml           # Uploaded MusicXML
  audio.mp3           # Uploaded audio (optional)
  bg.png              # Uploaded background (optional)
  output.mp4          # Final encoded video
```

### Cleanup Rules

1. **On job complete:** Keep `output.mp4` for download. Delete source files after 1 hour.
2. **On job error:** Delete entire temp directory immediately.
3. **On server startup:** Scan `/tmp/manuscript-export-*`, delete directories older than 2 hours.
4. **On download:** After first download, schedule deletion in 10 minutes.

---

## Sources

### HIGH Confidence
- **Codebase analysis:** `RegularRenderer.tsx` lines 526-668 (setTimestamp stateless implementation), lines 670-715 (window.animationController exposure)
- **Codebase analysis:** `animationController.ts` lines 125-128 (setFrame/setTimestamp synchronous design)
- **Codebase analysis:** `SingleLineRenderer.tsx` lines 163-167 (existing render mode detection pattern via URL params)
- [Puppeteer ScreenshotOptions API](https://pptr.dev/api/puppeteer.screenshotoptions) - optimizeForSpeed, encoding, type options
- [Puppeteer page.evaluateOnNewDocument](https://pptr.dev/api/puppeteer.page.evaluateonnewdocument) - Inject code before page scripts run
- [Puppeteer page.setViewport](https://pptr.dev/api/puppeteer.page.setviewport) - Viewport configuration with deviceScaleFactor

### MEDIUM Confidence
- [HTML5 slideshow to video with Puppeteer + FFmpeg](https://robinz.in/convert-an-html5-slideshow-to-a-video/) - Screenshot-to-stdin pipe pattern
- [Node.js real-time video with FFmpeg](https://ofarukcaki.medium.com/producing-real-time-video-with-node-js-and-ffmpeg-a59ac27461a1) - stdin.write() + stdin.end() pattern
- [timecut: Node.js web page video recorder](https://github.com/tungs/timecut) - Frame-by-frame capture architecture reference
- [Puppeteer screenshot speed optimization](https://www.bannerbear.com/blog/ways-to-speed-up-puppeteer-screenshots/) - optimizeForSpeed flag, PNG vs JPEG performance
- [Optimize screenshots with CDP](https://screenshotone.com/blog/optimize-for-speed-when-rendering-screenshots-in-puppeteer-and-chrome-devtools-protocol/) - optimizeForSpeed uses zlib q1 encoding
- [fluent-ffmpeg archived May 2025](https://github.com/fluent-ffmpeg/node-fluent-ffmpeg) - Repository archived, use child_process.spawn directly
- [pnpm workspaces](https://pnpm.io/workspaces) - Monorepo workspace configuration

### LOW Confidence
- [WebSocket streaming patterns 2025](https://www.videosdk.live/developer-hub/websocket/websocket-streaming) - General WebSocket architecture patterns
- [Puppeteer issue #1034: Create video with screenshot](https://github.com/puppeteer/puppeteer/issues/1034) - Community approaches to video creation

---

*Architecture research completed: 2026-02-09*
*Domain: Backend video export service for Manuscript score renderer*
*Focus: Integration with existing React SPA, headless Chrome pipeline, FFmpeg encoding*
