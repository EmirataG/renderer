# Phase 2: Event System Migration - Research

**Researched:** 2026-02-03
**Domain:** Verovio timing APIs, SVG DOM event extraction, MusicalEvent mapping
**Confidence:** HIGH

## Summary

This phase migrates event extraction from OSMD's cursor-based approach to Verovio's timing APIs and SVG DOM queries. The existing system iterates through OSMD's cursor to collect beat positions, SVG element IDs, and X positions. The Verovio replacement will query `g.note` elements from the rendered SVG DOM, then use `getTimesForElement()` and `getMIDIValuesForElement()` to attach onset times and durations to each note. Y positions for camera tracking will be extracted via `getBoundingClientRect()` on the note `<g>` elements.

The core finding is that Verovio provides two complementary approaches: (1) **renderToTimemap()** returns a complete timemap array with all note on/off events and their IDs, making it the most efficient way to enumerate all distinct beat positions; (2) **per-element APIs** (`getTimesForElement`, `getMIDIValuesForElement`) provide detailed timing for individual elements. The recommended approach uses `renderToTimemap()` as the primary enumeration strategy, supplemented by per-element queries when needed.

The existing `interpolateTimestamps()` function works entirely on `MusicalEvent[]` with `beatOnset` and `id` fields. It does NOT need modification as long as the new Verovio events provide the same `beatOnset` values (as beat fractions) and stable `id` strings.

**Primary recommendation:** Use `renderToTimemap()` to enumerate all beat positions with note IDs, then query SVG DOM for Y positions via `getBoundingClientRect()`, producing `MusicalEvent[]` that the existing interpolation system consumes unchanged.

## Standard Stack

This phase uses no new libraries. It relies entirely on Verovio APIs already installed.

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| verovio | 6.0.1 (installed) | Music rendering + timing APIs | Already integrated in Phase 1 |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @types/verovio | 5.1.0 (installed) | TypeScript types for toolkit | Provides MIDIValues, TimeMapEntry, etc. |

### No New Dependencies
This phase adds no new packages. All functionality comes from Verovio APIs + browser DOM APIs.

**Installation:** None needed.

## Architecture Patterns

### Recommended Project Structure
```
src/
├── lib/
│   ├── getEvents.ts           # MODIFY: add getEventsFromVerovio() alongside existing getEvents()
│   ├── interpolation.ts       # NO CHANGES needed
│   └── verovioService.ts      # NO CHANGES needed (Phase 1 complete)
├── hooks/
│   └── useVerovio.ts          # NO CHANGES needed
├── renderers/
│   └── RegularRenderer.tsx    # MODIFY: call getEventsFromVerovio() after SVG render
├── components/
│   └── SyncEditor.tsx         # MODIFY: replace OSMD event extraction with Verovio version
└── types/
    └── verovio-augments.d.ts  # MAY need updates for renderToTimemap types
```

### Pattern 1: Timemap-Based Event Enumeration
**What:** Use `renderToTimemap()` to get all beat positions with note IDs, then enrich with DOM positions.
**When to use:** Primary event extraction strategy.
**Why:** Timemap provides a complete, ordered list of all beat positions with note on/off arrays, avoiding the need to manually iterate through SVG elements.

```typescript
// Source: @types/verovio index.d.ts + Verovio official docs
interface TimeMapEntry {
  tstamp: number;    // Real time in milliseconds
  qstamp: number;    // Score time in quarter notes
  on?: string[];     // Note IDs starting at this time
  off?: string[];    // Note IDs ending at this time
  tempo?: number;    // Tempo change (if applicable)
}

function getEventsFromVerovio(
  toolkit: VerovioToolkit,
  svgContainer: HTMLElement
): MusicalEvent[] {
  // 1. Get timemap (renderToMIDI must already have been called)
  const timemap: TimeMapEntry[] = toolkit.renderToTimemap();

  // 2. Filter to entries with note onsets
  const onsetEntries = timemap.filter(entry => entry.on && entry.on.length > 0);

  // 3. Build MusicalEvent for each distinct beat position
  const events: MusicalEvent[] = onsetEntries.map((entry, index) => ({
    id: `evt-${index}`,
    beatOnset: entry.qstamp,    // Quarter note position (beat fraction)
    beatDuration: 0,            // Calculated below
    svgIds: entry.on!,          // Note xml:id values from timemap
    x: 0,                       // Will be populated from DOM
  }));

  // 4. Calculate beat durations
  for (let i = 0; i < events.length - 1; i++) {
    events[i].beatDuration = events[i + 1].beatOnset - events[i].beatOnset;
  }
  if (events.length > 0) {
    events[events.length - 1].beatDuration = 1;
  }

  return events;
}
```

### Pattern 2: DOM-Based Y Position Extraction
**What:** Query SVG DOM for note element positions using `getBoundingClientRect()`.
**When to use:** After SVG is rendered into the DOM, to get Y positions for camera tracking.
**Why:** Verovio does not provide position data through its API; positions must be read from the rendered SVG DOM.

```typescript
function extractYPositions(
  events: MusicalEvent[],
  svgContainer: HTMLElement
): MusicalEventWithY[] {
  return events.map(event => {
    // Use first svgId to determine Y position
    const firstNoteId = event.svgIds[0];
    if (!firstNoteId) return { ...event, y: 0 };

    const noteElement = svgContainer.querySelector(`#${CSS.escape(firstNoteId)}`);
    if (!noteElement) return { ...event, y: 0 };

    // getBoundingClientRect gives position relative to viewport
    // Subtract container's top to get position relative to score
    const containerRect = svgContainer.getBoundingClientRect();
    const noteRect = noteElement.getBoundingClientRect();
    const y = noteRect.top - containerRect.top + noteRect.height / 2;

    return { ...event, y };
  });
}
```

### Pattern 3: Timing Model Conversion (MIDI ms to beat fractions)
**What:** Convert between Verovio's MIDI millisecond timestamps and the beat fraction model used by the existing interpolation system.
**When to use:** Mapping Verovio timing data to MusicalEvent.beatOnset.

**Critical finding:** The timemap's `qstamp` field is already in quarter-note units (beat fractions), which maps directly to the existing `beatOnset` field. The OSMD system uses `cursor.Iterator.currentTimeStamp.RealValue` which is also in beat fractions. Therefore, **`qstamp` from the timemap maps directly to `beatOnset` with no conversion needed**.

However, the existing code uses RealValue which is measured in whole notes (1 = whole note, 0.25 = quarter note), while Verovio's `qstamp` is in quarter notes (1 = quarter note, 4 = whole note). This needs verification with real scores. If conversion is needed: `beatOnset = qstamp / 4` to convert from quarter notes to whole notes.

### Anti-Patterns to Avoid
- **Iterating all `g.note` elements manually:** Use `renderToTimemap()` instead; it gives you the complete ordered event list with proper grouping of simultaneous notes.
- **Calling `getTimeForElement()` for every note individually:** This is O(n) API calls. Use timemap which gives all times in one call.
- **Storing MIDI millisecond timestamps as beatOnset:** The interpolation system expects beat fractions, not milliseconds. Use `qstamp` from timemap, not `tstamp`.
- **Querying DOM before SVG is painted:** Use `requestAnimationFrame` to ensure the browser has laid out the SVG before calling `getBoundingClientRect()`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Enumerating all beat positions | Manual SVG DOM traversal of `g.note` elements | `toolkit.renderToTimemap()` | Handles chords, tied notes, rests, multi-voice correctly |
| Getting onset time for a note | Custom beat counting from SVG structure | `toolkit.getTimesForElement(id)` or timemap `qstamp` | Accounts for tempo changes, repeats, tied durations |
| Grouping notes at same beat | Manual deduplication by position | Timemap entries naturally group simultaneous notes in `on[]` array | Already handled by Verovio's internal model |
| MIDI pitch/duration data | Parsing MEI attributes | `toolkit.getMIDIValuesForElement(id)` returns `{time, pitch, duration}` | Verovio handles transposition, key signatures |
| Note attribute extraction | Parsing SVG data attributes | `toolkit.getElementAttr(id)` returns all MEI attributes as JSON | Handles all MEI attribute types |

**Key insight:** Verovio's timemap is the single source of truth for "what plays when." The SVG DOM is only needed for visual position data (X, Y coordinates). Do not try to reconstruct musical timing from the SVG structure.

## Common Pitfalls

### Pitfall 1: renderToMIDI() Not Called Before Timing Queries
**What goes wrong:** `getTimeForElement()`, `getTimesForElement()`, `getMIDIValuesForElement()`, and `renderToTimemap()` return empty/zero results.
**Why it happens:** These APIs depend on internal MIDI data that is only populated when `renderToMIDI()` is called.
**How to avoid:** Phase 1 already calls `toolkit.renderToMIDI()` after `renderToSVG()` in `useVerovio.ts`. Verify this call is present and happens before event extraction.
**Warning signs:** All onset times are 0 or undefined.

### Pitfall 2: SVG ID Format Mismatch Between Timemap and DOM
**What goes wrong:** `document.getElementById(noteId)` returns null even though the note exists.
**Why it happens:** The timemap returns MEI `xml:id` values (e.g., `"note-0000001234567890"`). These match the SVG `id` attributes directly in Verovio's output. However, the OSMD system prefixed IDs with `"vf-"`. Code that still expects the `"vf-"` prefix will fail.
**How to avoid:** Verovio note IDs from the timemap work directly as SVG element IDs. Do NOT add any prefix. Use `CSS.escape()` when using IDs in querySelector (IDs may contain characters that need escaping).
**Warning signs:** `querySelector` returns null; notehead animations do not apply.

### Pitfall 3: getBoundingClientRect() Returns Zero Before Layout
**What goes wrong:** All Y positions are 0.
**Why it happens:** The SVG is set via `dangerouslySetInnerHTML` but the browser has not yet performed layout. Calling `getBoundingClientRect()` immediately returns zero-sized rectangles.
**How to avoid:** Extract Y positions inside a `requestAnimationFrame` callback after the SVG string is set on the DOM. The existing code in `RegularRenderer.tsx` already uses rAF for post-render DOM operations (line 238).
**Warning signs:** All events have `y: 0`.

### Pitfall 4: Beat Fraction Unit Mismatch
**What goes wrong:** Events are in wrong temporal order or interpolation produces wrong timestamps.
**Why it happens:** OSMD's `currentTimeStamp.RealValue` measures beats in whole notes (0.25 = quarter note). Verovio's `qstamp` measures in quarter notes (1 = quarter note). If the units are mixed, the interpolation math breaks.
**How to avoid:** Decide on one unit system. Recommendation: convert `qstamp` to whole-note fractions (`beatOnset = qstamp / 4`) to match the existing OSMD convention, OR update all consumers if switching to quarter-note units. Validate with a real score by comparing event counts and beat positions.
**Warning signs:** Beat durations are 4x too large or too small.

### Pitfall 5: Chord Handling - Duplicate Events at Same Beat
**What goes wrong:** Multiple events created for notes that should be a single beat event (chord).
**Why it happens:** Individual `g.note` elements inside a chord each have their own ID, but they share the same beat position.
**How to avoid:** The timemap handles this correctly: simultaneous notes appear in the same entry's `on[]` array. Do NOT create separate events for each note in a chord. One `MusicalEvent` per timemap entry.
**Warning signs:** Event count is much higher than expected number of beats.

### Pitfall 6: SVG Viewbox Scaling Affects getBoundingClientRect()
**What goes wrong:** Y positions are correct relative to each other but wrong absolute values, causing camera to jump or overshoot.
**Why it happens:** Verovio renders with `svgViewBox: true` (set in `useVerovio.ts`), which means the SVG uses a viewBox that may differ from pixel coordinates. `getBoundingClientRect()` returns viewport pixel coordinates accounting for this scaling.
**How to avoid:** Always compute Y relative to the container element: `noteRect.top - containerRect.top`. This gives the position within the score container regardless of SVG viewBox scaling.
**Warning signs:** Camera overshoots or undershoots note positions.

### Pitfall 7: Rests in Event List
**What goes wrong:** Rest positions included as events, creating gaps in animation or incorrect beat counts.
**Why it happens:** By default, `renderToTimemap()` does NOT include rests. But if `includeRests: true` is passed, rest entries appear with no `on[]` array (or rest-specific IDs).
**How to avoid:** Do NOT pass `includeRests: true` to `renderToTimemap()`. The existing OSMD code explicitly skips rests (`if (n.isRest()) continue`). The default timemap behavior (no rests) matches this.
**Warning signs:** Events with empty `svgIds` arrays.

## Code Examples

### Complete Event Extraction from Verovio

```typescript
// Source: Verovio official docs + @types/verovio
import type { VerovioToolkit } from 'verovio/esm';

interface MusicalEvent {
  id: string;
  beatOnset: number;
  beatDuration: number;
  svgIds: string[];
  x: number;
}

interface MusicalEventWithY extends MusicalEvent {
  y: number;
}

/**
 * Extract musical events from Verovio toolkit + rendered SVG DOM.
 * Prerequisites: toolkit.loadData(), toolkit.renderToSVG(), toolkit.renderToMIDI()
 * must all have been called before this function.
 */
export function getEventsFromVerovio(
  toolkit: VerovioToolkit,
  svgContainer: HTMLElement
): MusicalEventWithY[] {
  // Step 1: Get timemap (all beat positions with note IDs)
  const timemap = (toolkit as any).renderToTimemap() as Array<{
    tstamp: number;
    qstamp: number;
    on?: string[];
    off?: string[];
    tempo?: number;
  }>;

  // Step 2: Filter to note-onset entries only
  const onsetEntries = timemap.filter(
    (entry) => entry.on && entry.on.length > 0
  );

  // Step 3: Build events (one per distinct beat position)
  const events: MusicalEventWithY[] = onsetEntries.map((entry, index) => {
    const svgIds = entry.on!;

    // Get Y position from first note element in DOM
    let y = 0;
    const firstNoteEl = svgContainer.querySelector(
      `#${CSS.escape(svgIds[0])}`
    );
    if (firstNoteEl) {
      const containerRect = svgContainer.getBoundingClientRect();
      const noteRect = firstNoteEl.getBoundingClientRect();
      y = noteRect.top - containerRect.top + noteRect.height / 2;
    }

    return {
      id: `evt-${index}`,
      beatOnset: entry.qstamp / 4, // Convert quarter-notes to whole-note fractions
      beatDuration: 0,
      svgIds,
      x: 0, // X not used for camera (camera is vertical)
      y,
    };
  });

  // Step 4: Calculate beat durations
  for (let i = 0; i < events.length - 1; i++) {
    events[i].beatDuration = events[i + 1].beatOnset - events[i].beatOnset;
  }
  if (events.length > 0) {
    events[events.length - 1].beatDuration = 1;
  }

  return events;
}
```

### Querying Individual Note Timing (Supplementary)

```typescript
// Source: @types/verovio MIDIValues interface
// Use when you need per-note details beyond what timemap provides

const noteId = "note-0000001234567890";

// MIDIValues: { time: number, pitch: number, duration: number }
const midiValues = toolkit.getMIDIValuesForElement(noteId);
// midiValues.time     -> onset in milliseconds
// midiValues.pitch    -> MIDI pitch number (60 = middle C)
// midiValues.duration -> duration in milliseconds

// TimesForElement: detailed score and real-time info
const times = toolkit.getTimesForElement(noteId);
// times.scoreTimeOnset              -> score time onset (quarter notes)
// times.scoreTimeOffset             -> score time offset
// times.scoreTimeDuration           -> duration in score time
// times.scoreTimeTiedDuration       -> tied duration
// times.realTimeOnsetMilliseconds   -> real time onset (ms)
// times.realTimeOffsetMilliseconds  -> real time offset (ms)

// ElementAttr: all MEI attributes
const attrs = toolkit.getElementAttr(noteId);
// attrs.pname -> pitch name ("c", "d", etc.)
// attrs.oct   -> octave number
// attrs.dur   -> duration type ("4" for quarter, "8" for eighth, etc.)
```

### Finding Note Elements at a Given Time

```typescript
// Source: Verovio official docs
// Inverse query: given a time, find which notes are playing

const timeMs = 2500; // 2.5 seconds
const elements = toolkit.getElementsAtTime(timeMs);
// elements.page  -> page number (1-based), 0 if error
// elements.notes -> string[] of note xml:id values

// Highlight those notes in the DOM
elements.notes.forEach(noteId => {
  const el = svgContainer.querySelector(`#${CSS.escape(noteId)}`);
  if (el) el.classList.add('playing');
});
```

### Verovio SVG DOM Structure Reference

```html
<!-- Verovio SVG hierarchy (from official docs) -->
<svg class="definition-scale">
  <g class="page-margin">
    <g class="system" id="system-0000001234567890">
      <g class="measure" id="measure-0000001234567891">
        <g class="staff" id="staff-0000001234567892">
          <!-- Staff lines rendered as paths -->
          <g class="layer" id="layer-0000001234567893">
            <g class="clef" id="clef-0000001234567894">...</g>
            <g class="note" id="note-0000001234567895">
              <g class="notehead">
                <use .../>  <!-- The visual notehead shape -->
              </g>
              <g class="stem">...</g>
            </g>
            <g class="chord" id="chord-0000001234567896">
              <g class="note" id="note-0000001234567897">
                <g class="notehead"><use .../></g>
              </g>
              <g class="note" id="note-0000001234567898">
                <g class="notehead"><use .../></g>
              </g>
            </g>
            <g class="rest" id="rest-0000001234567899">...</g>
            <g class="beam" id="beam-0000001234567900">
              <g class="note" id="note-0000001234567901">...</g>
              <g class="note" id="note-0000001234567902">...</g>
            </g>
          </g>
        </g>
      </g>
    </g>
  </g>
</svg>
```

**Key DOM query patterns:**
- All notes: `svgContainer.querySelectorAll('g.note')`
- Specific note: `svgContainer.querySelector('#' + CSS.escape(noteId))`
- All noteheads: `noteElement.querySelectorAll('g.notehead')`
- Notehead shapes: `noteheadElement.querySelectorAll('use')`
- Systems: `svgContainer.querySelectorAll('g.system')`
- Verovio root SVG: `svgContainer.querySelector('svg.definition-scale')`

## State of the Art

| Old Approach (OSMD) | New Approach (Verovio) | Impact |
|---------------------|----------------------|--------|
| Cursor iteration (`cursor.next()`) | `renderToTimemap()` single call | Much simpler, no cursor state management |
| `cursor.Iterator.currentTimeStamp.RealValue` | `timemap[i].qstamp` | Same concept, different units (whole notes vs quarter notes) |
| VexFlow SVG IDs with `vf-` prefix | MEI `xml:id` values directly | No prefix needed, IDs work as-is in DOM |
| `cursor.cursorElement.style.left` for X position | `getBoundingClientRect()` for Y position | Y is what matters for vertical scrolling camera |
| OSMD `VoiceEntry.Notes` for chord handling | Timemap `on[]` array for simultaneous notes | Simpler API, no manual voice/note iteration |
| `n.isRest()` to skip rests | Default timemap excludes rests | No explicit rest-skipping needed |

**Deprecated/outdated:**
- The OSMD-based `getEvents()` function will be superseded but should be preserved until SyncEditor is also migrated
- The `vf-` prefix pattern for SVG IDs is OSMD/VexFlow specific and does not apply to Verovio

## Open Questions

1. **Beat unit conversion: qstamp units**
   - What we know: Verovio `qstamp` is in quarter notes. OSMD `RealValue` appears to be in whole notes. The interpolation system operates on `beatOnset` which is sourced from OSMD.
   - What's unclear: The exact conversion factor. Need to validate with a real score that the conversion `qstamp / 4` produces the same `beatOnset` values as OSMD did.
   - Recommendation: During implementation, log both OSMD and Verovio beat values for the same score and compare. If they match, conversion is correct. If not, adjust the divisor.
   - Confidence: MEDIUM - the conversion logic is sound but needs empirical validation.

2. **Multi-voice handling**
   - What we know: Timemap entries contain all note onsets at a given time regardless of voice. Multiple voices at the same beat appear in the same `on[]` array.
   - What's unclear: Whether the current MusicalEvent model (which has no voice field used in practice) handles multi-voice scores correctly.
   - Recommendation: For now, treat all voices as a single event stream (matching existing behavior). The `voice` field in MusicalEvent is not in the current interface definition.
   - Confidence: MEDIUM

3. **SyncEditor migration timing**
   - What we know: SyncEditor currently uses OSMD directly for both rendering and event extraction. It has its own `getEventsFromOsmd()` callback.
   - What's unclear: Whether SyncEditor should be migrated in this phase or in a later phase.
   - Recommendation: Migrate SyncEditor's event extraction in this phase since it uses the same MusicalEvent interface and interpolation system. The SyncEditor's rendering (OSMD to Verovio) can wait for a later phase, but the event extraction function should be swapped to use the Verovio version.
   - Confidence: HIGH - the event extraction is the core of this phase regardless of which renderer calls it.

4. **renderToTimemap TypeScript types**
   - What we know: The `@types/verovio` package defines `TimeMapEntry` and `renderToTimemap()`. The custom `verovio-augments.d.ts` does NOT include `renderToTimemap()`.
   - What's unclear: Whether the augmented types will conflict with `@types/verovio`.
   - Recommendation: Either add `renderToTimemap` to the augments file, or cast through `(toolkit as any).renderToTimemap()`. Best approach: add it to `verovio-augments.d.ts` matching the types from `@types/verovio`.
   - Confidence: HIGH

## Sources

### Primary (HIGH confidence)
- **@types/verovio 5.1.0** (`node_modules/@types/verovio/index.d.ts`) - Full TypeScript type definitions for all Verovio toolkit methods, including `MIDIValues`, `TimeMapEntry`, `getTimesForElement` return type, `getElementsAtTime` return type
- **verovio 6.0.1 source** (`node_modules/verovio/dist/verovio.mjs`) - Actual JS implementation confirming JSON.parse wrapping for getTimesForElement, getMIDIValuesForElement, getElementsAtTime, renderToTimemap
- **Existing codebase** - `src/lib/getEvents.ts`, `src/lib/interpolation.ts`, `src/renderers/RegularRenderer.tsx`, `src/components/SyncEditor.tsx`

### Secondary (MEDIUM confidence)
- [Verovio Toolkit Methods Reference](https://book.verovio.org/toolkit-reference/toolkit-methods.html) - API documentation for all timing methods
- [Verovio MIDI Playback](https://book.verovio.org/interactive-notation/playing-midi.html) - getElementsAtTime usage pattern, highlighting code example
- [Verovio CSS and SVG](https://book.verovio.org/interactive-notation/css-and-svg.html) - SVG structure documentation, class naming conventions
- [Verovio Internal Structure](https://book.verovio.org/advanced-topics/internal-structure.html) - SVG hierarchy preservation from MEI
- [GitHub Issue #2237](https://github.com/rism-digital/verovio/issues/2237) - getTimeForElement chord/measure support confirmation

### Tertiary (LOW confidence)
- WebFetch of toolkit.cpp summary - getMIDIValuesForElement returns `{time, pitch, duration}` and getTimesForElement returns `{qfracOn, qfracOff, ...}` field names (may differ from JS wrapper names)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - using already-installed Verovio 6.0.1, verified via package.json and node_modules
- Architecture: HIGH - API shapes verified from @types/verovio and verovio.mjs source code
- Pitfalls: HIGH - derived from confirmed API behavior and existing codebase patterns
- Beat unit conversion: MEDIUM - logical but needs empirical validation with real scores

**Research date:** 2026-02-03
**Valid until:** 2026-03-03 (Verovio 6.x is stable, no breaking changes expected)
