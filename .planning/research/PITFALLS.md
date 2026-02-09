# Domain Pitfalls: Adding Virtualization, SVGO Optimization, and Cursor to RegularRenderer

**Domain:** Performance optimization for existing music notation renderer
**Researched:** 2026-02-08
**Confidence:** HIGH (based on codebase analysis, WebSearch findings, and RegularRenderer implementation review)

---

## Context

This pitfalls research focuses on **subsequent milestone features** being added to an existing, working RegularRenderer:
- Virtual scrolling (unmount off-screen pages)
- SVGO optimization (reduce SVG file size)
- Playhead cursor (fixed overlay during playback)

**NOT** a greenfield renderer. The RegularRenderer already works with:
- `dangerouslySetInnerHTML` to inject Verovio SVG
- `getElementById` queries for animation targeting
- CSS `translateY` transforms for camera movement
- `requestAnimationFrame` animation loop
- Event cache in Zustand store

---

## Critical Pitfalls

Mistakes that cause rewrites, data loss, or major functionality breaks.

---

### Pitfall 1: Virtualization Destroys Animation References Mid-Animation

**What goes wrong:**
The RegularRenderer's `animateNoteheads` function queries DOM elements by ID and schedules animation timeouts (entry/hold/exit). When virtualization unmounts a page:
1. The page's SVG is removed from DOM via React reconciliation
2. Scheduled animation timeouts still fire (they were scheduled before unmount)
3. `querySelector('#note-id')` returns `null` because the element is gone
4. JavaScript errors cascade: `TypeError: Cannot read property 'querySelectorAll' of null`

**Specific failure scenario:**
```typescript
// RegularRenderer.tsx line 384
animateNoteheads(scoreRef.current, evt.svgIds, { ... });

// noteAnimation.ts (conceptual)
setTimeout(() => {
  const stavenote = container.querySelector(`#${CSS.escape(id)}`);
  // ☠️ stavenote is NULL if page unmounted during timeout
  const noteheads = stavenote.querySelectorAll("g.notehead"); // ☠️ CRASH
}, holdMs);
```

**Why it happens:**
Animation state is tied to DOM lifecycle, but virtualization decouples DOM presence from logical state. The existing code assumes "if an event exists in the event cache, its DOM element exists." Virtualization breaks this assumption.

**Consequences:**
- Console errors during fast playback (high frame rate = more frequent page transitions)
- Puppeteer frame capture inconsistency (frames may be missing animations)
- Memory leaks from orphaned timeouts that continue to fire
- User-visible: notes flash to wrong state when pages remount

**Prevention:**
1. **Mount guards in animation functions:** Before every DOM query, check if the element's page is mounted:
   ```typescript
   const pageIndex = eventPageMap.get(eventId);
   if (!pageContainerRefs.current[pageIndex]) {
     console.warn(`[Animation] Page ${pageIndex} unmounted, skipping event ${eventId}`);
     return; // Early exit, don't query
   }
   ```

2. **Animation lock set:** Track which pages have active animations. Prevent unmounting until animations complete:
   ```typescript
   const lockedPages = useRef<Set<number>>(new Set());

   function shouldUnmountPage(pageIndex: number): boolean {
     return !lockedPages.current.has(pageIndex) && isOffScreen(pageIndex);
   }
   ```

3. **Timeout cleanup on unmount:** Store timeout IDs per page. Cancel all timeouts when page unmounts:
   ```typescript
   const pageTimeouts = useRef<Map<number, number[]>>(new Map());

   function onPageUnmount(pageIndex: number) {
     const timeouts = pageTimeouts.current.get(pageIndex) ?? [];
     timeouts.forEach(id => clearTimeout(id));
     pageTimeouts.current.delete(pageIndex);
   }
   ```

4. **Stateless animation for Puppeteer:** The existing `setTimestamp` function already calculates animation state mathematically. Extend it to work with virtualization:
   - Calculate which pages contain events at current timestamp
   - Mount ONLY those pages (synchronous with `flushSync`)
   - Apply animation state
   - Take screenshot
   - Unmount pages if needed

**Detection:**
- Error pattern: `TypeError: Cannot read property 'querySelectorAll' of null` during playback
- Warning signs:
  - Errors occur more frequently at high FPS (60fps vs 30fps)
  - Errors occur during seeking/scrubbing (rapid timestamp changes)
  - Memory usage climbs during long playback sessions
  - Animation feels "jittery" near page boundaries

**Recovery cost:** MEDIUM (4-8 hours)
- Add mount guards to animation functions
- Implement page lock set
- Test with rapid seeking

**Phase to address:** Virtual scrolling implementation phase (Phase 13 SEC-03) — MUST be addressed before declaring virtualization complete

---

### Pitfall 2: SVGO Strips Verovio IDs Required for Animation

**What goes wrong:**
SVGO's default configuration includes `cleanupIDs: true` which minifies ID attributes. Verovio generates SVG with structured IDs that match MEI xml:id values:
- Original: `<g id="note-0000001318117191" class="note">...</g>`
- After SVGO: `<g id="a" class="note">...</g>` (or ID removed entirely)

The RegularRenderer's animation system relies on exact ID matching:
```typescript
// getEvents.ts line 83-88 (conceptual)
const svgIds = timemapNote.querySelectorAll("note").map(n => n.id);

// noteAnimation.ts
const stavenote = container.querySelector(`#${CSS.escape(id)}`);
// ☠️ querySelector finds nothing because ID was changed by SVGO
```

**Why it happens:**
SVGO is designed for static SVG optimization (icons, illustrations). It assumes IDs are internal references only (defs/use patterns). It doesn't know that external JavaScript relies on these IDs for runtime animation.

**Consequences:**
- **Complete animation failure:** No notes animate during playback
- **Silent failure:** No JavaScript errors (querySelector returns null, code defensively handles it)
- **Hard to debug:** SVG looks correct, notes render, but animation just... doesn't work
- **Cache invalidation breaks:** Event cache stores IDs from timemap XML. SVGO changes SVG IDs but not timemap IDs. Mismatch.

**Prevention:**
1. **Disable ID cleanup entirely:**
   ```javascript
   svgo({
     plugins: [
       {
         name: 'cleanupIDs',
         active: false  // ✅ Preserve all IDs
       }
     ]
   })
   ```

2. **Prefix-based preservation (if ID cleanup desired):**
   ```javascript
   svgo({
     plugins: [
       {
         name: 'cleanupIDs',
         params: {
           preserve: [/^note-/, /^chord-/, /^rest-/]  // Preserve music IDs
         }
       }
     ]
   })
   ```

3. **Preserve data attributes (alternative strategy):**
   If SVGO must minify IDs, add data-verovio-id attributes and update animation code:
   ```typescript
   // Before SVGO
   const stavenote = container.querySelector(`#${CSS.escape(id)}`);

   // After SVGO (fallback)
   const stavenote = container.querySelector(`[data-verovio-id="${CSS.escape(id)}"]`);
   ```

4. **Disable prefixIds plugin:**
   ```javascript
   svgo({
     plugins: [
       {
         name: 'prefixIds',
         active: false  // Prevents double-prefixing and ID corruption
       }
     ]
   })
   ```

5. **Test SVGO configuration BEFORE production:**
   - Run SVGO on a sample page
   - Inspect output SVG for ID preservation
   - Run animation test (does `querySelector('#note-...')` find elements?)
   - Compare file size savings vs risk

**Detection:**
- **Obvious symptom:** Animation completely stops working after adding SVGO
- **Verification test:**
  ```javascript
  // In browser console
  const noteIds = Array.from(window.animationController.getInterpolatedEvents()[0].svgIds);
  const found = noteIds.map(id => document.querySelector(`#${CSS.escape(id)}`));
  console.log('Found:', found.filter(Boolean).length, '/', noteIds.length);
  // If found count is 0, SVGO stripped IDs
  ```
- **Comparison check:** View page source. Search for `id="note-`. If IDs are missing or changed (`id="a"`), SVGO broke them.

**Recovery cost:** LOW (1-2 hours)
- Update SVGO config to disable cleanupIDs
- Re-run optimization pipeline
- Test animation

**Phase to address:** SVGO optimization implementation phase — BEFORE deploying to production

---

### Pitfall 3: Cursor Position Desync with Virtualized Page Offsets

**What goes wrong:**
A playhead cursor overlay (vertical line showing current playback position) uses `top` CSS positioning calculated from event `globalY` values. These values are computed from page positions:
```typescript
// Cursor positioning (conceptual)
const cursorY = currentEvent.globalY;
cursor.style.top = `${cursorY}px`;
```

With virtualization, only visible pages are mounted. Page offsets are calculated from actual DOM heights:
```typescript
// computeEventPositions (simplified)
const globalY = pageOffsets[pageIndex] + localY;
```

**Problem:** When a page unmounts, its height is unknown (no DOM element to measure). Page offset calculations become incorrect. Cursor jumps to wrong position.

**Specific scenario:**
1. Score has 5 pages, each 800px tall
2. Pages 0-2 are visible, pages 3-4 are unmounted
3. Event on page 4 has `globalY = 3200px` (4 * 800)
4. User seeks to that event
5. Virtualization mounts page 4, unmounts page 0
6. Page offset recalculation: page 0 height is unknown (unmounted)
7. Page 4 offset is now WRONG (missing page 0's contribution)
8. Cursor renders at wrong Y position

**Why it happens:**
Page offsets are cumulative (`pageOffsets[i] = sum of all previous page heights`). If any previous page is unmounted, the sum is incomplete. The cursor calculation assumes stable, complete offsets.

**Consequences:**
- Cursor jumps during playback when pages unmount
- Cursor appears far from active note
- Cursor may be off-screen entirely
- User sees visual desync between audio and cursor position

**Prevention:**
1. **Cache page heights permanently:** Store page heights after first measurement. Never recalculate based on DOM:
   ```typescript
   const pageHeights = useRef<number[]>([]);

   // On initial render (all pages mounted)
   useEffect(() => {
     if (pageHeights.current.length === 0) {
       pageHeights.current = pageContainerRefs.current.map(ref =>
         ref?.offsetHeight ?? 0
       );
     }
   }, [svgPages]);

   // Use cached heights for offset calculation
   const pageOffsets = useMemo(() => {
     let offset = 0;
     return pageHeights.current.map(h => {
       const current = offset;
       offset += h;
       return current;
     });
   }, [pageHeights.current]);
   ```

2. **Cursor uses cached positions, not live DOM:** Event cache already stores `globalY`. Cursor reads from cache, not from DOM queries:
   ```typescript
   // ✅ Good: uses cached position
   const cursorY = currentEvent.globalY;

   // ❌ Bad: recalculates from DOM
   const element = document.querySelector(`#${currentEvent.svgIds[0]}`);
   const cursorY = element?.getBoundingClientRect().top; // Fails if unmounted
   ```

3. **Cursor coordinate space is score-relative, not viewport-relative:**
   ```typescript
   // Cursor position is relative to score container (which moves with camera)
   <div style={{
     position: 'absolute',
     top: cursorY,  // Score-space coordinate
     left: 0,
     width: '100%',
     borderTop: '2px solid red',
     transform: cameraRef.current.style.transform  // Move with camera
   }} />
   ```

4. **Test cursor with virtualization:** Specifically test:
   - Cursor position when seeking to unmounted page
   - Cursor position after pages unmount during playback
   - Cursor position matches active note visually

**Detection:**
- Cursor appears at wrong vertical position
- Cursor jumps when pages unmount
- Cursor position correct when all pages mounted, wrong after unmounting
- `console.log(currentEvent.globalY)` vs visual cursor position mismatch

**Recovery cost:** LOW (2-4 hours)
- Implement cached page heights
- Ensure cursor uses cached positions
- Visual regression test

**Phase to address:** Cursor implementation phase — design with virtualization in mind from start

---

### Pitfall 4: requestAnimationFrame Memory Leak on Unmounted Pages

**What goes wrong:**
The RegularRenderer uses `requestAnimationFrame` for the animation loop:
```typescript
// RegularRenderer.tsx line 408
animationFrameRef.current = requestAnimationFrame(animateSync);
```

If a user stops playback and unmounts the component, the RAF loop may still be scheduled. Each frame queries DOM elements:
```typescript
function animateSync() {
  // ... animation logic that queries scoreRef.current
  animationFrameRef.current = requestAnimationFrame(animateSync);
}
```

**With virtualization:** Even if the component stays mounted, individual pages unmount. If the RAF callback queries elements on an unmounted page, it fails silently. But the callback keeps firing every frame, attempting the same failed query.

**Race condition:**
1. Frame N: Schedule RAF callback for frame N+1
2. Between frames: React unmounts a page (batched state update)
3. Frame N+1: RAF callback fires, queries unmounted page
4. Callback doesn't realize page is gone, tries again next frame

**Why it happens:**
RAF callbacks are scheduled asynchronously. React's state batching means DOM changes happen between RAF frames. The callback doesn't check if its target still exists.

**Consequences:**
- Memory leak: RAF keeps firing even after component unmounts (if cleanup missing)
- CPU waste: Queries fail but loop continues
- Inconsistent animation: Some events animate, others don't (depending on page mount state)

**Prevention:**
1. **Cleanup RAF on unmount (already implemented):**
   ```typescript
   // RegularRenderer.tsx line 467-472
   useEffect(() => {
     return () => {
       stop();
       destroyAnimationController();
     };
   }, []);
   ```

2. **Check component mounted state before setState (React 18+ doesn't warn, but still good practice):**
   ```typescript
   const isMountedRef = useRef(true);

   useEffect(() => {
     isMountedRef.current = true;
     return () => { isMountedRef.current = false; };
   }, []);

   function animateSync() {
     if (!isMountedRef.current) return; // Early exit
     // ... rest of animation logic
   }
   ```

3. **Check page mount state before animation (from Pitfall 1):**
   ```typescript
   function animateSync() {
     const { event, index } = getEventAtTimestamp(currentTime);
     if (!event) return;

     const pageIndex = getPageIndexForEvent(event.id);
     if (!pageContainerRefs.current[pageIndex]) {
       // Page unmounted, skip animation this frame
       animationFrameRef.current = requestAnimationFrame(animateSync);
       return;
     }

     // Safe to animate
     animateNoteheads(scoreRef.current, event.svgIds, { ... });
   }
   ```

4. **Use `flushSync` for critical render operations:** When Puppeteer seeks to a timestamp, ensure pages are mounted BEFORE RAF callback fires:
   ```typescript
   function setTimestamp(seconds: number) {
     const { event } = getEventAtTimestamp(seconds);
     const pageIndex = getPageIndexForEvent(event.id);

     // Force synchronous mount
     flushSync(() => {
       setVisiblePages([pageIndex]);
     });

     // Now safe to query DOM
     applyAnimation(event);
   }
   ```

**Detection:**
- Console warnings: "Can't perform a React state update on an unmounted component"
- Memory profiler: RAF callbacks continue after unmount
- Animation skips: Expected animation doesn't happen (page was unmounted)
- Puppeteer failures: Frames missing animations (race condition)

**Recovery cost:** LOW (2 hours)
- Add mount guards
- Verify cleanup exists

**Phase to address:** Virtual scrolling implementation — add guards when introducing page unmounting

---

### Pitfall 5: Virtualization Scroll Position Jumps from Height Recalculation

**What goes wrong:**
Virtual scrolling libraries estimate item heights before rendering. When items render, actual heights may differ from estimates. The library adjusts scroll position to compensate, causing visible jumps.

**Music notation specific issue:** Page heights are unpredictable. A page with 2 systems is ~600px, a page with 5 systems is ~1500px. Initial estimate may be very wrong.

**Browser scroll anchoring:** Modern browsers attempt to maintain scroll position when content above the viewport changes height. This conflicts with virtualization's own scroll adjustments, causing double-jumps.

**Specific scenario:**
1. User scrolls to page 8 (estimated height: 800px/page)
2. Page 8 mounts, actual height is 1200px
3. Virtualization library recalculates: total height increased by 400px
4. Browser scroll anchoring triggers: shifts scroll by 400px
5. Virtualization library compensates: shifts scroll by -400px
6. Result: visible stutter/jump

**Why it happens:**
Three systems fighting for control:
- Virtualization library (tries to maintain viewport item set)
- Browser scroll anchoring (tries to maintain visible content)
- Camera animation (tries to center active note)

**Consequences:**
- Visible scroll jumps during playback
- Janky animation feel
- User motion sickness (if jumps are large)
- Cursor position appears to "teleport"

**Prevention:**
1. **Disable browser scroll anchoring:**
   ```css
   .score-container {
     overflow-anchor: none; /* Disable browser's scroll compensation */
   }
   ```

2. **Pre-measure all pages before virtualization:** Render all pages once (hidden), measure heights, cache them, THEN enable virtualization:
   ```typescript
   const [heightsCached, setHeightsCached] = useState(false);

   useEffect(() => {
     if (svgPages.length === 0) return;

     // Render all pages to measure
     requestAnimationFrame(() => {
       const heights = pageContainerRefs.current.map(ref => ref?.offsetHeight ?? 0);
       pageHeights.current = heights;
       setHeightsCached(true); // Enable virtualization
     });
   }, [svgPages]);

   // Only virtualize after heights are known
   const shouldVirtualize = heightsCached && svgPages.length > threshold;
   ```

3. **Use fixed-height virtualization (if possible):** If all pages can be forced to the same height (with padding), virtualization is simpler:
   ```typescript
   const FIXED_PAGE_HEIGHT = 1600; // Tall enough for max systems

   <div style={{
     height: FIXED_PAGE_HEIGHT,
     display: 'flex',
     alignItems: 'center'  // Center actual content vertically
   }}>
     {svgPage}
   </div>
   ```

4. **Camera animation overrides scroll jumps:** Use CSS transform (not scroll position) for camera. This decouples animation from virtualization:
   ```typescript
   // ✅ Already using transform (no change needed)
   cameraRef.current.style.transform = `translateY(${-cameraY}px)`;
   ```

**Detection:**
- Visual jumps during playback (stuttering vertical movement)
- Page height mismatches in console: `Expected 800, got 1200`
- Different behavior in Chrome vs Firefox (scroll anchoring implementation differs)

**Recovery cost:** LOW (2-4 hours)
- Add `overflow-anchor: none`
- Pre-measure pages
- Test with varied page heights

**Phase to address:** Virtual scrolling implementation — part of initial virtualization setup

---

## Moderate Pitfalls

Mistakes that cause delays or technical debt but don't break core functionality.

---

### Pitfall 6: SVGO Removes Verovio Class Names Used for Styling

**What goes wrong:**
SVGO may strip CSS class names it considers "unused." Verovio generates semantic classes:
- `.note`, `.chord`, `.rest`
- `.staff`, `.measure`
- `.notehead`, `.stem`, `.accid`

The RegularRenderer's CSS relies on these:
```css
/* RegularRenderer.tsx line 289-291 */
.preview-score g.notehead {
  will-change: transform;
}
```

If SVGO removes `.notehead`, the CSS doesn't apply, and animation performance degrades (no GPU layer).

**Why it happens:**
SVGO's `removeUselessStrokeAndFill` and `removeUnusedNS` plugins may incorrectly identify Verovio's classes as unused (they're used by external CSS, not inline styles).

**Consequences:**
- **Notehead animation jank:** Without `will-change`, animations use CPU raster
- **Color styling breaks:** `.preview-score g.staff > path` selector fails
- **Animation targeting fails:** `querySelector('g.notehead')` returns empty
- **Subtle performance regression:** No crash, but animation is sluggish

**Prevention:**
1. **Preserve all class attributes:**
   ```javascript
   svgo({
     plugins: [
       {
         name: 'removeUselessStrokeAndFill',
         active: false  // May remove class attributes
       },
       {
         name: 'removeAttrs',
         params: {
           attrs: '(stroke|fill)' // Only remove specific attrs, not class
         }
       }
     ]
   })
   ```

2. **Test animation performance after SVGO:** Compare frame rates:
   - Before SVGO: Measure animation FPS
   - After SVGO: Measure animation FPS
   - Regression indicates class removal

3. **Inline critical styles (if classes must be removed):** Convert CSS to inline styles:
   ```javascript
   // Before SVGO processing
   svgPages.map(svg => {
     const dom = new DOMParser().parseFromString(svg, 'image/svg+xml');
     dom.querySelectorAll('g.notehead').forEach(el => {
       el.setAttribute('style', 'will-change: transform');
     });
     return new XMLSerializer().serializeToString(dom);
   });
   ```

**Detection:**
- Animation feels slower after SVGO (no console errors)
- DevTools > Layers panel: noteheads are not separate layers (no GPU acceleration)
- `document.querySelectorAll('g.notehead').length` returns 0 (classes removed)

**Recovery cost:** LOW (2 hours)
- Update SVGO config
- Re-run optimization

**Phase to address:** SVGO optimization phase — test immediately after implementing

---

### Pitfall 7: Cursor Z-Index Layering with Virtualized Pages

**What goes wrong:**
A cursor overlay should appear ABOVE the score. With virtualization, pages mount/unmount, potentially changing DOM order and z-index stacking context.

**Specific scenario:**
```jsx
<div className="score-container">
  <div ref={cameraRef}>
    {visiblePages.map(svg => <div dangerouslySetInnerHTML={{__html: svg}} />)}
  </div>
  <div className="cursor" /> {/* Cursor */}
</div>
```

If cursor is sibling to pages, z-index may fail (SVG creates stacking context). If cursor is child of camera, it moves with the camera (not fixed).

**Why it happens:**
CSS stacking contexts are complex. SVG elements create new stacking contexts. Transform creates new stacking context (camera uses `transform: translateY`).

**Consequences:**
- Cursor appears BEHIND score (invisible)
- Cursor moves with camera instead of staying fixed
- Cursor rendering order changes when pages mount/unmount

**Prevention:**
1. **Cursor as fixed-position sibling outside camera:**
   ```jsx
   <div className="score-region" style={{ position: 'relative' }}>
     {/* Camera layer */}
     <div ref={cameraRef} style={{ transform: 'translateY(...)' }}>
       {pages}
     </div>

     {/* Cursor layer */}
     <div className="cursor" style={{
       position: 'absolute',
       top: cursorY,  // Score-space coordinate
       left: 0,
       width: '100%',
       zIndex: 10,  // Above pages
       transform: cameraRef.current.style.transform,  // Match camera
       pointerEvents: 'none'
     }} />
   </div>
   ```

2. **Explicit z-index hierarchy:**
   ```css
   .score-container { position: relative; z-index: 0; }
   .camera { position: relative; z-index: 1; }
   .pages { position: relative; z-index: 1; }
   .cursor { position: absolute; z-index: 10; } /* Higher than pages */
   ```

3. **Test with DevTools:** Inspect layers panel to verify cursor is topmost layer.

**Detection:**
- Cursor not visible during playback
- Cursor appears/disappears when pages mount
- Cursor hidden behind score SVG

**Recovery cost:** LOW (1-2 hours)
- Adjust DOM structure
- Fix z-index

**Phase to address:** Cursor implementation — design structure correctly from start

---

### Pitfall 8: Event Cache Invalidation on SVGO Processing

**What goes wrong:**
The event cache (Zustand store) uses `svgPagesRef` to detect when Verovio re-renders:
```typescript
// RegularRenderer.tsx line 249
if (svgPagesRef === svgPages) return; // Cache hit
```

If SVGO processes SVG pages AFTER Verovio renders, it creates a NEW array reference, invalidating the cache:
```typescript
const svgPages = verovioOutput.map(svg => optimizeSVG(svg)); // New array!
```

Cache invalidation triggers full event extraction (expensive), even though the music didn't change.

**Why it happens:**
`map()` creates a new array. Cache uses reference equality (`===`). New reference = cache miss.

**Consequences:**
- Performance regression: Event extraction on every render (defeats caching)
- Unnecessary work: Re-extracting same events repeatedly
- No correctness issue, just waste

**Prevention:**
1. **SVGO processing outside render path:** Process SVGO once, cache results:
   ```typescript
   const { svgPages } = useVerovio(...);
   const optimizedPages = useMemo(() =>
     svgPages.map(svg => optimizeSVG(svg)),
     [svgPages]  // Only re-optimize if Verovio re-renders
   );
   ```

2. **Cache key based on content hash, not reference:**
   ```typescript
   const cacheKey = useMemo(() =>
     svgPages.map(svg => hashString(svg)).join(','),
     [svgPages]
   );

   if (lastCacheKey.current === cacheKey) return; // Cache hit
   ```

3. **Profile event extraction:** Add timing logs to detect unnecessary extraction:
   ```typescript
   console.time('[EventCache] extraction');
   const events = computeEventPositions(...);
   console.timeEnd('[EventCache] extraction');
   // If this logs on every render, cache is broken
   ```

**Detection:**
- Console logs show event extraction on every render
- Performance profiler: `computeEventPositions` called frequently
- No visual bugs, just slower performance

**Recovery cost:** LOW (1-2 hours)
- Wrap SVGO in `useMemo`
- Verify cache behavior

**Phase to address:** SVGO optimization — verify cache still works after adding SVGO

---

### Pitfall 9: Cursor Flicker During Page Transitions

**What goes wrong:**
When pages unmount/mount during playback, React re-renders. If cursor position is recalculated during the same render pass, it may briefly show at the wrong position:
1. Frame N: Cursor at Y=1000
2. Page unmounts (React batches)
3. Frame N+1: React re-renders, cursor recalculated
4. Brief flash: Cursor at Y=0 (default)
5. Frame N+2: Cursor position corrected to Y=1000

**Why it happens:**
React batching + asynchronous rendering. Cursor position depends on event state, which updates asynchronously.

**Consequences:**
- Visual flicker (cursor jumps to top of screen for 1 frame)
- Unprofessional appearance
- User distraction during playback

**Prevention:**
1. **Debounce cursor updates:**
   ```typescript
   const debouncedCursorY = useDeferredValue(cursorY); // React 18+
   ```

2. **CSS transition smooths jumps:**
   ```css
   .cursor {
     transition: top 100ms ease-out; /* Smooth position changes */
   }
   ```

3. **Don't recalculate cursor on unmount:** Cursor position comes from event cache (stable). Don't recompute based on DOM:
   ```typescript
   // ✅ Good: uses cached position (stable)
   const cursorY = currentEvent.globalY;

   // ❌ Bad: recalculates from DOM (unstable)
   const cursorY = calculatePositionFromDOM();
   ```

**Detection:**
- Visible cursor flicker during playback
- DevTools > Performance: Layout thrashing during page transitions

**Recovery cost:** LOW (1 hour)
- Add CSS transition
- Use cached positions

**Phase to address:** Cursor implementation — polish phase

---

### Pitfall 10: Virtualization Library Choice Mismatch

**What goes wrong:**
Choosing the wrong virtualization library for the use case:
- **react-window:** Best for fixed-height items (all pages same height)
- **react-virtuoso:** Best for variable-height items (pages vary by system count)

Music notation pages have variable heights (2-5 systems/page). Using react-window forces height estimation, which causes scroll jumps (Pitfall 5).

**Why it happens:**
react-window is more popular and simpler. Default choice without considering variable heights.

**Consequences:**
- Scroll jumps (requires complex workarounds)
- Poor scrolling performance
- More code to handle height estimation

**Prevention:**
1. **Choose react-virtuoso for RegularRenderer:** Pages have variable heights (proven by existing code: `pageHeights` array varies).

2. **Use react-window only if heights are uniform:** If all pages are forced to same height via CSS.

3. **Profile both libraries:** Test performance with actual score data:
   - Load 50-page score
   - Measure scroll smoothness
   - Measure memory usage
   - Measure frame rate during playback

**Detection:**
- Scroll feels janky
- Visible jumps when scrolling
- Height estimation errors in console

**Recovery cost:** MEDIUM (4-6 hours to swap libraries if wrong choice)

**Phase to address:** Virtual scrolling research/design — choose BEFORE implementing

---

## Minor Pitfalls

Mistakes that cause annoyance but are easily fixable.

---

### Pitfall 11: SVGO File Size Savings Are Negligible

**What goes wrong:**
Verovio's SVG output is already optimized (it's a mature engraving engine). SVGO processing adds complexity but yields minimal savings (<5% file size reduction).

**Why it happens:**
Assumption that "SVG optimization is always valuable." True for hand-coded SVG, less true for generated SVG from optimized tools.

**Consequences:**
- Engineering time spent on SVGO integration (2-4 hours)
- Additional build/processing complexity
- Risk of breaking IDs/classes (Pitfalls 2, 6)
- Negligible performance benefit

**Prevention:**
1. **Measure before optimizing:** Profile actual Verovio SVG file sizes:
   ```bash
   # Measure reduction
   original_size=$(wc -c < verovio.svg)
   svgo verovio.svg -o optimized.svg
   optimized_size=$(wc -c < optimized.svg)
   reduction=$((100 - (optimized_size * 100 / original_size)))
   echo "Reduction: ${reduction}%"
   ```

2. **Set threshold for value:** Only implement SVGO if savings >10% on typical scores.

3. **Consider alternatives:**
   - Gzip compression (server-side) is more effective than SVGO for text-heavy SVG
   - Verovio's `--scale` option reduces SVG size by simplifying geometry

**Detection:**
- File size before/after SVGO is similar
- Network tab shows minimal transfer size difference
- Optimization time > savings time (spent 4 hours to save 200ms load time)

**Recovery cost:** NONE (just skip SVGO if not valuable)

**Phase to address:** SVGO research phase — measure value BEFORE implementing

---

### Pitfall 12: Cursor Does Not Respect Score Region Bounds

**What goes wrong:**
If score region is customized (`scoreRegion` prop), cursor must render within that region, not full container:
```typescript
// Cursor should be bounded by scoreRegion
const cursorY = currentEvent.globalY;
const regionY = scoreRegion?.y ?? 0;
const regionHeight = scoreRegion?.height ?? containerHeight;

// Cursor should not render outside region
if (cursorY < 0 || cursorY > regionHeight) {
  hideCursor(); // Outside score region
}
```

**Why it happens:**
Cursor implementation uses container coordinates, not region coordinates.

**Consequences:**
- Cursor visible above/below score region (on background)
- Cursor appears in decorative border areas
- Visual clutter

**Prevention:**
1. **Clip cursor to region:**
   ```css
   .score-region {
     overflow: hidden; /* Clips cursor outside bounds */
   }
   ```

2. **Calculate cursor visibility:**
   ```typescript
   const cursorVisible = cursorY >= 0 && cursorY <= (scoreRegion?.height ?? containerHeight);
   ```

**Detection:**
- Cursor visible above/below score during playback
- Cursor overlaps border decorations

**Recovery cost:** LOW (1 hour)

**Phase to address:** Cursor implementation — test with custom regions

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Virtual scrolling research | Wrong library choice (react-window vs react-virtuoso) | Profile both with real score data; choose react-virtuoso for variable heights |
| Virtual scrolling implementation | Animation targets unmounted pages | Add mount guards before DOM queries; implement page lock set |
| Virtual scrolling implementation | Page height recalculation causes scroll jumps | Pre-measure all pages; cache heights; disable scroll anchoring |
| SVGO research | Assume optimization is valuable without measuring | Measure file size reduction on sample pages before implementing |
| SVGO configuration | Default config strips Verovio IDs/classes | Disable `cleanupIDs` and `prefixIds`; test animation after SVGO |
| SVGO integration | Event cache invalidation from new array reference | Wrap SVGO in `useMemo`; verify cache still works |
| Cursor implementation | Z-index layering breaks with virtualization | Cursor as fixed sibling outside camera; explicit z-index |
| Cursor implementation | Position desync from virtualized offsets | Use cached page heights; cursor reads from event cache not DOM |
| Cursor implementation | Flicker during page transitions | Use cached positions; add CSS transitions |
| Integration testing | RAF memory leak after unmount | Verify RAF cleanup in useEffect; add mount guards |

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Animation targets unmounted pages | MEDIUM (4-8h) | Add mount guards; implement page lock set; test with seeking |
| SVGO strips IDs | LOW (1-2h) | Update SVGO config; re-run optimization; test animation |
| Cursor position desync | LOW (2-4h) | Cache page heights; cursor uses event cache; visual test |
| RAF memory leak | LOW (2h) | Add mount guards; verify cleanup exists |
| Scroll position jumps | LOW (2-4h) | Disable scroll anchoring; pre-measure pages; test varied heights |
| SVGO removes classes | LOW (2h) | Update SVGO config; re-run optimization |
| Cursor z-index breaks | LOW (1-2h) | Adjust DOM structure; explicit z-index values |
| Event cache invalidation | LOW (1-2h) | Wrap SVGO in useMemo; profile extraction timing |
| Cursor flicker | LOW (1h) | Add CSS transition; use cached positions |
| Wrong library choice | MEDIUM (4-6h) | Swap libraries; adjust integration code |

---

## Quality Gate Checklist

Before declaring each feature complete, verify:

**Virtualization:**
- [ ] Animation works when target page is unmounted (mount guard prevents crash)
- [ ] No console errors during fast playback (RAF cleanup works)
- [ ] Page lock set prevents unmounting during active animations
- [ ] Puppeteer frame capture works with virtualization (synchronous page mounting)
- [ ] Memory usage stable during long playback (no timeout leaks)

**SVGO Optimization:**
- [ ] Verovio IDs preserved (querySelector finds note elements)
- [ ] Verovio classes preserved (CSS selectors work)
- [ ] Animation works after SVGO (notehead scale/color changes)
- [ ] Event cache still valid (no extraction on every render)
- [ ] File size savings measured (>10% reduction to justify complexity)

**Cursor:**
- [ ] Cursor position correct when pages unmounted (uses cached offsets)
- [ ] Cursor visible above score (z-index correct)
- [ ] Cursor matches active note visually (globalY accurate)
- [ ] No flicker during page transitions (cached positions)
- [ ] Cursor respects score region bounds (clipped to region)

---

## Sources

### Primary Sources (HIGH confidence)

**Codebase analysis:**
- [RegularRenderer.tsx](/Users/emirahmed/Desktop/Manuscript/renderer/src/renderers/RegularRenderer.tsx) — existing animation, camera, RAF loop implementation
- [Zustand event store](useEventStore) — event caching with svgPagesRef reference equality
- [REQUIREMENTS.md](/Users/emirahmed/Desktop/Manuscript/renderer/.planning/REQUIREMENTS.md) — SEC-03 lazy loading requirement

**Verovio official documentation:**
- [Verovio CSS and SVG](https://book.verovio.org/interactive-notation/css-and-svg.html) — ID and class structure in Verovio output
- [Verovio Internal Structure](https://book.verovio.org/advanced-topics/internal-structure.html) — MEI xml:id becomes SVG id attribute

### Secondary Sources (MEDIUM confidence)

**React virtualization:**
- [React-window vs react-virtuoso comparison](https://medium.com/@stuthineal/infinite-scrolling-made-easy-react-window-vs-react-virtuso-1fd786058a73) — Variable height handling
- [React Virtualization Libraries](https://medium.com/@sana.mumtazkk/react-virtualization-react-window-vs-react-virtuoso-429282c70272) — Performance characteristics
- [Virtual scrolling core principles](https://blog.logrocket.com/virtual-scrolling-core-principles-and-basic-implementation-in-react/) — Scroll position jump issues

**React lifecycle and cleanup:**
- [React Hook on Unmount Best Practices](https://www.dhiwise.com/post/react-hook-on-unmount-best-practices) — useEffect cleanup patterns
- [React 19 Ref Cleanup](https://blog.saeloun.com/2025/03/24/react-19-ref-as-prop/) — Automatic cleanup improvements
- [Handling async effects after unmount](https://www.benmvp.com/blog/handling-async-react-component-effects-after-unmount/) — RAF memory leak prevention

**SVGO configuration:**
- [SVGO cleanupIDs issues](https://github.com/svg/svgo/issues/1065) — ID preservation challenges
- [SVGO prefixIds breaking references](https://github.com/svg/svgo/issues/913) — defs/use pattern corruption
- [Configure SVGO to preserve IDs](https://sheelahb.com/blog/how-to-configure-svgo-to-preserve-svg-path-ids/) — Prefix-based preservation

**DOM performance:**
- [getElementById vs querySelector performance](https://www.measurethat.net/Benchmarks/Show/2488/0/getelementbyid-vs-queryselector) — 2-10x speed difference
- [querySelector performance in large DOM](https://benchmarklab.azurewebsites.net/Benchmarks/Show/34375/1/getelementbyid-vs-queryselector-in-large-dom) — Benchmark results
- [CSS transform animation performance](https://medium.com/@weijunext/performance-optimization-thoroughly-understanding-and-deconstructing-reflow-repaint-and-d5d9118f2cdf) — Reflow vs repaint

**Virtualization scroll issues:**
- [Virtualization scroll position jumps](https://github.com/TanStack/virtual/issues/659) — Dynamic height stuttering
- [Virtual scrolling variable heights](https://github.com/dotnet/aspnetcore/issues/65158) — Design challenges
- [Intersection Observer viewport calculation](https://github.com/w3c/IntersectionObserver/issues/124) — Larger-than-viewport elements

**React reconciliation:**
- [dangerouslySetInnerHTML reconciliation issue](https://github.com/facebook/react/issues/377) — React skips comparison of innerHTML
- [React reconciliation process](https://www.developerway.com/posts/reconciliation-in-react/) — How React decides what to update

### Tertiary Sources (LOW confidence)

**General patterns:**
- [React animation with dangerouslySetInnerHTML](https://github.com/bringking/react-web-animation/issues/47) — Content not displayed before animation
- [Intersection Observer complete guide](https://future.forem.com/sherry_walker_bba406fb339/mastering-the-intersection-observer-api-2026-a-complete-guide-561k) — Threshold configuration pitfalls
- [Animating virtualized lists](https://github.com/bvaughn/react-virtualized/issues/657) — Coordinate transformation challenges

---

*Research completed: 2026-02-08*
*Domain: RegularRenderer performance optimization*
*Focus: Subsequent milestone features (virtualization, SVGO, cursor) added to existing working renderer*
