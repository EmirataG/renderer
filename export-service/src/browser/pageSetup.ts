import type { Browser, BrowserContext, Page, Viewport } from 'puppeteer';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { config } from '../shared/config.js';
import type { ExportSettings } from '../shared/exportSettings.js';

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
  scoreRegion: { x: number; y: number; width: number; height: number } | null;
  scoreBorder: string;
  scoreScale: number;
  musicFont: string;
  activeNoteheadColor: string | null;
  activeNoteheadScale: number;
  activeNoteheadEntryMs: number;
  activeNoteheadHoldMs: number;
  activeNoteheadExitMs: number;
  colorFullNote: boolean;
  bgUrl: string | null;
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
    bgUrl: null,
  };
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
  if (duration <= 0) {
    throw new Error(
      'Animation has no duration -- check MusicXML and sync anchors',
    );
  }

  const totalFrames = Math.ceil(duration * exportConfig.fps);

  return { context, page, duration, totalFrames };
}
