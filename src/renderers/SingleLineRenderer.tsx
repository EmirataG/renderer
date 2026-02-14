import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { useSingleLineVerovio } from "../hooks/useSingleLineVerovio";
import { extractTimemapEvents, computeEventPositions, computeSectionPositions } from "../lib/getEvents";
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
  reorderNoteheadsAboveStems,
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
  colorFullNote = false,
  hideLabels = false,
}: Props) {
  const cameraRef = useRef<HTMLDivElement>(null);
  const scoreRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const sectionContainerRefs = useRef<(HTMLDivElement | null)[]>([]);

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
    (typeof events[number] & { computedTimestamp: number; isAnchor: boolean; x: number })[]
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
      }));
      setInterpolatedEvents(merged);
    } else {
      setInterpolatedEvents([]);
    }
  }, [events, syncAnchors]);

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
      }
    });

    // Camera starts at left
    currentXRef.current = 0;
    applyCamera(0);
  }, [sections, svgPagesRef, toolkit, sectionOffsets, setEventsInStore, containerWidth]);

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
    /* Hide clefs, key signatures, and time signatures in continuation sections */
    .section-continuation g.clef,
    .section-continuation g.keySig,
    .section-continuation g.meterSig {
      display: none !important;
    }
    ${hideLabels ? '.preview-score .label, .preview-score .labelAbbr { display: none !important; }' : ''}
  `, [scoreColor, hideLabels]);

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

    if (cameraRef.current) {
      cameraRef.current.style.transform = `translateX(${-cameraX}px)`;
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

          animateNoteheads(root, evt.svgIds, {
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

      // For frame capture, we need to calculate exact animation state for each event
      // and apply it directly (no CSS transitions)
      const holdSeconds = activeNoteheadAnimationHoldMs / 1000;
      const exitSeconds = activeNoteheadAnimationExitMs / 1000;

      if (!scoreRef.current) return;

      // Reset all noteheads first
      resetNoteheadAnimations(scoreRef.current);

      // Apply animations with interpolated values for each event
      for (let i = 0; i <= currentIndex; i++) {
        const event = evts[i];
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
      isRenderMode,
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
                      {sections.map((svg, i) => (
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
                      ))}
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
