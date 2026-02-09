/**
 * PixiJS-based single line score renderer.
 *
 * Renders score sections as GPU-accelerated sprites positioned horizontally.
 * Uses higher resolution textures to maintain quality when scaled.
 */

import { Application, extend, useApplication, useTick } from '@pixi/react';
import { Container, Sprite, Ticker } from 'pixi.js';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useSingleLineVerovio } from '../hooks/useSingleLineVerovio';
import {
  sectionsToTextures,
  clearTextureCache,
  TextureResult,
} from '../lib/svgToTexture';
import { useEventStore } from '../stores/eventStore';
import { interpolateTimestamps } from '../lib/interpolation';
import type { ScoreRegion } from '../types/score';

// Register PixiJS components at module level for tree-shaking
extend({ Container, Sprite });

const WIDTH = 980;

// =============================================================================
// Props
// =============================================================================

interface Props {
  xml: string;
  bgUrl?: string;
  scoreScale?: number;
  musicFont?: string;
  scoreRegion?: ScoreRegion | null;
  syncAnchors?: Map<string, number>;
  audioUrl?: string;
}

// =============================================================================
// ContextLossHandler
// =============================================================================

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

  const animate = useCallback(
    (ticker: Ticker) => {
      if (!containerRef.current) return;

      const dt = ticker.deltaMS / 1000;
      const speed = 10;

      currentXRef.current +=
        (targetX - currentXRef.current) * (1 - Math.exp(-speed * dt));

      let cameraX = currentXRef.current - viewportWidth / 2;
      cameraX = Math.max(
        0,
        Math.min(cameraX, Math.max(0, scoreWidth - viewportWidth))
      );

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
    () => {
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

export default function PixiSingleLineRenderer({
  xml,
  bgUrl,
  scoreScale = 1,
  musicFont = 'Bravura',
  scoreRegion,
  syncAnchors,
  audioUrl,
}: Props) {
  // Render at higher resolution (100 instead of 40) for quality when scaled
  // The base scale of 100 gives us good resolution for scaling
  const verovioScale = Math.round(100 * scoreScale);

  const { sections, sectionOffsets, totalWidth, maxHeight, isLoading } =
    useSingleLineVerovio(xml, verovioScale, 15, musicFont);

  const { events } = useEventStore(
    useShallow((state) => ({ events: state.events }))
  );

  // Container dimensions (based on background image or defaults)
  const [containerWidth, setContainerWidth] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);

  // Camera refs
  const cameraContainerRef = useRef<Container>(null);
  const staticCameraXRef = useRef(0);

  // Audio and playback state
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const activeEventIndexRef = useRef(-1);
  const targetXRef = useRef(0);

  // Interpolated events
  const [interpolatedEvents, setInterpolatedEvents] = useState<
    InterpolatedEvent[]
  >([]);

  // Textures
  const [textures, setTextures] = useState<TextureResult[]>([]);

  // Calculate container dimensions from background or defaults
  useEffect(() => {
    if (bgUrl) {
      const img = new Image();
      img.onload = () => {
        const f = WIDTH / img.width;
        setContainerWidth(Math.floor(img.width * f));
        setContainerHeight(Math.floor(img.height * f));
      };
      img.src = bgUrl;
    } else {
      // Default 16:9 aspect ratio
      const f = WIDTH / 1920;
      setContainerWidth(Math.floor(1920 * f));
      setContainerHeight(Math.floor(1080 * f));
    }
  }, [bgUrl]);

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

  // Calculate interpolated events
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

  // Convert sections to textures
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

  // Cleanup textures on unmount
  useEffect(() => {
    return () => {
      clearTextureCache();
    };
  }, []);

  // Viewport dimensions for camera
  const viewportWidth = scoreRegion?.width ?? containerWidth;
  const viewportHeight = scoreRegion?.height ?? containerHeight;

  // Calculate scale to fit score within viewport height
  // Leave some padding (85% of viewport height)
  const fitScale = useMemo(() => {
    if (maxHeight <= 0 || viewportHeight <= 0) return 1;
    const targetHeight = viewportHeight * 0.85;
    return Math.min(targetHeight / maxHeight, 2); // Cap at 2x to prevent over-scaling
  }, [maxHeight, viewportHeight]);

  // Calculate vertical offset to center score within viewport
  const scaledHeight = maxHeight * fitScale;
  const yOffset = Math.max(0, (viewportHeight - scaledHeight) / 2);

  // Scaled total width for camera bounds
  const scaledTotalWidth = totalWidth * fitScale;

  // Calculate and apply static camera position when not playing
  // This centers the score horizontally within the viewport
  useEffect(() => {
    if (isPlaying) return; // Don't adjust during playback

    // Calculate centered position
    let newStaticX = 0;
    if (scaledTotalWidth < viewportWidth) {
      // Score is narrower than viewport - center it
      newStaticX = (viewportWidth - scaledTotalWidth) / 2;
    } else {
      // Score is wider than viewport - start at left edge
      newStaticX = 0;
    }

    staticCameraXRef.current = newStaticX;

    // Apply to container immediately
    if (cameraContainerRef.current) {
      cameraContainerRef.current.position.x = newStaticX;
    }
  }, [viewportWidth, scaledTotalWidth, isPlaying]);

  // Reset camera position when playback stops
  useEffect(() => {
    if (!isPlaying && cameraContainerRef.current) {
      cameraContainerRef.current.position.x = staticCameraXRef.current;
    }
  }, [isPlaying]);

  // Debug logging - check these values in console!
  console.log('[PixiSingleLineRenderer] DEBUG:', {
    viewportWidth,
    viewportHeight,
    maxHeight,
    fitScale,
    scaledHeight,
    yOffset,
    totalWidth,
    scaledTotalWidth,
    staticCameraX: staticCameraXRef.current,
    isPlaying,
    textureCount: textures.length,
    firstTextureSize: textures[0] ? { w: textures[0].width, h: textures[0].height } : null,
    sectionOffsets: sectionOffsets.slice(0, 3),
  });

  // Loading state
  if (!containerWidth || !containerHeight) {
    return <div className="text-neutral-400">Loading...</div>;
  }

  if (isLoading || textures.length === 0) {
    return <div className="text-neutral-400">Loading score...</div>;
  }

  return (
    <div>
      {/* Renderer container - matches SingleLineRenderer structure */}
      <div
        className="select-none pointer-events-none cursor-default"
        style={{
          position: 'relative',
          width: containerWidth,
          height: containerHeight,
          overflow: 'hidden',
        }}
      >
        {/* Background */}
        <div
          style={{
            width: containerWidth,
            height: containerHeight,
            display: 'flex',
            alignItems: 'center',
            backgroundImage: bgUrl ? `url(${bgUrl})` : undefined,
            backgroundSize: 'cover',
          }}
        >
          {/* Score region container */}
          <div
            style={{
              position: 'absolute',
              left: scoreRegion?.x ?? 0,
              top: scoreRegion?.y ?? 0,
              width: viewportWidth,
              height: viewportHeight,
              overflow: 'hidden',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            {/* PixiJS canvas */}
            <Application
              width={viewportWidth}
              height={viewportHeight}
              backgroundColor={0xffffff}
              backgroundAlpha={0}
            >
              <ContextLossHandler />
              <CameraController
                containerRef={cameraContainerRef}
                targetX={targetXRef.current * fitScale}
                viewportWidth={viewportWidth}
                scoreWidth={scaledTotalWidth}
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
                x={staticCameraXRef.current}
                y={yOffset}
              >
                {textures.map((result, index) => (
                  <pixiSprite
                    key={index}
                    texture={result.texture}
                    x={sectionOffsets[index] * fitScale}
                    y={0}
                    width={result.width * fitScale}
                    height={result.height * fitScale}
                  />
                ))}
              </pixiContainer>
            </Application>
          </div>
        </div>
      </div>

      {/* Transport controls - outside the renderer, in normal document flow */}
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
              // Reset camera to centered position
              if (cameraContainerRef.current) {
                cameraContainerRef.current.position.x = staticCameraXRef.current;
              }
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
