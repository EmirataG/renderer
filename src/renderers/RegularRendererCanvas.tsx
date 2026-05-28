import { useEffect, useRef, useState, useMemo, memo } from "react";
import { createPortal } from "react-dom";
import { useShallow } from "zustand/react/shallow";
import { useVerovio } from "../hooks/useVerovio";
import { extractTimemapEvents, computeEventPositions } from "../lib/getEvents";
import type { ScoreRegion } from "../types/score";
import { BorderStyle, getBorderComponent, getBorderHeight } from "../borders";
import { interpolateTimestamps, computeNoteDurationSeconds } from "../lib/interpolation";
import { useEventStore } from "../stores/eventStore";
import { PreviewScrollbar } from "../components/PreviewScrollbar";

import {
  animateNoteheads,
  resetNoteheadAnimations,
  resetEventNoteheads,
  reorderNoteheadsAboveStems,
  buildElementCache,
  buildColorExtrasSelector,
  type ElementCache,
} from "../lib/noteAnimation";

/**
 * HTML-in-Canvas variant of RegularRenderer.
 *
 * The score-region DOM tree is replaced by a single <canvas layoutsubtree>
 * whose direct children are the page SVG containers. Camera scroll is no
 * longer a CSS transform — it's a ctx.translate() applied inside the paint
 * event before drawElementImage() copies each page into the canvas bitmap.
 *
 * Render mode (Puppeteer headless capture) and the window-exposed
 * animationController were dropped — this renderer is preview-only.
 *
 * Requires Chrome 138+ with chrome://flags/#canvas-draw-element enabled.
 */

const WIDTH = 980;
const TRANSITION_SEC = 0.2;

/** Solve a CSS cubic-bezier curve at time t via Newton-Raphson. */
function cubicBezierEase(
  x1: number, y1: number, x2: number, y2: number, t: number,
): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  let s = t;
  for (let i = 0; i < 8; i++) {
    const xVal = ((ax * s + bx) * s + cx) * s - t;
    const dxVal = (3 * ax * s + 2 * bx) * s + cx;
    if (Math.abs(dxVal) < 1e-6) break;
    s -= xVal / dxVal;
  }
  s = Math.max(0, Math.min(1, s));
  return ((ay * s + by) * s + cy) * s;
}

/** CSS ease-out = cubic-bezier(0, 0, 0.58, 1). Replaces the deleted CSS
 *  transition that previously smoothed camera Y. */
function cssEaseOut(t: number): number {
  return cubicBezierEase(0, 0, 0.58, 1, t);
}

// drawElementImage / drawElement (legacy alias) type augmentation. The
// TS lib.dom doesn't include either yet.
type DrawElementCtx = CanvasRenderingContext2D & {
  drawElementImage?: (
    el: Element, dx: number, dy: number, dw?: number, dh?: number,
  ) => DOMMatrix;
  drawElement?: (
    el: Element, dx: number, dy: number, dw?: number, dh?: number,
  ) => DOMMatrix;
};

type LayoutsubtreeCanvas = HTMLCanvasElement & {
  requestPaint?: () => void;
  onpaint: ((e: Event) => void) | null;
};

interface Props {
  xml: string;
  bgUrl?: string;
  fps?: number;
  scoreColor?: string;
  syncAnchors?: Map<string, number>;
  audioUrl?: string;
  scoreRegion?: ScoreRegion | null;
  scoreBorder?: BorderStyle;
  scoreScale?: number;
  musicFont?: string;
  activeNoteheadColor?: string;
  activeNoteheadScale?: number;
  activeNoteheadAnimationEntryMs?: number;
  activeNoteheadAnimationHoldMs?: number;
  activeNoteheadAnimationExitMs?: number;
  activeNoteheadUseNoteDuration?: boolean;
  colorAccidentals?: boolean;
  colorDots?: boolean;
  colorArticulations?: boolean;
  hideLabels?: boolean;
  transportPortalEl?: HTMLDivElement | null;
}

export default memo(function RegularRendererCanvas({
  xml,
  bgUrl,
  fps = 60,
  scoreColor = "#000000",
  syncAnchors,
  audioUrl,
  scoreRegion,
  scoreBorder = "none",
  scoreScale = 1,
  musicFont = "Bravura",
  activeNoteheadColor = scoreColor,
  activeNoteheadScale = 1,
  activeNoteheadAnimationEntryMs = 50,
  activeNoteheadAnimationHoldMs = 200,
  activeNoteheadAnimationExitMs = 200,
  activeNoteheadUseNoteDuration = false,
  colorAccidentals = false,
  colorDots = false,
  colorArticulations = false,
  hideLabels = false,
  transportPortalEl,
}: Props) {
  const colorExtrasSelector = useMemo(() => buildColorExtrasSelector({
    colorAccidentals, colorDots, colorArticulations,
  }), [colorAccidentals, colorDots, colorArticulations]);

  // The canvas is BOTH the rendering surface AND the query root for
  // animation (animation helpers call root.querySelector). Pointing the
  // ref at the canvas means existing helpers work unchanged.
  const canvasRef = useRef<LayoutsubtreeCanvas | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const pageContainerRefs = useRef<(HTMLDivElement | null)[]>([]);
  const elementCacheRef = useRef<ElementCache>(new Map());

  const { events, svgPagesRef, setEvents: setEventsInStore } = useEventStore(
    useShallow((state) => ({
      events: state.events,
      svgPagesRef: state.svgPagesRef,
      setEvents: state.setEvents,
    })),
  );

  const [interpolatedEvents, setInterpolatedEvents] = useState<
    (typeof events[number] & {
      computedTimestamp: number;
      isAnchor: boolean;
      y: number;
      holdSeconds?: number;
      tiedHoldSeconds?: number;
    })[]
  >([]);
  const [containerWidth, setContainerWidth] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);

  const verovioScale = Math.round(40 * scoreScale);
  const scoreWidth = scoreRegion?.width ?? containerWidth;
  const {
    svgPages, pageHeights, pageOffsets, totalHeight, pageCount, toolkit,
  } = useVerovio(xml, scoreWidth, verovioScale, musicFont);

  const [isPlaying, setIsPlaying] = useState(false);
  const isPlayingRef = useRef(false);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);

  const animationFrameRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number>(0);

  const eventIndexRef = useRef(-1);
  const currentYRef = useRef(0);
  const cameraYRef = useRef(0);
  const cameraTransitionFrom = useRef(0);
  const cameraTransitionTarget = useRef(0);
  const cameraTransitionStart = useRef(-Infinity); // seconds (performance.now / 1000)
  const extractionDoneRef = useRef(false);
  const prevActiveRangeRef = useRef<{ start: number; end: number } | null>(null);
  const [visiblePages, setVisiblePages] = useState<Set<number>>(new Set([0, 1]));
  const visiblePagesRef = useRef<Set<number>>(new Set([0, 1]));

  // null = still detecting; true/false = result.
  const [hicAvailable, setHicAvailable] = useState<boolean | null>(null);
  // Resolved per Chrome version: drawElementImage (146+) or drawElement (138-145).
  const drawElRef = useRef<((el: Element, dx: number, dy: number, dw?: number, dh?: number) => DOMMatrix) | null>(null);

  useEffect(() => {
    const probe = document.createElement('canvas').getContext('2d') as unknown as DrawElementCtx;
    const has = typeof probe?.drawElementImage === 'function' || typeof probe?.drawElement === 'function';
    setHicAvailable(has);
  }, []);

  function setDims(w: number, h: number) {
    const f = WIDTH / w;
    setContainerWidth(Math.floor(w * f));
    setContainerHeight(Math.floor(h * f));
  }

  /* ---------------- audio element ---------------- */

  useEffect(() => {
    if (!audioUrl) {
      audioRef.current = null;
      return;
    }
    const audio = new Audio(audioUrl);
    audio.preload = "auto";
    audioRef.current = audio;
    return () => {
      audio.pause();
      audioRef.current = null;
    };
  }, [audioUrl]);

  /* ---------------- interpolate events when syncAnchors change ---------------- */

  useEffect(() => {
    if (events.length === 0) {
      setInterpolatedEvents([]);
      return;
    }
    if (syncAnchors && syncAnchors.size > 0) {
      const interpolated = interpolateTimestamps(events, syncAnchors);
      const yMap = new Map(events.map((evt) => [evt.id, evt.globalY]));
      const merged = interpolated.map((evt) => ({
        ...evt,
        y: yMap.get(evt.id) ?? 0,
        holdSeconds: undefined as number | undefined,
        tiedHoldSeconds: undefined as number | undefined,
      }));
      if (activeNoteheadUseNoteDuration) {
        for (let i = 0; i < merged.length; i++) {
          const m = merged[i];
          if (m.noteDurationBeats && m.noteDurationBeats > 0) {
            merged[i].holdSeconds = computeNoteDurationSeconds(i, merged);
          }
          if (m.tiedNoteDurationBeats && m.tiedNoteDurationBeats > 0) {
            const origDur = m.noteDurationBeats;
            merged[i].noteDurationBeats = m.tiedNoteDurationBeats;
            merged[i].tiedHoldSeconds = computeNoteDurationSeconds(i, merged);
            merged[i].noteDurationBeats = origDur;
          }
          if (merged[i].tiedContinuationIds?.length && merged[i].tiedHoldSeconds === undefined && merged[i].holdSeconds !== undefined) {
            merged[i].tiedHoldSeconds = merged[i].holdSeconds;
          }
        }
      }
      setInterpolatedEvents(merged);
    } else {
      setInterpolatedEvents([]);
    }
  }, [events, syncAnchors, activeNoteheadUseNoteDuration]);

  /* ---------------- background / dimensions ---------------- */

  useEffect(() => {
    if (bgUrl) {
      const img = new Image();
      img.src = bgUrl;
      img.onload = () => setDims(img.naturalWidth, img.naturalHeight);
    } else {
      setDims(1920, 1080);
    }
  }, [bgUrl]);

  /* ---------------- Verovio SVG mount + extraction ---------------- */

  useEffect(() => {
    if (svgPages.length === 0 || !canvasRef.current) return;
    extractionDoneRef.current = false;

    requestAnimationFrame(() => {
      const root = canvasRef.current;
      if (!root) return;
      const verovioSvg = root.querySelector('svg.definition-scale');
      if (!verovioSvg) {
        console.warn('[RegularRendererCanvas] Verovio SVG not found in DOM after rAF');
        return;
      }
      reorderNoteheadsAboveStems(root);
      resetNoteheadAnimations(root);
      elementCacheRef.current = buildElementCache(root);
      prevActiveRangeRef.current = null;

      if (svgPagesRef !== svgPages && toolkit) {
        const timemapEvents = extractTimemapEvents(toolkit);
        const containers = pageContainerRefs.current.filter((c): c is HTMLDivElement => c !== null);
        const cachedEvents = computeEventPositions(timemapEvents, toolkit, containers, pageOffsets);
        setEventsInStore(cachedEvents, svgPages);

        extractionDoneRef.current = true;
        const initialVisible = getVisiblePageRange();
        visiblePagesRef.current = initialVisible;
        setVisiblePages(initialVisible);
      }

      // First paint with the new score mounted.
      root.requestPaint?.();
    });

    if (!isPlayingRef.current) {
      currentYRef.current = 0;
      applyCamera(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [svgPages, svgPagesRef, toolkit, pageOffsets, setEventsInStore, containerWidth]);

  /* ---------------- score color CSS ----------------
   * Preview animation sets inline style.fill on <use>, which has higher
   * specificity than any CSS rule — so `use { fill: scoreColor }` in CSS
   * does NOT override animated highlights here (unlike clientExport, which
   * uses setAttribute and so needed `use` removed from its CSS). Keeping
   * the rule mirrors the SVG renderer's behavior exactly.
   */
  const scoreColorCss = useMemo(() => `
    .preview-score-canvas svg.definition-scale {
      color: ${scoreColor};
    }
    .preview-score-canvas svg path,
    .preview-score-canvas svg rect,
    .preview-score-canvas svg polygon,
    .preview-score-canvas svg ellipse,
    .preview-score-canvas svg use {
      fill: ${scoreColor};
    }
    .preview-score-canvas svg text {
      fill: ${scoreColor};
    }
    .preview-score-canvas svg [fill="none"] {
      fill: none !important;
    }
    .preview-score-canvas g.staff > path {
      fill: none !important;
      stroke: ${scoreColor} !important;
      shape-rendering: crispEdges !important;
    }
    .preview-score-canvas g.notehead {
      will-change: transform;
    }
    .preview-score-canvas svg {
      display: block;
    }
    .preview-score-canvas svg,
    .preview-score-canvas svg *,
    .preview-score-canvas g.note,
    .preview-score-canvas g.note * {
      pointer-events: none !important;
      cursor: default !important;
      user-select: none !important;
    }
    ${hideLabels ? '.preview-score-canvas .label, .preview-score-canvas .labelAbbr { display: none !important; }' : ''}
  `, [scoreColor, hideLabels]);

  /* ---------------- page virtualization helpers ---------------- */

  function setsEqual(a: Set<number>, b: Set<number>): boolean {
    if (a.size !== b.size) return false;
    for (const v of a) if (!b.has(v)) return false;
    return true;
  }

  function getVisiblePageRange(): Set<number> {
    if (pageCount === 0) return new Set([0]);
    if (pageCount <= 3) {
      return new Set(Array.from({ length: pageCount }, (_, i) => i));
    }
    const viewportHeight = scoreRegion?.height ?? containerHeight;
    const viewTop = cameraYRef.current;
    const viewBottom = viewTop + viewportHeight;
    const visible = new Set<number>();
    for (let i = 0; i < pageCount; i++) {
      const pageTop = pageOffsets[i];
      const pageBottom = pageTop + pageHeights[i];
      if (pageBottom > viewTop && pageTop < viewBottom) {
        visible.add(i);
      }
    }
    const indices = [...visible];
    if (indices.length > 0) {
      const minIdx = Math.min(...indices);
      const maxIdx = Math.max(...indices);
      if (minIdx > 0) visible.add(minIdx - 1);
      if (maxIdx < pageCount - 1) visible.add(maxIdx + 1);
    }
    return visible;
  }

  /* ---------------- camera (vertical) ---------------- */

  function applyCamera(targetY: number) {
    const scoreHeight = totalHeight || 0;
    const viewportHeight = scoreRegion?.height ?? containerHeight;
    let cameraY = targetY - viewportHeight / 2;
    cameraY = Math.max(0, cameraY);
    cameraY = Math.min(cameraY, Math.max(0, scoreHeight - viewportHeight));

    // Start a smooth transition iff the target changed. animateSync drives
    // the actual interpolation; outside playback we snap immediately so
    // explicit seeks feel instant.
    if (Math.abs(cameraY - cameraTransitionTarget.current) > 0.5) {
      cameraTransitionFrom.current = cameraYRef.current;
      cameraTransitionTarget.current = cameraY;
      cameraTransitionStart.current = performance.now() / 1000;
    }
    if (!isPlayingRef.current) {
      cameraYRef.current = cameraY;
    }

    if (extractionDoneRef.current && pageCount > 0) {
      const newVisible = getVisiblePageRange();
      if (!setsEqual(visiblePagesRef.current, newVisible)) {
        visiblePagesRef.current = newVisible;
        setVisiblePages(newVisible);
      }
    }

    canvasRef.current?.requestPaint?.();
  }

  /** Compute the interpolated camera Y for the current time. Called inside
   *  the animation loop to replace the deleted CSS transition. */
  function getInterpolatedCameraY(): number {
    const now = performance.now() / 1000;
    const elapsed = now - cameraTransitionStart.current;
    if (elapsed >= 0 && elapsed < TRANSITION_SEC) {
      const t = elapsed / TRANSITION_SEC;
      const eased = cssEaseOut(t);
      return cameraTransitionFrom.current
        + (cameraTransitionTarget.current - cameraTransitionFrom.current) * eased;
    }
    return cameraTransitionTarget.current;
  }

  /* ---------------- motion ---------------- */

  function getEventAtTimestamp(timestampSec: number): {
    event: (typeof interpolatedEvents)[0] | null;
    index: number;
  } {
    if (interpolatedEvents.length === 0) return { event: null, index: -1 };
    let low = 0;
    let high = interpolatedEvents.length - 1;
    let result = -1;
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      if (interpolatedEvents[mid].computedTimestamp <= timestampSec) {
        result = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    if (result < 0) return { event: null, index: -1 };
    return { event: interpolatedEvents[result], index: result };
  }

  function animateSync() {
    if (!audioRef.current) return;
    if (audioRef.current.paused || audioRef.current.readyState < 2) {
      animationFrameRef.current = requestAnimationFrame(animateSync);
      return;
    }

    const frameInterval = 1000 / fps;
    const now = performance.now();
    if (now - lastFrameTimeRef.current < frameInterval) {
      animationFrameRef.current = requestAnimationFrame(animateSync);
      return;
    }
    lastFrameTimeRef.current = now;

    const currentTime = audioRef.current.currentTime;
    const { event, index } = getEventAtTimestamp(currentTime);
    if (!event) {
      animationFrameRef.current = requestAnimationFrame(animateSync);
      return;
    }

    if (index !== eventIndexRef.current) {
      const prevIndex = eventIndexRef.current;
      eventIndexRef.current = index;
      const startIdx = Math.max(0, prevIndex + 1);
      const root = canvasRef.current;
      if (root) {
        for (let i = startIdx; i <= index; i++) {
          const evt = interpolatedEvents[i];
          if (!evt?.svgIds?.length) continue;
          const baseOpts = {
            scale: activeNoteheadScale,
            entryMs: activeNoteheadAnimationEntryMs,
            exitMs: activeNoteheadAnimationExitMs,
            color: activeNoteheadColor,
            colorExtrasSelector,
          };
          if (activeNoteheadUseNoteDuration && evt.tiedStartIds?.length) {
            const untiedIds = evt.svgIds.filter((id) => !evt.tiedStartIds!.includes(id));
            const tiedIds = [...evt.tiedStartIds, ...(evt.tiedContinuationIds || [])];
            const untiedHoldMs = evt.holdSeconds !== undefined ? evt.holdSeconds * 1000 : activeNoteheadAnimationHoldMs;
            const tiedHoldMs = evt.tiedHoldSeconds !== undefined ? evt.tiedHoldSeconds * 1000 : activeNoteheadAnimationHoldMs;
            if (untiedIds.length) {
              animateNoteheads(root, untiedIds, { ...baseOpts, holdMs: untiedHoldMs }, elementCacheRef.current);
            }
            if (tiedIds.length) {
              animateNoteheads(root, tiedIds, { ...baseOpts, holdMs: tiedHoldMs }, elementCacheRef.current);
            }
          } else {
            const holdMs = activeNoteheadUseNoteDuration && evt.holdSeconds !== undefined
              ? evt.holdSeconds * 1000
              : activeNoteheadAnimationHoldMs;
            const idsToAnimate = activeNoteheadUseNoteDuration && evt.tiedContinuationIds?.length
              ? [...evt.svgIds, ...evt.tiedContinuationIds]
              : evt.svgIds;
            animateNoteheads(root, idsToAnimate, { ...baseOpts, holdMs }, elementCacheRef.current);
          }
        }
      }
    }

    currentYRef.current = event.y;
    applyCamera(currentYRef.current);
    cameraYRef.current = getInterpolatedCameraY();
    canvasRef.current?.requestPaint?.();

    if (audioRef.current.ended) {
      stop();
      return;
    }
    animationFrameRef.current = requestAnimationFrame(animateSync);
  }

  /* ---------------- scrollbar seek ---------------- */

  function seekToPosition(newCameraY: number) {
    if (interpolatedEvents.length === 0) return;
    const viewportHeight = scoreRegion?.height ?? containerHeight;
    const targetY = newCameraY + viewportHeight / 2;
    let closestIdx = 0;
    let closestDist = Math.abs(interpolatedEvents[0].y - targetY);
    for (let i = 1; i < interpolatedEvents.length; i++) {
      const dist = Math.abs(interpolatedEvents[i].y - targetY);
      if (dist < closestDist) {
        closestDist = dist;
        closestIdx = i;
      }
    }
    const event = interpolatedEvents[closestIdx];
    if (audioRef.current) {
      audioRef.current.currentTime = event.computedTimestamp;
    }
    currentYRef.current = event.y;
    eventIndexRef.current = closestIdx;
    applyCamera(event.y);
  }

  /* ---------------- controls ---------------- */

  const hasAudio = !!audioUrl && !!audioRef.current;
  const firstEventId = events.length > 0 ? events[0].id : null;
  const lastEventId = events.length > 0 ? events[events.length - 1].id : null;
  const hasFirstAnchor = !!(firstEventId && syncAnchors?.has(firstEventId));
  const hasLastAnchor = !!(lastEventId && syncAnchors?.has(lastEventId));
  const canPlay = hasAudio && hasFirstAnchor && hasLastAnchor;

  const transportMessage = !hasAudio
    ? "Upload audio to enable playback"
    : events.length === 0
      ? null
      : (!hasFirstAnchor || !hasLastAnchor)
        ? "Set first and last sync anchors to enable playback"
        : null;

  function play() {
    if (isPlaying || !canPlay) return;
    setIsPlaying(true);
    lastFrameTimeRef.current = performance.now();
    audioRef.current!.play().catch(console.error);
    animationFrameRef.current = requestAnimationFrame(animateSync);
  }

  function stop() {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (audioRef.current && !audioRef.current.paused) {
      audioRef.current.pause();
    }
    setIsPlaying(false);
  }

  function reset() {
    stop();
    eventIndexRef.current = -1;
    currentYRef.current = events[0]?.globalY ?? 0;
    applyCamera(currentYRef.current);
    if (audioRef.current) audioRef.current.currentTime = 0;
    const root = canvasRef.current;
    if (root) {
      resetNoteheadAnimations(root);
      prevActiveRangeRef.current = null;
      root.requestPaint?.();
    }
  }

  useEffect(() => {
    return () => { stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------------- paint handler ----------------
   * Sized to the score region (regionWidth × regionHeight) in CSS pixels,
   * with backing store at devicePixelRatio for crispness at 1× browser
   * zoom. Each paint clears, applies DPR scale + camera translate, then
   * drawElementImage's each visible page at its pageOffset.
   */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || hicAvailable !== true) return;

    const regionWidth = scoreRegion?.width ?? containerWidth;
    const regionHeight = scoreRegion?.height ?? containerHeight;
    if (!regionWidth || !regionHeight) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(regionWidth * dpr);
    canvas.height = Math.round(regionHeight * dpr);

    const ctx = canvas.getContext('2d') as unknown as DrawElementCtx;
    const ctxAny = ctx as unknown as Record<string, unknown>;
    const fn = (typeof ctxAny.drawElementImage === 'function'
      ? ctxAny.drawElementImage
      : ctxAny.drawElement) as (
        el: Element, dx: number, dy: number, dw?: number, dh?: number,
      ) => DOMMatrix;
    const drawEl = fn.bind(ctx);
    drawElRef.current = drawEl;

    const onPaint = () => {
      try {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.save();
        ctx.scale(dpr, dpr);
        const cameraY = cameraYRef.current;
        ctx.translate(0, -cameraY);

        for (let i = 0; i < pageCount; i++) {
          const el = pageContainerRefs.current[i];
          if (!el) continue;
          const y = pageOffsets[i];
          const h = pageHeights[i];
          if (y + h < cameraY || y > cameraY + regionHeight) continue;
          drawEl(el, 0, y, regionWidth, h);
        }
        ctx.restore();
      } catch (e) {
        console.warn('[RegularRendererCanvas] paint error', e);
      }
    };

    canvas.onpaint = onPaint;
    canvas.requestPaint?.();

    return () => { canvas.onpaint = null; };
    // pageOffsets/pageHeights identity changes when a new score loads,
    // which is exactly when we want to rebind the paint handler.
  }, [hicAvailable, containerWidth, containerHeight, scoreRegion, pageCount, pageOffsets, pageHeights]);

  /* ---------------- render ---------------- */

  if (!containerWidth || !containerHeight) {
    return <div className="text-neutral-400">Select background</div>;
  }

  if (hicAvailable === null) {
    return <div className="text-neutral-400">Detecting canvas support…</div>;
  }

  if (hicAvailable === false) {
    return (
      <div className="p-4 text-amber-300 text-sm border border-amber-700/40 bg-amber-900/10 rounded max-w-lg">
        <p className="font-semibold mb-1">Canvas preview unavailable</p>
        <p>
          This experimental preview requires Chrome 138+ with{' '}
          <code className="bg-black/30 px-1 rounded">chrome://flags/#canvas-draw-element</code>{' '}
          enabled. Switch back to the SVG preview, or enable the flag and reload.
        </p>
      </div>
    );
  }

  const regionWidth = scoreRegion?.width ?? containerWidth;
  const regionX = scoreRegion?.x ?? 0;
  const regionY = scoreRegion?.y ?? 0;
  const regionHeight = scoreRegion?.height ?? containerHeight;
  const regionRotation = scoreRegion?.rotation ?? 0;
  const BorderComponent = scoreBorder !== "none" ? getBorderComponent(scoreBorder) : null;
  const borderHeight = scoreBorder !== "none" ? getBorderHeight(scoreBorder) : 0;

  return (
    <div>
      <style dangerouslySetInnerHTML={{ __html: scoreColorCss }} />
      <div
        className="select-none pointer-events-none cursor-default"
        style={{
          position: "relative",
          width: containerWidth,
          height: containerHeight,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: containerWidth,
            height: containerHeight,
            display: "flex",
            alignItems: "flex-start",
            backgroundImage: bgUrl ? `url(${bgUrl})` : undefined,
            backgroundSize: "cover",
          }}
        >
          {/* Rotation wrapper — rotates score region + borders together */}
          <div
            style={{
              position: "absolute",
              left: regionX,
              top: regionY,
              width: regionWidth,
              height: regionHeight,
              transform: regionRotation !== 0 ? `rotate(${regionRotation}deg)` : undefined,
              transformOrigin: "center center",
            }}
          >
            {/* The canvas IS the score region. Pages are direct children
                (required by drawElementImage spec). Their natural rendering
                is suppressed by paint containment — only what we draw via
                the API is visible. */}
            <canvas
              ref={(el) => { canvasRef.current = el as LayoutsubtreeCanvas | null; }}
              className="preview-score-canvas"
              // @ts-expect-error layoutsubtree is not in lib.dom yet
              layoutsubtree=""
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                width: regionWidth,
                height: regionHeight,
                display: "block",
                pointerEvents: "none",
              }}
            >
              {svgPages.map((svg, i) => {
                const isMounted = !extractionDoneRef.current || visiblePages.has(i);
                if (!isMounted) {
                  pageContainerRefs.current[i] = null;
                  return null;
                }
                return (
                  <div
                    key={i}
                    ref={(el) => { pageContainerRefs.current[i] = el; }}
                    className="preview-score-canvas"
                    style={{
                      position: "absolute",
                      left: 0,
                      top: 0,
                      width: regionWidth,
                      lineHeight: 0,
                      fontSize: 0,
                    }}
                    dangerouslySetInnerHTML={{ __html: svg }}
                  />
                );
              })}
            </canvas>

            {BorderComponent && (
              <>
                <div
                  style={{
                    position: "absolute",
                    top: -borderHeight,
                    left: 0,
                    width: regionWidth,
                    pointerEvents: "none",
                    zIndex: 3,
                  }}
                >
                  <BorderComponent width={regionWidth} color={scoreColor} position="top" />
                </div>
                <div
                  style={{
                    position: "absolute",
                    top: regionHeight,
                    left: 0,
                    width: regionWidth,
                    pointerEvents: "none",
                    zIndex: 3,
                  }}
                >
                  <BorderComponent width={regionWidth} color={scoreColor} position="bottom" />
                </div>
              </>
            )}
          </div>
        </div>

        {totalHeight > 0 && (
          <PreviewScrollbar
            orientation="vertical"
            cameraPositionRef={cameraYRef}
            totalSize={totalHeight}
            viewportSize={scoreRegion?.height ?? containerHeight}
            onSeek={seekToPosition}
          />
        )}
      </div>

      {!transportPortalEl && (
        <div className="mt-3 px-3 py-2">
          <div className="flex items-center justify-center gap-2">
            <button onClick={play} disabled={!canPlay || isPlaying} className="grunge-btn grunge-btn-sm flex-1">
              Play
            </button>
            <button onClick={stop} disabled={!isPlaying} className="grunge-btn grunge-btn-sm flex-1">
              Pause
            </button>
            <button onClick={reset} className="grunge-btn grunge-btn-sm flex-1">
              Reset
            </button>
          </div>
          {transportMessage && (
            <p className="text-xs text-neutral-500 text-center mt-1">{transportMessage}</p>
          )}
        </div>
      )}
      {transportPortalEl && createPortal(
        <>
          <div className="flex items-center justify-center gap-2">
            <button onClick={play} disabled={!canPlay || isPlaying} className="grunge-btn grunge-btn-sm flex-1">
              Play
            </button>
            <button onClick={stop} disabled={!isPlaying} className="grunge-btn grunge-btn-sm flex-1">
              Pause
            </button>
            <button onClick={reset} className="grunge-btn grunge-btn-sm flex-1">
              Reset
            </button>
          </div>
          {transportMessage && (
            <p className="text-xs text-neutral-500 text-center mt-1">{transportMessage}</p>
          )}
        </>,
        transportPortalEl,
      )}
    </div>
  );
});
