/**
 * Client-side video export (HTML-in-Canvas experimental branch).
 *
 * Renders the score animation entirely in the browser using:
 * - Verovio for SVG score rendering
 * - DOM animation (same engine as server-side export)
 * - drawElementImage() — the page SVGs live as direct children of a
 *   <canvas layoutsubtree>, and the browser snapshots them into the
 *   canvas each paint. No per-frame XMLSerializer/Blob/Image cycle.
 * - WebCodecs H.264 hardware encoding
 * - mp4-muxer for MP4 container + audio
 *
 * REQUIRES Chrome 138+ with chrome://flags/#canvas-draw-element
 * enabled, or an M148–M151 origin-trial token. No fallback on this
 * branch — see clientExport()'s feature check.
 */

import { createToolkit } from '../verovioService';
import { buildColorExtrasSelector, reorderNoteheadsInSvgString } from '../noteAnimation';
import { computeNoteDurationSeconds, interpolateTimestamps } from '../interpolation';
import { extractTimemapEvents, computeEventPositions } from '../getEvents';
import {
  createAnimationState,
  setTimestamp as applyAnimation,
  type AnimationConfig,
  type AnimationEvent,
  type AnimationState,
} from './animation';
import {
  generateBorderSvg,
  getBorderHeight,
  type BorderStyle,
} from './borders';
import { VideoExporter } from './encode';
import type { ScoreRegion } from '../../types/score';

/**
 * Settings for a video export job.
 */
export interface ExportSettings {
  fps: number;
  scoreColor: string;
  scoreShadowDistance: number;
  hideUnplayedNotes: boolean;
  smoothReveal: boolean;
  scoreRegion: ScoreRegion | null;
  scoreBorder: BorderStyle;
  scoreScale: number;
  musicFont: 'Bravura' | 'Petaluma' | 'Leland' | 'Gootville' | 'Leipzig';
  activeNoteheadColor: string | null;
  activeNoteheadScale: number;
  activeNoteheadEntryMs: number;
  activeNoteheadHoldMs: number;
  activeNoteheadExitMs: number;
  activeNoteheadUseNoteDuration: boolean;
  colorAccidentals: boolean;
  colorDots: boolean;
  colorArticulations: boolean;
  hideLabels: boolean;
  audioDuration?: number;
  viewMode?: 'page' | 'single-line';
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EDITOR_WIDTH = 980;

// ---------------------------------------------------------------------------
// SVG helpers (ported from export-service/src/standalone/render.ts)
// ---------------------------------------------------------------------------

const WIDTH_REGEX = /width="(\d+(?:\.\d+)?)px"/;
const HEIGHT_REGEX = /height="(\d+(?:\.\d+)?)px"/;
const VIEWBOX_HEIGHT_REGEX = /viewBox="0 0 [\d.]+ ([\d.]+)"/;
const VIEWBOX_WH_REGEX = /viewBox="0 0 ([\d.]+) ([\d.]+)"/;
const VIEWBOX_REGEX = /viewBox="([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)"/;

function extractSectionDims(svgString: string): { width: number; height: number } {
  const wMatch = svgString.match(WIDTH_REGEX);
  const hMatch = svgString.match(HEIGHT_REGEX);
  if (wMatch && hMatch) return { width: parseFloat(wMatch[1]), height: parseFloat(hMatch[1]) };
  const vbMatch = svgString.match(VIEWBOX_WH_REGEX);
  if (vbMatch) return { width: parseFloat(vbMatch[1]), height: parseFloat(vbMatch[2]) };
  return { width: 0, height: 0 };
}

function extractPageHeight(svgString: string): number {
  const match = svgString.match(HEIGHT_REGEX);
  if (match) return parseFloat(match[1]);
  const vbMatch = svgString.match(VIEWBOX_HEIGHT_REGEX);
  if (vbMatch) return parseFloat(vbMatch[1]);
  return 0;
}

function trimPageTopMargin(svgString: string): string {
  const systemMatch = svgString.match(
    /<g\s+class="system"[^>]*transform="translate\(([\d.]+),\s*([\d.]+)\)"/,
  );
  if (!systemMatch) return svgString;
  const systemY = parseFloat(systemMatch[2]);
  if (systemY <= 0) return svgString;
  const vbMatch = svgString.match(VIEWBOX_REGEX);
  if (!vbMatch) return svgString;
  const vbX = parseFloat(vbMatch[1]);
  const vbY = parseFloat(vbMatch[2]);
  const vbW = parseFloat(vbMatch[3]);
  const vbH = parseFloat(vbMatch[4]);
  const newVbY = vbY + systemY;
  const newVbH = vbH - systemY;
  return svgString
    .replace(VIEWBOX_REGEX, `viewBox="${vbX} ${newVbY} ${vbW} ${newVbH}"`)
    .replace(HEIGHT_REGEX, `height="${newVbH}px"`);
}

// (Event extraction, interpolation, and position computation use shared
// modules imported from ../getEvents and ../interpolation above.)

// ---------------------------------------------------------------------------
// Score color CSS
// ---------------------------------------------------------------------------

function buildScoreColorCss(scoreColor: string, hideLabels: boolean): string {
  // Do NOT include `use` here. CSS overrides SVG presentation attributes,
  // and animation.ts colors active noteheads by setting fill="..." on
  // <use> elements inside g.notehead. A `use { fill: scoreColor }` rule
  // would silently override every animated highlight. Untouched <use>
  // elements still get scoreColor via SVG fill inheritance from the root
  // <svg fill="..."> attribute set when each page is mounted.
  return `
    .client-export-score svg path,
    .client-export-score svg rect,
    .client-export-score svg polygon,
    .client-export-score svg ellipse {
      fill: ${scoreColor};
    }
    .client-export-score svg text {
      fill: ${scoreColor};
    }
    .client-export-score svg [fill="none"] {
      fill: none !important;
    }
    .client-export-score g.staff > path {
      fill: none !important;
      stroke: ${scoreColor} !important;
      shape-rendering: crispEdges !important;
    }
    .client-export-score g.notehead {
      will-change: transform;
    }
    .client-export-score svg {
      display: block;
    }
    ${hideLabels ? '.client-export-score .label, .client-export-score .labelAbbr { display: none !important; }' : ''}
  `;
}

// ---------------------------------------------------------------------------
// drawElementImage type augmentation (Chrome 138+, behind
// chrome://flags/#canvas-draw-element). The TS lib.dom doesn't include
// it yet, so we extend the context type here.
// ---------------------------------------------------------------------------

type DrawElementCtx = CanvasRenderingContext2D & {
  drawElementImage: (
    el: Element,
    dx: number,
    dy: number,
    dw?: number,
    dh?: number,
  ) => DOMMatrix;
};

type LayoutsubtreeCanvas = HTMLCanvasElement & {
  requestPaint?: () => void;
  onpaint: ((e: Event) => void) | null;
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface ClientExportParams {
  musicXml: string;
  syncAnchors: Map<string, number>;
  settings: ExportSettings;
  audioFile: File;
  bgImageUrl?: string;
  /** Solid background color (used when no bgImageUrl). */
  bgColor?: string;
  /** Video aspect ratio — used with bgColor to derive viewport dimensions. */
  aspectRatio?: number;
  onProgress: (percent: number, stage: string) => void;
  signal?: AbortSignal;
}

/**
 * Export a score animation to MP4 entirely in the browser.
 *
 * 1. Initializes Verovio and renders SVG pages in a hidden DOM container
 * 2. Computes event positions and timestamps
 * 3. For each frame: applies animation → serializes SVG → rasterizes → encodes
 * 4. Encodes audio via WebCodecs AudioEncoder
 * 5. Muxes into MP4 and triggers download
 */
export async function clientExport(params: ClientExportParams): Promise<Blob> {
  const { musicXml, syncAnchors, settings, audioFile, bgImageUrl, bgColor, aspectRatio, onProgress, signal } = params;

  // Feature check: drawElementImage is Chrome-only and behind a flag.
  // This branch assumes Chrome + flag enabled and does NOT keep a fallback.
  //
  // Probe an actual context (not just the prototype) and accept the
  // legacy `drawElement` alias too — it was kept around through Chrome
  // 145 before the rename. We pick whichever exists and call through
  // the same reference in the frame loop.
  {
    const probe = document.createElement('canvas').getContext('2d') as unknown as {
      drawElementImage?: unknown;
      drawElement?: unknown;
    };
    if (typeof probe.drawElementImage !== 'function' && typeof probe.drawElement !== 'function') {
      throw new Error(
        'drawElementImage not available. Open chrome://flags/#canvas-draw-element, set it to Enabled, and restart Chrome (138+).',
      );
    }
  }

  onProgress(0, 'Preparing score...');

  // ── 1. Compute layout constants ───────────────────────────────────
  // Derive viewport dimensions from background image, or from aspectRatio + bgColor
  let viewportWidth = 3840;
  let viewportHeight = 2160;
  if (bgImageUrl) {
    const dims = await new Promise<{ w: number; h: number }>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = () => reject(new Error('Failed to load background image for dimensions'));
      img.src = bgImageUrl;
    });
    // Cap longest side to 3840 for 4K (preserving aspect ratio)
    const MAX_DIM = 3840;
    if (dims.w > MAX_DIM || dims.h > MAX_DIM) {
      const scale = MAX_DIM / Math.max(dims.w, dims.h);
      dims.w = Math.round(dims.w * scale);
      dims.h = Math.round(dims.h * scale);
    }
    // H.264 requires even dimensions
    viewportWidth = dims.w & ~1;
    viewportHeight = dims.h & ~1;
  } else if (aspectRatio && aspectRatio > 0) {
    // No image — derive 4K dimensions from aspect ratio
    if (aspectRatio >= 1) {
      viewportWidth = 3840;
      viewportHeight = Math.round(3840 / aspectRatio);
    } else {
      viewportHeight = 3840;
      viewportWidth = Math.round(3840 * aspectRatio);
    }
    // H.264 requires even dimensions
    viewportWidth = viewportWidth & ~1;
    viewportHeight = viewportHeight & ~1;
  }
  const scaleFactor = viewportWidth / EDITOR_WIDTH;
  const containerWidth = EDITOR_WIDTH;
  const containerHeight = Math.floor(viewportHeight / scaleFactor);
  const regionWidth = settings.scoreRegion?.width ?? containerWidth;
  const regionHeight = settings.scoreRegion?.height ?? containerHeight;

  // ── 2. Initialize Verovio ─────────────────────────────────────────
  const toolkit = await createToolkit();
  const isSingleLine = settings.viewMode === 'single-line';

  const verovioScale = Math.round(40 * (settings.scoreScale ?? 1));
  if (isSingleLine) {
    toolkit.setOptions({
      font: settings.musicFont || 'Bravura',
      fontLoadAll: true,
      breaks: 'none',
      pageWidth: 100000,
      pageHeight: 100,
      adjustPageHeight: true,
      scale: verovioScale,
      pageMarginTop: 0,
      pageMarginBottom: 0,
      pageMarginLeft: 0,
      pageMarginRight: 0,
      svgViewBox: true,
      svgRemoveXlink: true,
      header: 'none',
      footer: 'none',
    });
  } else {
    toolkit.setOptions({
      font: settings.musicFont || 'Bravura',
      fontLoadAll: true,
      pageWidth: (regionWidth * 100) / verovioScale,
      pageHeight: 2970,
      scale: verovioScale,
      adjustPageHeight: true,
      pageMarginTop: 0,
      pageMarginBottom: 0,
      svgViewBox: true,
      svgRemoveXlink: true,
      breaks: 'auto',
      header: 'none',
      footer: 'none',
    });
  }

  const loaded = toolkit.loadData(musicXml);
  if (!loaded) throw new Error('Failed to load MusicXML data');
  toolkit.renderToMIDI();

  // ── 3. Render SVG ────────────────────────────────────────────────
  const svgPages: string[] = [];
  let totalHeight = 0;
  let totalWidth = 0;
  const pageHeights: number[] = [];
  const pageOffsets: number[] = [];
  const sectionWidths: number[] = [];
  const sectionOffsets: number[] = [];

  if (isSingleLine) {
    // Single-line: render as one SVG (same as useSingleLineVerovio)
    let svg = reorderNoteheadsInSvgString(toolkit.renderToSVG(1));
    svgPages.push(svg);
    const dims = extractSectionDims(svg);
    sectionWidths.push(dims.width);
    sectionOffsets.push(0);
    totalWidth = dims.width;
    totalHeight = dims.height;
    pageHeights.push(dims.height);
    pageOffsets.push(0);
  } else {
    // Page mode: render multi-page
    const pageCount = toolkit.getPageCount();
    for (let i = 1; i <= pageCount; i++) {
      let svg = toolkit.renderToSVG(i);
      if (i > 1) svg = trimPageTopMargin(svg);
      svg = reorderNoteheadsInSvgString(svg);
      svgPages.push(svg);
    }
    let cumulative = 0;
    for (const svg of svgPages) {
      const h = extractPageHeight(svg);
      pageHeights.push(h);
      pageOffsets.push(cumulative);
      cumulative += h;
    }
    totalHeight = cumulative;
  }

  // ── 4. Build canvas with layoutsubtree ────────────────────────────
  // The output canvas is ALSO the parent of the page divs. The
  // drawElementImage API requires the source element to be a direct
  // child of the <canvas layoutsubtree> being drawn into, so there's
  // no separate hidden DOM — this single element replaces the entire
  // shadow-DOM tree (host, scale, region, camera, score wrappers) and
  // the duplicate ImageBitmap cache.
  const regionX = settings.scoreRegion?.x ?? 0;
  const regionY = settings.scoreRegion?.y ?? 0;
  const regionRotation = settings.scoreRegion?.rotation ?? 0;
  const borderStyle = (settings.scoreBorder ?? 'none') as BorderStyle;

  // The canvas MUST be on-screen (in the visible viewport) for Chrome
  // to render its <layoutsubtree> children — drawElementImage paints
  // nothing from offscreen subtrees because Chrome elides their paint.
  // (Verified in /test-hic: position:fixed; left:-99999px makes the
  // bitmap stay magenta-only; z-index behind an opaque cover keeps the
  // snapshot working.)
  //
  // So we put the canvas at top-left fixed, give it a z-index below
  // the cover, and stack an opaque overlay above it. Both sit BELOW the
  // export progress modal (App.tsx uses z-[100]) so the user can still
  // see progress / hit cancel.
  const canvas = document.createElement('canvas') as LayoutsubtreeCanvas;
  canvas.width = viewportWidth;
  canvas.height = viewportHeight;
  canvas.setAttribute('layoutsubtree', '');
  canvas.style.position = 'fixed';
  canvas.style.top = '0';
  canvas.style.left = '0';
  canvas.style.width = `${viewportWidth}px`;
  canvas.style.height = `${viewportHeight}px`;
  canvas.style.zIndex = '49';
  canvas.style.pointerEvents = 'none';
  document.body.appendChild(canvas);

  const overlay = document.createElement('div');
  overlay.style.position = 'fixed';
  overlay.style.inset = '0';
  overlay.style.background = '#000';
  overlay.style.zIndex = '50';
  overlay.style.pointerEvents = 'none';
  document.body.appendChild(overlay);
  const ctx = canvas.getContext('2d')! as DrawElementCtx;
  // Resolve whichever name this Chrome exposes. The frame loop calls
  // through this reference so it works on either 138–145 (drawElement)
  // or 146+ (drawElementImage).
  const ctxAny = ctx as unknown as Record<string, Function>;
  const drawElRaw = (typeof ctxAny.drawElementImage === 'function'
    ? ctxAny.drawElementImage
    : ctxAny.drawElement) as (
    el: Element,
    dx: number,
    dy: number,
    dw?: number,
    dh?: number,
  ) => DOMMatrix;
  const drawEl = drawElRaw.bind(ctx);

  // Score-color stylesheet. Scoped by className since we're not in a
  // shadow DOM anymore; preview SVGs in the main DOM use different
  // classes so this doesn't bleed.
  const styleEl = document.createElement('style');
  styleEl.textContent = buildScoreColorCss(settings.scoreColor, settings.hideLabels);
  document.head.appendChild(styleEl);

  // Mount SVG pages as DIRECT CHILDREN of the canvas. Each page is
  // absolutely positioned so multiple pages don't fight for layout;
  // we never look at their on-screen positions (we draw via the API
  // and apply page offsets via ctx transforms inside the frame loop).
  const pageContainers: HTMLElement[] = [];
  for (let idx = 0; idx < svgPages.length; idx++) {
    const pageDiv = document.createElement('div');
    pageDiv.className = 'client-export-score';
    pageDiv.style.position = 'absolute';
    pageDiv.style.left = '0';
    pageDiv.style.top = '0';
    pageDiv.style.lineHeight = '0';
    pageDiv.style.fontSize = '0';
    pageDiv.style.width = isSingleLine ? `${sectionWidths[idx]}px` : `${regionWidth}px`;
    pageDiv.innerHTML = svgPages[idx];
    // Set fill on SVG root so untouched <use> elements inherit scoreColor
    // (animation.ts handles fills on touched noteheads via setAttribute).
    const svgRoot = pageDiv.querySelector('svg');
    if (svgRoot) svgRoot.setAttribute('fill', settings.scoreColor);
    canvas.appendChild(pageDiv);
    pageContainers.push(pageDiv);
  }

  // Phantom wrappers for animation.ts compatibility. The animation
  // module mutates cameraEl.style.transform — harmless on a detached
  // element — and reads camera offsets back from animState directly.
  // scoreEl is used for querySelector to locate notes; pointing it at
  // the canvas lets queries descend into the page subtrees.
  const cameraEl = document.createElement('div');
  const scoreEl = canvas as unknown as HTMLElement;

  // ── 5. Extract events and compute positions ───────────────────────
  // Force layout so getBoundingClientRect works on canvas descendants.
  void canvas.offsetHeight;

  // Extract events and interpolate timestamps using shared modules
  // (identical to the preview renderers).
  const timemapEvents = extractTimemapEvents(toolkit);
  const interpolated = interpolateTimestamps(timemapEvents, syncAnchors);
  const positions = computeEventPositions(timemapEvents, toolkit, pageContainers, pageOffsets);
  const yMap = new Map(positions.map((p) => [p.id, p.globalY]));

  // For single-line mode, compute X positions
  let xMap = new Map<string, number>();
  if (isSingleLine) {
    // Detect CSS transform scale on ancestor elements (scaleEl).
    // getBoundingClientRect() returns viewport pixels that include CSS transforms,
    // but sectionOffsets are in pre-transform SVG viewBox units. We need positions
    // in the same pre-transform space so the camera translateX is correct.
    const firstPC = pageContainers[0];
    const domScale = firstPC && firstPC.clientWidth > 0
      ? firstPC.getBoundingClientRect().width / firstPC.clientWidth
      : 1;

    for (const tmEvt of timemapEvents) {
      const posId = tmEvt.positionSvgId || tmEvt.svgIds[0];
      if (!posId) continue;
      for (let ci = 0; ci < pageContainers.length; ci++) {
        const noteEl = pageContainers[ci].querySelector(`#${CSS.escape(posId)}`);
        if (noteEl) {
          const containerRect = pageContainers[ci].getBoundingClientRect();
          const noteRect = noteEl.getBoundingClientRect();
          // Divide by domScale to convert from viewport pixels to pre-transform units
          const localX = (noteRect.left - containerRect.left + noteRect.width / 2) / domScale;
          xMap.set(tmEvt.id, sectionOffsets[ci] + localX);
          break;
        }
      }
    }
    // Enforce monotonically non-decreasing X
    let prevX = 0;
    for (const tmEvt of timemapEvents) {
      const x = xMap.get(tmEvt.id) ?? prevX;
      if (x < prevX) xMap.set(tmEvt.id, prevX);
      else prevX = x;
    }
  }

  const events: AnimationEvent[] = interpolated.map((evt) => ({
    computedTimestamp: evt.computedTimestamp,
    y: yMap.get(evt.id) ?? 0,
    x: xMap.get(evt.id) ?? 0,
    svgIds: evt.svgIds,
    tiedContinuationIds: evt.tiedContinuationIds,
    tiedStartIds: evt.tiedStartIds,
  }));

  // Precompute holdSeconds for "use note duration" mode.
  // Uses the exact same computeNoteDurationSeconds function as the preview
  // renderers to ensure identical hold durations.
  if (settings.activeNoteheadUseNoteDuration) {
    for (let i = 0; i < events.length; i++) {
      const m = interpolated[i];
      if (m.noteDurationBeats && m.noteDurationBeats > 0) {
        events[i].holdSeconds = computeNoteDurationSeconds(i, interpolated);
      }
      // Separate hold for tied chains in mixed events
      if (m.tiedNoteDurationBeats && m.tiedNoteDurationBeats > 0) {
        // Temporarily swap noteDurationBeats to compute tied hold
        // (same pattern as RegularRenderer/SingleLineRenderer)
        const origDur = m.noteDurationBeats;
        (interpolated[i] as any).noteDurationBeats = m.tiedNoteDurationBeats;
        events[i].tiedHoldSeconds = computeNoteDurationSeconds(i, interpolated);
        (interpolated[i] as any).noteDurationBeats = origDur;
      }
      // For "all-tied" events, ensure tiedHoldSeconds matches holdSeconds
      if (events[i].tiedContinuationIds?.length && events[i].tiedHoldSeconds === undefined && events[i].holdSeconds !== undefined) {
        events[i].tiedHoldSeconds = events[i].holdSeconds;
      }
    }
  }

  // ── 6. Setup animation ────────────────────────────────────────────
  const animState: AnimationState = createAnimationState();
  const globalHoldSec = (settings.activeNoteheadHoldMs ?? 200) / 1000;
  const exitSec = (settings.activeNoteheadExitMs ?? 200) / 1000;
  const useNoteDur = settings.activeNoteheadUseNoteDuration ?? false;

  // Precompute maximum animation duration across all events so the backward
  // scan in setTimestamp doesn't break early on a short event while a longer
  // tied chain behind it is still active.
  let maxAnimDuration = globalHoldSec + exitSec;
  if (useNoteDur) {
    for (const evt of events) {
      const hold = evt.holdSeconds ?? globalHoldSec;
      const tiedHold = evt.tiedHoldSeconds ?? 0;
      const evtMax = Math.max(hold, tiedHold) + exitSec;
      if (evtMax > maxAnimDuration) maxAnimDuration = evtMax;
    }
  }

  const animConfig: AnimationConfig = {
    scoreColor: settings.scoreColor,
    activeNoteheadColor: settings.activeNoteheadColor ?? settings.scoreColor,
    activeNoteheadScale: settings.activeNoteheadScale ?? 1,
    activeNoteheadHoldMs: settings.activeNoteheadHoldMs ?? 200,
    activeNoteheadExitMs: settings.activeNoteheadExitMs ?? 200,
    activeNoteheadUseNoteDuration: useNoteDur,
    colorExtrasSelector: buildColorExtrasSelector(settings),
    scoreRegionHeight: settings.scoreRegion?.height ?? null,
    containerHeight,
    totalHeight,
    totalWidth,
    regionWidth,
    viewMode: settings.viewMode ?? 'page',
    maxAnimDuration,
  };

  // ── 7. Setup encoder ──────────────────────────────────────────────
  // Canvas + ctx were created in step 4 (they're both the source-parent
  // and the encoder target).
  const audioDuration = settings.audioDuration ?? 0;
  const fps = settings.fps;
  const totalFrames = Math.ceil(audioDuration * fps);

  const exporter = new VideoExporter({
    width: viewportWidth,
    height: viewportHeight,
    fps,
  });

  // Pre-load background image if present
  let bgImage: ImageBitmap | null = null;
  if (bgImageUrl) {
    const bgResp = await fetch(bgImageUrl);
    const bgBlob = await bgResp.blob();
    bgImage = await createImageBitmap(bgBlob);
  }

  // Pre-render border images
  let topBorderImg: HTMLImageElement | null = null;
  let bottomBorderImg: HTMLImageElement | null = null;
  let borderHeight = 0;
  if (borderStyle !== 'none') {
    borderHeight = getBorderHeight(borderStyle);
    const loadSvgImg = (svg: string) => new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    });
    topBorderImg = await loadSvgImg(generateBorderSvg(borderStyle, regionWidth, settings.scoreColor, 'top'));
    bottomBorderImg = await loadSvgImg(generateBorderSvg(borderStyle, regionWidth, settings.scoreColor, 'bottom'));
  }

  // No page cache — drawElementImage reads the live render tree each
  // frame and the browser handles snapshotting automatically.

  // Start audio decoding in parallel with video frame rendering.
  // AudioContext.decodeAudioData runs on a separate browser thread.
  const audioBufferPromise = (async () => {
    const buf = await audioFile.arrayBuffer();
    const audioCtx = new AudioContext({ sampleRate: 44100 });
    const decoded = await audioCtx.decodeAudioData(buf);
    await audioCtx.close();
    return decoded;
  })();

  // ── 8. Frame capture loop ─────────────────────────────────────────
  onProgress(0, 'Rendering frames...');

  // Compose one frame into the canvas. Must be invoked from inside the
  // `paint` event — that's when the children's snapshot is for the
  // current frame; outside paint, drawElementImage would draw last
  // frame's state (per the WICG explainer).
  function composeFrame(): void {
    // Clear + background
    if (bgImage) {
      ctx.drawImage(bgImage, 0, 0, viewportWidth, viewportHeight);
    } else if (bgColor) {
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, viewportWidth, viewportHeight);
    } else {
      ctx.clearRect(0, 0, viewportWidth, viewportHeight);
    }

    // Region transform + clip
    ctx.save();
    ctx.scale(scaleFactor, scaleFactor);
    ctx.translate(regionX, regionY);
    if (regionRotation !== 0) {
      ctx.translate(regionWidth / 2, regionHeight / 2);
      ctx.rotate((regionRotation * Math.PI) / 180);
      ctx.translate(-regionWidth / 2, -regionHeight / 2);
    }
    ctx.beginPath();
    ctx.rect(0, 0, regionWidth, regionHeight);
    ctx.clip();

    // Draw pages via drawElementImage. The browser supplies the latest
    // snapshot of each page subtree; no per-frame serialization.
    if (isSingleLine) {
      const cameraX = animState.cameraX;
      for (let p = 0; p < pageContainers.length; p++) {
        const sectionX = sectionOffsets[p] - cameraX;
        const sectionW = sectionWidths[p];
        const sectionH = pageHeights[p];
        if (sectionX + sectionW < 0 || sectionX > regionWidth) continue;
        const yOff = (regionHeight - sectionH) / 2;
        drawEl(pageContainers[p], sectionX, yOff, sectionW, sectionH);
      }
    } else {
      const cameraY = animState.cameraY;
      for (let p = 0; p < pageContainers.length; p++) {
        const pageY = pageOffsets[p] - cameraY;
        const pageH = pageHeights[p];
        if (pageY + pageH < 0 || pageY > regionHeight) continue;
        drawEl(pageContainers[p], 0, pageY, regionWidth, pageH);
      }
    }
    ctx.restore();

    // Borders (drawn after restore, on top of the clipped region)
    ctx.save();
    ctx.scale(scaleFactor, scaleFactor);
    ctx.translate(regionX, regionY);
    if (regionRotation !== 0) {
      ctx.translate(regionWidth / 2, regionHeight / 2);
      ctx.rotate((regionRotation * Math.PI) / 180);
      ctx.translate(-regionWidth / 2, -regionHeight / 2);
    }
    if (topBorderImg) {
      ctx.drawImage(topBorderImg, 0, -borderHeight, regionWidth, borderHeight);
    }
    if (bottomBorderImg) {
      ctx.drawImage(bottomBorderImg, 0, regionHeight, regionWidth, borderHeight);
    }
    ctx.restore();
  }

  for (let frame = 0; frame < totalFrames; frame++) {
    if (signal?.aborted) throw new Error('Export cancelled');

    const seconds = frame / fps;

    // Mutate SVG attributes on noteheads for this frame
    applyAnimation(seconds, events, animState, animConfig, cameraEl, scoreEl);

    // Wait for the next paint event — that's when the snapshot is
    // fresh — and compose the frame inside it. The browser pipes the
    // mutated render tree into a snapshot once per rendering update;
    // requestPaint() asks for one to be scheduled.
    await new Promise<void>((resolve, reject) => {
      const onPaint = () => {
        try {
          composeFrame();
          resolve();
        } catch (e) {
          reject(e);
        }
      };
      canvas.addEventListener('paint', onPaint, { once: true });
      canvas.requestPaint?.();
    });

    // Encode (respects encoder backpressure)
    await exporter.addFrame(canvas);

    if (frame % 10 === 0 || frame === totalFrames - 1) {
      onProgress(Math.round((frame / totalFrames) * 90), 'Rendering frames...');
    }
  }

  // ── 9. Encode audio ───────────────────────────────────────────────
  onProgress(92, 'Encoding audio...');

  const audioBuffer = await audioBufferPromise;
  await exporter.addAudio(audioBuffer);

  // ── 10. Finalize MP4 ──────────────────────────────────────────────
  onProgress(97, 'Finalizing...');

  const mp4Buffer = await exporter.finalize();

  // ── 11. Cleanup ───────────────────────────────────────────────────
  bgImage?.close();
  canvas.remove();
  overlay.remove();
  styleEl.remove();

  onProgress(100, 'Complete');

  return new Blob([mp4Buffer], { type: 'video/mp4' });
}
