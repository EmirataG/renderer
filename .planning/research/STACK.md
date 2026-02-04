# Stack Research: Efficiency Optimizations (Paginated SVG, Event Caching, Virtual Scrolling)

**Domain:** Memory and rendering efficiency for Verovio-based music score renderer
**Researched:** 2026-02-04
**Confidence:** HIGH (built on verified Verovio API + codebase analysis; no speculative libraries)

## Context

The current renderer produces a single 60,000px-tall SVG via `pageHeight: 60000` + `adjustPageHeight: true`, inserted via `dangerouslySetInnerHTML`. For long scores this creates 6GB+ memory usage. Three optimizations are needed:

1. **Paginated SVG rendering** -- render Verovio pages individually instead of one giant SVG
2. **Event position caching** -- store extracted positions to avoid repeated DOM queries
3. **Virtual scrolling** -- only mount SVG pages near the current camera position

## Recommended Stack

### Core Recommendation: No New Libraries

The critical finding of this research is that **no new npm dependencies are needed** for any of the three efficiency features. The existing stack (Verovio, React, Zustand, TypeScript) provides everything required. This is not a compromise -- it is the correct approach for this specific architecture.

**Why:**
- Verovio already has `getPageCount()` + `renderToSVG(pageNo)` for paginated rendering
- Plain `Map<string, CachedPosition>` in a Zustand store handles event position caching
- The camera is CSS `translateY()`-driven (not user scrolling), making scroll-virtualization libraries like TanStack Virtual a poor fit

### Stack Changes (Verovio Options Only)

| Change | From | To | Purpose |
|--------|------|----|---------|
| `pageHeight` option | `60000` | `2970` (default A4) or tuned per viewport | Enables Verovio to paginate into multiple pages instead of one giant SVG |
| `adjustPageHeight` option | `true` | `true` (unchanged) | Each page's SVG shrinks to its actual content height |
| New: page-aware rendering loop | `renderToSVG(1)` | `for (i = 1..getPageCount()) renderToSVG(i)` | Produces N smaller SVG strings instead of one massive one |

### Existing Stack (Unchanged)

| Technology | Version | Role in Efficiency |
|------------|---------|-------------------|
| `verovio` | ^6.0.1 | Provides `getPageCount()`, `renderToSVG(pageNo)`, `getPageWithElement()`, `renderToTimemap()` |
| React 19 | ^19.1.1 | Conditional rendering of page components (mount/unmount by visibility) |
| Zustand | ^5.0.10 | Event position cache store |
| TypeScript | ~5.9.3 | Type safety for cache interfaces |

## Feature 1: Paginated SVG Rendering

### Verovio API (Already Available)

The pagination API is built into Verovio. No additional libraries needed.

| Method | Signature | Purpose | Confidence |
|--------|-----------|---------|------------|
| `getPageCount()` | `() => number` | Returns total pages after layout | HIGH -- verified in official toolkit reference |
| `renderToSVG(pageNo)` | `(pageNo: number) => string` | Renders specific page (1-indexed) | HIGH -- verified |
| `getPageWithElement(xmlId)` | `(xmlId: string) => number` | Returns page number containing element | HIGH -- verified |
| `renderToTimemap()` | `() => TimemapEntry[]` | Returns full-score timing data | HIGH -- verified |

**Current code in `useVerovio.ts`:**
```typescript
// CURRENT: one giant page
toolkit.setOptions({
  pageHeight: 60000,
  adjustPageHeight: true,
  // ...
});
const svg = toolkit.renderToSVG(1);  // One call, one massive SVG
```

**Target approach:**
```typescript
// NEW: paginated
toolkit.setOptions({
  pageHeight: 2970,       // Standard A4 height or tuned to viewport
  adjustPageHeight: true,  // Shrink last page to content
  // ...
});
const pageCount = toolkit.getPageCount();
const pages: string[] = [];
for (let i = 1; i <= pageCount; i++) {
  pages.push(toolkit.renderToSVG(i));
}
```

**Key detail:** `renderToTimemap()` returns timing data for the ENTIRE score regardless of pagination. The timemap's `on` array contains note element IDs. Use `getPageWithElement(noteId)` to associate each timemap entry with its page number.

**Confidence:** HIGH -- `getPageCount()` and `renderToSVG(pageNo)` are documented at [book.verovio.org/toolkit-reference/toolkit-methods.html](https://book.verovio.org/toolkit-reference/toolkit-methods.html) and confirmed via web search against multiple official examples.

### Page Height Tuning

The `pageHeight` option controls how Verovio distributes systems across pages:

| Value | Effect | Use Case |
|-------|--------|----------|
| 2970 (default) | A4 page, ~3-4 systems per page | Standard multi-page |
| ~1500-2000 | 2-3 systems per page | Finer granularity, smaller SVGs |
| Match viewport height | ~1-2 systems visible at once | Pages map directly to viewport windows |

**Recommendation:** Set `pageHeight` to approximately match the score region viewport height. This way each page roughly corresponds to one screenful of music, making the virtual scrolling optimization most effective.

**Important:** Changing `pageHeight` after `loadData()` requires calling `redoLayout()` before rendering. Also, `getPageCount()` must be re-checked after any layout change because the page count may differ.

**Confidence:** HIGH -- page height behavior documented at [book.verovio.org/toolkit-reference/toolkit-options.html](https://book.verovio.org/toolkit-reference/toolkit-options.html).

## Feature 2: Event Position Caching

### Why No Library Is Needed

Event position caching is a data structure problem, not a library problem. The current code calls `getBoundingClientRect()` on every `g.system` and `g.note` element during event extraction in `getEventsFromVerovio()`. This happens once per render (when `svgString` changes), producing a `MusicalEventWithY[]` array that is already stored in React state.

**Current flow (from `getEvents.ts`):**
```
SVG rendered -> DOM walk -> getBoundingClientRect() per system -> MusicalEventWithY[]
```

The problem is not repeated DOM queries during playback -- the current code already extracts positions once and stores them. The efficiency issue is that with paginated rendering, positions must be extracted per page, and pages may mount/unmount. A cache prevents re-extracting positions when a page re-mounts.

### Recommended Cache Design

Use a plain TypeScript `Map` inside a Zustand store. No external caching library.

**Cache key:** Score content hash + scale + page width (anything that affects layout).
**Cache value:** Per-page array of `MusicalEventWithY` with page-relative Y positions.

```typescript
interface PageEventCache {
  /** Key: `${contentHash}-${scale}-${pageWidth}` */
  cacheKey: string;
  /** Page number -> events on that page */
  pages: Map<number, MusicalEventWithY[]>;
  /** Total event count across all pages */
  totalEvents: number;
}
```

**Why not a library like `lru-cache` or `idb-keyval`:**
- The cache holds a single score's worth of data (only one score loaded at a time)
- No eviction policy needed -- cache invalidates on score/scale/width change
- Data is small (event arrays are lightweight JS objects, not DOM elements)
- IndexedDB persistence is unnecessary (positions are fast to re-extract if cache misses)

**Confidence:** HIGH -- this is standard application state management. The Zustand store already exists (`syncStore.ts`). No new patterns needed.

### Position Extraction Per Page

With paginated rendering, `getBoundingClientRect()` only works on mounted (visible) pages. The strategy:

1. When a page mounts (enters viewport), extract events for that page
2. Store in cache keyed by page number
3. When page unmounts, positions remain in cache
4. On re-mount, read from cache (skip DOM queries)

**Critical:** Y positions must be converted from page-local to score-global coordinates. Each page has a known height, so global Y = sum of preceding page heights + local Y within page.

## Feature 3: Virtual Scrolling (Page Mounting/Unmounting)

### Why NOT TanStack Virtual

TanStack Virtual (`@tanstack/react-virtual` v3.13.18) was evaluated and rejected for this use case.

| Factor | TanStack Virtual Expects | This App Has |
|--------|--------------------------|--------------|
| Scroll model | User-driven scroll container (`overflow: scroll`) | CSS `translateY()` camera driven by audio playback |
| Scroll element | `getScrollElement()` returns a scrollable div | No scrollable div -- camera moves via `cameraRef.current.style.transform` |
| Item positioning | Absolute positioning within scroll container | Pages stacked in normal flow, camera pans over them |
| Interaction model | User scrolls to see content | Playback engine drives which content is visible |

TanStack Virtual's `useVirtualizer` hook is designed around a scroll event loop. It monitors `scrollTop`/`scrollLeft` on a container and calculates which items are in the viewport. In this app, there is no scroll event -- the "viewport" is determined by the camera position, which is driven by audio playback timestamps.

Using TanStack Virtual would require either:
- Faking scroll events to match camera position (fragile, fighting the library)
- Replacing the camera system with real scrolling (breaks Puppeteer frame capture, which needs deterministic positioning)

Neither is desirable.

**Confidence:** HIGH -- this conclusion is based on direct codebase analysis of `RegularRenderer.tsx` (camera at line 284-299) and the TanStack Virtual API docs at [tanstack.com/virtual/latest/docs/api/virtualizer](https://tanstack.com/virtual/latest/docs/api/virtualizer).

### Recommended: Custom Page Visibility Manager

A simple custom solution using the camera position to determine which pages to mount.

**Concept:**
```
Camera Y position + viewport height -> visible Y range
Page cumulative heights -> which pages overlap visible range
Only those pages get their SVG mounted in DOM
```

**Implementation approach:**

```typescript
function getVisiblePages(
  cameraY: number,
  viewportHeight: number,
  pageHeights: number[],
  overscan: number = 1  // Extra pages above/below
): Set<number> {
  const visibleTop = cameraY;
  const visibleBottom = cameraY + viewportHeight;
  const visible = new Set<number>();

  let cumHeight = 0;
  for (let i = 0; i < pageHeights.length; i++) {
    const pageTop = cumHeight;
    const pageBottom = cumHeight + pageHeights[i];
    cumHeight = pageBottom;

    if (pageBottom >= visibleTop && pageTop <= visibleBottom) {
      visible.add(i);
    }
  }

  // Add overscan pages
  for (const pageIdx of [...visible]) {
    for (let o = 1; o <= overscan; o++) {
      if (pageIdx - o >= 0) visible.add(pageIdx - o);
      if (pageIdx + o < pageHeights.length) visible.add(pageIdx + o);
    }
  }

  return visible;
}
```

**Page component pattern:**
```tsx
// Each page is a fixed-height placeholder
// SVG only mounts when page is "visible"
function ScorePage({ pageIndex, svgString, height, isVisible }: Props) {
  return (
    <div style={{ height, width: '100%' }}>
      {isVisible ? (
        <div dangerouslySetInnerHTML={{ __html: svgString }} />
      ) : null}
    </div>
  );
}
```

**Why this works better than a library:**
- Camera position is already known (it drives the calculation)
- Page heights are known from Verovio (deterministic layout)
- No scroll events to monitor
- Puppeteer frame capture works identically (camera sets position, visible pages render)
- Under 30 lines of logic vs. importing a 20KB library

**Confidence:** HIGH -- this is a straightforward calculation using data already available in the component.

### Alternative Considered: IntersectionObserver

`IntersectionObserver` was evaluated as a potential mechanism for detecting which pages are visible.

| Factor | IntersectionObserver | Custom Calculation |
|--------|---------------------|-------------------|
| Works with CSS transforms | Partially -- observes against viewport, not transformed position | Yes -- uses camera Y directly |
| Synchronous | No -- callbacks are async | Yes -- pure function |
| Puppeteer compatibility | Requires DOM to be painted | Works before paint (can determine visibility from camera position alone) |
| Complexity | Moderate (observers per page, cleanup) | Low (one pure function) |

**Verdict:** IntersectionObserver does not reliably detect visibility when the parent is moved via CSS `transform: translateY()`. The pages are not actually scrolling -- they are being panned by a transform on the wrapper. IntersectionObserver calculates intersection against the actual viewport, not the transformed position within a clipped container.

**Confidence:** MEDIUM -- IntersectionObserver + CSS transforms interaction is well-documented as problematic, but specific behavior may vary. The custom calculation approach is safer and simpler.

## Installation

```bash
# No new dependencies needed.
# All three features use existing Verovio API + React + Zustand.
```

## Alternatives Considered

| Recommended | Alternative | When Alternative Makes Sense |
|-------------|-------------|------------------------------|
| Custom page visibility (30 LOC) | `@tanstack/react-virtual` v3.13.18 | Only if the camera system is replaced with real scroll-based navigation. Would require redesigning the playback/camera architecture. |
| Plain `Map` in Zustand for position cache | `lru-cache` or `idb-keyval` | Only if multiple scores are cached simultaneously (current app loads one score at a time) or if cache persistence across sessions is needed. |
| Verovio `pageHeight: 2970` pagination | Custom SVG splitting (parse one large SVG, split by system) | Never -- Verovio's built-in pagination is more reliable and produces properly scoped SVG documents with correct `viewBox` attributes. |
| `getPageWithElement()` for event-to-page mapping | Parse SVG DOM to find elements per page | Only as fallback if `getPageWithElement()` proves too slow for large scores (unlikely for typical music). |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `@tanstack/react-virtual` | Camera uses CSS transforms, not scroll. Library fights the architecture. | Custom `getVisiblePages()` function |
| `react-virtuoso` | Same scroll-based assumptions as TanStack Virtual | Custom solution |
| `react-window` | Deprecated predecessor to TanStack Virtual. Same scroll-based model. | Custom solution |
| `react-intersection-observer` | Does not work reliably with CSS `transform: translateY()` parent panning | Direct camera position calculation |
| Splitting one large SVG string with regex/parsing | Fragile, loses viewBox, breaks element IDs | Verovio's native `renderToSVG(pageNo)` per-page rendering |
| Web Worker for position extraction | `getBoundingClientRect()` requires DOM access, unavailable in workers | Extract on main thread, cache results |

## Version Compatibility

| Existing Package | Efficiency Feature | Compatible | Notes |
|------------------|--------------------|------------|-------|
| `verovio@^6.0.1` | Paginated rendering | YES | `getPageCount()` + `renderToSVG(pageNo)` available since verovio 3.x |
| `verovio@^6.0.1` | Event-page mapping | YES | `getPageWithElement()` available since verovio 3.x |
| React 19 | Conditional page mounting | YES | Standard conditional rendering (`{isVisible && <div ... />}`) |
| Zustand ^5.0.10 | Event position cache | YES | Standard store pattern |
| Vite ^6.3.5 | No changes needed | YES | Build tooling unaffected by rendering strategy |

## Integration Points with Existing Code

### Files That Change

| File | Change | Why |
|------|--------|-----|
| `src/hooks/useVerovio.ts` | Return `pages: string[]` + `pageCount` instead of single `svgString` | Core pagination change |
| `src/renderers/RegularRenderer.tsx` | Render page components instead of single `dangerouslySetInnerHTML` div. Add `getVisiblePages()` calculation. | Virtual mounting |
| `src/lib/getEvents.ts` | `getEventsFromVerovio()` accepts page-aware structure, returns events with page number and global Y | Per-page event extraction |
| `src/lib/noteAnimation.ts` | `animateNoteheads()` and `resetNoteheadAnimations()` scope queries to mounted pages only | Performance (avoid querying unmounted DOM) |

### Files That Do NOT Change

| File | Why Unchanged |
|------|---------------|
| `src/lib/interpolation.ts` | Pure function on `MusicalEvent[]` -- no DOM dependency |
| `src/lib/animationController.ts` | Puppeteer interface unchanged -- `setTimestamp()` still drives camera position |
| `src/lib/verovioService.ts` | WASM singleton pattern unchanged |
| `src/stores/syncStore.ts` | Sync anchor data model unchanged (may add cache slice) |
| `src/lib/musicxmlValidation.ts` | Validation is pre-rendering, unaffected |

## Performance Expectations

| Metric | Current (Single 60K SVG) | After (Paginated + Virtual) | Basis |
|--------|--------------------------|----------------------------|-------|
| DOM nodes mounted | All systems, all notes | Only 2-4 pages worth | Virtual mounting |
| Peak memory | 6GB+ for long scores | ~200-400MB (proportional to mounted pages) | Fewer SVG elements in DOM |
| Initial render time | One large render | N smaller renders (can lazy-render offscreen) | Verovio renders per page |
| Event extraction | One pass, entire SVG | Per-page, cached | Cache avoids re-extraction |
| Camera update cost | Same | Same (CSS transform is unchanged) | Camera logic identical |

**Note:** These are estimates based on the architectural change, not benchmarks. Actual numbers depend on score length and complexity.

## Sources

### Primary (HIGH confidence)
- [Verovio Toolkit Methods](https://book.verovio.org/toolkit-reference/toolkit-methods.html) -- `getPageCount()`, `renderToSVG(pageNo)`, `getPageWithElement()`, `renderToTimemap()` API documentation
- [Verovio Toolkit Options](https://book.verovio.org/toolkit-reference/toolkit-options.html) -- `pageHeight`, `adjustPageHeight`, `breaks` options
- [Verovio Output Formats](https://book.verovio.org/toolkit-reference/output-formats.html) -- timemap format (tstamp, qstamp, on, off arrays)
- [Verovio Score Navigation](https://book.verovio.org/first-steps/score-navigation.html) -- multi-page rendering pattern
- [TanStack Virtual API Docs](https://tanstack.com/virtual/latest/docs/api/virtualizer) -- evaluated and rejected for this use case
- Codebase analysis -- `RegularRenderer.tsx`, `useVerovio.ts`, `getEvents.ts`, `noteAnimation.ts`, `verovioService.ts`

### Secondary (MEDIUM confidence)
- [TanStack Virtual npm](https://www.npmjs.com/package/@tanstack/react-virtual) -- v3.13.18 with React 19 compatibility notes (`useFlushSync: false`)
- [react-intersection-observer npm](https://www.npmjs.com/package/react-intersection-observer) -- v10.0.2, evaluated for page visibility detection
- [getBoundingClientRect performance](https://toruskit.com/blog/how-to-get-element-bounds-without-reflow/) -- caching strategies, reflow avoidance
- [Verovio GitHub Issue #526](https://github.com/rism-digital/verovio/issues/526) -- `getPageWithElement()` tree traversal performance implications

### Tertiary (LOW confidence)
- Performance estimates (DOM node reduction, memory savings) are architectural predictions, not benchmarks. Actual results must be measured during implementation.

---
*Stack research for: Efficiency optimizations (paginated SVG, event caching, virtual scrolling)*
*Researched: 2026-02-04*
