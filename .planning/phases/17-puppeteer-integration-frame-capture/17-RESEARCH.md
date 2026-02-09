# Phase 17: Puppeteer Integration & Frame Capture - Research

**Researched:** 2026-02-09
**Domain:** Headless Chrome automation, browser pooling, frame-by-frame screenshot capture
**Confidence:** HIGH

## Summary

Phase 17 implements the core rendering engine for the export pipeline: launching headless Chrome, injecting export configuration into the frontend, waiting for readiness, then capturing each animation frame as a PNG screenshot buffer. The existing frontend infrastructure (Phase 16) already provides `window.__EXPORT_CONFIG__` injection via `evaluateOnNewDocument`, `window.rendererReady` polling, and `window.animationController.setFrame(frameNumber, fps)` for deterministic frame positioning. The backend work is connecting Puppeteer to these APIs with proper resource management.

The recommended approach uses Puppeteer v24 (latest stable, ships Chrome 145) with `generic-pool` for browser instance pooling (max 2-3 concurrent). Each export job acquires a browser from the pool, creates an incognito browser context for isolation, navigates to the built frontend served via `@fastify/static`, injects config via `evaluateOnNewDocument`, polls `rendererReady` via `waitForFunction`, verifies events exist, then loops `setFrame(n, fps)` + `page.screenshot()` collecting PNG `Uint8Array` buffers. All browser/page resources are closed in `finally` blocks.

The critical integration points are: (1) the export service must serve the Vite-built frontend so Puppeteer can navigate to it over HTTP, (2) `evaluateOnNewDocument` must run BEFORE navigation so `window.__EXPORT_CONFIG__` is available when `main.tsx` executes, (3) readiness polling must have a generous timeout (30s) for WASM initialization, and (4) screenshots must use `optimizeForSpeed: true` to minimize per-frame latency.

**Primary recommendation:** Use Puppeteer v24 with `generic-pool` for browser pooling, `@fastify/static` for serving the built frontend, `evaluateOnNewDocument` for config injection, `waitForFunction` for readiness polling, and `page.screenshot({ type: 'png', optimizeForSpeed: true })` returning `Uint8Array` buffers. All cleanup in `finally` blocks.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| puppeteer | ^24.37.2 | Headless Chrome control and screenshot capture | Industry standard, bundles Chrome for Testing, synchronous `page.evaluate()` for frame control |
| generic-pool | ^3.9.0 | Browser instance resource pooling | Proven resource pooling library, Promise-based API, TypeScript support, 11M+ weekly downloads |
| @fastify/static | ^8.x | Serve built frontend to Puppeteer | Official Fastify plugin for static file serving, required so Puppeteer navigates via HTTP |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @types/generic-pool | ^3.9.0 | TypeScript definitions for generic-pool | Development dependency for type safety |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| generic-pool | puppeteer-cluster | puppeteer-cluster is designed for web scraping with task queues; generic-pool is simpler for "acquire browser, use it, release it" pattern which better fits our export job model |
| generic-pool | Manual semaphore with array | Hand-rolled pools miss edge cases: eviction, health checks, drain on shutdown, max wait timeouts |
| puppeteer | puppeteer-core | puppeteer auto-downloads Chrome for Testing, simplifying Docker setup; puppeteer-core requires manual Chrome management. Use full puppeteer. |
| @fastify/static | Vite dev server | Dev server adds HMR overhead and is not production-grade; built assets served statically are deterministic and faster |

**Installation:**
```bash
cd export-service
npm install puppeteer generic-pool @fastify/static
npm install -D @types/generic-pool
```

## Architecture Patterns

### Recommended Project Structure
```
export-service/src/
  browser/
    browserPool.ts       # generic-pool factory for Puppeteer browsers
    captureFrames.ts     # Frame capture loop: setFrame + screenshot
    pageSetup.ts         # Page creation, config injection, readiness wait
  jobs/
    jobManager.ts        # Existing job manager (add renderJob method)
    types.ts             # Existing types (add progress callback)
  routes/
    export.ts            # Existing route (trigger render after job create)
    status.ts            # Existing status route
  shared/
    config.ts            # Add browser pool config, frontend path
    exportSettings.ts    # Existing settings schema
    validation.ts        # Existing validation
  utils/
    tempDir.ts           # Existing temp dir utils
  server.ts              # Add @fastify/static, pool shutdown hook
```

### Pattern 1: Browser Pool with generic-pool
**What:** A pool of Puppeteer Browser instances that are reused across export jobs to avoid the 2-3 second launch overhead per export.
**When to use:** Always -- each export acquires a browser, creates an incognito context + page, captures frames, closes the context, and releases the browser back to the pool.
**Example:**
```typescript
// Source: https://github.com/coopernurse/node-pool + Puppeteer official docs
import { createPool, Pool } from 'generic-pool';
import puppeteer, { Browser } from 'puppeteer';

const browserPool: Pool<Browser> = createPool(
  {
    create: async () => {
      return puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--disable-extensions',
          '--no-first-run',
        ],
        defaultViewport: null, // Set per-page instead
      });
    },
    destroy: async (browser) => {
      await browser.close();
    },
    validate: async (browser) => {
      return browser.connected;
    },
  },
  {
    max: 3,
    min: 0,
    acquireTimeoutMillis: 30_000,
    idleTimeoutMillis: 60_000,
    testOnBorrow: true,
  },
);
```

### Pattern 2: Config Injection via evaluateOnNewDocument
**What:** Inject `window.__EXPORT_CONFIG__` before any page JavaScript executes, so `main.tsx` routes to RenderApp on first run.
**When to use:** Every export job, before `page.goto()`.
**Example:**
```typescript
// Source: https://pptr.dev/api/puppeteer.page.evaluateonnewdocument
const context = await browser.createBrowserContext();
const page = await context.newPage();

await page.setViewport({ width: 1920, height: 1080 });

// MUST be called BEFORE page.goto() so script sees config on load
await page.evaluateOnNewDocument((config) => {
  (window as any).__EXPORT_CONFIG__ = config;
}, exportConfig);

await page.goto(frontendUrl, { waitUntil: 'domcontentloaded' });
```

### Pattern 3: Readiness Polling with waitForFunction
**What:** Wait for `window.rendererReady === true` and verify events are loaded before starting capture.
**When to use:** After `page.goto()`, before frame capture loop.
**Example:**
```typescript
// Source: https://pptr.dev/api/puppeteer.page.waitforfunction
// Wait for renderer readiness (WASM init + events loaded)
await page.waitForFunction(
  () => (window as any).rendererReady === true,
  { timeout: 30_000, polling: 100 },
);

// Verify animation has events (event count > 0)
const duration = await page.evaluate(
  () => (window as any).animationController.getDuration(),
);
if (duration <= 0) {
  throw new Error('Animation has no duration -- check MusicXML and sync anchors');
}
```

### Pattern 4: Frame Capture Loop with Buffer Return
**What:** Iterate through all frames, calling `setFrame(n, fps)` then `page.screenshot()` to collect PNG buffers.
**When to use:** Core of each export job after readiness confirmed.
**Example:**
```typescript
// Source: https://pptr.dev/api/puppeteer.page.screenshot
const fps = exportConfig.fps;
const duration = await page.evaluate(
  () => (window as any).animationController.getDuration(),
);
const totalFrames = Math.ceil(duration * fps);

const frameBuffers: Uint8Array[] = [];

for (let frame = 0; frame < totalFrames; frame++) {
  // Position animation to exact frame
  await page.evaluate(
    (f, fpsVal) => (window as any).animationController.setFrame(f, fpsVal),
    frame,
    fps,
  );

  // Capture screenshot as PNG buffer
  const buffer = await page.screenshot({
    type: 'png',
    optimizeForSpeed: true,
    captureBeyondViewport: false,
  });

  frameBuffers.push(buffer);

  // Report progress (callback provided by caller)
  onProgress?.({ frame, totalFrames });
}

return frameBuffers;
```

### Pattern 5: Resource Cleanup in finally Blocks
**What:** Ensure browser context and page are always closed, even on error, and browser is released back to pool.
**When to use:** Wrap the entire capture sequence.
**Example:**
```typescript
const browser = await browserPool.acquire();
let context: BrowserContext | undefined;
try {
  context = await browser.createBrowserContext();
  const page = await context.newPage();
  try {
    // ... config injection, readiness, frame capture ...
    return frameBuffers;
  } finally {
    await page.close();
  }
} finally {
  if (context) {
    await context.close();
  }
  await browserPool.release(browser);
}
```

### Pattern 6: Serving Built Frontend via @fastify/static
**What:** Serve the Vite-built frontend (dist/ directory) as static files so Puppeteer can navigate to it via HTTP.
**When to use:** Server startup -- register the plugin before starting.
**Example:**
```typescript
// Source: Fastify official docs
import fastifyStatic from '@fastify/static';
import { join } from 'node:path';

// Serve the built Vite frontend
await server.register(fastifyStatic, {
  root: join(import.meta.dirname, '../../dist'),  // Vite build output
  prefix: '/',
  decorateReply: false,  // Avoid conflict with other static plugins
});
```

### Anti-Patterns to Avoid
- **Launching a new browser per frame:** Launch per JOB, not per frame. Browser launch is 2-3 seconds. Use a pool.
- **Using page.goto with file:// protocol:** Breaks same-origin policy for WASM and other assets. Always serve over HTTP.
- **Forgetting evaluateOnNewDocument order:** Must be called BEFORE page.goto(). If called after, `main.tsx` already ran and chose the wrong component.
- **Using headless: 'shell':** Shell mode is faster but may not render complex React/SVG/WASM applications correctly. Use `headless: true` (new headless mode) for rendering fidelity.
- **Not using incognito browser contexts:** Sharing the default context across exports can cause state leaks (cookies, localStorage). Always create an isolated context per job.
- **Storing frames to disk then reading back:** Write PNG buffers to FFmpeg stdin directly (Phase 18). Avoid disk I/O round-trip.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Browser instance pooling | Custom array with semaphore counter | `generic-pool` | Handles eviction, health checks, max wait, drain shutdown, concurrent acquire races |
| Static file serving | Custom route handler reading files | `@fastify/static` | Handles MIME types, caching headers, range requests, directory traversal protection |
| Chrome process management | Manual spawn/kill with child_process | `puppeteer.launch()` | Handles Chrome args, crash recovery, DevTools protocol, pipe communication |
| Readiness detection | setTimeout-based polling loop | `page.waitForFunction()` | Built-in timeout, polling options (raf/mutation/interval), promise-based, cancellable |
| Browser context isolation | Clearing localStorage between jobs | `browser.createBrowserContext()` | Complete isolation: separate cookies, storage, cache, service workers |

**Key insight:** Puppeteer provides primitives for every operation needed in this phase. The job of Phase 17 is assembling these primitives correctly with proper error handling, not building custom browser automation.

## Common Pitfalls

### Pitfall 1: WASM Not Ready When Frame Capture Starts
**What goes wrong:** Puppeteer calls `setFrame()` before Verovio WASM initializes, getting `TypeError: undefined`.
**Why it happens:** Verovio WASM loads asynchronously (300-1000ms). `page.goto()` resolves on DOM ready, but WASM is still loading.
**How to avoid:** Poll `window.rendererReady` via `page.waitForFunction()` with 30s timeout and 100ms polling interval. Verify `animationController.getDuration() > 0` before starting capture.
**Warning signs:** `TypeError: Cannot read properties of undefined` in page console. Duration returns 0 or undefined.

### Pitfall 2: Chrome Process Leak on Error
**What goes wrong:** Browser/page not closed when capture throws, leaving orphaned Chrome processes consuming 200-300MB each.
**Why it happens:** Error thrown mid-capture without finally block. Pool never gets browser back.
**How to avoid:** Wrap ALL browser operations in try/finally. Close page in inner finally, close context in outer finally, release browser to pool in outermost finally. Use `pool.use()` pattern or explicit acquire/release.
**Warning signs:** `ps aux | grep chrome` shows growing process count. Server OOM after several failed exports.

### Pitfall 3: evaluateOnNewDocument Called After page.goto
**What goes wrong:** `window.__EXPORT_CONFIG__` is undefined when `main.tsx` runs, so it renders App instead of RenderApp.
**Why it happens:** Developer puts evaluateOnNewDocument after goto thinking it "injects into the page."
**How to avoid:** Call `evaluateOnNewDocument()` BEFORE `page.goto()`. The function runs at document creation time, before any scripts execute.
**Warning signs:** Screenshot shows the full App UI (sidebar, upload zone) instead of the clean render-mode output.

### Pitfall 4: Viewport Not Set Before Navigation
**What goes wrong:** Screenshots are 800x600 (Puppeteer default) instead of the intended resolution.
**Why it happens:** Forgetting to call `page.setViewport()` or setting `defaultViewport: null` at launch without per-page override.
**How to avoid:** Always call `page.setViewport({ width, height })` before `page.goto()`. For 1080p: `{ width: 1920, height: 1080 }`.
**Warning signs:** Output video has wrong resolution or black bars.

### Pitfall 5: Pool Not Drained on Server Shutdown
**What goes wrong:** Server exits but Chrome processes keep running as zombies.
**Why it happens:** No shutdown hook for the browser pool.
**How to avoid:** Register a Fastify `onClose` hook that calls `pool.drain()` then `pool.clear()`.
**Warning signs:** Docker container exit takes 30+ seconds (waiting for Chrome timeout). `docker stop` requires SIGKILL.

### Pitfall 6: Race Between setFrame and Screenshot
**What goes wrong:** Screenshot captures the previous frame's visual state because React hasn't re-rendered yet.
**Why it happens:** `setFrame()` via `page.evaluate()` triggers a synchronous state update in the renderer, but the browser's composite/paint might not have flushed.
**How to avoid:** The existing `setTimestamp` in RegularRenderer is synchronous -- it directly updates DOM styles and SVG classes. However, as a safety measure, add a brief `await page.evaluate(() => new Promise(r => requestAnimationFrame(r)))` after `setFrame` if visual artifacts appear. Start without it and add only if needed.
**Warning signs:** Frames appear "shifted" by 1 frame in the output video.

### Pitfall 7: Memory Accumulation from Frame Buffers
**What goes wrong:** Holding all frame PNG buffers (100KB-500KB each * 900+ frames = 90-450MB) in memory before passing to FFmpeg.
**Why it happens:** Collecting all frames into an array before encoding.
**How to avoid:** In Phase 18, frames will be piped to FFmpeg stdin as they're captured. For Phase 17, the capture function should accept a callback or async iterator pattern rather than returning a massive array. Design the API to yield buffers one at a time.
**Warning signs:** Node.js heap grows linearly during capture, potential OOM on long animations.

## Code Examples

Verified patterns from official sources:

### Complete Page Setup and Config Injection
```typescript
// Source: https://pptr.dev/api/puppeteer.page.evaluateonnewdocument
// Source: https://pptr.dev/api/puppeteer.page.waitforfunction

import { Browser, BrowserContext, Page } from 'puppeteer';
import type { ExportConfig } from './types.js';

interface PageSetupResult {
  context: BrowserContext;
  page: Page;
  duration: number;
  totalFrames: number;
}

export async function setupPage(
  browser: Browser,
  frontendUrl: string,
  exportConfig: ExportConfig,
  viewport: { width: number; height: number },
): Promise<PageSetupResult> {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();

  // Set viewport BEFORE navigation
  await page.setViewport(viewport);

  // Inject config BEFORE navigation so main.tsx sees it
  await page.evaluateOnNewDocument((config) => {
    (window as any).__EXPORT_CONFIG__ = config;
  }, exportConfig);

  // Navigate and wait for DOM
  await page.goto(frontendUrl, {
    waitUntil: 'domcontentloaded',
    timeout: 30_000,
  });

  // Wait for WASM + renderer initialization
  await page.waitForFunction(
    () => (window as any).rendererReady === true,
    { timeout: 30_000, polling: 100 },
  );

  // Verify animation has content
  const duration = await page.evaluate(
    () => (window as any).animationController!.getDuration(),
  );
  if (duration <= 0) {
    throw new Error('Animation duration is 0 -- verify MusicXML and sync anchors');
  }

  const totalFrames = Math.ceil(duration * exportConfig.fps);

  return { context, page, duration, totalFrames };
}
```

### Frame Capture with Progress Callback
```typescript
// Source: https://pptr.dev/api/puppeteer.page.screenshot
// Source: https://pptr.dev/api/puppeteer.page.evaluate

export interface CaptureProgress {
  frame: number;
  totalFrames: number;
}

export async function* captureFrames(
  page: Page,
  totalFrames: number,
  fps: number,
): AsyncGenerator<{ buffer: Uint8Array; frame: number; totalFrames: number }> {
  for (let frame = 0; frame < totalFrames; frame++) {
    // Position animation to exact frame
    await page.evaluate(
      (f: number, fpsVal: number) => {
        (window as any).animationController.setFrame(f, fpsVal);
      },
      frame,
      fps,
    );

    // Capture PNG screenshot as buffer
    const buffer = await page.screenshot({
      type: 'png',
      optimizeForSpeed: true,
      captureBeyondViewport: false,
    });

    yield { buffer, frame, totalFrames };
  }
}
```

### Browser Pool Lifecycle
```typescript
// Source: https://github.com/coopernurse/node-pool

import { createPool, Pool } from 'generic-pool';
import puppeteer, { Browser } from 'puppeteer';

export function createBrowserPool(maxBrowsers: number = 3): Pool<Browser> {
  return createPool<Browser>(
    {
      create: async () => {
        return puppeteer.launch({
          headless: true,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--disable-extensions',
            '--no-first-run',
            '--mute-audio',
          ],
          defaultViewport: null,
        });
      },
      destroy: async (browser) => {
        await browser.close();
      },
      validate: async (browser) => {
        return browser.connected;
      },
    },
    {
      max: maxBrowsers,
      min: 0,
      acquireTimeoutMillis: 30_000,
      idleTimeoutMillis: 120_000,
      testOnBorrow: true,
    },
  );
}

// Shutdown: call from Fastify onClose hook
export async function shutdownPool(pool: Pool<Browser>): Promise<void> {
  await pool.drain();
  await pool.clear();
}
```

### ExportConfig Construction from Job Data
```typescript
// Build the ExportConfig object from job settings + file contents
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ExportJob } from '../jobs/types.js';

export async function buildExportConfig(job: ExportJob): Promise<ExportConfig> {
  const musicXml = await readFile(
    join(job.tempDir, 'musicXml.xml'),
    'utf-8',
  );

  return {
    musicXml,
    syncAnchors: job.syncAnchors,
    audioDuration: job.settings.audioDuration ?? 0,
    fps: job.settings.fps,
    scoreColor: job.settings.scoreColor,
    scoreShadowDistance: job.settings.scoreShadowDistance,
    hideUnplayedNotes: job.settings.hideUnplayedNotes,
    smoothReveal: job.settings.smoothReveal,
    scoreRegion: job.settings.scoreRegion,
    scoreBorder: job.settings.scoreBorder,
    scoreScale: job.settings.scoreScale,
    musicFont: job.settings.musicFont,
    activeNoteheadColor: job.settings.activeNoteheadColor,
    activeNoteheadScale: job.settings.activeNoteheadScale,
    activeNoteheadEntryMs: job.settings.activeNoteheadEntryMs,
    activeNoteheadHoldMs: job.settings.activeNoteheadHoldMs,
    activeNoteheadExitMs: job.settings.activeNoteheadExitMs,
    colorFullNote: job.settings.colorFullNote,
    bgUrl: null, // Background image injection deferred to later phase
  };
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `headless: true` (old mode) | `headless: true` (new headless, default in v22+) | Puppeteer v22, 2024 | New headless has full Chrome rendering fidelity; old mode renamed to `'shell'` |
| `headless: 'new'` (explicit) | `headless: true` (same thing) | Puppeteer v22+ | `true` now means new headless; `'shell'` for old. No need to specify `'new'` anymore |
| `page.screenshot()` returns `Buffer` | Returns `Uint8Array` | Puppeteer v20+ | Use `Uint8Array` type, not `Buffer`. Still works with Node.js streams and FFmpeg stdin |
| `browser.createIncognitoBrowserContext()` | `browser.createBrowserContext()` | Puppeteer v22+ | Renamed method; all contexts are incognito-equivalent. Old name deprecated |
| fluent-ffmpeg wrapper | Direct `child_process.spawn` | fluent-ffmpeg archived May 2025 | No maintained FFmpeg wrapper for Node.js; use spawn directly (Phase 18 concern) |

**Deprecated/outdated:**
- `headless: 'new'`: No longer needed, `true` IS the new headless mode since v22
- `createIncognitoBrowserContext()`: Renamed to `createBrowserContext()` in v22+
- `page.screenshot()` returning `Buffer`: Now returns `Uint8Array` (but Buffer extends Uint8Array in Node.js, so mostly compatible)

## Open Questions

1. **Optimal screenshot format for speed: PNG vs JPEG**
   - What we know: PNG is lossless and default. JPEG is lossy but may be faster to encode. `optimizeForSpeed: true` reduces PNG compression. FFmpeg can accept both.
   - What's unclear: Whether JPEG quality=100 is perceptibly faster than PNG with `optimizeForSpeed`. For a lossless pipeline, PNG is safer.
   - Recommendation: Use PNG with `optimizeForSpeed: true`. If profiling shows screenshot time is the bottleneck, test JPEG quality=100 as an optimization.

2. **Whether requestAnimationFrame wait is needed between setFrame and screenshot**
   - What we know: `setTimestamp` in RegularRenderer synchronously updates CSS transform and SVG class names. React's state updates trigger DOM mutations.
   - What's unclear: Whether Chrome's compositor has flushed all visual changes by the time `page.screenshot()` is called after `page.evaluate(setFrame)`.
   - Recommendation: Start without rAF wait. If frame artifacts appear, add `await page.evaluate(() => new Promise(r => requestAnimationFrame(r)))` between setFrame and screenshot.

3. **Background image injection strategy**
   - What we know: ExportConfig has `bgUrl: string | null`. Current RenderApp uses it as CSS `background: url(...)`.
   - What's unclear: Whether to use base64 data URL (simple, works for small images) or serve the uploaded background via HTTP (better for large images). Phase 15 stores the background file in tempDir.
   - Recommendation: For Phase 17, set `bgUrl` to null or a localhost URL served by Fastify from the job's temp dir. Implement as a separate static route or inline as base64 if under 5MB. Decide during planning based on typical background sizes.

4. **Pool sizing: how many concurrent browsers**
   - What we know: Each Chrome instance uses 200-300MB. A 2GB machine supports ~3 concurrent. Fly.io performance-2x has 4GB RAM.
   - What's unclear: Actual memory usage with the specific React/SVG/WASM content.
   - Recommendation: Default to `max: 3` with configurable environment variable. Monitor memory in production and adjust.

## Sources

### Primary (HIGH confidence)
- [Puppeteer v24.37.2 releases](https://github.com/puppeteer/puppeteer/releases) - Version verification, Chrome 145 bundled (Feb 2026)
- [Puppeteer page.screenshot() API](https://pptr.dev/api/puppeteer.page.screenshot) - Returns `Uint8Array`, ScreenshotOptions interface
- [Puppeteer ScreenshotOptions](https://pptr.dev/api/puppeteer.screenshotoptions) - All options: type, optimizeForSpeed, captureBeyondViewport, encoding, clip
- [Puppeteer page.evaluateOnNewDocument() API](https://pptr.dev/api/puppeteer.page.evaluateonnewdocument) - Injection before scripts, function + args signature
- [Puppeteer page.waitForFunction() API](https://pptr.dev/api/puppeteer.page.waitforfunction) - Polling options (raf, mutation, ms), timeout, args passing
- [Puppeteer page.evaluate() API](https://pptr.dev/api/puppeteer.page.evaluate) - Execute function in browser context, return serialized values
- [Puppeteer Docker Guide](https://pptr.dev/guides/docker) - Official image `ghcr.io/puppeteer/puppeteer`, SYS_ADMIN capability, --init flag
- [Puppeteer Installation Guide](https://pptr.dev/guides/installation) - puppeteer vs puppeteer-core, Chrome download behavior
- [Puppeteer Headless Modes Guide](https://pptr.dev/guides/headless-modes) - `true` (new), `'shell'` (legacy), `false` (headed)
- [generic-pool GitHub](https://github.com/coopernurse/node-pool) - API: createPool, acquire, release, drain, clear, configuration options

### Secondary (MEDIUM confidence)
- [Bannerbear: 8 Tips for Faster Puppeteer Screenshots](https://www.bannerbear.com/blog/ways-to-speed-up-puppeteer-screenshots/) - Buffer faster than file, Chrome args for speed, viewport impact
- [ScreenshotOne: optimizeForSpeed analysis](https://screenshotone.com/blog/optimize-for-speed-when-rendering-screenshots-in-puppeteer-and-chrome-devtools-protocol/) - Uses zlib q1 (RLE) encoding for faster PNG
- [Medium: Hidden Cost of Headless Browsers](https://medium.com/@matveev.dina/the-hidden-cost-of-headless-browsers-a-puppeteer-memory-leak-journey-027e41291367) - Memory leak patterns, cleanup strategies
- [Puppeteer BrowserContext class](https://pptr.dev/api/puppeteer.browsercontext) - Isolated context creation, per-context pages

### Tertiary (LOW confidence)
- [Puppeteer Issue #10071: headless new vs old performance](https://github.com/puppeteer/puppeteer/issues/10071) - New headless slower for PDF; unclear impact on screenshots
- [Puppeteer Issue #7530: Screenshot frame artifacts](https://github.com/puppeteer/puppeteer/issues/7530) - Potential rendering artifacts during capture

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Puppeteer v24.37.2 verified on npm/releases (Feb 6, 2026), generic-pool v3.9 verified, @fastify/static is official Fastify plugin
- Architecture: HIGH - evaluateOnNewDocument + waitForFunction + screenshot pattern verified against official Puppeteer API docs; existing codebase (Phase 16) already has matching window API
- Pitfalls: HIGH - Process leak, readiness race, and config injection order verified via official docs and multiple community sources; memory accumulation is a known pattern

**Research date:** 2026-02-09
**Valid until:** 2026-03-09 (30 days -- Puppeteer API is stable, generic-pool unchanged for years)
