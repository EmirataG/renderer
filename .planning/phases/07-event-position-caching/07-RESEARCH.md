# Phase 7: Event Position Caching - Research

**Researched:** 2026-02-04
**Domain:** Zustand caching layer for musical events with eager Y position computation
**Confidence:** HIGH

## Summary

Phase 7 extracts and caches musical events once per score load, eliminating the redundant DOM queries that currently happen on every render. The cache stores timing data from Verovio's timemap API plus global Y positions computed from DOM measurements. This cached layer becomes the foundation for Phase 8 (virtual scrolling), which depends on having Y positions pre-computed while all pages are mounted.

The standard approach uses a dedicated Zustand store (`eventStore`) to hold the cached events, separate from the existing `syncStore` (which holds user-set anchors). Event extraction splits into two phases: Phase A extracts pure data from `renderToTimemap()` (no DOM needed), and Phase B computes Y positions from DOM measurements (requires all pages mounted). Both phases happen eagerly after `svgPages` render, triggered in a `requestAnimationFrame` callback -- the same timing pattern already proven in the codebase.

The cache invalidates automatically when `svgPages` reference changes, which already encodes all invalidation triggers (XML change, scale change, width change). No explicit hash or version tracking is needed -- Zustand's reference comparison handles invalidation naturally by storing the `svgPages` array reference alongside the cached events.

**Primary recommendation:** Create a new `eventStore` with an `extractEvents()` action called after Verovio rendering. Store events with `pageIndex` and `globalY` fields. Expose a `useEvents()` hook that returns cached events. RegularRenderer and SyncEditor both read from this shared cache.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| zustand | ^5.0.10 (installed) | Event cache store with reactive subscriptions | Already used for syncStore; Zustand v5 is stable and well-tested in this codebase |
| verovio | ^6.0.1 (installed) | `renderToTimemap()` for event timing, `getPageWithElement()` for page mapping | Already the core rendering engine; these APIs are already used in `getEventsFromVerovio()` |
| React | ^19.1.1 (installed) | Component lifecycle hooks for triggering extraction | Standard React patterns |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| TypeScript | ~5.9.3 (installed) | Type definitions for cached event structure | All event interfaces should be typed |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| New eventStore | Extend syncStore | syncStore is for user anchors; mixing cache data with user data creates unclear ownership. Separate stores have cleaner responsibilities. |
| Zustand store | useMemo in component | useMemo doesn't share between components; both RegularRenderer and SyncEditor need the same cache |
| Eager Y computation | Lazy Y computation | Lazy would require pages to be mounted on-demand; Phase 8 virtual scrolling will unmount pages, making lazy impossible |

**Installation:** No new packages needed.

## Architecture Patterns

### Recommended Project Structure

```
src/
  stores/
    syncStore.ts           # UNCHANGED - user anchors
    eventStore.ts          # NEW - cached events with Y positions
  lib/
    getEvents.ts           # MODIFY - extract timemap data (no Y), return CachedEvent[]
  hooks/
    useEvents.ts           # NEW - hook to access cached events
  renderers/
    RegularRenderer.tsx    # MODIFY - call eventStore.extractEvents() after render
  components/
    SyncEditor.tsx         # MODIFY - read from eventStore instead of local state
```

### Pattern 1: Separate Event Store

**What:** Create a dedicated Zustand store for cached events, separate from syncStore.
**When to use:** Always -- the event cache is distinct from user-defined anchors.

```typescript
// Source: Zustand best practices + codebase syncStore pattern
// stores/eventStore.ts
import { create } from 'zustand';

export interface CachedEvent {
  id: string;
  beatOnset: number;
  beatDuration: number;
  svgIds: string[];
  pageIndex: number;     // Which page (0-based) contains this event
  globalY: number;       // Y position in global coordinate space
}

interface EventStore {
  // Cache data
  events: CachedEvent[];
  svgPagesRef: string[] | null;  // Reference for invalidation check

  // Lookup indices (derived from events, computed once)
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
    // Build lookup indices
    const eventById = new Map<string, CachedEvent>();
    const eventsByPage = new Map<number, CachedEvent[]>();

    for (const event of events) {
      eventById.set(event.id, event);
      const pageEvents = eventsByPage.get(event.pageIndex) || [];
      pageEvents.push(event);
      eventsByPage.set(event.pageIndex, pageEvents);
    }

    set({ events, svgPagesRef, eventById, eventsByPage });
  },

  invalidate: () => set({
    events: [],
    svgPagesRef: null,
    eventById: new Map(),
    eventsByPage: new Map(),
  }),
}));
```

**Confidence:** HIGH - Based on existing syncStore pattern and Zustand best practices for Map usage.

### Pattern 2: Two-Phase Event Extraction

**What:** Split extraction into pure-data phase (timemap) and DOM-dependent phase (Y positions).
**When to use:** Always -- separates concerns and enables future optimization.

```typescript
// Source: Current getEventsFromVerovio() analysis + CONTEXT.md decision
// lib/getEvents.ts

// Phase A: Pure data extraction (no DOM needed)
export interface TimemapEvent {
  id: string;
  beatOnset: number;
  beatDuration: number;
  svgIds: string[];
}

export function extractTimemapEvents(toolkit: VerovioToolkit): TimemapEvent[] {
  const timemap = toolkit.renderToTimemap();
  const onsetEntries = timemap.filter(e => e.on && e.on.length > 0);

  const events: TimemapEvent[] = onsetEntries.map((entry, index) => ({
    id: `evt-${index}`,
    beatOnset: entry.qstamp / 4,
    beatDuration: 0,
    svgIds: entry.on!,
  }));

  // Calculate beat durations
  for (let i = 0; i < events.length - 1; i++) {
    events[i].beatDuration = events[i + 1].beatOnset - events[i].beatOnset;
  }
  if (events.length > 0) {
    events[events.length - 1].beatDuration = 1;
  }

  return events;
}

// Phase B: Add page assignments and Y positions (requires DOM)
export function computeEventPositions(
  timemapEvents: TimemapEvent[],
  toolkit: VerovioToolkit,
  pageContainers: HTMLElement[],
  pageOffsets: number[]
): CachedEvent[] {
  return timemapEvents.map(event => {
    let pageIndex = 0;
    let globalY = 0;

    if (event.svgIds.length > 0) {
      const pageNum = toolkit.getPageWithElement(event.svgIds[0]);
      if (pageNum > 0) {
        pageIndex = pageNum - 1;
        const container = pageContainers[pageIndex];

        if (container) {
          const noteEl = container.querySelector(`#${CSS.escape(event.svgIds[0])}`);
          if (noteEl) {
            const containerRect = container.getBoundingClientRect();
            const systemEl = noteEl.closest('g.system');

            if (systemEl) {
              const sysRect = systemEl.getBoundingClientRect();
              const localY = sysRect.top - containerRect.top + sysRect.height / 2;
              globalY = pageOffsets[pageIndex] + localY;
            } else {
              const noteRect = noteEl.getBoundingClientRect();
              const localY = noteRect.top - containerRect.top + noteRect.height / 2;
              globalY = pageOffsets[pageIndex] + localY;
            }
          }
        }
      }
    }

    return { ...event, pageIndex, globalY };
  });
}
```

**Confidence:** HIGH - This is essentially the existing `getEventsFromVerovio()` logic refactored into two phases.

### Pattern 3: Eager Extraction in requestAnimationFrame

**What:** Trigger extraction in rAF callback after svgPages render, same pattern as current implementation.
**When to use:** Always -- ensures DOM is ready for measurements.

```typescript
// Source: Current RegularRenderer.tsx lines 215-246 pattern
// In RegularRenderer.tsx useEffect watching svgPages

useEffect(() => {
  if (svgPages.length === 0 || !osmdRef.current || !toolkit) return;

  // Check if we need to re-extract (svgPages reference changed)
  const currentRef = useEventStore.getState().svgPagesRef;
  if (currentRef === svgPages) {
    // Cache is still valid, skip extraction
    return;
  }

  requestAnimationFrame(() => {
    if (!osmdRef.current || !toolkit) return;

    // Verify DOM is ready
    const verovioSvg = osmdRef.current.querySelector('svg.definition-scale');
    if (!verovioSvg) return;

    // Phase A: Extract timemap (pure data)
    const timemapEvents = extractTimemapEvents(toolkit);

    // Phase B: Compute positions (requires DOM)
    const containers = pageContainerRefs.current.filter(
      (c): c is HTMLDivElement => c !== null
    );
    const cachedEvents = computeEventPositions(
      timemapEvents,
      toolkit,
      containers,
      pageOffsets
    );

    // Store in cache
    useEventStore.getState().setEvents(cachedEvents, svgPages);
  });
}, [svgPages, toolkit, pageOffsets]);
```

**Confidence:** HIGH - Uses proven rAF pattern from existing codebase.

### Pattern 4: Invalidation via Reference Comparison

**What:** Cache invalidates when `svgPages` array reference changes.
**When to use:** Always -- this is the natural invalidation trigger.

```typescript
// Source: CONTEXT.md decision + Zustand reference comparison behavior
// The key insight: Zustand triggers re-renders when state references change.
// We store the svgPages array reference alongside cached events.
// When svgPages changes (new reference), the comparison fails and
// extraction re-runs.

// In component:
const svgPagesRef = useEventStore((state) => state.svgPagesRef);
const cacheValid = svgPagesRef === svgPages;

// If !cacheValid, the useEffect triggers extraction
```

**Confidence:** HIGH - Standard Zustand pattern; same approach used for syncStore anchors.

### Pattern 5: Shared Cache Between Components

**What:** Both RegularRenderer and SyncEditor read from the same eventStore.
**When to use:** Always -- eliminates duplicate extraction.

```typescript
// Source: CONTEXT.md decision + Zustand global store pattern
// RegularRenderer extracts and caches (it renders first with full DOM)
// SyncEditor reads from cache (no extraction needed)

// In SyncEditor.tsx:
const events = useEventStore((state) => state.events);

// SyncEditor may trigger extraction if it renders before RegularRenderer
// (e.g., if user goes directly to sync tab), but the extraction logic
// is the same -- whichever component renders first populates the cache.
```

**Confidence:** HIGH - Zustand's global store pattern inherently supports this.

### Anti-Patterns to Avoid

- **Storing computed Y in component state:** This causes re-extraction on every render. Use Zustand store for persistence across renders.

- **Computing lookup indices on every access:** Build `eventById` and `eventsByPage` maps once in `setEvents()`, not in selectors. Selectors should return pre-computed data.

- **Using useEffect for cache invalidation:** Let the svgPages reference comparison handle invalidation naturally. Don't add explicit invalidation calls scattered through the code.

- **Mutating Map/Set in place:** Zustand detects changes via reference comparison. Always create new Map instances: `new Map(state.eventById).set(...)`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Event-to-page mapping | Manual page boundary calculation | `toolkit.getPageWithElement(xmlId)` | Verovio knows its own layout; manual calculation is fragile |
| Cache invalidation detection | Hash-based change detection | Reference comparison of svgPages array | Simpler; svgPages already encodes all state |
| Global coordinate computation | Viewport-relative calculations | `pageOffsets[pageIndex] + localY` | Phase 6 pattern; already proven to work |
| Event lookup by ID | Linear search through events array | Pre-computed `eventById` Map | O(1) vs O(n) lookup |

**Key insight:** The Verovio toolkit and React's referential equality already solve the hard problems. The cache is just a thin layer that stores results and provides efficient lookup.

## Common Pitfalls

### Pitfall 1: Race Condition Between Render and Extraction

**What goes wrong:** Extraction starts before all page containers are in DOM, causing missing Y positions.
**Why it happens:** React's commit phase updates DOM, but useEffect fires after. If page containers aren't all refs yet, extraction fails.
**How to avoid:** Use requestAnimationFrame to wait for browser paint, then verify DOM elements exist before extraction. The existing pattern in RegularRenderer already handles this correctly.
**Warning signs:** Some events have `globalY: 0` while others have correct values.

### Pitfall 2: Stale Cache After Scale Change

**What goes wrong:** Events show old Y positions after user changes scale slider.
**Why it happens:** Scale change triggers Verovio re-render, producing new svgPages array. If the cache reference comparison fails to detect this, stale data is used.
**How to avoid:** Ensure svgPages reference actually changes on re-render (it does -- useVerovio creates new array). Store the reference in eventStore and compare on every render.
**Warning signs:** Camera scrolls to wrong positions after scale change; Y positions don't match visual layout.

### Pitfall 3: SyncEditor Cache Miss

**What goes wrong:** SyncEditor shows no events because it doesn't have page containers for extraction.
**Why it happens:** SyncEditor's simpler rendering (no page-aware containers) means it can't run the full extraction with Y positions.
**How to avoid:** SyncEditor doesn't need globalY -- it's user-scrolled, not camera-driven. Provide a simplified extraction path that only needs timemap data, or have SyncEditor wait for RegularRenderer to populate the cache.
**Warning signs:** Events work in preview but not in sync editor.

**Recommendation:** SyncEditor should read from the shared cache. If cache is empty (user navigates directly to sync tab), SyncEditor can trigger extraction with a simplified path that sets `globalY: 0` for all events. This works because SyncEditor doesn't use Y positions for camera scrolling.

### Pitfall 4: Map Mutation Without New Reference

**What goes wrong:** Updates to eventById or eventsByPage don't trigger re-renders.
**Why it happens:** Zustand compares references. Mutating a Map in place (`map.set(...)`) doesn't create a new reference.
**How to avoid:** Always create new Map instances: `new Map(existingMap).set(key, value)`. In this phase, the maps are computed once in setEvents and never mutated, so this is low risk.
**Warning signs:** Console shows updated state but components don't re-render.

### Pitfall 5: Circular Dependency Between Stores

**What goes wrong:** eventStore imports from syncStore or vice versa, causing module resolution issues.
**Why it happens:** Desire to compute interpolated events inside the store.
**How to avoid:** Keep stores independent. Interpolation (which combines events + anchors) happens in components or in a separate utility, not in either store. The existing `interpolateTimestamps()` function already handles this correctly.
**Warning signs:** Import errors or "cannot access before initialization" at runtime.

## Code Examples

### Complete eventStore Implementation

```typescript
// Source: Zustand v5 patterns + syncStore pattern + CONTEXT.md structure
// stores/eventStore.ts
import { create } from 'zustand';

export interface CachedEvent {
  id: string;
  beatOnset: number;
  beatDuration: number;
  svgIds: string[];
  pageIndex: number;
  globalY: number;
}

interface EventStoreState {
  events: CachedEvent[];
  svgPagesRef: string[] | null;
  eventById: Map<string, CachedEvent>;
  eventsByPage: Map<number, CachedEvent[]>;
}

interface EventStoreActions {
  setEvents: (events: CachedEvent[], svgPagesRef: string[]) => void;
  invalidate: () => void;
  getEventById: (id: string) => CachedEvent | undefined;
  getEventsForPage: (pageIndex: number) => CachedEvent[];
  getEventAtTimestamp: (events: CachedEvent[], timestamp: number) => CachedEvent | null;
}

type EventStore = EventStoreState & EventStoreActions;

export const useEventStore = create<EventStore>((set, get) => ({
  // State
  events: [],
  svgPagesRef: null,
  eventById: new Map(),
  eventsByPage: new Map(),

  // Actions
  setEvents: (events, svgPagesRef) => {
    const eventById = new Map<string, CachedEvent>();
    const eventsByPage = new Map<number, CachedEvent[]>();

    for (const event of events) {
      eventById.set(event.id, event);

      if (!eventsByPage.has(event.pageIndex)) {
        eventsByPage.set(event.pageIndex, []);
      }
      eventsByPage.get(event.pageIndex)!.push(event);
    }

    set({ events, svgPagesRef, eventById, eventsByPage });
  },

  invalidate: () => set({
    events: [],
    svgPagesRef: null,
    eventById: new Map(),
    eventsByPage: new Map(),
  }),

  // Getters (for non-reactive access)
  getEventById: (id) => get().eventById.get(id),

  getEventsForPage: (pageIndex) => get().eventsByPage.get(pageIndex) || [],

  // Utility: find event at timestamp (for playback)
  getEventAtTimestamp: (events, timestamp) => {
    // Binary search would be faster, but linear is fine for <1000 events
    for (let i = events.length - 1; i >= 0; i--) {
      // Note: This uses beatOnset, not computedTimestamp
      // For interpolated timestamps, use interpolateTimestamps() first
      if (events[i].beatOnset <= timestamp) {
        return events[i];
      }
    }
    return null;
  },
}));
```

### useEvents Hook

```typescript
// Source: Zustand selector pattern + codebase convention
// hooks/useEvents.ts
import { useEventStore } from '../stores/eventStore';
import type { CachedEvent } from '../stores/eventStore';

/**
 * Hook to access cached events from the event store.
 * Returns events array and cache validity status.
 */
export function useEvents(svgPages: string[]): {
  events: CachedEvent[];
  cacheValid: boolean;
} {
  const events = useEventStore((state) => state.events);
  const svgPagesRef = useEventStore((state) => state.svgPagesRef);

  const cacheValid = svgPagesRef === svgPages && events.length > 0;

  return { events, cacheValid };
}

/**
 * Hook to get a specific event by ID.
 */
export function useEventById(eventId: string): CachedEvent | undefined {
  return useEventStore((state) => state.eventById.get(eventId));
}

/**
 * Hook to get all events on a specific page.
 */
export function useEventsForPage(pageIndex: number): CachedEvent[] {
  return useEventStore((state) => state.eventsByPage.get(pageIndex) || []);
}
```

### Extraction Trigger in RegularRenderer

```typescript
// Source: Current RegularRenderer useEffect pattern + new eventStore
// In RegularRenderer.tsx

import { useEventStore } from '../stores/eventStore';
import { extractTimemapEvents, computeEventPositions } from '../lib/getEvents';

// Inside component:
const setEvents = useEventStore((state) => state.setEvents);
const cachedSvgPagesRef = useEventStore((state) => state.svgPagesRef);

useEffect(() => {
  if (svgPages.length === 0 || !osmdRef.current || !toolkit) return;

  // Skip if cache is valid
  if (cachedSvgPagesRef === svgPages) return;

  requestAnimationFrame(() => {
    if (!osmdRef.current || !toolkit) return;

    const verovioSvg = osmdRef.current.querySelector('svg.definition-scale');
    if (!verovioSvg) {
      console.warn('[RegularRenderer] Verovio SVG not found in DOM after rAF');
      return;
    }

    // Reset noteheads (existing behavior)
    resetNoteheadAnimations(osmdRef.current);

    // Extract and cache events
    const timemapEvents = extractTimemapEvents(toolkit);
    const containers = pageContainerRefs.current.filter(
      (c): c is HTMLDivElement => c !== null
    );
    const cachedEvents = computeEventPositions(
      timemapEvents,
      toolkit,
      containers,
      pageOffsets
    );

    setEvents(cachedEvents, svgPages);
  });

  // Camera starts at top
  currentYRef.current = 0;
  applyCamera(0);
}, [svgPages, toolkit, pageOffsets, cachedSvgPagesRef, setEvents]);
```

### Backward-Compatible getEventsFromVerovio

```typescript
// Source: CONTEXT.md decision for backward compatibility
// The existing function signature is preserved for SyncEditor compatibility

export function getEventsFromVerovio(
  toolkit: VerovioToolkit,
  svgContainer: HTMLElement,
  pageContainers?: HTMLElement[],
  pageOffsets?: number[]
): MusicalEventWithY[] {
  // If page-aware parameters provided, use two-phase extraction
  if (pageContainers && pageOffsets && pageContainers.length > 0) {
    const timemapEvents = extractTimemapEvents(toolkit);
    const cached = computeEventPositions(
      timemapEvents,
      toolkit,
      pageContainers,
      pageOffsets
    );
    // Convert CachedEvent to MusicalEventWithY for backward compatibility
    return cached.map(e => ({
      id: e.id,
      beatOnset: e.beatOnset,
      beatDuration: e.beatDuration,
      svgIds: e.svgIds,
      x: 0,
      y: e.globalY,
    }));
  }

  // Single-container path (SyncEditor backward compatibility)
  // ... existing implementation unchanged ...
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Extract events on every render | Extract once, cache in Zustand store | This phase | Eliminates redundant DOM queries |
| Y positions computed in component state | Y positions in global cache | This phase | Shared between components |
| No page assignment tracking | `pageIndex` stored per event | This phase | Enables O(1) page lookup for Phase 8 |
| Reference-based invalidation | Same pattern, now explicit | This phase | Clear invalidation semantics |

**Still valid:**
- `renderToTimemap()` API usage unchanged
- `getPageWithElement()` API usage unchanged
- `g.system` DOM queries for Y positions unchanged
- `interpolateTimestamps()` function unchanged (operates on cached events)
- CSS `translateY` camera mechanism unchanged

## Open Questions

1. **SyncEditor extraction timing**
   - What we know: SyncEditor doesn't render page-aware containers (no pageContainerRefs)
   - What's unclear: Should SyncEditor trigger extraction with simplified Y computation, or wait for RegularRenderer?
   - Recommendation: SyncEditor reads from cache. If cache is empty and toolkit is available, SyncEditor can call `extractTimemapEvents()` only (no Y positions needed for user-scrolled view). This is an edge case -- normally RegularRenderer renders first.

2. **Large score performance**
   - What we know: Extraction involves one DOM query per event. A 1000-event score means 1000 `querySelector` calls.
   - What's unclear: Whether this causes noticeable lag on initial load.
   - Recommendation: Benchmark with large scores. If needed, batch DOM queries using `querySelectorAll` for all events on each page, then match by ID. This is an optimization for Phase 7 if needed, not a blocker.

3. **useLayoutEffect vs requestAnimationFrame**
   - What we know: Current code uses rAF; useLayoutEffect runs before paint but is synchronous.
   - What's unclear: Whether useLayoutEffect would be more reliable for ensuring DOM is ready.
   - Recommendation: Keep rAF pattern -- it's already working. useLayoutEffect can block rendering; rAF lets the browser paint first, which is fine since we're caching for future use, not for immediate display.

## Sources

### Primary (HIGH confidence)
- [Zustand GitHub Repository](https://github.com/pmndrs/zustand) - Official v5 patterns and API
- [Zustand Map and Set Usage](https://zustand.docs.pmnd.rs/guides/maps-and-sets-usage) - Reference comparison with Map/Set
- [Zustand Slices Pattern](https://zustand.docs.pmnd.rs/guides/slices-pattern) - Single vs multiple stores guidance
- [Zustand create API](https://zustand.docs.pmnd.rs/apis/create) - TypeScript usage with `create<State>()`
- Codebase analysis: `syncStore.ts`, `getEvents.ts`, `RegularRenderer.tsx`, `SyncEditor.tsx`, `interpolation.ts`
- Phase 6 research (`.planning/phases/06-paginated-rendering-and-camera/06-RESEARCH.md`) - Page offset and Y computation patterns

### Secondary (MEDIUM confidence)
- [TkDodo's Zustand Guide](https://tkdodo.eu/blog/working-with-zustand) - Best practices for store organization
- [Brainhub Zustand Architecture](https://brainhub.eu/library/zustand-architecture-patterns-at-scale) - Large-scale patterns
- [useLayoutEffect vs requestAnimationFrame](https://blog.jakuba.net/request-animation-frame-and-use-effect-vs-use-layout-effect/) - DOM timing analysis

### Tertiary (LOW confidence)
- WebSearch results on Zustand v5 caching patterns - General guidance, not Verovio-specific

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Zustand v5 is installed and working; patterns verified against official docs
- Architecture: HIGH - Based on existing codebase patterns (syncStore, getEventsFromVerovio)
- Pitfalls: HIGH - Derived from Zustand documentation and existing codebase analysis
- Code examples: MEDIUM-HIGH - Patterns are verified but untested; exact implementation may need adjustment

**Research date:** 2026-02-04
**Valid until:** 2026-03-04 (30 days; Zustand and Verovio APIs are stable)
