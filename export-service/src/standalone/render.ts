/**
 * Standalone render page entry point.
 *
 * Reads window.__EXPORT_CONFIG__ (injected by Puppeteer), initializes
 * Verovio, renders all score pages, extracts events, computes positions,
 * sets up the animation controller, and signals readiness.
 *
 * This replaces the frontend's RenderApp.tsx + RegularRenderer render-mode
 * path with zero React/Zustand dependencies.
 */

import createVerovioModule from 'verovio/wasm';
import { VerovioToolkit } from 'verovio/esm';
import {
  createAnimationState,
  setTimestamp,
  type AnimationConfig,
  type AnimationEvent,
} from './animation.js';
import { generateBorderSvg, getBorderHeight, type BorderStyle } from './borders.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** ExportConfig shape -- matches export-service/src/browser/pageSetup.ts */
interface ExportConfig {
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

/** Timemap event from extractTimemapEvents (no DOM dependency) */
interface TimemapEvent {
  id: string;
  beatOnset: number;
  beatDuration: number;
  svgIds: string[];
}

/** Interpolatable event interface for interpolateTimestamps */
interface InterpolatableEvent {
  id: string;
  beatOnset: number;
  beatDuration: number;
  svgIds: string[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EDITOR_WIDTH = 980;

// ---------------------------------------------------------------------------
// SVG helpers (ported from useVerovio.ts)
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

/**
 * Reorder notehead/stem elements in an SVG string so noteheads paint above stems.
 * Inlined version of the frontend's reorderNoteheadsInSvgString.
 */
function reorderNoteheadsInSvgString(svgString: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgString, 'image/svg+xml');
  const parseError = doc.querySelector('parsererror');
  if (parseError) return svgString;

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
// Event extraction (ported from src/lib/getEvents.ts extractTimemapEvents)
// ---------------------------------------------------------------------------

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
// Timestamp interpolation (ported from src/lib/interpolation.ts)
// ---------------------------------------------------------------------------

interface AnchorInfo {
  index: number;
  beatOnset: number;
  timestamp: number;
}

const DEFAULT_BPM = 60;

function interpolateTimestamps<T extends InterpolatableEvent>(
  events: T[],
  anchors: Map<string, number>,
): (T & { computedTimestamp: number; isAnchor: boolean })[] {
  if (events.length === 0) return [];

  const sorted = [...events].sort((a, b) => a.beatOnset - b.beatOnset);

  if (anchors.size === 0) {
    return sorted.map((evt) => ({
      ...evt,
      computedTimestamp: 0,
      isAnchor: false,
    }));
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
      if (timeRange > 0) {
        return beatRange / timeRange;
      }
    }
    return DEFAULT_BPM / 60;
  };

  const beatsPerSecond = getBeatsPerSecond();

  return sorted.map((event) => {
    const anchorTimestamp = anchors.get(event.id);
    if (anchorTimestamp !== undefined) {
      return { ...event, computedTimestamp: anchorTimestamp, isAnchor: true };
    }

    let prevAnchor: AnchorInfo | undefined;
    let nextAnchor: AnchorInfo | undefined;

    for (const anchor of anchorInfos) {
      if (anchor.beatOnset <= event.beatOnset) {
        prevAnchor = anchor;
      }
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

    return { ...event, computedTimestamp, isAnchor: false };
  });
}

// ---------------------------------------------------------------------------
// Event position computation (ported from src/lib/getEvents.ts computeEventPositions)
// ---------------------------------------------------------------------------

interface CachedEvent extends TimemapEvent {
  pageIndex: number;
  globalY: number;
}

function computeEventPositions(
  timemapEvents: TimemapEvent[],
  toolkit: any,
  pageContainers: HTMLElement[],
  pageOffsets: number[],
): CachedEvent[] {
  const cachedEvents: CachedEvent[] = timemapEvents.map((event) => ({
    ...event,
    pageIndex: 0,
    globalY: 0,
  }));

  // Detect CSS transform scale on ancestor elements
  const firstContainer = pageContainers[0];
  const domScale =
    firstContainer && firstContainer.clientWidth > 0
      ? firstContainer.getBoundingClientRect().width /
        firstContainer.clientWidth
      : 1;

  for (const event of cachedEvents) {
    if (event.svgIds.length === 0) continue;

    const pageNum = toolkit.getPageWithElement(event.svgIds[0]);
    if (pageNum === 0) continue;

    const pageIndex = pageNum - 1;
    event.pageIndex = pageIndex;

    const container = pageContainers[pageIndex];
    if (!container) continue;

    const containerRect = container.getBoundingClientRect();
    const noteEl = container.querySelector(`#${CSS.escape(event.svgIds[0])}`);
    if (!noteEl) continue;

    const systemEl = noteEl.closest('g.system');
    if (systemEl) {
      const sysRect = systemEl.getBoundingClientRect();
      const localY =
        (sysRect.top - containerRect.top + sysRect.height / 2) / domScale;
      event.globalY = pageOffsets[pageIndex] + localY;
    } else {
      const noteRect = noteEl.getBoundingClientRect();
      const localY =
        (noteRect.top - containerRect.top + noteRect.height / 2) / domScale;
      event.globalY = pageOffsets[pageIndex] + localY;
    }
  }

  return cachedEvents;
}

// ---------------------------------------------------------------------------
// Score color CSS (ported from RegularRenderer lines 285-319)
// ---------------------------------------------------------------------------

function buildScoreColorCss(scoreColor: string, hideLabels: boolean): string {
  return `
    .preview-score svg.definition-scale {
      color: ${scoreColor};
    }
    .preview-score svg path,
    .preview-score svg rect,
    .preview-score svg polygon,
    .preview-score svg ellipse,
    .preview-score svg use {
      fill: ${scoreColor};
    }
    .preview-score svg text {
      fill: ${scoreColor};
    }
    .preview-score g.staff > path {
      fill: none !important;
      stroke: ${scoreColor} !important;
      shape-rendering: crispEdges !important;
    }
    .preview-score g.notehead {
      will-change: transform;
    }
    .preview-score svg {
      display: block;
    }
    .preview-score svg,
    .preview-score svg *,
    .preview-score g.note,
    .preview-score g.note * {
      pointer-events: none !important;
      cursor: default !important;
      user-select: none !important;
    }
    ${hideLabels ? '.preview-score .label, .preview-score .labelAbbr { display: none !important; }' : ''}
  `;
}

// ---------------------------------------------------------------------------
// Perspective transform (duplicated from src/lib/perspectiveTransform.ts)
// ---------------------------------------------------------------------------

interface PerspectiveCorners {
  topLeft: { x: number; y: number };
  topRight: { x: number; y: number };
  bottomRight: { x: number; y: number };
  bottomLeft: { x: number; y: number };
}

function hasPerspective(corners: PerspectiveCorners | undefined): boolean {
  if (!corners) return false;
  return (
    corners.topLeft.x !== 0 || corners.topLeft.y !== 0 ||
    corners.topRight.x !== 0 || corners.topRight.y !== 0 ||
    corners.bottomRight.x !== 0 || corners.bottomRight.y !== 0 ||
    corners.bottomLeft.x !== 0 || corners.bottomLeft.y !== 0
  );
}

function computeHomography(
  src: [number, number][],
  dst: [number, number][],
): number[] {
  const A: number[][] = [];
  const b: number[] = [];

  for (let i = 0; i < 4; i++) {
    const [sx, sy] = src[i];
    const [dx, dy] = dst[i];
    A.push([sx, sy, 1, 0, 0, 0, -sx * dx, -sy * dx]);
    b.push(dx);
    A.push([0, 0, 0, sx, sy, 1, -sx * dy, -sy * dy]);
    b.push(dy);
  }

  const n = 8;
  const aug: number[][] = A.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col++) {
    let maxVal = Math.abs(aug[col][col]);
    let maxRow = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(aug[row][col]) > maxVal) {
        maxVal = Math.abs(aug[row][col]);
        maxRow = row;
      }
    }
    if (maxRow !== col) {
      [aug[col], aug[maxRow]] = [aug[maxRow], aug[col]];
    }
    const pivot = aug[col][col];
    if (Math.abs(pivot) < 1e-10) return [1, 0, 0, 0, 1, 0, 0, 0];
    for (let row = col + 1; row < n; row++) {
      const factor = aug[row][col] / pivot;
      for (let j = col; j <= n; j++) {
        aug[row][j] -= factor * aug[col][j];
      }
    }
  }

  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    x[i] = aug[i][n];
    for (let j = i + 1; j < n; j++) {
      x[i] -= aug[i][j] * x[j];
    }
    x[i] /= aug[i][i];
  }
  return x;
}

function computeMatrix3d(
  width: number,
  height: number,
  corners: PerspectiveCorners,
): string {
  if (!hasPerspective(corners)) return '';

  const src: [number, number][] = [
    [0, 0], [width, 0], [width, height], [0, height],
  ];
  const dst: [number, number][] = [
    [corners.topLeft.x, corners.topLeft.y],
    [width + corners.topRight.x, corners.topRight.y],
    [width + corners.bottomRight.x, height + corners.bottomRight.y],
    [corners.bottomLeft.x, height + corners.bottomLeft.y],
  ];

  const h = computeHomography(src, dst);
  const a = h[0], b = h[1], c = h[2];
  const d = h[3], e = h[4], f = h[5];
  const g = h[6], hh = h[7];

  return `matrix3d(${a}, ${d}, 0, ${g}, ${b}, ${e}, 0, ${hh}, 0, 0, 1, 0, ${c}, ${f}, 0, 1)`;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  // 1. Read config
  const config = (window as any).__EXPORT_CONFIG__ as ExportConfig;
  if (!config) {
    throw new Error('__EXPORT_CONFIG__ not found on window');
  }
  console.log('[Standalone] Config loaded, musicXml length:', config.musicXml.length);

  // 2. Constants
  const scaleFactor = config.viewportWidth / EDITOR_WIDTH;
  const containerWidth = EDITOR_WIDTH;
  const containerHeight = Math.floor(config.viewportHeight / scaleFactor);

  // 3. Build DOM structure
  const root = document.getElementById('root')!;

  // Outer container
  const outerEl = document.createElement('div');
  outerEl.style.width = `${config.viewportWidth}px`;
  outerEl.style.height = `${config.viewportHeight}px`;
  outerEl.style.overflow = 'hidden';

  // Scale wrapper
  const scaleEl = document.createElement('div');
  scaleEl.style.transformOrigin = 'top left';
  scaleEl.style.transform = `scale(${scaleFactor})`;

  // Main container (select-none equivalent)
  const mainEl = document.createElement('div');
  mainEl.style.position = 'relative';
  mainEl.style.width = `${containerWidth}px`;
  mainEl.style.height = `${containerHeight}px`;
  mainEl.style.overflow = 'hidden';
  mainEl.style.userSelect = 'none';
  mainEl.style.pointerEvents = 'none';
  mainEl.style.cursor = 'default';

  // Background div
  const bgEl = document.createElement('div');
  bgEl.style.width = `${containerWidth}px`;
  bgEl.style.height = `${containerHeight}px`;
  bgEl.style.display = 'flex';
  bgEl.style.alignItems = 'flex-start';
  if (config.bgUrl) {
    bgEl.style.backgroundImage = `url(${config.bgUrl})`;
    bgEl.style.backgroundSize = 'cover';
  }

  // Score region positioned absolutely
  const regionWidth = config.scoreRegion?.width ?? containerWidth;
  const regionHeight = config.scoreRegion?.height ?? containerHeight;
  const regionX = config.scoreRegion?.x ?? 0;
  const regionY = config.scoreRegion?.y ?? 0;
  const regionRotation = config.scoreRegion?.rotation ?? 0;
  const regionPerspective = config.scoreRegion?.perspective;

  // Rotation wrapper - positions and rotates the entire score region + borders
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

  // Perspective wrapper - applies matrix3d inside rotation wrapper
  // Parent for regionEl and borders when perspective is active
  let contentParentEl: HTMLElement = rotationWrapperEl;
  if (hasPerspective(regionPerspective)) {
    const perspectiveWrapperEl = document.createElement('div');
    perspectiveWrapperEl.style.width = `${regionWidth}px`;
    perspectiveWrapperEl.style.height = `${regionHeight}px`;
    perspectiveWrapperEl.style.transform = computeMatrix3d(regionWidth, regionHeight, regionPerspective!);
    perspectiveWrapperEl.style.transformOrigin = '0 0';
    rotationWrapperEl.appendChild(perspectiveWrapperEl);
    contentParentEl = perspectiveWrapperEl;
  }

  const regionEl = document.createElement('div');
  regionEl.style.position = 'absolute';
  regionEl.style.left = '0px';
  regionEl.style.top = '0px';
  regionEl.style.width = `${regionWidth}px`;
  regionEl.style.height = `${regionHeight}px`;
  regionEl.style.overflow = 'hidden';

  // Camera div (for translateY animation)
  const cameraEl = document.createElement('div');
  cameraEl.style.display = 'flex';
  cameraEl.style.width = '100%';
  cameraEl.style.pointerEvents = 'none';
  cameraEl.style.transition = 'none';

  // Score div (holds SVG pages)
  const scoreEl = document.createElement('div');
  scoreEl.className = 'preview-score';
  scoreEl.style.width = `${regionWidth}px`;
  scoreEl.style.cursor = 'default';
  scoreEl.style.lineHeight = '0';
  scoreEl.style.fontSize = '0';

  // Assemble DOM hierarchy
  cameraEl.appendChild(scoreEl);
  regionEl.appendChild(cameraEl);
  contentParentEl.appendChild(regionEl);
  bgEl.appendChild(rotationWrapperEl);
  mainEl.appendChild(bgEl);
  scaleEl.appendChild(mainEl);
  outerEl.appendChild(scaleEl);
  root.appendChild(outerEl);

  // 4. Score color CSS
  const styleEl = document.createElement('style');
  styleEl.textContent = buildScoreColorCss(
    config.scoreColor,
    config.hideLabels,
  );
  document.head.appendChild(styleEl);

  console.log('[Standalone] DOM structure built, scaleFactor:', scaleFactor);

  // 5. Verovio init
  const VerovioModule = await createVerovioModule();
  const toolkit = new VerovioToolkit(VerovioModule);

  const scoreWidth = config.scoreRegion?.width ?? EDITOR_WIDTH;
  const verovioScale = Math.round(40 * (config.scoreScale ?? 1));
  toolkit.setOptions({
    font: config.musicFont || 'Bravura',
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

  const loaded = toolkit.loadData(config.musicXml);
  if (!loaded) {
    throw new Error('Failed to load MusicXML data');
  }
  toolkit.renderToMIDI();

  console.log('[Standalone] Verovio initialized');

  // 6. Render pages
  const pageCount = toolkit.getPageCount();
  const svgPages: string[] = [];
  for (let i = 1; i <= pageCount; i++) {
    let svg = toolkit.renderToSVG(i);
    if (i > 1) {
      svg = trimPageTopMargin(svg);
    }
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

  console.log(
    `[Standalone] Rendered ${pageCount} pages, totalHeight: ${totalHeight}`,
  );

  // 7. Mount SVGs in DOM
  const pageContainers: HTMLElement[] = [];
  for (let i = 0; i < svgPages.length; i++) {
    const pageDiv = document.createElement('div');
    pageDiv.className = 'preview-score';
    pageDiv.style.width = `${regionWidth}px`;
    pageDiv.innerHTML = svgPages[i];
    scoreEl.appendChild(pageDiv);
    pageContainers.push(pageDiv);
  }

  console.log('[Standalone] SVG pages mounted in DOM');

  // 8. Extract events
  const timemapEvents = extractTimemapEvents(toolkit);
  console.log(`[Standalone] Extracted ${timemapEvents.length} timemap events`);

  // Interpolate timestamps using sync anchors
  const anchors = new Map(Object.entries(config.syncAnchors));
  const interpolated = interpolateTimestamps(timemapEvents, anchors);

  console.log(
    `[Standalone] Interpolated ${interpolated.length} events with ${anchors.size} anchors`,
  );

  // 9. Compute event positions
  const cachedEvents = computeEventPositions(
    timemapEvents,
    toolkit,
    pageContainers,
    pageOffsets,
  );

  console.log('[Standalone] Event positions computed');

  // 10. Merge Y positions from cached events into interpolated events
  const yMap = new Map(cachedEvents.map((evt) => [evt.id, evt.globalY]));
  const events: AnimationEvent[] = interpolated.map((evt) => ({
    computedTimestamp: evt.computedTimestamp,
    y: yMap.get(evt.id) ?? 0,
    svgIds: evt.svgIds,
  }));

  // 11. Setup borders (positioned relative to content parent so they distort with perspective)
  const borderStyle = (config.scoreBorder ?? 'none') as BorderStyle;
  if (borderStyle !== 'none') {
    const borderHeight = getBorderHeight(borderStyle);

    // Top border - bottom edge aligns with top of region
    const topBorderDiv = document.createElement('div');
    topBorderDiv.style.position = 'absolute';
    topBorderDiv.style.top = `${-borderHeight}px`;
    topBorderDiv.style.left = '0px';
    topBorderDiv.style.width = `${regionWidth}px`;
    topBorderDiv.style.pointerEvents = 'none';
    topBorderDiv.style.zIndex = '3';
    topBorderDiv.innerHTML = generateBorderSvg(
      borderStyle,
      regionWidth,
      config.scoreColor,
      'top',
    );
    contentParentEl.appendChild(topBorderDiv);

    // Bottom border - top edge aligns with bottom of region
    const bottomBorderDiv = document.createElement('div');
    bottomBorderDiv.style.position = 'absolute';
    bottomBorderDiv.style.top = `${regionHeight}px`;
    bottomBorderDiv.style.left = '0px';
    bottomBorderDiv.style.width = `${regionWidth}px`;
    bottomBorderDiv.style.pointerEvents = 'none';
    bottomBorderDiv.style.zIndex = '3';
    bottomBorderDiv.innerHTML = generateBorderSvg(
      borderStyle,
      regionWidth,
      config.scoreColor,
      'bottom',
    );
    contentParentEl.appendChild(bottomBorderDiv);

    console.log(`[Standalone] Borders set up: ${borderStyle}`);
  }

  // 12. Create animation state
  const state = createAnimationState();

  // 13. Build AnimationConfig
  const animConfig: AnimationConfig = {
    scoreColor: config.scoreColor,
    activeNoteheadColor: config.activeNoteheadColor ?? config.scoreColor,
    activeNoteheadScale: config.activeNoteheadScale ?? 1,
    activeNoteheadHoldMs: config.activeNoteheadHoldMs ?? 200,
    activeNoteheadExitMs: config.activeNoteheadExitMs ?? 200,
    colorFullNote: config.colorFullNote ?? false,
    scoreRegionHeight: config.scoreRegion?.height ?? null,
    containerHeight,
    totalHeight,
  };

  // 14. Expose animationController on window
  (window as any).animationController = {
    setFrame: (frameNumber: number, fpsValue: number = 30) => {
      setTimestamp(
        frameNumber / fpsValue,
        events,
        state,
        animConfig,
        cameraEl,
        scoreEl,
      );
    },
    setTimestamp: (seconds: number) => {
      setTimestamp(seconds, events, state, animConfig, cameraEl, scoreEl);
    },
    getDuration: () => config.audioDuration,
    getFps: () => config.fps,
  };

  console.log('[Standalone] Animation controller exposed on window');

  // 15. Signal readiness
  (window as any).rendererReady = true;
  console.log('[Standalone] Renderer ready');
}

// Run on load
main().catch((err) => {
  console.error('[Standalone] Fatal error:', err);
});
