# Phase 19: Progress Streaming & Download - Research

**Researched:** 2026-02-09
**Domain:** WebSocket real-time progress, file download endpoints, job cancellation, AbortController patterns
**Confidence:** HIGH

## Summary

Phase 19 adds four capabilities to the existing export pipeline: (1) real-time progress streaming via WebSocket so the user sees frame count, percentage, and stage labels during export; (2) a download endpoint that serves the completed MP4 file; (3) structured error reporting through the WebSocket so the user sees clear failure messages; and (4) job cancellation so the user can abort an in-progress export, causing the backend to stop frame capture, kill the FFmpeg process, and clean up resources.

The recommended approach uses `@fastify/websocket@^11.2.0` (the official Fastify WebSocket plugin, built on `ws@^8.16.0`) to add a WebSocket route at `GET /api/export/:jobId/ws`. The backend's `JobManager` becomes an `EventEmitter` so the `renderJob` method can emit typed progress events (`progress`, `stage`, `complete`, `error`) as it captures and encodes frames. The WebSocket handler subscribes to these events for the specific jobId and forwards them as JSON messages to the connected client. For download, a `GET /api/export/:jobId/download` route reads `job.outputPath` and streams the file using `reply.send(createReadStream(...))` with `Content-Disposition: attachment` and `Content-Type: video/mp4` headers. For cancellation, an `AbortController` is created per job and its signal is checked in the frame capture loop; the client sends a `{ type: "cancel" }` message over the WebSocket, which calls `controller.abort()`, causing the capture loop to break, the FFmpeg process to be killed, and cleanup to run. Reconnection support is inherent because the WebSocket handler reads the current job state on connection and sends an immediate state-sync message.

**Primary recommendation:** Use `@fastify/websocket@^11.2.0` for the WebSocket route. Make `JobManager` extend `EventEmitter` with typed events. Add an `AbortController` per job for cancellation. Stream downloads via `reply.send(createReadStream())` with manual headers (since `decorateReply: false` is already set on the existing `@fastify/static` registration). Store frame progress on the `ExportJob` object for reconnection state sync.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @fastify/websocket | ^11.2.0 | WebSocket route handler integrated with Fastify lifecycle | Official Fastify plugin, uses ws@8 internally, respects Fastify hooks/encapsulation, works with Fastify 5.x |
| ws | ^8.16.0 | WebSocket implementation (transitive via @fastify/websocket) | Industry standard Node.js WebSocket library, 50M+ weekly downloads, battle-tested |
| Node.js `events` | built-in | EventEmitter for job progress events | Standard Node.js pattern for decoupling producer (renderJob) from consumer (WebSocket handler) |
| Node.js `fs` | built-in | createReadStream for file download streaming | Standard Node.js file streaming with backpressure support |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @types/ws | ^8.x | TypeScript definitions for ws library | Development dependency for WebSocket type safety |
| Node.js `AbortController` | built-in (global) | Job cancellation signal | Cancel in-progress export from WebSocket message |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| @fastify/websocket | Raw `ws` server on separate port | Separate port complicates CORS, deployment, and proxy config; @fastify/websocket shares the Fastify server |
| @fastify/websocket | Server-Sent Events (SSE) | SSE is unidirectional (server-to-client only), cannot receive cancel messages from client; WebSocket is bidirectional |
| EventEmitter on JobManager | Callback functions on renderJob | EventEmitter allows multiple listeners (WebSocket + logging) and decouples progress reporting from job logic |
| AbortController | Boolean `cancelled` flag | AbortController integrates with Node.js streams, child_process signal option, and provides standardized AbortError |
| reply.send(createReadStream) | reply.sendFile() from @fastify/static | sendFile requires `decorateReply: true` but existing registration uses `false`; raw stream approach avoids plugin conflict |

**Installation:**
```bash
cd export-service
npm install @fastify/websocket
npm install -D @types/ws
```

## Architecture Patterns

### Recommended Project Structure
```
export-service/src/
  browser/
    browserPool.ts       # Existing: browser pool
    captureFrames.ts     # Modified: accept AbortSignal, check before each frame
    pageSetup.ts         # Existing: page config injection + readiness
  encoding/
    encodeVideo.ts       # Modified: accept AbortSignal, kill FFmpeg on abort
    muxAudio.ts          # Existing: audio muxing
  jobs/
    jobManager.ts        # Modified: extend EventEmitter, add AbortController per job, emit progress events
    types.ts             # Modified: add progress fields, AbortController, event types
  routes/
    export.ts            # Existing: POST /api/export
    status.ts            # Existing: GET /api/export/:jobId/status
    download.ts          # NEW: GET /api/export/:jobId/download
    progress.ts          # NEW: GET /api/export/:jobId/ws (WebSocket upgrade)
  shared/
    config.ts            # Existing config
    exportSettings.ts    # Existing TypeBox schemas
    validation.ts        # Existing validation
  utils/
    tempDir.ts           # Existing temp directory utils
  server.ts              # Modified: register @fastify/websocket, add download + progress routes
```

### Pattern 1: JobManager as EventEmitter with Typed Events
**What:** Make `JobManager` extend `EventEmitter` so it emits progress events that any listener (WebSocket handler, logger) can consume. Progress events are keyed by jobId.
**When to use:** Throughout the render pipeline -- every frame capture, stage transition, completion, and error.
**Example:**
```typescript
// Source: Node.js EventEmitter docs
import { EventEmitter } from 'node:events';

interface JobProgressEvent {
  jobId: string;
  type: 'stage' | 'progress' | 'complete' | 'error';
  stage?: string;        // 'preparing' | 'rendering' | 'encoding' | 'muxing'
  frame?: number;
  totalFrames?: number;
  percent?: number;
  downloadUrl?: string;
  error?: string;
}

class JobManager extends EventEmitter {
  // ... existing methods ...

  private emitProgress(event: JobProgressEvent): void {
    this.emit(`job:${event.jobId}`, event);
  }

  async renderJob(jobId: string): Promise<void> {
    // ...
    this.emitProgress({ jobId, type: 'stage', stage: 'preparing' });
    // ... setup page ...
    this.emitProgress({ jobId, type: 'stage', stage: 'rendering' });

    for await (const { buffer, frame, totalFrames } of captureFrames(...)) {
      await encoder.writeFrame(buffer);
      this.emitProgress({
        jobId,
        type: 'progress',
        frame: frame + 1,
        totalFrames,
        percent: Math.round(((frame + 1) / totalFrames) * 100),
      });
    }

    this.emitProgress({ jobId, type: 'stage', stage: 'muxing' });
    // ... mux audio ...
    this.emitProgress({
      jobId,
      type: 'complete',
      downloadUrl: `/api/export/${jobId}/download`,
    });
  }
}
```

### Pattern 2: WebSocket Route with Job Event Subscription
**What:** A WebSocket route that subscribes to the specific job's events and forwards them as JSON messages. Sends an immediate state-sync message on connection (supporting reconnection). Listens for `{ type: "cancel" }` messages from the client.
**When to use:** The client connects after submitting an export request.
**Example:**
```typescript
// Source: @fastify/websocket README
import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import { jobManager } from '../jobs/jobManager.js';

export default async function progressRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get<{ Params: { jobId: string } }>(
    '/export/:jobId/ws',
    { websocket: true },
    (socket: WebSocket, req) => {
      const { jobId } = req.params;
      const job = jobManager.getJob(jobId);

      if (!job) {
        socket.send(JSON.stringify({ type: 'error', error: 'Job not found' }));
        socket.close(4004, 'Job not found');
        return;
      }

      // Immediate state sync for reconnection
      socket.send(JSON.stringify({
        type: 'sync',
        status: job.status,
        frame: job.currentFrame ?? 0,
        totalFrames: job.totalFrames ?? 0,
        percent: job.percent ?? 0,
        error: job.error,
        downloadUrl: job.status === 'complete'
          ? `/api/export/${jobId}/download`
          : undefined,
      }));

      // Subscribe to job progress events
      const onProgress = (event: JobProgressEvent) => {
        if (socket.readyState === socket.OPEN) {
          socket.send(JSON.stringify(event));
        }
      };
      jobManager.on(`job:${jobId}`, onProgress);

      // Handle client messages (cancel)
      socket.on('message', (data) => {
        try {
          const msg = JSON.parse(String(data));
          if (msg.type === 'cancel') {
            jobManager.cancelJob(jobId);
          }
        } catch { /* ignore malformed messages */ }
      });

      // Cleanup listener on disconnect
      socket.on('close', () => {
        jobManager.off(`job:${jobId}`, onProgress);
      });
    },
  );
}
```

### Pattern 3: File Download via Stream with Manual Headers
**What:** Serve the completed MP4 file using `fs.createReadStream()` piped through `reply.send()` with appropriate headers. Cannot use `reply.sendFile()` because the existing `@fastify/static` registration uses `decorateReply: false`.
**When to use:** When the client requests the completed export.
**Example:**
```typescript
// Source: Fastify Reply docs, Node.js fs docs
import { createReadStream, statSync } from 'node:fs';
import type { FastifyInstance } from 'fastify';
import { jobManager } from '../jobs/jobManager.js';

export default async function downloadRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get<{ Params: { jobId: string } }>(
    '/export/:jobId/download',
    async (request, reply) => {
      const { jobId } = request.params;
      const job = jobManager.getJob(jobId);

      if (!job) {
        return reply.status(404).send({ error: 'Job not found' });
      }

      if (job.status !== 'complete' || !job.outputPath) {
        return reply.status(409).send({ error: 'Export not complete' });
      }

      const stat = statSync(job.outputPath);
      const stream = createReadStream(job.outputPath);

      return reply
        .header('Content-Type', 'video/mp4')
        .header('Content-Disposition', `attachment; filename="export-${jobId}.mp4"`)
        .header('Content-Length', stat.size)
        .send(stream);
    },
  );
}
```

### Pattern 4: AbortController per Job for Cancellation
**What:** Create an `AbortController` when starting `renderJob`, store it on the job, and pass its signal to the frame capture loop and FFmpeg process. When the user sends `{ type: "cancel" }`, call `controller.abort()`. The capture loop checks `signal.aborted` before each frame and breaks. The FFmpeg process receives the kill signal.
**When to use:** Every export job, to support cancellation.
**Example:**
```typescript
// Source: Node.js AbortController docs, child_process docs
async renderJob(jobId: string): Promise<void> {
  const job = this.jobs.get(jobId);
  if (!job) return;

  const controller = new AbortController();
  job.abortController = controller;
  const { signal } = controller;

  try {
    // ... setup ...

    for await (const { buffer, frame } of captureFrames(page, totalFrames, fps)) {
      if (signal.aborted) {
        throw new Error('Export cancelled by user');
      }
      await encoder.writeFrame(buffer);
      // ... emit progress ...
    }

    // ... finish encode, mux audio ...
  } catch (err) {
    if (signal.aborted) {
      this.updateStatus(jobId, 'error', 'Cancelled by user');
    } else {
      this.updateStatus(jobId, 'error', err.message);
    }
  } finally {
    // ... cleanup browser, page, context ...
    job.abortController = undefined;
  }
}

cancelJob(jobId: string): void {
  const job = this.jobs.get(jobId);
  if (job?.abortController) {
    job.abortController.abort();
  }
}
```

### Pattern 5: Progress Throttling to Avoid WebSocket Flood
**What:** At 30fps, capturing 5400 frames produces 5400 progress events. Sending every one via WebSocket is wasteful. Throttle to at most 1 progress message per 250ms (4 updates/second), which is more than enough for a smooth progress bar.
**When to use:** In the WebSocket event forwarding, or in the renderJob progress emission.
**Example:**
```typescript
// Throttle in renderJob emission
let lastProgressTime = 0;
const PROGRESS_INTERVAL_MS = 250;

for await (const { buffer, frame, totalFrames } of captureFrames(...)) {
  await encoder.writeFrame(buffer);
  job.currentFrame = frame + 1;
  job.totalFrames = totalFrames;
  job.percent = Math.round(((frame + 1) / totalFrames) * 100);

  const now = Date.now();
  if (now - lastProgressTime >= PROGRESS_INTERVAL_MS || frame === totalFrames - 1) {
    lastProgressTime = now;
    this.emitProgress({
      jobId,
      type: 'progress',
      frame: frame + 1,
      totalFrames,
      percent: job.percent,
    });
  }
}
```

### Anti-Patterns to Avoid
- **Polling instead of WebSocket:** Using setInterval on the client to poll `/api/export/:jobId/status` wastes bandwidth, adds latency, and hammers the server. WebSocket pushes updates instantly with minimal overhead.
- **Creating a new WebSocket server on a separate port:** Complicates CORS, deployment (Fly.io needs additional port), and proxy configuration. `@fastify/websocket` shares the Fastify HTTP server.
- **Sending all 5400 progress events to WebSocket:** Each event is ~100 bytes JSON. At 5400 events, that is 540KB -- not huge, but unnecessary. Throttle to 4/second for smooth UX.
- **Using reply.sendFile() with decorateReply: false:** The existing `@fastify/static` registration in server.ts uses `decorateReply: false`, which means `reply.sendFile()` and `reply.download()` are NOT available. Use `reply.send(createReadStream(...))` with manual headers instead.
- **Not cleaning up EventEmitter listeners on WebSocket close:** Memory leak if listeners accumulate. Always call `jobManager.off(...)` in the socket `close` handler.
- **Not killing FFmpeg on cancellation:** If only the capture loop is aborted but FFmpeg is left running, the process hangs waiting for stdin data that will never arrive. Must call `proc.kill()` or close stdin.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| WebSocket server | Raw `ws` server + manual HTTP upgrade | `@fastify/websocket` | Plugin handles upgrade, lifecycle hooks, encapsulation, cleanup on server close |
| Progress event bus | Custom pub/sub with channels and subscribers | Node.js `EventEmitter` keyed by `job:${jobId}` | Built-in, zero-dependency, well-understood pattern, supports multiple listeners |
| Cancellation signal | Boolean flag checked in loop | `AbortController` + `AbortSignal` | Standard API, integrates with Node.js streams, child_process, and async operations |
| File download streaming | Manual res.write() with chunk reading | `reply.send(createReadStream(...))` | Fastify handles backpressure, error events, and stream cleanup automatically |
| Heartbeat/keepalive | Custom ping interval with manual tracking | ws library built-in ping/pong | ws library has `socket.ping()` and `'pong'` event built in |

**Key insight:** Phase 19 is integration work -- connecting existing pieces (frame capture, FFmpeg encoding, job manager) with standard communication patterns (WebSocket, EventEmitter, file streaming). Every component has a standard solution; the work is wiring them together correctly.

## Common Pitfalls

### Pitfall 1: EventEmitter Listener Leak on WebSocket Disconnect
**What goes wrong:** Each WebSocket connection adds a listener to `jobManager` for `job:${jobId}`. If the listener is not removed when the socket closes, listeners accumulate. Node.js warns at 10 listeners and eventually leaks memory.
**Why it happens:** Forgetting to call `jobManager.off(...)` in the socket `close` event handler.
**How to avoid:** Always pair `jobManager.on(...)` with `jobManager.off(...)` in the socket `close` handler. Store the listener function reference so it can be removed.
**Warning signs:** `MaxListenersExceededWarning` in Node.js console. Memory usage grows after repeated WebSocket connections.

### Pitfall 2: FFmpeg Process Not Killed on Cancellation
**What goes wrong:** User cancels export, capture loop stops, but FFmpeg process keeps running waiting for stdin data. It hangs indefinitely consuming memory and a process slot.
**Why it happens:** Only the capture loop checks `signal.aborted`, but nobody closes `ffmpeg.stdin` or kills the process.
**How to avoid:** In the cancellation/error path, ensure `ffmpeg.stdin.end()` is called AND `ffmpeg.kill('SIGTERM')` is called. The `finally` block in `renderJob` should handle this. Alternatively, wrap the FFmpeg process creation to accept the AbortSignal.
**Warning signs:** `ps aux | grep ffmpeg` shows orphaned FFmpeg processes after cancelled exports.

### Pitfall 3: Race Between WebSocket Connection and Job Completion
**What goes wrong:** Job completes before the client connects WebSocket. Client never receives the `complete` event. The progress bar stays at the last known state.
**Why it happens:** The export route fires-and-forgets `renderJob`. For very short animations, the job can complete before the client opens the WebSocket.
**How to avoid:** On WebSocket connection, immediately send a state-sync message with the current job status. If the job is already `complete`, the sync message includes the download URL. The client handles this as if it received a `complete` event.
**Warning signs:** Short exports (few frames) appear stuck in the UI. Refreshing the page shows the download is available.

### Pitfall 4: Missing Content-Length Header on Download
**What goes wrong:** Browser does not show download progress (percentage bar), and some download managers fail because they cannot determine the file size upfront.
**Why it happens:** Not calling `statSync()` to get file size before streaming.
**How to avoid:** Always call `statSync(job.outputPath)` and set `Content-Length` header before `reply.send(stream)`.
**Warning signs:** Browser download shows "unknown size remaining" instead of "X of Y MB downloaded".

### Pitfall 5: WebSocket Message Sent After Socket Closed
**What goes wrong:** `socket.send()` throws an error because the socket is already in CLOSING or CLOSED state.
**Why it happens:** The EventEmitter fires a progress event, the listener calls `socket.send()`, but the socket was closed between the event emission and the send call.
**How to avoid:** Always check `socket.readyState === socket.OPEN` before calling `socket.send()`.
**Warning signs:** Uncaught `Error: WebSocket is not open` in logs.

### Pitfall 6: decorateReply: false Prevents sendFile/download
**What goes wrong:** Calling `reply.sendFile()` or `reply.download()` throws "reply.sendFile is not a function".
**Why it happens:** The existing `@fastify/static` registration in `server.ts` line 28 uses `decorateReply: false`. This prevents the reply decorator from being added. This was intentional to avoid conflicts but means the file-serving decorators are not available.
**How to avoid:** Use `reply.send(fs.createReadStream(path))` with manual `Content-Type`, `Content-Disposition`, and `Content-Length` headers. This is the standard Fastify approach for dynamic file downloads.
**Warning signs:** TypeError at runtime when calling reply.sendFile().

### Pitfall 7: Cancellation Check Placement in Capture Loop
**What goes wrong:** User cancels, but the current frame capture still completes (taking 50-200ms), and the next `writeFrame` call tries to write to a killed FFmpeg process.
**Why it happens:** Checking `signal.aborted` only at the start of the loop iteration, not between `captureFrames` yield and `writeFrame`.
**How to avoid:** Check `signal.aborted` immediately after receiving a frame from the async generator, before writing to FFmpeg. Also check before the screenshot call inside `captureFrames` if the signal is passed through.
**Warning signs:** Error logs showing "write after end" or "EPIPE" on FFmpeg stdin after cancellation.

## Code Examples

Verified patterns from official sources:

### WebSocket Route with @fastify/websocket
```typescript
// Source: @fastify/websocket README (https://github.com/fastify/fastify-websocket)
import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';

export default async function progressRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get<{ Params: { jobId: string } }>(
    '/export/:jobId/ws',
    { websocket: true },
    (socket: WebSocket, req) => {
      const { jobId } = req.params;

      // Handler receives (socket, request) -- attach event handlers synchronously
      socket.on('message', (data) => {
        const msg = JSON.parse(String(data));
        // Handle cancel, etc.
      });

      socket.on('close', () => {
        // Clean up listeners
      });
    },
  );
}
```

### File Download with Stream and Headers
```typescript
// Source: Fastify Reply docs (https://fastify.dev/docs/latest/Reference/Reply/)
// Source: Node.js fs docs
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';

fastify.get('/export/:jobId/download', async (request, reply) => {
  const filePath = job.outputPath;
  const fileStat = await stat(filePath);
  const stream = createReadStream(filePath);

  return reply
    .header('Content-Type', 'video/mp4')
    .header('Content-Disposition', `attachment; filename="export-${jobId}.mp4"`)
    .header('Content-Length', fileStat.size)
    .send(stream);
});
```

### AbortController with child_process.spawn
```typescript
// Source: Node.js child_process docs (https://nodejs.org/api/child_process.html)
import { spawn } from 'node:child_process';

const controller = new AbortController();
const { signal } = controller;

const proc = spawn('ffmpeg', [...args], { signal });

proc.on('error', (err) => {
  if (err.name === 'AbortError') {
    console.log('FFmpeg process aborted');
  }
});

// Later, to cancel:
controller.abort(); // Kills the process, triggers 'error' with AbortError
```

### EventEmitter with Typed Events (Keyed by JobId)
```typescript
// Source: Node.js events docs (https://nodejs.org/api/events.html)
import { EventEmitter } from 'node:events';

class JobManager extends EventEmitter {
  private emitJobEvent(jobId: string, event: JobProgressEvent): void {
    this.emit(`job:${jobId}`, event);
  }

  // Listener management:
  onJobProgress(jobId: string, listener: (event: JobProgressEvent) => void): void {
    this.on(`job:${jobId}`, listener);
  }

  offJobProgress(jobId: string, listener: (event: JobProgressEvent) => void): void {
    this.off(`job:${jobId}`, listener);
  }
}
```

### WebSocket Progress Protocol Messages
```typescript
// Server-to-client messages:
type WsMessage =
  | { type: 'sync'; status: string; frame: number; totalFrames: number; percent: number; error?: string; downloadUrl?: string }
  | { type: 'stage'; stage: 'preparing' | 'rendering' | 'encoding' | 'muxing' }
  | { type: 'progress'; frame: number; totalFrames: number; percent: number }
  | { type: 'complete'; downloadUrl: string }
  | { type: 'error'; error: string }
  | { type: 'cancelled' };

// Client-to-server messages:
type WsClientMessage =
  | { type: 'cancel' };
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Polling REST endpoint for progress | WebSocket push | Standard since 2015+ | Instant updates, lower bandwidth, bidirectional (cancel support) |
| Custom WebSocket upgrade handling | @fastify/websocket plugin | Fastify v3+ (2020) | Shares HTTP server, respects Fastify lifecycle hooks and encapsulation |
| Boolean `cancelled` flag | AbortController / AbortSignal | Node.js 15+ (2020), stable in 16+ | Standard API, integrates with streams, child_process, fetch |
| AbortSignal.timeout() manual | AbortSignal.timeout(ms) static method | Node.js 17.3+ | Built-in timeout signal without manual AbortController setup |
| AbortSignal.any() manual | AbortSignal.any([signals]) static method | Node.js 20+ | Combine multiple abort signals (user cancel + timeout) |
| fluent-ffmpeg events for progress | Parse FFmpeg stderr manually | fluent-ffmpeg archived May 2025 | Direct spawn + stderr parsing is the only maintained approach |

**Deprecated/outdated:**
- `fastify-websocket` (unscoped): Deprecated, use `@fastify/websocket` (scoped) instead
- `fluent-ffmpeg`: Archived May 2025, no progress event abstraction available

## Open Questions

1. **Should FFmpeg mux step also be cancellable?**
   - What we know: The mux step (audio into silent video) is fast (1-2 seconds) since it uses `-c:v copy` (no video re-encode). Cancelling during mux would save at most 2 seconds.
   - What's unclear: Whether the added complexity of making mux cancellable is worth the 1-2 second responsiveness gain.
   - Recommendation: Do NOT make the mux step cancellable. Check `signal.aborted` before starting the mux. If cancelled during mux, let it finish (it is fast). Simpler code, negligible user impact.

2. **Progress throttle interval: 250ms vs 500ms**
   - What we know: 250ms = 4 updates/second, smooth progress bar. 500ms = 2 updates/second, still acceptable. Each message is ~100 bytes JSON.
   - What's unclear: Whether 4/second vs 2/second makes a visible difference in the frontend progress bar.
   - Recommendation: Use 250ms. The overhead is trivial (16 messages/second vs 8) and the UX feels more responsive.

3. **Should the download endpoint trigger cleanup?**
   - What we know: Currently, stale jobs are cleaned up by a periodic timer (every hour, jobs older than 2 hours). Existing architecture in ARCHITECTURE.md suggested scheduling deletion 10 minutes after first download.
   - What's unclear: Whether download-triggered cleanup adds complexity for minimal benefit, since the periodic cleanup already handles it.
   - Recommendation: Defer download-triggered cleanup. The existing periodic cleanup is sufficient. Adding a download counter and deferred deletion adds state tracking complexity. Can be added in a future optimization phase.

4. **WebSocket heartbeat/keepalive**
   - What we know: The ws library supports `socket.ping()` and `'pong'` events. Long-running exports (10+ minutes) may have the WebSocket connection dropped by intermediary proxies.
   - What's unclear: Whether Fly.io's proxy has a WebSocket idle timeout, and whether the continuous progress messages themselves act as keepalive.
   - Recommendation: Implement a simple 30-second ping interval on the server side. If the client does not respond with pong within 10 seconds, consider the connection dead and remove the listener. This is cheap insurance against proxy timeouts.

## Sources

### Primary (HIGH confidence)
- [@fastify/websocket GitHub README](https://github.com/fastify/fastify-websocket) - WebSocket route API, `{ websocket: true }`, handler signature `(socket, req)`, event handlers, options, error handling
- [@fastify/websocket releases](https://github.com/fastify/fastify-websocket/releases) - v11.2.0 (Jul 2024), uses `fastify-plugin@^5.0.0` (Fastify 5.x compatible), `ws@^8.16.0`
- [Fastify Reply docs](https://fastify.dev/docs/latest/Reference/Reply/) - `reply.send(stream)` for file streaming, header methods, Content-Type/Content-Disposition
- [Node.js child_process docs](https://nodejs.org/api/child_process.html) - `spawn()` signal option for AbortController, `subprocess.kill()`, SIGTERM default
- [Node.js events docs](https://nodejs.org/api/events.html) - EventEmitter API, `on()`, `off()`, `emit()`, MaxListenersExceeded warning
- [Node.js AbortController](https://nodejs.org/api/globals.html#class-abortcontroller) - Global API, `abort()`, `signal.aborted`, AbortError
- Codebase analysis: `server.ts` line 28 has `decorateReply: false` on `@fastify/static` registration, preventing `reply.sendFile()` usage
- Codebase analysis: `jobManager.ts` is a class singleton, not EventEmitter -- needs to extend EventEmitter
- Codebase analysis: `encodeVideo.ts` returns `{ writeFrame, finish }` but no process reference or abort capability -- needs modification for cancellation
- npm registry verification: `@fastify/websocket@11.2.0` has no peerDependencies, uses `fastify-plugin@^5.0.0` and `ws@^8.16.0`

### Secondary (MEDIUM confidence)
- [AppSignal: Managing Async Operations with AbortController](https://blog.appsignal.com/2025/02/12/managing-asynchronous-operations-in-nodejs-with-abortcontroller.html) - AbortController with streams, request cancellation, custom abortable APIs
- [BetterStack: Getting Started with Fastify WebSockets](https://betterstack.com/community/guides/scaling-nodejs/fastify-websockets/) - WebSocket route setup, message handling, mixed HTTP/WS routes
- [Fastify discussion: How to handle canceled requests](https://github.com/fastify/help/issues/658) - req.raw.on('close') + AbortController pattern

### Tertiary (LOW confidence)
- [VideoSDK: Fastify WebSocket Real-Time Communication](https://www.videosdk.live/developer-hub/websocket/fastify-websocket) - General WebSocket architecture patterns with Fastify

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - `@fastify/websocket@11.2.0` verified on npm with Fastify 5.x compatibility via `fastify-plugin@^5.0.0`; `ws@^8.16.0` is the standard WebSocket library; EventEmitter and AbortController are built-in Node.js APIs
- Architecture: HIGH - EventEmitter for progress events is standard Node.js decoupling pattern; WebSocket route with state-sync on connect handles reconnection; AbortController for cancellation is the standard Node.js approach since v15+; file streaming via `reply.send(createReadStream())` is documented in Fastify Reply docs
- Pitfalls: HIGH - `decorateReply: false` limitation verified directly in codebase (server.ts line 28); EventEmitter listener leak is a well-known Node.js pattern; FFmpeg kill on cancel verified against child_process docs; WebSocket readyState check verified against ws library API

**Research date:** 2026-02-09
**Valid until:** 2026-03-09 (30 days -- @fastify/websocket API is stable, Node.js EventEmitter/AbortController APIs unchanged for years)
