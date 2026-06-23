import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useVerovio } from '../hooks/useVerovio';
import { useSyncStore } from '../stores/syncStore';
import { extractTimemapEvents, type TimemapEvent } from '../lib/getEvents';
import { TimestampInput } from './TimestampInput';
import { WaveformScrubber } from './WaveformScrubber';
import { interpolateTimestamps } from '../lib/interpolation';
import {
  initAnimationController,
  destroyAnimationController,
} from '../lib/animationController';
import type {} from '../types/global';

interface SyncEditorProps {
  xml: string;
  audioUrl?: string; // Audio URL for preview sync
}

// Format seconds to MM:SS.mmm display format
function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toFixed(2).padStart(5, '0')}`;
}

/**
 * Text node that tracks a ref value via its own rAF loop, OUTSIDE React.
 * Used for the time display and event indicator so the playback loop never
 * triggers React re-renders (a per-frame setState here used to re-render the
 * whole SyncEditor tree at 60fps).
 */
function RefText({
  valueRef,
  format,
  className,
}: {
  valueRef: React.RefObject<number>;
  format: (v: number) => string;
  className?: string;
}) {
  const elRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let raf: number;
    const tick = () => {
      const txt = format(valueRef.current ?? 0);
      if (elRef.current && elRef.current.textContent !== txt) {
        elRef.current.textContent = txt;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [valueRef, format]);
  return <span ref={elRef} className={className} />;
}

// CSS selectors for colorable SVG sub-elements within a note group
const NOTE_SUB_SELECTORS = 'g.notehead use, g.stem path, g.stem use, g.dots ellipse, g.dots use';

// Static highlight stylesheet. Anchored/selected coloring is class-driven
// (classes toggled on the current page's note groups) instead of generating
// per-anchor :has() selector rules — hundreds of :has() rules against a large
// SVG forced full style recalcs on every anchor/selection change.
// "Selected" rules come after "anchored" so they win at equal specificity.
const SYNC_EDITOR_CSS = `
  #sync-editor-score svg.definition-scale { display: block; }
  #sync-editor-score g.note { cursor: pointer; }
  #sync-editor-score g.note:hover g.notehead use { filter: brightness(0.7); }

  #sync-editor-score g.note.sync-anchored g.notehead use,
  #sync-editor-score g.note.sync-anchored g.stem path,
  #sync-editor-score g.note.sync-anchored g.stem use,
  #sync-editor-score g.note.sync-anchored g.dots ellipse,
  #sync-editor-score g.note.sync-anchored g.dots use,
  #sync-editor-score g.chord.sync-anchored > g.stem path,
  #sync-editor-score g.chord.sync-anchored > g.stem use {
    fill: #22c55e;
    stroke: #22c55e;
  }

  #sync-editor-score g.note.sync-selected g.notehead use,
  #sync-editor-score g.note.sync-selected g.stem path,
  #sync-editor-score g.note.sync-selected g.stem use,
  #sync-editor-score g.note.sync-selected g.dots ellipse,
  #sync-editor-score g.note.sync-selected g.dots use,
  #sync-editor-score g.chord.sync-selected > g.stem path,
  #sync-editor-score g.chord.sync-selected > g.stem use {
    fill: #3b82f6;
    stroke: #3b82f6;
  }
`;

export function SyncEditor({ xml, audioUrl }: SyncEditorProps) {
  const scoreRef = useRef<HTMLDivElement>(null);
  const scoreContainerRef = useRef<HTMLDivElement>(null);

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

  // Detect render mode from URL parameters
  const isRenderMode = typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('render') === 'true';

  // Audio playback state
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // State-backed mirror of the audio element: without per-frame re-renders,
  // children that receive the element as a prop (WaveformScrubber) would
  // otherwise never see it become non-null.
  const [audioEl, setAudioEl] = useState<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const currentTimeRef = useRef(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const animationRef = useRef<number | null>(null);
  const currentEventIndexRef = useRef(-1);

  // Zustand store (use selectors for proper reactivity with Map objects)
  const anchors = useSyncStore((state) => state.anchors);
  const selectedEventId = useSyncStore((state) => state.selectedEventId);
  const setAnchor = useSyncStore((state) => state.setAnchor);
  const removeAnchor = useSyncStore((state) => state.removeAnchor);
  const selectEvent = useSyncStore((state) => state.selectEvent);

  // Verovio hook - renders score to SVG at container width
  // Wait for real container width (avoid wasted render at fallback width)
  const { svgPages, pageCount, toolkit, isLoading } = useVerovio(xml, containerWidth, 40);

  // SyncEditor maintains its own events extracted from its own toolkit
  // (Verovio generates different IDs per toolkit instance, so we can't share
  // with the preview renderers). Derived, not state — no extra render cycle.
  const events: TimemapEvent[] = useMemo(() => {
    if (svgPages.length === 0 || !toolkit) return [];
    return extractTimemapEvents(toolkit);
  }, [svgPages, toolkit]);

  const eventById = useMemo(
    () => new Map(events.map((e) => [e.id, e])),
    [events],
  );

  // eventId → 0-based page index (drives page navigation and auto-follow).
  // getPageWithElement is a cheap WASM call; computed once per render cycle.
  const eventPageMap = useMemo(() => {
    const map = new Map<string, number>();
    if (!toolkit || svgPages.length === 0) return map;
    for (const evt of events) {
      const posId = evt.positionSvgId || evt.svgIds[0];
      if (!posId) continue;
      const pageNum = toolkit.getPageWithElement(posId);
      if (pageNum > 0) map.set(evt.id, pageNum - 1);
    }
    return map;
  }, [toolkit, svgPages, events]);

  // Interpolated events with computed timestamps (derived, not state)
  const interpolatedEvents = useMemo(
    () => interpolateTimestamps(events, anchors),
    [events, anchors],
  );

  // Ref mirror for the animation controller and rAF loop
  const interpolatedEventsRef = useRef<typeof interpolatedEvents>([]);
  interpolatedEventsRef.current = interpolatedEvents;

  /* ---------------- pagination ---------------- */

  const [currentPage, setCurrentPage] = useState(0);
  const currentPageRef = useRef(0);
  currentPageRef.current = currentPage;
  const [followPlayback, setFollowPlayback] = useState(true);
  const followPlaybackRef = useRef(true);
  followPlaybackRef.current = followPlayback;
  const [pageInput, setPageInput] = useState('1');

  // Clamp the page when the score changes/re-renders with fewer pages
  useEffect(() => {
    if (pageCount > 0 && currentPage > pageCount - 1) {
      setCurrentPage(pageCount - 1);
    }
  }, [pageCount, currentPage]);

  // Keep the page-number input in sync with the actual page
  useEffect(() => {
    setPageInput(String(currentPage + 1));
  }, [currentPage]);

  const goToPage = useCallback(
    (page: number) => {
      if (pageCount === 0) return;
      setCurrentPage(Math.max(0, Math.min(pageCount - 1, page)));
    },
    [pageCount],
  );

  // Reset scroll position when the page changes
  useEffect(() => {
    scoreContainerRef.current?.scrollTo(0, 0);
  }, [currentPage]);

  // When the selection moves to an event on another page (arrow-key
  // navigation across a page boundary), follow it.
  useEffect(() => {
    if (!selectedEventId) return;
    const pg = eventPageMap.get(selectedEventId);
    if (pg !== undefined) setCurrentPage((p) => (p === pg ? p : pg));
  }, [selectedEventId, eventPageMap]);

  /* ---------------- anchored/selected highlight classes ---------------- */

  // Toggle classes on the CURRENT page's note groups. Runs after the page's
  // innerHTML commit; cost is O(anchors on page), not O(score).
  useEffect(() => {
    const root = scoreRef.current;
    if (!root) return;

    root.querySelectorAll('.sync-anchored, .sync-selected').forEach((el) => {
      el.classList.remove('sync-anchored', 'sync-selected');
    });

    const apply = (eventId: string, cls: string) => {
      const evt = eventById.get(eventId);
      if (!evt) return;
      for (const id of evt.svgIds) {
        const el = root.querySelector(`#${CSS.escape(id)}`);
        if (!el) continue; // note lives on another page
        el.classList.add(cls);
        // Color the parent chord's stem too (replaces the old :has() rules)
        el.closest('g.chord')?.classList.add(cls);
      }
    };

    for (const [eventId] of anchors) apply(eventId, 'sync-anchored');
    if (selectedEventId) apply(selectedEventId, 'sync-selected');
  }, [anchors, selectedEventId, eventById, currentPage, svgPages]);

  /* ---------------- animation controller (Puppeteer/legacy) ---------------- */

  useEffect(() => {
    // Need Verovio container to be ready
    // In render mode, we don't need audio element (Puppeteer controls frame position)
    // In normal mode, we need audio for preview playback
    if (!scoreRef.current || events.length === 0) {
      return;
    }
    if (!isRenderMode && !audioEl) {
      return;
    }

    const controller = initAnimationController({
      audioElement: isRenderMode ? null : audioEl,
      getInterpolatedEvents: () => interpolatedEventsRef.current,
      containerElement: scoreRef.current,
    });

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

    return () => {
      destroyAnimationController();
      delete window.setAnimationFrame;
      delete window.setAnimationTimestamp;
      delete window.getAnimationDuration;
      delete window.isAnimationReady;
    };
  }, [toolkit, svgPages, events.length, isRenderMode, audioEl]);

  /* ---------------- note selection ---------------- */

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
      } else if (e.key === 'PageDown') {
        e.preventDefault();
        goToPage(currentPageRef.current + 1);
      } else if (e.key === 'PageUp') {
        e.preventDefault();
        goToPage(currentPageRef.current - 1);
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
  }, [events, selectedEventId, selectEvent, anchors, goToPage]);

  /* ---------------- audio + playback ---------------- */

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
      currentTimeRef.current = 0;
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
  }, [audioUrl, audioEl]);

  // Keep the audio element's playbackRate in sync with the selected speed.
  // Re-runs when the element is (re)created (audioEl) or the audio source
  // changes, so a slowed-down rate survives reloads.
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate, audioEl, audioUrl]);

  // Ref to track currently playing svgIds for cleanup
  const playingSvgIdsRef = useRef<string[]>([]);

  // Helper to apply inline color to note shapes (used ONLY for playback animation).
  // Inline styles override the class-based anchored/selected CSS.
  const applyPlaybackColor = (svgIds: string[], color: string) => {
    if (!scoreRef.current) return;
    svgIds.forEach(svgId => {
      const noteGroup = scoreRef.current?.querySelector(`#${CSS.escape(svgId)}`);
      if (!noteGroup) return; // note lives on another page
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

  // Animation frame loop for syncing playback. Writes only to refs and the
  // DOM — zero React renders per frame. Page auto-follow is the one state
  // update, and it only fires when the active event crosses a page boundary.
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
      currentTimeRef.current = time;

      // Binary search for the last event whose computedTimestamp <= time
      let newEventIndex = -1;
      let low = 0;
      let high = interpolatedEvents.length - 1;
      while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        if (interpolatedEvents[mid].computedTimestamp <= time) {
          newEventIndex = mid;
          low = mid + 1;
        } else {
          high = mid - 1;
        }
      }

      // Update highlight if event changed
      if (newEventIndex !== currentEventIndexRef.current) {
        // Clear previous event's inline styles (class CSS shows through)
        if (currentEventIndexRef.current >= 0 && playingSvgIdsRef.current.length > 0) {
          clearPlaybackColor(playingSvgIdsRef.current);
        }

        if (newEventIndex >= 0) {
          const currentEvent = interpolatedEvents[newEventIndex];
          // Auto-follow: switch pages when the active event crosses a boundary
          const pg = eventPageMap.get(currentEvent.id);
          if (
            followPlaybackRef.current &&
            pg !== undefined &&
            pg !== currentPageRef.current
          ) {
            setCurrentPage(pg);
            // The new page mounts on the next commit; the same-event re-apply
            // branch below recolors once the DOM is there.
          }
          applyPlaybackColor(currentEvent.svgIds, '#f59e0b');
          playingSvgIdsRef.current = currentEvent.svgIds;
        } else {
          playingSvgIdsRef.current = [];
        }

        currentEventIndexRef.current = newEventIndex;
      } else if (newEventIndex >= 0 && playingSvgIdsRef.current.length > 0) {
        // Same event still playing - re-apply orange in case a page mount or
        // class update cleared it
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
  }, [isPlaying, interpolatedEvents, eventPageMap]);

  // Shared seek logic: update audio time, highlight the event at that time,
  // and jump to its page
  const seekToTime = useCallback((time: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = time;
    }
    currentTimeRef.current = time;

    if (interpolatedEvents.length > 0 && scoreRef.current) {
      let newEventIndex = -1;
      let low = 0;
      let high = interpolatedEvents.length - 1;
      while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        if (interpolatedEvents[mid].computedTimestamp <= time) {
          newEventIndex = mid;
          low = mid + 1;
        } else {
          high = mid - 1;
        }
      }

      if (currentEventIndexRef.current >= 0 && playingSvgIdsRef.current.length > 0) {
        clearPlaybackColor(playingSvgIdsRef.current);
      }

      if (newEventIndex >= 0) {
        const currentEvent = interpolatedEvents[newEventIndex];
        const pg = eventPageMap.get(currentEvent.id);
        if (pg !== undefined) setCurrentPage((p) => (p === pg ? p : pg));
        applyPlaybackColor(currentEvent.svgIds, '#f59e0b');
        playingSvgIdsRef.current = currentEvent.svgIds;
      } else {
        playingSvgIdsRef.current = [];
      }

      currentEventIndexRef.current = newEventIndex;
    }
  }, [interpolatedEvents, eventPageMap]);

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
    currentTimeRef.current = 0;
    setIsPlaying(false);

    // Clear inline playback styles (class CSS shows through)
    if (playingSvgIdsRef.current.length > 0) {
      clearPlaybackColor(playingSvgIdsRef.current);
    }

    currentEventIndexRef.current = -1;
    playingSvgIdsRef.current = [];
  }, []);

  /* ---------------- anchor validation ---------------- */

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

  // Stable formatters for the ref-driven readouts
  const formatTimePair = useCallback(
    (t: number) => `${formatTime(t)} / ${formatTime(audioDuration)}`,
    [audioDuration],
  );
  const formatEventIndex = useCallback(
    (i: number) => (i >= 0 ? `Event ${i}` : '--'),
    [],
  );

  const commitPageInput = useCallback(() => {
    const n = parseInt(pageInput, 10);
    if (Number.isFinite(n)) goToPage(n - 1);
    else setPageInput(String(currentPage + 1));
  }, [pageInput, goToPage, currentPage]);

  return (
    <div className="flex flex-col h-full">
      <style dangerouslySetInnerHTML={{ __html: SYNC_EDITOR_CSS }} />
      {/* Hidden audio element */}
      {audioUrl && (
        <audio
          ref={(el) => {
            audioRef.current = el;
            setAudioEl(el);
          }}
          src={audioUrl}
          preload="metadata"
        />
      )}

      {/* Header with selected note info */}
      <div className="flex-shrink-0 bg-canvas border-b border-line px-4 py-3 flex items-center gap-4 h-14">
        <div className="flex-1">
          {selectedEvent ? (
            <div className="flex items-center gap-4">
              <span className="text-sm text-fg-muted">
                Selected: <span className="font-mono text-fg">{selectedEvent.id}</span>
                {' '}(beat {selectedEvent.beatOnset.toFixed(2)})
              </span>
              <div className="flex items-center gap-2">
                <span className="text-sm text-fg-muted">Timestamp:</span>
                <TimestampInput
                  value={selectedAnchorTime ?? selectedEvent.computedTimestamp}
                  onChange={handleTimestampChange}
                  className="grunge-input w-28"
                />
                {selectedEvent.isAnchor && selectedEventId ? (
                  <button
                    onClick={() => removeAnchor(selectedEventId)}
                    className="grunge-btn grunge-btn-sm text-red-400 border-red-400 hover:bg-red-400 hover:text-accent-fg"
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
                          if (selectedEventId && validateAnchorTimestamp(selectedEventId, currentTimeRef.current)) {
                            setAnchor(selectedEventId, currentTimeRef.current);
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
            <span className="text-sm text-fg-subtle">
              Click on a note to select it and set its timestamp
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <div
            className="text-xs text-fg-subtle"
            title="Arrow keys: navigate | PgUp/PgDn: page | Delete: remove anchor | Esc: deselect"
          >
            Keys: arrows navigate | PgUp/PgDn page | Del remove | Esc deselect
          </div>
          <div className="text-xs text-fg-subtle">
            {anchors.size} anchor{anchors.size !== 1 ? 's' : ''} set
          </div>
        </div>
      </div>

      {/* Page navigation bar */}
      <div className="flex-shrink-0 bg-canvas border-b border-line px-4 py-2 flex items-center gap-3">
        <button
          onClick={() => goToPage(currentPage - 1)}
          disabled={currentPage === 0 || pageCount === 0}
          className="grunge-btn grunge-btn-sm"
        >
          ◀ Prev
        </button>
        <div className="flex items-center gap-1.5 text-xs text-fg-muted">
          <span>Page</span>
          <input
            type="text"
            inputMode="numeric"
            value={pageInput}
            onChange={(e) => setPageInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                commitPageInput();
                (e.target as HTMLInputElement).blur();
              }
            }}
            onBlur={commitPageInput}
            className="grunge-input w-12 text-center tabular-nums"
            aria-label="Page number"
          />
          <span className="tabular-nums">/ {pageCount || 1}</span>
        </div>
        <button
          onClick={() => goToPage(currentPage + 1)}
          disabled={pageCount === 0 || currentPage >= pageCount - 1}
          className="grunge-btn grunge-btn-sm"
        >
          Next ▶
        </button>
        <div className="flex-1" />
        {audioUrl && (
          <label className="flex items-center gap-2 text-xs text-fg-muted cursor-pointer select-none">
            <input
              type="checkbox"
              checked={followPlayback}
              onChange={(e) => setFollowPlayback(e.target.checked)}
              className="grunge-checkbox"
            />
            Follow playback
          </label>
        )}
      </div>

      {/* Score display - ONE page at a time. Long scores used to mount every
          page's SVG here at once, which dominated the tab's memory. */}
      <div
        ref={scoreContainerRef}
        className="flex-1 min-h-0 overflow-auto bg-white p-4"
        onClick={handleScoreClick}
      >
        <div ref={scoreRef} id="sync-editor-score" style={containerWidth > 0 ? { width: containerWidth } : undefined}>
          {svgPages.length > 0 && (
            <div
              key={currentPage}
              dangerouslySetInnerHTML={{ __html: svgPages[Math.min(currentPage, svgPages.length - 1)] }}
            />
          )}
          {isLoading && (
            <div className="text-sm text-fg-muted p-8 text-center">Rendering score…</div>
          )}
        </div>
      </div>

      {/* Audio controls - always visible at bottom */}
      {audioUrl && (
        <div className="flex-shrink-0 bg-canvas border-t border-line px-4 py-3">
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

            {/* Playback speed — slow down to place anchors precisely */}
            <SpeedMenu value={playbackRate} onChange={setPlaybackRate} />

            {/* Time display — self-updating from ref, no per-frame renders */}
            <div className="font-mono text-sm text-fg-muted w-28">
              <RefText valueRef={currentTimeRef} format={formatTimePair} />
            </div>

            {/* Waveform Scrubber */}
            <div className="flex-1">
              <WaveformScrubber
                audioElement={audioEl}
                audioUrl={audioUrl!}
                duration={audioDuration}
                events={interpolatedEvents}
                onSeek={seekToTime}
                height={80}
              />
            </div>

            {/* Current event indicator — self-updating from ref */}
            <div className="text-xs text-fg-subtle w-20 text-right">
              <RefText valueRef={currentEventIndexRef} format={formatEventIndex} />
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

const SPEED_OPTIONS: { value: number; rate: string; label: string }[] = [
  { value: 1, rate: '1×', label: 'Normal' },
  { value: 0.5, rate: '0.5×', label: 'Slow' },
  { value: 0.25, rate: '0.25×', label: 'Slowest' },
  { value: 0.1, rate: '0.10×', label: 'Crawl' },
];

function SpeedMenu({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="h-12 flex items-center gap-2 border border-line-strong bg-canvas px-3 text-xs font-bold uppercase tracking-wider text-fg-muted hover:text-fg transition-colors tabular-nums"
        title="Playback speed"
      >
        <span>{value}×</span>
        <svg
          width="10"
          height="10"
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`transition-transform ${open ? 'rotate-180' : ''}`}
        >
          <polyline points="2,4 6,8 10,4" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 bottom-full mb-1 w-40 bg-canvas border-2 border-line-strong shadow-xl overflow-hidden z-20">
          {SPEED_OPTIONS.map((option) => (
            <button
              key={option.value}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
              className={`w-full flex items-baseline gap-2 px-3 py-2 text-xs font-bold uppercase tracking-wider transition-colors hover:bg-surface-muted ${
                option.value === value ? 'text-fg bg-surface' : 'text-fg-muted'
              }`}
            >
              <span className="w-12 shrink-0 tabular-nums">{option.rate}</span>
              <span>{option.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
