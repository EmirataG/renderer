import { create } from 'zustand';

export interface CachedEvent {
  id: string;            // e.g., "evt-0", "evt-1"
  beatOnset: number;     // Quarter-note-based timing (RealValue)
  beatDuration: number;  // Duration until next event
  svgIds: string[];      // Verovio note xml:id values
  positionSvgId?: string; // First SVG ID for position lookup (includes tied continuations)
  pageIndex: number;     // 0-based page index
  globalY: number;       // Y position in global coordinate space

  // Optional fields for horizontal rendering (single-line mode)
  sectionIndex?: number; // Which section contains this event (0-based)
  localX?: number;       // X position within the section SVG
  globalX?: number;      // Absolute X = sectionOffsets[sectionIndex] + localX

  // Tie chain fields for "use note duration" mode
  tiedContinuationIds?: string[]; // SVG IDs of tied continuation notes
  tiedStartIds?: string[];        // SVG IDs from svgIds that start tie chains
  noteDurationBeats?: number;     // Sounding duration of untied notes
  tiedNoteDurationBeats?: number; // Sounding duration of tied chain (when mixed)
}

interface EventStore {
  // Cached events array
  events: CachedEvent[];

  // Reference for invalidation check
  svgPagesRef: string[] | null;

  // Actions
  setEvents: (events: CachedEvent[], svgPagesRef: string[]) => void;
  invalidate: () => void;
}

export const useEventStore = create<EventStore>((set) => ({
  events: [],
  svgPagesRef: null,

  setEvents: (events, svgPagesRef) => {
    set({
      events,
      svgPagesRef,
    });
  },

  invalidate: () => {
    set({
      events: [],
      svgPagesRef: null,
    });
  },
}));
