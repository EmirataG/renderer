# Architecture Research: OSMD-to-Verovio Migration

**Domain:** Music notation rendering engine replacement in React
**Researched:** 2026-02-03
**Confidence:** HIGH (verified against official Verovio docs, SVG samples in repo, and existing codebase)

## Current Architecture (OSMD)

Before defining the target, documenting what currently exists and what each component truly depends on.

```
App.tsx (state owner)
 |
 +--> RegularRenderer.tsx
 |      - Creates OSMD instance (new OpenSheetMusicDisplay(domRef))
 |      - Calls osmd.load(xml) -> osmd.render()
 |      - OSMD injects SVG directly into the DOM container
 |      - Iterates Cursor API to extract MusicalEvent[] with {beatOnset, svgIds, x, y}
 |      - SVG IDs follow OSMD/VexFlow convention: "vf-{id}" on <g class="vf-stavenote">
 |      - Noteheads live under <g class="vf-notehead"> containing <path>/<ellipse>
 |      - Queries DOM for .vf-notehead elements to animate scale/color
 |      - Exposes window.animationController for Puppeteer frame capture
 |
 +--> SyncEditor.tsx
 |      - Separate OSMD instance (independent lifecycle)
 |      - Same Cursor-based event extraction (duplicated getEventsFromOsmd)
 |      - Click-to-select notes by matching .vf-stavenote IDs to events
 |      - Colors noteheads via inline style on .vf-notehead path/ellipse
 |      - Exposes window.setAnimationFrame for Puppeteer
 |
 +--> lib/getEvents.ts
 |      - Uses OSMD Cursor: cursor.Iterator.currentTimeStamp.RealValue
 |      - Gets SVG IDs via: osmd.EngravingRules.GNote(note).vfnote[0].getAttribute("id")
 |      - Gets X position from cursor.cursorElement.style.left
 |      - Returns MusicalEvent[] with {id, beatOnset, beatDuration, svgIds, x}
 |
 +--> lib/noteAnimation.ts
 |      - Queries: root.querySelector(`#${CSS.escape(id)}`)
 |      - Then: stavenote.querySelectorAll(".vf-notehead")
 |      - Animates: nh.style.transform = `scale(${scale})`
 |      - Colors: shape.style.fill = color; shape.style.stroke = color
 |      - Reset: removes inline fill/stroke, resets transform
 |
 +--> lib/animationController.ts
 |      - Wraps OSMD instance + containerElement for Puppeteer
 |      - Uses getInterpolatedEvents() callback to find event at timestamp
 |      - Highlights notes via same querySelector + inline style pattern
 |
 +--> lib/musicxmlValidation.ts
 |      - Creates throwaway OSMD instance in hidden div
 |      - osmd.load(xml) + osmd.render() to validate
 |      - Accesses osmd.Sheet.SourceMeasures.length for measure count
 |
 +--> lib/interpolation.ts
        - Pure function: MusicalEvent[] + Map<string,number> -> InterpolatedEvent[]
        - No OSMD dependency (only uses MusicalEvent interface)
        - Unchanged by migration
```

### Key Coupling Points (What Must Change)

| Current Coupling | Where Used | Migration Impact |
|-----------------|------------|------------------|
| `new OpenSheetMusicDisplay(domRef)` | RegularRenderer, SyncEditor, musicxmlValidation | Replace with `VerovioToolkit` singleton |
| `osmd.load(xml)` + `osmd.render()` | RegularRenderer, SyncEditor, musicxmlValidation | Replace with `tk.loadData(xml)` + `tk.renderToSVG(page)` |
| Cursor API iteration | RegularRenderer (getEventsWithY), SyncEditor (getEventsFromOsmd), getEvents.ts | Replace with `tk.getElementsAtTime()` / `tk.getTimeForElement()` |
| `osmd.EngravingRules.GNote(n).vfnote[0].getAttribute("id")` | getEvents.ts, RegularRenderer, SyncEditor | SVG IDs come directly from MEI xml:id in Verovio output |
| `.vf-stavenote`, `.vf-notehead` CSS selectors | noteAnimation.ts, animationController.ts, SyncEditor, RegularRenderer | Replace with `g.note`, `g.notehead` (Verovio class names) |
| `osmd.zoom = scale; osmd.render()` | RegularRenderer | Replace with `tk.setOptions({scale: pct}); tk.renderToSVG()` |
| `osmd.Sheet.SourceMeasures.length` | musicxmlValidation.ts | Replace with `tk.getPageCount()` or parse MEI |
| OSMD manages own DOM | RegularRenderer, SyncEditor | Verovio returns SVG string; we manage DOM insertion |

### What Does NOT Change

| Component | Why Unchanged |
|-----------|---------------|
| `interpolation.ts` | Pure function on MusicalEvent interface, no OSMD reference |
| `syncStore.ts` | Zustand store for anchor state, no OSMD reference |
| `App.tsx` | Orchestrates components, passes props -- no direct OSMD usage |
| `ScoreRegionEditor.tsx` | UI overlay, no rendering engine dependency |
| `BorderPicker.tsx`, `borders/` | Decorative borders, no rendering engine dependency |
| `fileValidation.ts` | File type detection, no OSMD reference |
| Camera/scroll logic | Needs Y positions but does not care where they come from |
| Puppeteer window API | Interface stays the same; implementation changes underneath |

---

## Recommended Architecture (Verovio)

### System Overview

```
App.tsx (state owner -- unchanged)
 |
 +--> verovioService.ts (NEW -- singleton WASM module)
 |      - Initializes WASM once: createVerovioModule() -> VerovioModule
 |      - Exposes factory: createToolkit() -> VerovioToolkit
 |      - Exposes readiness signal: isReady: Promise<void>
 |
 +--> useVerovio.ts (NEW -- React hook)
 |      - Awaits verovioService.isReady
 |      - Creates VerovioToolkit per consumer
 |      - Manages loadData + setOptions + renderToSVG lifecycle
 |      - Returns: { svgString, toolkit, isLoading, pageCount }
 |
 +--> RegularRenderer.tsx (MODIFIED)
 |      - Uses useVerovio() hook instead of OSMD constructor
 |      - Renders SVG via dangerouslySetInnerHTML={{ __html: svgString }}
 |      - Extracts events via getVerovioEvents(toolkit) -- new lib function
 |      - Animates noteheads by querying g.note / g.notehead in rendered DOM
 |      - Camera/scroll logic structurally unchanged (just new Y source)
 |
 +--> SyncEditor.tsx (MODIFIED)
 |      - Uses useVerovio() hook
 |      - Click handling: target.closest('g.note') instead of .vf-stavenote
 |      - Note coloring: same inline style pattern, new selectors
 |
 +--> lib/getVerovioEvents.ts (NEW -- replaces getEvents.ts)
 |      - Uses toolkit.getTimeForElement(noteId) for timing
 |      - Iterates SVG DOM for g.note elements and their positions
 |      - Returns MusicalEvent[] with same interface (drop-in for interpolation.ts)
 |
 +--> lib/noteAnimation.ts (MODIFIED -- selector changes only)
 |      - Old: querySelector(".vf-notehead")
 |      - New: querySelector("g.notehead") or querySelector("g.note .notehead")
 |      - Transform/color logic identical
 |
 +--> lib/animationController.ts (MODIFIED -- drop OSMD type, use container ref)
 |      - Remove OpenSheetMusicDisplay import
 |      - Keep containerElement + getInterpolatedEvents pattern
 |      - Update selectors to Verovio classes
 |
 +--> lib/musicxmlValidation.ts (MODIFIED)
        - Use shared WASM module from verovioService
        - tk.loadData(xml) returns boolean (true = valid)
        - No hidden DOM container needed (Verovio does not need DOM to load)
        - Much faster validation (no DOM rendering required)
```

### Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| `verovioService.ts` | WASM init, module lifecycle, toolkit factory | Used by useVerovio hook and musicxmlValidation |
| `useVerovio.ts` | React lifecycle for toolkit (load, render, options) | Consumes verovioService; returns SVG + toolkit to components |
| `getVerovioEvents.ts` | Extract MusicalEvent[] from Verovio toolkit + rendered SVG DOM | Consumes VerovioToolkit + DOM ref; feeds into interpolation.ts |
| `RegularRenderer.tsx` | Score display, camera, animation, Puppeteer API | Consumes useVerovio + getVerovioEvents + noteAnimation |
| `SyncEditor.tsx` | Interactive note selection, anchor editing | Consumes useVerovio + getVerovioEvents + syncStore |
| `noteAnimation.ts` | SVG element animation (scale, color, transitions) | Receives DOM container ref + SVG element IDs |
| `animationController.ts` | Puppeteer frame-by-frame control interface | Wraps container + interpolated events |
| `musicxmlValidation.ts` | File validity check before full rendering | Consumes verovioService directly (no React) |

### Data Flow

```
[MusicXML string]
       |
       v
[verovioService.createToolkit()] -- WASM module ready
       |
       v
[toolkit.loadData(xml)] -- Verovio parses MusicXML, converts to MEI internally
       |
       v
[toolkit.setOptions({pageWidth, scale, adjustPageHeight, svgViewBox, ...})]
       |
       v
[toolkit.renderToSVG(pageNo)] -- returns SVG string per page
       |
       v
[dangerouslySetInnerHTML on <div ref={scoreRef}>] -- React inserts SVG into DOM
       |
       +----> [getVerovioEvents(toolkit, scoreRef.current)]
       |        |
       |        +-- Iterates g.note elements in rendered SVG DOM
       |        +-- For each note ID: toolkit.getTimeForElement(id) -> ms
       |        +-- Reads transform/position from SVG attributes for x, y
       |        +-- Returns MusicalEvent[] (same interface as before)
       |
       +----> [interpolateTimestamps(events, anchors)] -- unchanged
       |        |
       |        +-- Returns InterpolatedEvent[] with computedTimestamp
       |
       +----> [noteAnimation.animateNoteheads(scoreRef, svgIds, options)]
       |        |
       |        +-- querySelector(`#${noteId}`)  -- Verovio preserves MEI IDs
       |        +-- querySelectorAll("g.notehead") -- Verovio class convention
       |        +-- Apply CSS transforms + inline colors
       |
       +----> [Camera: applyCamera(targetY)]
                |
                +-- Same translateY logic, just fed by Verovio Y positions
```

---

## Architectural Patterns

### Pattern 1: Singleton WASM Module, Multiple Toolkits

**What:** Initialize the WASM module exactly once. Create separate `VerovioToolkit` instances for each consumer (RegularRenderer, SyncEditor, validation).

**Why this matters:** The WASM module (`createVerovioModule()`) is heavy to load (~3-5MB). Loading it multiple times wastes memory and introduces race conditions. But `VerovioToolkit` instances are lightweight -- each holds its own score state, so multiple instances are safe and necessary (RegularRenderer and SyncEditor need independent state).

**Trade-offs:**
- Pro: Fast toolkit creation after first load; independent score state per consumer
- Pro: Validation can use a toolkit without needing a DOM at all
- Con: Must handle the "not yet loaded" state in React components

**Implementation:**

```typescript
// src/lib/verovioService.ts
import createVerovioModule from 'verovio/wasm';
import { VerovioToolkit } from 'verovio/esm';

let modulePromise: Promise<any> | null = null;
let resolvedModule: any = null;

function ensureModule(): Promise<any> {
  if (resolvedModule) return Promise.resolve(resolvedModule);
  if (!modulePromise) {
    modulePromise = createVerovioModule().then(mod => {
      resolvedModule = mod;
      return mod;
    });
  }
  return modulePromise;
}

export async function createToolkit(): Promise<VerovioToolkit> {
  const mod = await ensureModule();
  return new VerovioToolkit(mod);
}

export const isReady: Promise<void> = ensureModule().then(() => {});
```

### Pattern 2: SVG-as-String Rendering via dangerouslySetInnerHTML

**What:** Verovio returns SVG as a string. Insert it into the DOM via `dangerouslySetInnerHTML`, then query the live DOM for animation targets.

**Why this pattern (not alternatives):**
- `dangerouslySetInnerHTML` is the standard React approach for inserting raw HTML/SVG strings
- Parsing the SVG string into React elements would be extremely slow and fragile
- The XSS risk is zero because the SVG is generated by Verovio from our own MusicXML, not user-supplied HTML
- A known React issue causes `dangerouslySetInnerHTML` on SVG `<g>` elements to not update in some browsers; using a `<div>` wrapper avoids this

**Trade-offs:**
- Pro: Simple, fast, well-understood
- Con: React cannot track individual SVG elements (no virtual DOM diffing)
- Con: Must use refs and direct DOM queries for animation (but we already do this with OSMD)
- Mitigation: This is exactly how the current OSMD architecture works -- OSMD manages its own DOM, and we query into it. Verovio just makes the insertion point explicit.

**Implementation:**

```typescript
// In RegularRenderer.tsx
const scoreRef = useRef<HTMLDivElement>(null);
const { svgString } = useVerovio(xml, options);

return (
  <div
    ref={scoreRef}
    className="preview-score"
    dangerouslySetInnerHTML={{ __html: svgString }}
  />
);
```

**Critical detail:** After React commits the innerHTML, the DOM is live and queryable. Animation code that runs in `useEffect` or `requestAnimationFrame` callbacks will see the real SVG elements. The timing is the same as current OSMD: after render, query the DOM.

### Pattern 3: Event Extraction via DOM Walk + getTimeForElement

**What:** After SVG is inserted into the DOM, walk the `g.note` elements to build the `MusicalEvent[]` array, using `toolkit.getTimeForElement(id)` for timing and SVG element positions for x/y coordinates.

**Why this replaces the Cursor API:** OSMD provides a Cursor that steps through the score sequentially. Verovio has no equivalent cursor. Instead, Verovio's SVG output preserves MEI element IDs on every `g.note`, and `getTimeForElement(id)` returns the MIDI-based onset time in milliseconds.

**Trade-offs:**
- Pro: More direct than Cursor iteration (no show/hide/next loop)
- Pro: IDs are stable (MEI xml:id, not VexFlow generated IDs)
- Con: Time values are MIDI-based (assumes default tempo), not beat-based like OSMD's `currentTimeStamp.RealValue`
- Mitigation: Convert ms to beats using tempo from the score, or use ms directly since interpolation.ts can work with either unit

**Implementation sketch:**

```typescript
// src/lib/getVerovioEvents.ts
import type { MusicalEvent } from './getEvents';

export function getVerovioEvents(
  toolkit: VerovioToolkit,
  container: HTMLElement
): MusicalEvent[] {
  const noteElements = container.querySelectorAll<SVGGElement>('g.note');
  const events: MusicalEvent[] = [];

  noteElements.forEach((noteEl, index) => {
    const id = noteEl.getAttribute('id');
    if (!id) return;

    // getTimeForElement returns onset time in milliseconds
    const timeMs = toolkit.getTimeForElement(id);
    const beatOnset = timeMs / 1000; // or convert using tempo

    // Get position from SVG transform or bounding box
    const bbox = noteEl.getBoundingClientRect();
    // Relative to container for consistent coordinates
    const containerRect = container.getBoundingClientRect();

    events.push({
      id: `evt-${index}`,
      beatOnset,
      beatDuration: 0, // filled in second pass
      svgIds: [id],     // Verovio uses MEI IDs directly, no "vf-" prefix
      x: bbox.left - containerRect.left,
    });
  });

  // Calculate durations (same as current code)
  for (let i = 0; i < events.length - 1; i++) {
    events[i].beatDuration = events[i + 1].beatOnset - events[i].beatOnset;
  }
  if (events.length > 0) {
    events[events.length - 1].beatDuration = 1;
  }

  return events;
}
```

### Pattern 4: Multi-Page Rendering with Vertical Concatenation

**What:** Verovio paginates its output. For the scrolling camera (vertical layout), render all pages and concatenate the SVG strings, or use `adjustPageHeight: true` with a very tall page to get a single continuous SVG.

**Why this matters:** The current OSMD renderer uses `renderSingleHorizontalStaffline: false` (normal page flow) and scrolls vertically. Verovio's default is paginated output. To match the current behavior, we need either:
- Option A: Set `pageHeight` very large + `adjustPageHeight: true` to get one tall SVG
- Option B: Render page by page and stack them vertically in the DOM

**Recommendation: Option A** (single tall page) because:
- Simpler DOM structure (one SVG element)
- Camera translateY logic works unchanged
- Animation queries don't need to span multiple SVG roots
- `adjustPageHeight` shrinks the SVG to actual content height

```typescript
toolkit.setOptions({
  pageWidth: containerWidth * 100 / scale, // Convert from px to Verovio units
  pageHeight: 60000,                        // Very tall to avoid pagination
  adjustPageHeight: true,                   // Shrink to actual content
  scale: scale,                             // Percentage (100 = normal)
  svgViewBox: true,                         // Enable viewBox for responsive sizing
  breaks: 'auto',                           // Let Verovio decide line breaks
  header: 'none',                           // Match current OSMD: drawTitle: false
  footer: 'none',
});
```

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Initializing WASM Per Component

**What people do:** Call `createVerovioModule()` inside each component's `useEffect`.
**Why it is wrong:** Each call loads the entire WASM binary (~3-5MB) again. With two components (RegularRenderer + SyncEditor), that doubles memory and load time. The musicxmlValidation utility would add a third.
**Do this instead:** Use the singleton `verovioService.ts` pattern. Initialize once, create lightweight toolkit instances per consumer.

### Anti-Pattern 2: Re-rendering SVG on Every Animation Frame

**What people do:** Call `toolkit.renderToSVG()` inside `requestAnimationFrame` to update highlighting.
**Why it is wrong:** Verovio SVG rendering is computationally expensive (full layout + SVG generation). At 60fps this would be catastrophic for performance.
**Do this instead:** Render SVG once on load/resize. Animate by manipulating inline styles on existing SVG DOM elements (exactly as current code does with OSMD). Use CSS classes (`g.note.playing { fill: crimson; }`) for state-based styling.

### Anti-Pattern 3: Parsing SVG String Instead of Querying DOM

**What people do:** Use regex or DOMParser to extract note positions from the SVG string before inserting into DOM.
**Why it is wrong:** Fragile, slow, and positions depend on CSS layout (viewBox scaling, container width). Only the live DOM has accurate bounding boxes.
**Do this instead:** Insert SVG via `dangerouslySetInnerHTML` first, then query the live DOM for positions via `getBoundingClientRect()`. This is the same timing as current OSMD code (query after render).

### Anti-Pattern 4: Using getElementsAtTime for All Event Extraction

**What people do:** Loop through timestamps calling `getElementsAtTime(ms)` at regular intervals to build the event list.
**Why it is wrong:** This is a reverse-lookup function designed for playback highlighting (given a time, what notes are active?). It does not give you a complete list of all notes with their exact onset times. You would miss notes between your sample points.
**Do this instead:** Walk the SVG DOM for all `g.note` elements, then call `getTimeForElement(id)` on each to get its exact onset time. Use `getElementsAtTime()` only during real-time playback for highlighting (if needed).

---

## Verovio SVG Structure (verified from sample1.svg in repo)

The SVG structure from Verovio differs significantly from OSMD/VexFlow. This is the critical mapping for animation code.

### Element ID Convention

| Property | OSMD (VexFlow) | Verovio |
|----------|---------------|---------|
| Note group | `<g class="vf-stavenote" id="vf-{hash}">` | `<g class="note" id="{meiXmlId}">` |
| Notehead | `<g class="vf-notehead">` nested inside stavenote | `<g class="notehead">` nested inside note |
| Note shapes | `<path>`, `<ellipse>` inside .vf-notehead | `<use xlink:href="#...">` inside .notehead |
| Stave | `<g class="vf-stave">` | `<g class="staff">` |
| Measure | No explicit wrapper | `<g class="measure" id="{meiId}">` |
| System | No explicit wrapper | `<g class="system" id="{meiId}">` |
| Clef | Internal to stave rendering | `<g class="clef" id="{meiId}">` |
| SVG root | `<svg id="osmdSvgPage{n}">` | `<svg viewBox="...">` with `<g class="page-margin">` |

### Critical Selector Migration Table

| Purpose | OSMD Selector | Verovio Selector |
|---------|--------------|-----------------|
| Find a note by ID | `#${CSS.escape('vf-' + id)}` | `#${CSS.escape(id)}` |
| All noteheads in a note | `.vf-notehead` | `g.notehead` or `.notehead` |
| Shapes to color | `.vf-notehead path, .vf-notehead ellipse` | `g.notehead use` (but `use` inherits fill from parent -- style the `g.notehead` or the `use` element) |
| All notes | `.vf-stavenote` | `g.note` |
| Staff lines | `.vf-stave path` | `g.staff > path` |
| Bounding boxes | `.vf-bounding-box` | Not present (Verovio does not generate bounding boxes) |
| SVG page root | `[id^="osmdSvgPage"]` | `svg.definition-scale` or just the root `<svg>` |

### Styling Difference: `<use>` Elements

**This is the most impactful rendering difference.** OSMD/VexFlow draws noteheads as inline `<path>` and `<ellipse>` elements. Verovio draws them as `<use xlink:href="#...">` referencing `<defs>`. The `<use>` element creates a shadow DOM copy, and its fill/stroke can be overridden by setting `fill`/`stroke` on the `<use>` element itself or its parent `<g>`.

```
OSMD structure:
<g class="vf-notehead">
  <path d="..." />          <-- style this directly
  <ellipse cx="..." />      <-- style this directly
</g>

Verovio structure:
<g class="notehead">
  <use xlink:href="#E0A4-..." transform="translate(...)" />  <-- style fill/stroke here
</g>
```

**Animation code migration:** Instead of querying `path, ellipse` inside noteheads, query `use` elements. Or set `fill`/`stroke` on the parent `g.notehead` element and rely on CSS inheritance. The CSS inheritance approach is cleaner:

```css
/* Color all shapes inside a note */
g.note.playing g.notehead {
  fill: crimson;
  stroke: crimson;
}
```

```typescript
// Programmatic highlighting
const notehead = noteEl.querySelector('g.notehead');
if (notehead) {
  (notehead as SVGElement).style.fill = color;
  (notehead as SVGElement).style.stroke = color;
}
```

---

## Scaling and Responsive Rendering

### Current OSMD Approach
- `osmd.zoom = scoreScale` changes internal zoom
- Container width determines line breaks (OSMD reflows to container)
- `osmd.render()` re-renders into the same DOM container

### Verovio Approach
- `toolkit.setOptions({ scale, pageWidth, svgViewBox: true })` then re-render
- `pageWidth` controls line breaks (set it to container width in Verovio units)
- `svgViewBox: true` makes the SVG scale to its container via CSS
- Re-render returns a new SVG string; replace innerHTML

### Conversion Formula
Verovio abstract units to pixels: at default scale (100%), 1 abstract unit = 1 pixel.
At `scale: 50`, the output is half-size. Use `scaleToPageSize: true` to keep SVG dimensions constant regardless of scale.

```typescript
// To match a container width of 980px at scale 80%:
const pageWidthInVerovioUnits = containerWidth * 100 / scale;
toolkit.setOptions({
  pageWidth: pageWidthInVerovioUnits,
  scale: scale,
  scaleToPageSize: true,  // SVG stays at pageWidth px regardless of scale
});
const svg = toolkit.renderToSVG(1);
```

---

## WASM Initialization Strategy

**Recommendation: Eager singleton, initialized at app startup.**

```
App mount
  |
  +-> import './lib/verovioService'  (side-effect: begins WASM fetch)
  |
  +-> Components render with loading state
  |
  +-> verovioService.isReady resolves (~200-500ms)
  |
  +-> useVerovio hooks detect readiness, create toolkits, render scores
```

**Why eager, not lazy:**
- The WASM module is needed for every user flow (cannot use the app without it)
- Starting the fetch early overlaps with other React hydration work
- 200-500ms load time is acceptable if it starts immediately
- Lazy loading would mean the first score render has an extra delay

**Why singleton, not per-component:**
- WASM module is ~3-5MB in memory
- Multiple modules waste memory with no benefit
- VerovioToolkit instances are cheap (just hold score state)
- Singleton matches how OSMD works today (global library, multiple instances)

---

## Suggested Build Order (Migration Phases)

Based on dependency analysis of the current codebase:

### Phase 1: Foundation -- verovioService + useVerovio + Basic Rendering

**What:** Create `verovioService.ts`, `useVerovio.ts` hook, and swap RegularRenderer to render Verovio SVG (without animation, without events).

**Why first:**
- Everything else depends on having a working Verovio render
- Validates WASM loading, Vite configuration, SVG output
- Can be tested visually immediately (does the score appear?)
- Smallest meaningful vertical slice

**Depends on:** Nothing (foundation layer)

**Validates:** WASM init works, MusicXML loads, SVG renders in container, line breaks look correct

### Phase 2: Event Extraction -- getVerovioEvents

**What:** Create `getVerovioEvents.ts` that walks the rendered SVG DOM and calls `getTimeForElement()` to build `MusicalEvent[]`.

**Why second:**
- Animation and sync both depend on events
- Must verify the MusicalEvent interface is satisfied (same fields)
- Can validate by logging events and comparing to OSMD event count

**Depends on:** Phase 1 (needs rendered SVG DOM to walk)

**Validates:** Event count matches OSMD, timing values are reasonable, x/y positions are accurate

### Phase 3: Animation -- noteAnimation Migration

**What:** Update `noteAnimation.ts` selectors from `.vf-notehead` to `g.notehead`, handle `<use>` elements for fill/stroke. Update `animationController.ts` similarly.

**Why third:**
- Playback preview (Play/Pause/Reset) is the core user-facing feature
- Depends on events being extracted correctly (Phase 2)
- Camera scrolling comes along for free (just needs Y values from events)

**Depends on:** Phase 2 (needs MusicalEvent[] with y positions)

**Validates:** Notes animate on playback, camera scrolls, Puppeteer frame capture works

### Phase 4: SyncEditor Migration

**What:** Migrate SyncEditor.tsx to use `useVerovio()` hook. Update click handling (`.vf-stavenote` -> `g.note`), note coloring selectors.

**Why fourth:**
- SyncEditor is a secondary view (not in the default user flow)
- Reuses patterns established in Phases 1-3
- Can be done independently after the foundation is solid

**Depends on:** Phase 1 (useVerovio), Phase 2 (event extraction)

### Phase 5: Validation + Cleanup

**What:** Migrate `musicxmlValidation.ts` to use verovioService. Remove OSMD dependency from package.json. Clean up dead code.

**Why last:**
- Validation is already working (OSMD still loaded until we remove it)
- Removing OSMD is the final step after everything else is verified
- Reduces bundle size significantly (OSMD + VexFlow is large)

**Depends on:** All previous phases complete and verified

---

## Integration Points

### Vite Configuration

Verovio's WASM file needs to be served correctly. With modern Vite (6.x), the ESM import `from 'verovio/wasm'` should work with default configuration, but may need:

```typescript
// vite.config.ts -- potential additions
export default defineConfig({
  optimizeDeps: {
    exclude: ['verovio'],  // Prevent Vite from pre-bundling WASM
  },
  // If WASM loading fails, may need to copy verovio data files:
  // plugins: [viteStaticCopy({ targets: [{ src: 'node_modules/verovio/data/*', dest: 'verovio-data' }] })]
});
```

**Confidence: MEDIUM** -- Vite WASM handling has improved significantly but Verovio-specific configuration may need experimentation. This should be validated in Phase 1.

### Puppeteer API (window.animationController)

The external interface stays identical:

```typescript
window.animationController = {
  setFrame: (frameNumber: number, fpsValue: number) => { ... },
  setTimestamp: (seconds: number) => { ... },
  getDuration: () => audioDuration,
  getFps: () => 30,
};
```

Only the internal implementation changes (Verovio selectors instead of OSMD selectors). Puppeteer code outside this repo needs no changes.

### MusicXML Format Handling

Verovio auto-detects MusicXML format from the `loadData()` input string. The current `isLikelyMusicXML()` pre-flight check in `fileValidation.ts` remains valid. Compressed MXL files would need `loadZipDataBase64()` instead of `loadData()`, but the current app only handles uncompressed MusicXML.

---

## Sources

- [Verovio Toolkit Methods Reference](https://book.verovio.org/toolkit-reference/toolkit-methods.html) (HIGH confidence)
- [Verovio JavaScript/WASM Installation](https://book.verovio.org/installing-or-building-from-sources/javascript-and-webassembly.html) (HIGH confidence)
- [Verovio CSS and SVG Interaction](https://book.verovio.org/interactive-notation/css-and-svg.html) (HIGH confidence)
- [Verovio MIDI Playback / getElementsAtTime](https://book.verovio.org/interactive-notation/playing-midi.html) (HIGH confidence)
- [Verovio Layout Options](https://book.verovio.org/first-steps/layout-options.html) (HIGH confidence)
- [Verovio SVG Output Control](https://book.verovio.org/advanced-topics/controlling-the-svg-output.html) (HIGH confidence)
- [Verovio Input Formats](https://book.verovio.org/toolkit-reference/input-formats.html) (HIGH confidence)
- [Verovio NPM Package](https://www.npmjs.com/package/verovio) (HIGH confidence)
- [React dangerouslySetInnerHTML SVG issue #2863](https://github.com/facebook/react/issues/2863) (MEDIUM confidence -- older issue, may be resolved in React 19)
- Verovio SVG samples in `/Users/emirahmed/Desktop/Manuscript/renderer/verovio_examples/` (HIGH confidence -- directly inspected)
- Existing codebase analysis (HIGH confidence -- read all source files)

---
*Architecture research for: OSMD-to-Verovio migration in Manuscript renderer*
*Researched: 2026-02-03*
