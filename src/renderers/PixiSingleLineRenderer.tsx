/**
 * PixiJS-based single line score renderer.
 *
 * Renders score sections as GPU-accelerated WebGL sprites positioned horizontally.
 * This replaces SVG DOM rendering for smooth 60fps scrolling.
 *
 * Features:
 * - WebGL rendering via PixiJS v8
 * - Texture caching with automatic cleanup
 * - WebGL context loss/restore handling
 * - Horizontal sprite layout matching useSingleLineVerovio output
 *
 * @module PixiSingleLineRenderer
 */

import { Application, extend, useApplication, useTick } from '@pixi/react';
import { Container, Sprite, Ticker } from 'pixi.js';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useSingleLineVerovio } from '../hooks/useSingleLineVerovio';
import {
  sectionsToTextures,
  clearTextureCache,
  TextureResult,
} from '../lib/svgToTexture';
import { useEventStore } from '../stores/eventStore';
import { interpolateTimestamps } from '../lib/interpolation';

// Register PixiJS components at module level for tree-shaking
// Must be called before using pixiContainer/pixiSprite in JSX
extend({ Container, Sprite });

// =============================================================================
// Props
// =============================================================================

interface Props {
  xml: string;
  scoreScale?: number; // Default 1
  musicFont?: string; // Default 'Bravura'
  // Playback integration
  scoreRegion?: { x: number; y: number; width: number; height: number } | null;
  syncAnchors?: Map<string, number>;
  audioUrl?: string;
}

// =============================================================================
// ContextLossHandler
// =============================================================================

/**
 * Child component to handle WebGL context loss/restore events.
 *
 * Must be a child of Application because useApplication() hook only works
 * in components rendered inside the Application tree.
 *
 * Renders nothing - just registers event listeners on app.canvas.
 */
function ContextLossHandler(): null {
  const { app } = useApplication();

  useEffect(() => {
    const canvas = app.canvas;

    const handleContextLost = (event: Event) => {
      event.preventDefault();
      console.warn('[PixiRenderer] WebGL context lost');
    };

    const handleContextRestored = () => {
      console.log('[PixiRenderer] WebGL context restored');
    };

    canvas.addEventListener('webglcontextlost', handleContextLost);
    canvas.addEventListener('webglcontextrestored', handleContextRestored);

    return () => {
      canvas.removeEventListener('webglcontextlost', handleContextLost);
      canvas.removeEventListener('webglcontextrestored', handleContextRestored);
    };
  }, [app]);

  return null;
}

// =============================================================================
// CameraController
// =============================================================================

/**
 * Child component for GPU-accelerated camera animation.
 *
 * Uses useTick hook to update camera position every frame with exponential
 * smoothing for smooth, frame-rate-independent animation.
 *
 * Must be a child of Application because useTick uses PixiJS Ticker.
 */
interface CameraControllerProps {
  containerRef: React.RefObject<Container | null>;
  targetX: number;
  viewportWidth: number;
  scoreWidth: number;
  isPlaying: boolean;
}

function CameraController({
  containerRef,
  targetX,
  viewportWidth,
  scoreWidth,
  isPlaying,
}: CameraControllerProps): null {
  const currentXRef = useRef(targetX);

  // CRITICAL: Memoize callback to prevent ticker re-registration
  const animate = useCallback(
    (ticker: Ticker) => {
      if (!containerRef.current) return;

      const dt = ticker.deltaMS / 1000;
      const speed = 10; // Smoothing factor (higher = snappier)

      // Frame-rate-independent exponential smoothing
      currentXRef.current +=
        (targetX - currentXRef.current) * (1 - Math.exp(-speed * dt));

      // Calculate bounded camera position
      let cameraX = currentXRef.current - viewportWidth / 2;
      cameraX = Math.max(
        0,
        Math.min(cameraX, Math.max(0, scoreWidth - viewportWidth))
      );

      // Apply to container (negative X scrolls content left)
      containerRef.current.position.x = -cameraX;
    },
    [containerRef, targetX, viewportWidth, scoreWidth]
  );

  useTick({ callback: animate, isEnabled: isPlaying });

  return null;
}

// =============================================================================
// EventTracker
// =============================================================================

/**
 * Child component for tracking playback position and updating camera target.
 *
 * Uses binary search to find current event and interpolates X position
 * between events for smooth camera targeting.
 *
 * Must be a child of Application because useTick uses PixiJS Ticker.
 */
interface InterpolatedEvent {
  id: string;
  computedTimestamp: number;
  isAnchor: boolean;
  x: number;
}

interface EventTrackerProps {
  audioRef: React.RefObject<HTMLAudioElement | null>;
  interpolatedEvents: InterpolatedEvent[];
  targetXRef: React.MutableRefObject<number>;
  activeEventIndexRef: React.MutableRefObject<number>;
  isPlaying: boolean;
}

function EventTracker({
  audioRef,
  interpolatedEvents,
  targetXRef,
  activeEventIndexRef,
  isPlaying,
}: EventTrackerProps): null {
  const animate = useCallback(
    (ticker: Ticker) => {
      if (!audioRef.current || interpolatedEvents.length === 0) return;

      const currentTime = audioRef.current.currentTime;

      // Binary search for current event
      let low = 0;
      let high = interpolatedEvents.length - 1;
      let result = -1;
      while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        if (interpolatedEvents[mid].computedTimestamp <= currentTime) {
          result = mid;
          low = mid + 1;
        } else {
          high = mid - 1;
        }
      }

      if (result < 0) return;
      activeEventIndexRef.current = result;

      // Interpolate X between current and next event for smooth camera
      const currentEvent = interpolatedEvents[result];
      const nextEvent = interpolatedEvents[result + 1];

      if (nextEvent) {
        const duration =
          nextEvent.computedTimestamp - currentEvent.computedTimestamp;
        if (duration > 0) {
          const progress =
            (currentTime - currentEvent.computedTimestamp) / duration;
          const clampedProgress = Math.max(0, Math.min(1, progress));
          targetXRef.current =
            currentEvent.x + (nextEvent.x - currentEvent.x) * clampedProgress;
        } else {
          targetXRef.current = currentEvent.x;
        }
      } else {
        targetXRef.current = currentEvent.x;
      }
    },
    [audioRef, interpolatedEvents, targetXRef, activeEventIndexRef]
  );

  useTick({ callback: animate, isEnabled: isPlaying });

  return null;
}

// =============================================================================
// PixiSingleLineRenderer
// =============================================================================

/**
 * Main PixiJS renderer component for single-line score display.
 *
 * Converts Verovio SVG sections to GPU textures and displays them
 * as horizontally positioned sprites in a WebGL canvas.
 *
 * @param props.xml - MusicXML string to render
 * @param props.scoreScale - Scale factor (default 1, maps to verovioScale 40)
 * @param props.musicFont - Music font name (default 'Bravura')
 */
export default function PixiSingleLineRenderer({
  xml,
  scoreScale = 1,
  musicFont = 'Bravura',
  scoreRegion,
  syncAnchors,
  audioUrl,
}: Props) {
  // Convert scoreScale to Verovio scale (1 -> 40, 2 -> 80, etc.)
  const verovioScale = Math.round(40 * scoreScale);

  // Get sections and layout info from Verovio
  const { sections, sectionOffsets, totalWidth, maxHeight, isLoading } =
    useSingleLineVerovio(xml, verovioScale, 15, musicFont);

  // Event cache from Zustand store
  const { events } = useEventStore(
    useShallow((state) => ({ events: state.events }))
  );

  // Camera refs for GPU-accelerated transforms
  const cameraContainerRef = useRef<Container>(null);

  // Audio and playback state
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const activeEventIndexRef = useRef(-1);
  const targetXRef = useRef(0);

  // Interpolated events with computed timestamps
  const [interpolatedEvents, setInterpolatedEvents] = useState<
    InterpolatedEvent[]
  >([]);

  // Texture state for rendered sections
  const [textures, setTextures] = useState<TextureResult[]>([]);

  // Audio element setup
  useEffect(() => {
    if (!audioUrl) {
      audioRef.current = null;
      return;
    }
    const audio = new Audio(audioUrl);
    audioRef.current = audio;
    return () => {
      audio.pause();
      audioRef.current = null;
    };
  }, [audioUrl]);

  // Calculate interpolated events when events or syncAnchors change
  useEffect(() => {
    if (events.length === 0 || !syncAnchors || syncAnchors.size === 0) {
      setInterpolatedEvents([]);
      return;
    }
    const interpolated = interpolateTimestamps(events, syncAnchors);
    const xMap = new Map(events.map((evt) => [evt.id, evt.globalX ?? 0]));
    const merged = interpolated.map((evt) => ({
      id: evt.id,
      computedTimestamp: evt.computedTimestamp,
      isAnchor: evt.isAnchor,
      x: xMap.get(evt.id) ?? 0,
    }));
    setInterpolatedEvents(merged);
  }, [events, syncAnchors]);

  // Convert sections to textures when they change
  useEffect(() => {
    if (sections.length === 0) return;

    let cancelled = false;

    sectionsToTextures(sections, verovioScale, musicFont).then((results) => {
      if (!cancelled) {
        setTextures(results);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [sections, verovioScale, musicFont]);

  // Cleanup textures on unmount to free GPU memory
  useEffect(() => {
    return () => {
      clearTextureCache();
    };
  }, []);

  // Loading state
  if (isLoading || textures.length === 0) {
    return <div>Loading score...</div>;
  }

  return (
    <div>
      <Application
        width={totalWidth}
        height={maxHeight}
        backgroundColor={0xffffff}
        backgroundAlpha={0}
      >
        <ContextLossHandler />
        <CameraController
          containerRef={cameraContainerRef}
          targetX={targetXRef.current}
          viewportWidth={scoreRegion?.width ?? totalWidth}
          scoreWidth={totalWidth}
          isPlaying={isPlaying}
        />
        <EventTracker
          audioRef={audioRef}
          interpolatedEvents={interpolatedEvents}
          targetXRef={targetXRef}
          activeEventIndexRef={activeEventIndexRef}
          isPlaying={isPlaying}
        />
        <pixiContainer
          ref={cameraContainerRef}
          isRenderGroup={true}
          x={0}
          y={0}
        >
          {textures.map((result, index) => (
            <pixiSprite
              key={index}
              texture={result.texture}
              x={sectionOffsets[index]}
              y={0}
            />
          ))}
        </pixiContainer>
      </Application>

      {/* Transport controls */}
      <div className="mt-3 px-3 py-2">
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => {
              if (!audioRef.current) return;
              setIsPlaying(true);
              audioRef.current.play().catch(console.error);
            }}
            disabled={!audioUrl || isPlaying}
            className="grunge-btn grunge-btn-sm flex-1"
          >
            Play
          </button>
          <button
            onClick={() => {
              if (audioRef.current) audioRef.current.pause();
              setIsPlaying(false);
            }}
            disabled={!isPlaying}
            className="grunge-btn grunge-btn-sm flex-1"
          >
            Pause
          </button>
          <button
            onClick={() => {
              setIsPlaying(false);
              if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current.currentTime = 0;
              }
              activeEventIndexRef.current = -1;
              targetXRef.current = events[0]?.globalX ?? 0;
            }}
            className="grunge-btn grunge-btn-sm flex-1"
          >
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}
