# Project Research Summary

**Project:** Manuscript Renderer v1.1 Efficiency Milestone
**Domain:** Memory and rendering efficiency for paginated music notation with virtual DOM
**Researched:** 2026-02-04
**Confidence:** HIGH

## Executive Summary

This research covers three interdependent efficiency optimizations for the Manuscript renderer: paginated SVG rendering, event position caching, and virtual scrolling. The current system renders entire scores as a single 60,000px-tall SVG, which causes 6GB+ memory consumption for long scores. The recommended approach uses Verovio's native pagination API to generate multiple smaller SVGs, caches extracted event data to avoid repeated DOM queries, and implements virtual scrolling to mount only visible pages in the DOM.

The critical finding is that **no new npm dependencies are required**. All three features can be implemented using the existing stack: Verovio's built-in `getPageCount()` and `renderToSVG(pageNo)` APIs, plain TypeScript Maps in Zustand for caching, and a custom page visibility manager driven by the existing CSS transform-based camera system. Virtual scroll libraries like TanStack Virtual are incompatible with this architecture because the camera uses CSS `translateY()` driven by audio playback, not user scrolling.

The main architectural risk is the Puppeteer frame capture pipeline, which requires animated elements to be present in the DOM at screenshot time. Virtual scrolling must either be disabled in render mode (mount all pages) or implement synchronous page mounting before frame capture. The recommended approach is to disable virtual scrolling for Puppeteer, as memory usage is acceptable in a controlled server environment.

## Key Findings

### Recommended Stack

**Core Recommendation: No New Libraries**

All three efficiency features use existing Verovio API + React + Zustand + TypeScript. This is not a compromise but the correct architectural approach.

**Core technologies:**
- **Verovio ^6.0.1**: Provides `getPageCount()`, `renderToSVG(pageNo)`, `getPageWithElement(xmlId)`, `renderToTimemap()` — all pagination APIs are built-in
- **React 19**: Conditional rendering for page mounting/unmounting — standard React patterns, no special libraries needed
- **Zustand ^5.0.10**: Event position cache store — plain `Map<string, CachedPosition>` in existing store structure
- **TypeScript ~5.9.3**: Type safety for cache interfaces and page metadata structures

**Stack changes (Verovio options only):**
- `pageHeight` option: `60000` → `2970` (A4) or viewport-height tuned
- Rendering strategy: `renderToSVG(1)` → `for (i = 1..getPageCount()) renderToSVG(i)`
- Camera coordinate system: single SVG Y → page-relative Y + cumulative offsets

**What NOT to use:**
- `@tanstack/react-virtual`: Designed for scroll-driven lists; camera uses CSS transforms, not scrolling
- `react-window`/`react-virtuoso`: Same scroll-based assumptions, incompatible with CSS transform camera
- `lru-cache`/`idb-keyval`: Only one score loaded at a time; simple Map suffices
- Regex-based SVG splitting: Verovio's native pagination is more reliable

### Expected Features

**Must have (table stakes):**
- **Paginated Verovio rendering** — Switch from `pageHeight: 60000` to standard page dimensions; render N smaller SVGs instead of one monolith
- **Page-aware viewport** — Mount only visible pages in DOM (typically 3-4 pages); placeholder divs maintain scroll positions for unmounted pages
- **Event position cache** — Pre-compute all event data (timing, Y positions, page assignment) once after render; cache in Zustand store keyed by layout parameters
- **Camera scrolling (page-aware)** — Translate event Y to page+offset; scroll container positions correct page; camera still uses single `translateY()` but in a global coordinate space
- **Puppeteer compatibility** — `setTimestamp()` must mount required pages before screenshot; simplest approach is to disable virtual scrolling in render mode
- **Notehead animation (scoped)** — Animations must work on whichever page is visible; query DOM within mounted page scope

**Should have (competitive):**
- **Predictive page pre-rendering** — Pre-render next page SVG when playback approaches page boundary; eliminates flash of empty content
- **Event-to-page index** — O(1) lookup: given event ID or timestamp, return page number; built from `renderToTimemap()` + `getPageWithElement()`
- **SVG string cache** — Cache rendered page SVG strings so re-mounting does not call `renderToSVG()` again; invalidate on score load or options change
- **Smooth page transitions** — Mount current + next page for seamless visual continuity during playback; users should not perceive page boundaries

**Defer (v2+):**
- **Web Worker rendering** — Offload `renderToSVG()` calls to background thread; significant complexity, defer unless profiling shows main thread blocking
- **Render-mode page sequencer** — Optimize Puppeteer to mount only the needed page per frame instead of all pages; complex but reduces Puppeteer memory

### Architecture Approach

The architecture refactor is an incremental three-layer approach: (1) paginated rendering establishes the multi-page foundation, (2) event caching decouples data extraction from DOM mounting state, and (3) virtual scrolling conditionally mounts pages based on camera position.

**Major components:**
1. **useVerovio (MODIFIED)** — Return `svgPages: string[]` + `pageCount` instead of single `svgString`; loop `renderToSVG(1..N)` with standard `pageHeight`
2. **EventCache (NEW)** — Extract events once per score load; cache timing data (from `renderToTimemap()`) + page assignments (from `getPageWithElement()`) + Y positions (from `getBoundingClientRect()` when page mounts); persist across re-renders; invalidate on layout parameter changes
3. **PageManager / useVirtualPages (NEW)** — Custom visibility manager using camera Y position + page heights to determine which pages to mount; NOT IntersectionObserver (async callbacks incompatible with Puppeteer); NOT TanStack Virtual (scroll-based model incompatible with CSS transform camera)
4. **RegularRenderer (MODIFIED)** — Render page slot components instead of single `dangerouslySetInnerHTML`; coordinate camera with page offsets; ensure animation targets are mounted; disable virtual scrolling in render mode

**Key patterns:**
- **Paginated rendering via Verovio native API**: Use `toolkit.getPageCount()` + `renderToSVG(pageNum)` instead of single giant SVG; each page is independent with its own `viewBox`
- **Event cache with page mapping**: Two-phase extraction: (1) timing data from `renderToTimemap()` (no DOM), (2) page assignment from `getPageWithElement()`, (3) Y positions from DOM when page mounts; cache keyed by `{contentHash, scale, pageWidth}`
- **Custom page visibility manager**: Pure function `getVisiblePages(cameraY, viewportHeight, pageHeights, overscan)` returns which pages to mount; camera position is known (drives the calculation), page heights are deterministic from Verovio; no scroll events to monitor

### Critical Pitfalls

1. **Animation targets unmounted SVG elements** — `animateNoteheads()` queries by ID; if page not mounted, querySelector returns null and animation fails silently; Puppeteer `setTimestamp()` iterates ALL events to compute animation states, failing for unmounted pages → **Solution:** In render mode, disable virtual scrolling (mount all pages); in preview mode, camera position ensures current page is mounted; for Puppeteer, check page mounting before animation

2. **getBoundingClientRect coordinate space mismatch** — Current system operates in single SVG coordinate space; pagination introduces N coordinate spaces (one per page); mixing page-local and global Y causes camera jumps → **Solution:** Compute TWO Y values per event: `pageLocalY` (within page SVG) and `globalY` (cumulative, accounting for preceding page heights); camera uses `globalY`; pre-compute page height offsets once

3. **Puppeteer frame capture misses unmounted content** — `setTimestamp()` manipulates DOM elements; with virtual scrolling, unmounted pages have no elements to style; `scrollHeight` reflects only mounted pages, not full score height → **Solution:** Disable virtual scrolling in render mode (`isRenderMode === true`); mount all pages for Puppeteer; replace `scrollHeight` with pre-computed total height from page offset table

4. **Event ID consistency across re-renders** — Current system uses sequential IDs `evt-${index}`; pagination changing event order orphans sync anchors → **Solution:** Use Verovio's MEI element IDs as event identifiers instead of sequential indices; sync anchors key on MEI IDs; requires one-time migration for existing anchor data

5. **Cache invalidation on layout changes** — Cached positions assume stable layout; changing scale/pageWidth/breaks invalidates positions → **Solution:** Key cache on `{xmlHash, pageWidth, scale, breaks}`; separate timing cache (stable) from spatial cache (layout-dependent); invalidate spatial cache on layout changes only

## Implications for Roadmap

Based on research, the pitfalls reveal a strict dependency chain:

### Phase 1: Paginated SVG Rendering
**Rationale:** Foundation for all efficiency work; establishes multi-page SVG output, global coordinate system, and page height offset table. Without this, virtual scrolling has no pages to virtualize and event caching has no page assignments.

**Delivers:** N smaller SVG strings instead of one massive SVG; each page can be inserted/removed independently; total DOM size unchanged (all pages mounted in Phase 1).

**Addresses:**
- Paginated Verovio rendering (table stakes)
- Camera scrolling on paginated layout (table stakes)
- SVG string cache (differentiator)

**Avoids:**
- Pitfall 2: getBoundingClientRect coordinate space mismatch — Phase 1 establishes global coordinate system before virtual scrolling complicates it
- Pitfall 7: renderToSVG performance — Pre-render all pages at load time, store SVG strings; no on-demand rendering during scroll

**Stack elements:** Verovio `getPageCount()`, `renderToSVG(pageNo)`, `pageHeight` option

**Architecture components:** useVerovio returns `svgPages[]`, RegularRenderer renders page slots, camera uses global Y coordinates

### Phase 2: Event Position Caching
**Rationale:** Decouples event extraction from DOM mounting state; produces stable event dataset with page assignments that virtual scrolling depends on. Cache enables re-mounting pages without re-extracting positions.

**Delivers:** All events extracted once per score load; timing data from `renderToTimemap()`, page assignments from `getPageWithElement()`, Y positions cached with page-relative and global coordinates.

**Addresses:**
- Event position cache (table stakes)
- Event-to-page index (differentiator)

**Avoids:**
- Pitfall 4: Event ID consistency — Switch to MEI element IDs for stable event identifiers
- Pitfall 5: Cache invalidation — Key cache on layout parameters for automatic invalidation

**Implements:** EventCache module, two-phase extraction (timing + spatial), cache invalidation strategy

### Phase 3: Virtual Scrolling (Page Mounting/Unmounting)
**Rationale:** Performance optimization that reduces DOM size by mounting only visible pages; depends on paginated rendering and cached events.

**Delivers:** Only 3-4 pages in DOM at any time; memory usage bounded regardless of score length; smooth scrolling maintained via virtual container pattern.

**Addresses:**
- Page-aware viewport (table stakes)
- Notehead animation on paginated pages (table stakes)
- Puppeteer frame capture compatibility (table stakes)
- Predictive page pre-rendering (differentiator)
- Smooth page transitions (differentiator)

**Avoids:**
- Pitfall 1: Animation targets unmounted elements — Render mode disables virtual scrolling; preview mode mounts pages via camera position
- Pitfall 3: Puppeteer misses unmounted content — Virtual scrolling disabled in render mode
- Pitfall 6: Page boundary camera transitions — Virtual container pattern keeps camera smooth

**Uses:** Custom `getVisiblePages()` function (NOT IntersectionObserver, NOT TanStack Virtual); camera position + page heights determine visibility

### Phase 4: OSMD Cleanup (Parallel with Phases 1-3)
**Rationale:** Independent of efficiency features; removes dead code and dependencies. Can happen at any point or in parallel.

**Delivers:** Remove unused OSMD imports, delete OSMD-specific code paths, clean up dead configuration.

### Phase Ordering Rationale

- **Sequential dependency**: Phase 2 requires Phase 1 (needs page assignments), Phase 3 requires Phase 2 (needs cached events with page numbers)
- **Risk management**: Each phase is independently valuable; if Phase 3 encounters issues, Phase 1+2 already deliver performance benefits (smaller SVGs, no redundant extraction)
- **Testing boundaries**: Clear verification at each phase: Phase 1 = visual correctness + camera works; Phase 2 = cache invalidates properly; Phase 3 = Puppeteer frames match baseline
- **Architectural hygiene**: Establish coordinate system (Phase 1) before adding caching (Phase 2) before adding complexity of conditional mounting (Phase 3)

### Research Flags

**Phases likely needing deeper research during planning:**
- **Phase 3 (Virtual Scrolling):** Puppeteer integration is complex; custom page visibility manager pattern is new; may need spike/prototype to validate approach

**Phases with standard patterns (skip research-phase):**
- **Phase 1 (Paginated Rendering):** Verovio pagination API is well-documented; coordinate system math is straightforward
- **Phase 2 (Event Caching):** Standard application state management with Zustand; cache invalidation pattern is established
- **Phase 4 (OSMD Cleanup):** Code deletion, no new patterns

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | **HIGH** | Verovio pagination API verified from official docs; no speculative libraries; all features use existing stack |
| Features | **MEDIUM-HIGH** | Table stakes features are clear; differentiators are validated but lower priority; anti-features analysis is thorough |
| Architecture | **HIGH** | Built on verified codebase analysis + official Verovio docs + MDN Intersection Observer spec; integration points thoroughly mapped |
| Pitfalls | **HIGH** | Based on direct codebase analysis (RegularRenderer.tsx, getEvents.ts, noteAnimation.ts, animationController.ts); Puppeteer + virtual scroll interaction is well-understood |

**Overall confidence:** **HIGH**

### Gaps to Address

- **Actual performance numbers:** Research provides architectural estimates (200-400MB memory after virtualization vs. 6GB+ current) but these must be measured during implementation with representative scores
- **renderToSVG() timing:** Assumption that pre-rendering all pages at load is acceptable (<2s for typical scores); profile with real content to validate
- **Page height proxy accuracy:** Using SVG `viewBox` height to avoid mounting pages for measurement — needs validation that viewBox dimensions match rendered pixel height at given scale
- **IntersectionObserver vs. custom visibility:** Research recommends custom calculation over IntersectionObserver due to CSS transform interactions; validate this conclusion with prototype
- **MEI element ID stability:** Assumption that Verovio's MEI element IDs are stable across re-renders with same XML — verify that element IDs do not change when only layout options change

## Sources

### Primary (HIGH confidence)
- [Verovio Toolkit Methods](https://book.verovio.org/toolkit-reference/toolkit-methods.html) — `getPageCount()`, `renderToSVG(pageNo)`, `getPageWithElement()`, `renderToTimemap()` API documentation
- [Verovio Toolkit Options](https://book.verovio.org/toolkit-reference/toolkit-options.html) — `pageHeight`, `adjustPageHeight`, `breaks` options; pageHeight range 100-60000
- [Verovio Output Formats](https://book.verovio.org/toolkit-reference/output-formats.html) — timemap format (tstamp, qstamp, on, off arrays)
- [Verovio Score Navigation](https://book.verovio.org/first-steps/score-navigation.html) — multi-page rendering pattern
- [Verovio Layout Options](https://book.verovio.org/first-steps/layout-options.html) — Page dimension configuration, `redoLayout()` usage
- [Verovio Controlling SVG Output](https://book.verovio.org/advanced-topics/controlling-the-svg-output.html) — scale, page dimensions, SVG viewBox behavior
- [TanStack Virtual API Docs](https://tanstack.com/virtual/latest/docs/api/virtualizer) — evaluated and rejected for scroll-model mismatch
- [MDN Intersection Observer API](https://developer.mozilla.org/en-US/docs/Web/API/Intersection_Observer_API) — viewport detection, evaluated as secondary option
- Codebase analysis: `RegularRenderer.tsx`, `useVerovio.ts`, `getEvents.ts`, `noteAnimation.ts`, `animationController.ts`, `verovioService.ts`, `interpolation.ts`, `SyncEditor.tsx` — all files read and analyzed

### Secondary (MEDIUM confidence)
- [TanStack Virtual npm](https://www.npmjs.com/package/@tanstack/react-virtual) — v3.13.18 compatibility notes
- [Flat.io Editor Performance Update](https://blog.flat.io/flat-music-notation-software-lightning-fast-editor-update/) — Confirms separation of formatting/painting pattern; virtual page rendering approach
- [getBoundingClientRect performance](https://toruskit.com/blog/how-to-get-element-bounds-without-reflow/) — caching strategies, reflow avoidance
- [Verovio GitHub Issue #526](https://github.com/rism-digital/verovio/issues/526) — `getPageWithElement()` tree traversal performance implications
- [Improving SVG Runtime Performance (CodePen)](https://codepen.io/tigt/post/improving-svg-rendering-performance) — SVG DOM node count impact on memory and reflow
- [DOM Size Optimization (DebugBear)](https://www.debugbear.com/blog/excessive-dom-size) — Browser threshold recommendations for DOM nodes
- [Virtual Scrolling Patterns (LogRocket)](https://blog.logrocket.com/virtual-scrolling-core-principles-and-basic-implementation-in-react/) — IntersectionObserver implementation patterns
- [Puppeteer SVG Rendering Issue #791](https://github.com/puppeteer/puppeteer/issues/791) — Known delay requirement between SVG insertion and screenshot
- [Paul Irish: What Forces Layout/Reflow](https://gist.github.com/paulirish/5d52fb081b3570c81e3a) — Forced reflow triggers including getBoundingClientRect
- [SitePoint: DOM to SVG Coordinates](https://www.sitepoint.com/how-to-translate-from-dom-to-svg-coordinates-and-back-again/) — getScreenCTM() for coordinate translation

### Tertiary (LOW confidence)
- Performance estimates (DOM node reduction 6GB → 200-400MB, renderToSVG timing) are architectural predictions, not benchmarks — must be measured during implementation
- [Canvas Virtualization (gedge.ca)](https://gedge.ca/blog/2024-11-03-virtualizing-the-canvas/) — Guitar tab renderer progression; confirms SVG DOM scaling issues but canvas approach not applicable here
- [110K DOM Nodes with SVGs (Medium)](https://mmomtchev.medium.com/updating-a-dom-tree-with-110k-nodes-while-scrolling-with-animated-svgs-88d962661405) — Real-world case study, different domain

---
*Research completed: 2026-02-04*
*Ready for roadmap: yes*
