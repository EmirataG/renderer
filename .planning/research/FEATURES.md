# Feature Research: OSMD to Verovio Migration

**Domain:** Music notation rendering engine migration (OSMD -> Verovio)
**Researched:** 2026-02-03
**Confidence:** MEDIUM-HIGH (official Verovio docs verified most claims; some SVG structure details need runtime validation)

## Feature Landscape

This document maps every current OSMD feature to its Verovio equivalent, assessing complexity and risk for each migration path.

### Table Stakes (Must Migrate -- App Breaks Without These)

These features are currently implemented with OSMD and must have working Verovio equivalents for the migration to succeed.

| # | Feature | OSMD Approach | Verovio Approach | Complexity | Risk | Confidence |
|---|---------|---------------|------------------|------------|------|------------|
| 1 | MusicXML loading | `osmd.load(xml)` returns Promise | `tk.loadData(xmlString)` with auto-format detection | LOW | LOW | HIGH |
| 2 | SVG rendering | `osmd.render()` into container DOM node | `tk.renderToSVG(pageNum)` returns SVG string; insert via `innerHTML` | LOW | LOW | HIGH |
| 3 | Event extraction (timing) | Cursor iteration: `cursor.Iterator.currentTimeStamp.RealValue` gives beat onset | `tk.getElementsAtTime(ms)` returns `{page, notes[]}` with element IDs at a given time; requires prior `tk.renderToMIDI()` | MEDIUM | MEDIUM | HIGH |
| 4 | SVG element IDs for notes | `vf-{id}` prefix from VexFlow internals; extracted via `gNote.vfnote[0].getAttribute("id")` | MEI `xml:id` preserved directly as SVG `id` attribute on `<g>` elements; no prefix needed | LOW | LOW | HIGH |
| 5 | Notehead targeting for animation | CSS selector `.vf-notehead` finds notehead `<g>` groups within `#vf-{id}` stavenotes | CSS selector `g.note` targets note groups; child shapes use `<use xlink:href>` referencing glyph `<defs>` | MEDIUM | MEDIUM | MEDIUM |
| 6 | Score color (global) | Inject `<style>` targeting `.vf-stave path`, `[id^="osmdSvgPage"] path/ellipse/etc` | Inject `<style>` targeting `g.note`, `g.staff`, `g.rest` etc. with `fill`/`stroke` | LOW | LOW | HIGH |
| 7 | Zoom / scale | `osmd.zoom = value; osmd.render()` | `tk.setOptions({scale: value}); tk.renderToSVG(page)` then re-insert SVG | LOW | LOW | HIGH |
| 8 | Score layout options | OSMD constructor options: `drawTitle`, `drawComposer`, `drawPartNames`, `drawMeasureNumbers` | Verovio `setOptions()`: `header: 'none'`, `footer: 'none'`, plus MEI-level control | LOW | LOW | HIGH |
| 9 | MusicXML validation | Load into hidden OSMD instance, catch errors on `load()`/`render()` | Call `tk.loadData(xml)`; check return value (empty string on failure) | LOW | LOW | MEDIUM |
| 10 | Cursor X/Y position | `cursor.cursorElement.style.left/top` gives CSS pixel coordinates | No built-in cursor. Use `getElementsAtTime()` to get note IDs, then `getBoundingClientRect()` on SVG element | HIGH | HIGH | MEDIUM |

### Detailed Feature Mapping

---

#### Feature 1: MusicXML Loading

**Current (OSMD):**
```typescript
const osmd = new OpenSheetMusicDisplay(container, { backend: 'svg' });
await osmd.load(xmlString);
osmd.render();
```

**Target (Verovio):**
```typescript
const tk = new verovio.toolkit();
tk.setOptions({ /* rendering options */ });
tk.loadData(xmlString); // auto-detects MusicXML format
const svg = tk.renderToSVG(1); // page 1
container.innerHTML = svg;
```

**Key Differences:**
- OSMD renders directly into a DOM container; Verovio returns an SVG string that you insert into the DOM yourself
- Verovio auto-detects MusicXML vs MEI vs Humdrum format from content
- Verovio also supports compressed MXL via `loadZipDataBase64()` or `loadZipDataBuffer()`
- Verovio paginates output -- you render one page at a time with `renderToSVG(pageNum)`

**Migration complexity:** LOW. The API is simpler if anything.

---

#### Feature 2: Event Extraction and Timing Data

**Current (OSMD):**
```typescript
// Iterate cursor through every beat position
cursor.show(); cursor.reset();
while (!cursor.Iterator.EndReached) {
  const beatOnset = cursor.Iterator.currentTimeStamp.RealValue;
  const voiceEntries = cursor.Iterator.CurrentVoiceEntries;
  // Extract SVG IDs from voice entries -> notes -> gNote -> vfnote
  for (const ve of voiceEntries) {
    for (const n of ve.Notes) {
      const gNote = osmd.EngravingRules.GNote(n);
      const id = gNote.vfnote[0].getAttribute("id");
      svgIds.push(`vf-${id}`);
    }
  }
  cursor.next();
}
```

**Target (Verovio):**
```typescript
// Generate MIDI data first (required for time-based queries)
const midiBase64 = tk.renderToMIDI();

// Query: "what notes are playing at time X?"
const elements = tk.getElementsAtTime(timeInMs);
// Returns: { page: number, notes: string[] }
// notes[] contains MEI xml:id values that are also SVG element IDs

// Reverse query: "when does note X play?"
const timeMs = tk.getTimeForElement(noteId);
```

**Key Differences:**
- OSMD uses a cursor-based sequential iteration model. You walk through beat positions one by one.
- Verovio uses a time-query model. You ask "what plays at time T?" or "when does element X play?"
- Verovio requires `renderToMIDI()` before time queries work (it builds the timing map from MIDI data)
- No cursor object in Verovio -- the entire iteration pattern must change

**Building the event list in Verovio:** Instead of walking a cursor, you would:
1. Call `renderToMIDI()` to build timing data
2. Either: (a) iterate through all note elements in the SVG and call `getTimeForElement(id)` for each, or (b) sample time positions at regular intervals using `getElementsAtTime(ms)` to build the event list
3. Approach (a) is more precise and recommended

**Migration complexity:** MEDIUM. The conceptual model changes from "walk forward through beats" to "query timing for elements." The data structure (`MusicalEvent[]`) can remain similar, but the extraction logic is fundamentally different.

**Risk:** MEDIUM. The MIDI-based timing may differ slightly from OSMD's beat-based timing for complex time signatures or tempo changes. Need to validate with test scores.

---

#### Feature 3: SVG Element IDs and DOM Targeting

**Current (OSMD):**
- SVG IDs use VexFlow prefix: `vf-{auto-generated-id}`
- Stavenote elements: `<g id="vf-auto12345" class="vf-stavenote">`
- Notehead children: `<g class="vf-notehead">` containing `<path>` or `<ellipse>`

**Target (Verovio):**
- SVG IDs use MEI `xml:id`: `<g id="note-0000001234567" class="note">`
- Note elements: `<g id="{meiId}" class="note">`
- Notehead children: `<g class="notehead">` containing `<use xlink:href="#glyph-id">`

**Key Differences:**
- ID format changes: `vf-{hash}` becomes MEI-style IDs (e.g., `note-0000001234567`)
- Class names change: `vf-stavenote` -> `note`, `vf-notehead` -> `notehead`, `vf-stave` -> `staff`
- Shape primitives change: OSMD uses inline `<path>`/`<ellipse>` shapes; Verovio uses `<use xlink:href>` referencing SMuFL glyphs in `<defs>`

**Impact on animation code:**
- All CSS selectors must be updated (find-and-replace scope)
- Notehead animation must target `<use>` elements instead of `<path>`/`<ellipse>` for color changes
- The `<use>` element may need different styling approach -- `fill` on `<use>` should work, but needs testing since `<use>` inherits from referenced `<defs>` element

**Migration complexity:** MEDIUM. Selector updates are mechanical, but the `<use>` vs inline shape difference for animations needs careful testing.

---

#### Feature 4: Notehead Animation

**Current (OSMD):**
```typescript
// Find notehead group, apply scale transform
const noteheads = stavenote.querySelectorAll<SVGGElement>(".vf-notehead");
nh.style.transform = `scale(${scale})`;

// Color: target path/ellipse children directly
const shapes = nh.querySelectorAll<SVGGraphicsElement>("path, ellipse");
shapes.forEach(shape => { shape.style.fill = color; });
```

**Target (Verovio):**
```typescript
// Find note group by ID
const noteEl = document.getElementById(noteId); // <g class="note">

// Scale: apply to the note group or its notehead child
const notehead = noteEl?.querySelector('.notehead');
notehead.style.transform = `scale(${scale})`;

// Color: target <use> elements or the notehead group itself
// Option A: Set fill on notehead group (should cascade to <use>)
notehead.style.fill = color;
// Option B: Target <use> elements directly
const uses = notehead?.querySelectorAll('use');
uses.forEach(u => { u.style.fill = color; });
```

**Key Uncertainty:** How `<use>` elements respond to inline style overrides. In SVG, `<use>` clones the referenced element, and fill/stroke on the `<use>` element should override the referenced content. However, if the referenced glyph in `<defs>` has `fill` set as a presentation attribute (not inherited), the override may not work. This MUST be tested with actual Verovio SVG output.

**Fallback approach:** If `<use>` styling is problematic, an alternative is to set `fill`/`stroke` on the parent `<g class="notehead">` and rely on CSS inheritance, or to use CSS `fill: color !important` scoped to the note ID.

**Migration complexity:** MEDIUM. Core concept is the same (find element, apply CSS transform/color), but the SVG primitive differences need validation.

---

#### Feature 5: Score Color (Global Styling)

**Current (OSMD):**
```css
.preview-score [id^="osmdSvgPage"] path,
.preview-score [id^="osmdSvgPage"] ellipse,
.preview-score [id^="osmdSvgPage"] circle,
.preview-score [id^="osmdSvgPage"] rect:not(.vf-bounding-box),
.preview-score [id^="osmdSvgPage"] line { fill: ${color}; stroke: ${color}; }

.preview-score [id^="osmdSvgPage"] .vf-stave path {
  fill: none !important; stroke: ${color} !important;
  stroke-width: 1 !important; shape-rendering: crispEdges !important;
}
```

**Target (Verovio):**
```css
/* Verovio SVG uses class-based selectors */
.preview-score svg path,
.preview-score svg use,
.preview-score svg line,
.preview-score svg rect { fill: ${color}; stroke: ${color}; }

/* Staff lines */
.preview-score g.staff path { fill: none !important; stroke: ${color} !important; }
```

**Key Differences:**
- Verovio wraps output in a single `<svg>` element (no `osmdSvgPage` prefix)
- Must target `use` elements in addition to `path`/`ellipse` since Verovio uses SMuFL glyph references
- Staff class is `g.staff` instead of `.vf-stave`
- Verovio may not produce `ellipse` elements (uses `<use>` for noteheads instead)

**Migration complexity:** LOW. CSS selector find-and-replace plus adding `use` to the selector list.

---

#### Feature 6: Zoom / Scale

**Current (OSMD):**
```typescript
osmd.zoom = scoreScale; // e.g., 1.0 = 100%
osmd.render(); // re-renders with new zoom
const events = getEventsWithY(osmd); // re-extract events since layout changed
```

**Target (Verovio):**
```typescript
tk.setOptions({ scale: Math.round(scoreScale * 100) }); // Verovio uses percentage (100 = 100%)
const svg = tk.renderToSVG(currentPage);
container.innerHTML = svg;
// Re-extract events since layout changed
```

**Key Differences:**
- OSMD zoom is a decimal multiplier (1.0 = 100%); Verovio scale is a percentage integer (100 = 100%)
- OSMD re-renders in place; Verovio returns new SVG string that must be re-inserted
- After scale change, all event data and element references must be rebuilt (same as current)
- Verovio also supports `svgViewBox: true` option which adds a `viewBox` attribute to the SVG root, enabling pure CSS scaling without re-rendering

**Alternative approach:** Use `svgViewBox: true` in initial options, then scale the SVG container via CSS `transform: scale(X)` without re-rendering. This would be faster than re-rendering but may affect element positioning calculations.

**Migration complexity:** LOW. Direct mapping with a unit conversion (decimal -> percentage).

---

#### Feature 7: Cursor Position / Camera Scrolling

**Current (OSMD):**
```typescript
// Get Y position from cursor's CSS
const cssTop = cursor.cursorElement.style.top;
const y = Number(cssTop.substring(0, cssTop.length - 2));

// Group events by Y (system detection)
// Calculate center Y per system
// Use Y for vertical camera scrolling
```

**Target (Verovio):**
Verovio has no built-in cursor element. To get element positions:

```typescript
// Option A: Use SVG element bounding box (RECOMMENDED)
const noteEl = document.getElementById(noteId);
const bbox = noteEl.getBoundingClientRect();
const y = bbox.top + bbox.height / 2; // center Y of note

// Option B: Use SVG native getBBox()
const svgEl = document.getElementById(noteId) as SVGGraphicsElement;
const svgBBox = svgEl.getBBox(); // returns {x, y, width, height} in SVG coords
```

**Key Differences:**
- OSMD provides a visible cursor element with CSS positioning; Verovio has no cursor
- Position must be derived from the SVG elements themselves via `getBoundingClientRect()` or `getBBox()`
- `getBoundingClientRect()` returns screen coordinates (affected by CSS transforms); `getBBox()` returns SVG coordinate space values
- System detection (grouping events by Y) works the same way once Y values are extracted

**Impact on camera/scrolling:**
- The vertical scrolling animation system (camera) remains conceptually identical
- Y extraction method changes from "read cursor CSS" to "read element bounding box"
- May need to account for SVG coordinate system vs pixel coordinate system differences
- Multi-page scores: Verovio paginates, so "scrolling" may need to change to page-flipping for multi-page layouts, OR render all pages in one long SVG using `adjustPageHeight: true` + large `pageHeight`

**Migration complexity:** HIGH. No cursor equivalent means building position extraction from scratch. Multi-page handling adds complexity.

**Risk:** HIGH. This is the most architecturally different feature. The current system relies heavily on OSMD's cursor for both X and Y positioning.

---

#### Feature 8: MusicXML Validation

**Current (OSMD):**
```typescript
// Create hidden OSMD instance, attempt load + render, catch errors
const osmd = new OpenSheetMusicDisplay(hiddenContainer, { ... });
await osmd.load(xmlContent);
osmd.render(); // throws on invalid content
return { valid: true, measureCount: osmd.Sheet.SourceMeasures.length };
```

**Target (Verovio):**
```typescript
const tk = new verovio.toolkit();
const loaded = tk.loadData(xmlContent);
// loadData returns a boolean or the loaded content
// If it fails, it returns false/empty

if (!loaded) {
  return { valid: false, error: "Invalid MusicXML" };
}

// Attempt render to catch rendering errors
const svg = tk.renderToSVG(1);
if (!svg) {
  return { valid: false, error: "Cannot render score" };
}

// Get page count as proxy for measure count
const pageCount = tk.getPageCount();
return { valid: true, pageCount };
```

**Key Differences:**
- OSMD validation requires DOM container and full render cycle; Verovio can validate without DOM (headless)
- Verovio's `loadData()` is synchronous (no Promise needed)
- Verovio does not throw on invalid input -- it returns empty/false
- Getting exact measure count may require parsing the MEI output (`tk.getMEI()`) or using `select()` to probe measure ranges

**Improvement opportunity:** Verovio validation is lighter weight since it does not need a DOM container, making the "hidden container" pattern unnecessary.

**Migration complexity:** LOW. Simpler API, fewer moving parts.

---

#### Feature 9: Click-to-Select (SyncEditor)

**Current (OSMD):**
```typescript
// Event delegation on container
const stavenote = target.closest('.vf-stavenote');
const noteId = stavenote.id;
const event = events.find(evt => evt.svgIds.some(id => id === noteId));
```

**Target (Verovio):**
```typescript
// Event delegation on container
const note = target.closest('g.note');
const noteId = note?.id;
// Look up event by noteId
// Can also use tk.getTimeForElement(noteId) to get timing directly
```

**Key Differences:**
- Selector changes from `.vf-stavenote` to `g.note`
- Verovio provides `getTimeForElement(id)` which can give timing directly from click without maintaining a separate event list
- Additional MEI attributes available via `tk.getElementAttr(noteId)` for pitch, duration, etc.

**Migration complexity:** LOW. Nearly identical pattern with updated selectors.

---

### Differentiators (New Capabilities Verovio Enables)

Features that Verovio makes possible or easier that OSMD does not support (or supports poorly).

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Headless validation | Validate MusicXML without DOM, enables server-side validation | LOW | Verovio runs in Node.js and Web Workers |
| `getTimeForElement()` direct query | Get timing for any clicked note without maintaining event list | LOW | Simplifies SyncEditor significantly |
| `getElementAttr()` rich metadata | Get pitch name, octave, duration, articulation from any note | LOW | Enables pitch-aware features (color by pitch, etc.) |
| `svgAdditionalAttribute` data attrs | Expose MEI attributes as `data-*` on SVG elements for CSS selection | LOW | Enables `g[data-pname="c"]` selectors |
| `svgViewBox` CSS-based scaling | Scale score via CSS transform instead of re-rendering | LOW | Faster zoom with no re-render cost |
| Multi-format support | Load Humdrum, ABC, MEI directly | LOW | Broader file support if desired |
| `select()` measure ranges | Render only measures 1-10, for example | LOW | Useful for focused practice views |
| MEI export | `getMEI()` exports clean MEI from any input format | LOW | Enables format conversion workflows |
| Web Worker rendering | Offload rendering to background thread | MEDIUM | Prevents UI thread blocking for large scores |

### Anti-Features (Patterns to Avoid During Migration)

Features or approaches that seem good but will create problems.

| Anti-Feature | Why Requested | Why Problematic | Alternative |
|--------------|---------------|-----------------|-------------|
| Per-page rendering for scrolling scores | Verovio natively paginates | Page-flipping breaks the vertical scroll camera model the app depends on | Use `adjustPageHeight: true` with large `pageHeight` to get single continuous SVG output |
| Re-rendering SVG on every animation frame | Could update note colors via re-render | Extremely expensive; Verovio re-render is ~10-50ms | Manipulate SVG DOM directly (current approach, just update selectors) |
| Using MIDI timing as sole source of truth | Verovio MIDI export is convenient | MIDI timing may not account for tempo changes, fermatas, or rubato that sync anchors handle | Keep the existing anchor-based interpolation system; use Verovio MIDI only for building initial event list |
| Wrapping Verovio in React state | Tempting to store Verovio toolkit in useState | Verovio toolkit is a WASM-backed C++ object; re-creating it is expensive | Use useRef for toolkit instance, same pattern as current osmdRef |
| Using Verovio's MIDI player for audio | Verovio can generate MIDI for playback | MIDI playback sounds robotic; app already has real audio sync | Keep existing audio sync architecture; use Verovio only for rendering and timing queries |

## Feature Dependencies

```
MusicXML Loading
    |
    v
SVG Rendering  ----->  Score Color (CSS styling)
    |                       |
    v                       v
Event Extraction  <---  SVG Element IDs
    |
    +-------> Cursor Position / Y extraction
    |              |
    |              v
    |         Camera Scrolling (vertical)
    |
    +-------> Notehead Animation
    |              |
    |              v
    |         Animation Controller (Puppeteer)
    |
    +-------> Click-to-Select (SyncEditor)
    |              |
    |              v
    |         Timestamp Interpolation (unchanged)
    |
    v
Zoom / Scale ------> Re-extract events after layout change
```

### Dependency Notes

- **SVG Rendering must precede everything else:** All DOM interaction depends on SVG being in the DOM
- **Event Extraction depends on SVG Element IDs:** Need to know the ID format to build event list
- **Notehead Animation depends on Event Extraction:** Need svgIds from events to target noteheads
- **Camera Scrolling depends on Y position extraction:** This is the hardest dependency -- Y extraction requires new approach
- **Zoom/Scale triggers full re-extraction:** Same as current OSMD behavior; after zoom, events and positions change
- **Timestamp Interpolation is engine-agnostic:** The interpolation.ts module works on `MusicalEvent[]` and does not depend on OSMD or Verovio directly -- no migration needed

## MVP Definition

### Phase 1: Core Rendering (Launch With)

Minimum to get Verovio rendering and basic interaction working.

- [ ] **MusicXML loading via Verovio** -- Replace `OpenSheetMusicDisplay` with Verovio toolkit
- [ ] **SVG rendering into container** -- `renderToSVG()` + innerHTML insertion
- [ ] **Layout options** -- Match current OSMD config (no title, no composer, no part names)
- [ ] **Score color (global CSS)** -- Update selectors for Verovio class names
- [ ] **Zoom/scale** -- `setOptions({scale})` + re-render
- [ ] **MusicXML validation** -- Replace OSMD-based validation with Verovio `loadData()` check

### Phase 2: Event System (Critical Path)

Build the event extraction pipeline that everything else depends on.

- [ ] **Event extraction via Verovio** -- Build event list using `getTimeForElement()` for each note element
- [ ] **SVG ID mapping** -- Map Verovio's MEI-style IDs to `MusicalEvent.svgIds`
- [ ] **Y position extraction** -- Use `getBBox()` or `getBoundingClientRect()` to get note Y positions
- [ ] **System detection** -- Group notes by Y (same algorithm, new data source)
- [ ] **Verify `MusicalEvent` interface compatibility** -- Ensure output matches what interpolation.ts expects

### Phase 3: Animation and Interaction

Restore all interactive features with new SVG structure.

- [ ] **Notehead animation** -- Update selectors, validate `<use>` element styling
- [ ] **Camera scrolling** -- Plug new Y positions into existing camera system
- [ ] **Animation controller** -- Update DOM queries for Puppeteer frame capture
- [ ] **Click-to-select (SyncEditor)** -- Update event delegation selectors
- [ ] **Audio sync playback** -- Verify timing alignment between Verovio MIDI times and audio

### Phase 4: Polish and Validation

- [ ] **Cross-score testing** -- Test with 10+ diverse MusicXML files
- [ ] **Performance comparison** -- Benchmark Verovio vs OSMD render times
- [ ] **Edge cases** -- Multi-voice, chords, grace notes, tuplets, key/time signature changes
- [ ] **Puppeteer render pipeline** -- Validate frame-accurate rendering with new engine

### Future Consideration (v2+)

- [ ] **Web Worker rendering** -- Offload Verovio to background thread for large scores
- [ ] **`svgAdditionalAttribute` enrichment** -- Expose pitch/octave data for advanced features
- [ ] **MEI round-trip** -- Edit/annotate scores using Verovio's MEI capabilities
- [ ] **Multi-page navigation** -- Support very long scores with page-flipping (currently using scroll)

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Migration Risk | Priority |
|---------|------------|---------------------|----------------|----------|
| MusicXML loading | HIGH | LOW | LOW | P1 |
| SVG rendering | HIGH | LOW | LOW | P1 |
| Score color | HIGH | LOW | LOW | P1 |
| Zoom/scale | HIGH | LOW | LOW | P1 |
| MusicXML validation | MEDIUM | LOW | LOW | P1 |
| Layout options | MEDIUM | LOW | LOW | P1 |
| Event extraction | HIGH | MEDIUM | MEDIUM | P1 |
| SVG element IDs | HIGH | LOW | LOW | P1 |
| Y position extraction | HIGH | HIGH | HIGH | P1 |
| Notehead animation | HIGH | MEDIUM | MEDIUM | P1 |
| Camera scrolling | HIGH | MEDIUM | HIGH | P1 |
| Click-to-select | MEDIUM | LOW | LOW | P2 |
| Animation controller | HIGH | MEDIUM | MEDIUM | P2 |
| Audio sync | HIGH | LOW | MEDIUM | P2 |
| Web Worker rendering | LOW | MEDIUM | LOW | P3 |
| svgAdditionalAttribute | LOW | LOW | LOW | P3 |

**Priority key:**
- P1: Must migrate -- app is broken without it
- P2: Should migrate promptly -- key workflows depend on it
- P3: Nice to have -- enables future features

## Competitor Feature Analysis (OSMD vs Verovio)

| Feature | OSMD | Verovio | Impact on Migration |
|---------|------|---------|---------------------|
| MusicXML support | Full | Full (auto-detection) | Neutral |
| SVG output | Inline DOM rendering | SVG string return | Minor refactor |
| Cursor/iterator | Built-in cursor with DOM element | No cursor; time-based queries instead | Major refactor |
| Note timing | Beat-based (RealValue fractions) | Millisecond-based (from MIDI) | Unit conversion needed |
| Element IDs | VexFlow auto-generated | MEI xml:id (stable, meaningful) | Better -- IDs are stable across re-renders |
| SVG structure | VexFlow primitives (path, ellipse) | SMuFL glyphs via `<use>` refs | CSS selector updates needed |
| Zoom | Decimal multiplier (1.0 = 100%) | Integer percentage (100 = 100%) | Trivial conversion |
| Package size | ~2MB | ~4MB (WASM) | Larger bundle |
| Render speed | DOM-based (fast incremental) | WASM-based (fast initial, full re-render) | Comparable for this use case |
| TypeScript | Good types | Types available in package | Neutral |
| Maintenance | Less actively maintained | Actively maintained (v6.0.1, Jan 2026) | Verovio is better long-term bet |
| MEI support | None | Native | Enables future features |
| Rich metadata | Limited | `getElementAttr()` returns all MEI attrs | Verovio advantage |

## Critical Migration Observations

### 1. The Cursor Gap is the Biggest Challenge

OSMD's cursor is deeply integrated into the current architecture. It provides:
- Sequential note iteration (beat-by-beat walking)
- SVG IDs per beat position
- CSS position (X, Y) for each beat

Verovio has NO equivalent. The replacement requires:
- Building the event list from SVG DOM + `getTimeForElement()`
- Extracting positions from SVG element bounding boxes
- Handling the beat-onset -> millisecond time model change

**Recommendation:** Build and thoroughly test the event extraction layer BEFORE migrating any animation or camera code. This is the foundational dependency.

### 2. The `<use>` Element Styling Question

Verovio's SVG uses `<use xlink:href>` to reference glyph shapes from `<defs>`. Whether inline CSS styles (fill, stroke, transform) apply correctly to `<use>` elements in all browsers needs runtime validation. This is a blocking question for the notehead animation feature.

**Recommendation:** Create a minimal Verovio test harness early in Phase 1 to validate `<use>` element styling behavior before committing to the animation implementation approach.

### 3. Time Unit Mismatch

OSMD uses beat fractions (0.0, 0.25, 0.5, 1.0 for quarter notes in 4/4). Verovio uses milliseconds. The current interpolation system works in beat-space. This needs careful handling:
- `MusicalEvent.beatOnset` currently stores beat fractions from OSMD
- Verovio's `getTimeForElement()` returns milliseconds
- The interpolation system can work with either unit, but the mapping to audio timestamps changes

**Recommendation:** The `MusicalEvent` interface may need a `timeMs` field alongside or instead of `beatOnset`, or the extraction layer should convert Verovio ms to beat fractions for compatibility.

### 4. Single-Page vs Multi-Page

Verovio natively paginates scores. The current app renders one long scrollable score. To preserve the scrolling behavior:
- Set `pageHeight` to a very large value (e.g., 60000)
- Set `adjustPageHeight: true` to trim to actual content height
- Set `breaks: 'auto'` for system breaks within the single page

This forces Verovio to produce a single-page output matching the current scroll model.

## Sources

- Verovio Reference Book: https://book.verovio.org (v6.0, January 28, 2026) -- HIGH confidence
- Verovio toolkit methods: https://book.verovio.org/toolkit-reference/toolkit-methods.html -- HIGH confidence
- Verovio toolkit options: https://book.verovio.org/toolkit-reference/toolkit-options.html -- HIGH confidence
- Verovio input formats: https://book.verovio.org/toolkit-reference/input-formats.html -- HIGH confidence
- Verovio CSS and SVG: https://book.verovio.org/interactive-notation/css-and-svg.html -- HIGH confidence
- Verovio MIDI playback tutorial (getElementsAtTime pattern): https://book.verovio.org/interactive-notation/playing-midi.html -- HIGH confidence
- Verovio GitHub (version info): https://github.com/rism-digital/verovio -- HIGH confidence
- Verovio npm registry (v6.0.1): npm package `verovio` -- HIGH confidence
- Current codebase analysis: RegularRenderer.tsx, getEvents.ts, noteAnimation.ts, musicxmlValidation.ts, animationController.ts, SyncEditor.tsx -- HIGH confidence (direct source code review)

---
*Feature research for: OSMD to Verovio migration*
*Researched: 2026-02-03*
