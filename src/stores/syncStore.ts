import { create } from 'zustand';

interface SyncStore {
  // Anchors: eventId -> timestamp in seconds
  anchors: Map<string, number>;

  // Currently selected event for timestamp entry
  selectedEventId: string | null;

  // Actions
  setAnchor: (eventId: string, timestamp: number) => void;
  removeAnchor: (eventId: string) => void;
  selectEvent: (eventId: string | null) => void;
  clearAllAnchors: () => void;
}

export const useSyncStore = create<SyncStore>((set) => ({
  anchors: new Map(),
  selectedEventId: null,

  setAnchor: (eventId, timestamp) => set((state) => {
    const newAnchors = new Map(state.anchors);
    newAnchors.set(eventId, timestamp);
    return { anchors: newAnchors };
  }),

  removeAnchor: (eventId) => set((state) => {
    const newAnchors = new Map(state.anchors);
    newAnchors.delete(eventId);
    return { anchors: newAnchors };
  }),

  selectEvent: (eventId) => set({ selectedEventId: eventId }),

  clearAllAnchors: () => set({ anchors: new Map() }),
}));
