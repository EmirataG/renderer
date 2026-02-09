# Technology Stack - Backend Video Export Service

**Project:** Manuscript Renderer - v1.4 Backend Video Export
**Researched:** 2026-02-09
**Confidence:** HIGH

## Executive Summary

The backend video export service needs five new capabilities: an HTTP server, headless browser control, video encoding, real-time progress communication, and containerized deployment. The recommended stack is Fastify (HTTP + WebSocket), Puppeteer (headless Chrome), FFmpeg via child_process.spawn (frame encoding), and Docker on Fly.io (deployment).

Key design principle: the frontend already exposes `window.animationController.setFrame(frameNumber, fps)` as a synchronous API. The backend capture loop is therefore straightforward -- call `page.evaluate()` to set a frame, then `page.screenshot()` to capture it, and pipe the PNG buffer directly to FFmpeg's stdin. No wrapper library is needed for FFmpeg; direct `child_process.spawn` with `image2pipe` input is simpler, more debuggable, and avoids the deprecated fluent-ffmpeg.

**Zero new frontend dependencies.** All additions are backend-only in a separate `server/` directory.

---

## Recommended Stack

### Runtime

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Node.js | 22.x LTS (Jod) | Server runtime | Current LTS, supported until 2027-04-30, required by Puppeteer 24 (Node 18+) |
| TypeScript | ~5.9.x | Type safety | Already used in the frontend; consistent tooling |

**Confidence:** HIGH -- Node.js 22.22.0 is latest LTS per [nodejs.org releases](https://nodejs.org/en/about/previous-releases). Puppeteer 24 requires Node 18+ per [Puppeteer system requirements](https://pptr.dev/guides/system-requirements).

### HTTP Server

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| fastify | ^5.7.4 | HTTP server framework | 3-4x faster than Express, built-in TypeScript, Pino logger included, official WebSocket plugin |

**Why Fastify over Express:**
- 70k-80k req/s vs Express's 20k-30k req/s in benchmarks
- First-class TypeScript support (written in TypeScript)
- Built-in JSON schema validation for request/response
- Pino structured logging included by default
- Official plugin ecosystem: `@fastify/websocket`, `@fastify/cors`, `@fastify/multipart`, `@fastify/static`
- Fastify v5 is the current major, actively maintained by the OpenJS Foundation

**Confidence:** HIGH -- v5.7.4 verified via [npm](https://www.npmjs.com/package/fastify) and [GitHub releases](https://github.com/fastify/fastify/releases).

### Fastify Plugins

| Plugin | Version | Purpose | Why |
|--------|---------|---------|-----|
| @fastify/websocket | ^11.2.0 | WebSocket for progress streaming | Official plugin, uses `ws` under the hood, routes share auth/hooks |
| @fastify/cors | ^11.2.0 | CORS for cross-origin requests | Frontend (different port/domain) needs to call backend |
| @fastify/multipart | ^9.4.0 | File upload (MusicXML + audio) | Stream-based upload, configurable limits, official Fastify plugin |
| @fastify/static | ^9.0.0 | Serve built frontend in production | Serve the Vite build output from the same server |

**Why @fastify/websocket over raw ws:**
- Route integration: WebSocket endpoints share Fastify's hook pipeline (auth, validation, error handling)
- Encapsulation: WebSocket routes respect Fastify plugin scoping
- Uses `ws` (v8.19.0) under the hood -- the most battle-tested WebSocket library for Node.js
- Built-in TypeScript types (also install `@types/ws` for underlying types)

**Confidence:** HIGH -- all versions verified via npm. @fastify/websocket last published 5 months ago, actively maintained.

### Headless Browser

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| puppeteer | ^24.37.2 | Headless Chrome for frame capture | Industry standard, bundles Chrome for Testing, frame-by-frame control via page.evaluate() |

**Why Puppeteer (not Playwright):**
- Only need Chrome (not Firefox/Safari) -- Puppeteer is simpler for single-browser use
- Official Docker image available at `ghcr.io/puppeteer/puppeteer`
- `page.evaluate()` directly calls `window.animationController.setFrame()` -- synchronous, no timing issues
- `page.screenshot({ encoding: 'binary', optimizeForSpeed: true })` returns a Buffer for direct pipe to FFmpeg
- Deeply integrated with Chrome DevTools Protocol for precise control

**Critical API details for this project:**
```typescript
// Set viewport to match target resolution
await page.setViewport({ width: 1920, height: 1080 });

// Navigate to built frontend served by Fastify
await page.goto('http://localhost:PORT/render?...', { waitUntil: 'networkidle0' });

// Frame-by-frame capture loop (synchronous per frame)
for (let frame = 0; frame < totalFrames; frame++) {
  await page.evaluate((f, fps) => {
    window.animationController.setFrame(f, fps);
  }, frame, fps);

  const buffer = await page.screenshot({
    encoding: 'binary',
    type: 'png',
    optimizeForSpeed: true,  // Faster PNG encoding
  });

  ffmpegProcess.stdin.write(buffer);
}
```

**Screenshot performance notes:**
- `optimizeForSpeed: true` enables faster PNG encoding in Chrome (available since Puppeteer v24)
- Binary encoding returns a Buffer directly, avoiding base64 encode/decode overhead
- PNG is required for `image2pipe` input to FFmpeg (lossless, no compression artifacts between frames)
- At 1920x1080, expect ~20-50ms per screenshot depending on page complexity

**Confidence:** HIGH -- v24.37.2 verified via [npm](https://www.npmjs.com/package/puppeteer). Screenshot options verified via [Puppeteer docs v24.37.2](https://pptr.dev/api/puppeteer.screenshotoptions).

### Video Encoding

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| FFmpeg (system binary) | 6.x+ | Encode PNG frames to H.264 MP4 | Industry standard, pipe-based input, no Node.js wrapper needed |
| child_process.spawn | (built-in) | Spawn FFmpeg process | Node.js native, stream stdin/stdout, no library overhead |

**Why direct child_process.spawn, NOT fluent-ffmpeg:**
- fluent-ffmpeg is [being phased out / archived](https://github.com/fluent-ffmpeg/node-fluent-ffmpeg/issues/1324) by its maintainer
- For this project, FFmpeg always does the same operation: read PNG frames from stdin, encode to H.264 MP4
- One FFmpeg command, written once, is simpler and more debuggable than a wrapper library
- Direct access to FFmpeg's stdin stream for piping screenshot buffers

**FFmpeg command for this project:**
```bash
ffmpeg -y \
  -f image2pipe -framerate 30 -i pipe:0 \
  -c:v libx264 -preset medium -crf 18 \
  -pix_fmt yuv420p \
  -movflags +faststart \
  output.mp4
```

**Command breakdown:**
- `-f image2pipe -i pipe:0`: Read PNG images from stdin
- `-framerate 30`: Input framerate (configurable, matches Puppeteer capture FPS)
- `-c:v libx264`: H.264 codec (universal browser/device playback)
- `-preset medium`: Balance of encoding speed vs compression (use `fast` for quicker exports)
- `-crf 18`: High quality (range 0-51, lower = better; 18 is visually lossless for most content)
- `-pix_fmt yuv420p`: Required for broad compatibility (Apple devices, web players)
- `-movflags +faststart`: Move moov atom to start of file for streaming playback

**Node.js spawn pattern:**
```typescript
import { spawn } from 'child_process';

const ffmpeg = spawn('ffmpeg', [
  '-y',
  '-f', 'image2pipe',
  '-framerate', String(fps),
  '-i', 'pipe:0',
  '-c:v', 'libx264',
  '-preset', 'medium',
  '-crf', '18',
  '-pix_fmt', 'yuv420p',
  '-movflags', '+faststart',
  outputPath,
]);

// Pipe each screenshot buffer
ffmpeg.stdin.write(screenshotBuffer);

// When all frames captured, signal end
ffmpeg.stdin.end();
```

**Confidence:** HIGH -- FFmpeg image2pipe with stdin is a well-documented, widely-used pattern. fluent-ffmpeg deprecation confirmed via [GitHub issue](https://github.com/fluent-ffmpeg/node-fluent-ffmpeg/issues/1324).

### Unique IDs

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| crypto.randomUUID() | (built-in) | Export job IDs | Built into Node.js since v14.17, 4x faster than nanoid, 12x faster than uuid, zero dependencies |

**Why not nanoid or uuid:**
- `crypto.randomUUID()` is native to Node.js -- zero bundle size, zero dependency risk
- 4x faster than nanoid, 12x faster than the uuid package
- Generates RFC 4122 v4 UUIDs, which is all we need for job tracking
- Available since Node.js 14.17, well within our Node 22 target

**Confidence:** HIGH -- verified via [Node.js crypto docs](https://nodejs.org/api/crypto.html#cryptorandomuuidoptions) and [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Crypto/randomUUID).

---

## Docker Configuration

### Base Image Strategy

**Use the official Puppeteer Docker image as the base**, then add FFmpeg on top.

| Layer | Image/Package | Purpose |
|-------|---------------|---------|
| Base | `ghcr.io/puppeteer/puppeteer:24` | Node.js + Chrome for Testing + system deps + fonts |
| Added | `ffmpeg` (apt-get) | Video encoding |
| Added | Application code | The export server |

**Why `ghcr.io/puppeteer/puppeteer` over building from scratch:**
- Maintained by the Puppeteer team, always matches the bundled Chrome version
- Includes all required system dependencies (fonts for CJK, dbus, etc.)
- Includes Chrome for Testing binary -- no need to install Chrome separately
- Sets `PUPPETEER_SKIP_CHROMIUM_DOWNLOAD` implicitly (Chrome already present)
- Non-root user (`pptruser`) configured for security
- Based on Node.js on Debian Bookworm

**Dockerfile outline:**
```dockerfile
FROM ghcr.io/puppeteer/puppeteer:24

# Switch to root to install FFmpeg
USER root

# Install FFmpeg
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /app

# Copy package files and install dependencies
COPY --chown=pptruser:pptruser package*.json ./
RUN npm ci --production

# Copy application code
COPY --chown=pptruser:pptruser . .

# Copy built frontend (from Vite build)
COPY --chown=pptruser:pptruser dist/ ./dist/

# Switch back to non-root user
USER pptruser

# Expose port
EXPOSE 3000

# Start server
CMD ["node", "server/index.js"]
```

**Chrome launch args for Docker:**
```typescript
const browser = await puppeteer.launch({
  headless: true,
  args: [
    '--no-sandbox',           // Required in Docker (running as non-root with SYS_ADMIN)
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage', // Use /tmp instead of /dev/shm (Docker default is 64MB)
    '--disable-gpu',           // No GPU in Docker
    '--no-first-run',
    '--no-zygote',
    '--single-process',        // Reduce memory footprint
  ],
});
```

**Confidence:** HIGH -- Puppeteer Docker image verified via [pptr.dev/guides/docker](https://pptr.dev/guides/docker) and [GitHub Container Registry](https://github.com/orgs/puppeteer/packages/container/package/puppeteer).

---

## Fly.io Deployment

### Machine Configuration

| Setting | Value | Rationale |
|---------|-------|-----------|
| Machine size | `performance-2x` | 2 vCPU, 4GB RAM -- Chrome needs ~1GB, FFmpeg needs ~512MB, Node needs ~256MB, headroom for concurrent ops |
| Region | `iad` (or nearest) | US East, low latency to most users |
| auto_stop_machines | `"stop"` | Stop when idle to save costs |
| auto_start_machines | `true` | Auto-start on incoming request |
| min_machines_running | `0` | Scale to zero when no exports |

**fly.toml outline:**
```toml
app = "manuscript-export"
primary_region = "iad"

[build]
  dockerfile = "Dockerfile"

[http_service]
  internal_port = 3000
  force_https = true
  auto_stop_machines = "stop"
  auto_start_machines = true
  min_machines_running = 0

[[vm]]
  size = "performance-2x"
  memory = "4gb"
```

**Cost estimate:** performance-2x at ~$0.0621/hr. With auto-stop, cost is only while actively rendering. A 3-minute export costs ~$0.003.

**Confidence:** MEDIUM -- Fly.io pricing and machine sizes verified via [fly.io/pricing](https://fly.io/pricing/) and [machine sizing docs](https://fly.io/docs/machines/guides-examples/machine-sizing/). Exact pricing may vary; estimate is approximate.

---

## Complete Dependency List

### Backend Production Dependencies

```bash
npm install \
  fastify@^5.7.4 \
  @fastify/websocket@^11.2.0 \
  @fastify/cors@^11.2.0 \
  @fastify/multipart@^9.4.0 \
  @fastify/static@^9.0.0 \
  puppeteer@^24.37.2
```

### Backend Dev Dependencies

```bash
npm install -D \
  @types/ws@^8.5.0 \
  @types/node@^22.0.0 \
  tsx@^4.0.0
```

**Total new npm packages: 6 production + 3 dev.**

### System Dependencies (Docker only)

| Package | Purpose |
|---------|---------|
| ffmpeg | Video encoding (apt-get in Dockerfile) |
| Chrome for Testing | Headless browser (included in Puppeteer Docker image) |
| fonts-* | CJK/Arabic/Thai font support (included in Puppeteer Docker image) |
| dbus | Chrome IPC (included in Puppeteer Docker image) |

---

## What NOT to Add

| Library | Why NOT |
|---------|---------|
| express | Fastify is faster, has better TypeScript support, and includes Pino logging |
| fluent-ffmpeg | Archived/deprecated. Direct child_process.spawn is simpler for our single-command use case |
| playwright | Overkill -- we only need Chrome, Puppeteer is simpler and has official Docker image |
| socket.io | Heavy abstraction over WebSocket. @fastify/websocket with raw `ws` is simpler for progress streaming |
| bull / bullmq | Job queue overkill for MVP. In-memory Map of active jobs is sufficient initially |
| redis | Not needed yet. Job state lives in memory. Add only if scaling to multiple machines |
| nanoid / uuid | crypto.randomUUID() is built-in, faster, zero dependencies |
| puppeteer-core | Use full `puppeteer` which bundles Chrome for Testing -- simpler Docker setup |
| sharp / canvas | No image processing needed -- Puppeteer screenshots are the raw frames |
| pino | Already included with Fastify -- do not install separately |
| ffmpeg-static | Not needed in Docker -- install ffmpeg via apt-get in the Dockerfile |

---

## Integration Architecture

### How Backend Connects to Frontend

```
Browser (client)                  Backend (server)
  |                                  |
  |-- POST /api/export ------------->|  Upload MusicXML + audio + settings
  |                                  |  Returns { jobId, wsUrl }
  |                                  |
  |<-- WebSocket connection -------->|  Connect for progress updates
  |                                  |
  |                                  |  [Server internally:]
  |                                  |  1. Serve built frontend via @fastify/static
  |                                  |  2. Launch headless Chrome (Puppeteer)
  |                                  |  3. Navigate to /render?jobId=xxx
  |                                  |  4. Frontend loads in headless Chrome
  |                                  |  5. Wait for animationController on window
  |                                  |  6. Spawn FFmpeg with image2pipe
  |                                  |  7. Loop: setFrame() -> screenshot() -> pipe to FFmpeg
  |                                  |  8. Stream progress via WebSocket
  |                                  |  9. FFmpeg produces MP4
  |                                  |
  |<-- WS: { progress: 0.45 } ------|  Progress updates
  |<-- WS: { progress: 1.0, url }---|  Complete with download URL
  |                                  |
  |-- GET /api/export/:jobId/download|  Download MP4 file
  |                                  |
```

### Key Integration Points

1. **Frontend animationController API** (already exists):
   - `window.animationController.setFrame(frameNumber, fps)` -- synchronous, updates DOM immediately
   - `window.animationController.getDuration()` -- returns audio duration in seconds
   - `window.animationController.getFps()` -- returns default FPS (30)

2. **Frontend render mode** (needs minor addition):
   - Backend serves the built frontend with a `/render` route
   - Render page loads MusicXML + settings from backend API (not file upload)
   - Disables page virtualization (all pages mounted for screenshots)
   - Scales score to fill viewport at target resolution

3. **Settings transfer**:
   - All settings (score region, colors, zoom, animation params) serialized as JSON
   - Sent in POST /api/export body alongside MusicXML and audio files
   - Render page reads settings from backend API and applies them

---

## Version Compatibility Matrix

| Package | Min Node | TypeScript | Fastify Compat | Notes |
|---------|----------|------------|----------------|-------|
| fastify 5.7.x | 20+ | Built-in | N/A | Requires Node 20+ for v5 |
| @fastify/websocket 11.x | 20+ | @types/ws | Fastify 5 | Compatible with Fastify v5 |
| @fastify/cors 11.x | 20+ | Built-in | Fastify 5 | Compatible with Fastify v5 |
| @fastify/multipart 9.x | 20+ | Built-in | Fastify 5 | Compatible with Fastify v5 |
| @fastify/static 9.x | 20+ | Built-in | Fastify 5 | Compatible with Fastify v5 |
| puppeteer 24.x | 18+ | Built-in | N/A | Bundles Chrome for Testing |

**Node.js 22 LTS satisfies all requirements.** All Fastify v5 plugins require Node 20+, which Node 22 exceeds.

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| HTTP Server | Fastify 5 | Express 5 | Express is 3-4x slower, lacks built-in TypeScript, no bundled logger |
| HTTP Server | Fastify 5 | Hono | Newer, less ecosystem, fewer official plugins |
| WebSocket | @fastify/websocket | socket.io | Heavy abstraction, auto-reconnect/rooms not needed for progress streaming |
| WebSocket | @fastify/websocket | SSE (Server-Sent Events) | One-directional only; may want client-to-server cancel later |
| Browser | Puppeteer 24 | Playwright | Multi-browser support unneeded; Puppeteer simpler for Chrome-only |
| Browser | Puppeteer 24 | CDP direct | Low-level, Puppeteer adds critical abstractions (page lifecycle, screenshot) |
| Video Encoding | FFmpeg via spawn | fluent-ffmpeg | Deprecated/archived, unnecessary abstraction for single command |
| Video Encoding | FFmpeg via spawn | ffmpeg.wasm | WASM FFmpeg is 10-50x slower than native binary, memory-constrained |
| Job IDs | crypto.randomUUID | nanoid | Built-in is faster and zero-dependency |
| Job Queue | In-memory Map | BullMQ + Redis | Overkill for MVP; add when scaling to multi-machine |
| Deployment | Fly.io | Railway | Fly.io has better Docker support, machine auto-stop, established Puppeteer patterns |
| Deployment | Fly.io | AWS ECS | More complex setup, higher operational overhead for small service |

---

## Sources

### Primary (HIGH confidence)
- [Puppeteer npm](https://www.npmjs.com/package/puppeteer) -- v24.37.2, latest
- [Puppeteer Docker Guide](https://pptr.dev/guides/docker) -- Official Docker image and configuration
- [Puppeteer System Requirements](https://pptr.dev/guides/system-requirements) -- Node 18+, platform support
- [Puppeteer ScreenshotOptions](https://pptr.dev/api/puppeteer.screenshotoptions) -- optimizeForSpeed, encoding options (v24.37.2 docs)
- [Puppeteer JavaScript Execution](https://pptr.dev/guides/javascript-execution) -- page.evaluate() behavior
- [Fastify npm](https://www.npmjs.com/package/fastify) -- v5.7.4, latest
- [Fastify Official Site](https://fastify.dev/) -- v5 documentation, plugin ecosystem
- [Fastify Logging Docs](https://fastify.dev/docs/latest/Reference/Logging/) -- Built-in Pino integration
- [@fastify/websocket npm](https://www.npmjs.com/package/@fastify/websocket) -- v11.2.0
- [@fastify/cors npm](https://www.npmjs.com/package/@fastify/cors) -- v11.2.0
- [@fastify/multipart npm](https://www.npmjs.com/package/@fastify/multipart) -- v9.4.0
- [@fastify/static npm](https://www.npmjs.com/package/@fastify/static) -- v9.0.0
- [ws npm](https://www.npmjs.com/package/ws) -- v8.19.0, underlying WebSocket lib
- [Node.js Releases](https://nodejs.org/en/about/previous-releases) -- v22.22.0 LTS (Jod)
- [Node.js crypto.randomUUID](https://nodejs.org/api/crypto.html#cryptorandomuuidoptions) -- Built-in UUID generation
- [fluent-ffmpeg deprecation](https://github.com/fluent-ffmpeg/node-fluent-ffmpeg/issues/1324) -- Phasing out announcement

### Secondary (MEDIUM confidence)
- [Fly.io Puppeteer Guide](https://fly.io/docs/app-guides/puppeteer-js-renderer/) -- Deployment patterns (marked obsolete, but Docker patterns still valid)
- [Fly.io Machine Sizing](https://fly.io/docs/machines/guides-examples/machine-sizing/) -- performance-2x specs
- [Fly.io Pricing](https://fly.io/docs/about/pricing/) -- Per-second billing
- [Fly.io Autostop/Autostart](https://fly.io/docs/launch/autostop-autostart/) -- Scale-to-zero configuration
- [Run Puppeteer with Docker on Fly.io](https://macarthur.me/posts/puppeteer-with-docker/) -- Working Dockerfile example
- [Puppeteer Screenshot Performance Tips](https://www.bannerbear.com/blog/ways-to-speed-up-puppeteer-screenshots/) -- optimizeForSpeed, binary encoding
- [Screenshot Speed Optimization](https://screenshotone.com/blog/optimize-for-speed-when-rendering-screenshots-in-puppeteer-and-chrome-devtools-protocol/) -- CDP-level optimization
- [FFmpeg Image Sequence to H.264](https://avpres.net/FFmpeg/sq_H264.html) -- image2pipe with libx264
- [Fastify vs Express Comparison 2026](https://www.index.dev/skill-vs-skill/backend-nestjs-vs-expressjs-vs-fastify) -- Performance benchmarks

### Tertiary (LOW confidence)
- [Fly.io Community: Puppeteer in Docker](https://community.fly.io/t/issue-running-puppeteer-in-docker-with-fly-and-nodejs/18302) -- Community troubleshooting
- [FFmpeg Piping with Node.js](https://ofarukcaki.medium.com/producing-real-time-video-with-node-js-and-ffmpeg-a59ac27461a1) -- stdin piping pattern

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Fastify + plugins | HIGH | All versions verified on npm, official Fastify ecosystem |
| Puppeteer | HIGH | Version and API verified against official docs (v24.37.2) |
| FFmpeg via spawn | HIGH | Well-established pattern, no library dependency risk |
| Docker configuration | HIGH | Official Puppeteer Docker image, straightforward FFmpeg addition |
| Fly.io deployment | MEDIUM | Verified docs/pricing, but exact machine behavior needs testing |
| Integration with animationController | HIGH | API reviewed in source code -- setFrame is synchronous, compatible with evaluate/screenshot loop |

**Overall confidence:** HIGH

All core technology choices are verified against official documentation and current npm versions. The only MEDIUM area (Fly.io specifics) is operational configuration that can be tuned during deployment.

---

## Open Questions

### Browser Pool vs Single Instance
**What we know:** Each export needs a Puppeteer browser instance. Multiple concurrent exports need multiple browsers.
**What is unclear:** Whether to launch one browser per export or maintain a browser pool.
**Recommendation:** Start with one browser per export (simplest). Profile memory usage. Add pooling only if startup latency (~2-3s) becomes a bottleneck.

### Audio in MP4
**What we know:** FFmpeg can mux audio into MP4 alongside the video stream.
**What is unclear:** Whether audio should be included in the MP4 or kept separate.
**Recommendation:** Include audio muxing from the start. Users expect a complete video with sound. Add `-i audio.mp3 -c:a aac -b:a 192k` to the FFmpeg command.

### Temp File Cleanup
**What we know:** MP4 output files and uploaded assets need cleanup after download.
**What is unclear:** Optimal cleanup timing (immediate after download? TTL-based?).
**Recommendation:** Delete output file after successful download. Use a 1-hour TTL cleanup sweep for abandoned jobs.

### Fastify Node Version
**What we know:** Fastify v5 requires Node 20+. We target Node 22.
**What is unclear:** Whether the official Puppeteer Docker image (currently Node 24 based) will cause issues.
**Recommendation:** If the Puppeteer image uses Node 24, that exceeds our minimum. Verify Fastify v5 compatibility with Node 24 during setup. If needed, build a custom image with Node 22 and install Chrome manually.

---

**Research Complete:** 2026-02-09
**Valid Until:** 60 days (Puppeteer releases frequently; verify major version before starting implementation)
