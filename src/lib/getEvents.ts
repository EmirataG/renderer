import type { VerovioToolkit } from "verovio/esm";
import type { CachedEvent } from "../stores/eventStore";

export interface MusicalEvent {
  id: string;
  beatOnset: number;
  beatDuration: number;
  svgIds: string[];
  x: number; // Local x within segment
  globalX?: number; // Global x across entire score (for segmented rendering)
  segmentId?: string; // Which segment owns this event (for segmented rendering)
}

// Extended event interface with Y position for vertical camera scrolling
export interface MusicalEventWithY extends MusicalEvent {
  y: number;
}

/**
 * Extract musical events from Verovio's timemap API and DOM positions.
 *
 * Prerequisites:
 * - toolkit.renderToSVG() must have been called (SVG in DOM)
 * - toolkit.renderToMIDI() must have been called (populates timing data)
 *
 * @param toolkit - Verovio toolkit instance with loaded and rendered score
 * @param svgContainer - DOM element containing the rendered Verovio SVG
 * @returns Array of musical events with Y positions for camera scrolling
 */
export function getEventsFromVerovio(
  toolkit: VerovioToolkit,
  svgContainer: HTMLElement,
  pageContainers?: HTMLElement[],
  pageOffsets?: number[]
): MusicalEventWithY[] {
  // Get the full timemap from Verovio (rests excluded by default)
  const timemap = toolkit.renderToTimemap();

  // Filter to note onset entries only (entries with `on` array)
  const onsetEntries = timemap.filter(
    (entry) => entry.on && entry.on.length > 0
  );

  // Build MusicalEvent array from onset entries
  const events: MusicalEventWithY[] = onsetEntries.map((entry, index) => ({
    id: `evt-${index}`,
    beatOnset: entry.qstamp / 4, // Convert quarter-note units to whole-note fractions (RealValue convention)
    beatDuration: 0, // Calculated below
    svgIds: entry.on!, // Verovio note xml:id values match SVG DOM id attributes directly
    x: 0, // Not used for vertical camera scrolling
    y: 0, // Calculated below from DOM
  }));

  // Calculate beatDuration for each event
  for (let i = 0; i < events.length - 1; i++) {
    events[i].beatDuration = events[i + 1].beatOnset - events[i].beatOnset;
  }
  if (events.length > 0) {
    events[events.length - 1].beatDuration = 1; // Last event convention
  }

  if (pageContainers && pageOffsets && pageContainers.length > 0) {
    // Page-aware Y computation: use Verovio API to find which page each
    // event lives on, then compute global Y as pageOffset + localY.
    for (const event of events) {
      if (event.svgIds.length === 0) continue;

      // Use Verovio API to find which page this event is on (1-based)
      const pageNum = toolkit.getPageWithElement(event.svgIds[0]);
      if (pageNum === 0) continue; // Element not found

      const pageIndex = pageNum - 1;
      const container = pageContainers[pageIndex];
      if (!container) continue;

      const containerRect = container.getBoundingClientRect();
      const noteEl = container.querySelector(`#${CSS.escape(event.svgIds[0])}`);
      if (!noteEl) continue;

      const systemEl = noteEl.closest('g.system');
      if (systemEl) {
        const sysRect = systemEl.getBoundingClientRect();
        const localY = sysRect.top - containerRect.top + sysRect.height / 2;
        event.y = pageOffsets[pageIndex] + localY;
      } else {
        const noteRect = noteEl.getBoundingClientRect();
        const localY = noteRect.top - containerRect.top + noteRect.height / 2;
        event.y = pageOffsets[pageIndex] + localY;
      }
    }
  } else {
    // Single-container Y computation (backward-compatible path for SyncEditor)
    // Build a map from g.system element to its center Y position.
    // Verovio wraps each staff system in a <g class="system"> — use that
    // directly instead of guessing with threshold heuristics.
    const containerRect = svgContainer.getBoundingClientRect();
    const systemEls = svgContainer.querySelectorAll('g.system');
    const systemCenterYMap = new Map<Element, number>();
    for (const sysEl of systemEls) {
      const sysRect = sysEl.getBoundingClientRect();
      systemCenterYMap.set(sysEl, sysRect.top - containerRect.top + sysRect.height / 2);
    }

    // For each event, walk up from the note element to its parent g.system
    // and assign that system's center Y. All events in the same system get
    // the exact same Y — camera stays perfectly still within a system.
    for (const event of events) {
      if (event.svgIds.length > 0) {
        const noteEl = svgContainer.querySelector(
          `#${CSS.escape(event.svgIds[0])}`
        );
        if (noteEl) {
          const systemEl = noteEl.closest('g.system');
          if (systemEl && systemCenterYMap.has(systemEl)) {
            event.y = systemCenterYMap.get(systemEl)!;
          } else {
            // Fallback: use note's own position
            const noteRect = noteEl.getBoundingClientRect();
            event.y = noteRect.top - containerRect.top + noteRect.height / 2;
          }
        }
      }
    }
  }

  return events;
}

// ============================================================================
// Two-phase extraction functions for event caching
// ============================================================================

/**
 * Intermediate event type from timemap extraction (no DOM dependency).
 */
export interface TimemapEvent {
  id: string;
  beatOnset: number;
  beatDuration: number;
  svgIds: string[];
}

/**
 * Phase 1: Extract events from Verovio's timemap API (no DOM dependency).
 *
 * This function is pure and can be called immediately after loading MEI data.
 * It extracts timing and note ID information without requiring rendered SVG.
 *
 * Prerequisites:
 * - toolkit.loadData() must have been called
 * - toolkit.renderToMIDI() must have been called (populates timing data)
 *
 * @param toolkit - Verovio toolkit instance with loaded score
 * @returns Array of timemap events (no position data yet)
 */
export function extractTimemapEvents(toolkit: VerovioToolkit): TimemapEvent[] {
  // Get the full timemap from Verovio (rests excluded by default)
  const timemap = toolkit.renderToTimemap();

  // Filter to note onset entries only (entries with `on` array)
  const onsetEntries = timemap.filter(
    (entry) => entry.on && entry.on.length > 0
  );

  // Build TimemapEvent array from onset entries
  const events: TimemapEvent[] = onsetEntries.map((entry, index) => ({
    id: `evt-${index}`,
    beatOnset: entry.qstamp / 4, // Convert quarter-note units to whole-note fractions (RealValue convention)
    beatDuration: 0, // Calculated below
    svgIds: entry.on!, // Verovio note xml:id values
  }));

  // Calculate beatDuration for each event
  for (let i = 0; i < events.length - 1; i++) {
    events[i].beatDuration = events[i + 1].beatOnset - events[i].beatOnset;
  }
  if (events.length > 0) {
    events[events.length - 1].beatDuration = 1; // Last event convention
  }

  return events;
}

/**
 * Phase 2: Compute page indices and global Y positions for timemap events.
 *
 * This function requires DOM access to measure positions. Call after SVG
 * pages are rendered and mounted in the DOM.
 *
 * @param timemapEvents - Events from extractTimemapEvents()
 * @param toolkit - Verovio toolkit instance (for getPageWithElement API)
 * @param pageContainers - Array of DOM elements containing each page's SVG
 * @param pageOffsets - Cumulative Y offset for each page (for global coordinates)
 * @returns Array of CachedEvents with pageIndex and globalY populated
 */
export function computeEventPositions(
  timemapEvents: TimemapEvent[],
  toolkit: VerovioToolkit,
  pageContainers: HTMLElement[],
  pageOffsets: number[]
): CachedEvent[] {
  const cachedEvents: CachedEvent[] = timemapEvents.map((event) => ({
    ...event,
    pageIndex: 0,
    globalY: 0,
  }));

  for (const event of cachedEvents) {
    if (event.svgIds.length === 0) continue;

    // Use Verovio API to find which page this event is on (1-based)
    const pageNum = toolkit.getPageWithElement(event.svgIds[0]);
    if (pageNum === 0) continue; // Element not found

    const pageIndex = pageNum - 1;
    event.pageIndex = pageIndex;

    const container = pageContainers[pageIndex];
    if (!container) continue;

    const containerRect = container.getBoundingClientRect();
    const noteEl = container.querySelector(`#${CSS.escape(event.svgIds[0])}`);
    if (!noteEl) continue;

    // Find parent g.system element for consistent Y positioning
    const systemEl = noteEl.closest('g.system');
    if (systemEl) {
      const sysRect = systemEl.getBoundingClientRect();
      const localY = sysRect.top - containerRect.top + sysRect.height / 2;
      event.globalY = pageOffsets[pageIndex] + localY;
    } else {
      // Fallback: use note's own position
      const noteRect = noteEl.getBoundingClientRect();
      const localY = noteRect.top - containerRect.top + noteRect.height / 2;
      event.globalY = pageOffsets[pageIndex] + localY;
    }
  }

  return cachedEvents;
}

/**
 * Compute section indices and global X positions for horizontal single-line rendering.
 *
 * This function mirrors computeEventPositions but for the horizontal axis.
 * Call after section SVGs are mounted in the DOM.
 *
 * @param events - Events with timing data (from extractTimemapEvents or with pageIndex/globalY)
 * @param sectionContainers - Array of DOM elements containing each section's SVG
 * @param sectionOffsets - Cumulative X offset for each section (from useSingleLineVerovio)
 * @returns Events with sectionIndex, localX, and globalX populated
 */
export function computeSectionPositions(
  events: CachedEvent[],
  sectionContainers: HTMLElement[],
  sectionOffsets: number[]
): CachedEvent[] {
  // Clone events to avoid mutation
  const result = events.map(event => ({ ...event }));

  for (const event of result) {
    if (event.svgIds.length === 0) continue;

    // Find which section contains this element by searching each container
    let sectionIndex = -1;
    let localX = 0;

    for (let i = 0; i < sectionContainers.length; i++) {
      const container = sectionContainers[i];
      if (!container) continue;

      const noteEl = container.querySelector(
        `#${CSS.escape(event.svgIds[0])}`
      );
      if (noteEl) {
        sectionIndex = i;
        const containerRect = container.getBoundingClientRect();
        const noteRect = noteEl.getBoundingClientRect();
        // Use element center for consistent camera targeting
        localX = noteRect.left - containerRect.left + noteRect.width / 2;
        break;
      }
    }

    if (sectionIndex >= 0) {
      event.sectionIndex = sectionIndex;
      event.localX = localX;
      event.globalX = sectionOffsets[sectionIndex] + localX;
    }
  }

  return result;
}
