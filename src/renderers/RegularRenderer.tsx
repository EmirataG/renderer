import { useEffect, useLayoutEffect, useRef, useState, useCallback, useMemo, memo } from "react";
import { createPortal } from "react-dom";
import { useShallow } from "zustand/react/shallow";
import { useVerovio } from "../hooks/useVerovio";
import { extractTimemapEvents, computeEventPositions } from "../lib/getEvents";
import type { ScoreRegion } from "../types/score";
import { BorderStyle, getBorderComponent, getBorderHeight } from "../borders";
import { interpolateTimestamps, computeNoteDurationSeconds } from "../lib/interpolation";
import {
  initAnimationController,
  destroyAnimationController,
} from "../lib/animationController";
import { useEventStore } from "../stores/eventStore";
import { PreviewScrollbar } from "../components/PreviewScrollbar";

import {
  animateNoteheads,
  resetNoteheadAnimations,
  resetEventNoteheads,
  reorderNoteheadsAboveStems,
  buildElementCache,
  buildColorExtrasSelector,
  cancelPendingNoteheadTimers,
  type ElementCache,
} from "../lib/noteAnimation";
import {
  setupReveal,
  teardownReveal,
  isRevealInit,
  computeSystems,
  revealFull,
  revealNone,
  revealAt,
  type RevealHandle,
} from "../lib/revealMask";

const WIDTH = 980;
/** Gradient reveal band width, in Verovio inner coordinate units. */
const REVEAL_BAND = 900;

/** Contiguous window of mounted pages, inclusive on both ends. */
interface VisibleRange {
  start: number;
  end: number;
}

/**
 * Evaluate a CSS cubic-bezier(x1, y1, x2, y2) curve at time t.
 * Uses Newton-Raphson to solve for the curve parameter on the X axis,
 * then evaluates Y (progress) at that parameter.
 */
function cubicBezierEase(x1: number, y1: number, x2: number, y2: number, t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;

  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;

  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;

  // Newton-Raphson: solve X(s) = t for s
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

/** CSS ease-out = cubic-bezier(0, 0, 0.58, 1) */
function cssEaseOut(t: number): number {
  return cubicBezierEase(0, 0, 0.58, 1, t);
}

interface Props {
  // core
  xml: string;
  bgUrl?: string;
  fps?: number;
  scoreColor?: string;
  // sync anchors for timing
  syncAnchors?: Map<string, number>;
  // audio for synced playback (optional)
  audioUrl?: string;
  // score region customization
  scoreRegion?: ScoreRegion | null;
  // score border style
  scoreBorder?: BorderStyle;
  // score scale (size multiplier)
  scoreScale?: number;
  // music font (Bravura, Petaluma, Leland, Gootville, Leipzig)
  musicFont?: string;
  // notehead animations
  activeNoteheadColor?: string;
  activeNoteheadScale?: number;
  activeNoteheadAnimationEntryMs?: number;
  activeNoteheadAnimationHoldMs?: number;
  activeNoteheadAnimationExitMs?: number;
  activeNoteheadUseNoteDuration?: boolean;
  colorAccidentals?: boolean;
  colorDots?: boolean;
  colorArticulations?: boolean;
  // hide instrument labels (Verovio .label elements)
  hideLabels?: boolean;
  // progressive reveal: hide notes/content until the playhead reaches them
  hideUnplayedNotes?: boolean;
  // soft gradient reveal edge (vs. hard cut) when hideUnplayedNotes is on
  smoothReveal?: boolean;
  // render mode for headless frame capture (disables virtualization + transitions)
  renderMode?: boolean;
  // audio duration override for render mode (no audio element needed)
  audioDuration?: number;
  // portal target for transport bar (play/pause/reset) — renders there instead of inline
  transportPortalEl?: HTMLDivElement | null;
}

export default memo(function RegularRenderer({
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
  // notehead animation defaults
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
  hideUnplayedNotes = false,
  smoothReveal = false,
  // render mode for headless frame capture
  renderMode = false,
  audioDuration: propAudioDuration,
  transportPortalEl,
}: Props) {
  const colorExtrasSelector = useMemo(() => buildColorExtrasSelector({
    colorAccidentals, colorDots, colorArticulations,
  }), [colorAccidentals, colorDots, colorArticulations]);

  const cameraRef = useRef<HTMLDivElement>(null);
  const scoreRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const pageContainerRefs = useRef<(HTMLDivElement | null)[]>([]);
  const elementCacheRef = useRef<ElementCache>(new Map());
  // Progressive reveal: per-page mask handles + cached event inner positions.
  const revealHandlesRef = useRef<Map<number, RevealHandle>>(new Map());
  const revealPosRef = useRef<Map<string, { x: number; y: number }>>(new Map());

  // Event cache from Zustand store (useShallow prevents re-renders on unrelated state changes)
  const { events, svgPagesRef, setEvents: setEventsInStore } = useEventStore(
    useShallow((state) => ({
      events: state.events,
      svgPagesRef: state.svgPagesRef,
      setEvents: state.setEvents,
    }))
  );

  // (interpolatedEvents is derived via useMemo below; no useState needed.)
  const [containerWidth, setContainerWidth] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);

  // Convert scoreScale (0.5-1.5 multiplier) to Verovio percentage (20-60)
  const verovioScale = Math.round(40 * scoreScale);
  const scoreWidth = scoreRegion?.width ?? containerWidth;
  const { svgPages, pageHeights, pageOffsets, totalHeight, pageCount, toolkit } = useVerovio(xml, scoreWidth, verovioScale, musicFont);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioDuration, setAudioDuration] = useState(propAudioDuration ?? 0);
  // `audioRef` is a ref (mutating it doesn't re-render). canPlay depends on
  // audioRef being populated, so we need a state-backed mirror to trigger
  // one re-render once the audio element is created. Without this, canPlay
  // can stay stale (= disabled Play button) between when the audio effect
  // populates the ref and the next unrelated state change.
  const [audioReady, setAudioReady] = useState(false);

  const animationFrameRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number>(0);

  const eventIndexRef = useRef(-1); // -1 so first event (index 0) triggers animation
  const currentYRef = useRef(0);
  const cameraYRef = useRef(0);
  // Render-mode: simulate CSS "transform 200ms ease-out" transition
  const cameraTransitionFrom = useRef(0);        // cameraY we're transitioning FROM
  const cameraTransitionTarget = useRef(0);       // cameraY we're transitioning TO
  const cameraTransitionStart = useRef(-Infinity); // timestamp (seconds) when transition started
  const prevActiveRangeRef = useRef<{ start: number; end: number } | null>(null);
  // Visibility is always contiguous (+ symmetric buffer), so a plain range
  // replaces the old Set<number> — getVisiblePageRange runs once per
  // animation frame and must not allocate.
  const [visiblePages, setVisiblePages] = useState<VisibleRange>({ start: 0, end: 1 });
  const visiblePagesRef = useRef<VisibleRange>(visiblePages);

  /* ---------------- virtualization phase ----------------
   * Two-phase rendering, derived from the event store rather than a ref flag
   * so no code path can leave it stale:
   *
   *   measuring   — svgPagesRef !== svgPages: events for the current SVG pages
   *                 haven't been extracted yet. ALL pages are mounted (position
   *                 measurement needs a complete DOM) and content-visibility is
   *                 OFF (getBoundingClientRect inside a skipped
   *                 content-visibility subtree returns empty rects).
   *   virtualized — extraction stored events for this exact svgPages reference.
   *                 Only visiblePages are mounted — placeholders elsewhere, for
   *                 memory — and mounted pages get content-visibility: auto so
   *                 the ±1 buffer pages also skip layout/paint.
   *
   * renderMode (headless frame capture) never virtualizes.
   */
  const isVirtualized = !renderMode && svgPages.length > 0 && svgPagesRef === svgPages;
  // Ref mirror for rAF callbacks (applyCamera runs outside the render cycle).
  const isVirtualizedRef = useRef(isVirtualized);
  isVirtualizedRef.current = isVirtualized;

  function setDims(w: number, h: number) {
    const f = WIDTH / w;
    setContainerWidth(Math.floor(w * f));
    setContainerHeight(Math.floor(h * f));
  }

  /* ---------------- audio element ---------------- */

  useEffect(() => {
    if (!audioUrl) {
      audioRef.current = null;
      setAudioReady(false);
      if (!propAudioDuration) setAudioDuration(0);
      return;
    }

    const audio = new Audio(audioUrl);
    audio.preload = "auto";
    audioRef.current = audio;
    setAudioReady(true);

    const handleLoadedMetadata = () => {
      setAudioDuration(audio.duration);
    };

    audio.addEventListener("loadedmetadata", handleLoadedMetadata);

    return () => {
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.pause();
      audioRef.current = null;
      setAudioReady(false);
    };
  }, [audioUrl]);

  /* ---------------- interpolate events when syncAnchors change ----------------
   * Derived in-render via useMemo so we don't burn an extra render cycle
   * on every events/syncAnchors change (the previous useState+useEffect pair
   * did: effect runs → setState → re-render). The yMap is built once per
   * memo evaluation, not per render.
   */

  const interpolatedEvents = useMemo(() => {
    if (events.length === 0 || !syncAnchors || syncAnchors.size === 0) {
      return [] as (typeof events[number] & {
        computedTimestamp: number;
        isAnchor: boolean;
        y: number;
        holdSeconds?: number;
        tiedHoldSeconds?: number;
      })[];
    }

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

    if (process.env.NODE_ENV !== 'production') {
      // The playback binary search requires computedTimestamp sorted along
      // the beat-sorted array. Anchors with out-of-order times (e.g. stale
      // anchors from a previous version of the score) violate this and cause
      // erratic camera jumps — surface it instead of failing silently.
      for (let i = 1; i < merged.length; i++) {
        if (merged[i].computedTimestamp < merged[i - 1].computedTimestamp - 1e-6) {
          console.warn(
            '[RegularRenderer] interpolated timestamps are NOT monotonic — playback will misbehave.',
            `${merged[i - 1].id} (ts ${merged[i - 1].computedTimestamp.toFixed(3)}) -> ${merged[i].id} (ts ${merged[i].computedTimestamp.toFixed(3)}).`,
            'Check sync anchors for out-of-order timestamps.',
          );
          break;
        }
      }
    }

    return merged;
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

  /* ---------------- Verovio SVG rendering ---------------- */

  // When Verovio renders SVG pages, update DOM, reset noteheads, and extract
  // event positions (the measuring phase guarantees all pages are mounted).
  useEffect(() => {
    if (svgPages.length === 0 || !scoreRef.current) return;

    let cancelled = false;

    // dangerouslySetInnerHTML updates the DOM synchronously during React's
    // commit phase, but this useEffect fires AFTER the commit. However,
    // the browser may not have fully laid out the new SVG yet.
    // Use requestAnimationFrame to wait for the next paint, then verify
    // the Verovio SVG is actually present in the DOM before resetting noteheads.
    requestAnimationFrame(() => {
      if (cancelled || !scoreRef.current) return;
      // Guard: confirm Verovio SVG elements exist in the DOM before
      // attempting to query/reset noteheads. The svg.definition-scale
      // class is Verovio's root SVG element.
      const verovioSvg = scoreRef.current.querySelector('svg.definition-scale');
      if (!verovioSvg) {
        console.warn('[RegularRenderer] Verovio SVG not found in DOM after rAF');
        return;
      }

      // Cache validity: events in the store were extracted from this exact
      // svgPages reference. Read non-reactively — putting svgPagesRef in this
      // effect's deps would re-run the effect on our own store write below,
      // which is the bug that used to permanently disarm virtualization.
      const cacheValid = useEventStore.getState().svgPagesRef === svgPages;

      if (cacheValid) {
        // Same pages, but the effect re-ran because the viewport changed
        // (e.g. background image loaded → containerWidth changed). The DOM
        // wasn't replaced, so skip reorder/reset/extraction — just refresh
        // the element cache and recompute the visible window so
        // virtualization stays armed and correct.
        elementCacheRef.current.clear();
        elementCacheRef.current = buildElementCache(scoreRef.current);
        if (!renderMode && pageCount > 0) {
          const newVisible = getVisiblePageRange();
          if (!rangesEqual(visiblePagesRef.current, newVisible)) {
            visiblePagesRef.current = newVisible;
            setVisiblePages(newVisible);
          }
        }
        return;
      }

      reorderNoteheadsAboveStems(scoreRef.current);
      resetNoteheadAnimations(scoreRef.current);
      // Drop references to the previous render's SVG nodes immediately so
      // the now-detached subtree isn't held until GC.
      elementCacheRef.current.clear();
      elementCacheRef.current = buildElementCache(scoreRef.current);
      prevActiveRangeRef.current = null;

      // Extract events using two-phase extraction and store in cache.
      // Pass the UNFILTERED ref array — computeEventPositions indexes it by
      // absolute page index, so a compacted copy would measure wrong pages.
      if (toolkit) {
        const timemapEvents = extractTimemapEvents(toolkit);
        const cachedEvents = computeEventPositions(timemapEvents, toolkit, pageContainerRefs.current, pageOffsets);
        if (cancelled) return;

        // Set the visible window BEFORE the store write: the write flips
        // isVirtualized on the next render, which must not commit with a
        // stale window from the previous score.
        if (!renderMode) {
          const initialVisible = getVisiblePageRange();
          visiblePagesRef.current = initialVisible;
          setVisiblePages(initialVisible);
        }
        // This makes svgPagesRef === svgPages → next render virtualizes.
        setEventsInStore(cachedEvents, svgPages);
      }
    });

    // Reset camera to top only on initial load, not during playback.
    // Dependencies like containerWidth/pageOffsets can change mid-playback
    // (e.g., background image load, resize) which would yank the camera to 0.
    if (!isPlaying) {
      currentYRef.current = 0;
      applyCamera(0);
    }

    return () => {
      // Strict Mode double-mount / rapid re-render guard: a stale rAF must
      // not write events or the visible window for a superseded effect run.
      cancelled = true;
    };
    // isPlaying is read but deliberately NOT a dependency: re-running this
    // effect on play/pause would reset the camera to 0 mid-session.
  }, [svgPages, toolkit, pageOffsets, setEventsInStore, containerWidth, renderMode]);

  // Rebuild the element cache when the page window changes (pages mount and
  // unmount). Without this the cache pins the detached SVG subtrees of
  // unmounted pages (so virtualization frees no memory) and remounted pages
  // miss the cache on every lookup.
  useEffect(() => {
    if (!isVirtualizedRef.current || !scoreRef.current) return;
    const id = requestAnimationFrame(() => {
      if (scoreRef.current) {
        elementCacheRef.current.clear();
        elementCacheRef.current = buildElementCache(scoreRef.current);
      }
    });
    return () => cancelAnimationFrame(id);
  }, [visiblePages]);

  // Build/refresh the reveal mask SYNCHRONOUSLY before paint — on the score,
  // the visible-page window, and the toggles. A layout effect (not rAF) is
  // essential: during playback the camera scrolls and `visiblePages` changes
  // rapidly, and a rAF would be cancelled-and-rescheduled every change before
  // it ever fires, leaving freshly-mounted pages unmasked (showing full score).
  const prevSvgPagesRef = useRef(svgPages);
  useLayoutEffect(() => {
    if (prevSvgPagesRef.current !== svgPages) {
      revealPosRef.current.clear(); // new layout — cached inner positions stale
      prevSvgPagesRef.current = svgPages;
    }
    syncRevealStructure();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [svgPages, visiblePages, hideUnplayedNotes, smoothReveal]);

  /* ---------------- score color and styling ---------------- */

  // Score color CSS is rendered as React-managed JSX <style> to avoid
  // being destroyed when dangerouslySetInnerHTML replaces the SVG container.
  // Memoized to prevent CSS string recreation on every render.
  const scoreColorCss = useMemo(() => `
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
    .preview-score svg [fill="none"] {
      fill: none !important;
    }
    .preview-score svg path[stroke-width] {
      stroke: ${scoreColor};
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
  `, [scoreColor, hideLabels]);

  /* ---------------- page virtualization helpers ---------------- */

  function rangesEqual(a: VisibleRange, b: VisibleRange): boolean {
    return a.start === b.start && a.end === b.end;
  }

  function getVisiblePageRange(): VisibleRange {
    if (pageCount === 0) return { start: 0, end: 0 };
    // Short scores: mount all pages
    if (pageCount <= 3) return { start: 0, end: pageCount - 1 };

    const viewportHeight = scoreRegion?.height ?? containerHeight;
    const viewTop = cameraYRef.current;
    const viewBottom = viewTop + viewportHeight;

    let first = -1;
    let last = -1;
    for (let i = 0; i < pageCount; i++) {
      const pageTop = pageOffsets[i];
      const pageBottom = pageTop + pageHeights[i];
      if (pageBottom > viewTop && pageTop < viewBottom) {
        if (first === -1) first = i;
        last = i;
      } else if (first !== -1) {
        break; // visibility is contiguous — past the window
      }
    }
    if (first === -1) return { start: 0, end: Math.min(1, pageCount - 1) };

    // Symmetric buffer: 1 page above + 1 below
    return {
      start: Math.max(0, first - 1),
      end: Math.min(pageCount - 1, last + 1),
    };
  }

  /* ---------------- camera (vertical) ---------------- */

  function applyCamera(targetY: number) {
    const scoreHeight = totalHeight || (scoreRef.current?.scrollHeight ?? 0);
    const viewportHeight = scoreRegion?.height ?? containerHeight;

    // Keep the target Y position in the vertical center of the viewport
    // Exception: at the beginning and end, don't scroll past the edges
    let cameraY = targetY - viewportHeight / 2;

    // Clamp to valid range: don't scroll above 0 or below the maximum scroll
    cameraY = Math.max(0, cameraY);
    cameraY = Math.min(cameraY, Math.max(0, scoreHeight - viewportHeight));

    cameraYRef.current = cameraY;

    if (cameraRef.current) {
      cameraRef.current.style.transform = `translateY(${-cameraY}px)`;
    }

    // Update visible pages (only when virtualization is active)
    if (isVirtualizedRef.current && pageCount > 0) {
      const newVisible = getVisiblePageRange();
      if (!rangesEqual(visiblePagesRef.current, newVisible)) {
        visiblePagesRef.current = newVisible;
        setVisiblePages(newVisible);
      }
    }
  }

  /* ---------------- motion ---------------- */

  // Sync-based timing: find event at given timestamp using binary search O(log n)
  function getEventAtTimestamp(timestampSec: number): {
    event: (typeof interpolatedEvents)[0] | null;
    index: number;
  } {
    if (interpolatedEvents.length === 0) return { event: null, index: -1 };

    // Binary search for the last event whose computedTimestamp <= timestampSec
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

  /* ---------------- progressive reveal (hide unplayed notes) ---------------- */

  // Inner-space position of an event's notehead (cached). Returns null if the
  // element isn't mounted/laid out (e.g. its page is virtualized away).
  function getEventInnerPos(event: typeof interpolatedEvents[number]): { x: number; y: number } | null {
    const cached = revealPosRef.current.get(event.id);
    if (cached) return cached;
    const root = scoreRef.current;
    if (!root) return null;
    const id = event.positionSvgId ?? event.svgIds[0];
    if (!id) return null;
    const el = root.querySelector<SVGGraphicsElement>(`#${CSS.escape(id)}`);
    if (!el) return null;
    try {
      const bb = el.getBBox();
      if (bb.width === 0 && bb.height === 0) return null; // not laid out yet
      const pos = { x: bb.x + bb.width, y: bb.y + bb.height / 2 };
      revealPosRef.current.set(event.id, pos);
      return pos;
    } catch {
      return null;
    }
  }

  // Build/refresh reveal for every mounted page (or tear it all down when the
  // setting is off). Cheap + idempotent; safe to call after each render and
  // whenever the visible-page window changes.
  function syncRevealStructure() {
    const handles = revealHandlesRef.current;
    if (!hideUnplayedNotes || renderMode) {
      handles.forEach((h) => { try { teardownReveal(h.svg); } catch { /* detached */ } });
      handles.clear();
      return;
    }
    pageContainerRefs.current.forEach((container, page) => {
      if (!container) return;
      const svg = container.querySelector<SVGSVGElement>('svg.definition-scale');
      if (!svg) { handles.delete(page); return; }
      const existing = handles.get(page);
      if (existing && existing.svg === svg && svg.isConnected && isRevealInit(svg)) return;
      const h = setupReveal(svg);
      if (h) handles.set(page, h); else handles.delete(page);
    });
    // Drop handles for pages whose SVG is gone (unmounted by virtualization).
    for (const page of Array.from(handles.keys())) {
      const svg = pageContainerRefs.current[page]?.querySelector('svg.definition-scale');
      if (!svg || !svg.isConnected) handles.delete(page);
    }
    applyRevealFrontier(eventIndexRef.current);
  }

  // Drive each page's reveal from the current event: pages before the current
  // one fully revealed, after it hidden, the current page revealed up to the
  // playhead (top systems first, then left→right within the current system).
  function applyRevealFrontier(index: number) {
    if (!hideUnplayedNotes || renderMode) return;
    const handles = revealHandlesRef.current;
    if (handles.size === 0) return;
    const band = smoothReveal ? REVEAL_BAND : 0;
    const cur = index >= 0 ? interpolatedEvents[index] : null;
    const curPage = cur ? cur.pageIndex : -1;
    let pos: { x: number; y: number } | null = null;
    if (cur) {
      const h = handles.get(curPage);
      if (h && h.systems.length === 0) computeSystems(h);
      pos = getEventInnerPos(cur);
    }
    handles.forEach((h, page) => {
      if (curPage < 0) { revealNone(h); return; }
      if (page < curPage) revealFull(h);
      else if (page > curPage) revealNone(h);
      else if (pos) revealAt(h, pos.x, pos.y, band, 'page');
      else revealNone(h);
    });
  }

  // Sync-based animation: driven by audio currentTime
  function animateSync() {
    if (!audioRef.current) return;

    // Wait for audio to actually start playing before driving animation.
    // audio.play() is async — until playback begins, currentTime is 0 which
    // would color the first note prematurely.
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

    // Check if we moved to a new event - animate ALL skipped events
    if (index !== eventIndexRef.current) {
      const prevIndex = eventIndexRef.current;
      eventIndexRef.current = index;

      // Animate all events from prevIndex+1 to current index (inclusive)
      // This prevents skipping events when multiple occur between frames
      const startIdx = Math.max(0, prevIndex + 1);
      for (let i = startIdx; i <= index; i++) {
        const evt = interpolatedEvents[i];
        if (evt?.svgIds?.length) {
          const baseOpts = {
            scale: activeNoteheadScale,
            entryMs: activeNoteheadAnimationEntryMs,
            exitMs: activeNoteheadAnimationExitMs,
            color: activeNoteheadColor,
            colorExtrasSelector,
          };

          if (activeNoteheadUseNoteDuration && evt.tiedStartIds?.length) {
            // Mixed event: untied notes get their own hold, tied chain gets chain hold
            const untiedIds = evt.svgIds.filter(id => !evt.tiedStartIds!.includes(id));
            const tiedIds = [...evt.tiedStartIds, ...(evt.tiedContinuationIds || [])];
            const untiedHoldMs = evt.holdSeconds !== undefined ? evt.holdSeconds * 1000 : activeNoteheadAnimationHoldMs;
            const tiedHoldMs = evt.tiedHoldSeconds !== undefined ? evt.tiedHoldSeconds * 1000 : activeNoteheadAnimationHoldMs;

            if (untiedIds.length) {
              animateNoteheads(scoreRef.current, untiedIds, { ...baseOpts, holdMs: untiedHoldMs }, elementCacheRef.current);
            }
            if (tiedIds.length) {
              animateNoteheads(scoreRef.current, tiedIds, { ...baseOpts, holdMs: tiedHoldMs }, elementCacheRef.current);
            }
          } else {
            // Simple case: all notes same hold
            const holdMs = activeNoteheadUseNoteDuration && evt.holdSeconds !== undefined
              ? evt.holdSeconds * 1000
              : activeNoteheadAnimationHoldMs;
            const idsToAnimate = activeNoteheadUseNoteDuration && evt.tiedContinuationIds?.length
              ? [...evt.svgIds, ...evt.tiedContinuationIds]
              : evt.svgIds;

            animateNoteheads(scoreRef.current, idsToAnimate, { ...baseOpts, holdMs }, elementCacheRef.current);
          }
        }
      }
    }

    // Camera Y: events in the same system share identical Y values,
    // so this only changes at system boundaries
    if (process.env.NODE_ENV !== 'production' && event.y < currentYRef.current - 1) {
      // Invariant: extraction enforces non-decreasing globalY, so the camera
      // target must never move backward during playback. If this fires, the
      // event data is broken — capture everything needed to diagnose it.
      console.warn(
        '[RegularRenderer] camera target moved BACKWARD during playback:',
        `${currentYRef.current.toFixed(1)} -> ${event.y.toFixed(1)}px,`,
        `audio t=${currentTime.toFixed(3)}s, event ${index} (${event.id}),`,
        `beatOnset=${event.beatOnset}, computedTimestamp=${event.computedTimestamp.toFixed(3)}s,`,
        `prevEvent=${interpolatedEvents[index - 1]?.id} ts=${interpolatedEvents[index - 1]?.computedTimestamp?.toFixed(3)}`,
      );
    }
    currentYRef.current = event.y;

    applyCamera(currentYRef.current);
    applyRevealFrontier(index);

    // Check if audio ended
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
    // Convert camera position back to a target center Y
    const targetY = newCameraY + viewportHeight / 2;

    // Find closest event by Y position. interpolatedEvents is beat-sorted and
    // extraction enforces non-decreasing y, so binary search applies — this
    // runs on every pointermove during a scrollbar drag.
    let lo = 0;
    let hi = interpolatedEvents.length - 1;
    let firstAtOrAfter = interpolatedEvents.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (interpolatedEvents[mid].y >= targetY) {
        firstAtOrAfter = mid;
        hi = mid - 1;
      } else {
        lo = mid + 1;
      }
    }
    const before = Math.max(0, firstAtOrAfter - 1);
    const closestIdx =
      Math.abs(interpolatedEvents[before].y - targetY) <=
      Math.abs(interpolatedEvents[firstAtOrAfter].y - targetY)
        ? before
        : firstAtOrAfter;

    const event = interpolatedEvents[closestIdx];

    // Seek audio
    if (audioRef.current) {
      audioRef.current.currentTime = event.computedTimestamp;
    }

    // Update refs
    currentYRef.current = event.y;
    eventIndexRef.current = closestIdx;
    applyRevealFrontier(closestIdx);

    // Disable CSS transition for instant feedback
    if (cameraRef.current) {
      cameraRef.current.style.transition = 'none';
    }
    applyCamera(event.y);
    // Re-enable transition after a frame
    requestAnimationFrame(() => {
      if (cameraRef.current && !renderMode) {
        cameraRef.current.style.transition = 'transform 200ms ease-out';
      }
    });
  }

  /* ---------------- controls ---------------- */

  // Transport gating: Play requires audio + first and last anchors
  const hasAudio = !!audioUrl && audioReady;
  const firstEventId = events.length > 0 ? events[0].id : null;
  const lastEventId = events.length > 0 ? events[events.length - 1].id : null;
  const hasFirstAnchor = !!(firstEventId && syncAnchors?.has(firstEventId));
  const hasLastAnchor = !!(lastEventId && syncAnchors?.has(lastEventId));
  const canPlay = hasAudio && hasFirstAnchor && hasLastAnchor;

  const transportMessage = !hasAudio
    ? "Upload audio to enable playback"
    : events.length === 0
      ? null // Events still loading — can't check anchors yet
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

    // Pause audio if playing
    if (audioRef.current && !audioRef.current.paused) {
      audioRef.current.pause();
    }

    setIsPlaying(false);
  }

  function reset() {
    stop();

    eventIndexRef.current = -1; // -1 so first event triggers animation on next play
    currentYRef.current = events[0]?.globalY ?? 0;
    applyCamera(currentYRef.current);
    applyRevealFrontier(-1);

    // Reset audio to beginning
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
    }

    if (scoreRef.current) {
      resetNoteheadAnimations(scoreRef.current);
      prevActiveRangeRef.current = null;
    }
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stop();
      // Pending notehead exit timers must not fire after unmount (they'd
      // touch detached DOM and pin it until they fire).
      cancelPendingNoteheadTimers();
      destroyAnimationController();
    };
  }, []);

  /* ---------------- animation controller for Puppeteer ---------------- */

  // Helper to interpolate between two hex colors
  const interpolateColor = useCallback(
    (color1: string, color2: string, progress: number): string => {
      const parseColor = (
        color: string,
      ): { r: number; g: number; b: number } => {
        // Handle hex colors
        const hexMatch = color.match(
          /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i,
        );
        if (hexMatch) {
          return {
            r: parseInt(hexMatch[1], 16),
            g: parseInt(hexMatch[2], 16),
            b: parseInt(hexMatch[3], 16),
          };
        }
        // Handle rgb/rgba colors
        const rgbMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        if (rgbMatch) {
          return {
            r: parseInt(rgbMatch[1]),
            g: parseInt(rgbMatch[2]),
            b: parseInt(rgbMatch[3]),
          };
        }
        return { r: 0, g: 0, b: 0 };
      };

      const c1 = parseColor(color1);
      const c2 = parseColor(color2);

      const r = Math.round(c1.r + (c2.r - c1.r) * progress);
      const g = Math.round(c1.g + (c2.g - c1.g) * progress);
      const b = Math.round(c1.b + (c2.b - c1.b) * progress);

      return `rgb(${r}, ${g}, ${b})`;
    },
    [],
  );

  // Precompute max animation duration once (not per frame) for the backward
  // scan in setTimestamp. Only changes when events or animation params change.
  const maxAnimSec = useMemo(() => {
    const globalHold = activeNoteheadAnimationHoldMs / 1000;
    const exit = activeNoteheadAnimationExitMs / 1000;
    let max = globalHold + exit;
    if (activeNoteheadUseNoteDuration) {
      for (const evt of interpolatedEvents) {
        const hold = (evt as any).holdSeconds ?? globalHold;
        const tiedHold = (evt as any).tiedHoldSeconds ?? 0;
        const evtMax = Math.max(hold, tiedHold) + exit;
        if (evtMax > max) max = evtMax;
      }
    }
    return max;
  }, [interpolatedEvents, activeNoteheadAnimationHoldMs, activeNoteheadAnimationExitMs, activeNoteheadUseNoteDuration]);

  // Expose setTimestamp for frame-by-frame rendering
  const setTimestamp = useCallback(
    (seconds: number) => {
      if (interpolatedEvents.length === 0) return;

      // Capture array reference to ensure consistent usage throughout
      const events = interpolatedEvents;

      // Binary search for current event at timestamp for camera positioning
      let low = 0;
      let high = events.length - 1;
      let currentIndex = -1;

      while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        if (events[mid].computedTimestamp <= seconds) {
          currentIndex = mid;
          low = mid + 1;
        } else {
          high = mid - 1;
        }
      }
      if (currentIndex < 0) return;
      const currentEvent = events[currentIndex];

      // --- Camera: simulate preview's CSS "transform 200ms ease-out" ---
      // In preview, applyCamera() sets translateY instantly and CSS transitions
      // smooth it over 200ms. In render mode CSS transitions are disabled, so
      // we replicate the effect by computing the target cameraY (post-clamp)
      // and interpolating changes on that final value.
      const eventY = currentEvent.y;
      const scoreHeight = totalHeight || (scoreRef.current?.scrollHeight ?? 0);
      const viewportHeight = scoreRegion?.height ?? containerHeight;

      // Compute what applyCamera would produce for this event's Y
      let newTargetCameraY = eventY - viewportHeight / 2;
      newTargetCameraY = Math.max(0, newTargetCameraY);
      newTargetCameraY = Math.min(newTargetCameraY, Math.max(0, scoreHeight - viewportHeight));

      // Detect target change — start a new transition
      if (Math.abs(newTargetCameraY - cameraTransitionTarget.current) > 0.5) {
        cameraTransitionFrom.current = cameraYRef.current; // from current visual position
        cameraTransitionTarget.current = newTargetCameraY;
        cameraTransitionStart.current = seconds;
      }

      // Simulate 200ms ease-out (matching CSS transition)
      const TRANSITION_SEC = 0.2;
      const elapsed = seconds - cameraTransitionStart.current;
      let visualCameraY: number;
      if (elapsed >= 0 && elapsed < TRANSITION_SEC) {
        const t = elapsed / TRANSITION_SEC;
        const eased = cssEaseOut(t);
        visualCameraY = cameraTransitionFrom.current +
          (cameraTransitionTarget.current - cameraTransitionFrom.current) * eased;
      } else {
        visualCameraY = cameraTransitionTarget.current;
      }

      // Apply camera directly (bypass applyCamera — we already did the clamping)
      cameraYRef.current = visualCameraY;
      if (cameraRef.current) {
        cameraRef.current.style.transform = `translateY(${-visualCameraY}px)`;
      }

      eventIndexRef.current = currentIndex;
      currentYRef.current = eventY;

      // For frame capture: delta-based animation (only touch changed DOM elements)
      const globalHoldSeconds = activeNoteheadAnimationHoldMs / 1000;
      const exitSeconds = activeNoteheadAnimationExitMs / 1000;
      const useNoteDur = activeNoteheadUseNoteDuration;

      if (!scoreRef.current) return;

      // Helper: get per-event hold seconds for untied notes
      const getEventHoldSeconds = (evt: typeof events[number] & { holdSeconds?: number }) =>
        useNoteDur && evt.holdSeconds !== undefined ? evt.holdSeconds : globalHoldSeconds;

      // Helper: get max hold seconds across both untied and tied groups (for active window)
      const getEventMaxHoldSeconds = (evt: typeof events[number] & { holdSeconds?: number; tiedHoldSeconds?: number }) =>
        Math.max(getEventHoldSeconds(evt), useNoteDur && evt.tiedHoldSeconds !== undefined ? evt.tiedHoldSeconds : 0);

      // Helper: get all SVG IDs to animate (include tied continuation IDs in note duration mode)
      const getEventIds = (evt: typeof events[number]) =>
        useNoteDur && evt.tiedContinuationIds?.length
          ? [...evt.svgIds, ...evt.tiedContinuationIds]
          : evt.svgIds;

      // Helper: get per-note hold seconds (tied chain notes use tiedHoldSeconds)
      const getNoteHoldSeconds = (evt: typeof events[number] & { holdSeconds?: number; tiedHoldSeconds?: number }, id: string) => {
        if (!useNoteDur) return globalHoldSeconds;
        if (evt.tiedStartIds?.includes(id) || evt.tiedContinuationIds?.includes(id)) {
          return evt.tiedHoldSeconds ?? getEventHoldSeconds(evt);
        }
        return getEventHoldSeconds(evt);
      };

      // Find firstActiveIndex: scan backwards from currentIndex to find the
      // earliest event still within the animation window
      let firstActiveIndex = currentIndex;
      while (firstActiveIndex > 0) {
        const prevEvent = events[firstActiveIndex - 1];
        if (!prevEvent.svgIds?.length) {
          // Empty event (all notes are tied continuations) — skip over it,
          // don't break. An earlier event may still have an active tied chain.
          firstActiveIndex--;
          continue;
        }
        if (seconds - prevEvent.computedTimestamp >= maxAnimSec) break;
        firstActiveIndex--;
      }

      const prev = prevActiveRangeRef.current;

      // Reset events that fell out of the active window
      // These are events that were in prev range but are now before firstActiveIndex
      if (prev !== null) {
        const resetEnd = Math.min(prev.end, firstActiveIndex - 1);
        for (let i = prev.start; i <= resetEnd; i++) {
          const evt = events[i];
          if (evt.svgIds?.length) {
            resetEventNoteheads(scoreRef.current, getEventIds(evt), colorExtrasSelector, elementCacheRef.current);
          }
        }
      }

      // Apply/update styles for the active window [firstActiveIndex, currentIndex]
      for (let i = firstActiveIndex; i <= currentIndex; i++) {
        const event = events[i];
        const eventTime = event.computedTimestamp;
        const timeSinceEvent = seconds - eventTime;

        if (timeSinceEvent < 0 || !event.svgIds?.length) continue;

        const eventMaxHold = getEventMaxHoldSeconds(event);
        if (timeSinceEvent >= eventMaxHold + exitSeconds) {
          // All animations complete — reset and skip
          resetEventNoteheads(scoreRef.current!, getEventIds(event), colorExtrasSelector, elementCacheRef.current);
          continue;
        }

        // Apply animation directly to SVG elements (no CSS transitions)
        // Each note uses its own holdSeconds (untied vs tied chain)
        const idsToAnimate = getEventIds(event);
        for (const id of idsToAnimate) {
          const cached = elementCacheRef.current.get(id);
          const stavenote = (cached?.isConnected ? cached : null) ?? scoreRef.current.querySelector<SVGGElement>(
            `#${CSS.escape(id)}`,
          );
          if (!stavenote) continue;

          // Per-note hold: untied notes use their duration, tied chain notes use chain duration
          const noteHold = getNoteHoldSeconds(event, id);
          const noteAnimDur = noteHold + exitSeconds;
          let scale: number;
          let color: string | undefined;

          if (timeSinceEvent < noteHold) {
            scale = activeNoteheadScale;
            color = activeNoteheadColor;
          } else if (timeSinceEvent < noteAnimDur) {
            const exitProgress = (timeSinceEvent - noteHold) / exitSeconds;
            const easedProgress = Math.pow(exitProgress, 1.675);
            scale = activeNoteheadScale + (1 - activeNoteheadScale) * easedProgress;
            color = interpolateColor(activeNoteheadColor, scoreColor, easedProgress);
          } else {
            // This note's animation is done — reset it
            resetEventNoteheads(scoreRef.current!, [id], colorExtrasSelector, elementCacheRef.current);
            continue;
          }

          const noteheads = stavenote.querySelectorAll<SVGGElement>("g.notehead");
          noteheads.forEach((nh) => {
            nh.style.transformBox = "fill-box";
            nh.style.transformOrigin = "center";
            nh.style.transition = "";
            nh.style.transform = `scale(${scale})`;

            if (color) {
              const shapes = nh.querySelectorAll<SVGGraphicsElement>("use");
              shapes.forEach((shape) => {
                shape.style.fill = color!;
                shape.style.stroke = color!;
                shape.style.color = color!;
              });
            }
          });

          if (color && colorExtrasSelector) {
            const extras = stavenote.querySelectorAll<SVGGraphicsElement>(
              colorExtrasSelector
            );
            extras.forEach((group) => {
              group.style.fill = color!;
              group.style.stroke = color!;
              group.style.color = color!;
              group.querySelectorAll<SVGGraphicsElement>("path, use, polygon, line, ellipse").forEach((child) => {
                child.style.fill = color!;
                child.style.stroke = color!;
                child.style.color = color!;
              });
            });
          }
        }
      }

      // Store current active range for next frame's delta
      prevActiveRangeRef.current = { start: firstActiveIndex, end: currentIndex };

      // Force reflow to ensure CSS styles are applied synchronously
      // before Puppeteer takes the screenshot
      void scoreRef.current.offsetHeight;
    },
    [
      interpolatedEvents,
      activeNoteheadScale,
      activeNoteheadColor,
      activeNoteheadAnimationHoldMs,
      activeNoteheadAnimationExitMs,
      activeNoteheadUseNoteDuration,
      colorExtrasSelector,
      scoreColor,
      interpolateColor,
      maxAnimSec,
    ],
  );

  // Expose animation controller on window for Puppeteer
  useEffect(() => {
    const shouldExpose = toolkit && svgPages.length > 0 && interpolatedEvents.length > 0;

    if (!shouldExpose) return;

    const getInterpolatedEvents = () => interpolatedEvents;

    // Initialize the animation controller module (for internal state tracking)
    initAnimationController({
      audioElement: audioRef.current,
      getInterpolatedEvents,
      containerElement: scoreRef.current!,
    });

    // Expose on window for Puppeteer access
    (window as any).animationController = {
      setFrame: (frameNumber: number, fpsValue: number = 30) => {
        const timestamp = frameNumber / fpsValue;
        setTimestamp(timestamp);
      },
      setTimestamp,
      getDuration: () => audioDuration,
      getFps: () => fps,
    };

    (window as any).rendererReady = true;

    return () => {
      (window as any).rendererReady = false;
      delete (window as any).animationController;
      destroyAnimationController();
    };
  }, [
    toolkit,
    svgPages,
    interpolatedEvents,
    audioDuration,
    setTimestamp,
  ]);

  if (!containerWidth || !containerHeight) {
    return <div className="text-fg-muted">Select background</div>;
  }

  return (
    <div>
      {/* React-managed score color styles — survives dangerouslySetInnerHTML updates */}
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
            alignItems: "flex-start", // Align to top for vertical layout
            backgroundImage: bgUrl ? `url(${bgUrl})` : undefined,
            backgroundSize: "cover",
          }}
        >
          {/* Rotation wrapper - rotates score region + borders together */}
          {(() => {
            const regionWidth = scoreRegion?.width ?? containerWidth;
            const regionX = scoreRegion?.x ?? 0;
            const regionY = scoreRegion?.y ?? 0;
            const regionHeight = scoreRegion?.height ?? containerHeight;
            const regionRotation = scoreRegion?.rotation ?? 0;
            const BorderComponent = scoreBorder !== "none" ? getBorderComponent(scoreBorder) : null;
            const borderHeight = scoreBorder !== "none" ? getBorderHeight(scoreBorder) : 0;

            return (
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
                {/* Score container */}
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    top: 0,
                    width: regionWidth,
                    height: regionHeight,
                    overflow: "hidden",
                  }}
                >
                  <div
                    ref={cameraRef}
                    style={{ display: "flex", width: "100%", pointerEvents: "none", transition: renderMode ? "none" : "transform 200ms ease-out" }}
                  >
                    <div
                      ref={scoreRef}
                      className="preview-score"
                      style={{
                        width: regionWidth,
                        cursor: "default",
                        lineHeight: 0,
                        fontSize: 0,
                      }}
                    >
                      {svgPages.map((svg, i) => {
                        // Measuring phase: mount all pages for DOM measurement.
                        // Virtualized phase: only mount visible pages.
                        const isMounted =
                          !isVirtualized ||
                          (i >= visiblePages.start && i <= visiblePages.end);

                        if (!isMounted) {
                          // Placeholder: maintain layout height. Distinct key
                          // from the mounted page forces React to swap the
                          // DOM node (dropping the SVG subtree) instead of
                          // reconciling in place; the mounted div's ref
                          // callback then nulls pageContainerRefs[i].
                          return (
                            <div
                              key={`ph-${i}`}
                              style={{
                                width: regionWidth,
                                height: pageHeights[i],
                              }}
                            />
                          );
                        }

                        return (
                          <div
                            key={`page-${i}`}
                            ref={(el) => { pageContainerRefs.current[i] = el; }}
                            className="preview-score"
                            style={{
                              width: regionWidth,
                              // Virtualized phase only: opt this page into the
                              // browser's native skip-rendering-if-offscreen
                              // behavior so the ±1 buffer pages skip layout/
                              // paint. contain-intrinsic-size reserves the
                              // expected dimensions so layout doesn't jump
                              // when the page is "skipped".
                              //
                              // Must NOT be applied during the measuring
                              // phase: getBoundingClientRect on descendants
                              // of a skipped content-visibility subtree
                              // returns empty rects, which corrupts event
                              // position extraction on offscreen pages.
                              //
                              // Also disabled while the reveal mask is on: a
                              // skipped subtree returns empty getBBox (breaking
                              // the per-frame frontier) and can skip painting
                              // the mask. The ±1 buffer is tiny, so the lost
                              // skip-rendering is negligible.
                              ...(isVirtualized && !hideUnplayedNotes
                                ? {
                                    contentVisibility: 'auto' as const,
                                    containIntrinsicSize: `${regionWidth}px ${pageHeights[i]}px`,
                                  }
                                : null),
                            }}
                            dangerouslySetInnerHTML={{ __html: svg }}
                          />
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Score borders - positioned relative to rotation wrapper */}
                {BorderComponent && (
                  <>
                    {/* Top border - bottom edge aligns with top of region */}
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
                      <BorderComponent
                        width={regionWidth}
                        color={scoreColor}
                        position="top"
                      />
                    </div>
                    {/* Bottom border - top edge aligns with bottom of region */}
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
                      <BorderComponent
                        width={regionWidth}
                        color={scoreColor}
                        position="bottom"
                      />
                    </div>
                  </>
                )}
              </div>
            );
          })()}
        </div>

        {/* Preview scrollbar */}
        {!renderMode && totalHeight > 0 && (
          <PreviewScrollbar
            orientation="vertical"
            cameraPositionRef={cameraYRef}
            totalSize={totalHeight}
            viewportSize={scoreRegion?.height ?? containerHeight}
            onSeek={seekToPosition}
          />
        )}
      </div>

      {/* Transport bar (hidden in render mode) */}
      {!renderMode && !transportPortalEl && (
        <div className="mt-3 px-3 py-2">
          <div className="flex items-center justify-center gap-2">
            <button
              onClick={play}
              disabled={!canPlay || isPlaying}
              className="grunge-btn grunge-btn-sm flex-1"
            >
              Play
            </button>
            <button
              onClick={stop}
              disabled={!isPlaying}
              className="grunge-btn grunge-btn-sm flex-1"
            >
              Pause
            </button>
            <button
              onClick={reset}
              className="grunge-btn grunge-btn-sm flex-1"
            >
              Reset
            </button>
          </div>
          {transportMessage && (
            <p className="text-xs text-fg-subtle text-center mt-1">{transportMessage}</p>
          )}
        </div>
      )}
      {/* Transport bar portaled to external container */}
      {!renderMode && transportPortalEl && createPortal(
        <>
          <div className="flex items-center justify-center gap-2">
            <button
              onClick={play}
              disabled={!canPlay || isPlaying}
              className="grunge-btn grunge-btn-sm flex-1"
            >
              Play
            </button>
            <button
              onClick={stop}
              disabled={!isPlaying}
              className="grunge-btn grunge-btn-sm flex-1"
            >
              Pause
            </button>
            <button
              onClick={reset}
              className="grunge-btn grunge-btn-sm flex-1"
            >
              Reset
            </button>
          </div>
          {transportMessage && (
            <p className="text-xs text-fg-subtle text-center mt-1">{transportMessage}</p>
          )}
        </>,
        transportPortalEl,
      )}
    </div>
  );
});
