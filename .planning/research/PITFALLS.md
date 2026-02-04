# Pitfalls Research: Efficiency Features

**Domain:** Paginated SVG rendering, virtual scrolling, and event caching for music notation renderer
**Researched:** 2026-02-04
**Confidence:** HIGH (based on direct codebase analysis, verified Verovio API documentation, and established SVG/DOM behavior)

## Critical Pitfalls

### Pitfall 1: Animation Targets Unmounted SVG Elements

**What goes wrong:**
The current `noteAnimation.ts` selects elements by ID: `root.querySelector('#${CSS.escape(id)}')`. With virtual scrolling, only pages near the camera viewport are mounted in the DOM. When the animation loop fires `animateNoteheads()` for an event whose SVG page is not mounted, the `querySelector` returns `null` and the animation silently fails. The notehead never scales or colors. Worse, in Puppeteer render mode, `setTimestamp()` iterates ALL events up to the current time (lines 525-605 of RegularRenderer.tsx) to calculate interpolated animation states. If any of those events reference unmounted elements, the frame capture produces incorrect output -- notes that should show mid-exit-animation appear unanimated.

**Why it happens:**
Virtual scrolling unmounts DOM elements to save memory. The animation system was designed under the assumption that every note in the score is always present in the DOM. This assumption is embedded in every animation path: real-time playback (`animateSync`), frame-accurate rendering (`setTimestamp`), and the animation controller (`animationController.ts` lines 45-56).

**How to avoid:**
1. Before animating, check if the target page is mounted. If not, mount it temporarily for animation and Puppeteer capture.
2. For real-time playback, the camera position already determines which page is visible. Only animate events on the currently visible page. Events on other pages do not need animation since they are not on screen.
3. For Puppeteer frame capture, the `setTimestamp` function must ensure ALL pages containing events in the current animation window are mounted before iterating. This means the Puppeteer path needs a "mount page for capture" step that the real-time playback path does not.
4. Store the page number for each event in the event cache (see Pitfall 5). Use `toolkit.getPageWithElement(svgId)` during event extraction to build this mapping once.

**Warning signs:**
- Notes near page boundaries occasionally fail to animate
- Puppeteer frames show noteheads at default color/scale when they should be in exit-animation
- `animateNoteheads` logs no errors but produces no visual change
- Animation works perfectly when virtual scrolling is disabled (all pages mounted)

**Phase to address:**
Virtual Scrolling phase -- must be solved as part of the virtual scroll implementation, not deferred.

---

### Pitfall 2: getBoundingClientRect Returns Wrong Values for Unmounted Pages

**What goes wrong:**
The current `getEventsFromVerovio()` uses `getBoundingClientRect()` on `g.system` elements to compute Y positions (lines 110-116 of `getEvents.ts`). With paginated rendering, each page is a separate SVG element. If pages are stacked vertically in the DOM, `getBoundingClientRect()` returns viewport-relative coordinates that include the cumulative height of all preceding pages. If virtual scrolling unmounts earlier pages, the coordinate space changes -- a system that was at Y=15000 in the single-SVG model is now at Y=500 relative to its own page's SVG root. The camera system (`applyCamera` in RegularRenderer.tsx, line 284) uses these Y values to compute `translateY`. Mixing coordinate spaces causes the camera to jump to wrong positions or oscillate between pages.

**Why it happens:**
The current code operates in a single coordinate space: one SVG, one `containerRect`, all positions relative to the container top. Pagination introduces N coordinate spaces (one per page). The Y position of a system is no longer a global value -- it is page-local. Without explicit coordinate translation between page-local and global, all spatial queries break.

**How to avoid:**
1. During event extraction, compute TWO Y values per event: `pageLocalY` (position within the page SVG) and `globalY` (cumulative position accounting for page height offsets).
2. The `globalY` for an event on page N equals: `sum(heights of pages 1..N-1) + pageLocalY`.
3. Pre-compute page height offsets once during extraction: render each page, measure its SVG height (from Verovio's output dimensions, not DOM measurement), and build a cumulative offset table.
4. The camera system should use `globalY` for positioning, same as today.
5. Do NOT call `getBoundingClientRect()` on elements across multiple pages in the same batch -- each page must be measured independently relative to its own SVG root, then translated to global coordinates.
6. Verovio's `svgViewBox` option embeds explicit dimensions in the SVG element. Use these SVG-space values rather than DOM measurements where possible, since they are deterministic and not affected by mounting state.

**Warning signs:**
- Camera jumps to top of score when crossing a page boundary
- Y positions cluster into distinct groups separated by large gaps (page height boundaries)
- Camera works correctly on first page but breaks on subsequent pages
- `getBoundingClientRect().top` returns negative values or values larger than expected

**Phase to address:**
Paginated Rendering phase -- must establish the global coordinate system before virtual scrolling is added.

---

### Pitfall 3: Puppeteer Frame Capture Misses Unmounted Content

**What goes wrong:**
The current Puppeteer integration (`setTimestamp` in RegularRenderer.tsx, lines 483-609) directly manipulates SVG DOM elements to set precise animation states for each frame. It iterates through all events from the start of the score up to the current timestamp, applying inline styles to every note that should be in an active animation state. With virtual scrolling, notes on unmounted pages have no DOM elements to style. The captured frame shows blank space or default styling where animated notes should appear.

Additionally, the camera system (`applyCamera`) uses `osmdRef.current.scrollHeight` (line 285) to compute the maximum scroll range. With virtual scrolling, `scrollHeight` reflects only the currently mounted pages, not the full score height. This produces incorrect camera clamping -- the camera cannot scroll to the end of the score.

**Why it happens:**
Puppeteer's frame-by-frame rendering model assumes the entire score is in the DOM at all times. The `setTimestamp` function does a full backward scan to compute all active animations (line 525: `for (let i = 0; i <= currentIndex; i++)`). Virtual scrolling fundamentally breaks this assumption.

**How to avoid:**
1. For Puppeteer render mode (`isRenderMode === true`), disable virtual scrolling entirely. Mount all pages. The memory cost is acceptable because Puppeteer runs in a controlled server environment with more available memory than a browser tab.
2. Alternatively, implement a "render mode mount strategy" that mounts only the pages containing events in the current animation window (current event plus all events still in their exit-animation phase). This is more complex but uses less memory.
3. Replace `osmdRef.current.scrollHeight` with a pre-computed total score height derived from the page height offset table (see Pitfall 2). This value is deterministic and does not depend on mounting state.
4. The `animationController.ts` also needs the same fix -- it calls `clearNoteColor` and `applyNoteColor` on the container element (lines 45-56, 61-72), which fails silently for unmounted notes.

**Warning signs:**
- Rendered video has blank frames or frames with missing note highlights
- Camera stops scrolling partway through the score in render mode
- `scrollHeight` is smaller than expected when only a few pages are mounted
- Frame capture tests pass when virtual scrolling is disabled but fail when enabled

**Phase to address:**
Virtual Scrolling phase -- but can be mitigated early by making render mode bypass virtual scrolling entirely.

---

### Pitfall 4: Event ID Consistency Across Page Re-renders

**What goes wrong:**
The current system generates event IDs sequentially during extraction: `id: 'evt-${index}'` (line 90 of `getEvents.ts`). Sync anchors reference these IDs: `syncAnchors.has('evt-0')` for the first event, `syncAnchors.has('evt-N')` for the last. If pagination changes which events are extracted (e.g., re-rendering with different page dimensions produces different line breaks, which changes the number of systems and potentially the number of events if Verovio merges tied notes differently), the event IDs shift and all existing sync anchors become orphaned. The user's carefully-set timing anchors point to events that no longer exist.

**Why it happens:**
The event ID scheme is index-based, not content-based. Any change to the event list order or count invalidates all anchor references. This is already a latent bug with the current system (changing score scale re-extracts events and could shift IDs), but pagination makes it more likely because page layout is more sensitive to dimensions.

**How to avoid:**
1. Use Verovio's stable MEI element IDs as the event identifier instead of sequential indices. The `svgIds` array already contains these MEI IDs (e.g., `note-L14F1` or a UUID-style MEI ID). Use the first svgId as the event ID.
2. When building the sync anchor map, key on MEI element IDs rather than `evt-N` indices.
3. This requires a migration step for existing sync anchor data. If users have saved anchors keyed on `evt-N`, provide a one-time migration that maps old indices to MEI IDs based on order.
4. Alternatively, maintain a stable mapping from `evt-N` to MEI IDs and regenerate it on each extraction. But this is fragile -- the MEI-ID approach is fundamentally better.

**Warning signs:**
- Changing score scale or window size causes sync anchors to "forget" their positions
- First and last anchor checks fail after re-render (`hasFirstAnchor` / `hasLastAnchor` in RegularRenderer.tsx line 382-383)
- `interpolateTimestamps` produces timestamps of 0 for all events (because no anchors match)

**Phase to address:**
Event Caching phase -- when building the persistent event cache, switch to MEI-based IDs. This is a prerequisite for stable caching.

---

### Pitfall 5: Cache Invalidation on Layout Changes

**What goes wrong:**
Caching event positions (Y coordinates, page assignments) assumes the layout is stable. But Verovio layout depends on: `pageWidth`, `scale`, `breaks` mode, and container dimensions. Changing score scale (via the scale slider) or resizing the score region triggers a Verovio re-render with different options. If the cached event positions are not invalidated, the camera scrolls to stale Y positions, notes animate on wrong pages, and page assignments are incorrect.

The current code re-extracts events on every SVG change (RegularRenderer.tsx lines 234-238, inside the `useEffect` that watches `svgString`). Caching introduces the risk that this re-extraction is skipped when it should not be.

**Why it happens:**
Developers cache positions for performance but forget the many triggers that invalidate them. Score scale changes, window resize, score region resize, and even font loading can alter SVG layout and thus element positions. The invalidation surface is larger than it appears.

**How to avoid:**
1. Key the cache on a hash of rendering parameters: `{xml content hash, pageWidth, scale, breaks}`. Any change to these parameters invalidates the entire cache.
2. Separate the cache into two layers: (a) timing data (beatOnset, svgIds, event IDs) which is stable across layout changes, and (b) spatial data (Y positions, page assignments) which changes with layout.
3. On scale/resize, invalidate only the spatial cache and re-compute positions. The timing data (which requires `renderToTimemap()`) can be preserved if the XML content has not changed.
4. Never cache `getBoundingClientRect()` results -- these are viewport-relative and change with scroll position. Cache SVG-space values instead (using `getBBox()` or computing from SVG attributes).

**Warning signs:**
- Camera scrolls to wrong position after changing score scale
- Events report page 1 when they should be on page 3 after a resize
- "Works on first render, breaks after changing settings" pattern
- Memory usage stays flat (cache never rebuilds) even after layout changes

**Phase to address:**
Event Caching phase -- cache design must include invalidation strategy from the start.

---

### Pitfall 6: Page Boundary Camera Transitions

**What goes wrong:**
The current camera system is smooth because all systems exist in one continuous coordinate space. With pagination, there is an implicit gap between the last system on page N and the first system on page N+1 (the gap between where one SVG ends and the next begins in the DOM). If virtual scrolling swaps pages, the camera `translateY` value must account for which pages are currently mounted and their positions. A naive implementation produces visible jumps: the score appears to teleport when crossing a page boundary because the DOM structure changes (one page unmounts, another mounts) and the `translateY` offset does not compensate.

**Why it happens:**
The current `applyCamera` function (RegularRenderer.tsx line 284) applies a single `translateY` to the camera div, assuming a continuous layout. With multiple page elements, the `translateY` must either: (a) translate within a container that stacks all page SVGs vertically, or (b) translate the viewport position and swap which page SVG is visible. Both approaches can cause frame-of-jank during page transitions.

**How to avoid:**
1. Use a container div that represents the full score height (even if pages inside it are virtualized). Set the container height to the sum of all page heights. Position each mounted page absolutely at its correct Y offset within this container. The camera `translateY` then works against this full-height container, exactly like the current single-SVG approach.
2. This is the "virtual scroll window" pattern: the outer container is the full height, the inner mounted content is positioned absolutely, and the viewport clips to the visible region.
3. When a page mounts or unmounts, it should not affect the positions of other pages. Each page has a fixed Y offset in the virtual container.
4. The camera `transition: transform 200ms ease-out` (RegularRenderer.tsx line 718) may cause visible artifacts during page transitions. Consider temporarily disabling the transition when crossing page boundaries, or ensure the page swap happens at least one frame before the camera starts moving to the new position.

**Warning signs:**
- Score "jumps" visibly when the camera crosses from one page to the next
- Brief flash of blank space during page transitions
- Camera overshoots or undershoots at page boundaries
- The `transition: transform 200ms ease-out` on the camera div causes a delayed jump

**Phase to address:**
Virtual Scrolling phase -- the virtual scroll container structure must be designed to support smooth camera transitions.

---

### Pitfall 7: renderToSVG Per Page Is Not Free

**What goes wrong:**
Developers assume that since Verovio already computed the layout during `loadData()`, calling `renderToSVG(pageNum)` for each page is nearly instant. In reality, each `renderToSVG()` call generates the full SVG string for that page, including all glyph definitions in `<defs>`, coordinate calculations, and string serialization. For a 50-page score, rendering all pages sequentially takes 500ms-2s, blocking the UI thread. If pages are rendered on-demand during scrolling, each page swap can cause a 30-100ms jank spike.

**Why it happens:**
Verovio's `renderToSVG()` is implemented in C++ (WASM) and does real work -- it is not just returning a cached string. The SVG generation involves iterating the page's musical elements and serializing them to SVG markup. For pages with dense notation (many notes, chords, articulations), this is non-trivial.

**How to avoid:**
1. Pre-render all pages during the initial load phase, not on-demand during scrolling. Store the SVG strings in an array. The memory cost of SVG strings is much smaller than mounted DOM trees.
2. Profile the actual render time for representative scores. If pre-rendering all pages takes too long (>2s), render pages in batches using `requestIdleCallback` or `setTimeout(0)` to avoid blocking the UI.
3. For virtual scrolling, pre-render SVG strings but lazily mount them into the DOM. Mounting a pre-rendered SVG string via `innerHTML` is fast (~1-5ms). The expensive part is the `renderToSVG()` call, not the DOM insertion.
4. Consider using a Web Worker for pre-rendering if profiling shows it is a bottleneck. Verovio can run in a Web Worker since it is pure WASM with no DOM dependency for rendering.

**Warning signs:**
- Visible pause or jank when scrolling to a new page
- Frame drops during fast scrolling through a long score
- Initial load takes significantly longer after switching to paginated rendering
- `renderToSVG()` calls appearing in performance profiles during scroll handlers

**Phase to address:**
Paginated Rendering phase -- pre-render strategy must be part of the initial implementation.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Disable virtual scrolling in render mode | Avoids complex Puppeteer/mounting interactions | Full DOM for long scores in Puppeteer; memory usage remains high for video export | Acceptable as v1.1 approach -- Puppeteer runs in controlled environment; optimize later if export OOMs |
| Keep sequential event IDs (`evt-N`) instead of MEI IDs | No sync anchor migration needed | Anchor instability on layout changes (same latent bug as v1.0) | Acceptable ONLY if score scale cannot change after anchors are set; otherwise, fix the ID scheme |
| Render all pages at load instead of lazy | Simple implementation, no on-demand rendering jank | Higher initial load time (500ms-2s for long scores) | Acceptable for v1.1 -- most scores are under 20 pages; optimize with lazy rendering in v1.2 if profiling shows need |
| Use DOM `getBoundingClientRect` for Y positions instead of SVG-space math | Easier to implement, matches current code pattern | Forced reflow on each measurement, viewport-dependent values | Acceptable for initial implementation; migrate to SVG-space if profiling shows layout thrashing |
| Single-page rendering for short scores (< 5 pages) | Skip pagination complexity for most user scores | Two code paths to maintain | Never -- always use the paginated path, even for short scores, to avoid divergent behavior |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Verovio `getPageWithElement()` | Calling after `loadData()` but before `renderToSVG()` -- returns 0 | Call only after at least one `renderToSVG()` to ensure layout is computed |
| Verovio `renderToTimemap()` | Assuming it includes page numbers | It does NOT include page numbers. Use `getPageWithElement(id)` to map events to pages after timemap extraction |
| Camera + virtual scroll | Using `scrollHeight` of the container to compute max scroll | `scrollHeight` reflects mounted content only. Use pre-computed total height from page dimensions |
| `dangerouslySetInnerHTML` + page swaps | Re-rendering the container div causes React to re-create the entire subtree | Use separate div elements per page with independent `dangerouslySetInnerHTML`, so mounting/unmounting one page does not affect others |
| Event extraction + pagination | Running `querySelectorAll('g.system')` on the container when only some pages are mounted | Run extraction on ALL pages (mount them temporarily if needed), then cache results. Do not extract incrementally per-page -- the event list must be complete for interpolation to work |
| `resetNoteheadAnimations()` | Calling on the container div when some pages are unmounted -- silently skips unmounted notes, leaving stale animation state | Track which notes have active animations in JS state (not just DOM). On reset, clear the JS state. On mount, apply correct state from JS. |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Rendering all pages to DOM at once | 6GB+ memory, same as current single-SVG approach | Virtual scrolling: mount only visible pages + 1 buffer page on each side | Immediately on long scores (50+ pages) |
| Calling `renderToSVG()` during scroll handler | 30-100ms jank per page, dropped frames, unresponsive UI | Pre-render all page SVG strings at load time, store in array, mount from cache | Any score with more than 3 pages during fast scrolling |
| `getBoundingClientRect()` in a loop across many elements | Forced synchronous reflow per call if DOM is dirty | Batch all reads before any writes. Or compute positions from SVG attributes (no reflow needed) | Scores with 500+ events during event extraction |
| Re-extracting events on every scroll position change | CPU spike, dropped frames, battery drain on laptops | Extract once, cache with layout-parameter key. Re-extract only when layout changes (scale, resize, new XML) | Any score during normal playback |
| Mounting/unmounting pages causes full subtree reconciliation in React | React re-runs effects, refs reset, event listeners lost | Use `display: none` instead of conditional rendering for page visibility. Or use vanilla DOM manipulation (not React) for the page container | Scores with 10+ pages during fast scrolling |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Visible blank space during page transitions | User sees white gap flash between systems during playback | Pre-mount buffer pages (1 above, 1 below viewport) so content is ready before camera reaches it |
| Score jumps on page boundary during playback | Jarring visual disruption breaks the "smooth scrolling video" aesthetic | Use the virtual-container pattern (Pitfall 6) so page boundaries are invisible to the camera |
| Long initial load for pre-rendering all pages | User stares at loading spinner for 2+ seconds on very long scores | Show progressive rendering: display first page immediately, render remaining pages in background, show progress indicator |
| Animation flicker when page mounts with stale state | Note appears at default state for one frame before animation applies | Apply correct animation state to page SVG BEFORE mounting it into the visible DOM (prepare off-screen, then swap in) |
| Camera transition CSS interferes with page swaps | `transition: transform 200ms ease-out` causes camera to animate to wrong position during rapid page changes | Disable transition during page boundary crossings, or always keep enough pages mounted that the transition does not reveal unmounted content |

## "Looks Done But Isn't" Checklist

- [ ] **Paginated Rendering:** Score renders in pages -- verify that event extraction still produces the SAME number of events as the single-SVG approach. Pagination should not change what notes exist, only where they are positioned.
- [ ] **Event Cache:** Events are cached -- verify cache invalidates when score scale changes. Change scale, play from beginning, confirm camera scrolls to correct positions on every system.
- [ ] **Virtual Scrolling:** Only visible pages mounted -- verify Puppeteer frame capture still produces correct output. Render a 10-second clip and compare frame-by-frame with non-virtualized rendering.
- [ ] **Page Boundary Camera:** Camera crosses page boundaries -- verify no visual jump or blank flash at any page boundary. Record playback and inspect frame-by-frame at every boundary.
- [ ] **Sync Anchors:** User-set anchors survive re-render -- change score scale after setting anchors, verify all anchors still map to correct notes and playback timing is unchanged.
- [ ] **Animation at Page Edges:** Notes at the last system of a page and first system of next page -- verify both animate correctly during playback. These are the elements most likely to be on an unmounted buffer page.
- [ ] **Full-Note Coloring:** `colorFullNote` option colors stems and accidentals -- verify this works across page boundaries when the note group spans mounted/unmounted pages (unlikely but possible for very wide chords with accidentals).
- [ ] **Reset After Page Change:** User plays to page 5, hits Reset -- verify camera returns to page 1, all noteheads on all pages are reset (not just mounted ones). The `resetNoteheadAnimations` function must handle unmounted pages.

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Animation targets unmounted elements | MEDIUM | Add page-awareness to `animateNoteheads`: check if page is mounted before querying, mount if needed for render mode. 4-8 hours. |
| Coordinate space mismatch | HIGH | Retrofit global coordinate system: compute page height offsets, add `globalY` to event model, update camera to use globalY. 1-2 days. |
| Puppeteer misses unmounted content | LOW | Disable virtual scrolling in render mode with a single flag. 1 hour. Quick fix, proper fix later. |
| Event ID instability | MEDIUM | Migrate event IDs from `evt-N` to MEI element IDs. Requires sync anchor migration for existing data. 4-8 hours. |
| Cache not invalidating | LOW | Add layout-parameter hash to cache key. When parameters change, cache misses automatically. 2 hours. |
| Page boundary camera jumps | MEDIUM | Implement virtual container with absolute page positioning. Requires restructuring the camera container div. 4-8 hours. |
| renderToSVG blocking UI during scroll | MEDIUM | Pre-render all pages at load time, store SVG strings in memory. 2-4 hours. |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Animation targets unmounted elements | Virtual Scrolling | Play through a page boundary; notes on new page animate correctly on first frame of visibility |
| getBoundingClientRect coordinate space | Paginated Rendering | Extract events, verify Y positions form a monotonically increasing sequence across all pages |
| Puppeteer misses unmounted content | Virtual Scrolling | Run Puppeteer frame capture on a 3+ page score; diff frames against non-virtualized baseline |
| Event ID consistency | Event Caching | Set sync anchors, change score scale, verify anchors still point to correct notes |
| Cache invalidation on layout changes | Event Caching | Change scale slider 5 times; verify camera positions are correct each time without manual cache clear |
| Page boundary camera transitions | Virtual Scrolling | Record playback; inspect every page boundary frame for visual discontinuity |
| renderToSVG performance | Paginated Rendering | Profile initial load time; verify no `renderToSVG` calls appear in scroll handler flame graphs |

## Ordering Implications for Roadmap

The pitfalls reveal a strict dependency chain for the efficiency features:

1. **Paginated Rendering FIRST** -- Establishes multi-page SVG output, global coordinate system, page height offset table, and pre-rendered SVG string cache. Without this foundation, virtual scrolling has no pages to virtualize and event caching has no page assignments to cache.

2. **Event Caching SECOND** -- Once pages exist, extract all events across all pages, assign page numbers and global Y positions, and cache the result. The cache key includes layout parameters for automatic invalidation. This produces the stable event dataset that virtual scrolling depends on.

3. **Virtual Scrolling THIRD** -- With pages rendered and events cached (with page assignments), implement the mount/unmount logic. The virtual scroll container uses the pre-computed page heights. Animation checks the event cache for page assignment before querying DOM. Puppeteer render mode disables virtual scrolling.

4. **OSMD Cleanup can happen at any point** -- Removing dead OSMD code is independent of the above three features.

## Sources

- Verovio Reference Book: [Toolkit Methods](https://book.verovio.org/toolkit-reference/toolkit-methods.html) -- HIGH confidence (official docs, verified `getPageWithElement`, `getPageCount`, `renderToSVG` page parameter)
- Verovio Reference Book: [Layout Options](https://book.verovio.org/first-steps/layout-options.html) -- HIGH confidence (official docs, verified `pageHeight`, `adjustPageHeight`, `breaks` options)
- Verovio Reference Book: [MIDI Playback](https://book.verovio.org/interactive-notation/playing-midi.html) -- HIGH confidence (official docs, verified `getElementsAtTime` returns `{page, notes[]}`)
- Verovio Reference Book: [Toolkit Options](https://book.verovio.org/toolkit-reference/toolkit-options.html) -- HIGH confidence (verified `pageHeight` range 100-60000, `breaks` choices)
- MDN: [SVGGraphicsElement.getBBox()](https://developer.mozilla.org/en-US/docs/Web/API/SVGGraphicsElement/getBBox) -- HIGH confidence (SVG coordinate space vs viewport coordinates)
- SitePoint: [DOM to SVG Coordinates](https://www.sitepoint.com/how-to-translate-from-dom-to-svg-coordinates-and-back-again/) -- MEDIUM confidence (explains `getScreenCTM()` for coordinate translation)
- Paul Irish: [What Forces Layout/Reflow](https://gist.github.com/paulirish/5d52fb081b3570c81e3a) -- HIGH confidence (canonical reference for forced reflow triggers including `getBoundingClientRect`)
- Puppeteer Docs: [Screenshots](https://pptr.dev/guides/screenshots) -- HIGH confidence (confirmed `ElementHandle.screenshot()` scrolls into view; detached elements throw)
- GitHub Issue: [Puppeteer + Virtual Scrolling](https://github.com/puppeteer/puppeteer/issues/5194) -- MEDIUM confidence (confirms virtual scroll elements not in DOM cause "Node not visible" errors)
- Direct codebase analysis: `RegularRenderer.tsx`, `getEvents.ts`, `noteAnimation.ts`, `animationController.ts`, `interpolation.ts`, `useVerovio.ts`, `verovioService.ts` -- HIGH confidence

---
*Pitfalls research for: Efficiency features (paginated rendering, virtual scrolling, event caching) in Manuscript renderer*
*Researched: 2026-02-04*
