import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { useVerovio } from "../hooks/useVerovio";
import { extractTimemapEvents, computeEventPositions } from "../lib/getEvents";
import type { ScoreRegion } from "../types/score";
import { BorderStyle, getBorderComponent, getBorderHeight } from "../borders";
import { interpolateTimestamps } from "../lib/interpolation";
import {
  initAnimationController,
  destroyAnimationController,
} from "../lib/animationController";
import { useEventStore } from "../stores/eventStore";

import {
  animateNoteheads,
  resetNoteheadAnimations,
} from "../lib/noteAnimation";

const WIDTH = 980;

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
  colorFullNote?: boolean;
}

export default function RegularRenderer({
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
  colorFullNote = false,
}: Props) {
  const cameraRef = useRef<HTMLDivElement>(null);
  const scoreRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const pageContainerRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Event cache from Zustand store (useShallow prevents re-renders on unrelated state changes)
  const { events, svgPagesRef, setEvents: setEventsInStore } = useEventStore(
    useShallow((state) => ({
      events: state.events,
      svgPagesRef: state.svgPagesRef,
      setEvents: state.setEvents,
    }))
  );

  // Interpolated events with computed timestamps (when syncAnchors provided)
  // Includes `y` for camera positioning (mapped from globalY)
  const [interpolatedEvents, setInterpolatedEvents] = useState<
    (typeof events[number] & { computedTimestamp: number; isAnchor: boolean; y: number })[]
  >([]);
  const [containerWidth, setContainerWidth] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);

  // Convert scoreScale (0.5-1.5 multiplier) to Verovio percentage (20-60)
  const verovioScale = Math.round(40 * scoreScale);
  const scoreWidth = scoreRegion?.width ?? containerWidth;
  const { svgPages, pageHeights, pageOffsets, totalHeight, pageCount, toolkit, isLoading, error } = useVerovio(xml, scoreWidth, verovioScale, musicFont);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioDuration, setAudioDuration] = useState(0);

  const animationFrameRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number>(0);

  const eventIndexRef = useRef(-1); // -1 so first event (index 0) triggers animation
  const currentYRef = useRef(0);
  const cameraYRef = useRef(0);
  const extractionDoneRef = useRef(false);
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
      // Create a map of event id -> globalY position for fast lookup
      const yMap = new Map(events.map((evt) => [evt.id, evt.globalY]));
      // Merge Y positions from original events by matching event IDs
      const merged = interpolated.map((evt) => ({
        ...evt,
        y: yMap.get(evt.id) ?? 0,
      }));
      setInterpolatedEvents(merged);
    } else {
      setInterpolatedEvents([]);
    }
  }, [events, syncAnchors]);

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
      resetNoteheadAnimations(scoreRef.current);

      // Cache validity check: skip extraction if svgPages reference unchanged
      if (svgPagesRef === svgPages) return;

      // Extract events using two-phase extraction and store in cache
      if (toolkit) {
        const timemapEvents = extractTimemapEvents(toolkit);
        const containers = pageContainerRefs.current.filter((c): c is HTMLDivElement => c !== null);
        const cachedEvents = computeEventPositions(timemapEvents, toolkit, containers, pageOffsets);
        setEventsInStore(cachedEvents, svgPages);

        // Extraction complete — activate virtualization
        extractionDoneRef.current = true;
        const initialVisible = getVisiblePageRange();
        visiblePagesRef.current = initialVisible;
        setVisiblePages(initialVisible);
      }
    });

    // Camera starts at top
    currentYRef.current = 0;
    applyCamera(0);
  }, [svgPages, svgPagesRef, toolkit, pageOffsets, setEventsInStore]);

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
  `, [scoreColor]);

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
          animateNoteheads(scoreRef.current, evt.svgIds, {
            scale: activeNoteheadScale,
            entryMs: activeNoteheadAnimationEntryMs,
            holdMs: activeNoteheadAnimationHoldMs,
            exitMs: activeNoteheadAnimationExitMs,
            color: activeNoteheadColor,
            colorFullNote,
          });
        }
      }
    }

    // Camera Y: events in the same system share identical Y values
    // (grouped in getEventsFromVerovio), so this only changes at system boundaries
    currentYRef.current = event.y;

    applyCamera(currentYRef.current);

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
      if (interpolatedEvents.length === 0) return;

      // Capture array reference to ensure consistent usage throughout
      const events = interpolatedEvents;
      const totalEvents = events.length;

      if (totalEvents === 0) return;

      // Binary search for current event at timestamp for camera positioning
      let low = 0;
      let high = totalEvents - 1;
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

      // Update event index and Y position
      eventIndexRef.current = currentIndex;

      // Camera Y: events in the same system share identical Y values
      currentYRef.current = currentEvent.y;

      applyCamera(currentYRef.current);

      // For frame capture, we need to calculate exact animation state for each event
      // and apply it directly (no CSS transitions)
      const holdSeconds = activeNoteheadAnimationHoldMs / 1000;
      const exitSeconds = activeNoteheadAnimationExitMs / 1000;

      if (!scoreRef.current) return;

      // Reset all noteheads first
      resetNoteheadAnimations(scoreRef.current);

      // Apply animations with interpolated values for each event
      for (let i = 0; i <= currentIndex; i++) {
        const event = events[i];
        const eventTime = event.computedTimestamp;
        const timeSinceEvent = seconds - eventTime;

        if (timeSinceEvent < 0 || !event.svgIds?.length) continue;

        let scale: number;
        let color: string | undefined;

        if (timeSinceEvent < holdSeconds) {
          // Hold period: full scale and color
          scale = activeNoteheadScale;
          color = activeNoteheadColor;
        } else if (timeSinceEvent < holdSeconds + exitSeconds) {
          // Exit period: interpolate scale and color using ease-in curve
          const exitProgress = (timeSinceEvent - holdSeconds) / exitSeconds;
          // CSS ease-in approximation: cubic-bezier(0.42, 0, 1, 1) ~ progress^1.675
          const easedProgress = Math.pow(exitProgress, 1.675);

          // Interpolate scale from activeNoteheadScale to 1
          scale =
            activeNoteheadScale + (1 - activeNoteheadScale) * easedProgress;

          // Interpolate color from activeNoteheadColor to scoreColor
          color = interpolateColor(
            activeNoteheadColor,
            scoreColor,
            easedProgress,
          );
        } else {
          // Animation complete, skip this event
          continue;
        }

        // Apply animation directly to SVG elements (no CSS transitions)
        for (const id of event.svgIds) {
          const stavenote = scoreRef.current.querySelector<SVGGElement>(
            `#${CSS.escape(id)}`,
          );
          if (!stavenote) continue;

          const noteheads =
            stavenote.querySelectorAll<SVGGElement>("g.notehead");
          noteheads.forEach((nh) => {
            // Apply scale
            nh.style.transformBox = "fill-box";
            nh.style.transformOrigin = "center";
            nh.style.transition = ""; // No CSS transition for frame capture
            nh.style.transform = `scale(${scale})`;

            // Apply color to shapes (Verovio uses <use> elements for noteheads)
            if (color) {
              const shapes =
                nh.querySelectorAll<SVGGraphicsElement>("use");
              shapes.forEach((shape) => {
                shape.style.fill = color;
                shape.style.stroke = color;
                shape.style.color = color;
              });
            }
          });

          // Full note coloring (stems, accidentals, etc.)
          if (color && colorFullNote) {
            const extras = stavenote.querySelectorAll<SVGGraphicsElement>(
              "g.stem, g.accid, g.flag, g.dots, g.artic"
            );
            extras.forEach((group) => {
              group.style.fill = color;
              group.style.stroke = color;
              group.style.color = color;
              group.querySelectorAll<SVGGraphicsElement>("path, use, polygon, line").forEach((child) => {
                child.style.fill = color;
                child.style.stroke = color;
                child.style.color = color;
              });
            });
          }
        }
      }

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
      colorFullNote,
      scoreColor,
      interpolateColor,
    ],
  );

  // Expose animation controller on window for Puppeteer
  useEffect(() => {
    const shouldExpose = toolkit && svgPages.length > 0 && interpolatedEvents.length > 0;

    if (!shouldExpose) {
      console.log("[RegularRenderer] Not exposing controller yet:", {
        hasToolkit: !!toolkit,
        hasSvg: svgPages.length > 0,
        eventsCount: interpolatedEvents.length,
      });
      return;
    }

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

    console.log("[RegularRenderer] Animation controller exposed on window");

    return () => {
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
          {/* Score container with optional region positioning */}
          <div
            style={{
              position: "absolute",
              left: scoreRegion?.x ?? 0,
              top: scoreRegion?.y ?? 0,
              width: scoreRegion?.width ?? containerWidth,
              height: scoreRegion?.height ?? containerHeight,
              overflow: "hidden",
            }}
          >
            <div
              ref={cameraRef}
              style={{ display: "flex", width: "100%", pointerEvents: "none", transition: "transform 200ms ease-out" }}
            >
              <div
                ref={scoreRef}
                className="preview-score"
                style={{
                  width: scoreRegion?.width ?? containerWidth,
                  cursor: "default",
                  lineHeight: 0,
                  fontSize: 0,
                }}
              >
                {svgPages.map((svg, i) => (
                  <div
                    key={i}
                    ref={(el) => { pageContainerRefs.current[i] = el; }}
                    className="preview-score"
                    style={{ width: scoreRegion?.width ?? containerWidth }}
                    dangerouslySetInnerHTML={{ __html: svg }}
                  />
                ))}
              </div>
            </div>

          </div>

          {/* Score borders - positioned exactly at region edges */}
          {scoreBorder !== "none" &&
            (() => {
              const BorderComponent = getBorderComponent(scoreBorder);
              const borderHeight = getBorderHeight(scoreBorder);
              const regionWidth = scoreRegion?.width ?? containerWidth;
              const regionX = scoreRegion?.x ?? 0;
              const regionY = scoreRegion?.y ?? 0;
              const regionHeight = scoreRegion?.height ?? containerHeight;

              if (!BorderComponent) return null;

              return (
                <>
                  {/* Top border - bottom edge aligns with top of region */}
                  <div
                    style={{
                      position: "absolute",
                      top: regionY - borderHeight,
                      left: regionX,
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
                      top: regionY + regionHeight,
                      left: regionX,
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
              );
            })()}
        </div>
      </div>

      {/* Transport bar */}
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
    </div>
  );
}
