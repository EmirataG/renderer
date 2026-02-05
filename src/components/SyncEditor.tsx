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
  const styleRef = useRef<HTMLStyleElement | null>(null);

  // SyncEditor maintains its own local events extracted from its own toolkit
  // (Verovio generates different IDs per toolkit instance, so we can't share with RegularRenderer)
  const [events, setEvents] = useState<TimemapEvent[]>([]);

  // Interpolated events with computed timestamps
  const [interpolatedEvents, setInterpolatedEvents] = useState<
    (TimemapEvent & { computedTimestamp: number; isAnchor: boolean })[]
  >([]);
  // Fixed width for score container - prevents re-renders on window resize
  const FIXED_SCORE_WIDTH = 1200;

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
  const { anchors, selectedEventId, setAnchor, selectEvent } = useSyncStore();

  // Verovio hook - renders score to SVG at fixed width
  const { svgPages, toolkit, isLoading } = useVerovio(xml, FIXED_SCORE_WIDTH, 40);

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

  // Selectors for all colorable note elements (noteheads, stems, dots)
  const NOTE_COLOR_SELECTORS = 'g.notehead use, g.stem path, g.stem use, g.dots ellipse, g.dots use';

  // Helper to apply color to note shapes (noteheads, stems, dots)
  const applyNoteColor = (svgIds: string[], color: string) => {
    if (!scoreRef.current) return;
    svgIds.forEach(svgId => {
      const noteGroup = scoreRef.current?.querySelector(`#${CSS.escape(svgId)}`);
      if (!noteGroup) return;
      // Color noteheads, stems, and dots
      const shapes = noteGroup.querySelectorAll<SVGGraphicsElement>(NOTE_COLOR_SELECTORS);
      shapes.forEach(shape => {
        shape.style.fill = color;
        shape.style.stroke = color;
        shape.style.color = color;
      });
      // Also check parent chord for shared stem
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

  // Helper to clear color from note shapes
  const clearNoteColor = (svgIds: string[]) => {
    if (!scoreRef.current) return;
    svgIds.forEach(svgId => {
      const noteGroup = scoreRef.current?.querySelector(`#${CSS.escape(svgId)}`);
      if (!noteGroup) return;
      const shapes = noteGroup.querySelectorAll<SVGGraphicsElement>(NOTE_COLOR_SELECTORS);
      shapes.forEach(shape => {
        shape.style.removeProperty('fill');
        shape.style.removeProperty('stroke');
        shape.style.removeProperty('color');
      });
      // Also clear parent chord stem
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

  // Track previous selection to avoid clearing all events on every change
  const prevSelectedIdRef = useRef<string | null>(null);

  // One-time setup: Create style element for hover effects
  useEffect(() => {
    if (!scoreRef.current) return;

    if (!styleRef.current) {
      styleRef.current = document.createElement('style');
      scoreRef.current.appendChild(styleRef.current);
    }

    styleRef.current.innerHTML = `
      svg.definition-scale {
        display: block;
      }
      g.note {
        cursor: pointer;
      }
      g.note:hover g.notehead use {
        filter: brightness(0.7);
      }
    `;
  }, [svgPages]); // Only re-run when SVG pages change

  // Apply anchor colors when anchors change (separate from selection)
  useEffect(() => {
    if (!scoreRef.current || events.length === 0) return;

    // Clear non-anchor, non-selected, non-playing events
    events.forEach(evt => {
      if (evt.id === selectedEventId) return; // Don't clear selected
      if (anchors.has(evt.id)) return; // Don't clear anchors
      if (playingSvgIdsRef.current.some(id => evt.svgIds.includes(id))) return; // Don't clear playing
      clearNoteColor(evt.svgIds);
    });

    // Apply anchor colors (green)
    for (const [eventId] of anchors) {
      if (eventId === selectedEventId) continue; // Selection overrides anchor
      const event = events.find(e => e.id === eventId);
      if (event) {
        applyNoteColor(event.svgIds, '#22c55e');
      }
    }
  }, [events, anchors, anchorsKey]);

  // Handle selection changes efficiently - only update changed events
  useEffect(() => {
    if (!scoreRef.current || events.length === 0) return;

    const prevId = prevSelectedIdRef.current;
    const newId = selectedEventId;

    // Clear previous selection (restore to base color)
    if (prevId && prevId !== newId) {
      const prevEvent = events.find(e => e.id === prevId);
      if (prevEvent) {
        if (anchors.has(prevId)) {
          applyNoteColor(prevEvent.svgIds, '#22c55e'); // Restore anchor color
        } else {
          clearNoteColor(prevEvent.svgIds); // Clear to default
        }
      }
    }

    // Apply new selection color (blue)
    if (newId) {
      const event = events.find(e => e.id === newId);
      if (event) {
        applyNoteColor(event.svgIds, '#3b82f6');
      }
    }

    // Re-apply playing color (orange) if needed
    if (currentEventIndexRef.current >= 0 && playingSvgIdsRef.current.length > 0) {
      applyNoteColor(playingSvgIdsRef.current, '#f59e0b');
    }

    prevSelectedIdRef.current = newId;
  }, [selectedEventId, events, anchors]);

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

  // Helper to get base color for an event (anchor=green, selected=blue, otherwise null)
  const getBaseColor = useCallback((eventId: string): string | null => {
    if (eventId === selectedEventId) return '#3b82f6'; // blue for selected
    if (anchors.has(eventId)) return '#22c55e'; // green for anchor
    return null;
  }, [selectedEventId, anchors]);

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
        // Restore previous event's base color
        if (currentEventIndexRef.current >= 0 && playingSvgIdsRef.current.length > 0) {
          const prevEvent = interpolatedEvents[currentEventIndexRef.current];
          if (prevEvent) {
            const baseColor = getBaseColor(prevEvent.id);
            if (baseColor) {
              applyNoteColor(prevEvent.svgIds, baseColor);
            } else {
              clearNoteColor(prevEvent.svgIds);
            }
          }
        }

        // Apply playing color (orange) to new event
        if (newEventIndex >= 0) {
          const currentEvent = interpolatedEvents[newEventIndex];
          applyNoteColor(currentEvent.svgIds, '#f59e0b');
          playingSvgIdsRef.current = currentEvent.svgIds;
        } else {
          playingSvgIdsRef.current = [];
        }

        currentEventIndexRef.current = newEventIndex;
      } else if (newEventIndex >= 0 && playingSvgIdsRef.current.length > 0) {
        // Same event still playing - re-apply orange in case other effects cleared it
        applyNoteColor(playingSvgIdsRef.current, '#f59e0b');
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
  }, [isPlaying, interpolatedEvents, getBaseColor]);

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

      // Restore previous event's base color
      if (currentEventIndexRef.current >= 0 && playingSvgIdsRef.current.length > 0) {
        const prevEvent = interpolatedEvents[currentEventIndexRef.current];
        if (prevEvent) {
          const baseColor = getBaseColor(prevEvent.id);
          if (baseColor) {
            applyNoteColor(prevEvent.svgIds, baseColor);
          } else {
            clearNoteColor(prevEvent.svgIds);
          }
        }
      }

      // Apply playing color (orange) to new event
      if (newEventIndex >= 0) {
        const currentEvent = interpolatedEvents[newEventIndex];
        applyNoteColor(currentEvent.svgIds, '#f59e0b');
        playingSvgIdsRef.current = currentEvent.svgIds;
      } else {
        playingSvgIdsRef.current = [];
      }

      currentEventIndexRef.current = newEventIndex;
    }
  }, [interpolatedEvents, getBaseColor]);

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

    // Restore previous event's base color
    if (currentEventIndexRef.current >= 0 && playingSvgIdsRef.current.length > 0) {
      const prevEvent = interpolatedEvents[currentEventIndexRef.current];
      if (prevEvent) {
        const baseColor = getBaseColor(prevEvent.id);
        if (baseColor) {
          applyNoteColor(prevEvent.svgIds, baseColor);
        } else {
          clearNoteColor(prevEvent.svgIds);
        }
      }
    }

    currentEventIndexRef.current = -1;
    playingSvgIdsRef.current = [];
  }, [interpolatedEvents, getBaseColor]);

  // Handle timestamp change for selected event
  const handleTimestampChange = useCallback((seconds: number) => {
    if (selectedEventId) {
      setAnchor(selectedEventId, seconds);
    }
  }, [selectedEventId, setAnchor]);

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
      <div className="flex-shrink-0 bg-black border-b border-neutral-800 px-4 py-3 flex items-center gap-4">
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
                {selectedEvent.isAnchor && (
                  <span className="text-xs border border-white text-white px-2 py-0.5 font-bold uppercase tracking-wider">
                    Anchor
                  </span>
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

      {/* Score display - fixed width with horizontal scroll */}
      <div
        className="flex-1 overflow-auto bg-white p-4"
        onClick={handleScoreClick}
      >
        <div ref={scoreRef} style={{ width: FIXED_SCORE_WIDTH, minWidth: FIXED_SCORE_WIDTH }}>
          {svgPages.map((svg, i) => (
            <div
              key={i}
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          ))}
        </div>
      </div>

      {/* Audio controls */}
      {audioUrl && (
        <div className="bg-black border-t border-neutral-800 px-4 py-3">
          <div className="flex items-center gap-4">
            {/* Play/Pause button */}
            <button
              onClick={togglePlayback}
              className="grunge-btn w-10 h-10 flex items-center justify-center"
              title={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? (
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="4" width="4" height="16" />
                  <rect x="14" y="4" width="4" height="16" />
                </svg>
              ) : (
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="5,3 19,12 5,21" />
                </svg>
              )}
            </button>

            {/* Reset button */}
            <button
              onClick={resetPlayback}
              className="grunge-btn grunge-btn-sm w-8 h-8 flex items-center justify-center"
              title="Reset"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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

      {/* Event list (optional - shows anchor status) */}
      <div className="bg-black border-t border-neutral-800 px-4 py-2 max-h-40 overflow-auto grunge-scrollbar">
        <div className="flex flex-wrap gap-1">
          {interpolatedEvents.slice(0, 50).map((evt) => (
            <button
              key={evt.id}
              onClick={() => selectEvent(evt.id)}
              className={`
                text-xs px-2 py-1 font-mono border
                ${evt.id === selectedEventId
                  ? 'bg-white text-black border-white font-bold'
                  : evt.isAnchor
                    ? 'bg-transparent text-white border-white'
                    : 'bg-transparent text-neutral-400 border-neutral-700 hover:border-neutral-500'
                }
              `}
              title={`Beat: ${evt.beatOnset.toFixed(2)} | Time: ${evt.computedTimestamp.toFixed(3)}s`}
            >
              {evt.id.replace('evt-', '')}
            </button>
          ))}
          {interpolatedEvents.length > 50 && (
            <span className="text-xs text-neutral-500 px-2 py-1">
              +{interpolatedEvents.length - 50} more
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
