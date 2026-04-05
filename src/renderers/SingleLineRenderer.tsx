import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { useSingleLineVerovio } from "../hooks/useSingleLineVerovio";
import { extractTimemapEvents, computeEventPositions, computeSectionPositions } from "../lib/getEvents";
import type { ScoreRegion } from "../types/score";
import { BorderStyle, getBorderComponent, getBorderHeight } from "../borders";
import { interpolateTimestamps, computeNoteDurationSeconds } from "../lib/interpolation";
import {
  initAnimationController,
  destroyAnimationController,
} from "../lib/animationController";
import { useEventStore } from "../stores/eventStore";

import {
  animateNoteheads,
  resetNoteheadAnimations,
  resetEventNoteheads,
  reorderNoteheadsAboveStems,
  buildElementCache,
  type ElementCache,
} from "../lib/noteAnimation";

const WIDTH = 980;

// Linear interpolation helper for smooth camera movement
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.max(0, Math.min(1, t));
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
  colorFullNote?: boolean;
  // hide instrument labels (Verovio .label elements)
  hideLabels?: boolean;
}

export default function SingleLineRenderer({
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
  colorFullNote = false,
  hideLabels = false,
}: Props) {
  const cameraRef = useRef<HTMLDivElement>(null);
  const scoreRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const sectionContainerRefs = useRef<(HTMLDivElement | null)[]>([]);
  const elementCacheRef = useRef<ElementCache>(new Map());
  const extractionDoneRef = useRef(false);
  const [visibleSections, setVisibleSections] = useState<Set<number>>(new Set([0, 1]));
  const visibleSectionsRef = useRef<Set<number>>(new Set([0, 1]));
  const cameraXRef = useRef(0);

  // Event cache from Zustand store (useShallow prevents re-renders on unrelated state changes)
  const { events, svgPagesRef, setEvents: setEventsInStore } = useEventStore(
    useShallow((state) => ({
      events: state.events,
      svgPagesRef: state.svgPagesRef,
      setEvents: state.setEvents,
    }))
  );

  // Interpolated events with computed timestamps (when syncAnchors provided)
  // Includes `x` for camera positioning (mapped from globalX)
  const [interpolatedEvents, setInterpolatedEvents] = useState<
    (typeof events[number] & { computedTimestamp: number; isAnchor: boolean; x: number; holdSeconds?: number })[]
  >([]);
  const [containerWidth, setContainerWidth] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);

  // Convert scoreScale (0.5-1.5 multiplier) to Verovio percentage (20-60)
  const verovioScale = Math.round(40 * scoreScale);
  const { sections, sectionWidths, sectionHeights, sectionOffsets, totalWidth, maxHeight, toolkit, isLoading, error } = useSingleLineVerovio(xml, verovioScale, 15, musicFont);

  const [renderScale, setRenderScale] = useState(1); // Scale factor for render mode
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioDuration, setAudioDuration] = useState(0);

  const animationFrameRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number>(0);

  const eventIndexRef = useRef(-1); // -1 so first event (index 0) triggers animation
  const currentXRef = useRef(0);
  const prevActiveRangeRef = useRef<{ start: number; end: number } | null>(null);

  function setDims(w: number, h: number) {
    const f = WIDTH / w;
    setContainerWidth(Math.floor(w * f));
    setContainerHeight(Math.floor(h * f));
  }

  /* ---------------- audio element ---------------- */

  useEffect(() => {
    if (!audioUrl) {
      audioRef.current = null;
      setAudioDuration(0);
      return;
    }

    const audio = new Audio(audioUrl);
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

  /* ---------------- interpolate events when syncAnchors change ---------------- */

  useEffect(() => {
    if (events.length === 0) {
      setInterpolatedEvents([]);
      return;
    }

    if (syncAnchors && syncAnchors.size > 0) {
      // Use interpolation for sync-based timing
      const interpolated = interpolateTimestamps(events, syncAnchors);
      // Create a map of event id -> globalX position for fast lookup
      const xMap = new Map(events.map((evt) => [evt.id, evt.globalX ?? 0]));
      // Merge X positions from original events by matching event IDs
      const merged = interpolated.map((evt) => ({
        ...evt,
        x: xMap.get(evt.id) ?? 0,
        holdSeconds: undefined as number | undefined,
      }));

      // Precompute holdSeconds for "use note duration" mode
      if (activeNoteheadUseNoteDuration) {
        for (let i = 0; i < merged.length; i++) {
          if (merged[i].noteDurationBeats && merged[i].noteDurationBeats! > 0) {
            merged[i].holdSeconds = computeNoteDurationSeconds(i, merged);
          }
        }
      }

      setInterpolatedEvents(merged);
    } else {
      setInterpolatedEvents([]);
    }
  }, [events, syncAnchors, activeNoteheadUseNoteDuration]);

  /* ---------------- detect render mode ---------------- */

  const isRenderMode =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("render") === "true";

  /* ---------------- background / dimensions ---------------- */

  useEffect(() => {
    if (isRenderMode) {
      // In render mode: render at preview size, then scale to fill viewport
      // This preserves the score-to-background ratio across all resolutions
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      // Calculate base dimensions same as preview mode
      let baseWidth: number;
      let baseHeight: number;

      if (bgUrl) {
        // Load background image to get its aspect ratio
        const img = new Image();
        img.src = bgUrl;
        img.onload = () => {
          const f = WIDTH / img.naturalWidth;
          baseWidth = Math.floor(img.naturalWidth * f);
          baseHeight = Math.floor(img.naturalHeight * f);

          // Calculate scale to fill viewport
          const scale = Math.min(
            viewportWidth / baseWidth,
            viewportHeight / baseHeight,
          );

          setContainerWidth(baseWidth);
          setContainerHeight(baseHeight);
          setRenderScale(scale);
        };
      } else {
        // Default 16:9 dimensions
        const f = WIDTH / 1920;
        baseWidth = Math.floor(1920 * f);
        baseHeight = Math.floor(1080 * f);

        // Calculate scale to fill viewport
        const scale = Math.min(
          viewportWidth / baseWidth,
          viewportHeight / baseHeight,
        );

        setContainerWidth(baseWidth);
        setContainerHeight(baseHeight);
        setRenderScale(scale);
      }
    } else if (bgUrl) {
      // Preview mode with background image
      const img = new Image();
      img.src = bgUrl;
      img.onload = () => setDims(img.naturalWidth, img.naturalHeight);
      setRenderScale(1);
    } else {
      // Preview mode default dimensions
      setDims(1920, 1080);
      setRenderScale(1);
    }
  }, [bgUrl, isRenderMode]);

  /* ---------------- Verovio section rendering ---------------- */

  // When Verovio renders sections, update DOM and reset noteheads
  useEffect(() => {
    if (sections.length === 0 || !scoreRef.current) return;

    // Reset extraction state — all sections mount for extraction
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
        console.warn('[SingleLineRenderer] Verovio SVG not found in DOM after rAF');
        return;
      }
      reorderNoteheadsAboveStems(scoreRef.current);
      resetNoteheadAnimations(scoreRef.current);
      elementCacheRef.current = buildElementCache(scoreRef.current);
      prevActiveRangeRef.current = null;

      // Cache validity check: skip extraction if sections reference unchanged
      if (svgPagesRef === sections) return;

      // Extract events using two-phase extraction and store in cache
      if (toolkit) {
        const timemapEvents = extractTimemapEvents(toolkit);
        const containers = sectionContainerRefs.current.filter((c): c is HTMLDivElement => c !== null);
        // Compute vertical positions (for compatibility, using section 0 offset as fallback)
        const cachedEvents = computeEventPositions(timemapEvents, toolkit, containers, [0]);
        // Compute horizontal positions for camera
        const eventsWithX = computeSectionPositions(cachedEvents, containers, sectionOffsets);
        setEventsInStore(eventsWithX, sections);

        // Extraction complete — activate virtualization (skip in render mode to keep all sections mounted)
        if (!isRenderMode) {
          extractionDoneRef.current = true;
          const initialVisible = getVisibleSectionRange();
          visibleSectionsRef.current = initialVisible;
          setVisibleSections(initialVisible);
        }
      }
    });

    // Camera starts at left
    if (!isPlaying) {
      currentXRef.current = 0;
      applyCamera(0);
    }
  }, [sections, svgPagesRef, toolkit, sectionOffsets, setEventsInStore, containerWidth]);

  // Rebuild element cache when visible sections change (sections mount/unmount)
  useEffect(() => {
    if (!extractionDoneRef.current || !scoreRef.current) return;
    requestAnimationFrame(() => {
      if (scoreRef.current) {
        elementCacheRef.current = buildElementCache(scoreRef.current);
      }
    });
  }, [visibleSections]);

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
    /* Hide clefs, key signatures, and time signatures in continuation sections */
    .section-continuation g.clef,
    .section-continuation g.keySig,
    .section-continuation g.meterSig {
      display: none !important;
    }
    ${hideLabels ? '.preview-score .label, .preview-score .labelAbbr { display: none !important; }' : ''}
  `, [scoreColor, hideLabels]);

  /* ---------------- section virtualization helpers ---------------- */

  function setsEqual(a: Set<number>, b: Set<number>): boolean {
    if (a.size !== b.size) return false;
    for (const v of a) if (!b.has(v)) return false;
    return true;
  }

  function getVisibleSectionRange(): Set<number> {
    const sectionCount = sections.length;
    if (sectionCount === 0) return new Set([0]);
    // Short scores: mount everything, no virtualization
    if (sectionCount <= 3) {
      return new Set(Array.from({ length: sectionCount }, (_, i) => i));
    }

    const viewportWidth = scoreRegion?.width ?? containerWidth;
    const viewLeft = cameraXRef.current;
    const viewRight = viewLeft + viewportWidth;

    const visible = new Set<number>();
    for (let i = 0; i < sectionCount; i++) {
      const sectionLeft = sectionOffsets[i];
      const sectionRight = sectionLeft + (sectionWidths[i] || 0);
      if (sectionRight > viewLeft && sectionLeft < viewRight) {
        visible.add(i);
      }
    }

    // Add ±1 section buffer on each side
    const indices = [...visible];
    if (indices.length > 0) {
      const minIdx = Math.min(...indices);
      const maxIdx = Math.max(...indices);
      if (minIdx > 0) visible.add(minIdx - 1);
      if (maxIdx < sectionCount - 1) visible.add(maxIdx + 1);
    }

    return visible;
  }

  /* ---------------- camera (horizontal) ---------------- */

  function applyCamera(targetX: number) {
    const scoreWidth = totalWidth || 0;
    const viewportWidth = scoreRegion?.width ?? containerWidth;

    // Keep the target X position in the horizontal center of the viewport (50%)
    // Exception: at the beginning and end, don't scroll past the edges
    let cameraX = targetX - viewportWidth / 2;

    // Clamp to valid range: don't scroll left of 0 or right of the maximum scroll
    cameraX = Math.max(0, cameraX);
    cameraX = Math.min(cameraX, Math.max(0, scoreWidth - viewportWidth));

    cameraXRef.current = cameraX;

    if (cameraRef.current) {
      cameraRef.current.style.transform = `translateX(${-cameraX}px)`;
    }

    // Update visible sections (only after extraction is done)
    if (extractionDoneRef.current && sections.length > 0) {
      const newVisible = getVisibleSectionRange();
      if (!setsEqual(visibleSectionsRef.current, newVisible)) {
        visibleSectionsRef.current = newVisible;
        setVisibleSections(newVisible);
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
          // For single-line mode, query from the section container if available
          const cachedEvent = events.find(e => e.id === evt.id);
          const sectionIndex = cachedEvent?.sectionIndex;
          const root = sectionIndex !== undefined && sectionContainerRefs.current[sectionIndex]
            ? sectionContainerRefs.current[sectionIndex]
            : scoreRef.current;

          // "Use note duration" mode: per-event hold + animate tied continuation IDs
          const holdMs = activeNoteheadUseNoteDuration && evt.holdSeconds !== undefined
            ? evt.holdSeconds * 1000
            : activeNoteheadAnimationHoldMs;
          const idsToAnimate = activeNoteheadUseNoteDuration && evt.tiedContinuationIds?.length
            ? [...evt.svgIds, ...evt.tiedContinuationIds]
            : evt.svgIds;

          animateNoteheads(root, idsToAnimate, {
            scale: activeNoteheadScale,
            entryMs: activeNoteheadAnimationEntryMs,
            holdMs,
            exitMs: activeNoteheadAnimationExitMs,
            color: activeNoteheadColor,
            colorFullNote,
          }, elementCacheRef.current);
        }
      }
    }

    // Camera X: interpolate between current and next event for smooth scrolling
    const currentX = event.x;
    const nextEvent = interpolatedEvents[index + 1];

    if (nextEvent) {
      // Calculate progress between current and next event
      const currentTimestamp = event.computedTimestamp;
      const nextTimestamp = nextEvent.computedTimestamp;
      const duration = nextTimestamp - currentTimestamp;

      if (duration > 0) {
        const progress = (currentTime - currentTimestamp) / duration;
        currentXRef.current = lerp(currentX, nextEvent.x, progress);
      } else {
        currentXRef.current = currentX;
      }
    } else {
      // At last event, no interpolation needed
      currentXRef.current = currentX;
    }

    applyCamera(currentXRef.current);

    // Check if audio ended
    if (audioRef.current.ended) {
      stop();
      return;
    }

    animationFrameRef.current = requestAnimationFrame(animateSync);
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
    currentXRef.current = events[0]?.globalX ?? 0;
    applyCamera(currentXRef.current);

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

  // Expose setTimestamp for frame-by-frame rendering
  const setTimestamp = useCallback(
    (seconds: number) => {
      // In render mode, allow even without interpolated events
      // For normal mode, require interpolated events
      if (!isRenderMode && interpolatedEvents.length === 0) return;

      // Capture array reference to ensure consistent usage throughout
      const evts = interpolatedEvents;
      const totalEvents = evts.length;

      if (totalEvents === 0) return;

      // Binary search for current event at timestamp for camera positioning
      let low = 0;
      let high = totalEvents - 1;
      let currentIndex = -1;

      while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        if (evts[mid].computedTimestamp <= seconds) {
          currentIndex = mid;
          low = mid + 1;
        } else {
          high = mid - 1;
        }
      }
      if (currentIndex < 0) return;
      const currentEvent = evts[currentIndex];

      // Update event index and X position
      eventIndexRef.current = currentIndex;

      // Camera X: interpolate between current and next event for smooth scrolling
      const currentX = currentEvent.x;
      const nextEvent = evts[currentIndex + 1];

      if (nextEvent) {
        const currentTimestamp = currentEvent.computedTimestamp;
        const nextTimestamp = nextEvent.computedTimestamp;
        const duration = nextTimestamp - currentTimestamp;

        if (duration > 0) {
          const progress = (seconds - currentTimestamp) / duration;
          currentXRef.current = lerp(currentX, nextEvent.x, progress);
        } else {
          currentXRef.current = currentX;
        }
      } else {
        currentXRef.current = currentX;
      }

      applyCamera(currentXRef.current);

      // For frame capture: delta-based animation (only touch changed DOM elements)
      const globalHoldSeconds = activeNoteheadAnimationHoldMs / 1000;
      const exitSeconds = activeNoteheadAnimationExitMs / 1000;
      const useNoteDur = activeNoteheadUseNoteDuration;

      if (!scoreRef.current) return;

      // Helper: get per-event hold seconds (note duration mode or global)
      const getEventHoldSeconds = (evt: typeof evts[number] & { holdSeconds?: number }) =>
        useNoteDur && evt.holdSeconds !== undefined ? evt.holdSeconds : globalHoldSeconds;

      // Helper: get all SVG IDs to animate (include tied continuation IDs in note duration mode)
      const getEventIds = (evt: typeof evts[number]) =>
        useNoteDur && evt.tiedContinuationIds?.length
          ? [...evt.svgIds, ...evt.tiedContinuationIds]
          : evt.svgIds;

      // Find firstActiveIndex: scan backwards from currentIndex to find the
      // earliest event still within the animation window
      let firstActiveIndex = currentIndex;
      while (firstActiveIndex > 0) {
        const prevEvent = evts[firstActiveIndex - 1];
        const timeSincePrev = seconds - prevEvent.computedTimestamp;
        const prevAnimDuration = getEventHoldSeconds(prevEvent) + exitSeconds;
        if (timeSincePrev >= prevAnimDuration || !prevEvent.svgIds?.length) {
          break;
        }
        firstActiveIndex--;
      }
      while (firstActiveIndex < currentIndex && !evts[firstActiveIndex].svgIds?.length) {
        firstActiveIndex++;
      }

      const prev = prevActiveRangeRef.current;

      // Reset events that fell out of the active window
      if (prev !== null) {
        const resetEnd = Math.min(prev.end, firstActiveIndex - 1);
        for (let i = prev.start; i <= resetEnd; i++) {
          const evt = evts[i];
          if (evt.svgIds?.length) {
            resetEventNoteheads(scoreRef.current, getEventIds(evt), colorFullNote, elementCacheRef.current);
          }
        }
      }

      // Apply/update styles for the active window [firstActiveIndex, currentIndex]
      for (let i = firstActiveIndex; i <= currentIndex; i++) {
        const event = evts[i];
        const eventTime = event.computedTimestamp;
        const timeSinceEvent = seconds - eventTime;

        if (timeSinceEvent < 0 || !event.svgIds?.length) continue;

        const eventHoldSeconds = getEventHoldSeconds(event);
        const eventAnimDuration = eventHoldSeconds + exitSeconds;

        let scale: number;
        let color: string | undefined;

        if (timeSinceEvent < eventHoldSeconds) {
          // Hold period: full scale and color
          scale = activeNoteheadScale;
          color = activeNoteheadColor;
        } else if (timeSinceEvent < eventAnimDuration) {
          // Exit period: interpolate scale and color using ease-in curve
          const exitProgress = (timeSinceEvent - eventHoldSeconds) / exitSeconds;
          const easedProgress = Math.pow(exitProgress, 1.675);
          scale = activeNoteheadScale + (1 - activeNoteheadScale) * easedProgress;
          color = interpolateColor(activeNoteheadColor, scoreColor, easedProgress);
        } else {
          // Animation complete — reset and continue
          resetEventNoteheads(scoreRef.current!, getEventIds(event), colorFullNote, elementCacheRef.current);
          continue;
        }

        // Apply animation directly to SVG elements (no CSS transitions)
        const idsToAnimate = getEventIds(event);
        for (const id of idsToAnimate) {
          const cached = elementCacheRef.current.get(id);
          const stavenote = (cached?.isConnected ? cached : null) ?? scoreRef.current.querySelector<SVGGElement>(
            `#${CSS.escape(id)}`,
          );
          if (!stavenote) continue;

          const noteheads =
            stavenote.querySelectorAll<SVGGElement>("g.notehead");
          noteheads.forEach((nh) => {
            nh.style.transformBox = "fill-box";
            nh.style.transformOrigin = "center";
            nh.style.transition = "";
            nh.style.transform = `scale(${scale})`;

            if (color) {
              const shapes =
                nh.querySelectorAll<SVGGraphicsElement>("use");
              shapes.forEach((shape) => {
                shape.style.fill = color!;
                shape.style.stroke = color!;
                shape.style.color = color!;
              });
            }
          });

          if (color && colorFullNote) {
            const extras = stavenote.querySelectorAll<SVGGraphicsElement>(
              "g.stem, g.accid, g.flag, g.dots, g.artic"
            );
            extras.forEach((group) => {
              group.style.fill = color!;
              group.style.stroke = color!;
              group.style.color = color!;
              group.querySelectorAll<SVGGraphicsElement>("path, use, polygon, line").forEach((child) => {
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
      isRenderMode,
      interpolatedEvents,
      activeNoteheadScale,
      activeNoteheadColor,
      activeNoteheadAnimationHoldMs,
      activeNoteheadAnimationExitMs,
      activeNoteheadUseNoteDuration,
      colorFullNote,
      scoreColor,
      interpolateColor,
    ],
  );

  // Expose animation controller on window for Puppeteer
  useEffect(() => {
    // In render mode, expose controller as soon as Verovio is ready
    // In normal mode, require sync timing to be active
    const shouldExpose = toolkit && sections.length > 0 && interpolatedEvents.length > 0;

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
      getFps: () => 30,
    };

    return () => {
      delete (window as any).animationController;
      destroyAnimationController();
    };
  }, [
    isRenderMode,
    toolkit,
    sections,
    interpolatedEvents,
    audioDuration,
    setTimestamp,
  ]);

  if (!containerWidth || !containerHeight) {
    return <div className="text-neutral-400">Select background</div>;
  }

  return (
    <div>
      {/* React-managed score color styles -- survives dangerouslySetInnerHTML updates */}
      <style dangerouslySetInnerHTML={{ __html: scoreColorCss }} />
      {/* Renderer - in render mode, scale to fill viewport while preserving aspect ratio */}
      <div
        className="select-none pointer-events-none cursor-default"
        style={{
          position: "relative",
          width: containerWidth,
          height: containerHeight,
          overflow: "hidden",
          transform: renderScale !== 1 ? `scale(${renderScale})` : undefined,
          transformOrigin: "top left",
        }}
      >
        <div
          style={{
            width: containerWidth,
            height: containerHeight,
            display: "flex",
            alignItems: "center", // Vertical centering for horizontal layout
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
                    display: "flex",
                    alignItems: "center", // Vertical centering within region
                  }}
                >
                  <div
                    ref={cameraRef}
                    style={{
                      display: "flex",
                      flexDirection: "row",
                      pointerEvents: "none",
                      // No CSS transition - camera position is interpolated frame-by-frame
                    }}
                  >
                    <div
                      ref={scoreRef}
                      className="preview-score"
                      style={{
                        display: "flex",
                        flexDirection: "row",
                        cursor: "default",
                        lineHeight: 0,
                        fontSize: 0,
                      }}
                    >
                      {sections.map((svg, i) => {
                        // Before extraction is done, mount all sections for DOM measurement.
                        // After extraction, only mount visible sections (virtualization).
                        const isMounted = !extractionDoneRef.current || visibleSections.has(i);

                        if (!isMounted) {
                          // Placeholder: maintain layout width, clear ref
                          sectionContainerRefs.current[i] = null;
                          return (
                            <div
                              key={i}
                              style={{
                                flexShrink: 0,
                                width: sectionWidths[i],
                                height: maxHeight,
                              }}
                            />
                          );
                        }

                        return (
                          <div
                            key={i}
                            ref={(el) => { sectionContainerRefs.current[i] = el; }}
                            className={`preview-score${i > 0 ? ' section-continuation' : ''}`}
                            style={{
                              flexShrink: 0,
                              width: sectionWidths[i],
                              height: maxHeight,
                              display: 'flex',
                              alignItems: 'flex-start',
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
      </div>

      {/* Transport bar - hidden in render mode */}
      {!isRenderMode && (
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
    </div>
  );
}
