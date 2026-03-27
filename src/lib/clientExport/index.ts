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
import type { ExportSettings } from '../exportClient';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EDITOR_WIDTH = 980;

// ---------------------------------------------------------------------------
// SVG helpers (ported from export-service/src/standalone/render.ts)
// ---------------------------------------------------------------------------

const HEIGHT_REGEX = /height="(\d+(?:\.\d+)?)px"/;
const VIEWBOX_HEIGHT_REGEX = /viewBox="0 0 [\d.]+ ([\d.]+)"/;
const VIEWBOX_REGEX = /viewBox="([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)"/;

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

function reorderNoteheadsInSvgString(svgString: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgString, 'image/svg+xml');
  if (doc.querySelector('parsererror')) return svgString;
  doc.querySelectorAll('g.stem').forEach((stem) => {
    const parent = stem.parentElement;
    if (parent && parent.firstElementChild !== stem) {
      parent.insertBefore(stem, parent.firstElementChild);
    }
  });
  doc.querySelectorAll('g.notehead').forEach((nh) => {
    const parent = nh.parentElement;
    if (parent && parent.lastElementChild !== nh) {
      parent.appendChild(nh);
    }
  });
  return new XMLSerializer().serializeToString(doc.documentElement);
}

// ---------------------------------------------------------------------------
// Event extraction (ported from export-service/src/standalone/render.ts)
// ---------------------------------------------------------------------------

interface TimemapEvent {
  id: string;
  beatOnset: number;
  beatDuration: number;
  svgIds: string[];
}

function extractTimemapEvents(toolkit: any): TimemapEvent[] {
  const timemap = toolkit.renderToTimemap();
  const onsetEntries = timemap.filter(
    (entry: any) => entry.on && entry.on.length > 0,
  );
  const events: TimemapEvent[] = onsetEntries.map(
    (entry: any, index: number) => ({
      id: `evt-${index}`,
      beatOnset: entry.qstamp / 4,
      beatDuration: 0,
      svgIds: entry.on!,
    }),
  );
  for (let i = 0; i < events.length - 1; i++) {
    events[i].beatDuration = events[i + 1].beatOnset - events[i].beatOnset;
  }
  if (events.length > 0) {
    events[events.length - 1].beatDuration = 1;
  }
  return events;
}

// ---------------------------------------------------------------------------
// Timestamp interpolation (ported from export-service/src/standalone/render.ts)
// ---------------------------------------------------------------------------

const DEFAULT_BPM = 60;

function interpolateTimestamps(
  events: TimemapEvent[],
  anchors: Map<string, number>,
): (TimemapEvent & { computedTimestamp: number })[] {
  if (events.length === 0) return [];
  const sorted = [...events].sort((a, b) => a.beatOnset - b.beatOnset);

  if (anchors.size === 0) {
    return sorted.map((evt) => ({ ...evt, computedTimestamp: 0 }));
  }

  const anchorInfos: { index: number; beatOnset: number; timestamp: number }[] = [];
  sorted.forEach((event, index) => {
    const timestamp = anchors.get(event.id);
    if (timestamp !== undefined) {
      anchorInfos.push({ index, beatOnset: event.beatOnset, timestamp });
    }
  });
  anchorInfos.sort((a, b) => a.beatOnset - b.beatOnset);

  const beatsPerSecond = (() => {
    if (anchorInfos.length >= 2) {
      const first = anchorInfos[0];
      const last = anchorInfos[anchorInfos.length - 1];
      const beatRange = last.beatOnset - first.beatOnset;
      const timeRange = last.timestamp - first.timestamp;
      if (timeRange > 0) return beatRange / timeRange;
    }
    return DEFAULT_BPM / 60;
  })();

  return sorted.map((event) => {
    const anchorTimestamp = anchors.get(event.id);
    if (anchorTimestamp !== undefined) {
      return { ...event, computedTimestamp: anchorTimestamp };
    }

    let prevAnchor: typeof anchorInfos[0] | undefined;
    let nextAnchor: typeof anchorInfos[0] | undefined;
    for (const anchor of anchorInfos) {
      if (anchor.beatOnset <= event.beatOnset) prevAnchor = anchor;
      if (anchor.beatOnset > event.beatOnset && !nextAnchor) {
        nextAnchor = anchor;
        break;
      }
    }

    let computedTimestamp: number;
    if (prevAnchor && nextAnchor) {
      const beatRange = nextAnchor.beatOnset - prevAnchor.beatOnset;
      const timeRange = nextAnchor.timestamp - prevAnchor.timestamp;
      const t = (event.beatOnset - prevAnchor.beatOnset) / beatRange;
      computedTimestamp = prevAnchor.timestamp + t * timeRange;
    } else if (prevAnchor) {
      computedTimestamp = prevAnchor.timestamp + (event.beatOnset - prevAnchor.beatOnset) / beatsPerSecond;
    } else if (nextAnchor) {
      computedTimestamp = nextAnchor.timestamp - (nextAnchor.beatOnset - event.beatOnset) / beatsPerSecond;
    } else {
      computedTimestamp = 0;
    }
    return { ...event, computedTimestamp };
  });
}

// ---------------------------------------------------------------------------
// Event position computation
// ---------------------------------------------------------------------------

function computeEventPositions(
  timemapEvents: TimemapEvent[],
  toolkit: any,
  pageContainers: HTMLElement[],
  pageOffsets: number[],
): { id: string; globalY: number }[] {
  const firstContainer = pageContainers[0];
  const domScale =
    firstContainer && firstContainer.clientWidth > 0
      ? firstContainer.getBoundingClientRect().width / firstContainer.clientWidth
      : 1;

  return timemapEvents.map((event) => {
    if (event.svgIds.length === 0) return { id: event.id, globalY: 0 };

    const pageNum = toolkit.getPageWithElement(event.svgIds[0]);
    if (pageNum === 0) return { id: event.id, globalY: 0 };

    const pageIndex = pageNum - 1;
    const container = pageContainers[pageIndex];
    if (!container) return { id: event.id, globalY: 0 };

    const containerRect = container.getBoundingClientRect();
    const noteEl = container.querySelector(`#${CSS.escape(event.svgIds[0])}`);
    if (!noteEl) return { id: event.id, globalY: 0 };

    const systemEl = noteEl.closest('g.system');
    if (systemEl) {
      const sysRect = systemEl.getBoundingClientRect();
      const localY = (sysRect.top - containerRect.top + sysRect.height / 2) / domScale;
      return { id: event.id, globalY: pageOffsets[pageIndex] + localY };
    }
    const noteRect = noteEl.getBoundingClientRect();
    const localY = (noteRect.top - containerRect.top + noteRect.height / 2) / domScale;
    return { id: event.id, globalY: pageOffsets[pageIndex] + localY };
  });
}

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
function inlineScoreColorInSvg(svgString: string, scoreColor: string): string {
  // NOTE: `use` is handled via SVG fill attributes in bakeAnimationToAttributes,
  // not CSS — CSS fill on `use` doesn't cascade to shadow content in SVG-as-image.
  const style = `<style>
    path, rect, polygon, ellipse { fill: ${scoreColor}; }
    text { fill: ${scoreColor}; }
    [fill="none"] { fill: none !important; }
    g.staff > path { fill: none !important; stroke: ${scoreColor} !important; shape-rendering: crispEdges !important; }
  </style>`;
  return svgString.replace(/<svg([^>]*)>/, `<svg$1>${style}`);
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
function bakeAnimationToAttributes(svgEl: Element, scoreColor: string): void {
  // Set fill attribute on ALL use elements: either animated color or scoreColor.
  // This replaces the CSS `use { fill }` rule entirely — attributes work
  // reliably in SVG-as-image while CSS on `use` shadow content does not.
  svgEl.querySelectorAll('use').forEach((el) => {
    const fill = (el as unknown as ElementCSSInlineStyle).style.fill;
    el.setAttribute('fill', fill || scoreColor);
    const stroke = (el as unknown as ElementCSSInlineStyle).style.stroke;
    if (stroke) el.setAttribute('stroke', stroke);
  });

  // Convert notehead CSS transforms to SVG transform attributes
  svgEl.querySelectorAll('g.notehead').forEach((el) => {
    const s = (el as unknown as ElementCSSInlineStyle).style;
    const transform = s.transform;
    if (!transform || transform === 'scale(1)') return;
    const m = transform.match(/scale\(([\d.]+)\)/);
    if (!m) return;
    const scale = parseFloat(m[1]);
    if (scale === 1) return;
    try {
      const bbox = (el as unknown as SVGGraphicsElement).getBBox();
      const cx = bbox.x + bbox.width / 2;
      const cy = bbox.y + bbox.height / 2;
      el.setAttribute('transform', `translate(${cx},${cy}) scale(${scale}) translate(${-cx},${-cy})`);
    } catch { /* getBBox can fail on hidden elements */ }
  });

  // Bake fill/stroke on full-note elements (stems, accidentals, flags, etc.)
  svgEl.querySelectorAll('g.stem, g.accid, g.flag, g.dots, g.artic').forEach((el) => {
    const s = (el as unknown as ElementCSSInlineStyle).style;
    if (s.fill) el.setAttribute('fill', s.fill);
    if (s.stroke) el.setAttribute('stroke', s.stroke);
    el.querySelectorAll('path, use, polygon, line').forEach((child) => {
      const cs = (child as unknown as ElementCSSInlineStyle).style;
      if (cs.fill) child.setAttribute('fill', cs.fill);
      if (cs.stroke) child.setAttribute('stroke', cs.stroke);
    });
  });
}

/**
 * Render an SVG page element to a drawable Image.
 * Serializes the live SVG (with animation state applied), ensures
 * explicit width/height (required for rasterization), and loads
 * via data URL for maximum browser compatibility.
 */
async function svgPageToImage(
  pageContainer: HTMLElement,
  scoreColor: string,
  width: number,
): Promise<HTMLImageElement> {
  const svgEl = pageContainer.querySelector('svg');
  if (!svgEl) throw new Error('No SVG element found in page container');

  // Bake animation state into SVG attributes (CSS on use elements
  // doesn't work in SVG-as-image, but SVG attributes do)
  bakeAnimationToAttributes(svgEl, scoreColor);

  let svgString = new XMLSerializer().serializeToString(svgEl);
  svgString = inlineScoreColorInSvg(svgString, scoreColor);

  // Ensure xmlns
  if (!svgString.includes('xmlns=')) {
    svgString = svgString.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
  }

  // Ensure explicit width/height (Verovio may only set viewBox).
  // Extract height from the SVG or viewBox, set width to the score region width.
  if (!svgString.match(/\swidth="[^"]+"/)) {
    const vbMatch = svgString.match(VIEWBOX_REGEX);
    const h = vbMatch ? parseFloat(vbMatch[4]) : 1000;
    const w = vbMatch ? parseFloat(vbMatch[3]) : width;
    svgString = svgString.replace(
      /<svg([^>]*)>/,
      `<svg$1 width="${w}" height="${h}">`,
    );
  }

  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to decode SVG page'));
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgString);
  });
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
  const { musicXml, syncAnchors, settings, audioFile, bgImageUrl, onProgress, signal } = params;

  onProgress(0, 'Preparing score...');

  // ── 1. Compute layout constants ───────────────────────────────────
  // Derive viewport dimensions from background image (matching preview behavior)
  let viewportWidth = 1920;
  let viewportHeight = 1080;
  if (bgImageUrl) {
    const dims = await new Promise<{ w: number; h: number }>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = () => reject(new Error('Failed to load background image for dimensions'));
      img.src = bgImageUrl;
    });
    // Cap longest side to 1920 (preserving aspect ratio)
    const MAX_DIM = 1920;
    if (dims.w > MAX_DIM || dims.h > MAX_DIM) {
      const scale = MAX_DIM / Math.max(dims.w, dims.h);
      dims.w = Math.round(dims.w * scale);
      dims.h = Math.round(dims.h * scale);
    }
    // H.264 requires even dimensions
    viewportWidth = dims.w & ~1;
    viewportHeight = dims.h & ~1;
  }
  const scaleFactor = viewportWidth / EDITOR_WIDTH;
  const containerWidth = EDITOR_WIDTH;
  const containerHeight = Math.floor(viewportHeight / scaleFactor);
  const regionWidth = settings.scoreRegion?.width ?? containerWidth;
  const regionHeight = settings.scoreRegion?.height ?? containerHeight;

  // ── 2. Initialize Verovio ─────────────────────────────────────────
  const toolkit = await createToolkit();

  const verovioScale = Math.round(40 * (settings.scoreScale ?? 1));
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

  const loaded = toolkit.loadData(musicXml);
  if (!loaded) throw new Error('Failed to load MusicXML data');
  toolkit.renderToMIDI();

  // ── 3. Render SVG pages ───────────────────────────────────────────
  const pageCount = toolkit.getPageCount();
  const svgPages: string[] = [];
  for (let i = 1; i <= pageCount; i++) {
    let svg = toolkit.renderToSVG(i);
    if (i > 1) svg = trimPageTopMargin(svg);
    svg = reorderNoteheadsInSvgString(svg);
    svgPages.push(svg);
  }

  const pageHeights = svgPages.map(extractPageHeight);
  const pageOffsets: number[] = [];
  let cumulative = 0;
  for (const h of pageHeights) {
    pageOffsets.push(cumulative);
    cumulative += h;
  }
  const totalHeight = cumulative;

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
  rotationWrapperEl.appendChild(regionEl);

  // Camera div
  const cameraEl = document.createElement('div');
  cameraEl.style.display = 'flex';
  cameraEl.style.width = '100%';
  cameraEl.style.transition = 'none';
  regionEl.appendChild(cameraEl);

  // Score div
  const scoreEl = document.createElement('div');
  scoreEl.className = 'client-export-score';
  scoreEl.style.width = `${regionWidth}px`;
  scoreEl.style.lineHeight = '0';
  scoreEl.style.fontSize = '0';
  cameraEl.appendChild(scoreEl);

  // Mount SVG pages
  const pageContainers: HTMLElement[] = [];
  for (const svg of svgPages) {
    const pageDiv = document.createElement('div');
    pageDiv.className = 'client-export-score';
    pageDiv.style.width = `${regionWidth}px`;
    pageDiv.innerHTML = svg;
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

  const timemapEvents = extractTimemapEvents(toolkit);
  const interpolated = interpolateTimestamps(timemapEvents, syncAnchors);
  const positions = computeEventPositions(timemapEvents, toolkit, pageContainers, pageOffsets);
  const yMap = new Map(positions.map((p) => [p.id, p.globalY]));

  const events: AnimationEvent[] = interpolated.map((evt) => ({
    computedTimestamp: evt.computedTimestamp,
    y: yMap.get(evt.id) ?? 0,
    svgIds: evt.svgIds,
  }));

  // ── 6. Setup animation ────────────────────────────────────────────
  const animState: AnimationState = createAnimationState();
  const animConfig: AnimationConfig = {
    scoreColor: settings.scoreColor,
    activeNoteheadColor: settings.activeNoteheadColor ?? settings.scoreColor,
    activeNoteheadScale: settings.activeNoteheadScale ?? 1,
    activeNoteheadHoldMs: settings.activeNoteheadHoldMs ?? 200,
    activeNoteheadExitMs: settings.activeNoteheadExitMs ?? 200,
    colorFullNote: settings.colorFullNote ?? false,
    scoreRegionHeight: settings.scoreRegion?.height ?? null,
    containerHeight,
    totalHeight,
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

  // ── 8. Frame capture loop ─────────────────────────────────────────
  onProgress(0, 'Rendering frames...');

  for (let frame = 0; frame < totalFrames; frame++) {
    if (signal?.aborted) throw new Error('Export cancelled');

    const seconds = frame / fps;

    // Apply animation state (modifies SVG DOM: noteheads + camera)
    applyAnimation(seconds, events, animState, animConfig, cameraEl, scoreEl);
    void scoreEl.offsetHeight; // force reflow

    // Clear canvas
    ctx.clearRect(0, 0, viewportWidth, viewportHeight);

    // Draw background
    if (bgImage) {
      ctx.drawImage(bgImage, 0, 0, viewportWidth, viewportHeight);
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

    // Draw each page at its offset, shifted by camera
    const cameraY = animState.cameraY;
    for (let p = 0; p < pageContainers.length; p++) {
      const pageY = pageOffsets[p] - cameraY;
      const pageH = pageHeights[p];

      // Skip pages entirely outside the viewport
      if (pageY + pageH < 0 || pageY > regionHeight) continue;

      const img = await svgPageToImage(pageContainers[p], settings.scoreColor, regionWidth);
      ctx.drawImage(img, 0, pageY, regionWidth, pageH);
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

    // Encode frame
    exporter.addFrame(canvas);

    // Report progress
    if (frame % 10 === 0 || frame === totalFrames - 1) {
      onProgress(Math.round((frame / totalFrames) * 90), 'Rendering frames...');
      // Yield to browser to prevent UI freeze
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  // ── 9. Encode audio ───────────────────────────────────────────────
  onProgress(92, 'Encoding audio...');

  const audioArrayBuffer = await audioFile.arrayBuffer();
  const audioCtx = new AudioContext({ sampleRate: 44100 });
  const audioBuffer = await audioCtx.decodeAudioData(audioArrayBuffer);
  await audioCtx.close();
  await exporter.addAudio(audioBuffer);

  // ── 10. Finalize MP4 ──────────────────────────────────────────────
  onProgress(97, 'Finalizing...');

  const mp4Buffer = await exporter.finalize();

  // ── 11. Cleanup ───────────────────────────────────────────────────
  bgImage?.close();
  shadowHost.remove();

  onProgress(100, 'Complete');

  return new Blob([mp4Buffer], { type: 'video/mp4' });
}
