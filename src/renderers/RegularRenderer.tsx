import { useEffect, useRef, useState, useCallback } from "react";
import { OpenSheetMusicDisplay } from "opensheetmusicdisplay";
import type { MusicalEvent } from "../lib/getEvents";
import type { ScoreRegion } from "../types/score";
import { BorderStyle, getBorderComponent, getBorderHeight } from "../borders";
import { interpolateTimestamps } from "../lib/interpolation";
import {
  initAnimationController,
  destroyAnimationController,
} from "../lib/animationController";

import {
  animateNoteheads,
  resetNoteheadAnimations,
} from "../lib/noteAnimation";

const WIDTH = 980;

interface Props {
  // core
  xml: string;
  bgUrl?: string;
  bpm?: number;
  fps?: number;
  scoreColor?: string;
  // sync anchors for timing (optional - uses BPM if not provided)
  syncAnchors?: Map<string, number>;
  // audio for synced playback (optional)
  audioUrl?: string;
  // score region customization
  scoreRegion?: ScoreRegion | null;
  // score border style
  scoreBorder?: BorderStyle;
  // score scale (size multiplier)
  scoreScale?: number;
  // notehead animations
  activeNoteheadColor?: string;
  activeNoteheadScale?: number;
  activeNoteheadAnimationEntryMs?: number;
  activeNoteheadAnimationHoldMs?: number;
  activeNoteheadAnimationExitMs?: number;
}

// Extended event interface with Y position
interface MusicalEventWithY extends MusicalEvent {
  y: number;
}

export default function RegularRenderer({
  xml,
  bgUrl,
  bpm = 20,
  fps = 60,
  scoreColor = "#000000",
  syncAnchors,
  audioUrl,
  scoreRegion,
  scoreBorder = "none",
  scoreScale = 1,
  // notehead animation defaults
  activeNoteheadColor = scoreColor,
  activeNoteheadScale = 1,
  activeNoteheadAnimationEntryMs = 50,
  activeNoteheadAnimationHoldMs = 200,
  activeNoteheadAnimationExitMs = 200,
}: Props) {
  const cameraRef = useRef<HTMLDivElement>(null);
  const osmdRef = useRef<HTMLDivElement>(null);
  const styleRef = useRef<HTMLStyleElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [osmd, setOsmd] = useState<OpenSheetMusicDisplay | null>(null);
  const [events, setEvents] = useState<MusicalEventWithY[]>([]);
  // Interpolated events with computed timestamps (when syncAnchors provided)
  const [interpolatedEvents, setInterpolatedEvents] = useState<
    (MusicalEventWithY & { computedTimestamp: number; isAnchor: boolean })[]
  >([]);
  const [containerWidth, setContainerWidth] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);
  const [renderScale, setRenderScale] = useState(1); // Scale factor for render mode
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioDuration, setAudioDuration] = useState(0);

  const animationFrameRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number>(0);

  const eventIndexRef = useRef(-1); // -1 so first event (index 0) triggers animation
  const currentYRef = useRef(0);
  const velocityRef = useRef(0);
  const eventEndTimeRef = useRef(0);

  // Track if we're using sync-based timing
  const useSyncTiming = syncAnchors && syncAnchors.size > 0;

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
      // Create a map of event id -> y position for fast lookup
      const yMap = new Map(events.map((evt) => [evt.id, evt.y]));
      // Merge Y positions from original events by matching event IDs
      const merged = interpolated.map((evt) => ({
        ...evt,
        y: yMap.get(evt.id) ?? 0,
      }));
      setInterpolatedEvents(merged);
    } else {
      // No sync anchors - use BPM-based timing (computedTimestamp = 0 for all)
      setInterpolatedEvents(
        events.map((evt) => ({
          ...evt,
          computedTimestamp: 0,
          isAnchor: false,
        })),
      );
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

  /* ---------------- OSMD ---------------- */

  // Function to get events with Y positions
  function getEventsWithY(osmd: OpenSheetMusicDisplay): MusicalEventWithY[] {
    const cursor = osmd.Cursor;
    cursor.show();
    cursor.reset();

    const events: MusicalEventWithY[] = [];
    const OFFSET = 15;

    // First pass: collect all events with their raw Y positions
    while (!cursor.Iterator.EndReached) {
      const beatOnset = cursor.Iterator.currentTimeStamp.RealValue;

      // Get SVG IDs
      const svgIds: string[] = [];
      for (const ve of cursor.Iterator.CurrentVoiceEntries) {
        for (const n of ve.Notes) {
          if (n.isRest()) continue;
          const gNote = osmd.EngravingRules.GNote(n);
          const id: string = (gNote as any).vfnote[0].getAttribute("id");
          if (id) {
            svgIds.push(`vf-${id}`);
          }
        }
      }

      // Get X and Y positions from cursor
      const cssLeft = cursor.cursorElement.style.left;
      const cssTop = cursor.cursorElement.style.top;

      const posStrX = cssLeft.substring(0, cssLeft.length - 2);
      const posStrY = cssTop.substring(0, cssTop.length - 2);

      const x = Number(posStrX) + OFFSET;
      const y = Number(posStrY);

      events.push({
        id: `evt-${events.length}`,
        beatOnset,
        beatDuration: 0,
        svgIds: svgIds,
        x: x ?? 0,
        y: y ?? 0,
      });

      cursor.next();
    }

    // Second pass: group events by system and calculate center Y for each system
    // Events on the same system will have similar Y values (within a threshold)
    const Y_THRESHOLD = 20; // pixels - events within this range are considered on same system
    const systems: {
      minY: number;
      maxY: number;
      centerY: number;
      events: MusicalEventWithY[];
    }[] = [];

    for (const event of events) {
      // Find if this event belongs to an existing system
      let foundSystem = systems.find(
        (sys) => Math.abs(sys.minY - event.y) < Y_THRESHOLD,
      );

      if (foundSystem) {
        foundSystem.events.push(event);
        foundSystem.minY = Math.min(foundSystem.minY, event.y);
        foundSystem.maxY = Math.max(foundSystem.maxY, event.y);
        foundSystem.centerY = (foundSystem.minY + foundSystem.maxY) / 2;
      } else {
        // Create new system
        systems.push({
          minY: event.y,
          maxY: event.y,
          centerY: event.y,
          events: [event],
        });
      }
    }

    // Get cursor height to add to center calculation
    const cursorHeight = cursor.cursorElement.offsetHeight || 0;

    // Third pass: assign center Y to all events in each system
    for (const system of systems) {
      const systemCenterY = system.centerY + cursorHeight / 2;
      for (const event of system.events) {
        event.y = systemCenterY;
      }
    }

    // Calculate beat durations
    for (let i = 0; i < events.length - 1; i++) {
      events[i].beatDuration = events[i + 1].beatOnset - events[i].beatOnset;
    }

    if (events.length > 0) {
      events[events.length - 1].beatDuration = 1;
    }

    cursor.hide();
    return events;
  }

  useEffect(() => {
    if (!osmdRef.current || !containerWidth || osmd) return;

    const inst = new OpenSheetMusicDisplay(osmdRef.current, {
      backend: "svg",
      renderSingleHorizontalStaffline: false, // Render as normal page
      drawTitle: false,
      drawComposer: false,
      drawPartNames: false,
      drawMeasureNumbers: false,
    });

    setOsmd(inst);

    inst.load(xml).then(() => {
      inst.render();
      const evts = getEventsWithY(inst);
      setEvents(evts);

      if (osmdRef.current) {
        resetNoteheadAnimations(osmdRef.current);
      }

      // Initial position - start at top
      if (evts.length) {
        currentYRef.current = evts[0].y;
        applyCamera(evts[0].y);
      }
    });
  }, [xml, containerWidth, osmd]);

  // Track previous scoreScale to detect changes for zoom update
  const prevScoreScaleRef = useRef(scoreScale);
  // Track previous region width to detect changes
  const prevRegionWidthRef = useRef(scoreRegion?.width);

  // Apply OSMD zoom when scoreScale changes (no full re-initialization needed)
  useEffect(() => {
    // Skip if no OSMD yet or if scale hasn't changed
    if (!osmd || scoreScale === prevScoreScaleRef.current) {
      prevScoreScaleRef.current = scoreScale;
      return;
    }

    prevScoreScaleRef.current = scoreScale;

    // Apply zoom and re-render (much faster than full re-initialization)
    osmd.zoom = scoreScale;
    osmd.render();

    // Re-extract events since layout changed
    const evts = getEventsWithY(osmd);
    setEvents(evts);

    if (osmdRef.current) {
      resetNoteheadAnimations(osmdRef.current);
    }

    // Update camera position
    if (evts.length) {
      currentYRef.current = evts[0].y;
      applyCamera(evts[0].y);
    }
  }, [scoreScale, osmd]);

  // Re-render OSMD when region width changes (layout reflow for new width)
  useEffect(() => {
    const currentWidth = scoreRegion?.width;
    // Skip if no OSMD yet or width hasn't changed
    if (!osmd || currentWidth === prevRegionWidthRef.current) {
      prevRegionWidthRef.current = currentWidth;
      return;
    }

    prevRegionWidthRef.current = currentWidth;

    // Re-render to reflow layout for new container width
    osmd.render();

    // Re-extract events since layout changed
    const evts = getEventsWithY(osmd);
    setEvents(evts);

    if (osmdRef.current) {
      resetNoteheadAnimations(osmdRef.current);
    }

    // Update camera position
    if (evts.length) {
      currentYRef.current = evts[0].y;
      applyCamera(evts[0].y);
    }
  }, [scoreRegion?.width, osmd]);

  /* ---------------- score color and styling ---------------- */

  useEffect(() => {
    if (!osmdRef.current) return;

    // Check if style element exists and is still in the DOM
    // (OSMD re-render clears the container, removing our style element)
    if (!styleRef.current || !styleRef.current.parentNode) {
      styleRef.current = document.createElement("style");
      osmdRef.current.appendChild(styleRef.current);
    }

    // Comprehensive styling scoped to .preview-score (don't affect SyncEditor)
    styleRef.current.innerHTML = `
      /* Universal color for all SVG shapes - scoped to preview-score */
      .preview-score [id^="osmdSvgPage"] path,
      .preview-score [id^="osmdSvgPage"] ellipse,
      .preview-score [id^="osmdSvgPage"] circle,
      .preview-score [id^="osmdSvgPage"] rect:not(.vf-bounding-box),
      .preview-score [id^="osmdSvgPage"] line,
      .preview-score [id^="osmdSvgPage"] polyline,
      .preview-score [id^="osmdSvgPage"] polygon {
        fill: ${scoreColor};
        stroke: ${scoreColor};
      }

      /* Stafflines - isolated with fixed stroke-width to prevent glitching */
      .preview-score [id^="osmdSvgPage"] .vf-stave path {
        fill: none !important;
        stroke: ${scoreColor} !important;
        stroke-width: 1 !important;
        shape-rendering: crispEdges !important;
        vector-effect: non-scaling-stroke !important;
      }

      /* Note elements that can be animated */
      .preview-score [id^="osmdSvgPage"] .vf-notehead {
        will-change: transform;
      }

      /* Text elements */
      .preview-score [id^="osmdSvgPage"] text {
        fill: ${scoreColor};
      }

      /* Hide bounding boxes (used for selection hit areas) */
      .preview-score [id^="osmdSvgPage"] .vf-bounding-box {
        fill: transparent !important;
        stroke: transparent !important;
      }

      /* Disable pointer interactions in preview render */
      .preview-score [id^="osmdSvgPage"],
      .preview-score [id^="osmdSvgPage"] *,
      .preview-score .vf-stavenote,
      .preview-score .vf-stavenote * {
        pointer-events: none !important;
        cursor: default !important;
        user-select: none !important;
      }
    `;
  }, [scoreColor, osmd, scoreRegion?.width, scoreScale]);

  /* ---------------- camera (vertical) ---------------- */

  function applyCamera(targetY: number) {
    const scoreHeight = osmdRef.current?.scrollHeight ?? 0;
    const viewportHeight = scoreRegion?.height ?? containerHeight;

    // Keep the target Y position in the vertical center of the viewport
    // Exception: at the beginning and end, don't scroll past the edges
    let cameraY = targetY - viewportHeight / 2;

    // Clamp to valid range: don't scroll above 0 or below the maximum scroll
    cameraY = Math.max(0, cameraY);
    cameraY = Math.min(cameraY, Math.max(0, scoreHeight - viewportHeight));

    if (cameraRef.current) {
      cameraRef.current.style.transform = `translateY(${-cameraY}px)`;
    }
  }

  /* ---------------- motion ---------------- */

  // BPM-based timing: setup event with relative timing
  function setupEventBPM(index: number, now: number): boolean {
    const current = events[index];
    const next = events[index + 1];
    if (!current) return false;

    currentYRef.current = current.y;

    const durationMs = (60_000 / bpm) * current.beatDuration;
    eventEndTimeRef.current = now + durationMs;

    // Calculate vertical velocity
    velocityRef.current = next ? (next.y - current.y) / durationMs : 0;

    if (current.svgIds?.length) {
      animateNoteheads(osmdRef.current, current.svgIds, {
        scale: activeNoteheadScale,
        entryMs: activeNoteheadAnimationEntryMs,
        holdMs: activeNoteheadAnimationHoldMs,
        exitMs: activeNoteheadAnimationExitMs,
        color: activeNoteheadColor,
      });
    }

    return true;
  }

  // Sync-based timing: find event at given timestamp
  function getEventAtTimestamp(timestampSec: number): {
    event: (typeof interpolatedEvents)[0] | null;
    index: number;
  } {
    if (interpolatedEvents.length === 0) return { event: null, index: -1 };

    // Find the last event whose computedTimestamp <= timestampSec
    let targetIndex = -1;
    for (let i = interpolatedEvents.length - 1; i >= 0; i--) {
      if (interpolatedEvents[i].computedTimestamp <= timestampSec) {
        targetIndex = i;
        break;
      }
    }

    if (targetIndex < 0) return { event: null, index: -1 };
    return { event: interpolatedEvents[targetIndex], index: targetIndex };
  }

  // Sync-based animation: driven by audio currentTime
  function animateSync() {
    if (!audioRef.current || !useSyncTiming) return;

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

    // Check if we moved to a new event
    if (index !== eventIndexRef.current) {
      eventIndexRef.current = index;

      // Animate noteheads for new event
      if (event.svgIds?.length) {
        animateNoteheads(osmdRef.current, event.svgIds, {
          scale: activeNoteheadScale,
          entryMs: activeNoteheadAnimationEntryMs,
          holdMs: activeNoteheadAnimationHoldMs,
          exitMs: activeNoteheadAnimationExitMs,
          color: activeNoteheadColor,
        });
      }
    }

    // Calculate Y position with interpolation between events
    const nextEvent = interpolatedEvents[index + 1];
    if (nextEvent && nextEvent.computedTimestamp > event.computedTimestamp) {
      const progress =
        (currentTime - event.computedTimestamp) /
        (nextEvent.computedTimestamp - event.computedTimestamp);
      currentYRef.current =
        event.y + (nextEvent.y - event.y) * Math.min(1, progress);
    } else {
      currentYRef.current = event.y;
    }

    applyCamera(currentYRef.current);

    // Check if audio ended
    if (audioRef.current.ended) {
      stop();
      return;
    }

    animationFrameRef.current = requestAnimationFrame(animateSync);
  }

  // BPM-based animation loop
  function animateBPM(now: number) {
    const frameInterval = 1000 / fps;
    const last = lastFrameTimeRef.current;

    if (now - last < frameInterval) {
      animationFrameRef.current = requestAnimationFrame(animateBPM);
      return;
    }

    lastFrameTimeRef.current = now;
    const dt = last ? now - last : 0;

    currentYRef.current += velocityRef.current * dt;

    while (now >= eventEndTimeRef.current) {
      eventIndexRef.current++;
      if (!setupEventBPM(eventIndexRef.current, eventEndTimeRef.current)) {
        stop();
        return;
      }
    }

    applyCamera(currentYRef.current);
    animationFrameRef.current = requestAnimationFrame(animateBPM);
  }

  /* ---------------- controls ---------------- */

  function play() {
    if (isPlaying || !events.length) return;

    setIsPlaying(true);
    lastFrameTimeRef.current = performance.now();

    if (useSyncTiming && audioRef.current) {
      // Sync-based timing: start audio and sync animation
      audioRef.current.play().catch(console.error);
      animationFrameRef.current = requestAnimationFrame(animateSync);
    } else {
      // BPM-based timing: traditional animation loop
      setupEventBPM(eventIndexRef.current, lastFrameTimeRef.current);
      animationFrameRef.current = requestAnimationFrame(animateBPM);
    }
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
    currentYRef.current = events[0]?.y ?? 0;
    applyCamera(currentYRef.current);

    // Reset audio to beginning
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
    }

    if (osmdRef.current) {
      resetNoteheadAnimations(osmdRef.current);
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
      // In render mode, we need this to work even if useSyncTiming isn't set yet
      // For normal mode, require sync timing
      if (!isRenderMode && !useSyncTiming) return;

      // Capture array reference to ensure consistent usage throughout
      const events = interpolatedEvents;
      const totalEvents = events.length;

      if (totalEvents === 0) return;

      // Find current event at timestamp for camera positioning
      let currentIndex = -1;
      for (let i = totalEvents - 1; i >= 0; i--) {
        if (events[i].computedTimestamp <= seconds) {
          currentIndex = i;
          break;
        }
      }
      if (currentIndex < 0) return;
      const currentEvent = events[currentIndex];

      // Update event index and Y position
      eventIndexRef.current = currentIndex;

      // Calculate interpolated Y position
      const nextEvent = events[currentIndex + 1];
      if (
        nextEvent &&
        nextEvent.computedTimestamp > currentEvent.computedTimestamp
      ) {
        const progress =
          (seconds - currentEvent.computedTimestamp) /
          (nextEvent.computedTimestamp - currentEvent.computedTimestamp);
        currentYRef.current =
          currentEvent.y +
          (nextEvent.y - currentEvent.y) * Math.min(1, progress);
      } else {
        currentYRef.current = currentEvent.y;
      }

      applyCamera(currentYRef.current);

      // For frame capture, we need to calculate exact animation state for each event
      // and apply it directly (no CSS transitions)
      const holdSeconds = activeNoteheadAnimationHoldMs / 1000;
      const exitSeconds = activeNoteheadAnimationExitMs / 1000;

      if (!osmdRef.current) return;

      // Reset all noteheads first
      resetNoteheadAnimations(osmdRef.current);

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
          const stavenote = osmdRef.current.querySelector<SVGGElement>(
            `#${CSS.escape(id)}`,
          );
          if (!stavenote) continue;

          const noteheads =
            stavenote.querySelectorAll<SVGGElement>(".vf-notehead");
          noteheads.forEach((nh) => {
            // Apply scale
            nh.style.transformBox = "fill-box";
            nh.style.transformOrigin = "center";
            nh.style.transition = ""; // No CSS transition for frame capture
            nh.style.transform = `scale(${scale})`;

            // Apply color to shapes
            if (color) {
              const shapes =
                nh.querySelectorAll<SVGGraphicsElement>("path, ellipse");
              shapes.forEach((shape) => {
                shape.style.fill = color;
                shape.style.stroke = color;
              });
            }
          });
        }
      }

      // Force reflow to ensure CSS styles are applied synchronously
      // before Puppeteer takes the screenshot
      void osmdRef.current.offsetHeight;
    },
    [
      isRenderMode,
      useSyncTiming,
      interpolatedEvents,
      activeNoteheadScale,
      activeNoteheadColor,
      activeNoteheadAnimationHoldMs,
      activeNoteheadAnimationExitMs,
      scoreColor,
      interpolateColor,
    ],
  );

  // Expose animation controller on window for Puppeteer
  useEffect(() => {
    // In render mode, expose controller as soon as OSMD is ready
    // In normal mode, require sync timing to be active
    const shouldExpose = isRenderMode
      ? osmd && interpolatedEvents.length > 0
      : useSyncTiming && osmd && interpolatedEvents.length > 0;

    if (!shouldExpose) {
      console.log("[RegularRenderer] Not exposing controller yet:", {
        isRenderMode,
        hasOsmd: !!osmd,
        eventsCount: interpolatedEvents.length,
        useSyncTiming,
      });
      return;
    }

    const getInterpolatedEvents = () => interpolatedEvents;

    // Initialize the animation controller module (for internal state tracking)
    initAnimationController({
      audioElement: audioRef.current,
      osmdInstance: osmd!, // osmd is checked above
      getInterpolatedEvents,
      containerElement: osmdRef.current!,
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
    isRenderMode,
    useSyncTiming,
    osmd,
    interpolatedEvents,
    audioDuration,
    setTimestamp,
  ]);

  if (!containerWidth || !containerHeight) {
    return <div className="text-neutral-400">Select background</div>;
  }

  return (
    <div>
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
              style={{ display: "flex", width: "100%", pointerEvents: "none" }}
            >
              <div
                ref={osmdRef}
                className="preview-score"
                style={{
                  width: scoreRegion?.width ?? containerWidth,
                  cursor: "default",
                }}
              />
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

      {/* Transport bar - hidden in render mode */}
      {!isRenderMode && (
        <div className="mt-3 flex items-center justify-center gap-2 px-3 py-2">
          <button
            onClick={play}
            disabled={isPlaying}
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
      )}
    </div>
  );
}
