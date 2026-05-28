import { useEffect, useRef, useState, useCallback, useMemo, memo } from "react";
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
  type ElementCache,
} from "../lib/noteAnimation";

const WIDTH = 980;

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
  const { svgPages, pageHeights, pageOffsets, totalHeight, pageCount, toolkit, isLoading, error } = useVerovio(xml, scoreWidth, verovioScale, musicFont);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioDuration, setAudioDuration] = useState(propAudioDuration ?? 0);

  const animationFrameRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number>(0);

  const eventIndexRef = useRef(-1); // -1 so first event (index 0) triggers animation
  const currentYRef = useRef(0);
  const cameraYRef = useRef(0);
  // Render-mode: simulate CSS "transform 200ms ease-out" transition
  const cameraTransitionFrom = useRef(0);        // cameraY we're transitioning FROM
  const cameraTransitionTarget = useRef(0);       // cameraY we're transitioning TO
  const cameraTransitionStart = useRef(-Infinity); // timestamp (seconds) when transition started
  const extractionDoneRef = useRef(false);
  const prevActiveRangeRef = useRef<{ start: number; end: number } | null>(null);
  const [visiblePages, setVisiblePages] = useState<Set<number>>(new Set([0, 1]));
  const visiblePagesRef = useRef<Set<number>>(new Set([0, 1]));

  function setDims(w: number, h: number) {
    const f = WIDTH / w;
    setContainerWidth(Math.floor(w * f));
    setContainerHeight(Math.floor(h * f));
  }

  /* ---------------- audio element ---------------- */

  useEffect(() => {
    if (!audioUrl) {
      audioRef.current = null;
      if (!propAudioDuration) setAudioDuration(0);
      return;
    }

    const audio = new Audio(audioUrl);
    audio.preload = "auto";
    audioRef.current = audio;

    const handleLoadedMetadata = () => {
      setAudioDuration(audio.duration);
    };

    audio.addEventListener("loadedmetadata", handleLoadedMetadata);

    return () => {
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.pause();
      audioRef.current = null;
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

  // When Verovio renders SVG pages, update DOM and reset noteheads
  useEffect(() => {
    if (svgPages.length === 0 || !scoreRef.current) return;

    // Reset extraction state for new score — all pages mount for extraction
    extractionDoneRef.current = false;

    // dangerouslySetInnerHTML updates the DOM synchronously during React's
    // commit phase, but this useEffect fires AFTER the commit. However,
    // the browser may not have fully laid out the new SVG yet.
    // Use requestAnimationFrame to wait for the next paint, then verify
    // the Verovio SVG is actually present in the DOM before resetting noteheads.
    requestAnimationFrame(() => {
      if (!scoreRef.current) return;
      // Guard: confirm Verovio SVG elements exist in the DOM before
      // attempting to query/reset noteheads. The svg.definition-scale
      // class is Verovio's root SVG element.
      const verovioSvg = scoreRef.current.querySelector('svg.definition-scale');
      if (!verovioSvg) {
        console.warn('[RegularRenderer] Verovio SVG not found in DOM after rAF');
        return;
      }
      reorderNoteheadsAboveStems(scoreRef.current);
      resetNoteheadAnimations(scoreRef.current);
      // Drop references to the previous render's SVG nodes immediately so
      // the now-detached subtree isn't held until GC.
      elementCacheRef.current.clear();
      elementCacheRef.current = buildElementCache(scoreRef.current);
      prevActiveRangeRef.current = null;

      // Cache validity check: skip extraction if svgPages reference unchanged
      if (svgPagesRef === svgPages) return;

      // Extract events using two-phase extraction and store in cache
      if (toolkit) {
        const timemapEvents = extractTimemapEvents(toolkit);
        const containers = pageContainerRefs.current.filter((c): c is HTMLDivElement => c !== null);
        const cachedEvents = computeEventPositions(timemapEvents, toolkit, containers, pageOffsets);
        setEventsInStore(cachedEvents, svgPages);

        // Extraction complete — activate virtualization (skip in render mode to keep all pages mounted)
        if (!renderMode) {
          extractionDoneRef.current = true;
          const initialVisible = getVisiblePageRange();
          visiblePagesRef.current = initialVisible;
          setVisiblePages(initialVisible);
        }
      }
    });

    // Reset camera to top only on initial load, not during playback.
    // Dependencies like containerWidth/pageOffsets can change mid-playback
    // (e.g., background image load, resize) which would yank the camera to 0.
    if (!isPlaying) {
      currentYRef.current = 0;
      applyCamera(0);
    }
  }, [svgPages, svgPagesRef, toolkit, pageOffsets, setEventsInStore, containerWidth]);

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

  function setsEqual(a: Set<number>, b: Set<number>): boolean {
    if (a.size !== b.size) return false;
    for (const v of a) if (!b.has(v)) return false;
    return true;
  }

  function getVisiblePageRange(): Set<number> {
    if (pageCount === 0) return new Set([0]);
    // Short scores: mount all pages
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

    // Add symmetric buffer: 1 page above + 1 below
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

    // Update visible pages (only if extraction is done and pages exist)
    if (extractionDoneRef.current && pageCount > 0) {
      const newVisible = getVisiblePageRange();
      if (!setsEqual(visiblePagesRef.current, newVisible)) {
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
    currentYRef.current = event.y;

    applyCamera(currentYRef.current);

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

    // Find closest event by Y position
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

    // Seek audio
    if (audioRef.current) {
      audioRef.current.currentTime = event.computedTimestamp;
    }

    // Update refs
    currentYRef.current = event.y;
    eventIndexRef.current = closestIdx;

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
  const hasAudio = !!audioUrl && !!audioRef.current;
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
    return <div className="text-neutral-400">Select background</div>;
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
                        // Before extraction is done, mount all pages for DOM measurement.
                        // After extraction, only mount visible pages.
                        const isMounted = !extractionDoneRef.current || visiblePages.has(i);

                        if (!isMounted) {
                          // Placeholder: maintain layout height. The ref is
                          // nulled by the previous element's ref-detach callback
                          // (see below) — don't clear it here, or we lose the
                          // handle we need for the explicit innerHTML wipe.
                          return (
                            <div
                              key={i}
                              style={{
                                width: regionWidth,
                                height: pageHeights[i],
                              }}
                            />
                          );
                        }

                        return (
                          <div
                            key={i}
                            ref={(el) => {
                              if (el === null) {
                                // Detaching: the same DOM node is likely about
                                // to be reused for the placeholder above. Wipe
                                // the SVG subtree to release nodes promptly
                                // (defensive — React usually clears innerHTML
                                // when dangerouslySetInnerHTML is removed, but
                                // not guaranteed across versions / paths).
                                const prev = pageContainerRefs.current[i];
                                if (prev) prev.innerHTML = '';
                              }
                              pageContainerRefs.current[i] = el;
                            }}
                            className="preview-score"
                            style={{ width: regionWidth }}
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
            <p className="text-xs text-neutral-500 text-center mt-1">{transportMessage}</p>
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
            <p className="text-xs text-neutral-500 text-center mt-1">{transportMessage}</p>
          )}
        </>,
        transportPortalEl,
      )}
    </div>
  );
});
