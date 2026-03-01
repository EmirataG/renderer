/**
 * Export configuration builder.
 *
 * Extracted from browser/pageSetup.ts so it can be used by the SSR pipeline
 * without any Puppeteer dependencies.
 */

import { readFile, readdir } from 'node:fs/promises';
import { join, extname } from 'node:path';
import type { ExportSettings } from './exportSettings.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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
 * Export configuration passed to the rendering pipeline.
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
  scoreRegion: { x: number; y: number; width: number; height: number; rotation?: number } | null;
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

// ---------------------------------------------------------------------------
// Image dimension parsing
// ---------------------------------------------------------------------------

/**
 * Parse image dimensions from a raw file buffer without external dependencies.
 * Supports PNG, JPEG, and WEBP formats.
 */
function parseImageDimensions(buf: Buffer, ext: string): { width: number; height: number } | null {
  try {
    if (ext === '.png') {
      if (buf.length >= 24) {
        const width = buf.readUInt32BE(16);
        const height = buf.readUInt32BE(20);
        if (width > 0 && height > 0) return { width, height };
      }
    } else if (ext === '.jpg' || ext === '.jpeg') {
      for (let i = 0; i < buf.length - 9; i++) {
        if (buf[i] === 0xff && (buf[i + 1] === 0xc0 || buf[i + 1] === 0xc2)) {
          const height = buf.readUInt16BE(i + 5);
          const width = buf.readUInt16BE(i + 7);
          if (width > 0 && height > 0) return { width, height };
        }
      }
    } else if (ext === '.webp') {
      if (buf.length >= 30 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
        const width = buf.readUInt16LE(26) & 0x3fff;
        const height = buf.readUInt16LE(28) & 0x3fff;
        if (width > 0 && height > 0) return { width, height };
      }
    }
  } catch {
    // Parsing failed
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

// ---------------------------------------------------------------------------
// Config builder
// ---------------------------------------------------------------------------

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
