import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';
import type { Browser, CDPSession, Page } from 'puppeteer';
import type { ExportConfig } from './pageSetup.js';
import { config } from '../shared/config.js';

export interface ParallelCaptureOptions {
  browser: Browser;
  exportConfig: ExportConfig;
  frontendUrl: string;
  framesDir: string;
  numTabs: number;
  signal: AbortSignal;
  onProgress: (capturedFrames: number, totalFrames: number) => void;
}

/**
 * Pad a frame number to a 6-digit string for FFmpeg's image2 demuxer.
 * e.g. 42 -> "000042"
 */
function framePath(dir: string, frame: number): string {
  return join(dir, `frame-${String(frame).padStart(6, '0')}.jpg`);
}

/**
 * Set up a single tab: create page, inject config, navigate, wait for ready.
 * Returns the page and a pre-created CDP session for fast screenshots.
 */
async function setupTab(
  browser: Browser,
  frontendUrl: string,
  exportConfig: ExportConfig,
  viewport: { width: number; height: number },
): Promise<{ page: Page; cdp: CDPSession }> {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();

  await page.setViewport(viewport);

  page.on('console', (msg) => {
    const text = msg.text();
    if (text.includes('[RegularRenderer]') || text.includes('[RenderApp]') || msg.type() === 'error') {
      console.log(`[Browser] ${text}`);
    }
  });
  page.on('pageerror', (err) => {
    console.error(`[Browser Error] ${String(err)}`);
  });

  await page.evaluateOnNewDocument(
    (cfg: ExportConfig) => {
      (window as any).__EXPORT_CONFIG__ = cfg;
    },
    exportConfig,
  );

  await page.goto(frontendUrl, {
    waitUntil: 'domcontentloaded',
    timeout: 30_000,
  });

  await page.waitForFunction(
    () => (window as any).rendererReady === true,
    { timeout: config.pageReadyTimeoutMs, polling: 100 },
  );

  const cdp = await page.createCDPSession();

  return { page, cdp };
}

/**
 * Capture a contiguous chunk of frames in a single tab using CDP screenshots.
 */
async function captureChunk(
  page: Page,
  cdp: CDPSession,
  startFrame: number,
  endFrame: number,
  fps: number,
  framesDir: string,
  signal: AbortSignal,
  onFrameCaptured: () => void,
): Promise<void> {
  for (let frame = startFrame; frame < endFrame; frame++) {
    if (signal.aborted) return;

    await page.evaluate(
      (f: number, fpsVal: number) => {
        (window as any).animationController.setFrame(f, fpsVal);
      },
      frame,
      fps,
    );

    if (signal.aborted) return;

    const result = await cdp.send('Page.captureScreenshot', {
      format: 'jpeg',
      quality: 85,
      optimizeForSpeed: true,
    }) as { data: string };

    if (signal.aborted) return;

    const buffer = Buffer.from(result.data, 'base64');
    await writeFile(framePath(framesDir, frame), buffer);

    onFrameCaptured();
  }
}

/**
 * Capture all frames in parallel across N browser tabs.
 *
 * Creates N pages within the same browser, each loading the render page
 * with the same ExportConfig. Divides the frame range into N contiguous
 * chunks and captures them concurrently. Frames are written as numbered
 * JPEG files for FFmpeg's image2 demuxer.
 *
 * Uses CDP Page.captureScreenshot directly for ~10-15% faster captures
 * versus Puppeteer's page.screenshot() abstraction.
 */
export async function parallelCapture(opts: ParallelCaptureOptions): Promise<{ totalFrames: number }> {
  const {
    browser,
    exportConfig,
    frontendUrl,
    framesDir,
    numTabs,
    signal,
    onProgress,
  } = opts;

  const viewport = { width: exportConfig.viewportWidth, height: exportConfig.viewportHeight };
  const tabs: { page: Page; cdp: CDPSession }[] = [];

  try {
    // Set up all tabs in parallel
    console.log(`[parallelCapture] Setting up ${numTabs} tabs...`);
    const setupPromises = Array.from({ length: numTabs }, () =>
      setupTab(browser, frontendUrl, exportConfig, viewport),
    );
    const setupResults = await Promise.all(setupPromises);
    tabs.push(...setupResults);

    if (signal.aborted) return { totalFrames: 0 };

    // Get duration from the first tab to compute totalFrames
    const duration = await tabs[0].page.evaluate(
      () => (window as any).animationController!.getDuration(),
    );
    console.log(`[parallelCapture] getDuration returned: ${duration} (type: ${typeof duration})`);
    if (duration <= 0) {
      throw new Error(
        `Animation has no duration (got ${duration}) -- check MusicXML and sync anchors`,
      );
    }

    const totalFrames = Math.ceil(duration * exportConfig.fps);
    console.log(`[parallelCapture] Duration: ${duration}s, totalFrames: ${totalFrames}`);

    // Atomic progress counter
    let capturedCount = 0;
    const onFrameCaptured = () => {
      capturedCount++;
      onProgress(capturedCount, totalFrames);
    };

    // Get chunk boundaries that avoid splitting mid-scroll-transition.
    // Returns [0, split1, split2, ..., totalFrames].
    const boundaries: number[] = await tabs[0].page.evaluate(
      (n: number) => (window as any).animationController.getChunkBoundaries(n),
      numTabs,
    );
    console.log(`[parallelCapture] Chunk boundaries: ${boundaries.join(', ')}`);

    const capturePromises = tabs.map((tab, i) => {
      const startFrame = boundaries[i];
      const endFrame = boundaries[i + 1];
      if (startFrame >= endFrame) return Promise.resolve();

      return captureChunk(
        tab.page,
        tab.cdp,
        startFrame,
        endFrame,
        exportConfig.fps,
        framesDir,
        signal,
        onFrameCaptured,
      );
    });

    console.log(`[parallelCapture] Capturing ${totalFrames} frames across ${numTabs} tabs...`);
    await Promise.all(capturePromises);

    if (signal.aborted) {
      throw new Error('Export cancelled by user');
    }

    console.log(`[parallelCapture] All ${totalFrames} frames captured.`);
    return { totalFrames };
  } finally {
    // Close all tabs and their contexts
    for (const tab of tabs) {
      try { await tab.cdp.detach(); } catch { /* ignore */ }
      const ctx = tab.page.browserContext();
      try { await tab.page.close(); } catch { /* ignore */ }
      try { await ctx.close(); } catch { /* ignore */ }
    }
  }
}
