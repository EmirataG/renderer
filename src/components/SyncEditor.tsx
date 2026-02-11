import { useEffect, useRef, useState, useCallback } from 'react';
import { useVerovio } from '../hooks/useVerovio';
import { useSyncStore } from '../stores/syncStore';
import { extractTimemapEvents, type TimemapEvent } from '../lib/getEvents';
import { TimestampInput } from './TimestampInput';
import { interpolateTimestamps } from '../lib/interpolation';
import {
  initAnimationController,
  destroyAnimationController,
} from '../lib/animationController';
import type {} from '../types/global';

interface SyncEditorProps {
  xml: string;
  audioUrl?: string; // Audio URL for preview sync
  currentView: 'renderer' | 'sync';
  onViewChange: (view: 'renderer' | 'sync') => void;
}

// Format seconds to MM:SS.mmm display format
function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toFixed(2).padStart(5, '0')}`;
}

export function SyncEditor({ xml, audioUrl, currentView, onViewChange }: SyncEditorProps) {
  const scoreRef = useRef<HTMLDivElement>(null);
  const scoreContainerRef = useRef<HTMLDivElement>(null);
  const styleRef = useRef<HTMLStyleElement | null>(null);

  // Measure container width ONCE — Verovio must never re-render on resize
  const [containerWidth, setContainerWidth] = useState(0);
  useEffect(() => {
    const el = scoreContainerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setContainerWidth(Math.floor(entry.contentRect.width));
      ro.disconnect();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // SyncEditor maintains its own local events extracted from its own toolkit
  // (Verovio generates different IDs per toolkit instance, so we can't share with RegularRenderer)
  const [events, setEvents] = useState<TimemapEvent[]>([]);

  // Interpolated events with computed timestamps
  const [interpolatedEvents, setInterpolatedEvents] = useState<
    (TimemapEvent & { computedTimestamp: number; isAnchor: boolean })[]
  >([]);

  // Detect render mode from URL parameters
  const isRenderMode = typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('render') === 'true';

  // Audio playback state
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const animationRef = useRef<number | null>(null);
  const currentEventIndexRef = useRef(-1);

  // Zustand store
  const { anchors, selectedEventId, setAnchor, removeAnchor, selectEvent } = useSyncStore();

  // Verovio hook - renders score to SVG at container width
  const { svgPages, toolkit, isLoading } = useVerovio(xml, containerWidth || 800, 40);

  // Extract events from SyncEditor's own toolkit when SVG is ready
  // (Verovio generates different random IDs per toolkit, so SyncEditor must use its own)
  useEffect(() => {
    if (svgPages.length === 0 || !toolkit) return;

    const timemapEvents = extractTimemapEvents(toolkit);
    setEvents(timemapEvents);
  }, [svgPages, toolkit]);

  // Recalculate interpolated events when anchors change
  // Events come from shared eventStore cache (populated by RegularRenderer)
  useEffect(() => {
    if (events.length === 0) return;
    const interpolated = interpolateTimestamps(events, anchors);
    setInterpolatedEvents(interpolated);
  }, [events, anchors]);

  // Ref to store interpolated events for animation controller access
  const interpolatedEventsRef = useRef<typeof interpolatedEvents>([]);
  useEffect(() => {
    interpolatedEventsRef.current = interpolatedEvents;
  }, [interpolatedEvents]);

  // Expose animation controller on window for Puppeteer frame control
  useEffect(() => {
    // Need Verovio container to be ready
    // In render mode, we don't need audio element (Puppeteer controls frame position)
    // In normal mode, we need audio for preview playback
    if (!scoreRef.current || events.length === 0) {
      return;
    }

    // In normal mode, require audio element
    if (!isRenderMode && !audioRef.current) {
      return;
    }

    // Initialize animation controller
    // In render mode, audioElement can be null - we only use setFrame/setTimestamp
    const controller = initAnimationController({
      audioElement: isRenderMode ? null : audioRef.current,
      getInterpolatedEvents: () => interpolatedEventsRef.current,
      containerElement: scoreRef.current,
    });

    // Expose on window for Puppeteer access
    window.setAnimationFrame = (frame: number, fps: number = 30) => {
      controller.setFrame(frame, fps);
    };

    window.setAnimationTimestamp = (seconds: number) => {
      controller.setTimestamp(seconds);
    };

    window.getAnimationDuration = () => {
      return controller.getDuration();
    };

    window.isAnimationReady = () => true;

    // Cleanup on unmount
    return () => {
      destroyAnimationController();
      delete window.setAnimationFrame;
      delete window.setAnimationTimestamp;
      delete window.getAnimationDuration;
      delete window.isAnimationReady;
    };
  }, [toolkit, svgPages, events.length, isRenderMode]);

  // Handle click on score to select note
  const handleScoreClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    // Use event delegation to find clicked note
    const target = event.target as Element;
    const noteGroup = target.closest('g.note');

    if (!noteGroup) {
      // Clicked on empty space - deselect
      selectEvent(null);
      return;
    }

    const noteId = noteGroup.id;

    // Find matching event by svgIds
    const clickedEvent = events.find(evt =>
      evt.svgIds.some(id => id === noteId)
    );

    if (clickedEvent) {
      selectEvent(clickedEvent.id);
    }
  }, [events, selectEvent]);

  // Serialize anchors for proper dependency tracking (Maps don't trigger re-renders well)
  const anchorsKey = Array.from(anchors.entries()).map(([k, v]) => `${k}:${v}`).join(',');

  // CSS selectors for colorable SVG sub-elements within a note group
  const NOTE_SUB_SELECTORS = 'g.notehead use, g.stem path, g.stem use, g.dots ellipse, g.dots use';

  // Helper to generate CSS color rule for a set of SVG IDs
  const colorRule = (svgIds: string[], color: string): string => {
    return svgIds.map(svgId => {
      const e = CSS.escape(svgId);
      // Target note sub-elements + parent chord stems (via :has)
      return [
        `#${e} g.notehead use`,
        `#${e} g.stem path`,
        `#${e} g.stem use`,
        `#${e} g.dots ellipse`,
        `#${e} g.dots use`,
        `g.chord:has(#${e}) > g.stem path`,
        `g.chord:has(#${e}) > g.stem use`,
      ].join(', ');
    }).join(', ') + ` { fill: ${color}; stroke: ${color}; }`;
  };

  // Helper to apply inline color to note shapes (used ONLY for playback animation)
  const applyPlaybackColor = (svgIds: string[], color: string) => {
    if (!scoreRef.current) return;
    svgIds.forEach(svgId => {
      const noteGroup = scoreRef.current?.querySelector(`#${CSS.escape(svgId)}`);
      if (!noteGroup) return;
      const shapes = noteGroup.querySelectorAll<SVGGraphicsElement>(NOTE_SUB_SELECTORS);
      shapes.forEach(shape => {
        shape.style.fill = color;
        shape.style.stroke = color;
      });
      const chordGroup = noteGroup.closest('g.chord');
      if (chordGroup) {
        const chordStems = chordGroup.querySelectorAll<SVGGraphicsElement>('g.stem path, g.stem use');
        chordStems.forEach(stem => {
          stem.style.fill = color;
          stem.style.stroke = color;
        });
      }
    });
  };

  // Helper to clear inline playback color from note shapes
  const clearPlaybackColor = (svgIds: string[]) => {
    if (!scoreRef.current) return;
    svgIds.forEach(svgId => {
      const noteGroup = scoreRef.current?.querySelector(`#${CSS.escape(svgId)}`);
      if (!noteGroup) return;
      const shapes = noteGroup.querySelectorAll<SVGGraphicsElement>(NOTE_SUB_SELECTORS);
      shapes.forEach(shape => {
        shape.style.removeProperty('fill');
        shape.style.removeProperty('stroke');
      });
      const chordGroup = noteGroup.closest('g.chord');
      if (chordGroup) {
        const chordStems = chordGroup.querySelectorAll<SVGGraphicsElement>('g.stem path, g.stem use');
        chordStems.forEach(stem => {
          stem.style.removeProperty('fill');
          stem.style.removeProperty('stroke');
        });
      }
    });
  };

  // CSS-based coloring: generates stylesheet rules for anchors + selection.
  // CSS rules cascade into SVG elements regardless of when SVG DOM is created,
  // so this is immune to the timing bugs that plagued inline style approaches.
  // Playback (orange) uses inline styles which override CSS rules.
  useEffect(() => {
    if (!scoreRef.current) return;

    if (!styleRef.current) {
      styleRef.current = document.createElement('style');
      scoreRef.current.appendChild(styleRef.current);
    }

    let css = `
      svg.definition-scale { display: block; }
      g.note { cursor: pointer; }
      g.note:hover g.notehead use { filter: brightness(0.7); }
    `;

    // Anchor colors (green) — lower priority
    for (const [eventId] of anchors) {
      const event = events.find(e => e.id === eventId);
      if (event && event.svgIds.length > 0) {
        css += colorRule(event.svgIds, '#22c55e') + '\n';
      }
    }

    // Selection color (blue) — higher priority (appears later in stylesheet)
    if (selectedEventId) {
      const event = events.find(e => e.id === selectedEventId);
      if (event && event.svgIds.length > 0) {
        css += colorRule(event.svgIds, '#3b82f6') + '\n';
      }
    }

    styleRef.current.innerHTML = css;
  }, [events, anchors, anchorsKey, selectedEventId, svgPages]);

  // Keyboard navigation for efficient sync workflow
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't interfere with input fields
      if (e.target instanceof HTMLInputElement) return;

      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        // Select next event
        e.preventDefault();
        const currentIndex = events.findIndex(evt => evt.id === selectedEventId);
        const nextIndex = currentIndex < events.length - 1 ? currentIndex + 1 : 0;
        selectEvent(events[nextIndex]?.id ?? null);
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        // Select previous event
        e.preventDefault();
        const currentIndex = events.findIndex(evt => evt.id === selectedEventId);
        const prevIndex = currentIndex > 0 ? currentIndex - 1 : events.length - 1;
        selectEvent(events[prevIndex]?.id ?? null);
      } else if (e.key === 'Escape') {
        // Deselect
        selectEvent(null);
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        // Remove anchor from selected event
        if (selectedEventId && anchors.has(selectedEventId)) {
          e.preventDefault();
          const { removeAnchor } = useSyncStore.getState();
          removeAnchor(selectedEventId);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [events, selectedEventId, selectEvent, anchors]);

  // Audio sync animation loop
  useEffect(() => {
    if (!audioUrl || !audioRef.current) return;

    const audio = audioRef.current;

    const handleLoadedMetadata = () => {
      setAudioDuration(audio.duration);
    };

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
      currentEventIndexRef.current = -1;
    };

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [audioUrl]);

  // Ref to track currently playing svgIds for cleanup
  const playingSvgIdsRef = useRef<string[]>([]);

  // No getBaseColor needed — anchor/selection colors are CSS-based.
  // Playback just clears inline styles to let CSS rules show through.

  // Animation frame loop for syncing playback
  useEffect(() => {
    if (!isPlaying || interpolatedEvents.length === 0) {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      return;
    }

    const animate = () => {
      if (!audioRef.current || !scoreRef.current) return;

      const time = audioRef.current.currentTime;
      setCurrentTime(time);

      // Find current event based on interpolated timestamps
      let newEventIndex = -1;
      for (let i = interpolatedEvents.length - 1; i >= 0; i--) {
        if (interpolatedEvents[i].computedTimestamp <= time) {
          newEventIndex = i;
          break;
        }
      }

      // Update highlight if event changed
      if (newEventIndex !== currentEventIndexRef.current) {
        // Clear previous event's inline styles (CSS rule underneath shows through)
        if (currentEventIndexRef.current >= 0 && playingSvgIdsRef.current.length > 0) {
          clearPlaybackColor(playingSvgIdsRef.current);
        }

        // Apply playing color (orange) to new event via inline style (overrides CSS)
        if (newEventIndex >= 0) {
          const currentEvent = interpolatedEvents[newEventIndex];
          applyPlaybackColor(currentEvent.svgIds, '#f59e0b');
          playingSvgIdsRef.current = currentEvent.svgIds;
        } else {
          playingSvgIdsRef.current = [];
        }

        currentEventIndexRef.current = newEventIndex;
      } else if (newEventIndex >= 0 && playingSvgIdsRef.current.length > 0) {
        // Same event still playing - re-apply orange in case CSS update cleared it
        applyPlaybackColor(playingSvgIdsRef.current, '#f59e0b');
      }

      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
    };
  }, [isPlaying, interpolatedEvents]);

  // Update highlight on scrub (when not playing)
  const handleScrub = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
    }
    setCurrentTime(time);

    // Update highlight for scrubbed position
    if (interpolatedEvents.length > 0 && scoreRef.current) {
      let newEventIndex = -1;
      for (let i = interpolatedEvents.length - 1; i >= 0; i--) {
        if (interpolatedEvents[i].computedTimestamp <= time) {
          newEventIndex = i;
          break;
        }
      }

      // Clear previous event's inline styles (CSS rule underneath shows through)
      if (currentEventIndexRef.current >= 0 && playingSvgIdsRef.current.length > 0) {
        clearPlaybackColor(playingSvgIdsRef.current);
      }

      // Apply playing color (orange) to new event via inline style
      if (newEventIndex >= 0) {
        const currentEvent = interpolatedEvents[newEventIndex];
        applyPlaybackColor(currentEvent.svgIds, '#f59e0b');
        playingSvgIdsRef.current = currentEvent.svgIds;
      } else {
        playingSvgIdsRef.current = [];
      }

      currentEventIndexRef.current = newEventIndex;
    }
  }, [interpolatedEvents]);

  // Playback controls
  const togglePlayback = useCallback(() => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
  }, [isPlaying]);

  const resetPlayback = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setCurrentTime(0);
    setIsPlaying(false);

    // Clear inline playback styles (CSS rules show through)
    if (playingSvgIdsRef.current.length > 0) {
      clearPlaybackColor(playingSvgIdsRef.current);
    }

    currentEventIndexRef.current = -1;
    playingSvgIdsRef.current = [];
  }, [interpolatedEvents]);

  // Validate that a proposed anchor timestamp doesn't violate ordering
  // Returns true if valid, false if it would be out of order
  const validateAnchorTimestamp = useCallback((eventId: string, proposedTime: number): boolean => {
    // Find the event's position in the sorted interpolated events
    const eventIndex = interpolatedEvents.findIndex(e => e.id === eventId);
    if (eventIndex === -1) return false;

    // Find previous anchored event (scanning backward from eventIndex)
    for (let i = eventIndex - 1; i >= 0; i--) {
      const prevAnchor = anchors.get(interpolatedEvents[i].id);
      if (prevAnchor !== undefined) {
        if (proposedTime <= prevAnchor) return false; // Must be strictly after previous anchor
        break;
      }
    }

    // Find next anchored event (scanning forward from eventIndex)
    for (let i = eventIndex + 1; i < interpolatedEvents.length; i++) {
      const nextAnchor = anchors.get(interpolatedEvents[i].id);
      if (nextAnchor !== undefined) {
        if (proposedTime >= nextAnchor) return false; // Must be strictly before next anchor
        break;
      }
    }

    return true;
  }, [interpolatedEvents, anchors]);

  // Handle timestamp change for selected event
  const handleTimestampChange = useCallback((seconds: number) => {
    if (selectedEventId && validateAnchorTimestamp(selectedEventId, seconds)) {
      setAnchor(selectedEventId, seconds);
    }
  }, [selectedEventId, setAnchor, validateAnchorTimestamp]);

  // Get current selected event info
  const selectedEvent = selectedEventId
    ? interpolatedEvents.find(e => e.id === selectedEventId)
    : null;
  const selectedAnchorTime = selectedEventId ? anchors.get(selectedEventId) : undefined;

  return (
    <div className="flex flex-col h-full">
      {/* Hidden audio element */}
      {audioUrl && <audio ref={audioRef} src={audioUrl} preload="metadata" />}

      {/* Header with view toggle and selected note info */}
      <div className="flex-shrink-0 bg-black border-b border-neutral-800 px-4 py-3 flex items-center gap-4 h-14">
        {/* View toggle */}
        <div className="flex gap-0">
          <button
            onClick={() => onViewChange('renderer')}
            className={currentView === 'renderer' ? 'grunge-tab-active' : 'grunge-tab'}
          >
            Preview
          </button>
          <button
            onClick={() => onViewChange('sync')}
            className={currentView === 'sync' ? 'grunge-tab-active' : 'grunge-tab'}
          >
            Sync Editor
          </button>
        </div>

        <div className="w-px h-6 bg-neutral-600" />

        <div className="flex-1">
          {selectedEvent ? (
            <div className="flex items-center gap-4">
              <span className="text-sm text-neutral-300">
                Selected: <span className="font-mono text-white">{selectedEvent.id}</span>
                {' '}(beat {selectedEvent.beatOnset.toFixed(2)})
              </span>
              <div className="flex items-center gap-2">
                <span className="text-sm text-neutral-400">Timestamp:</span>
                <TimestampInput
                  value={selectedAnchorTime ?? selectedEvent.computedTimestamp}
                  onChange={handleTimestampChange}
                  className="grunge-input w-28"
                />
                {selectedEvent.isAnchor && selectedEventId ? (
                  <button
                    onClick={() => removeAnchor(selectedEventId)}
                    className="grunge-btn grunge-btn-sm text-red-400 border-red-400 hover:bg-red-400 hover:text-black"
                  >
                    Remove Anchor
                  </button>
                ) : (
                  <>
                    <button
                      onClick={() => {
                        if (selectedEventId) {
                          const time = selectedAnchorTime ?? selectedEvent.computedTimestamp;
                          if (validateAnchorTimestamp(selectedEventId, time)) {
                            setAnchor(selectedEventId, time);
                          }
                        }
                      }}
                      className="grunge-btn grunge-btn-sm"
                    >
                      Anchor
                    </button>
                    {audioUrl && !isPlaying && (
                      <button
                        onClick={() => {
                          if (selectedEventId && validateAnchorTimestamp(selectedEventId, currentTime)) {
                            setAnchor(selectedEventId, currentTime);
                          }
                        }}
                        className="grunge-btn grunge-btn-sm"
                      >
                        Anchor to Playhead
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          ) : (
            <span className="text-sm text-neutral-500">
              Click on a note to select it and set its timestamp
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <div
            className="text-xs text-neutral-500"
            title="Arrow keys: navigate | Delete: remove anchor | Esc: deselect"
          >
            Keys: arrows navigate | Del remove | Esc deselect
          </div>
          <div className="text-xs text-neutral-500">
            {anchors.size} anchor{anchors.size !== 1 ? 's' : ''} set
          </div>
        </div>
      </div>

      {/* Score display - full width */}
      <div
        ref={scoreContainerRef}
        className="flex-1 min-h-0 overflow-auto bg-white p-4"
        onClick={handleScoreClick}
      >
        <div ref={scoreRef} className="w-fit [&_svg]:max-w-none">
          {svgPages.map((svg, i) => (
            <div
              key={i}
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          ))}
        </div>
      </div>

      {/* Audio controls - always visible at bottom */}
      {audioUrl && (
        <div className="flex-shrink-0 bg-black border-t border-neutral-800 px-4 py-3">
          <div className="flex items-center gap-4">
            {/* Play/Pause button */}
            <button
              onClick={togglePlayback}
              className="grunge-btn w-12 h-12 flex items-center justify-center"
              title={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? (
                <svg className="w-7 h-7" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="4" width="4" height="16" />
                  <rect x="14" y="4" width="4" height="16" />
                </svg>
              ) : (
                <svg className="w-7 h-7" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="5,3 19,12 5,21" />
                </svg>
              )}
            </button>

            {/* Reset button */}
            <button
              onClick={resetPlayback}
              className="grunge-btn w-12 h-12 flex items-center justify-center"
              title="Reset"
            >
              <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="4" y="4" width="16" height="16" rx="2" />
              </svg>
            </button>

            {/* Time display */}
            <div className="font-mono text-sm text-neutral-300 w-28">
              {formatTime(currentTime)} / {formatTime(audioDuration)}
            </div>

            {/* Scrubber */}
            <div className="flex-1">
              <input
                type="range"
                min="0"
                max={audioDuration || 0}
                step="0.01"
                value={currentTime}
                onChange={handleScrub}
                className="grunge-range"
              />
            </div>

            {/* Current event indicator */}
            <div className="text-xs text-neutral-500 w-20 text-right">
              {currentEventIndexRef.current >= 0 ? (
                <span>Event {currentEventIndexRef.current}</span>
              ) : (
                <span>--</span>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
