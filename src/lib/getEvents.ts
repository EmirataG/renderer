import {
  OpenSheetMusicDisplay,
  VoiceEntry,
  EngravingRules,
} from "opensheetmusicdisplay";

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
