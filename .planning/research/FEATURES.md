# Feature Research: Efficiency Optimizations

**Domain:** Paginated SVG rendering, event caching, and virtual scrolling for browser-based music notation
**Researched:** 2026-02-04
**Confidence:** MEDIUM-HIGH

## Context

The Verovio migration is complete. The app currently renders the entire score as a single SVG
by setting `pageHeight: 60000` with `adjustPageHeight: true`. For long scores (200+ measures),
this produces a single SVG element with tens of thousands of DOM nodes, consuming 6GB+ of
browser memory. The efficiency optimizations address this by switching to paginated rendering,
caching computed event data, and only mounting visible SVG pages in the DOM.

**Current architecture (the problem):**
- `useVerovio` calls `tk.renderToSVG(1)` with `pageHeight: 60000` -- one giant SVG
- `getEventsFromVerovio` walks the entire SVG DOM, calls `tk.renderToTimemap()`, builds `MusicalEventWithY[]`
- All DOM nodes for all systems are present at all times
- Camera scrolls via CSS `translateY` on a wrapper div
- Animation/Puppeteer iterate over all events, query all SVG elements

## Feature Landscape

### Table Stakes (Must Have for Efficiency Milestone)

These features are non-negotiable for the optimization to be meaningful. Without all of them,
memory usage does not meaningfully decrease.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Paginated Verovio rendering | Core of the optimization -- render per-page SVGs instead of one monolith | MEDIUM | Verovio already supports `renderToSVG(pageNumber)` and `getPageCount()`. Switch from `pageHeight: 60000` to standard A4-ish page dimensions. Each page SVG is small and independent. |
| Page-aware viewport (mount/unmount) | Only visible pages should exist in the DOM | HIGH | Without this, paginated rendering just creates N small SVGs instead of 1 large SVG -- same total DOM cost. IntersectionObserver or scroll-position math determines which pages to mount. Placeholder divs with known heights maintain scroll position for unmounted pages. |
| Event position cache | Pre-compute all event data (timing, Y positions, page assignment) once after render, store in a lookup structure | MEDIUM | Currently `getEventsFromVerovio` walks the DOM on every render. The timemap data (`renderToTimemap`) and page assignment (`getPageWithElement`) are stable after `loadData` -- cache them. Only DOM positions need re-querying when pages mount. |
| Camera scrolling on paginated layout | Vertical scroll must work identically to current behavior | MEDIUM | Currently CSS `translateY` on a wrapper. With paginated layout, must translate to "scroll to page N, offset Y within page." System-boundary snapping logic must map from event Y to page+offset. |
| Puppeteer frame capture compatibility | `setTimestamp()` / `setFrame()` must still work for video export | HIGH | Puppeteer needs the active page's SVG in the DOM to screenshot. `setTimestamp` must: (1) determine which page contains the current event, (2) ensure that page is mounted, (3) apply animations, (4) position camera. Must be synchronous for screenshot timing. |
| Notehead animation on paginated pages | Scale/color animations must work on whichever page is visible | MEDIUM | Animation code (`animateNoteheads`) already operates on DOM refs. Must target the correct page's SVG container. No fundamental change to animation logic -- just scope the querySelector to the active page element. |

### Differentiators (Competitive Advantage)

Features that go beyond solving the memory problem and provide additional value.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Predictive page pre-rendering | Pre-render next page SVG before scroll reaches it | LOW | Verovio `renderToSVG(n+1)` is fast (~5-20ms). Call it when current playback approaches page boundary. Eliminates flash of empty content during scroll. Store rendered SVG strings in a Map cache. |
| Event-to-page index | O(1) lookup: given an event ID or timestamp, return page number | LOW | Build once from `renderToTimemap()` + `getPageWithElement()`. Stored as `Map<string, number>` (eventId -> pageNum) and sorted array for binary search by timestamp. Eliminates sequential scan through events. |
| SVG string cache | Cache rendered SVG strings so re-mounting a page does not call `renderToSVG` again | LOW | `Map<number, string>` keyed by page number. Invalidated only on `loadData()` or `setOptions()`. Verovio rendering is pure (same input = same output), so cache is always valid between reflows. |
| Smooth page transitions | Cross-fade or instant-swap between pages during playback so transition is invisible | MEDIUM | During playback, mount current + next page, position them vertically, let camera translateY handle the visual continuity. User should not perceive page boundaries. |
| Web Worker for Verovio rendering | Offload `renderToSVG()` calls to a background thread | HIGH | Verovio WASM can run in a Web Worker. Post MusicXML + options to worker, receive SVG strings back. Main thread stays responsive during large score rendering. Significant complexity -- toolkit instance management, message passing, WASM loading in worker context. |
| Render-mode page sequencer | In Puppeteer mode, automatically mount each page as needed during frame export | MEDIUM | Instead of having all pages in DOM, the sequencer mounts only the page needed for the current frame. Keeps Puppeteer memory low even for very long scores. Works with existing `setTimestamp` API. |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem like good optimizations but create more problems than they solve in this specific app.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Canvas rendering instead of SVG | Canvas has O(1) memory regardless of score size | Breaks all existing DOM-based animation code (querySelector, inline styles, getBoundingClientRect). Would require rewriting animation, color, and Puppeteer capture from scratch. SVG is needed for crisp scaling and element-level interaction. | Keep SVG, reduce DOM via pagination + virtual mounting. Canvas is a v3 consideration if pagination is insufficient. |
| Infinite scroll with measure-level granularity | Mount/unmount individual measures for finest-grained control | Verovio renders by PAGE, not by measure. There is no `renderMeasureToSVG()` API. Breaking pages into individual measures would require parsing SVG internals, which is extremely fragile. System breaks within a page are not individually addressable. | Use page-level granularity (Verovio's natural unit). Each page contains 2-6 systems, which is fine-grained enough. |
| Re-rendering only changed pages on options change | When zoom/scale changes, only re-render affected pages | Verovio's `setOptions` + `redoLayout` changes ALL page layouts (different measures per page, different page count). There is no incremental layout -- every page is potentially different after a reflow. | Invalidate the full SVG cache on options change. Re-render visible pages immediately, others lazily. Use debounced scale slider (already implemented) to minimize reflows. |
| SVG `<use>` deduplication across pages | Share glyph `<defs>` between pages to reduce total SVG size | Each page SVG from Verovio is self-contained with its own `<defs>`. Merging defs across pages requires SVG post-processing and creates ID collision risks. The memory savings are minimal compared to just not mounting distant pages. | Leave each page SVG self-contained. The virtual mounting strategy already ensures only 2-3 pages are in DOM at once. |
| Streaming/progressive SVG rendering | Render SVG incrementally as measures are parsed | Verovio's C++/WASM rendering pipeline is synchronous and produces complete page SVGs. There is no streaming API. The render call blocks but is fast (5-50ms per page). | Pre-render pages in background or Web Worker. The per-page render time is fast enough that streaming is unnecessary. |

## Feature Dependencies

```
Paginated Verovio Rendering (switch from pageHeight:60000 to normal pages)
    |
    +------> Event Position Cache
    |             |
    |             +------> Event-to-Page Index
    |             |             |
    |             |             v
    |             |        Camera Scrolling (page-aware)
    |             |             |
    |             |             v
    |             |        Smooth Page Transitions
    |             |
    |             +------> Puppeteer Frame Capture (page-aware setTimestamp)
    |
    +------> SVG String Cache
    |             |
    |             v
    |        Predictive Page Pre-rendering
    |
    +------> Page-aware Viewport (mount/unmount)
                  |
                  +------> Notehead Animation (scoped to active page)
                  |
                  +------> Render-mode Page Sequencer (Puppeteer)
```

### Dependency Notes

- **Paginated rendering is the foundation:** Everything else depends on Verovio producing per-page SVGs. This is a configuration change (`pageHeight` from 60000 to ~2970, remove `adjustPageHeight`), not a code rewrite.
- **Event cache must be built before viewport:** The viewport needs to know which page to show at a given timestamp. The event cache provides this mapping.
- **SVG string cache is independent of event cache:** Can be built in parallel. Stores rendered SVG strings keyed by page number.
- **Camera scrolling depends on event-to-page index:** Must translate "event at Y=4500" to "page 3, offset 200px within page."
- **Puppeteer depends on page-aware mounting:** `setTimestamp` must ensure the correct page is in the DOM before applying animations and taking a screenshot.
- **Animation scoping is trivial once viewport works:** Just pass the active page's DOM element instead of the full container.
- **Smooth transitions require both camera and viewport:** Must coordinate page mounting with camera position.

## MVP Definition

### Launch With (v1 -- Core Optimization)

Minimum to solve the 6GB memory problem for long scores.

- [ ] **Paginated rendering** -- Switch `useVerovio` from `pageHeight: 60000` to standard page dimensions; render via `renderToSVG(pageNumber)` per page
- [ ] **SVG string cache** -- Store rendered page SVGs in `Map<number, string>`; invalidate on score load or options change
- [ ] **Event position cache** -- Build full `MusicalEventWithY[]` from `renderToTimemap()` once; assign page numbers via `getPageWithElement()`; cache Y positions per-page via DOM query when page is first mounted
- [ ] **Page-aware viewport** -- Mount only visible pages + 1 buffer page above and below; use placeholder divs with computed heights for unmounted pages; update on scroll/playback
- [ ] **Camera scrolling (page-aware)** -- Translate event Y to page+offset; scroll container to correct page; apply intra-page translateY for system-boundary snapping
- [ ] **Puppeteer compatibility** -- `setTimestamp` mounts the required page, applies animation, positions camera; synchronous for screenshot

### Add After Validation (v1.x)

Features to add once core pagination works and memory is verified low.

- [ ] **Predictive pre-rendering** -- Pre-render next/prev page SVG when playback approaches boundary
- [ ] **Smooth page transitions** -- Mount current+next page for seamless visual transition during playback
- [ ] **Render-mode page sequencer** -- Optimize Puppeteer flow to mount only the needed page per frame

### Future Consideration (v2+)

Features to defer until the optimization is validated in production.

- [ ] **Web Worker rendering** -- Offload `renderToSVG()` to background thread; significant complexity, defer unless profiling shows main thread blocking
- [ ] **Measure-level virtual scroll** -- If page-level granularity is insufficient, investigate finer-grained mounting (likely requires upstream Verovio changes)

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Paginated rendering | HIGH | LOW | P1 |
| SVG string cache | HIGH | LOW | P1 |
| Event position cache | HIGH | MEDIUM | P1 |
| Page-aware viewport | HIGH | HIGH | P1 |
| Camera scrolling (page-aware) | HIGH | MEDIUM | P1 |
| Puppeteer compatibility | HIGH | HIGH | P1 |
| Notehead animation (scoped) | HIGH | LOW | P1 |
| Event-to-page index | MEDIUM | LOW | P1 |
| Predictive pre-rendering | MEDIUM | LOW | P2 |
| Smooth page transitions | MEDIUM | MEDIUM | P2 |
| Render-mode page sequencer | MEDIUM | MEDIUM | P2 |
| Web Worker rendering | LOW | HIGH | P3 |

**Priority key:**
- P1: Must have for launch -- solves the memory problem
- P2: Should have, add when possible -- improves UX
- P3: Nice to have, future consideration

## Competitor Feature Analysis

How similar apps handle large score rendering.

| Feature | Flat.io | MuseScore (web) | Noteflight | Our Approach |
|---------|---------|-----------------|------------|--------------|
| Rendering engine | Custom SVG (migrating to WebGL) | Qt/Canvas (desktop), SVG (web) | VexFlow SVG | Verovio SVG (paginated) |
| Large score handling | Separate formatting from painting; only paint visible pages | Desktop: canvas viewport; Web: pagination | DOM-based, limited optimization | Page-level virtual mounting with SVG cache |
| Scroll model | Page-based with virtual rendering | Continuous scroll (desktop); page-based (web) | Continuous scroll | Virtual scroll with page-level granularity, continuous scroll UX |
| Memory optimization | Skip painting non-visible pages | Canvas viewport (fixed buffer) | N/A (performance issues on long scores) | Mount only 3 pages at a time; SVG string cache for instant re-mount |
| Animation during playback | Cursor highlight | Cursor highlight | Cursor highlight | Per-notehead scale/color animation with CSS transitions |
| Video export | N/A | N/A | N/A | Puppeteer frame capture with page-aware mounting |

**Key insight from competitors:** Flat.io's recent engine rewrite confirms that separating layout computation from DOM painting is the correct pattern. Their approach (compute all page layouts, paint only visible ones) maps directly to our strategy of using Verovio for layout (all pages computed via `loadData` + page options) and virtual mounting for painting (only visible page SVGs in DOM).

## Implementation Notes

### Verovio API Surface for Pagination

These existing Verovio methods directly support the optimization:

| Method | Purpose | When to Call |
|--------|---------|-------------|
| `getPageCount()` | Total pages after layout | After `loadData()` + `setOptions()` |
| `renderToSVG(pageNo)` | Render one page as SVG string | When page enters viewport or is needed |
| `getPageWithElement(xmlId)` | Which page contains a note | During event cache construction |
| `renderToTimemap()` | All events with timing + note IDs | Once after `loadData()` + `renderToMIDI()` |
| `getTimeForElement(xmlId)` | Onset time for a specific note | Fallback for individual queries |
| `redoLayout()` | Recompute layout after options change | After `setOptions()` with dimension changes |

### Page Height Calculation

Verovio's default page height is 2970 (A4 portrait in 0.1mm units = pixels). At scale 40 (current app default), each page would contain roughly 3-5 systems of music. A 200-measure score might produce 8-15 pages instead of one 60,000px SVG.

The exact page dimensions should match the viewport height when possible, so that one page fills the visible area. This minimizes the number of pages that need to be mounted simultaneously.

### Scroll Position Mapping

Current: `event.y` is a pixel offset within the single giant SVG.
New: `event.y` must encode both page number and offset within that page.

Approach: Store events with `{ pageNumber, pageOffsetY, globalY }` where:
- `pageNumber` = which page (from `getPageWithElement`)
- `pageOffsetY` = Y offset within that page (from `getBoundingClientRect` relative to page SVG)
- `globalY` = cumulative Y across all pages (for scroll position calculation)

The camera system uses `globalY` to set the scroll container's scroll position, which naturally positions the correct page in the viewport.

### Puppeteer Frame Capture Workflow

Current flow:
1. `setTimestamp(seconds)` -- find event, apply animation, position camera
2. Puppeteer screenshots the viewport

New flow:
1. `setTimestamp(seconds)` -- find event, determine page number
2. Ensure target page SVG is mounted in DOM
3. Apply animation to elements on that page
4. Position camera (scroll to page + intra-page offset)
5. Force reflow (`void element.offsetHeight`)
6. Puppeteer screenshots the viewport

The key addition is step 2 -- mounting the page on demand. This must be synchronous (no `requestAnimationFrame` delay) for frame-accurate capture.

## Sources

### Primary (HIGH confidence)
- [Verovio Toolkit Methods](https://book.verovio.org/toolkit-reference/toolkit-methods.html) -- `getPageCount`, `renderToSVG(pageNo)`, `getPageWithElement`, `renderToTimemap` API
- [Verovio Toolkit Options](https://book.verovio.org/toolkit-reference/toolkit-options.html) -- `pageHeight` (max: 60000), `adjustPageHeight`, `breaks`, `svgViewBox`
- [Verovio Score Navigation](https://book.verovio.org/first-steps/score-navigation.html) -- Prev/Next page pattern with `getPageCount()` and `renderToSVG(pageNo)`
- [Verovio Layout Options](https://book.verovio.org/first-steps/layout-options.html) -- Page dimension configuration, `redoLayout()` usage
- Existing codebase: `useVerovio.ts`, `getEvents.ts`, `RegularRenderer.tsx`, `animationController.ts` -- direct code review

### Secondary (MEDIUM confidence)
- [Flat.io Editor Performance Update](https://blog.flat.io/flat-music-notation-software-lightning-fast-editor-update/) -- Confirms separation of formatting/painting pattern; virtual page rendering approach
- [Improving SVG Runtime Performance (CodePen)](https://codepen.io/tigt/post/improving-svg-rendering-performance) -- SVG DOM node count impact on memory and reflow
- [DOM Size Optimization (DebugBear)](https://www.debugbear.com/blog/excessive-dom-size) -- Browser threshold recommendations for DOM nodes
- [Virtual Scrolling Patterns (LogRocket)](https://blog.logrocket.com/virtual-scrolling-core-principles-and-basic-implementation-in-react/) -- IntersectionObserver and virtual scroll implementation patterns
- [Puppeteer SVG Rendering Issue #791](https://github.com/puppeteer/puppeteer/issues/791) -- Known delay requirement between SVG insertion and screenshot

### Tertiary (LOW confidence)
- [Canvas Virtualization (gedge.ca)](https://gedge.ca/blog/2024-11-03-virtualizing-the-canvas/) -- Guitar tab renderer progression from DOM to SVG to canvas with virtual viewport; confirms SVG DOM scaling issues for music notation
- [110K DOM Nodes with SVGs (Medium)](https://mmomtchev.medium.com/updating-a-dom-tree-with-110k-nodes-while-scrolling-with-animated-svgs-88d962661405) -- Real-world case study of large SVG DOM performance

---
*Feature research for: Efficiency optimizations (paginated rendering, event caching, virtual scrolling)*
*Researched: 2026-02-04*
