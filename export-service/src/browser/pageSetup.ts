import type { Browser, BrowserContext, Page, Viewport } from 'puppeteer';
import { readFile, readdir } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { config } from '../shared/config.js';
import type { ExportSettings } from '../shared/exportSettings.js';

const MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

interface BgInfo {
  dataUrl: string | null;
  width: number;
  height: number;
}

/**
 * Parse image dimensions from a raw file buffer without external dependencies.
 * Supports PNG, JPEG, and WEBP formats.
 * Returns { width, height } or null if parsing fails.
 */
function parseImageDimensions(buf: Buffer, ext: string): { width: number; height: number } | null {
  try {
    if (ext === '.png') {
      // PNG: bytes 16-19 = width (big-endian uint32), bytes 20-23 = height
      if (buf.length >= 24) {
        const width = buf.readUInt32BE(16);
        const height = buf.readUInt32BE(20);
        if (width > 0 && height > 0) return { width, height };
      }
    } else if (ext === '.jpg' || ext === '.jpeg') {
      // JPEG: search for SOF0 marker (0xFF 0xC0), height at offset+5, width at offset+7
      for (let i = 0; i < buf.length - 9; i++) {
        if (buf[i] === 0xff && (buf[i + 1] === 0xc0 || buf[i + 1] === 0xc2)) {
          const height = buf.readUInt16BE(i + 5);
          const width = buf.readUInt16BE(i + 7);
          if (width > 0 && height > 0) return { width, height };
        }
      }
    } else if (ext === '.webp') {
      // WEBP: RIFF header check, then VP8 chunk; simple VP8: width at 26-27, height at 28-29 (little-endian)
      if (buf.length >= 30 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
        const width = buf.readUInt16LE(26) & 0x3fff;
        const height = buf.readUInt16LE(28) & 0x3fff;
        if (width > 0 && height > 0) return { width, height };
      }
    }
  } catch {
    // Parsing failed, return null to fall through to defaults
  }
  return null;
}

async function buildBgInfo(tempDir: string): Promise<BgInfo> {
  const files = await readdir(tempDir);
  const bgFile = files.find((f) => f.startsWith('bgImage'));
  if (!bgFile) return { dataUrl: null, width: 1920, height: 1080 };

  const ext = extname(bgFile).toLowerCase();
  const mime = MIME_BY_EXT[ext] ?? 'image/png';
  const buf = await readFile(join(tempDir, bgFile));
  const dataUrl = `data:${mime};base64,${buf.toString('base64')}`;

  const dims = parseImageDimensions(buf, ext);
  if (dims) {
    return { dataUrl, width: dims.width, height: dims.height };
  }
  return { dataUrl, width: 1920, height: 1080 };
}

/**
 * Export configuration injected into the browser page via evaluateOnNewDocument.
 * Mirrors the frontend's global ExportConfig interface exactly.
 */
export interface ExportConfig {
  musicXml: string;
  syncAnchors: Record<string, number>;
  audioDuration: number;
  fps: number;
  scoreColor: string;
  scoreShadowDistance: number;
  hideUnplayedNotes: boolean;
  smoothReveal: boolean;
  scoreRegion: { x: number; y: number; width: number; height: number; rotation?: number; perspective?: { topLeft: { x: number; y: number }; topRight: { x: number; y: number }; bottomRight: { x: number; y: number }; bottomLeft: { x: number; y: number } } } | null;
  scoreBorder: string;
  scoreScale: number;
  musicFont: string;
  activeNoteheadColor: string | null;
  activeNoteheadScale: number;
  activeNoteheadEntryMs: number;
  activeNoteheadHoldMs: number;
  activeNoteheadExitMs: number;
  colorFullNote: boolean;
  hideLabels: boolean;
  bgUrl: string | null;
  viewportWidth: number;
  viewportHeight: number;
}

/**
 * Result of setting up a page for frame capture.
 */
export interface PageSetupResult {
  context: BrowserContext;
  page: Page;
  duration: number;
  totalFrames: number;
}

/**
 * Build an ExportConfig object from job data.
 * Reads the MusicXML file from the job's temp directory and maps
 * all ExportSettings fields to ExportConfig properties.
 */
export async function buildExportConfig(job: {
  tempDir: string;
  settings: ExportSettings;
  syncAnchors: Record<string, number>;
}): Promise<ExportConfig> {
  const files = await readdir(job.tempDir);
  const musicXmlFile = files.find((f) => f.startsWith('musicXml'));
  if (!musicXmlFile) {
    throw new Error(`MusicXML file not found in ${job.tempDir}`);
  }
  const musicXml = await readFile(
    join(job.tempDir, musicXmlFile),
    'utf-8',
  );

  const bgInfo = await buildBgInfo(job.tempDir);

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
    hideLabels: job.settings.hideLabels,
    bgUrl: bgInfo.dataUrl,
    viewportWidth: bgInfo.width,
    viewportHeight: bgInfo.height,
  };
}

/**
 * Extract viewport dimensions from an ExportConfig.
 */
export function getViewportFromConfig(cfg: ExportConfig): { width: number; height: number } {
  return { width: cfg.viewportWidth, height: cfg.viewportHeight };
}

/**
 * Create a new browser context and page, inject ExportConfig, navigate to
 * the frontend URL, wait for renderer readiness, and verify animation duration.
 *
 * CRITICAL ordering: evaluateOnNewDocument MUST be called BEFORE page.goto()
 * so the config is available when the page script runs.
 */
export async function setupPage(
  browser: Browser,
  frontendUrl: string,
  exportConfig: ExportConfig,
  viewport: Viewport,
): Promise<PageSetupResult> {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();

  // Set viewport BEFORE navigation
  await page.setViewport(viewport);

  // Forward browser console to server logs for debugging
  page.on('console', (msg) => {
    const text = msg.text();
    if (text.includes('[RegularRenderer]') || text.includes('[RenderApp]') || msg.type() === 'error') {
      console.log(`[Browser] ${text}`);
    }
  });
  page.on('pageerror', (err) => {
    console.error(`[Browser Error] ${String(err)}`);
  });

  // Inject ExportConfig into the page context BEFORE navigation
  await page.evaluateOnNewDocument(
    (cfg: ExportConfig) => {
      (window as any).__EXPORT_CONFIG__ = cfg;
    },
    exportConfig,
  );

  // Navigate to the frontend
  await page.goto(frontendUrl, {
    waitUntil: 'domcontentloaded',
    timeout: 30_000,
  });

  // Wait for the renderer to signal readiness
  await page.waitForFunction(
    () => (window as any).rendererReady === true,
    { timeout: config.pageReadyTimeoutMs, polling: 100 },
  );

  // Verify the animation has a valid duration
  const duration = await page.evaluate(
    () => (window as any).animationController!.getDuration(),
  );
  console.log(`[pageSetup] getDuration returned: ${duration} (type: ${typeof duration})`);
  if (duration <= 0) {
    throw new Error(
      `Animation has no duration (got ${duration}) -- check MusicXML and sync anchors`,
    );
  }

  const totalFrames = Math.ceil(duration * exportConfig.fps);

  return { context, page, duration, totalFrames };
}
