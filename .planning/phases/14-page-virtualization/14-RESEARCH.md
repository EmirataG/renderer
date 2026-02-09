# Phase 14: Page Virtualization - Research

**Researched:** 2026-02-08
**Domain:** DOM virtualization for paginated music notation + seamless page gap elimination
**Confidence:** HIGH

## Summary

Phase 14 adds two complementary features to RegularRenderer: (1) page virtualization that only mounts visible pages + 1 buffer page above/below in the DOM, and (2) seamless page stacking that eliminates visible gaps between adjacent pages. The codebase already has the infrastructure: `useVerovio` returns `pageHeights[]`, `pageOffsets[]`, and `totalHeight`; the camera uses `translateY` on a ref; and event positions include `pageIndex` and `globalY`.

The core virtualization is straightforward -- compute a visible page range from the camera Y position, conditionally render SVG pages vs empty placeholder divs. No external library needed; virtual scroll libraries (react-window, TanStack Virtual) are incompatible with the CSS transform camera system already in use.

The gap elimination requires trimming Verovio's internal vertical spacing from each page SVG. Even though `pageMarginTop: 0` and `pageMarginBottom: 0` are already set, Verovio adds a "half staff space" above the first system and empty space below the last system on each page (since `pageHeight: 2970` is fixed A4 height without `adjustPageHeight`). Trimming the SVG `viewBox` to the actual content bounds removes this space. The first page keeps its top margin per user decision.

Additionally, `isRenderMode` (Puppeteer URL param `?render=true`) is removed entirely -- Puppeteer is moving to a backend service in a future phase.

**Primary recommendation:** Implement in two plans -- (1) core virtualization with visible page range, conditional rendering, and placeholder divs; (2) viewBox trimming for seamless page stacking. Both are low-risk incremental changes to existing RegularRenderer.

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

**Buffer Strategy:**
- 1 page above + 1 page below the visible page (3 pages total max)
- Symmetric buffer -- equal above and below regardless of playback state
- Visibility computed from camera Y position (existing translateY system), not IntersectionObserver

**Page Gap Handling:**
- Pages must look like one continuous document -- no visible page boundaries
- Trim Verovio's built-in top/bottom margins from each page's SVG viewBox to eliminate spacing
- First page keeps its top margin (natural starting point); only internal boundaries are trimmed
- Goal: score appears as a single continuous vertical layout

**Mount/Unmount Transitions:**
- Instant mount -- pages just appear, no fade or animation
- Placeholder divs are empty divs with correct height (no skeleton or background)
- Animation state does not survive unmount/remount -- reset is fine since playback has moved past
- Seeking to distant position: instant jump (unmount old, mount new immediately)

**Puppeteer / Render Mode:**
- Remove isRenderMode flag entirely -- Puppeteer is moving to backend in a future phase
- No need to accommodate render mode behavior in virtualization logic

### Claude's Discretion

- Initial load strategy (whether to show first 1-2 pages immediately or wait for all SVGs then virtualize)
- Exact viewBox trimming calculations for margin removal
- How to measure page heights for placeholder divs

### Deferred Ideas (OUT OF SCOPE)

- Puppeteer/video export moving to backend service -- future milestone
- Skeleton loading placeholders -- not needed with camera-based scrolling and instant mount

</user_constraints>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React (existing) | 18+ | Conditional rendering, useMemo | Built-in; no new dependencies needed |
| Verovio (existing) | 4.x | SVG generation, page layout, timemap API | Already in codebase |
| Zustand (existing) | 4.x | Event cache (eventStore) | Already in codebase |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| CSS (native) | -- | lineHeight:0, fontSize:0, display:block for flush stacking | Already in codebase for SVG stacking |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom visible range calc | @tanstack/react-virtual | TanStack assumes scroll-based model; CSS transform camera incompatible. Custom is 20 lines of simple math. |
| Custom visible range calc | react-window / react-virtuoso | Same incompatibility with CSS transforms. Prior decision (v1.1) already rejected these. |
| Camera-based visibility | IntersectionObserver | Async callbacks lag behind 60fps animation; camera position is already known synchronously. |

**Installation:**
```bash
# No new packages needed
```

## Architecture Patterns

### Recommended Structure

No new files required. All changes are in existing files:

```
src/
├── hooks/
│   └── useVerovio.ts          # Add viewBox trimming to SVG output
├── renderers/
│   └── RegularRenderer.tsx    # Add virtualization logic, remove isRenderMode
├── stores/
│   └── eventStore.ts          # No changes needed
└── lib/
    └── getEvents.ts           # No changes needed (events already have pageIndex)
```

### Pattern 1: Camera-Driven Visible Page Range

**What:** Compute which pages overlap the camera viewport, using the already-tracked camera Y position.

**When to use:** Every time the camera position changes (animation frame during playback, or on seek).

**Key insight:** The camera Y is already computed and clamped inside `applyCamera()`. A new ref `cameraYRef` stores the post-clamped value. The visible range computation is a simple linear scan of `pageOffsets[]` -- O(n) where n is page count, but n is typically <50 so binary search is unnecessary.

**Example:**
```typescript
// Track the actual camera Y (after clamping) for virtualization
const cameraYRef = useRef(0);

function applyCamera(targetY: number) {
  const scoreHeight = totalHeight || (scoreRef.current?.scrollHeight ?? 0);
  const viewportHeight = scoreRegion?.height ?? containerHeight;

  let cameraY = targetY - viewportHeight / 2;
  cameraY = Math.max(0, cameraY);
  cameraY = Math.min(cameraY, Math.max(0, scoreHeight - viewportHeight));

  cameraYRef.current = cameraY; // Track for virtualization

  if (cameraRef.current) {
    cameraRef.current.style.transform = `translateY(${-cameraY}px)`;
  }
}

// Compute visible pages from camera position
function getVisiblePageRange(): Set<number> {
  const viewportHeight = scoreRegion?.height ?? containerHeight;
  const viewTop = cameraYRef.current;
  const viewBottom = viewTop + viewportHeight;
  const buffer = 1; // 1 page above + 1 below

  const visible = new Set<number>();
  for (let i = 0; i < pageCount; i++) {
    const pageTop = pageOffsets[i];
    const pageBottom = pageTop + pageHeights[i];
    if (pageBottom > viewTop && pageTop < viewBottom) {
      visible.add(i);
    }
  }

  // Add buffer pages
  const minVisible = Math.min(...visible);
  const maxVisible = Math.max(...visible);
  if (minVisible > 0) visible.add(minVisible - 1);
  if (maxVisible < pageCount - 1) visible.add(maxVisible + 1);

  return visible;
}
```

**Source:** Codebase analysis of RegularRenderer.tsx lines 307-322 (camera), useVerovio.ts (page data)

### Pattern 2: Conditional Rendering with Placeholder Divs

**What:** Replace the current unconditional `svgPages.map()` render with conditional rendering: visible pages get `dangerouslySetInnerHTML`, unmounted pages get empty divs with correct height.

**When to use:** In the JSX render of RegularRenderer.

**Key insight:** Placeholder divs must have the exact height of the page they replace (from `pageHeights[i]`). Since `useVerovio` already pre-computes heights from SVG parsing, no DOM measurement is needed. The ref callback must set `pageContainerRefs.current[i] = null` when a page unmounts -- this is critical for `computeEventPositions` which reads these refs.

**Example:**
```typescript
{svgPages.map((svg, i) => {
  const isMounted = visiblePages.has(i);

  if (!isMounted) {
    // Placeholder: maintain layout height, clear ref
    pageContainerRefs.current[i] = null;
    return (
      <div
        key={i}
        style={{
          width: scoreRegion?.width ?? containerWidth,
          height: pageHeights[i],
        }}
      />
    );
  }

  return (
    <div
      key={i}
      ref={(el) => { pageContainerRefs.current[i] = el; }}
      className="preview-score"
      style={{ width: scoreRegion?.width ?? containerWidth }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
})}
```

**Source:** Prior decision from v1.1: "Placeholder divs use pageHeights[i] for correct layout spacing" and "Unmounted pages set pageContainerRefs to null explicitly"

### Pattern 3: SVG viewBox Trimming for Gap Elimination

**What:** Modify each page's SVG `viewBox` attribute to crop out empty space above and below the actual music content, making pages appear as one continuous document.

**When to use:** In `useVerovio.ts` after rendering SVG pages and before returning them.

**Key insight:** Verovio sets `pageHeight: 2970` (A4) and renders systems starting from the top. Each page SVG has a viewBox like `viewBox="0 0 WIDTH 2970"` but the actual music content might only occupy the top 800px. The remaining 2170px is empty space. Trimming the viewBox height to match actual content height eliminates the gap.

Verovio also adds "half a staff space" above the first system on every page. For internal page boundaries (pages 2+), this top padding should be trimmed. The first page keeps its top padding as a natural starting margin.

The trimming approach:
1. Parse the viewBox from each SVG string
2. Detect the actual content bounds (find the lowest `g.system` or use Verovio's reported page content height)
3. Adjust the viewBox to crop empty space
4. Update the `height` attribute to match

**Approach options for measuring content bounds:**

**Option A: Regex-based viewBox crop (Recommended)**
- After rendering, parse each SVG's viewBox
- Use Verovio API or content analysis to find actual content height
- Rewrite the viewBox and height attributes in the SVG string
- Pro: No DOM dependency, works before mounting
- Con: Requires knowing content height from SVG structure

**Option B: `adjustPageHeight` Verovio option**
- Set `adjustPageHeight: true` to make Verovio trim each page to content height
- Pro: Verovio handles it natively
- Con: Each page will have DIFFERENT heights (variable), which changes pageHeights[] and pageOffsets[]
- Con: Still includes the half-staff-space padding that Verovio adds internally
- Note: This is actually the cleanest approach IF we accept variable page heights (which we already support via `pageHeights[]`)

**Option C: CSS negative margins / overflow hidden**
- Use CSS to visually crop page containers
- Pro: No SVG modification
- Con: Requires knowing exact crop amounts, fragile with different scores

**Recommendation:** Option B (`adjustPageHeight: true`) is the cleanest. Setting `adjustPageHeight: true` in the Verovio options makes each page shrink to its content height automatically. Combined with the existing `pageMarginTop: 0` and `pageMarginBottom: 0`, this eliminates the large empty space below the last system on each page. The half-staff-space Verovio adds internally is minimal (~4-5px at default scale) and acceptable for page boundaries.

For the first-page top margin requirement: keep `pageMarginTop: 0` globally but either leave the small Verovio internal padding (half staff space) on page 1, or add a CSS `marginTop` to the first page container.

If `adjustPageHeight` alone does not eliminate ALL visible gaps (due to the half-staff-space), apply viewBox trimming as a secondary step: parse the viewBox, identify the y-coordinate where actual content starts, and adjust the viewBox origin and height.

**Source:** [Verovio layout options](https://book.verovio.org/advanced-topics/layout-options.html), [Toolkit options](https://book.verovio.org/toolkit-reference/toolkit-options.html)

### Pattern 4: Triggering Visible Range Updates from rAF Loop

**What:** Recompute visible pages inside the animation frame callback, not as a React state/memo dependency.

**When to use:** During playback animation.

**Key insight:** The visible page range must update synchronously with the camera position. If we used `useState` for `visiblePages`, React batching would delay the update by one frame, causing a brief flash of placeholder div before the real page mounts. Instead, compute the visible range inside the same rAF callback that updates the camera, and only trigger a React re-render if the set of visible pages actually changed.

**Example:**
```typescript
const visiblePagesRef = useRef<Set<number>>(new Set([0, 1])); // Initial: first 2 pages
const [visiblePages, setVisiblePages] = useState<Set<number>>(new Set([0, 1]));

function animateSync() {
  // ... existing animation logic ...

  applyCamera(currentYRef.current);

  // Recompute visible pages
  const newVisible = getVisiblePageRange();
  if (!setsEqual(visiblePagesRef.current, newVisible)) {
    visiblePagesRef.current = newVisible;
    setVisiblePages(newVisible); // Trigger re-render only when range changes
  }

  animationFrameRef.current = requestAnimationFrame(animateSync);
}

function setsEqual(a: Set<number>, b: Set<number>): boolean {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}
```

**Source:** Prior decision from v1.1: "Set<number> for visiblePageIndices enables O(1) has() checks in render loop"

### Anti-Patterns to Avoid

- **IntersectionObserver for visibility:** Async callbacks cannot keep pace with 60fps camera animation. The camera position is already known synchronously.

- **React state for cameraY:** Storing camera Y in `useState` would cause re-renders on every animation frame. Use a ref (`cameraYRef`) and only trigger re-renders when the visible page SET changes.

- **Measuring page heights from DOM:** Page heights are already extracted from SVG strings by `useVerovio` via regex. Do not measure `offsetHeight` on mounted pages -- this causes layout thrashing.

- **Rendering all pages then hiding:** Do not use `display: none` or `visibility: hidden`. The goal is to remove SVG DOM nodes entirely to free memory.

- **Using absolute positioning with translate offsets:** The current layout uses normal document flow (pages stack via `display: block`). Do NOT switch to absolute positioning with calculated top offsets -- this would break the existing camera system.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SVG page height extraction | DOM measurement after mount | Regex on SVG string (already in useVerovio) | Avoids layout thrashing, works before mount |
| Page content bounds | Custom SVG parser | Verovio `adjustPageHeight: true` option | Verovio knows its own content bounds natively |
| Visible range diffing | Deep comparison of page arrays | Set<number> with simple equality check | O(n) where n is 3 (buffer size), fast enough |

**Key insight:** The existing codebase already solved most infrastructure problems (page heights, offsets, camera). Virtualization is a rendering optimization layered on top.

## Common Pitfalls

### Pitfall 1: Animation Queries Target Unmounted Pages

**What goes wrong:** `animateNoteheads` calls `querySelector('#note-id')` which returns null when the target page is unmounted. The existing `noteAnimation.ts` code uses `setTimeout` for hold/exit phases -- these timeouts fire even after the page unmounts.

**Why it happens:** Animation state is tied to DOM lifecycle. Virtualization decouples DOM presence from logical event existence.

**How to avoid:**
1. Guard all `querySelector` calls with null checks (most already exist)
2. The user decided "animation state does not survive unmount/remount -- reset is fine since playback has moved past" -- so simply skip animation for events on unmounted pages
3. The existing null guard in `animateNoteheads` (`if (!element) return`) already handles this for the initial query
4. For setTimeout-based exit animations: if the page unmounts during hold period, the timeout fires harmlessly (querySelector returns null, forEach on empty list is no-op)

**Warning signs:** Console errors during fast playback near page boundaries; notes not animating on freshly mounted pages

### Pitfall 2: Visible Range Flicker During Camera Transitions

**What goes wrong:** Camera moves via CSS transition (`transition: transform 200ms ease-out`). The JavaScript-computed camera position updates instantly, but the visual position eases over 200ms. If visible range is computed from the JavaScript position, pages may mount/unmount before the camera visually reaches them.

**Why it happens:** Mismatch between computed position (instant) and visual position (CSS transition).

**How to avoid:** The 1-page buffer above and below absorbs this discrepancy. At typical page heights (~800-1200px at rendered scale), the 200ms CSS transition cannot traverse more than ~1 page of distance. The buffer ensures the target page is already mounted before it becomes visible.

**Warning signs:** Blank areas briefly visible during smooth playback (not during seeks, which are instant).

### Pitfall 3: Event Position Cache Invalidation After viewBox Trimming

**What goes wrong:** `computeEventPositions()` calculates `globalY` using `pageOffsets[pageIndex] + localY` where `localY` is measured from `containerRect.top`. If viewBox trimming changes page heights, `pageOffsets[]` changes, and cached `globalY` values become incorrect.

**Why it happens:** Events are cached once after initial render. If page heights change due to viewBox trimming, the cache is stale.

**How to avoid:** viewBox trimming must happen BEFORE page heights are calculated -- i.e., inside `useVerovio` before returning `svgPages[]`. The returned `pageHeights[]` and `pageOffsets[]` already reflect trimmed dimensions. Event positions are computed after mount using the correct heights.

**Warning signs:** Camera jumps to wrong vertical position during playback; events appear at incorrect Y positions.

### Pitfall 4: pageContainerRefs Array Not Cleaned Up

**What goes wrong:** `pageContainerRefs.current` is an array sized to total page count. When pages unmount, refs at those indices must be set to `null`. If not cleaned, stale refs point to removed DOM elements.

**Why it happens:** React ref callbacks fire with `null` on unmount, but only if the element was previously mounted. If the render logic changes from SVG div to placeholder div, the old ref callback does NOT fire with null -- it simply stops being called.

**How to avoid:** Explicitly set `pageContainerRefs.current[i] = null` in the placeholder branch of the render logic (as shown in Pattern 2 above).

**Warning signs:** `computeEventPositions` returns incorrect positions; stale `getBoundingClientRect()` calls on removed elements.

### Pitfall 5: isRenderMode Removal Breaks Animation Controller

**What goes wrong:** Removing `isRenderMode` affects several code paths: (1) the dimension/scale calculation, (2) the `setTimestamp` callback guard, (3) the animation controller exposure on `window`. Simply deleting the flag without updating these paths causes runtime errors.

**Why it happens:** `isRenderMode` is checked in 5+ locations across RegularRenderer. Each check gates different behavior.

**How to avoid:** Systematically find all `isRenderMode` references and remove each one, simplifying the surrounding code. The render-mode-specific dimension scaling logic (lines 167-211) should be removed entirely. The `setTimestamp` guard should just check `interpolatedEvents.length === 0`. The animation controller can still be exposed on `window` for development/debugging, but without the render-mode special casing.

**Warning signs:** Build errors or runtime null references after removal. Test by loading a score and playing back.

### Pitfall 6: Initial Load Showing Blank Score

**What goes wrong:** If virtualization is active from the start with `visiblePages = new Set()` (empty), no pages mount on initial render.

**Why it happens:** `cameraYRef.current` is 0 initially, and `getVisiblePageRange()` might not run until the first animation frame.

**How to avoid:** Initialize `visiblePages` to `new Set([0, 1])` (first page + buffer). Update after SVG pages load.

**Warning signs:** Score area is blank after file upload until playback starts.

## Code Examples

### Example 1: Complete Visible Range Calculation

```typescript
// Source: Codebase analysis + prior v1.1 decision
// Uses Set<number> per prior decision for O(1) has() checks

function computeVisiblePages(
  cameraY: number,
  viewportHeight: number,
  pageOffsets: number[],
  pageHeights: number[],
  pageCount: number,
  bufferSize: number = 1
): Set<number> {
  const visible = new Set<number>();
  const viewTop = cameraY;
  const viewBottom = cameraY + viewportHeight;

  // Find pages that intersect the viewport
  for (let i = 0; i < pageCount; i++) {
    const pageTop = pageOffsets[i];
    const pageBottom = pageTop + pageHeights[i];
    if (pageBottom > viewTop && pageTop < viewBottom) {
      visible.add(i);
    }
  }

  // Add symmetric buffer (1 above + 1 below)
  const indices = [...visible];
  const minIdx = Math.min(...indices);
  const maxIdx = Math.max(...indices);

  for (let b = 1; b <= bufferSize; b++) {
    if (minIdx - b >= 0) visible.add(minIdx - b);
    if (maxIdx + b < pageCount) visible.add(maxIdx + b);
  }

  return visible;
}
```

### Example 2: viewBox Trimming with adjustPageHeight

```typescript
// Source: Verovio docs (https://book.verovio.org/toolkit-reference/toolkit-options.html)
// In useVerovio.ts, add adjustPageHeight to options

const options = {
  font: font,
  fontLoadAll: true,
  pageWidth: (containerWidth * 100) / scale,
  pageHeight: 2970,
  scale: scale,
  adjustPageHeight: true,   // NEW: shrink pages to content height
  pageMarginTop: 0,
  pageMarginBottom: 0,
  svgViewBox: true,
  svgRemoveXlink: true,
  breaks: 'auto',
  header: 'none',
  footer: 'none',
};
```

With `adjustPageHeight: true`, each page SVG's viewBox height reflects actual content, not the fixed A4 height. Pages stack flush because there is no empty space below the last system.

### Example 3: Manual viewBox Trimming (If adjustPageHeight Is Insufficient)

```typescript
// Source: SVG viewBox spec + Verovio SVG structure analysis
// Trim viewBox to content bounds for pages 2+ (page 1 keeps top margin)

const VIEWBOX_REGEX = /viewBox="([\d.]+) ([\d.]+) ([\d.]+) ([\d.]+)"/;
const HEIGHT_ATTR_REGEX = /height="([\d.]+)px"/;

function trimPageViewBox(svgString: string, pageIndex: number): {
  svg: string;
  trimmedHeight: number;
} {
  const vbMatch = svgString.match(VIEWBOX_REGEX);
  if (!vbMatch) return { svg: svgString, trimmedHeight: 0 };

  const vbX = parseFloat(vbMatch[1]);
  let vbY = parseFloat(vbMatch[2]);
  const vbW = parseFloat(vbMatch[3]);
  let vbH = parseFloat(vbMatch[4]);

  // For pages after the first, trim the top margin
  // Verovio adds half-staff-space (~50 units at default) above first system
  // Detect by parsing the SVG to find first <g class="system"> y position
  // (Simplified: use a fixed trim amount based on Verovio defaults)

  // Placeholder: actual trimming logic depends on SVG analysis
  // The key operation is adjusting vbY (origin) and vbH (height)

  const trimmedSvg = svgString
    .replace(VIEWBOX_REGEX, `viewBox="${vbX} ${vbY} ${vbW} ${vbH}"`)
    .replace(HEIGHT_ATTR_REGEX, `height="${vbH}px"`);

  return { svg: trimmedSvg, trimmedHeight: vbH };
}
```

### Example 4: isRenderMode Removal Pattern

```typescript
// Before (current code):
const isRenderMode =
  typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).get("render") === "true";

useEffect(() => {
  if (isRenderMode) {
    // render mode scaling logic...
  } else if (bgUrl) {
    // preview mode with bg...
  } else {
    // preview mode default...
  }
}, [bgUrl, isRenderMode]);

// After (isRenderMode removed):
useEffect(() => {
  if (bgUrl) {
    const img = new Image();
    img.src = bgUrl;
    img.onload = () => setDims(img.naturalWidth, img.naturalHeight);
  } else {
    setDims(1920, 1080);
  }
}, [bgUrl]);
```

All `isRenderMode` branches in RegularRenderer should be removed: the dimension calculation (lines 160-223), the setTimestamp guard (line 522), the controller exposure log (line 673), and the transport bar visibility (line 840).

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| All pages mounted in DOM | Visible pages + buffer only | This phase | 5-10x DOM node reduction for long scores |
| Fixed A4 page height with gaps | Content-fit page heights (adjustPageHeight) | This phase | Seamless continuous document appearance |
| Puppeteer render mode in frontend | Backend rendering (future) | This phase removes flag | Cleaner codebase, fewer conditional paths |

**Deprecated/outdated:**
- `isRenderMode` flag: Being removed entirely. Puppeteer rendering moves to backend.

## Open Questions

1. **Does `adjustPageHeight: true` fully eliminate gaps?**
   - What we know: It shrinks each page to content height, removing the A4 empty space below the last system.
   - What's unclear: Whether Verovio's internal "half staff space" padding above the first system on each page creates a visible seam when pages are stacked. This is likely very small (~4-5px) but needs visual testing.
   - Recommendation: Try `adjustPageHeight: true` first. If a small gap remains, apply additional viewBox trimming for pages 2+ to remove the top half-staff-space.

2. **Does event extraction work with only 3 pages mounted?**
   - What we know: `computeEventPositions()` measures positions from `pageContainerRefs`. It needs ALL pages mounted to compute globalY for all events.
   - What's unclear: Whether event extraction can run on initial load (all pages briefly mounted) before virtualization kicks in.
   - Recommendation: Keep the current extraction approach -- run it once when ALL SVGs first render (before virtualization takes effect). The `svgPagesRef` cache check prevents re-extraction. Alternatively, run extraction page-by-page for only mounted pages, but this adds complexity.
   - **Best approach:** On initial load, mount all pages momentarily (one render frame) to extract events, then enable virtualization. The useEffect that triggers event extraction runs after mount, so all pages are in DOM for that frame. After events are cached, virtualization can unmount pages freely.

3. **Impact of removing isRenderMode on animation controller**
   - What we know: The animation controller is exposed on `window` for Puppeteer. Removing `isRenderMode` removes the render-mode-specific guard in `setTimestamp`.
   - What's unclear: Whether any external code (Electron main process, test scripts) calls `window.animationController`.
   - Recommendation: Keep the animation controller exposure (it's useful for debugging) but remove the `isRenderMode` conditional. Simplify the guard to just check `interpolatedEvents.length === 0`.

## Sources

### Primary (HIGH confidence)
- **Codebase analysis:** `src/renderers/RegularRenderer.tsx` -- camera system, rendering loop, animation, isRenderMode usage
- **Codebase analysis:** `src/hooks/useVerovio.ts` -- page rendering, height extraction, Verovio options
- **Codebase analysis:** `src/stores/eventStore.ts` -- CachedEvent with pageIndex, eventsByPage index
- **Codebase analysis:** `src/lib/getEvents.ts` -- computeEventPositions with pageContainerRefs dependency
- [Verovio Toolkit Options](https://book.verovio.org/toolkit-reference/toolkit-options.html) -- pageMarginTop/Bottom defaults (50), adjustPageHeight, spacingSystem
- [Verovio Layout Options](https://book.verovio.org/advanced-topics/layout-options.html) -- half-staff-space padding, vertical justification, system spacing
- [Verovio Controlling SVG Output](https://book.verovio.org/advanced-topics/controlling-the-svg-output.html) -- svgViewBox option, margin units
- Prior decision (v1.1): Virtual scroll libraries rejected -- CSS transform camera incompatible with scroll-based models
- Prior decision (v1.1): Set<number> for visiblePageIndices enables O(1) has() checks in render loop
- Prior decision (v1.1): Placeholder divs use pageHeights[i] for correct layout spacing
- Prior decision (v1.1): Unmounted pages set pageContainerRefs to null explicitly
- Existing research: `.planning/research/ARCHITECTURE.md` -- virtualization architecture options A/B/C, camera Y extraction pattern
- Existing research: `.planning/research/PITFALLS.md` -- animation reference destruction, RAF memory leaks, scroll position jumps

### Secondary (MEDIUM confidence)
- [Virtual Scrolling Core Principles](https://blog.logrocket.com/virtual-scrolling-core-principles-and-basic-implementation-in-react/) -- general virtualization patterns verified against codebase
- [List Virtualization Pattern](https://www.patterns.dev/vanilla/virtual-lists/) -- sync vs async visibility calculation
- Existing research: `.planning/research/STACK.md` -- no new libraries needed confirmation
- Existing research: `.planning/research/FEATURES-virtualization-cursor.md` -- buffer strategy, placeholder div pattern

### Tertiary (LOW confidence)
- [SVGO GitHub](https://github.com/svg/svgo) -- referenced in STACK.md but SVGO is out of scope for Phase 14

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new dependencies, all patterns use existing React/Verovio
- Architecture: HIGH -- direct extension of existing camera/pagination system, validated by prior phases
- Pitfalls: HIGH -- all pitfalls identified from codebase analysis with specific line references
- Gap elimination: MEDIUM -- `adjustPageHeight` approach needs empirical testing with actual score SVGs

**Research date:** 2026-02-08
**Valid until:** 90+ days (no external dependencies, all patterns are codebase-specific)
