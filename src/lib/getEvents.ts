import {
  OpenSheetMusicDisplay,
  VoiceEntry,
  EngravingRules,
} from "opensheetmusicdisplay";
import type { VerovioToolkit } from "verovio/esm";

const OFFSET = 15;

export interface MusicalEvent {
  id: string;
  beatOnset: number;
  beatDuration: number;
  svgIds: string[];
  x: number; // Local x within segment
  globalX?: number; // Global x across entire score (for segmented rendering)
  segmentId?: string; // Which segment owns this event (for segmented rendering)
}

export function getEvents(osmd: OpenSheetMusicDisplay): MusicalEvent[] {
  const cursor = osmd.Cursor;
  cursor.show();
  cursor.reset();

  const events: MusicalEvent[] = [];

  while (!cursor.Iterator.EndReached) {
    const beatOnset = cursor.Iterator.currentTimeStamp.RealValue;
    const svgIds = getStavenoteIds(
      cursor.Iterator.CurrentVoiceEntries,
      osmd.EngravingRules
    );

    const cssLeft = cursor.cursorElement.style.left;
    const posStr = cssLeft.substring(0, cssLeft.length - 2);
    const x = Number(posStr) + OFFSET;

    events.push({
      id: `evt-${events.length}`,
      beatOnset,
      beatDuration: 0,
      svgIds: svgIds,
      x: x ?? 0,
    });

    cursor.next();
  }

  for (let i = 0; i < events.length - 1; i++) {
    events[i].beatDuration = events[i + 1].beatOnset - events[i].beatOnset;
  }

  if (events.length > 0) {
    events[events.length - 1].beatDuration = 1;
  }

  cursor.hide();
  return events;
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
  svgContainer: HTMLElement
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

  // Extract Y positions from DOM using getBoundingClientRect
  const containerRect = svgContainer.getBoundingClientRect();
  for (const event of events) {
    if (event.svgIds.length > 0) {
      const noteEl = svgContainer.querySelector(
        `#${CSS.escape(event.svgIds[0])}`
      );
      if (noteEl) {
        const noteRect = noteEl.getBoundingClientRect();
        event.y = noteRect.top - containerRect.top + noteRect.height / 2;
      }
    }
  }

  return events;
}

function getStavenoteIds(
  voiceEntries: VoiceEntry[],
  rules: EngravingRules
): string[] {
  const stavenoteIds: string[] = [];
  for (const ve of voiceEntries) {
    for (const n of ve.Notes) {
      if (n.isRest()) continue;

      const gNote = rules.GNote(n);
      const id: string = (gNote as any).vfnote[0].getAttribute("id");

      if (id) {
        stavenoteIds.push(`vf-${id}`);
      }
    }
  }

  return stavenoteIds;
}
