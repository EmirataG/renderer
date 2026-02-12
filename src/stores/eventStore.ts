import { create } from 'zustand';

export interface CachedEvent {
  id: string;            // e.g., "evt-0", "evt-1"
  beatOnset: number;     // Quarter-note-based timing (RealValue)
  beatDuration: number;  // Duration until next event
  svgIds: string[];      // Verovio note xml:id values
  pageIndex: number;     // 0-based page index
  globalY: number;       // Y position in global coordinate space

  // Optional fields for horizontal rendering (single-line mode)
  sectionIndex?: number; // Which section contains this event (0-based)
  localX?: number;       // X position within the section SVG
  globalX?: number;      // Absolute X = sectionOffsets[sectionIndex] + localX
}

interface EventStore {
  // Cached events array
  events: CachedEvent[];

  // Reference for invalidation check
  svgPagesRef: string[] | null;

  // Lookup indices
  eventById: Map<string, CachedEvent>;
  eventsByPage: Map<number, CachedEvent[]>;

  // Actions
  setEvents: (events: CachedEvent[], svgPagesRef: string[]) => void;
  invalidate: () => void;
}

export const useEventStore = create<EventStore>((set) => ({
  events: [],
  svgPagesRef: null,
  eventById: new Map(),
  eventsByPage: new Map(),

  setEvents: (events, svgPagesRef) => {
    // Build eventById index
    const eventById = new Map<string, CachedEvent>();
    for (const event of events) {
      eventById.set(event.id, event);
    }

    // Build eventsByPage index
    const eventsByPage = new Map<number, CachedEvent[]>();
    for (const event of events) {
      const pageEvents = eventsByPage.get(event.pageIndex);
      if (pageEvents) {
        pageEvents.push(event);
      } else {
        eventsByPage.set(event.pageIndex, [event]);
      }
    }

    set({
      events,
      svgPagesRef,
      eventById,
      eventsByPage,
    });
  },

  invalidate: () => {
    set({
      events: [],
      svgPagesRef: null,
      eventById: new Map(),
      eventsByPage: new Map(),
    });
  },
}));
