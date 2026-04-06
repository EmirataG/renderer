import type { VerovioToolkit } from "verovio/esm";
import type { CachedEvent } from "../stores/eventStore";

/**
 * Tie chain info for a note that starts a tie chain.
 */
interface TieChainInfo {
  continuationIds: string[]; // All tied continuation note IDs in the chain
  totalDurationBeats: number; // Total sounding duration in whole-note fractions
}

/**
 * Build tie information from MEI: continuation IDs (for filtering),
 * tie chain map (for "use note duration" mode), and per-note durations.
 *
 * Verovio encodes ties as separate <tie startid="#X" endid="#Y"/> elements.
 * Any note referenced by @endid is a continuation and should not be highlighted
 * as a new onset. For tie chains (A→B→C), the chain map tracks all continuation
 * IDs and the total sounding duration.
 */
function buildTieInfo(toolkit: VerovioToolkit): {
  continuationIds: Set<string>;
  chainMap: Map<string, TieChainInfo>;
  noteDurations: Map<string, number>;
} {
  const continuationIds = new Set<string>();
  const chainMap = new Map<string, TieChainInfo>();
  const noteDurations = new Map<string, number>();

  try {
    const mei = toolkit.getMEI();
    const parser = new DOMParser();
    const doc = parser.parseFromString(mei, 'application/xml');

    // Step 1: Parse all note durations from MEI
    doc.querySelectorAll('note').forEach((noteEl) => {
      const id = noteEl.getAttribute('xml:id');
      if (!id) return;
      let dur = noteEl.getAttribute('dur');
      let dots = noteEl.getAttribute('dots');
      // Notes in chords may inherit duration from parent <chord> element
      if (!dur) {
        const parent = noteEl.parentElement;
        if (parent && parent.tagName === 'chord') {
          dur = parent.getAttribute('dur');
          if (!dots) dots = parent.getAttribute('dots');
        }
      }
      const durNum = parseInt(dur || '4', 10);
      const dotsNum = parseInt(dots || '0', 10);
      const dotMultiplier = dotsNum > 0 ? (2 - 1 / Math.pow(2, dotsNum)) : 1;
      // Duration in whole-note fractions (matches beatOnset units)
      noteDurations.set(id, (1 / durNum) * dotMultiplier);
    });

    // Step 2: Parse ties to build forward map
    const tieForward = new Map<string, string>(); // startid → endid
    const tieEndIds = new Set<string>(); // all endids (continuation notes)
    doc.querySelectorAll('tie').forEach((el) => {
      const startid = el.getAttribute('startid')?.replace(/^#/, '');
      const endid = el.getAttribute('endid')?.replace(/^#/, '');
      if (startid && endid) {
        tieForward.set(startid, endid);
        tieEndIds.add(endid);
        continuationIds.add(endid);
      }
    });

    // Step 3: Build chains from each chain-start note
    // A chain-start is a note that appears as startid but NOT as endid
    for (const [startId] of tieForward) {
      if (tieEndIds.has(startId)) continue; // middle or end of chain, skip

      const chainContIds: string[] = [];
      let totalDur = noteDurations.get(startId) || 0.25;
      let current = startId;
      while (tieForward.has(current)) {
        const next = tieForward.get(current)!;
        chainContIds.push(next);
        totalDur += noteDurations.get(next) || 0.25;
        current = next;
      }
      if (chainContIds.length > 0) {
        chainMap.set(startId, {
          continuationIds: chainContIds,
          totalDurationBeats: totalDur,
        });
      }
    }
  } catch {
    // Fall through with empty data
  }

  return { continuationIds, chainMap, noteDurations };
}

/**
 * Populate tiedContinuationIds and noteDurationBeats on events
 * using tie chain info and per-note durations from MEI.
 */
function populateTieFields<T extends {
  svgIds: string[];
  tiedContinuationIds?: string[];
  tiedStartIds?: string[];
  noteDurationBeats?: number;
  tiedNoteDurationBeats?: number;
}>(
  events: T[],
  chainMap: Map<string, TieChainInfo>,
  noteDurations: Map<string, number>,
): void {
  for (const event of events) {
    const allTiedIds: string[] = [];
    const tiedStarts: string[] = [];
    let maxUntiedDuration = 0;
    let maxTiedDuration = 0;

    for (const id of event.svgIds) {
      const chain = chainMap.get(id);
      if (chain) {
        tiedStarts.push(id);
        allTiedIds.push(...chain.continuationIds);
        maxTiedDuration = Math.max(maxTiedDuration, chain.totalDurationBeats);
      } else {
        const dur = noteDurations.get(id);
        if (dur !== undefined) {
          maxUntiedDuration = Math.max(maxUntiedDuration, dur);
        }
      }
    }

    if (allTiedIds.length > 0) {
      event.tiedContinuationIds = allTiedIds;
    }

    if (maxUntiedDuration > 0 && maxTiedDuration > 0) {
      // Mixed event: untied and tied notes with separate durations
      event.noteDurationBeats = maxUntiedDuration;
      event.tiedNoteDurationBeats = maxTiedDuration;
      event.tiedStartIds = tiedStarts;
    } else if (maxTiedDuration > 0) {
      // All notes are tied — use chain duration for the whole event
      event.noteDurationBeats = maxTiedDuration;
    } else if (maxUntiedDuration > 0) {
      // No ties — use untied duration
      event.noteDurationBeats = maxUntiedDuration;
    }
  }
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
  positionSvgId?: string; // First SVG ID for position lookup (includes tied continuations)
  tiedContinuationIds?: string[]; // SVG IDs of tied continuation notes (for coloring entire tie chain)
  tiedStartIds?: string[]; // SVG IDs from svgIds that start tie chains (for split hold durations)
  noteDurationBeats?: number; // Sounding duration of untied notes (whole-note fractions)
  tiedNoteDurationBeats?: number; // Sounding duration of tied chain (whole-note fractions, only when mixed)
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
  // Build tie info from MEI (continuation IDs, tie chains, note durations)
  const tieInfo = buildTieInfo(toolkit);

  // Get the full timemap from Verovio (rests excluded by default).
  // renderToTimemap() can throw a WASM "memory access out of bounds"
  // if called while Verovio is mid-layout — return empty so callers
  // retry on the next render cycle.
  let timemap: ReturnType<typeof toolkit.renderToTimemap>;
  try {
    timemap = toolkit.renderToTimemap();
  } catch {
    return [];
  }

  // Filter to note onset entries only (entries with `on` array)
  const onsetEntries = timemap.filter(
    (entry) => entry.on && entry.on.length > 0
  );

  // Build TimemapEvent array from onset entries, excluding tied continuations.
  // positionSvgId keeps the first note ID (even if tied) for position lookup —
  // events where ALL notes are continuations still need a DOM position for scrolling.
  const events: TimemapEvent[] = onsetEntries.map((entry, index) => ({
    id: `evt-${index}`,
    beatOnset: entry.qstamp / 4, // Convert quarter-note units to whole-note fractions (RealValue convention)
    beatDuration: 0, // Calculated below
    svgIds: entry.on!.filter((id) => !tieInfo.continuationIds.has(id)),
    positionSvgId: entry.on![0],
  }));

  // Calculate beatDuration for each event
  for (let i = 0; i < events.length - 1; i++) {
    events[i].beatDuration = events[i + 1].beatOnset - events[i].beatOnset;
  }
  if (events.length > 0) {
    events[events.length - 1].beatDuration = 1; // Last event convention
  }

  // Populate tie chain info for "use note duration" mode
  populateTieFields(events, tieInfo.chainMap, tieInfo.noteDurations);

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

  // Detect CSS transform scale on ancestor elements (e.g., RenderApp's scale wrapper).
  // getBoundingClientRect() returns viewport coordinates that include CSS transforms,
  // but pageOffsets are in pre-transform CSS pixels. We need positions in the same
  // pre-transform space so the camera translateY (applied inside the transform) is correct.
  const firstContainer = pageContainers[0];
  const domScale = firstContainer && firstContainer.clientWidth > 0
    ? firstContainer.getBoundingClientRect().width / firstContainer.clientWidth
    : 1;

  for (const event of cachedEvents) {
    const posId = event.positionSvgId || event.svgIds[0];
    if (!posId) continue;

    // Use Verovio API to find which page this event is on (1-based)
    const pageNum = toolkit.getPageWithElement(posId);
    if (pageNum === 0) continue; // Element not found

    const pageIndex = pageNum - 1;
    event.pageIndex = pageIndex;

    const container = pageContainers[pageIndex];
    if (!container) continue;

    const containerRect = container.getBoundingClientRect();
    const noteEl = container.querySelector(`#${CSS.escape(posId)}`);
    if (!noteEl) continue;

    // Find parent g.system element for consistent Y positioning
    const systemEl = noteEl.closest('g.system');
    if (systemEl) {
      const sysRect = systemEl.getBoundingClientRect();
      // Divide by domScale to convert from viewport pixels to pre-transform CSS pixels
      const localY = (sysRect.top - containerRect.top + sysRect.height / 2) / domScale;
      event.globalY = pageOffsets[pageIndex] + localY;
    } else {
      // Fallback: use note's own position
      const noteRect = noteEl.getBoundingClientRect();
      const localY = (noteRect.top - containerRect.top + noteRect.height / 2) / domScale;
      event.globalY = pageOffsets[pageIndex] + localY;
    }
  }

  // Enforce monotonically non-decreasing globalY. The camera should only
  // scroll down during playback — never jump backwards to an earlier system.
  for (let i = 1; i < cachedEvents.length; i++) {
    if (cachedEvents[i].globalY < cachedEvents[i - 1].globalY) {
      cachedEvents[i].globalY = cachedEvents[i - 1].globalY;
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
    const posId = event.positionSvgId || event.svgIds[0];
    if (!posId) continue;

    // Find which section contains this element by searching each container
    let sectionIndex = -1;
    let localX = 0;

    for (let i = 0; i < sectionContainers.length; i++) {
      const container = sectionContainers[i];
      if (!container) continue;

      const noteEl = container.querySelector(
        `#${CSS.escape(posId)}`
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

  // Enforce monotonically non-decreasing globalX. The camera should only
  // scroll right during playback — never jump backwards to an earlier position.
  for (let i = 1; i < result.length; i++) {
    const prevX = result[i - 1].globalX ?? 0;
    const currX = result[i].globalX ?? 0;
    if (currX < prevX) {
      result[i].globalX = prevX;
    }
  }

  return result;
}
