/**
 * Minimal interface for events that can be interpolated.
 * Both MusicalEvent and CachedEvent satisfy this interface.
 */
export interface InterpolatableEvent {
  id: string;
  beatOnset: number;
  beatDuration: number;
  svgIds: string[];
  positionSvgId?: string;
  tiedContinuationIds?: string[];
  tiedStartIds?: string[];
  noteDurationBeats?: number;
  tiedNoteDurationBeats?: number;
}

export interface InterpolatedEvent extends InterpolatableEvent {
  computedTimestamp: number;
  isAnchor: boolean;
}

/** Internal type for tracking anchor positions */
interface AnchorInfo {
  index: number;
  beatOnset: number;
  timestamp: number;
}

/** Default BPM used when only one anchor exists */
const DEFAULT_BPM = 60;

/**
 * Interpolates timestamps for musical events based on user-set anchor points.
 *
 * @param events - Array of musical events sorted by beatOnset
 * @param anchors - Map of event IDs to their user-set timestamps
 * @returns Array of events with computed timestamps and anchor flags
 *
 * Behavior:
 * - No anchors: All events get timestamp 0
 * - Single anchor: Uses default BPM (60) for extrapolation
 * - Two+ anchors: Linear interpolation between anchors, extrapolation outside
 */
export function interpolateTimestamps<T extends InterpolatableEvent>(
  events: T[],
  anchors: Map<string, number>
): (T & { computedTimestamp: number; isAnchor: boolean })[] {
  if (events.length === 0) return [];

  // Sort by beatOnset
  const sorted = [...events].sort((a, b) => a.beatOnset - b.beatOnset);

  // No anchors: return all with timestamp 0
  if (anchors.size === 0) {
    return sorted.map(evt => ({
      ...evt,
      computedTimestamp: 0,
      isAnchor: false,
    }));
  }

  // Collect anchor info from events
  const anchorInfos: AnchorInfo[] = [];
  sorted.forEach((event, index) => {
    const timestamp = anchors.get(event.id);
    if (timestamp !== undefined) {
      anchorInfos.push({ index, beatOnset: event.beatOnset, timestamp });
    }
  });

  // Sort anchors by beat position
  anchorInfos.sort((a, b) => a.beatOnset - b.beatOnset);

  // Calculate beats per second - used for extrapolation
  const getBeatsPerSecond = (): number => {
    if (anchorInfos.length >= 2) {
      const first = anchorInfos[0];
      const last = anchorInfos[anchorInfos.length - 1];
      const beatRange = last.beatOnset - first.beatOnset;
      const timeRange = last.timestamp - first.timestamp;
      if (timeRange > 0) {
        return beatRange / timeRange;
      }
    }
    // Fallback to default BPM
    return DEFAULT_BPM / 60; // beats per second
  };

  const beatsPerSecond = getBeatsPerSecond();

  return sorted.map((event) => {
    // Check if this event is an anchor
    const anchorTimestamp = anchors.get(event.id);
    if (anchorTimestamp !== undefined) {
      return {
        ...event,
        computedTimestamp: anchorTimestamp,
        isAnchor: true,
      };
    }

    // Find surrounding anchors
    let prevAnchor: AnchorInfo | undefined;
    let nextAnchor: AnchorInfo | undefined;

    for (const anchor of anchorInfos) {
      if (anchor.beatOnset <= event.beatOnset) {
        prevAnchor = anchor;
      }
      if (anchor.beatOnset > event.beatOnset && !nextAnchor) {
        nextAnchor = anchor;
        break;
      }
    }

    let computedTimestamp: number;

    if (prevAnchor && nextAnchor) {
      // Between two anchors: linear interpolation
      const beatRange = nextAnchor.beatOnset - prevAnchor.beatOnset;
      const timeRange = nextAnchor.timestamp - prevAnchor.timestamp;
      const t = (event.beatOnset - prevAnchor.beatOnset) / beatRange;
      computedTimestamp = prevAnchor.timestamp + t * timeRange;
    } else if (prevAnchor) {
      // After last anchor: extrapolate forward
      const beatDiff = event.beatOnset - prevAnchor.beatOnset;
      computedTimestamp = prevAnchor.timestamp + beatDiff / beatsPerSecond;
    } else if (nextAnchor) {
      // Before first anchor: extrapolate backward
      const beatDiff = nextAnchor.beatOnset - event.beatOnset;
      computedTimestamp = nextAnchor.timestamp - beatDiff / beatsPerSecond;
    } else {
      // Should not happen if anchors.size > 0
      computedTimestamp = 0;
    }

    return {
      ...event,
      computedTimestamp,
      isAnchor: false,
    };
  });
}

/**
 * Compute the sounding duration in seconds for an event based on its
 * noteDurationBeats and the surrounding interpolated timestamps.
 * Used by "use note duration" mode to set per-event hold times.
 */
export function computeNoteDurationSeconds(
  eventIndex: number,
  events: { beatOnset: number; computedTimestamp: number; noteDurationBeats?: number }[],
): number {
  const event = events[eventIndex];
  const durationBeats = event.noteDurationBeats;
  if (!durationBeats || durationBeats <= 0) return 0;

  const endBeat = event.beatOnset + durationBeats;

  // Find the first event at or after endBeat and interpolate
  for (let i = eventIndex + 1; i < events.length; i++) {
    if (events[i].beatOnset >= endBeat) {
      const prev = events[i - 1];
      const next = events[i];
      const beatRange = next.beatOnset - prev.beatOnset;
      if (beatRange > 0) {
        const t = (endBeat - prev.beatOnset) / beatRange;
        const endTimestamp = prev.computedTimestamp + t * (next.computedTimestamp - prev.computedTimestamp);
        return endTimestamp - event.computedTimestamp;
      }
      return next.computedTimestamp - event.computedTimestamp;
    }
  }

  // Past last event — extrapolate using local tempo from last two events
  if (events.length >= 2) {
    const last = events[events.length - 1];
    const prev = events[events.length - 2];
    const beatRange = last.beatOnset - prev.beatOnset;
    if (beatRange > 0) {
      const secsPerBeat = (last.computedTimestamp - prev.computedTimestamp) / beatRange;
      return durationBeats * secsPerBeat;
    }
  }

  return 0;
}
