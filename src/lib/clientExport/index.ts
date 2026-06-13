/**
 * Client-side video export.
 *
 * Renders the score animation entirely in the browser using:
 * - Verovio for SVG score rendering
 * - DOM animation (same engine as server-side export)
 * - SVG → Canvas rasterization per frame
 * - WebCodecs H.264 hardware encoding
 * - mp4-muxer for MP4 container + audio
 *
 * Zero server cost. Uses the user's own hardware encoder.
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
import { splitSingleLineSvg } from '../splitSingleLineSvg';
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

// Maximum raster dimension for a single SVG page/section image. Browsers
// silently fail (or produce blank frames) when decoding/drawing images far
// beyond GPU texture limits — Chrome's practical ceiling is ~16384px.
const MAX_RASTER_DIM = 16000;

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
  return `
    .client-export-score svg path,
    .client-export-score svg rect,
    .client-export-score svg polygon,
    .client-export-score svg ellipse,
    .client-export-score svg use {
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
// SVG page → ImageBitmap rasterization
// ---------------------------------------------------------------------------

/**
 * Add inline CSS to an SVG string so it renders correctly when
 * rasterized outside the document context.
 */
function inlineScoreColorInSvg(
  svgString: string,
  scoreColor: string,
  hideLeadStaffSymbols = false,
): string {
  // IMPORTANT: `path` and `use` are NOT targeted by CSS here.
  //
  // Music glyphs are <path> elements inside <use> shadow trees. A CSS
  // rule `path { fill: scoreColor }` penetrates into the <use> shadow
  // and overrides the fill that paths would inherit from their <use>
  // parent — breaking animated highlight colors.
  //
  // Instead, fill is set on the root <svg> element as an attribute.
  // All paths inherit scoreColor via SVG inheritance. Animated <use>
  // elements have fill="highlightColor" set by the animation, which
  // cascades to their shadow paths without CSS interference.
  // hideLeadStaffSymbols: continuation sections of a sectioned single-line
  // score render their own leading clef/key/time signature — hide them for
  // visual parity with the preview's .section-continuation CSS (which can't
  // reach this standalone serialized SVG).
  const style = `<style>
    rect, polygon, ellipse { fill: ${scoreColor}; }
    text { fill: ${scoreColor}; }
    [fill="none"] { fill: none !important; }
    g.staff > path { fill: none !important; stroke: ${scoreColor} !important; shape-rendering: crispEdges !important; }
    ${hideLeadStaffSymbols ? 'g.clef, g.keySig, g.meterSig { display: none !important; }' : ''}
  </style>`;
  // Set fill on root SVG for inheritance to all descendant paths
  return svgString.replace(/<svg([^>]*)>/, `<svg$1 fill="${scoreColor}">${style}`);
}

/**
 * Bake animation state into SVG attributes.
 *
 * The animation sets inline CSS (style.fill, style.transform) which the
 * browser renders directly in the preview. But for the export we serialize
 * SVG → data URL → Image, and CSS properties on SVG `use` elements don't
 * reliably cascade to their referenced content in that context.
 *
 * Fix: copy the CSS values to SVG attributes which ARE respected in
 * SVG-as-image. For notehead scale, convert CSS transform to SVG
 * transform attribute (with manual center-point computation via getBBox).
 */
/**
 * Set scoreColor fill on use elements that don't already have a fill
 * attribute from the animation. The animation now sets fill as SVG
 * attributes directly, so we just need to fill in the default.
 */
function setDefaultFillOnUseElements(svgEl: Element, scoreColor: string): void {
  svgEl.querySelectorAll('use').forEach((el) => {
    if (!el.getAttribute('fill')) {
      el.setAttribute('fill', scoreColor);
    }
  });
}

/** Drawable source for canvas — either an Image or ImageBitmap. */
type CanvasImageSource = HTMLImageElement | ImageBitmap;

/**
 * Render an SVG page element to a drawable image.
 *
 * Uses Blob URL + HTMLImageElement decode rather than createImageBitmap:
 * createImageBitmap's Blob path is implementation-specific for SVG sources
 * (see HTML spec note on image format support) and in practice fails to
 * decode Verovio output in Chrome — "The source image could not be decoded"
 * — likely because the off-document rasterizer can't resolve the internal
 * <use> shadow trees the way the HTMLImageElement decode path can.
 */
async function svgPageToImage(
  pageContainer: HTMLElement,
  scoreColor: string,
  width: number,
  rasterScale: number,
  hideLeadStaffSymbols = false,
  overscanCss = 0,
): Promise<CanvasImageSource> {
  const svgEl = pageContainer.querySelector('svg');
  if (!svgEl) throw new Error('No SVG element found in page container');

  // Set default fill on use elements without an animated fill attribute
  setDefaultFillOnUseElements(svgEl, scoreColor);

  let svgString = new XMLSerializer().serializeToString(svgEl);
  svgString = inlineScoreColorInSvg(svgString, scoreColor, hideLeadStaffSymbols);

  // Ensure xmlns
  if (!svgString.includes('xmlns=')) {
    svgString = svgString.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
  }

  if (overscanCss > 0) {
    // Expand both viewBoxes horizontally so content that overflows the
    // section window (ties/slurs reaching into a neighboring section) is
    // included in the raster. The caller draws the image shifted left by the
    // same overscan, so neighboring sections composite seamlessly.
    const vbs = [...svgString.matchAll(/viewBox="(-?[\d.]+)[ ,]+(-?[\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)"/g)];
    if (vbs.length >= 2) {
      const oW = parseFloat(vbs[0][3]);
      const iX = parseFloat(vbs[1][1]);
      const iW = parseFloat(vbs[1][3]);
      if (oW > 0 && iW > 0) {
        const innerOverscan = (overscanCss * iW) / oW;
        svgString = svgString
          .replace(vbs[0][0], `viewBox="0 0 ${oW + 2 * overscanCss} ${vbs[0][4]}"`)
          .replace(vbs[1][0], `viewBox="${iX - innerOverscan} ${vbs[1][2]} ${iW + 2 * innerOverscan} ${vbs[1][4]}"`);
      }
    }
  }

  // Set width/height to the final output pixel dimensions so the browser
  // rasterizes the SVG at full resolution. The viewBox (SVG coordinate
  // space) is preserved — the vector content scales up to fill the
  // larger pixel grid, giving crisp output at 4K.
  const vbMatch = svgString.match(VIEWBOX_REGEX);
  const vbW = vbMatch ? parseFloat(vbMatch[3]) : width;
  const vbH = vbMatch ? parseFloat(vbMatch[4]) : 1000;
  const pixelW = Math.round(vbW * rasterScale);
  const pixelH = Math.round(vbH * rasterScale);
  if (pixelW > MAX_RASTER_DIM || pixelH > MAX_RASTER_DIM) {
    // Fail loudly: browsers decode oversized images to blank/garbage frames
    // with no error, which is much harder to diagnose than this.
    throw new Error(
      `Score section too large to rasterize (${pixelW}x${pixelH}px, limit ${MAX_RASTER_DIM}px). ` +
      'Try the Page layout or a smaller score size.',
    );
  }
  // Strip existing width/height then inject scaled dimensions
  svgString = svgString.replace(/\s(width|height)="[^"]*"/g, '');
  svgString = svgString.replace(
    /<svg([^>]*)>/,
    `<svg$1 width="${pixelW}" height="${pixelH}">`,
  );

  const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Failed to decode SVG page'));
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

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
  // Whether single-line sections came from one seamless layout split (true)
  // vs per-section re-layout via select() (false). Affects continuation
  // clef hiding and raster overscan below.
  let singleLineSeamless = true;

  if (isSingleLine) {
    // Single-line: render as one SVG only when its raster at output scale
    // stays under the browser decode/draw limit. Longer scores are laid out
    // ONCE and the rendered SVG is split into sections (same approach as
    // useSingleLineVerovio) — one layout pass keeps staff spacing identical
    // across sections, while sections keep each raster under MAX_RASTER_DIM
    // and limit per-frame re-rasterization to the section with active
    // noteheads.
    const EXPORT_MEASURES_PER_SECTION = 8;
    let renderedSections: string[] | null = null;

    if (toolkit.getPageCount() <= 1) {
      const fullSvg = reorderNoteheadsInSvgString(toolkit.renderToSVG(1));
      const fullDims = extractSectionDims(fullSvg);
      if (fullDims.width > 0) {
        if (
          fullDims.width * scaleFactor <= MAX_RASTER_DIM &&
          fullDims.height * scaleFactor <= MAX_RASTER_DIM
        ) {
          renderedSections = [fullSvg];
        } else {
          const split = splitSingleLineSvg(fullSvg, EXPORT_MEASURES_PER_SECTION);
          // No split possible → keep the single SVG; svgPageToImage's raster
          // guard fails the export with an actionable error instead of
          // silently producing blank frames.
          renderedSections = split ? split.map((s) => s.svg) : [fullSvg];
        }
      }
    }

    if (!renderedSections) {
      // Score overflows Verovio's 100,000px page width — fall back to
      // per-measure-range re-layout (staff spacing may differ between
      // sections; leading clef/key/time signatures are re-stated per section
      // and hidden at raster time).
      singleLineSeamless = false;
      const mei = toolkit.getMEI();
      const totalMeasures = (mei.match(/<measure /g) || []).length;
      renderedSections = [];
      for (let start = 1; start <= totalMeasures; start += EXPORT_MEASURES_PER_SECTION) {
        const end = Math.min(start + EXPORT_MEASURES_PER_SECTION - 1, totalMeasures);
        toolkit.select({ measureRange: `${start}-${end}` });
        toolkit.redoLayout();
        renderedSections.push(reorderNoteheadsInSvgString(toolkit.renderToSVG(1)));
      }
      // Clear selection so timemap/position queries see the full score
      toolkit.select({});
      toolkit.redoLayout();
    }

    let cumulative = 0;
    let maxSectionHeight = 0;
    for (const svg of renderedSections) {
      const dims = extractSectionDims(svg);
      svgPages.push(svg);
      sectionWidths.push(dims.width);
      sectionOffsets.push(cumulative);
      cumulative += dims.width;
      pageHeights.push(dims.height);
      pageOffsets.push(0);
      maxSectionHeight = Math.max(maxSectionHeight, dims.height);
    }
    totalWidth = cumulative;
    totalHeight = maxSectionHeight;
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

  // ── 4. Build hidden DOM ───────────────────────────────────────────
  // Use Shadow DOM to isolate SVG element IDs from the preview.
  // Without this, querySelector('#note-id') fails because the preview
  // has Verovio SVGs with the same IDs already in the document.
  const shadowHost = document.createElement('div');
  shadowHost.style.position = 'fixed';
  shadowHost.style.left = '-99999px';
  shadowHost.style.top = '0';
  document.body.appendChild(shadowHost);
  const shadow = shadowHost.attachShadow({ mode: 'open' });

  const hostEl = document.createElement('div');
  hostEl.style.width = `${viewportWidth}px`;
  hostEl.style.height = `${viewportHeight}px`;
  hostEl.style.overflow = 'hidden';
  shadow.appendChild(hostEl);

  // Score color CSS (scoped inside shadow DOM)
  const styleEl = document.createElement('style');
  styleEl.textContent = buildScoreColorCss(settings.scoreColor, settings.hideLabels);
  shadow.appendChild(styleEl);

  // Scale wrapper
  const scaleEl = document.createElement('div');
  scaleEl.style.transformOrigin = 'top left';
  scaleEl.style.transform = `scale(${scaleFactor})`;
  hostEl.appendChild(scaleEl);

  // Main container
  const mainEl = document.createElement('div');
  mainEl.style.position = 'relative';
  mainEl.style.width = `${containerWidth}px`;
  mainEl.style.height = `${containerHeight}px`;
  mainEl.style.overflow = 'hidden';
  scaleEl.appendChild(mainEl);

  // Background
  const bgEl = document.createElement('div');
  bgEl.style.width = `${containerWidth}px`;
  bgEl.style.height = `${containerHeight}px`;
  if (bgImageUrl) {
    bgEl.style.backgroundImage = `url(${bgImageUrl})`;
    bgEl.style.backgroundSize = 'cover';
  } else if (bgColor) {
    bgEl.style.backgroundColor = bgColor;
  }
  mainEl.appendChild(bgEl);

  // Score region
  const regionX = settings.scoreRegion?.x ?? 0;
  const regionY = settings.scoreRegion?.y ?? 0;
  const regionRotation = settings.scoreRegion?.rotation ?? 0;

  const rotationWrapperEl = document.createElement('div');
  rotationWrapperEl.style.position = 'absolute';
  rotationWrapperEl.style.left = `${regionX}px`;
  rotationWrapperEl.style.top = `${regionY}px`;
  rotationWrapperEl.style.width = `${regionWidth}px`;
  rotationWrapperEl.style.height = `${regionHeight}px`;
  if (regionRotation !== 0) {
    rotationWrapperEl.style.transform = `rotate(${regionRotation}deg)`;
    rotationWrapperEl.style.transformOrigin = 'center center';
  }
  bgEl.appendChild(rotationWrapperEl);

  const regionEl = document.createElement('div');
  regionEl.style.position = 'absolute';
  regionEl.style.left = '0';
  regionEl.style.top = '0';
  regionEl.style.width = `${regionWidth}px`;
  regionEl.style.height = `${regionHeight}px`;
  regionEl.style.overflow = 'hidden';
  if (isSingleLine) {
    regionEl.style.display = 'flex';
    regionEl.style.alignItems = 'center';
  }
  rotationWrapperEl.appendChild(regionEl);

  // Camera div
  const cameraEl = document.createElement('div');
  cameraEl.style.display = 'flex';
  cameraEl.style.flexDirection = isSingleLine ? 'row' : 'column';
  cameraEl.style.transition = 'none';
  if (!isSingleLine) cameraEl.style.width = '100%';
  regionEl.appendChild(cameraEl);

  // Score div
  const scoreEl = document.createElement('div');
  scoreEl.className = 'client-export-score';
  scoreEl.style.lineHeight = '0';
  scoreEl.style.fontSize = '0';
  if (isSingleLine) {
    scoreEl.style.display = 'flex';
    scoreEl.style.flexDirection = 'row';
  } else {
    scoreEl.style.width = `${regionWidth}px`;
  }
  cameraEl.appendChild(scoreEl);

  // Mount SVG pages/sections
  const pageContainers: HTMLElement[] = [];
  for (let idx = 0; idx < svgPages.length; idx++) {
    const pageDiv = document.createElement('div');
    pageDiv.className = 'client-export-score';
    if (isSingleLine) {
      pageDiv.style.flexShrink = '0';
      pageDiv.style.width = `${sectionWidths[idx]}px`;
      pageDiv.style.display = 'flex';
      pageDiv.style.alignItems = 'flex-start';
    } else {
      pageDiv.style.width = `${regionWidth}px`;
    }
    pageDiv.innerHTML = svgPages[idx];
    scoreEl.appendChild(pageDiv);
    pageContainers.push(pageDiv);
  }

  // Borders
  const borderStyle = (settings.scoreBorder ?? 'none') as BorderStyle;
  if (borderStyle !== 'none') {
    const borderHeight = getBorderHeight(borderStyle);
    const topBorderDiv = document.createElement('div');
    topBorderDiv.style.position = 'absolute';
    topBorderDiv.style.top = `${-borderHeight}px`;
    topBorderDiv.style.left = '0';
    topBorderDiv.style.width = `${regionWidth}px`;
    topBorderDiv.style.zIndex = '3';
    topBorderDiv.innerHTML = generateBorderSvg(borderStyle, regionWidth, settings.scoreColor, 'top');
    rotationWrapperEl.appendChild(topBorderDiv);

    const bottomBorderDiv = document.createElement('div');
    bottomBorderDiv.style.position = 'absolute';
    bottomBorderDiv.style.top = `${regionHeight}px`;
    bottomBorderDiv.style.left = '0';
    bottomBorderDiv.style.width = `${regionWidth}px`;
    bottomBorderDiv.style.zIndex = '3';
    bottomBorderDiv.innerHTML = generateBorderSvg(borderStyle, regionWidth, settings.scoreColor, 'bottom');
    rotationWrapperEl.appendChild(bottomBorderDiv);
  }

  // ── 5. Extract events and compute positions ───────────────────────
  // Force layout so getBoundingClientRect works
  void hostEl.offsetHeight;

  // Extract events and interpolate timestamps using shared modules
  // (identical to the preview renderers).
  const timemapEvents = extractTimemapEvents(toolkit);
  const interpolated = interpolateTimestamps(timemapEvents, syncAnchors);
  const positions = computeEventPositions(timemapEvents, toolkit, pageContainers, pageOffsets);
  const yMap = new Map(positions.map((p) => [p.id, p.globalY]));

  // For single-line mode, compute X positions and a note-id → section index
  // map. The section map drives per-frame dirty tracking: with breaks:'none'
  // every section is Verovio page 1, so getPageWithElement can't distinguish
  // sections — only a DOM search can.
  let xMap = new Map<string, number>();
  const sectionIndexByNoteId = new Map<string, number>();
  if (isSingleLine) {
    const locate = (id: string): { ci: number; el: Element } | null => {
      for (let ci = 0; ci < pageContainers.length; ci++) {
        const el = pageContainers[ci].querySelector(`#${CSS.escape(id)}`);
        if (el) return { ci, el };
      }
      return null;
    };

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
      const found = locate(posId);
      if (found) {
        sectionIndexByNoteId.set(posId, found.ci);
        const containerRect = pageContainers[found.ci].getBoundingClientRect();
        const noteRect = found.el.getBoundingClientRect();
        // Divide by domScale to convert from viewport pixels to pre-transform units
        const localX = (noteRect.left - containerRect.left + noteRect.width / 2) / domScale;
        xMap.set(tmEvt.id, sectionOffsets[found.ci] + localX);
      }
      // Tied continuations can live in a later section than the event onset —
      // locate them too so dirty tracking re-rasterizes their section.
      for (const contId of tmEvt.tiedContinuationIds ?? []) {
        const f = locate(contId);
        if (f) sectionIndexByNoteId.set(contId, f.ci);
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

  // Build event→pages index for dirty tracking during frame loop.
  // Maps each event index to the pages/sections (0-based) its animated notes
  // live on — including tied continuations, which can cross a page/section
  // boundary and must mark that page dirty too.
  const eventPageIndices: number[][] = interpolated.map((evt) => {
    const ids = [
      evt.positionSvgId || evt.svgIds[0],
      ...(evt.tiedContinuationIds ?? []),
    ].filter((id): id is string => !!id);
    const pages = new Set<number>();
    for (const id of ids) {
      const pg = isSingleLine
        ? (sectionIndexByNoteId.get(id) ?? -1)
        : toolkit.getPageWithElement(id) - 1;
      if (pg >= 0) pages.add(pg);
    }
    return [...pages];
  });

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

  // ── 7. Setup canvas + encoder ─────────────────────────────────────
  const audioDuration = settings.audioDuration ?? 0;
  const fps = settings.fps;
  const totalFrames = Math.ceil(audioDuration * fps);

  const canvas = document.createElement('canvas');
  canvas.width = viewportWidth;
  canvas.height = viewportHeight;
  const ctx = canvas.getContext('2d')!;

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

  // Horizontal raster overscan (CSS px) for seamless single-line sections:
  // a tie/slur that crosses a section boundary lives in the section where it
  // starts and extends past that section's viewBox. Padding each raster (and
  // drawing it shifted left by the same amount) lets those tails composite
  // into the neighboring section's area.
  const SECTION_RASTER_OVERSCAN = 100;
  const sectionOverscan =
    isSingleLine && singleLineSeamless && svgPages.length > 1 ? SECTION_RASTER_OVERSCAN : 0;

  // Lazily rasterized page/section images. A page is rasterized the first
  // time it becomes visible in the frame loop (and re-rasterized while its
  // noteheads animate), and RELEASED once it falls fully behind the camera —
  // the export camera only moves forward, and the lazy path covers any
  // unexpected revisit. This bounds raster memory to the visible window;
  // the previous rasterize-everything-up-front pass held every page at
  // output resolution for the entire export (GBs on long scores).
  const pageCache: (CanvasImageSource | null)[] = [];
  const releasePage = (p: number) => {
    const cached = pageCache[p];
    if (cached) {
      if ('close' in cached) cached.close();
      pageCache[p] = null;
    }
  };

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

  for (let frame = 0; frame < totalFrames; frame++) {
    if (signal?.aborted) throw new Error('Export cancelled');

    const seconds = frame / fps;

    // Apply animation state (sets SVG attributes on noteheads + camera translateY)
    applyAnimation(seconds, events, animState, animConfig, cameraEl, scoreEl);

    // Determine which pages had noteheads modified (reset or animated)
    // so only those pages need re-rasterization.
    const dirtyPages = new Set<number>();
    if (animState.prevActiveRange) {
      for (let i = animState.prevActiveRange.start; i <= animState.prevActiveRange.end; i++) {
        for (const pg of eventPageIndices[i]) dirtyPages.add(pg);
      }
    }

    // Clear canvas and draw background
    if (bgImage) {
      ctx.drawImage(bgImage, 0, 0, viewportWidth, viewportHeight);
    } else if (bgColor) {
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, viewportWidth, viewportHeight);
    } else {
      ctx.clearRect(0, 0, viewportWidth, viewportHeight);
    }

    // Rasterize each SVG page and draw to canvas with camera offset
    ctx.save();
    // Apply the same scale + positioning as the DOM layout
    ctx.scale(scaleFactor, scaleFactor);
    ctx.translate(regionX, regionY);
    if (regionRotation !== 0) {
      ctx.translate(regionWidth / 2, regionHeight / 2);
      ctx.rotate((regionRotation * Math.PI) / 180);
      ctx.translate(-regionWidth / 2, -regionHeight / 2);
    }

    // Clip to score region
    ctx.beginPath();
    ctx.rect(0, 0, regionWidth, regionHeight);
    ctx.clip();

    // Draw each page/section at its offset, shifted by camera. Rasterize
    // lazily on first visibility, re-rasterize while animating, release once
    // fully behind the camera.
    if (isSingleLine) {
      const cameraX = animState.cameraX;
      for (let p = 0; p < pageContainers.length; p++) {
        const sectionX = sectionOffsets[p] - cameraX;
        const sectionW = sectionWidths[p];
        const sectionH = pageHeights[p];

        if (sectionX + sectionW < -sectionOverscan) {
          // Fully behind the camera — won't be needed again
          releasePage(p);
          continue;
        }
        if (sectionX > regionWidth + sectionOverscan) continue; // ahead, not yet visible

        if (!pageCache[p] || dirtyPages.has(p)) {
          pageCache[p] = await svgPageToImage(
            pageContainers[p], settings.scoreColor, sectionW, scaleFactor,
            p > 0 && !singleLineSeamless,
            sectionOverscan,
          );
        }
        // Vertically center the section within the region. The raster is
        // overscanned horizontally — draw it shifted left by the overscan
        // so the section content lands exactly at sectionX.
        const yOff = (regionHeight - sectionH) / 2;
        ctx.drawImage(
          pageCache[p]!,
          sectionX - sectionOverscan,
          yOff,
          sectionW + 2 * sectionOverscan,
          sectionH,
        );
      }
    } else {
      const cameraY = animState.cameraY;
      for (let p = 0; p < pageContainers.length; p++) {
        const pageY = pageOffsets[p] - cameraY;
        const pageH = pageHeights[p];

        if (pageY + pageH < 0) {
          // Fully behind the camera — won't be needed again
          releasePage(p);
          continue;
        }
        if (pageY > regionHeight) continue; // ahead, not yet visible

        if (!pageCache[p] || dirtyPages.has(p)) {
          pageCache[p] = await svgPageToImage(pageContainers[p], settings.scoreColor, regionWidth, scaleFactor);
        }
        ctx.drawImage(pageCache[p]!, 0, pageY, regionWidth, pageH);
      }
    }

    // Draw borders (on top of clipped region)
    ctx.restore();
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

    // Encode frame (async — respects encoder backpressure)
    await exporter.addFrame(canvas);

    // Report progress
    if (frame % 10 === 0 || frame === totalFrames - 1) {
      onProgress(Math.round((frame / totalFrames) * 90), 'Rendering frames...');
    }
    // No explicit setTimeout(0) yield here: encoder backpressure
    // (encode.ts MAX_QUEUE wait) already yields when the queue fills,
    // and svgPageToImage's await createImageBitmap yields between
    // rasterizations. The extra forced yield was costing 3–10 % wall
    // clock without changing perceived responsiveness — the export
    // modal stays responsive via the natural awaits in this loop.
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
  // Close any ImageBitmap-backed page cache entries. HTMLImageElement
  // entries have no close() — they're GC'd with the shadowHost removal.
  for (const cached of pageCache) {
    if (cached && 'close' in cached) cached.close();
  }
  shadowHost.remove();

  onProgress(100, 'Complete');

  return new Blob([mp4Buffer], { type: 'video/mp4' });
}
