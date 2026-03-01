/**
 * Server-side frame render generator.
 *
 * Replaces the Puppeteer-based captureFrames.ts with an entirely in-process
 * pipeline: Verovio WASM → SVG manipulation (linkedom) → composite SVG →
 * rasterization (resvg-js) → PNG buffer.
 *
 * The setup phase runs once per job (Verovio init, SVG rendering, position
 * extraction, animation preparation). The per-frame loop modifies the SVG
 * DOM in-place, builds a composite SVG, and rasterizes it.
 */

import { DOMParser } from 'linkedom';
import { Resvg } from '@resvg/resvg-js';
import createVerovioModule from 'verovio/wasm';
import { VerovioToolkit } from 'verovio/esm';

import type { ExportConfig } from '../shared/exportConfig.js';
import { generateBorderSvg, getBorderHeight, type BorderStyle } from '../standalone/borders.js';
import {
  createAnimationState,
  type AnimationConfig,
  type AnimationEvent,
} from '../standalone/animation.js';

import {
  computeEventPositionsFromSvg,
  precomputeNoteheadCenters,
} from './svgPositions.js';
import {
  setTimestampSvg,
  saveOriginalTransforms,
} from './svgAnimation.js';
import {
  buildCompositeSvg,
  type CompositorConfig,
  type PageInfo,
} from './svgCompositor.js';

// ---------------------------------------------------------------------------
// Constants (matching standalone/render.ts)
// ---------------------------------------------------------------------------

const EDITOR_WIDTH = 980;

// ---------------------------------------------------------------------------
// SVG helpers (ported from standalone/render.ts)
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

function extractViewBox(svgString: string): string {
  const m = svgString.match(VIEWBOX_REGEX);
  return m ? `${m[1]} ${m[2]} ${m[3]} ${m[4]}` : '0 0 0 0';
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

/**
 * Reorder notehead/stem elements using linkedom DOM parser.
 * Noteheads paint above stems for correct visual layering.
 */
function reorderNoteheadsInSvg(svgString: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgString, 'image/svg+xml');
  const root = doc.documentElement;
  if (!root) return svgString;

  for (const stem of root.querySelectorAll('g.stem')) {
    const parent = stem.parentElement;
    if (parent && parent.firstElementChild !== stem) {
      parent.insertBefore(stem, parent.firstElementChild);
    }
  }

  for (const nh of root.querySelectorAll('g.notehead')) {
    const parent = nh.parentElement;
    if (parent && parent.lastElementChild !== nh) {
      parent.appendChild(nh);
    }
  }

  return root.toString();
}

// ---------------------------------------------------------------------------
// Event extraction (from standalone/render.ts)
// ---------------------------------------------------------------------------

interface TimemapEvent {
  id: string;
  beatOnset: number;
  beatDuration: number;
  svgIds: string[];
}

function extractTimemapEvents(toolkit: VerovioToolkit): TimemapEvent[] {
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
// Timestamp interpolation (from standalone/render.ts)
// ---------------------------------------------------------------------------

interface AnchorInfo {
  index: number;
  beatOnset: number;
  timestamp: number;
}

const DEFAULT_BPM = 60;

function interpolateTimestamps<T extends TimemapEvent>(
  events: T[],
  anchors: Map<string, number>,
): (T & { computedTimestamp: number })[] {
  if (events.length === 0) return [];

  const sorted = [...events].sort((a, b) => a.beatOnset - b.beatOnset);

  if (anchors.size === 0) {
    return sorted.map((evt) => ({ ...evt, computedTimestamp: 0 }));
  }

  const anchorInfos: AnchorInfo[] = [];
  sorted.forEach((event, index) => {
    const timestamp = anchors.get(event.id);
    if (timestamp !== undefined) {
      anchorInfos.push({ index, beatOnset: event.beatOnset, timestamp });
    }
  });
  anchorInfos.sort((a, b) => a.beatOnset - b.beatOnset);

  const getBeatsPerSecond = (): number => {
    if (anchorInfos.length >= 2) {
      const first = anchorInfos[0];
      const last = anchorInfos[anchorInfos.length - 1];
      const beatRange = last.beatOnset - first.beatOnset;
      const timeRange = last.timestamp - first.timestamp;
      if (timeRange > 0) return beatRange / timeRange;
    }
    return DEFAULT_BPM / 60;
  };

  const beatsPerSecond = getBeatsPerSecond();

  return sorted.map((event) => {
    const anchorTimestamp = anchors.get(event.id);
    if (anchorTimestamp !== undefined) {
      return { ...event, computedTimestamp: anchorTimestamp };
    }

    let prevAnchor: AnchorInfo | undefined;
    let nextAnchor: AnchorInfo | undefined;

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
      const beatDiff = event.beatOnset - prevAnchor.beatOnset;
      computedTimestamp = prevAnchor.timestamp + beatDiff / beatsPerSecond;
    } else if (nextAnchor) {
      const beatDiff = nextAnchor.beatOnset - event.beatOnset;
      computedTimestamp = nextAnchor.timestamp - beatDiff / beatsPerSecond;
    } else {
      computedTimestamp = 0;
    }

    return { ...event, computedTimestamp };
  });
}

// ---------------------------------------------------------------------------
// Async generator: renderFrames
// ---------------------------------------------------------------------------

/**
 * Async generator that produces rasterized PNG frames for an export job.
 *
 * Setup phase (runs once):
 *   1. Init Verovio WASM, load MusicXML, render SVG pages
 *   2. Post-process SVGs (trim margins, reorder noteheads)
 *   3. Parse SVGs into linkedom Documents
 *   4. Extract event positions from SVG coordinates
 *   5. Pre-compute notehead centers for transform-origin
 *   6. Interpolate timestamps using sync anchors
 *   7. Calculate total frames from audio duration × fps
 *
 * Per-frame (loop):
 *   1. Compute timestamp from frame number
 *   2. Run SVG animation (camera Y, notehead scale/color)
 *   3. Serialize modified page SVGs
 *   4. Build composite SVG string
 *   5. Rasterize with resvg-js → PNG buffer
 *   6. Yield { buffer, frame, totalFrames }
 */
export async function* renderFrames(
  exportConfig: ExportConfig,
  signal?: AbortSignal,
): AsyncGenerator<{ buffer: Uint8Array; frame: number; totalFrames: number }> {

  // =========================================================================
  // SETUP PHASE
  // =========================================================================

  console.log('[SSR] Initializing Verovio WASM...');
  const VerovioModule = await createVerovioModule();
  const toolkit = new VerovioToolkit(VerovioModule);

  const scaleFactor = exportConfig.viewportWidth / EDITOR_WIDTH;
  const containerWidth = EDITOR_WIDTH;
  const containerHeight = Math.floor(exportConfig.viewportHeight / scaleFactor);

  const scoreWidth = exportConfig.scoreRegion?.width ?? EDITOR_WIDTH;
  const regionWidth = exportConfig.scoreRegion?.width ?? containerWidth;
  const regionHeight = exportConfig.scoreRegion?.height ?? containerHeight;
  const verovioScale = Math.round(40 * (exportConfig.scoreScale ?? 1));

  toolkit.setOptions({
    font: exportConfig.musicFont || 'Bravura',
    fontLoadAll: true,
    pageWidth: (scoreWidth * 100) / verovioScale,
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

  const loaded = toolkit.loadData(exportConfig.musicXml);
  if (!loaded) throw new Error('[SSR] Failed to load MusicXML data');
  toolkit.renderToMIDI();

  console.log('[SSR] Verovio initialized');

  // Render SVG pages.
  // Extract metadata (heights, viewBoxes) from raw Verovio SVGs BEFORE
  // linkedom processing, because linkedom's toString() can change attribute
  // formatting and break our regex extraction.
  const pageCount = toolkit.getPageCount();
  const svgPages: string[] = [];
  const rawPageHeights: number[] = [];
  const rawPageViewBoxes: string[] = [];
  for (let i = 1; i <= pageCount; i++) {
    let svg = toolkit.renderToSVG(i);
    if (i > 1) svg = trimPageTopMargin(svg);
    // Extract metadata from the raw SVG string (before linkedom)
    rawPageHeights.push(extractPageHeight(svg));
    rawPageViewBoxes.push(extractViewBox(svg));
    // Now process through linkedom for notehead reordering
    svg = reorderNoteheadsInSvg(svg);
    svgPages.push(svg);
  }

  const pageHeights = rawPageHeights;
  const pageOffsets: number[] = [];
  let cumulative = 0;
  for (const h of pageHeights) {
    pageOffsets.push(cumulative);
    cumulative += h;
  }
  const totalHeight = cumulative;

  // Compute SVG-to-editor scale ratio analytically from Verovio settings.
  // The viewBox width equals the Verovio pageWidth setting. In the browser,
  // SVGs auto-scale to their CSS container. Here we need an explicit transform.
  const svgViewBoxWidth = (scoreWidth * 100) / verovioScale;
  const svgScaleRatio = regionWidth / svgViewBoxWidth;

  console.log(`[SSR] Rendered ${pageCount} pages, totalHeight: ${totalHeight}, svgScaleRatio: ${svgScaleRatio.toFixed(4)}`);

  // Extract events and interpolate timestamps
  const timemapEvents = extractTimemapEvents(toolkit);
  const anchors = new Map(Object.entries(exportConfig.syncAnchors));
  const interpolated = interpolateTimestamps(timemapEvents, anchors);

  console.log(`[SSR] ${interpolated.length} events, ${anchors.size} anchors`);

  // Extract event positions from SVG coordinates
  const positionMap = computeEventPositionsFromSvg(
    svgPages,
    pageHeights,
    pageOffsets,
    timemapEvents,
    toolkit,
  );

  // Merge positions into animation events
  const animEvents: AnimationEvent[] = interpolated.map((evt) => ({
    computedTimestamp: evt.computedTimestamp,
    y: positionMap.get(evt.id)?.globalY ?? 0,
    svgIds: evt.svgIds,
  }));

  // Parse SVG pages into linkedom Documents for animation manipulation
  const domParser = new DOMParser();
  const pageDocs: Document[] = svgPages.map(
    (svg) => domParser.parseFromString(svg, 'image/svg+xml') as unknown as Document,
  );

  // Pre-compute notehead centers and save original transforms
  const noteheadCenters = precomputeNoteheadCenters(pageDocs, animEvents);
  const originalTransforms = saveOriginalTransforms(pageDocs, animEvents);

  console.log(`[SSR] Pre-computed ${noteheadCenters.size} notehead centers`);

  // Build animation config.
  // Heights must be in SVG/Verovio coordinates (divide editor coords by
  // svgScaleRatio) because the camera operates inside the scale transform.
  const animConfig: AnimationConfig = {
    scoreColor: exportConfig.scoreColor,
    activeNoteheadColor: exportConfig.activeNoteheadColor ?? exportConfig.scoreColor,
    activeNoteheadScale: exportConfig.activeNoteheadScale ?? 1,
    activeNoteheadHoldMs: exportConfig.activeNoteheadHoldMs ?? 200,
    activeNoteheadExitMs: exportConfig.activeNoteheadExitMs ?? 200,
    colorFullNote: exportConfig.colorFullNote ?? false,
    scoreRegionHeight: exportConfig.scoreRegion?.height
      ? exportConfig.scoreRegion.height / svgScaleRatio
      : null,
    containerHeight: containerHeight / svgScaleRatio,
    totalHeight, // already in SVG coords from extractPageHeight
  };

  // Pre-render background image once (avoids re-parsing ~7MB base64 per frame).
  // The score SVG is rendered with transparent background, then composited.
  let bgPixels: Uint8Array | null = null;
  if (exportConfig.bgUrl) {
    const bgSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${exportConfig.viewportWidth}" height="${exportConfig.viewportHeight}"><image href="${exportConfig.bgUrl}" width="${exportConfig.viewportWidth}" height="${exportConfig.viewportHeight}" preserveAspectRatio="xMidYMid slice"/></svg>`;
    const bgResvg = new Resvg(bgSvg, {
      fitTo: { mode: 'width', value: exportConfig.viewportWidth },
      font: { loadSystemFonts: false },
      logLevel: 'off',
    });
    bgPixels = bgResvg.render().pixels;
    console.log(`[SSR] Background pre-rendered (${bgPixels.length} bytes)`);
  }

  // Build compositor config WITHOUT background (rendered separately above)
  const compositorConfig: CompositorConfig = {
    viewportWidth: exportConfig.viewportWidth,
    viewportHeight: exportConfig.viewportHeight,
    scaleFactor,
    containerWidth,
    containerHeight,
    scoreRegion: exportConfig.scoreRegion,
    scoreColor: exportConfig.scoreColor,
    hideLabels: exportConfig.hideLabels,
    borderStyle: (exportConfig.scoreBorder ?? 'none') as BorderStyle,
    bgUrl: null,
    svgScaleRatio,
  };

  // Use pre-extracted viewBox strings from raw SVGs
  const pageViewBoxes = rawPageViewBoxes;

  // Calculate total frames
  const duration = exportConfig.audioDuration;
  if (duration <= 0) {
    throw new Error(`[SSR] Invalid audio duration: ${duration}`);
  }
  const totalFrames = Math.ceil(duration * exportConfig.fps);

  console.log(`[SSR] Setup complete. Duration: ${duration}s, ${totalFrames} frames at ${exportConfig.fps}fps`);

  // Create animation state
  const animState = createAnimationState();

  // Compute the visible height in SVG coordinates for page culling.
  // The clip region is regionH (editor coords). Inside the clip, content is
  // scaled by svgScaleRatio, so the visible SVG range is regionH / svgScaleRatio.
  // Add a one-page margin to avoid popping at edges.
  const visibleSvgHeight = regionHeight / svgScaleRatio;

  // =========================================================================
  // PER-FRAME LOOP
  // =========================================================================

  for (let frame = 0; frame < totalFrames; frame++) {
    if (signal?.aborted) break;

    const seconds = frame / exportConfig.fps;

    // 1. Run SVG animation → get camera Y, apply notehead modifications
    const { cameraY } = setTimestampSvg(
      seconds,
      animEvents,
      animState,
      animConfig,
      pageDocs,
      noteheadCenters,
      originalTransforms,
    );

    // 2. Serialize only visible pages.
    // resvg v2.x panics when intermediate pixmap exceeds ~16384px in any
    // dimension. With high scaleFactor (e.g. 4K output), stacking all pages
    // creates pixmaps over this limit. Culling to visible pages keeps the
    // intermediate height well within bounds and improves performance.
    const visTop = cameraY;
    const visBottom = cameraY + visibleSvgHeight;
    const pageInfos: PageInfo[] = [];
    for (let i = 0; i < pageDocs.length; i++) {
      const pageTop = pageOffsets[i];
      const pageBottom = pageTop + pageHeights[i];
      if (pageBottom > visTop && pageTop < visBottom) {
        pageInfos.push({
          svgString: pageDocs[i].documentElement.toString(),
          viewBoxHeight: pageHeights[i],
          yOffset: pageOffsets[i],
          viewBoxWidth: svgViewBoxWidth,
          viewBox: pageViewBoxes[i],
        });
      }
    }

    // 3. Build composite SVG
    const compositeSvg = buildCompositeSvg(compositorConfig, pageInfos, cameraY);

    // 4. Rasterize with resvg-js → raw RGBA pixels (skip PNG encoding)
    const resvg = new Resvg(compositeSvg, {
      fitTo: { mode: 'width', value: exportConfig.viewportWidth },
      font: { loadSystemFonts: false },
      logLevel: 'off',
    });
    const rendered = resvg.render();
    let pixels: Uint8Array = rendered.pixels;

    // 5. Alpha-composite score onto pre-rendered background
    if (bgPixels) {
      const out = Buffer.from(bgPixels);
      for (let j = 0; j < out.length; j += 4) {
        const a = pixels[j + 3];
        if (a === 255) {
          out[j] = pixels[j];
          out[j + 1] = pixels[j + 1];
          out[j + 2] = pixels[j + 2];
        } else if (a > 0) {
          const ia = 255 - a;
          out[j] = (pixels[j] * a + out[j] * ia + 127) / 255 | 0;
          out[j + 1] = (pixels[j + 1] * a + out[j + 1] * ia + 127) / 255 | 0;
          out[j + 2] = (pixels[j + 2] * a + out[j + 2] * ia + 127) / 255 | 0;
        }
        out[j + 3] = 255;
      }
      pixels = out;
    }

    // 6. Yield frame
    yield { buffer: pixels, frame, totalFrames };
  }

  console.log('[SSR] Frame generation complete');
}
