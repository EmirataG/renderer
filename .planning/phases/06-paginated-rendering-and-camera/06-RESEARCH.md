# Phase 6: Paginated Rendering & Camera - Research

**Researched:** 2026-02-04
**Domain:** Verovio multi-page SVG rendering with CSS transform camera
**Confidence:** HIGH

## Summary

Phase 6 replaces the current single-SVG rendering approach (one 60,000px-tall SVG) with Verovio's native pagination API to produce multiple smaller page SVGs. The camera and playback systems must work seamlessly across page boundaries with invisible page transitions. This phase also handles re-pagination on viewport resize and scale changes.

The standard approach uses Verovio's built-in `getPageCount()` + `renderToSVG(pageNo)` loop instead of a single `renderToSVG(1)` call. Each page produces an independent SVG with its own coordinate space. The main engineering challenge is translating between per-page local coordinates and a global coordinate system the camera can scroll through continuously.

No new npm dependencies are needed. The entire phase uses the existing Verovio v6 API (already installed at `^6.0.1`), React for rendering page containers, and the existing CSS `translateY` camera mechanism. The `getPageWithElement()` API enables mapping events to pages, and the `renderToTimemap()` API continues to work identically regardless of pagination settings.

**Primary recommendation:** Modify `useVerovio` to return `svgPages: string[]` with a computed page height offset table. Modify `RegularRenderer` to render stacked page containers. Keep the single `translateY` camera but drive it with global Y coordinates computed from page offsets + per-page system positions. Use `pageMarginTop: 0, pageMarginBottom: 0` to eliminate inter-page gaps, and detect single-page scores to skip pagination overhead entirely.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| verovio | ^6.0.1 (installed) | Multi-page SVG rendering via `getPageCount()` + `renderToSVG(pageNo)` | Native pagination API; already in project; no alternatives needed |
| React | 19 (installed) | Render page containers, manage mount/unmount lifecycle | Already in project |
| TypeScript | ~5.9.3 (installed) | Type safety for page metadata interfaces | Already in project |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @types/verovio | ^5.1.0 (installed) | Type definitions including `getPageCount`, `getPageWithElement`, `renderToSVG(pageNo)` | Already installed; type augments file may need updating |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Verovio pagination | Regex SVG splitting | Fragile; loses Verovio's layout intelligence; breaks `g.system` boundaries |
| `adjustPageHeight` per page | Fixed `pageHeight` for all pages | Fixed height wastes space on last page and creates inconsistent stacking; `adjustPageHeight` trims each page individually |
| `redoLayout()` on scale change | Full `loadData()` + `renderToSVG()` cycle | `redoLayout()` is more efficient for layout-only changes (avoids re-parsing XML); use it when only options change, not data |

**Installation:** No new packages needed.

## Architecture Patterns

### Recommended Component Structure

```
src/
  hooks/
    useVerovio.ts          # MODIFY: return svgPages[] + pageHeights[] + pageCount
  lib/
    getEvents.ts           # MODIFY: compute global Y from page offsets + system positions
    noteAnimation.ts       # MINIMAL CHANGE: already queries by ID within a root element
    animationController.ts # MODIFY: accept page-aware container reference
  renderers/
    RegularRenderer.tsx    # MODIFY: render stacked page divs, compute global coordinate system
  components/
    SyncEditor.tsx         # MODIFY: render stacked pages (no camera needed, just scrollable)
```

### Pattern 1: Multi-Page Rendering Loop

**What:** Replace single `renderToSVG(1)` with a loop over all pages.
**When to use:** Always, after `loadData()` or `redoLayout()`.

```typescript
// Source: Verovio Toolkit Methods docs + codebase analysis
// Current (single page):
//   toolkit.setOptions({ pageHeight: 60000, adjustPageHeight: true });
//   const svg = toolkit.renderToSVG(1);

// New (multi-page):
toolkit.setOptions({
  pageWidth: (containerWidth * 100) / scale,
  pageHeight: computedPageHeight,  // See Pattern 3 for height strategy
  adjustPageHeight: true,          // Trim each page to content height
  scale: scale,
  pageMarginTop: 0,                // Zero top margin for flush stacking
  pageMarginBottom: 0,             // Zero bottom margin for flush stacking
  svgViewBox: true,
  svgRemoveXlink: true,
  breaks: 'auto',
  header: 'none',
  footer: 'none',
});

toolkit.loadData(xml);
toolkit.renderToMIDI(); // Must call for timing queries

const pageCount = toolkit.getPageCount();
const svgPages: string[] = [];
for (let i = 1; i <= pageCount; i++) {
  svgPages.push(toolkit.renderToSVG(i));
}
```

**Confidence:** HIGH - `getPageCount()` and `renderToSVG(pageNo)` are documented in official Verovio toolkit methods reference, typed in `@types/verovio`, and already declared in the project's `verovio-augments.d.ts`.

### Pattern 2: Page Height Extraction from SVG ViewBox

**What:** Extract actual rendered page heights from SVG `viewBox` attribute without DOM mounting.
**When to use:** Immediately after rendering all pages, to build the global coordinate offset table.

```typescript
// Source: Verovio SVG output analysis + MDN SVG viewBox
// When svgViewBox: true, each page SVG has:
//   <svg width="Xpx" height="Ypx" viewBox="0 0 X Y" ...>
// With adjustPageHeight: true, each page may have DIFFERENT heights.

function extractPageHeight(svgString: string): number {
  // Parse the height from the SVG root element
  // The SVG has width="Xpx" height="Ypx" attributes
  const match = svgString.match(/height="(\d+(?:\.\d+)?)px"/);
  if (match) return parseFloat(match[1]);

  // Fallback: parse viewBox
  const vbMatch = svgString.match(/viewBox="0 0 [\d.]+ ([\d.]+)"/);
  if (vbMatch) return parseFloat(vbMatch[1]);

  return 0; // Should not happen
}

// Build page offset table
const pageHeights: number[] = svgPages.map(extractPageHeight);
const pageOffsets: number[] = []; // cumulative Y offset for each page
let cumulative = 0;
for (const h of pageHeights) {
  pageOffsets.push(cumulative);
  cumulative += h;
}
const totalHeight = cumulative;
```

**Confidence:** HIGH - SVG sample files in `verovio_examples/` confirm the `height="Xpx"` attribute format. The `svgViewBox: true` option is already used in the current code.

**Important nuance:** With `adjustPageHeight: true`, each page's SVG may have a different height. The last page is almost always shorter. The offset table accounts for this.

### Pattern 3: Page Height Strategy (Claude's Discretion)

**Recommendation: Use a generous fixed `pageHeight` with `adjustPageHeight: true`.**

Rationale:
- Setting `pageHeight` to a large value (e.g., 2970 which is Verovio's A4 default, or a viewport-based calculation) determines how many systems fit per page.
- `adjustPageHeight: true` then trims each page's SVG to its actual content height, eliminating whitespace.
- This means pages contain as many systems as Verovio's layout algorithm decides will fit, and each page's SVG is exactly as tall as its content.
- For the flush-stacking requirement, this is ideal: no gaps between pages since each SVG is tight to its content.

**Concrete recommendation:** Use Verovio's default `pageHeight: 2970` (A4) which typically fits 4-6 systems per page. This produces a manageable number of pages (a 20-page print score = ~20 SVGs instead of 1 giant SVG). Combined with `adjustPageHeight: true`, the actual rendered heights will be tight.

**Short score optimization:** If `getPageCount() === 1` after rendering, skip the multi-page path entirely and use the single SVG directly. This avoids unnecessary wrapper divs and coordinate translation for scores that fit on one page.

### Pattern 4: Flush Page Stacking with Zero Margins

**What:** Stack page SVGs vertically with no visible gaps.
**When to use:** In RegularRenderer when rendering the page container.

```typescript
// Source: Verovio toolkit options docs (pageMarginTop, pageMarginBottom)
// Key insight: Setting margins to 0 removes the 50px default padding.
// However, Verovio still adds a "half staff space" above/below each page.
// With adjustPageHeight: true, the SVG height includes only content +
// the small staff spacing. For truly flush appearance, the CSS must
// ensure no additional gaps.

// Verovio options to minimize internal margins:
{
  pageMarginTop: 0,
  pageMarginBottom: 0,
  // Note: spacingStaff: 0 would remove ALL inter-staff spacing which
  // degrades readability. Keep default (12) unless visual testing shows gaps.
}

// React rendering:
{svgPages.map((svg, i) => (
  <div
    key={i}
    className="preview-score"  // Score color class applied per-page
    style={{
      width: scoreWidth,
      // No margin, no padding, no gap
      lineHeight: 0,     // Prevents inline SVG baseline gaps
      fontSize: 0,       // Prevents inline whitespace gaps
    }}
    dangerouslySetInnerHTML={{ __html: svg }}
  />
))}
```

**Confidence:** HIGH for the Verovio options. MEDIUM for the CSS gap elimination -- `lineHeight: 0` and `fontSize: 0` on the container is a well-known fix for inline SVG stacking gaps, but may need visual testing to confirm no visible seams.

### Pattern 5: Global Coordinate System for Camera

**What:** Translate per-page local coordinates to global coordinates for the camera.
**When to use:** In `getEventsFromVerovio()` to compute Y positions across pages.

```typescript
// Source: Codebase analysis of current getEventsFromVerovio()
// Currently: all events have Y relative to a single SVG container
// New: events have Y = pageOffset[pageIndex] + localY

// Two-phase approach:
// Phase A (no DOM needed): Map events to pages using Verovio API
//   - renderToTimemap() gives event IDs
//   - getPageWithElement(xmlId) gives page number for each event

// Phase B (DOM needed): Get system Y positions per page
//   - For each mounted page, query g.system elements
//   - Compute local center Y relative to page container
//   - Add pageOffset to get global Y

// The camera then uses globalY exactly as before:
// cameraRef.current.style.transform = `translateY(${-cameraY}px)`;
```

**Confidence:** HIGH - `getPageWithElement()` is documented, typed in `@types/verovio`, and returns 1-based page number. The `renderToTimemap()` return includes `on[]` arrays with xml:id values that can be passed directly to `getPageWithElement()`.

### Pattern 6: Scale Change Re-Pagination

**What:** When scale changes, re-render all pages with new dimensions.
**When to use:** When the `scale` prop changes in RegularRenderer.

```typescript
// Source: Verovio docs on redoLayout()
// When scale changes:
// 1. setOptions() with new scale (and potentially new pageWidth/pageHeight)
// 2. Call redoLayout() — NOT loadData() again (data is already loaded)
// 3. Page count may change
// 4. Re-render all pages via renderToSVG loop
// 5. Rebuild page offset table
// 6. Re-extract events (positions have changed)

// From context: "re-render visible pages first, render remaining pages
// lazily in background" — this means:
// Step 1: Determine which page the camera is currently viewing
// Step 2: Render that page immediately (show to user)
// Step 3: Render remaining pages via requestIdleCallback or setTimeout
// Step 4: Update page offset table progressively
```

**Confidence:** HIGH for `redoLayout()` usage. MEDIUM for the lazy background rendering pattern -- needs careful implementation to avoid flickering when the user scrolls during background rendering.

### Pattern 7: Resize Re-Pagination with Debounce

**What:** When the container width changes (viewport resize), re-paginate.
**When to use:** When `containerWidth` changes in the useVerovio hook.

The current `useVerovio` hook already re-renders when `containerWidth` changes (it is a dependency of the `useEffect`). The same pattern applies for pagination -- a width change triggers `setOptions()` + `redoLayout()` + full page re-render.

**Debounce recommendation:** Use the same debounce approach as the current implementation. The context says "same debounce as current" for the scale slider. If no explicit debounce exists currently (the useEffect fires on every change), consider adding a 150-300ms debounce for resize events specifically, since ResizeObserver can fire rapidly during window dragging.

### Anti-Patterns to Avoid

- **Re-calling `loadData()` on scale/resize changes:** Use `redoLayout()` instead. `loadData()` re-parses the entire XML which is unnecessary when only layout options change. `redoLayout()` recalculates layout from the already-parsed internal representation.

- **Mounting all pages to extract Y positions:** Use `getPageWithElement(xmlId)` to map events to pages without DOM mounting. Only mount pages that need `getBoundingClientRect()` for system Y positions. In this phase (before virtual scrolling), all pages are mounted, so this is not an issue -- but designing the extraction to work without full mounting prepares for Phase 8.

- **Assuming uniform page heights:** With `adjustPageHeight: true`, every page can have a different pixel height. The last page is almost always shorter. Always use the per-page height array, never assume all pages are the same height.

- **Using `scrollHeight` for total score height:** With multiple page containers, `scrollHeight` on the camera wrapper returns the correct value only if all pages are mounted. Since Phase 6 mounts all pages (virtual scrolling is Phase 8), this works. But replace `scrollHeight` reads with the pre-computed `totalHeight` from the offset table to be forward-compatible.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Page breaking / layout | Custom SVG splitting | Verovio `pageHeight` + `getPageCount()` | Verovio understands music layout; splitting SVG by regex breaks systems |
| Event-to-page mapping | Sequential index assumptions | `getPageWithElement(xmlId)` | Stable across re-renders; works with Verovio's internal layout |
| Page height detection | DOM mount + `getBoundingClientRect()` for each page | Parse SVG `height` attribute from string | Avoids forced reflow; works before DOM mounting |
| Layout recalculation | Full `loadData()` + `renderToSVG()` cycle | `setOptions()` + `redoLayout()` + `renderToSVG()` | `redoLayout()` skips XML parsing; significantly faster |

**Key insight:** Verovio already solves the hard problems (where to break pages, how to lay out systems). This phase's job is to correctly stitch Verovio's page output into a seamless scrolling experience, not to reinvent page layout.

## Common Pitfalls

### Pitfall 1: SVG Inline Stacking Gaps

**What goes wrong:** SVG elements rendered inline (via `dangerouslySetInnerHTML`) produce tiny gaps between them due to whitespace handling and baseline alignment. Pages appear to have 1-4px gaps even with zero margins.
**Why it happens:** SVGs are inline by default. Browsers add whitespace between inline elements and align them to text baselines, creating hairline gaps.
**How to avoid:** Set `display: block` on each page's SVG element (via CSS selector `.preview-score svg { display: block; }`) OR set `font-size: 0; line-height: 0;` on the parent container. Either approach eliminates inline rendering artifacts.
**Warning signs:** Thin horizontal lines visible between pages when background color differs from white. Test with a colored background behind the score container.

### Pitfall 2: Coordinate Space Mismatch Between Pages

**What goes wrong:** Camera jumps or stutters at page boundaries because Y positions mix local (per-page) coordinates with global coordinates.
**Why it happens:** `getBoundingClientRect()` returns coordinates relative to the viewport. If you query a system element on page 3, its Y is relative to the viewport, not to the top of the score. But the camera needs global coordinates (from score top).
**How to avoid:** Always compute global Y as: `pageOffsets[pageIndex] + (systemRect.top - pageContainerRect.top + systemRect.height / 2)`. The first term positions within the page stack; the second term positions within the page. Use the page container's rect, not the overall score container's rect, as the reference point.
**Warning signs:** Camera works on page 1 but jumps on subsequent pages.

### Pitfall 3: Event ID Instability Across Re-Renders

**What goes wrong:** Sync anchors (stored in Zustand as `Map<eventId, timestamp>`) break when events are regenerated with different IDs after a re-render.
**Why it happens:** Current system uses sequential IDs (`evt-0`, `evt-1`, ...). If Verovio's timemap order changes (unlikely but possible with different page layouts), or if pagination changes which events appear first, the sequential IDs shift.
**How to avoid:** The current `evt-${index}` ID scheme is based on timemap order, which is determined by `qstamp` (quarter-note position). This is stable across layout changes as long as the XML data is the same. However, for robustness, consider using the Verovio xml:id (from the `on[]` array in the timemap) as part of the event ID. This makes event identity independent of enumeration order.
**Warning signs:** Anchors appear on wrong notes after scale change. This is a **latent risk** -- may not manifest in Phase 6 if timemap ordering is stable, but could break in edge cases.

**Phase 6 recommendation:** Keep the current `evt-${index}` scheme for now. The timemap order is determined by `qstamp` which does not change with layout. Flag this for Phase 7 (Event Caching) where event identity becomes more critical.

### Pitfall 4: `adjustPageHeight` SVG Width Side Effect

**What goes wrong:** Enabling `adjustPageHeight: true` can in some edge cases produce SVGs with different widths per page, breaking horizontal alignment.
**Why it happens:** Known Verovio issue (#733) -- the width adjustment interacts with height adjustment in rare cases.
**How to avoid:** Set explicit `pageWidth` AND `adjustPageHeight: true` together. The explicit `pageWidth` constrains width. Additionally, set `adjustPageWidth: false` (the default) to prevent width shrinkage.
**Warning signs:** Page SVGs have different widths when you expect them to be identical. Verify by checking the `width` attribute on each SVG string.

### Pitfall 5: `renderToMIDI()` Timing After `redoLayout()`

**What goes wrong:** Timing queries return stale data after layout changes.
**Why it happens:** `renderToMIDI()` must be called after any layout change for timing data to be current. `redoLayout()` invalidates the MIDI timing data.
**How to avoid:** Always call `renderToMIDI()` after `redoLayout()` before calling `renderToTimemap()` or any timing-dependent API.
**Warning signs:** Events have incorrect timing after a scale change; playback sync drifts.

### Pitfall 6: Camera Transition Smoothness at Page Boundaries

**What goes wrong:** Camera movement stutters when crossing from one page to the next during playback.
**Why it happens:** If the page offset table has any error (even 1px), the system-center Y positions for the first system on a new page will be discontinuous from the last system on the previous page, causing a visible jump.
**How to avoid:** Build the page offset table from actual rendered SVG heights (parsed from SVG string, not from DOM). Ensure the camera's `translateY` value changes continuously through page boundaries. The existing 200ms ease-out transition on the camera div smooths over small discontinuities.
**Warning signs:** Visible "hiccup" in camera motion when playback crosses a page boundary.

### Pitfall 7: SyncEditor Page Rendering

**What goes wrong:** The SyncEditor (which renders the score for anchor editing) also needs pagination but with different requirements -- it's scrollable, not camera-driven.
**Why it happens:** SyncEditor uses `useVerovio` and `dangerouslySetInnerHTML` exactly like RegularRenderer. When `useVerovio` changes to return page arrays, SyncEditor must also render multiple pages.
**How to avoid:** Design the `useVerovio` hook to return both `svgPages: string[]` and a convenience `allSvgHtml: string` (concatenated pages) or have SyncEditor join the pages itself. SyncEditor's simpler rendering (user-scrolled, no camera) means it can just stack pages vertically with no special coordination.
**Warning signs:** SyncEditor shows only one page or breaks after the useVerovio refactor.

## Code Examples

### Complete useVerovio Refactor Pattern

```typescript
// Source: Current useVerovio.ts + Verovio docs analysis
interface UseVerovioResult {
  svgPages: string[];          // Individual page SVG strings
  pageHeights: number[];       // Actual height of each page in px
  pageOffsets: number[];       // Cumulative Y offset for each page start
  totalHeight: number;         // Sum of all page heights
  pageCount: number;
  toolkit: VerovioToolkit | null;
  isLoading: boolean;
  error: string | null;
}

// Key option changes:
const options = {
  pageWidth: (containerWidth * 100) / scale,
  pageHeight: 2970,            // A4 default; Verovio breaks pages here
  adjustPageHeight: true,       // Trim each page to actual content
  pageMarginTop: 0,            // Flush stacking
  pageMarginBottom: 0,         // Flush stacking
  scale: scale,
  svgViewBox: true,
  svgRemoveXlink: true,
  breaks: 'auto',
  header: 'none',
  footer: 'none',
};

// Rendering loop:
toolkit.setOptions(options);
const loaded = toolkit.loadData(xml);
toolkit.renderToMIDI();

const pageCount = toolkit.getPageCount();
const svgPages: string[] = [];
for (let i = 1; i <= pageCount; i++) {
  svgPages.push(toolkit.renderToSVG(i));
}

// Height extraction (from SVG strings, no DOM needed):
const pageHeights = svgPages.map(svg => {
  const m = svg.match(/height="(\d+(?:\.\d+)?)px"/);
  return m ? parseFloat(m[1]) : 0;
});
```

### Global Y Computation for Events

```typescript
// Source: Current getEventsFromVerovio() + page offset analysis
function getEventsFromVerovioPages(
  toolkit: VerovioToolkit,
  pageContainers: HTMLElement[],  // One container per mounted page
  pageOffsets: number[],          // Cumulative Y offset per page
): MusicalEventWithY[] {
  const timemap = toolkit.renderToTimemap();
  const onsetEntries = timemap.filter(e => e.on && e.on.length > 0);

  const events: MusicalEventWithY[] = onsetEntries.map((entry, index) => ({
    id: `evt-${index}`,
    beatOnset: entry.qstamp / 4,
    beatDuration: 0,
    svgIds: entry.on!,
    x: 0,
    y: 0,
  }));

  // Compute beat durations
  for (let i = 0; i < events.length - 1; i++) {
    events[i].beatDuration = events[i + 1].beatOnset - events[i].beatOnset;
  }
  if (events.length > 0) {
    events[events.length - 1].beatDuration = 1;
  }

  // Map each event to its page and compute global Y
  for (const event of events) {
    if (event.svgIds.length === 0) continue;

    // Use Verovio API to find which page this event is on
    const pageNum = toolkit.getPageWithElement(event.svgIds[0]); // 1-based
    if (pageNum === 0) continue; // Element not found

    const pageIndex = pageNum - 1;
    const container = pageContainers[pageIndex];
    if (!container) continue;

    // Find the note element and its parent system
    const noteEl = container.querySelector(`#${CSS.escape(event.svgIds[0])}`);
    if (!noteEl) continue;

    const systemEl = noteEl.closest('g.system');
    const containerRect = container.getBoundingClientRect();

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

  return events;
}
```

### Short Score Single-Page Optimization

```typescript
// Source: Context decision - "Short scores: use single SVG path"
// After computing page count:
if (pageCount === 1) {
  // Use the existing single-page path -- simpler, no offset table needed
  return {
    svgPages: [svgPages[0]],
    pageHeights: [pageHeights[0]],
    pageOffsets: [0],
    totalHeight: pageHeights[0],
    pageCount: 1,
    toolkit: toolkitRef.current,
    isLoading: false,
    error: null,
  };
}
```

### Camera applyCamera Modification

```typescript
// Source: Current RegularRenderer applyCamera() analysis
// The camera logic barely changes -- it already uses a single translateY.
// The key change: use pre-computed totalHeight instead of scrollHeight.

function applyCamera(targetY: number) {
  const scoreHeight = totalHeight; // Was: osmdRef.current?.scrollHeight ?? 0
  const viewportHeight = scoreRegion?.height ?? containerHeight;

  let cameraY = targetY - viewportHeight / 2;
  cameraY = Math.max(0, cameraY);
  cameraY = Math.min(cameraY, Math.max(0, scoreHeight - viewportHeight));

  if (cameraRef.current) {
    cameraRef.current.style.transform = `translateY(${-cameraY}px)`;
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `pageHeight: 60000` (single page) | `pageHeight: 2970` + `adjustPageHeight: true` (multi-page) | This phase | Produces N smaller SVGs; foundation for virtual scrolling |
| `renderToSVG(1)` (page 1 only) | `renderToSVG(1..N)` loop | This phase | Each page is an independent SVG; manageable DOM sizes |
| `scrollHeight` for score dimensions | Pre-computed totalHeight from SVG parsing | This phase | Forward-compatible with virtual scrolling (Phase 8) |
| Event Y from single container rect | Event Y from page offsets + per-page system positions | This phase | Global coordinate system spanning all pages |

**Not deprecated (still valid):**
- `renderToTimemap()` works identically regardless of pagination
- CSS `translateY` camera mechanism is unchanged
- `g.system` DOM queries for system positions still work within each page
- Notehead animation by SVG ID still works (IDs are unique across all pages)
- `renderToMIDI()` timing data is unaffected by page layout

## Open Questions

1. **Half-staff-space residual gap**
   - What we know: Setting `pageMarginTop: 0` and `pageMarginBottom: 0` removes the 50px default margin, but Verovio documentation mentions a "half staff space above and below" that remains. Setting `spacingStaff: 0` removes this but degrades readability.
   - What's unclear: Whether this half-staff-space creates a visible seam between flush-stacked pages, or whether `adjustPageHeight` trims it from the bottom of each page.
   - Recommendation: Implement with `pageMarginTop/Bottom: 0` and keep default `spacingStaff`. Visually test for gaps. If gaps are visible, add a small negative margin (-1px to -3px) on page containers as a CSS fix rather than degrading spacing.

2. **SVG height parsing with `adjustPageHeight` + `svgViewBox`**
   - What we know: When `svgViewBox: true`, the SVG has both `width`/`height` attributes and a `viewBox` attribute. When `adjustPageHeight: true`, each page has different height values.
   - What's unclear: Whether the `height` attribute in the SVG string exactly matches the rendered pixel height when the SVG is placed in a container, especially if the container constrains width.
   - Recommendation: Parse `height` from SVG string for the offset table. If the SVGs are constrained to container width via CSS, the actual rendered heights may differ from the attribute values (due to aspect ratio preservation). In that case, after DOM mounting, verify heights with `getBoundingClientRect()` and update the offset table. This is a one-time operation per render.

3. **`getPageWithElement()` type augments**
   - What we know: `getPageWithElement()` is defined in `@types/verovio` but NOT in the project's `verovio-augments.d.ts` (which overrides the module declaration). The augments file declares `verovio/esm` module.
   - What's unclear: Whether TypeScript will use `@types/verovio` for the method or whether the `verovio-augments.d.ts` overrides take precedence.
   - Recommendation: Add `getPageWithElement(xmlId: string): number;` to the `verovio-augments.d.ts` file's `VerovioToolkit` class declaration. This ensures the method is available regardless of module resolution order.

## Sources

### Primary (HIGH confidence)
- [Verovio Toolkit Methods](https://book.verovio.org/toolkit-reference/toolkit-methods.html) -- `getPageCount()`, `renderToSVG(pageNo)`, `getPageWithElement()`, `redoLayout()`, `getElementsAtTime()` API docs
- [Verovio Toolkit Options](https://book.verovio.org/toolkit-reference/toolkit-options.html) -- `pageHeight` (default 2970, range 100-60000), `pageMarginTop/Bottom` (default 50, range 0-500), `adjustPageHeight`, `svgViewBox`, `scale`, `breaks` options
- [Verovio SVG Output Control](https://book.verovio.org/advanced-topics/controlling-the-svg-output.html) -- `svgViewBox` behavior, page dimension to SVG pixel mapping, scale interaction
- `@types/verovio` v5.1.0 `index.d.ts` -- Full TypeScript API including `getPageWithElement`, `getPageCount`, `renderToSVG`, `redoLayout` signatures
- Codebase analysis: `useVerovio.ts`, `RegularRenderer.tsx`, `getEvents.ts`, `noteAnimation.ts`, `animationController.ts`, `SyncEditor.tsx`, `syncStore.ts`, `verovio-augments.d.ts`, `verovioService.ts`, `interpolation.ts`

### Secondary (MEDIUM confidence)
- [Verovio Layout Options](https://book.verovio.org/advanced-topics/layout-options.html) -- Margin removal details: "When removing the top and bottom page margins, there will be only the half staff space above and below"
- [Verovio MIDI Playback](https://book.verovio.org/interactive-notation/playing-midi.html) -- `getElementsAtTime()` page navigation pattern during playback
- [VHV Page Modes](https://doc.verovio.humdrum.org/interface/page-modes/) -- Multi-page vs single-page mode behavior
- [Verovio GitHub Issue #733](https://github.com/rism-digital/verovio/issues/733) -- `adjustPageHeight` SVG width modification issue (resolved as user-side problem, not Verovio bug)
- Sample Verovio SVG output in `verovio_examples/` -- Confirms SVG structure: `<svg width="Xpx" height="Ypx" ...>` with `definition-scale` class

### Tertiary (LOW confidence)
- SVG inline stacking gap fix (CSS `display: block` / `font-size: 0`) -- common web knowledge, not Verovio-specific; needs visual validation
- Performance estimates for `renderToSVG` loop vs single call -- not benchmarked; assumed <100ms per page based on prior research

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- All Verovio APIs verified against official docs and installed type definitions
- Architecture: HIGH -- Based on direct codebase analysis of all affected files plus verified Verovio API
- Pitfalls: HIGH -- Derived from Verovio documentation, codebase analysis, and known SVG rendering behavior
- Code examples: MEDIUM-HIGH -- Patterns are verified but untested; exact implementation may need adjustment

**Research date:** 2026-02-04
**Valid until:** 2026-03-04 (30 days; Verovio API is stable)
