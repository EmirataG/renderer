# Domain Pitfalls: Backend Video Export Service

**Domain:** Headless browser video export for browser-based music notation renderer
**Researched:** 2026-02-09
**Confidence:** HIGH (based on codebase analysis, official Puppeteer/FFmpeg documentation, and community post-mortems)

---

## Context

This pitfalls research focuses on adding a **backend video export service** to an existing browser-based MusicXML score renderer. The service must:

1. Run headless Chrome in Docker on Fly.io
2. Load the existing React SPA with all user settings (score region, colors, fonts, animation params)
3. Drive frame-by-frame rendering via the existing `window.animationController.setFrame()` API
4. Pipe screenshots to FFmpeg for H.264 encoding
5. Mux with user-uploaded audio for final MP4
6. Stream progress back to the browser via WebSocket
7. Handle multiple concurrent export requests

**Existing codebase context:**
- `window.animationController.setFrame(frameNumber, fps)` -- synchronous, deterministic frame rendering
- `setTimestamp(seconds)` -- binary-searches interpolated events, applies camera + animation state, forces reflow
- Page virtualization active: only visible pages + 1-page buffer are mounted in DOM
- Verovio WASM renders MusicXML to SVG (async initialization)
- Music fonts (Bravura, Petaluma, Leland, Gootville, Leipzig) loaded via Verovio's `fontLoadAll: true`
- Background images loaded via `<img>` element with `onload` callback

---

## Critical Pitfalls

Mistakes that cause completely broken exports, corrupted video, or service outages.

---

### Pitfall 1: Page Virtualization Hides Notes During Frame Capture

**What goes wrong:**
The RegularRenderer virtualizes pages after event extraction (`extractionDoneRef.current = true`). Only visible pages + 1-page buffer are mounted in DOM (line 772: `const isMounted = !extractionDoneRef.current || visiblePages.has(i)`). When `setTimestamp()` is called by Puppeteer, it updates `cameraYRef` and calls `applyCamera()`, which triggers `setVisiblePages()`. But `setVisiblePages` is a React state update -- it batches asynchronously. The DOM is NOT updated by the time `setTimestamp` returns.

**Race condition sequence:**
```
1. Puppeteer calls: window.animationController.setFrame(500, 30)
2. setTimestamp(16.67) executes synchronously:
   a. Binary search finds event at timestamp
   b. applyCamera(event.y) called
   c. cameraYRef.current updated
   d. setVisiblePages(newVisible) called -- BATCHED, NOT YET APPLIED
   e. resetNoteheadAnimations() runs on scoreRef
   f. Animation loop applies colors/transforms to SVG elements
   g. void scoreRef.current.offsetHeight -- forces reflow
   h. Returns to Puppeteer
3. Puppeteer calls: page.screenshot() -- IMMEDIATELY
4. React has NOT re-rendered yet. Pages from previous frame are still mounted.
5. Target notes may be on an unmounted page. Screenshot captures WRONG state.
```

The existing `setTimestamp` in RegularRenderer (lines 526-668) does NOT force React to re-render visible pages synchronously. It only calls `applyCamera()` which sets `cameraYRef.current` and calls `setVisiblePages()` -- a batched state setter.

**Consequences:**
- Notes on newly-visible pages are missing from screenshots (page not yet mounted)
- Camera position is correct (transform applied immediately) but note elements are absent
- Animation colors applied to null elements (querySelector returns null for unmounted pages)
- Video shows blank regions where pages should be, with notes "popping" in one frame late

**Prevention:**
1. **Disable virtualization in render mode entirely.** When rendering for export, mount ALL pages. The existing two-phase lifecycle already mounts all pages before `extractionDoneRef.current = true`. For backend rendering, never set `extractionDoneRef.current = true`, or add a `renderMode` prop that skips virtualization:
   ```typescript
   // In RegularRenderer render loop
   const isMounted = renderMode || !extractionDoneRef.current || visiblePages.has(i);
   ```

2. **If virtualization must be kept** (memory concern for very long scores), use `flushSync` to force synchronous React re-render before screenshot:
   ```typescript
   import { flushSync } from 'react-dom';

   function setTimestampForRender(seconds: number) {
     flushSync(() => {
       // Update visible pages synchronously
       const newVisible = getVisiblePageRange();
       setVisiblePages(newVisible);
     });
     // NOW safe to query DOM and screenshot
     setTimestamp(seconds);
   }
   ```

3. **Backend-specific approach:** The backend controls the page. It can wait for React to re-render after each frame:
   ```typescript
   // In Puppeteer script
   await page.evaluate((frame, fps) => {
     window.animationController.setFrame(frame, fps);
   }, frameNum, fps);

   // Wait for React re-render to complete
   await page.waitForFunction(() => {
     return document.querySelectorAll('.preview-score svg.definition-scale').length > 0;
   });

   const buffer = await page.screenshot({ encoding: 'binary' });
   ```

**Detection:**
- Frames in output video have blank white areas where score pages should be
- Notes appear to "pop in" one frame after camera moves to their position
- Test: render frame 0 and frame at last event, compare DOM node count

**Recovery cost:** MEDIUM (4-8 hours)
- Add renderMode prop to RegularRenderer
- Skip virtualization in render path
- Test with multi-page scores

**Phase to address:** Backend service implementation -- MUST resolve before first successful render

---

### Pitfall 2: Verovio WASM Not Ready When Puppeteer Starts Frame Capture

**What goes wrong:**
Verovio's WASM module loads asynchronously. The `useVerovio` hook (lines 96-181) creates a toolkit via `createToolkit()` (async), loads data, renders pages, then React updates state. The `window.animationController` is only exposed AFTER `toolkit && svgPages.length > 0 && interpolatedEvents.length > 0` (RegularRenderer line 672).

If Puppeteer tries to call `window.animationController.setFrame()` before the entire initialization chain completes, it gets `undefined`:

```
Timeline:
0ms    - page.goto(url) starts
100ms  - React mounts, useVerovio effect starts
300ms  - WASM binary downloaded and compiled
500ms  - Toolkit created
600ms  - MusicXML loaded, pages rendered
700ms  - React re-renders with svgPages
800ms  - Event extraction runs (rAF callback)
900ms  - Interpolated events computed
950ms  - animationController exposed on window
1000ms - Puppeteer checks for controller -- SUCCESS (if waited)
```

But if any step takes longer (large score, slow network for WASM download, font loading), the timing shifts. Without proper waiting, Puppeteer crashes.

**Additional race: font loading.** Verovio uses `fontLoadAll: true` which loads ALL music fonts (Bravura, Petaluma, Leland, Gootville, Leipzig). These are WASM-embedded but the initial font setup takes time. If Puppeteer screenshots before fonts are fully applied, noteheads render as rectangles or missing glyphs.

**Consequences:**
- `TypeError: Cannot read properties of undefined (reading 'setFrame')` in Puppeteer
- Score renders with missing music symbols (font not loaded)
- Event positions are wrong (events computed before layout is stable)
- Silent data corruption: animation controller exists but has stale/empty event list

**Prevention:**
1. **Expose a readiness signal on window and poll for it:**
   ```typescript
   // In RegularRenderer, when controller is ready
   (window as any).rendererReady = true;
   (window as any).animationController = { ... };

   // In Puppeteer
   await page.waitForFunction(
     '!!window.rendererReady && !!window.animationController',
     { timeout: 30000 }
   );
   ```

2. **Verify event count before starting render:**
   ```typescript
   // In Puppeteer
   const eventCount = await page.evaluate(() =>
     window.animationController?.getDuration() ?? 0
   );
   if (eventCount === 0) throw new Error('No events loaded');
   ```

3. **Wait for specific DOM indicators:**
   ```typescript
   // Wait for Verovio SVG to be present
   await page.waitForSelector('svg.definition-scale', { timeout: 30000 });

   // Wait for specific font glyphs to render (Bravura uses specific Unicode ranges)
   await page.waitForFunction(() => {
     const uses = document.querySelectorAll('g.notehead use');
     return uses.length > 0;
   });
   ```

4. **Set generous timeouts with clear error messages:**
   ```typescript
   const WASM_TIMEOUT = 30000; // 30 seconds for WASM + font loading
   try {
     await page.waitForFunction('!!window.rendererReady', { timeout: WASM_TIMEOUT });
   } catch (e) {
     throw new Error(`Verovio WASM did not initialize within ${WASM_TIMEOUT}ms. ` +
       `Check Docker image has sufficient memory for WASM compilation.`);
   }
   ```

**Detection:**
- Puppeteer logs: `TypeError: Cannot read properties of undefined`
- Rendered video has blank frames at the beginning
- Music noteheads appear as squares or invisible in first few frames
- Export fails intermittently (timing-dependent)

**Recovery cost:** LOW (2-4 hours)
- Add readiness flag to RegularRenderer
- Add waitForFunction in Puppeteer script
- Test with slow WASM init simulation

**Phase to address:** Backend service implementation -- the VERY FIRST integration test

---

### Pitfall 3: Music Fonts Missing or Rendering Incorrectly in Docker

**What goes wrong:**
Verovio bundles music fonts (Bravura, Petaluma, etc.) as WASM resources, but text elements in the score (titles, lyrics, dynamics markings like "mf", "pp") use system fonts. Docker's base image (especially Alpine or slim Debian) has NO fonts installed. Additionally, the score may use CSS `@font-face` rules for text rendering.

The headless Chrome in Docker will:
1. Render music notation correctly (Verovio's embedded WASM fonts)
2. Render ALL text as fallback squares or wrong font (no system fonts)
3. Background images may fail to load (if served from localhost and URL doesn't resolve inside Docker)

**Specific failure: CSS `color` property on Verovio SVG.** The score color styling (RegularRenderer lines 227-260) sets `fill: ${scoreColor}` on SVG elements. This works in browser. In headless Chrome, the CSS `<style>` tag injected via `dangerouslySetInnerHTML` (line 724) must be loaded before screenshots. Race condition: CSS may not be applied to SVG elements when `setTimestamp` forces reflow.

**Consequences:**
- Lyrics, tempo markings, rehearsal marks appear as tofu (missing glyph rectangles)
- Score appears correct in browser preview but broken in export
- Dynamic markings ("forte", "piano") unreadable
- Title/composer text missing or wrong font

**Prevention:**
1. **Install comprehensive font packages in Dockerfile:**
   ```dockerfile
   RUN apt-get update && apt-get install -y \
     fonts-noto \
     fonts-noto-cjk \
     fonts-freefont-ttf \
     fonts-liberation \
     fonts-dejavu-core \
     fontconfig \
     && fc-cache -fv
   ```

2. **Bundle the specific text fonts Verovio uses.** Verovio text rendering typically uses Times New Roman or a serif fallback. Install `fonts-liberation` (Liberation Serif is a metric-compatible Times New Roman substitute) and `fonts-dejavu-core`.

3. **Test font rendering explicitly:**
   ```typescript
   // In Puppeteer, after page loads
   const hasText = await page.evaluate(() => {
     const textElements = document.querySelectorAll('svg text');
     // Check that text elements have measurable width (not tofu)
     return Array.from(textElements).every(el =>
       (el as SVGTextElement).getBBox().width > 0
     );
   });
   if (!hasText) console.warn('SVG text elements may not be rendering correctly');
   ```

4. **Verify background image loading.** Background images referenced by URL must be accessible from within the Docker container. If the user uploads a background image, the backend must serve it at a URL the headless Chrome page can reach:
   ```typescript
   // Inject background as data URL instead of HTTP URL
   const bgBase64 = Buffer.from(bgImageBuffer).toString('base64');
   const bgDataUrl = `data:image/png;base64,${bgBase64}`;
   await page.evaluate((url) => {
     // Set background via data URL to avoid network dependency
   }, bgDataUrl);
   ```

**Detection:**
- Export video has rectangles where text should be
- Compare browser screenshot with Puppeteer screenshot side-by-side
- `fc-list` inside Docker container shows no serif fonts

**Recovery cost:** LOW (1-2 hours)
- Add font packages to Dockerfile
- Test with score containing lyrics and text markings

**Phase to address:** Docker image setup -- first Dockerfile iteration

---

### Pitfall 4: FFmpeg Frame Timing Drift Causes Audio-Video Desync

**What goes wrong:**
When piping PNG frames to FFmpeg via stdin, the frame timing is determined by the `-r` (framerate) flag on the input. FFmpeg assigns timestamps based on frame order: frame 0 = 0s, frame 1 = 1/fps seconds, frame 2 = 2/fps seconds, etc. If the capture loop skips frames, duplicates frames, or has any off-by-one error, the audio and video desynchronize.

**Critical math:**
```
Total frames = Math.ceil(duration * fps)
Frame N timestamp = N / fps

If duration = 120.5s and fps = 30:
Total frames = Math.ceil(120.5 * 30) = 3615
Last frame timestamp = 3614 / 30 = 120.467s (NOT 120.5s)
```

If audio is 120.5s but video is 120.467s, the audio extends 33ms past the video. At scale (long songs), this becomes visible drift if frame count is miscalculated.

**Additional pitfall: variable screenshot timing.** Puppeteer's `page.screenshot()` takes variable time (50-200ms per frame depending on page complexity). If the capture loop measures wall-clock time instead of frame index for timestamp calculation, frames will have inconsistent timing.

**Consequences:**
- Notes highlight before or after their audio sound
- Drift accumulates over the duration of the video
- Export appears fine for short pieces but visibly wrong for 3+ minute pieces
- Audio cuts off before video ends (or continues after video freezes)

**Prevention:**
1. **Use frame index, never wall clock, for timestamp calculation:**
   ```typescript
   const totalFrames = Math.ceil(duration * fps);

   for (let frame = 0; frame < totalFrames; frame++) {
     await page.evaluate((f, r) => {
       window.animationController.setFrame(f, r);
     }, frame, fps);

     const buffer = await page.screenshot({ encoding: 'binary' });
     ffmpegStdin.write(buffer);
   }
   ```

2. **Verify total frame count matches audio duration:**
   ```typescript
   const expectedDuration = totalFrames / fps;
   const audioDuration = await getAudioDuration(audioPath);
   const drift = Math.abs(expectedDuration - audioDuration);
   if (drift > 1 / fps) {
     console.warn(`Frame/audio drift: ${drift.toFixed(3)}s`);
   }
   ```

3. **Use CFR (constant frame rate) encoding, never VFR:**
   ```bash
   ffmpeg -f image2pipe -framerate 30 -i pipe:0 \
     -c:v libx264 -pix_fmt yuv420p -vsync cfr \
     -r 30 output.mp4
   ```

4. **Pad or trim video to match audio exactly:**
   ```bash
   # During muxing, use -shortest to trim to shorter stream
   ffmpeg -i video.mp4 -i audio.mp3 -c:v copy -c:a aac \
     -shortest output_final.mp4
   ```

**Detection:**
- Play export video: notes visibly highlight before/after their sound
- Compare frame count: `totalFrames / fps` should equal audio duration within 1 frame
- Seek to end of video: last note should align with last audio event

**Recovery cost:** LOW (2-3 hours)
- Fix frame counting math
- Add duration verification
- Test with long (5+ minute) scores

**Phase to address:** FFmpeg encoding implementation -- validate with test audio immediately

---

### Pitfall 5: Chrome Process Leak and OOM Under Concurrent Renders

**What goes wrong:**
Each export request launches a headless Chrome instance (or at minimum a new page). Chrome's per-process memory is 100-300MB. On a Fly.io `performance-1x` machine (2GB RAM), running 3+ concurrent Chrome instances crashes the machine with OOM.

Additional leak vector: Puppeteer pages that error mid-render (timeout, WASM failure, user cancellation) may not call `page.close()` or `browser.close()`, leaving orphaned Chrome processes. Over hours of operation, these accumulate and consume all available memory.

**Specific scenario:**
```
1. User A starts 8-minute score export (Chrome instance 1: 200MB)
2. User B starts 3-minute score export (Chrome instance 2: 200MB)
3. User A's export errors at frame 1000 (WASM timeout)
4. Error handler doesn't close Chrome instance 1
5. User C starts export (Chrome instance 3: 200MB)
6. Node.js process: 100MB + 3 Chrome instances: 600MB = 700MB
7. Remaining for OS + FFmpeg: 1.3GB -- tight but works
8. Repeat with 2 more failures without cleanup...
9. OOM kill. All in-progress exports lost.
```

**Consequences:**
- Machine runs out of memory and gets killed by OOM killer
- All in-progress exports for all users are lost
- Fly.io auto-restarts machine, causing cold start delay for next request
- Unpredictable: works fine with 1 user, crashes with 2-3

**Prevention:**
1. **Use a browser pool with max concurrency:**
   ```typescript
   const MAX_CONCURRENT_RENDERS = 2; // For 2GB machine

   class BrowserPool {
     private semaphore = new Semaphore(MAX_CONCURRENT_RENDERS);
     private browser: Browser | null = null;

     async acquire(): Promise<Page> {
       await this.semaphore.acquire();
       if (!this.browser) {
         this.browser = await puppeteer.launch({ /* ... */ });
       }
       return this.browser.newPage();
     }

     async release(page: Page): Promise<void> {
       try { await page.close(); } catch {}
       this.semaphore.release();
     }
   }
   ```

2. **Always close pages in finally blocks:**
   ```typescript
   const page = await pool.acquire();
   try {
     await renderExport(page, settings);
   } finally {
     await pool.release(page);
   }
   ```

3. **Monitor Chrome process count and memory:**
   ```typescript
   import { execSync } from 'child_process';

   function getChromeProcessCount(): number {
     try {
       const output = execSync('pgrep -c chrome').toString().trim();
       return parseInt(output, 10);
     } catch { return 0; }
   }
   ```

4. **Recycle browser after N renders to prevent memory creep:**
   ```typescript
   private renderCount = 0;
   private readonly MAX_RENDERS_BEFORE_RECYCLE = 10;

   async release(page: Page): Promise<void> {
     await page.close();
     this.renderCount++;
     if (this.renderCount >= this.MAX_RENDERS_BEFORE_RECYCLE) {
       await this.browser?.close();
       this.browser = null;
       this.renderCount = 0;
     }
     this.semaphore.release();
   }
   ```

5. **Set kill_timeout in fly.toml** to allow graceful shutdown:
   ```toml
   [processes]
   app = "node server.js"

   kill_timeout = 120  # 2 minutes for in-progress renders to complete
   ```

**Detection:**
- `dmesg` shows OOM killer messages
- Fly.io dashboard shows memory at 100% before crash
- Concurrent exports cause all exports to fail simultaneously
- Chrome processes accumulate: `ps aux | grep chrome` shows dozens

**Recovery cost:** MEDIUM (4-6 hours)
- Implement browser pool with semaphore
- Add finally-block cleanup
- Add process monitoring
- Load test with concurrent requests

**Phase to address:** Backend service architecture -- design before implementing render endpoint

---

### Pitfall 6: Screenshot-to-FFmpeg Pipe Backpressure Deadlock

**What goes wrong:**
Puppeteer captures PNG screenshots (100KB-500KB each at 1920x1080). These are written to FFmpeg's stdin via a Node.js child process pipe. Node.js pipes have a buffer limit (~16KB by default, configurable up to ~1MB). If FFmpeg can't consume frames as fast as Puppeteer produces them, the pipe buffer fills up. `ffmpegProcess.stdin.write(buffer)` returns `false` (backpressure signal). If the code ignores this signal and keeps writing, Node.js buffers frames in memory, eventually causing OOM.

If the code respects backpressure by awaiting drain events, but FFmpeg is waiting for more data to start encoding (codec startup delay), a deadlock can occur: Puppeteer waits for FFmpeg to drain, FFmpeg waits for enough frames to start encoding.

**Critical detail:** H.264 encoding uses a lookahead buffer. With default settings, FFmpeg buffers several frames before emitting any output. During this startup period, stdin appears "full" even though FFmpeg hasn't started processing yet.

**Consequences:**
- Node.js memory grows unbounded (hundreds of MB of buffered PNG data)
- Deadlock: render process hangs indefinitely
- OOM crash kills the export
- Partial video file left on disk (corrupted, unusable)

**Prevention:**
1. **Respect backpressure with proper drain handling:**
   ```typescript
   async function writeFrame(stdin: Writable, buffer: Buffer): Promise<void> {
     const canWrite = stdin.write(buffer);
     if (!canWrite) {
       await new Promise<void>((resolve) => stdin.once('drain', resolve));
     }
   }
   ```

2. **Use FFmpeg settings that minimize startup buffering:**
   ```bash
   ffmpeg -f image2pipe -framerate 30 -i pipe:0 \
     -c:v libx264 \
     -preset ultrafast \     # Minimal lookahead
     -tune zerolatency \     # No frame reordering
     -pix_fmt yuv420p \
     -movflags +faststart \  # Metadata at beginning
     output.mp4
   ```
   Note: `ultrafast` and `zerolatency` produce larger files but eliminate encoding delay. For final quality, re-encode after capture if needed.

3. **Write frames to disk instead of piping (fallback approach):**
   ```typescript
   // Simpler, more debuggable, avoids backpressure entirely
   const framePath = path.join(tempDir, `frame-${String(frame).padStart(6, '0')}.png`);
   const buffer = await page.screenshot({ encoding: 'binary' });
   await fs.writeFile(framePath, buffer);

   // After all frames captured:
   // ffmpeg -framerate 30 -i frame-%06d.png -c:v libx264 output.mp4
   ```
   Trade-off: Disk I/O is slower but eliminates pipe complexity. Good for Phase 1; optimize to pipe later.

4. **Monitor pipe buffer in development:**
   ```typescript
   ffmpegProcess.stdin.on('error', (err) => {
     console.error('[FFmpeg] stdin error:', err.message);
   });

   ffmpegProcess.stderr.on('data', (data) => {
     // FFmpeg writes progress to stderr
     console.log('[FFmpeg]', data.toString());
   });
   ```

**Detection:**
- Export hangs at a specific frame number and never progresses
- Node.js memory grows linearly during export
- FFmpeg stderr shows no encoding progress
- Works for short exports (< 100 frames) but hangs for long ones

**Recovery cost:** MEDIUM (3-5 hours)
- Implement drain-aware write
- Or switch to disk-based frame capture
- Test with 1000+ frame exports

**Phase to address:** FFmpeg integration -- implement correct pipe handling from the start

---

## Moderate Pitfalls

Mistakes that cause degraded quality, poor UX, or significant debugging time.

---

### Pitfall 7: Viewport and DPI Mismatch Produces Wrong Resolution

**What goes wrong:**
Puppeteer's default viewport is 800x600 with `deviceScaleFactor: 1`. The existing app uses `WIDTH = 980` (RegularRenderer line 19) and calculates container dimensions from background image dimensions scaled to this width. If the Puppeteer viewport doesn't match the expected container dimensions, the score renders at wrong size or gets clipped.

Additionally, `deviceScaleFactor` controls the actual pixel output. A viewport of 1920x1080 with `deviceScaleFactor: 1` produces a 1920x1080 screenshot. With `deviceScaleFactor: 2`, it produces a 3840x2160 screenshot. If the user requests 1080p but the code sets `deviceScaleFactor: 2`, the export is 4K -- four times the expected file size and encoding time.

**Specific issue with the existing code:** The `setDims` function (line 106-110) scales dimensions based on `WIDTH / w`. If the background image is 1920x1080, it calculates `containerWidth = 980` and `containerHeight = 551`. The Puppeteer viewport must match these dimensions, NOT the original 1920x1080, because that's what the React app renders at internally.

**Consequences:**
- Score appears too small or too large in export
- Score clipped at edges (viewport smaller than container)
- Export file size 4x expected (wrong deviceScaleFactor)
- Encoding takes 4x longer
- Aspect ratio distorted

**Prevention:**
1. **Match viewport to the user's intended output resolution, not internal dimensions:**
   ```typescript
   // The app internally renders at WIDTH=980 scale
   // For 1920x1080 output, set viewport to 1920x1080
   // and use deviceScaleFactor to control actual pixel resolution
   await page.setViewport({
     width: 1920,
     height: 1080,
     deviceScaleFactor: 1, // 1x = 1920x1080 output
   });
   ```

2. **Alternatively, render at internal dimensions and upscale:**
   ```typescript
   // Match internal render dimensions
   await page.setViewport({
     width: 980,
     height: 551,
     deviceScaleFactor: 2, // 2x = 1960x1102 output (close to 1080p)
   });
   ```

3. **Explicitly set dimensions in the URL or via page.evaluate:**
   ```typescript
   // Pass desired output dimensions to the app
   const url = `http://localhost:3000/render?width=1920&height=1080`;
   await page.goto(url);
   ```

4. **Verify screenshot dimensions before piping to FFmpeg:**
   ```typescript
   const screenshot = await page.screenshot({ encoding: 'binary' });
   const { width, height } = await sharp(screenshot).metadata();
   if (width !== expectedWidth || height !== expectedHeight) {
     throw new Error(`Screenshot ${width}x${height} != expected ${expectedWidth}x${expectedHeight}`);
   }
   ```

**Detection:**
- Output video resolution doesn't match requested resolution
- Score appears tiny in center of frame (viewport too large)
- Score cropped (viewport too small)
- File size much larger than expected

**Recovery cost:** LOW (2-3 hours)
- Set correct viewport dimensions
- Add dimension verification
- Test at multiple output resolutions

**Phase to address:** Puppeteer setup -- test viewport configuration early

---

### Pitfall 8: WebSocket Connection Drops Mid-Export Without Recovery

**What goes wrong:**
A video export for a 5-minute score at 30fps requires capturing 9,000 frames. At 100ms per frame, that's 15 minutes of rendering. During this time, the WebSocket connection between browser and server can drop due to:
- Network interruption (mobile, WiFi switch)
- Browser tab goes to sleep (background tab throttling)
- Proxy/load balancer timeout (default 60s idle)
- Fly.io proxy timeout

When the WebSocket drops, the browser loses all progress updates. The user has no idea if the export is still running. They may close the tab, start a new export, or believe it failed.

**Critical issue:** If the backend uses WebSocket connection state to track active exports, a dropped connection may trigger export cancellation -- wasting all the rendering work done so far.

**Consequences:**
- User thinks export failed (no progress updates)
- User starts duplicate exports (resource waste)
- Backend cancels working export on disconnect
- 15 minutes of rendering wasted

**Prevention:**
1. **Decouple export lifecycle from WebSocket connection:**
   ```typescript
   // Export has its own ID and lifecycle
   const exportId = crypto.randomUUID();

   // WebSocket only streams progress, doesn't control lifecycle
   ws.on('close', () => {
     // DO NOT cancel the export
     console.log(`WebSocket closed for export ${exportId}, export continues`);
   });
   ```

2. **Support reconnection with state sync:**
   ```typescript
   // Client reconnects with export ID
   ws.on('message', (msg) => {
     const { type, exportId } = JSON.parse(msg);
     if (type === 'reconnect') {
       const state = exports.get(exportId);
       ws.send(JSON.stringify({
         type: 'state_sync',
         progress: state.progress,
         status: state.status,
       }));
     }
   });
   ```

3. **HTTP polling fallback for progress:**
   ```typescript
   // REST endpoint as WebSocket fallback
   app.get('/api/exports/:id/status', (req, res) => {
     const state = exports.get(req.params.id);
     res.json({
       progress: state?.progress ?? 0,
       status: state?.status ?? 'unknown',
     });
   });
   ```

4. **Implement heartbeat/keep-alive:**
   ```typescript
   // Server pings every 30 seconds
   const pingInterval = setInterval(() => {
     if (ws.readyState === WebSocket.OPEN) {
       ws.ping();
     }
   }, 30000);

   ws.on('pong', () => { /* connection alive */ });
   ws.on('close', () => clearInterval(pingInterval));
   ```

5. **Client-side reconnection with exponential backoff:**
   ```typescript
   function connectWebSocket(exportId: string) {
     const ws = new WebSocket(`wss://api/ws?exportId=${exportId}`);
     let retries = 0;

     ws.onclose = () => {
       const delay = Math.min(1000 * Math.pow(2, retries), 30000);
       retries++;
       setTimeout(() => connectWebSocket(exportId), delay);
     };
   }
   ```

**Detection:**
- Users report "export stuck" but server logs show it's still running
- Duplicate exports for same content in server logs
- WebSocket close events without corresponding export cancellation
- Progress bar stops updating mid-export

**Recovery cost:** MEDIUM (4-6 hours)
- Decouple export lifecycle from WebSocket
- Add reconnection support
- Add HTTP polling fallback
- Test with simulated disconnections

**Phase to address:** WebSocket implementation -- design for disconnection from the start

---

### Pitfall 9: Background Image and Data URL Loading Failure in Headless Chrome

**What goes wrong:**
The RegularRenderer loads background images from a URL (line 164: `img.src = bgUrl`). In the browser, this is a blob URL from the user's file upload. In headless Chrome on the backend, the image must be provided differently:
- Blob URLs don't transfer between browser contexts
- File paths aren't accessible from inside the Docker container
- HTTP URLs require the image to be served somewhere accessible

If the background image fails to load, `setDims` is never called (it's inside `img.onload`), so `containerWidth` and `containerHeight` remain 0. The component returns `<div>Select background</div>` (line 718) instead of rendering the score.

**Consequences:**
- Export produces video of "Select background" text instead of score
- No error thrown -- the component silently fails to render
- Score region positioning is wrong (depends on background dimensions)
- Entire export is wasted

**Prevention:**
1. **Convert background images to data URLs before passing to headless Chrome:**
   ```typescript
   // Backend receives image as buffer from upload
   const bgBase64 = bgImageBuffer.toString('base64');
   const bgMimeType = 'image/png'; // Detect from actual file
   const bgDataUrl = `data:${bgMimeType};base64,${bgBase64}`;

   // Pass to page via URL params or page.evaluate
   await page.evaluate((dataUrl) => {
     // Store in app state for RegularRenderer to use
     window.__renderConfig = { bgUrl: dataUrl };
   }, bgDataUrl);
   ```

2. **Serve images from the backend HTTP server:**
   ```typescript
   // Backend serves uploaded images at a known URL
   app.get('/api/render-assets/:id', (req, res) => {
     const asset = renderAssets.get(req.params.id);
     res.type(asset.mimeType).send(asset.buffer);
   });

   // Pass URL that's accessible from headless Chrome
   const bgUrl = `http://localhost:${port}/api/render-assets/${assetId}`;
   ```

3. **Wait for background image to load before starting capture:**
   ```typescript
   await page.waitForFunction(() => {
     // Check that container dimensions are set (background loaded)
     const container = document.querySelector('.preview-score');
     return container && container.offsetWidth > 0 && container.offsetHeight > 0;
   }, { timeout: 10000 });
   ```

4. **Handle missing background gracefully (render without it):**
   ```typescript
   // RegularRenderer already handles no bgUrl: setDims(1920, 1080)
   // Ensure the backend sends explicit dimensions when no background
   if (!bgUrl) {
     await page.evaluate((w, h) => {
       window.__renderConfig = { width: w, height: h };
     }, width, height);
   }
   ```

**Detection:**
- Export video shows "Select background" text
- Export video has no background image (just score on white)
- containerWidth/containerHeight are 0 in debug logs
- Background appears in browser preview but not in export

**Recovery cost:** LOW (2-3 hours)
- Convert to data URLs or serve from backend
- Add load-state verification
- Test with and without background images

**Phase to address:** Data transfer design -- how settings and assets reach the headless Chrome page

---

### Pitfall 10: Fly.io Cold Start Kills First Export Request

**What goes wrong:**
With Fly.io `auto_stop_machines: 'stop'`, machines stop when idle to save costs. When a new export request arrives, Fly.io starts the machine, which must:
1. Boot the VM (~500ms-2s)
2. Start Node.js process (~500ms)
3. Launch Chrome (~1-3s with Docker)
4. The export request then needs to navigate to the page, load WASM, etc.

Total cold start: 3-7 seconds. If the client-side has a short timeout (e.g., 5 seconds for WebSocket connection), it may timeout before the server is ready.

With `auto_stop_machines: 'suspend'`, the machine state is preserved in storage and resume is faster (~500ms), but this requires a volume and costs storage.

**Additional issue: Chrome launch on cold start.** If Chrome is launched on-demand per request (not pre-launched), the first request pays an additional 2-3 second penalty. If Chrome is launched at server startup, it consumes memory even when idle (before auto-stop kicks in).

**Consequences:**
- First export after idle period fails or takes much longer
- User sees "connection timeout" or "export failed" on first attempt
- Retry works (machine is warm) but UX is poor
- If auto-stop is aggressive, EVERY export request may be a cold start

**Prevention:**
1. **Use `auto_stop_machines: 'suspend'` instead of `'stop'`:**
   ```toml
   # fly.toml
   [http_service]
     auto_stop_machines = 'suspend'  # Faster resume than cold boot
     auto_start_machines = true
     min_machines_running = 0
   ```

2. **Pre-launch Chrome at server startup (eager initialization):**
   ```typescript
   // server.ts
   let browser: Browser;

   async function main() {
     browser = await puppeteer.launch({ /* ... */ });
     console.log('Chrome pre-launched');

     const server = createServer(/* ... */);
     server.listen(port);
   }
   ```

3. **Client-side retry with appropriate timeout:**
   ```typescript
   // Client: expect cold start, retry with backoff
   async function startExport(settings: ExportSettings): Promise<string> {
     const MAX_RETRIES = 3;
     const INITIAL_TIMEOUT = 15000; // 15s for cold start

     for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
       try {
         const response = await fetch('/api/exports', {
           method: 'POST',
           body: JSON.stringify(settings),
           signal: AbortSignal.timeout(INITIAL_TIMEOUT),
         });
         return await response.json();
       } catch (e) {
         if (attempt === MAX_RETRIES - 1) throw e;
         await sleep(2000 * (attempt + 1));
       }
     }
   }
   ```

4. **Keep minimum 1 machine running if budget allows:**
   ```toml
   [http_service]
     min_machines_running = 1  # Always warm, ~$5-15/month
   ```

5. **Add health check endpoint that signals readiness:**
   ```typescript
   app.get('/health', async (req, res) => {
     const chromeReady = browser && browser.isConnected();
     res.status(chromeReady ? 200 : 503).json({ chrome: chromeReady });
   });
   ```

**Detection:**
- First export after period of inactivity is slow or fails
- Server logs show Chrome launch time on first request
- Fly.io dashboard shows machine start events correlating with export failures
- Subsequent exports are fast (machine warm)

**Recovery cost:** LOW (2-3 hours)
- Configure fly.toml for suspend instead of stop
- Add health check
- Add client-side retry logic
- Set appropriate timeouts

**Phase to address:** Fly.io deployment configuration -- configure before first production deploy

---

### Pitfall 11: CSS Transition on Camera Breaks Frame-Accurate Capture

**What goes wrong:**
The RegularRenderer camera has `transition: "transform 200ms ease-out"` (line 757). This means when `setTimestamp` calls `applyCamera()` and sets `translateY(-cameraY)`, the camera doesn't jump instantly -- it animates over 200ms. But Puppeteer takes the screenshot immediately after `setTimestamp` returns. The camera is mid-transition, NOT at its final position.

**Frame-accurate rendering requires:**
```
setTimestamp(t) -> camera at EXACT position for t -> screenshot
```

**What actually happens:**
```
setTimestamp(t) -> camera STARTS transitioning to position for t -> screenshot -> camera still animating
```

Each frame captures the camera at the START of its transition, not the end. The visual effect is that the camera appears to lag behind the notes by ~200ms worth of movement.

**Consequences:**
- Camera position in video is always "behind" where it should be
- Score appears to scroll with a delayed, elastic feel
- Notes animate at correct time but camera hasn't caught up yet
- Particularly noticeable at system boundaries (large camera jumps)

**Prevention:**
1. **Remove CSS transition in render mode:**
   ```typescript
   // In RegularRenderer, when rendering for export
   <div
     ref={cameraRef}
     style={{
       display: "flex",
       width: "100%",
       pointerEvents: "none",
       transition: renderMode ? "none" : "transform 200ms ease-out",
     }}
   />
   ```

2. **Force transition to complete before screenshot:**
   ```typescript
   // In Puppeteer, after setTimestamp
   await page.evaluate(() => {
     const camera = document.querySelector('[data-camera]');
     if (camera) {
       camera.style.transition = 'none';
       // Force reflow to apply
       void camera.offsetHeight;
     }
   });
   ```

3. **Set transition to 'none' at page load time:**
   ```typescript
   // In Puppeteer, before starting frame capture
   await page.evaluate(() => {
     // Kill ALL transitions for frame-accurate capture
     const style = document.createElement('style');
     style.textContent = '* { transition: none !important; }';
     document.head.appendChild(style);
   });
   ```
   This is the safest approach -- it eliminates all CSS transitions globally, ensuring every element is in its final state when the screenshot is taken.

**Detection:**
- Camera appears to "lag" in the exported video
- Compare: frame at t=5.0s should show camera at same Y as browser preview at t=5.0s
- Score jumps at system boundaries feel delayed compared to audio
- Add `console.log(cameraRef.current.style.transform)` before screenshot -- should match expected value

**Recovery cost:** LOW (1 hour)
- Inject `* { transition: none !important; }` in render mode
- Test with system-boundary seeking

**Phase to address:** Puppeteer frame capture implementation -- add before first test render

---

### Pitfall 12: Incorrect Settings Transfer Between Browser and Backend

**What goes wrong:**
The browser stores score settings across many state variables: scoreRegion, scoreColor, scoreScale, musicFont, syncAnchors (Map), animation parameters, border style, background image. All of these must be accurately transferred to the backend so headless Chrome produces identical output.

Common serialization failures:
- **`Map` serialization:** `syncAnchors` is a `Map<string, number>`. `JSON.stringify(map)` produces `{}` (empty object), not the map contents. All sync anchors are lost. The animation controller has no timing data, so all notes remain at frame 0.
- **Color format mismatch:** Browser stores colors as `#hex`, backend might receive `rgb()` or vice versa.
- **ScoreRegion precision:** Floating-point coordinates lose precision in JSON round-trip.
- **Missing defaults:** If a setting is undefined in the transfer, the RegularRenderer uses a different default than expected.

**Consequences:**
- Export has no animation (syncAnchors empty due to Map serialization)
- Wrong colors in export (color format mismatch)
- Score positioned incorrectly (scoreRegion imprecise or missing)
- Wrong font (musicFont missing, defaults to Bravura)
- Subtle: export looks "almost right" but details differ from preview

**Prevention:**
1. **Serialize Maps explicitly:**
   ```typescript
   // Serialize
   const payload = {
     ...settings,
     syncAnchors: Object.fromEntries(syncAnchors),
   };

   // Deserialize
   const syncAnchors = new Map(Object.entries(payload.syncAnchors));
   ```

2. **Create a strict schema/interface for export settings:**
   ```typescript
   interface ExportSettings {
     xml: string;              // MusicXML content
     bgImage?: Buffer;         // Background image data
     audioFile: Buffer;        // Audio file data
     scoreRegion: { x: number; y: number; width: number; height: number } | null;
     scoreColor: string;       // Always #RRGGBB
     scoreScale: number;       // 0.5 to 1.5
     musicFont: string;        // Bravura | Petaluma | Leland | Gootville | Leipzig
     scoreBorder: string;      // none | line | ornate | flourish
     syncAnchors: Record<string, number>;  // Event ID -> timestamp
     fps: number;              // 30 default
     width: number;            // Output width
     height: number;           // Output height
     activeNoteheadColor: string;
     activeNoteheadScale: number;
     activeNoteheadAnimationEntryMs: number;
     activeNoteheadAnimationHoldMs: number;
     activeNoteheadAnimationExitMs: number;
     colorFullNote: boolean;
   }
   ```

3. **Validate settings on the backend before rendering:**
   ```typescript
   function validateSettings(settings: ExportSettings): string[] {
     const errors: string[] = [];
     if (!settings.xml) errors.push('Missing MusicXML');
     if (!settings.audioFile) errors.push('Missing audio');
     if (Object.keys(settings.syncAnchors).length === 0) {
       errors.push('syncAnchors is empty -- Map serialization likely failed');
     }
     return errors;
   }
   ```

4. **Pixel-comparison test:** Render the same frame in browser and backend, compare screenshots pixel-by-pixel. Any difference reveals a settings transfer issue.

**Detection:**
- Export has no note animations (syncAnchors empty)
- Colors differ between preview and export
- Score position/size differs
- Font differs
- Test: `JSON.stringify(new Map([['a', 1]]))` returns `'{}'` -- this is the Map bug

**Recovery cost:** LOW (2-3 hours)
- Fix Map serialization
- Add validation
- Add pixel-comparison test

**Phase to address:** Data transfer API design -- validate serialization round-trip before building render pipeline

---

## Minor Pitfalls

Mistakes that cause annoyance or minor quality issues but are easily fixable.

---

### Pitfall 13: FFmpeg Output Not Web-Compatible (Missing faststart, Wrong Codec)

**What goes wrong:**
FFmpeg's default H.264 encoding produces valid MP4 files, but browsers require specific settings for smooth playback. Missing `-movflags +faststart` means the `moov` atom (metadata) is at the end of the file, requiring full download before playback starts. Wrong pixel format (`yuv444p` instead of `yuv420p`) causes some browsers/devices to refuse playback.

**Prevention:**
```bash
ffmpeg -f image2pipe -framerate 30 -i pipe:0 \
  -i audio.mp3 \
  -c:v libx264 \
  -preset medium \
  -crf 18 \              # High quality (lower = better, 0-51 range)
  -pix_fmt yuv420p \     # Required for browser compatibility
  -c:a aac -b:a 192k \   # AAC audio for MP4
  -movflags +faststart \ # Metadata at beginning for streaming
  -shortest \            # Trim to shorter of audio/video
  output.mp4
```

**Detection:** Video won't play in browser, or starts playback only after full download.

**Recovery cost:** LOW (30 minutes) -- adjust FFmpeg flags.

**Phase to address:** FFmpeg encoding implementation.

---

### Pitfall 14: No Cleanup of Temporary Files After Export

**What goes wrong:**
Each export may produce temporary files: frame PNGs (if not piping), intermediate video, uploaded audio/image files. On Fly.io, the writable filesystem is ephemeral but limited (~8GB). Without cleanup, accumulated temp files fill the disk.

**Prevention:**
```typescript
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';

async function renderExport(settings: ExportSettings) {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'export-'));
  try {
    await captureFrames(tempDir, settings);
    await encodeVideo(tempDir, settings);
    return path.join(tempDir, 'output.mp4');
  } finally {
    // Clean up even on error
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}
```

**Detection:** `df -h` inside Docker shows disk filling up over time.

**Recovery cost:** LOW (1 hour).

**Phase to address:** Backend service implementation.

---

### Pitfall 15: Progress Reporting Is Inaccurate or Jumpy

**What goes wrong:**
Naive progress calculation: `progress = currentFrame / totalFrames * 100`. But frame capture time varies wildly (50ms for simple frames, 300ms for frames with many animated notes). Progress appears to slow down and speed up unpredictably.

Additionally, FFmpeg encoding adds time after the last frame is captured. If progress is 100% when frame capture finishes, the user waits with no visible progress during encoding finalization.

**Prevention:**
1. **Weight progress by phase:**
   ```typescript
   // Frame capture: 0-85%
   // FFmpeg finalization: 85-95%
   // Audio muxing: 95-100%
   const captureProgress = (currentFrame / totalFrames) * 85;
   ```

2. **Smooth progress updates (don't send every frame):**
   ```typescript
   // Send progress every 1% or every 2 seconds, whichever comes first
   const lastProgressTime = 0;
   const lastProgressPercent = 0;

   if (percent - lastProgressPercent >= 1 || now - lastProgressTime >= 2000) {
     ws.send(JSON.stringify({ type: 'progress', percent }));
   }
   ```

**Detection:** Progress bar jumps between values or stalls at 99%.

**Recovery cost:** LOW (1-2 hours).

**Phase to address:** WebSocket progress implementation.

---

### Pitfall 16: Docker Image Too Large (Slow Deploys)

**What goes wrong:**
Chrome (~300MB), FFmpeg (~100MB), Node.js (~100MB), npm modules, fonts -- the Docker image easily exceeds 1GB. On Fly.io, large images cause slow deployments (5-10 minutes) and slow cold starts (pulling image from registry).

**Prevention:**
1. **Use multi-stage builds:**
   ```dockerfile
   # Build stage
   FROM node:20-slim AS builder
   WORKDIR /app
   COPY package*.json ./
   RUN npm ci --production
   COPY . .

   # Runtime stage
   FROM ghcr.io/puppeteer/puppeteer:latest
   # Puppeteer image already includes Chrome
   RUN apt-get update && apt-get install -y ffmpeg fonts-liberation fonts-noto \
     && rm -rf /var/lib/apt/lists/*
   COPY --from=builder /app /app
   WORKDIR /app
   ```

2. **Use Puppeteer's official Docker image** as base (already includes Chrome + dependencies).

3. **Install only needed FFmpeg codecs** if using a custom FFmpeg build.

**Detection:** `fly deploy` takes > 5 minutes. `docker images` shows image > 1.5GB.

**Recovery cost:** MEDIUM (3-4 hours) -- restructure Dockerfile.

**Phase to address:** Docker setup -- optimize early, not after.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Severity | Mitigation |
|-------------|---------------|----------|------------|
| Docker image setup | Missing fonts for text rendering (#3) | Critical | Install fonts-liberation, fonts-noto; verify with score containing lyrics |
| Docker image setup | Image too large, slow deploys (#16) | Minor | Multi-stage build, use Puppeteer official image as base |
| Backend API design | Map serialization loses syncAnchors (#12) | Critical | Use Object.fromEntries/Object.entries; validate round-trip |
| Backend API design | Background image not accessible (#9) | Moderate | Convert to data URL or serve from backend HTTP |
| Puppeteer integration | WASM not ready on controller access (#2) | Critical | Poll for window.rendererReady; generous timeout |
| Puppeteer integration | Viewport/DPI mismatch (#7) | Moderate | Match viewport to output resolution; verify screenshot dimensions |
| Puppeteer integration | CSS transitions break frame accuracy (#11) | Moderate | Inject `* { transition: none !important; }` |
| Puppeteer integration | Virtualization hides notes in render (#1) | Critical | Disable virtualization in render mode |
| FFmpeg encoding | Pipe backpressure deadlock (#6) | Critical | Drain-aware writes or disk-based fallback |
| FFmpeg encoding | Frame timing drift causes desync (#4) | Critical | Use frame index only, verify total frame count |
| FFmpeg encoding | Output not web-compatible (#13) | Minor | yuv420p, movflags +faststart, AAC audio |
| WebSocket progress | Connection drops mid-export (#8) | Moderate | Decouple lifecycle, reconnection, HTTP fallback |
| WebSocket progress | Inaccurate progress reporting (#15) | Minor | Weight by phase, smooth updates |
| Concurrent renders | Chrome process leak and OOM (#5) | Critical | Browser pool with semaphore, finally-block cleanup |
| Fly.io deployment | Cold start kills first request (#10) | Moderate | suspend mode, pre-launch Chrome, client retry |
| Fly.io deployment | Temp files fill disk (#14) | Minor | Clean up in finally blocks, use temp directories |

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| #1 Virtualization hides notes | MEDIUM (4-8h) | Add renderMode prop; skip virtualization in render path |
| #2 WASM not ready | LOW (2-4h) | Add readiness flag; poll in Puppeteer; generous timeout |
| #3 Missing fonts in Docker | LOW (1-2h) | Add font packages to Dockerfile |
| #4 Frame timing drift | LOW (2-3h) | Fix frame counting; add duration verification |
| #5 Chrome process leak/OOM | MEDIUM (4-6h) | Browser pool; finally-block cleanup; process monitoring |
| #6 Pipe backpressure deadlock | MEDIUM (3-5h) | Drain-aware writes or disk fallback |
| #7 Viewport/DPI mismatch | LOW (2-3h) | Set correct viewport; verify dimensions |
| #8 WebSocket drops | MEDIUM (4-6h) | Decouple lifecycle; reconnection; HTTP fallback |
| #9 Background image failure | LOW (2-3h) | Data URLs or backend-served assets |
| #10 Cold start timeout | LOW (2-3h) | fly.toml config; client retry; health check |
| #11 CSS transition lag | LOW (1h) | Inject transition:none in render mode |
| #12 Settings serialization | LOW (2-3h) | Fix Map handling; add validation |
| #13 FFmpeg codec compat | LOW (30min) | Correct FFmpeg flags |
| #14 Temp file cleanup | LOW (1h) | Finally-block cleanup; temp directories |
| #15 Progress inaccuracy | LOW (1-2h) | Phase-weighted progress |
| #16 Docker image size | MEDIUM (3-4h) | Multi-stage build |

---

## Quality Gate Checklist

Before declaring each phase complete, verify:

**Docker Image:**
- [ ] Score with lyrics/text markings renders correctly (fonts installed)
- [ ] Music notation fonts (Bravura, Petaluma, etc.) render correctly
- [ ] Image size < 1.5GB
- [ ] Chrome launches successfully inside container
- [ ] FFmpeg available and functional

**Data Transfer:**
- [ ] syncAnchors round-trips correctly (Map to JSON and back)
- [ ] All settings produce identical output vs browser preview
- [ ] Background image loads in headless Chrome
- [ ] MusicXML content transfers without corruption

**Puppeteer Frame Capture:**
- [ ] window.animationController exists after page load (readiness check)
- [ ] All pages visible when rendering (virtualization disabled or handled)
- [ ] CSS transitions disabled for frame-accurate capture
- [ ] Screenshot resolution matches requested output resolution
- [ ] First frame and last frame render correctly

**FFmpeg Encoding:**
- [ ] Audio and video in sync (test at beginning, middle, and end)
- [ ] Frame count matches expected: `ceil(duration * fps)`
- [ ] Output plays in browser (yuv420p, faststart, AAC)
- [ ] Pipe backpressure handled (test with 1000+ frame export)

**WebSocket Progress:**
- [ ] Progress updates reach browser during export
- [ ] Export continues if WebSocket disconnects
- [ ] Client can reconnect and see current progress
- [ ] Export completion triggers download

**Concurrent Renders:**
- [ ] Two simultaneous exports complete successfully
- [ ] Failed export doesn't leak Chrome processes
- [ ] Memory stays bounded during concurrent operation
- [ ] Queue/rejection for excess concurrent requests

**Fly.io Deployment:**
- [ ] Cold start export succeeds (may be slower)
- [ ] Machine auto-stops when idle
- [ ] Machine auto-starts on new request
- [ ] Temp files cleaned up after export

---

## Sources

### Primary Sources (HIGH confidence)

**Codebase analysis:**
- `/Users/emirahmed/Desktop/Manuscript/renderer/src/renderers/RegularRenderer.tsx` -- virtualization logic (lines 262-300, 770-797), camera with CSS transition (line 757), setTimestamp (lines 526-668), animationController exposure (lines 671-715)
- `/Users/emirahmed/Desktop/Manuscript/renderer/src/lib/animationController.ts` -- frame-by-frame API, synchronous setTimestamp/setFrame
- `/Users/emirahmed/Desktop/Manuscript/renderer/src/hooks/useVerovio.ts` -- WASM initialization, font loading, async rendering pipeline

**Official documentation:**
- [Puppeteer Docker Guide](https://pptr.dev/guides/docker) -- Official Docker image, required flags, non-root user setup
- [Puppeteer Troubleshooting](https://pptr.dev/troubleshooting) -- Missing dependencies, shared memory, sandbox configuration
- [Puppeteer Viewport API](https://pptr.dev/api/puppeteer.viewport) -- deviceScaleFactor, width/height configuration
- [Puppeteer ScreenshotOptions](https://pptr.dev/api/puppeteer.screenshotoptions) -- encoding, optimizeForSpeed, quality settings
- [FFmpeg Documentation](https://ffmpeg.org/ffmpeg.html) -- rawvideo input, image2pipe, codec options
- [FFmpeg Formats Documentation](https://ffmpeg.org/ffmpeg-formats.html) -- image2pipe format specification
- [Fly.io Auto-stop/Auto-start](https://fly.io/docs/launch/autostop-autostart/) -- Machine lifecycle management
- [Fly.io Machine Sizing](https://fly.io/docs/machines/guides-examples/machine-sizing/) -- CPU/memory options
- [Fly.io Configuration Reference](https://fly.io/docs/reference/configuration/) -- fly.toml options, kill_timeout, processes
- [Verovio SMuFL Fonts](https://book.verovio.org/advanced-topics/smufl.html) -- Font loading in Verovio

### Secondary Sources (MEDIUM confidence)

**Puppeteer memory and concurrency:**
- [The Hidden Cost of Headless Browsers: A Puppeteer Memory Leak Journey](https://medium.com/@matveev.dina/the-hidden-cost-of-headless-browsers-a-puppeteer-memory-leak-journey-027e41291367) -- Memory leak patterns, monitoring
- [Chrome Browser Memory Leak Issue #9283](https://github.com/puppeteer/puppeteer/issues/9283) -- Chrome process memory management
- [Workaround RAM-leaking Libraries like Puppeteer](https://devforth.io/blog/how-to-simply-workaround-ram-leaking-libraries-like-puppeteer-universal-way-to-fix-ram-leaks-once-and-forever/) -- Process recycling strategy
- [Puppeteer Cluster](https://github.com/thomasdondorf/puppeteer-cluster) -- Browser pool and concurrency models

**Screenshot performance:**
- [8 Tips for Faster Puppeteer Screenshots](https://www.bannerbear.com/blog/ways-to-speed-up-puppeteer-screenshots/) -- Binary encoding, optimizeForSpeed
- [Optimize Screenshot Speed](https://screenshotone.com/blog/optimize-for-speed-when-rendering-screenshots-in-puppeteer-and-chrome-devtools-protocol/) -- CDP optimizations

**Video from screenshots:**
- [timecut: Record Web Page Animations](https://github.com/tungs/timecut) -- Frame-by-frame video from Puppeteer screenshots with FFmpeg piping
- [Producing Real-time Video with Node.js and FFmpeg](https://ofarukcaki.medium.com/producing-real-time-video-with-node-js-and-ffmpeg-a59ac27461a1) -- stdin pipe pattern

**WebSocket reliability:**
- [WebSocket Reliability in Realtime](https://ably.com/topic/websocket-reliability-in-realtime-infrastructure) -- Reconnection, message ordering, keep-alive
- [How to Implement Reconnection Logic for WebSockets](https://oneuptime.com/blog/post/2026-01-27-websocket-reconnection/view) -- Exponential backoff patterns
- [WebSocket Architecture Best Practices](https://ably.com/topic/websocket-architecture-best-practices) -- Scaling, state management

**FFmpeg audio sync:**
- [Correcting Audio/Video Sync with FFmpeg ITSOFFSET](https://wjwoodrow.wordpress.com/2013/02/04/correcting-for-audiovideo-sync-issues-with-the-ffmpeg-programs-itsoffset-switch/) -- Timestamp offset correction
- [VFR vs CFR](https://www.encodex.se/guides/vfr-vs-cfr.html) -- Why constant frame rate matters

**Fly.io deployment:**
- [Fly.io Pricing](https://fly.io/docs/about/pricing/) -- Performance-1x: 1 vCPU, 2GB minimum
- [Machine Suspend and Resume](https://fly.io/docs/reference/suspend-resume/) -- Faster cold starts via suspend

### Tertiary Sources (LOW confidence)

**Font loading in headless Chrome:**
- [Puppeteer Font Issues](https://www.browserless.io/blog/puppeteer-print) -- Font rendering hinting, user-agent workarounds
- [Fontconfig Bundle for Headless Chrome](https://gist.github.com/nat-n/c3429d29f2478ccb3de243810bb12956) -- Custom font installation for Lambda/Docker
- [Bravura Font Repository](https://github.com/steinbergmedia/bravura) -- WOFF2 format available for web embedding

---

*Research completed: 2026-02-09*
*Domain: Backend video export service for music notation renderer*
*Focus: Pitfalls when adding headless browser rendering, FFmpeg encoding, WebSocket progress, and Fly.io deployment to existing browser-based animation tool*
