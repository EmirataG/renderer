# Architecture: Virtualization and Cursor Integration

**Project:** RegularRenderer Enhancement
**Researched:** 2026-02-08
**Focus:** Virtualization, cursor overlay, and SVGO integration patterns

## Executive Summary

RegularRenderer currently renders all pages synchronously, causing DOM bloat for long scores. This research identifies integration points for three enhancements:

1. **Virtualization**: Render only visible pages + buffer (mount/unmount based on camera Y)
2. **Cursor overlay**: Absolute-positioned indicator tracking active event
3. **SVGO optimization**: Preprocessing SVG strings in useVerovio hook

**Recommendation**: Implement in order listed - virtualization first (performance foundation), cursor second (visual enhancement), SVGO last (optimization polish).

## Current Architecture Analysis

### Data Flow (Lines 92-263 of RegularRenderer.tsx)

```
useVerovio(xml, width, scale, font)
  ↓
svgPages[], pageHeights[], pageOffsets[], totalHeight
  ↓
svgPages.map((svg, i) => <div dangerouslySetInnerHTML />)  ← ALL PAGES RENDERED
  ↓
Camera: translateY(-cameraY) on container
  ↓
Animation: querySelector by event.svgIds → apply transforms
```

### Key Data Structures

| Data | Source | Purpose | Current Scope |
|------|--------|---------|---------------|
| `svgPages[]` | useVerovio | SVG strings for each page | All pages |
| `pageHeights[]` | useVerovio | Pixel height of each page | All pages |
| `pageOffsets[]` | useVerovio | Cumulative Y position start | All pages |
| `totalHeight` | useVerovio | Total scrollable height | Single value |
| `currentYRef.current` | animateSync | Camera target Y position | Single value |
| `events[]` | eventStore | Event metadata with globalY | All events |

### Critical Integration Points

**Camera System (Lines 307-322)**:
- Current: `applyCamera(targetY)` sets `translateY(-cameraY)` on `cameraRef`
- Uses: `totalHeight`, `scoreRegion.height`, `targetY`
- Integration: Virtualization needs `cameraY` to calculate visible page range

**Rendering (Lines 771-779)**:
- Current: `svgPages.map()` renders ALL pages unconditionally
- Integration: Replace with conditional render based on visible range

**Animation Queries (Lines 601-646)**:
- Current: `scoreRef.current.querySelector(#${id})` finds noteheads
- Risk: querySelector fails if virtualization unmounts the target page
- Integration: Guard checks needed, or disable animation for off-screen events

## Virtualization Architecture

### Option A: Inline useMemo Calculation (Recommended)

**Where**: Inside RegularRenderer.tsx, after useVerovio hook returns

**Structure**:
```typescript
const visiblePageIndices = useMemo(() => {
  if (!cameraRef.current || pageOffsets.length === 0) return [];

  // Extract current camera Y from transform (or track in state)
  const cameraY = currentYRef.current - (scoreRegion?.height ?? containerHeight) / 2;
  const viewportHeight = scoreRegion?.height ?? containerHeight;

  // Buffer: render 1 page above and below visible range
  const buffer = 1;
  const visibleStart = Math.max(0, cameraY - pageHeights[0] * buffer);
  const visibleEnd = cameraY + viewportHeight + pageHeights[0] * buffer;

  const indices: number[] = [];
  for (let i = 0; i < pageOffsets.length; i++) {
    const pageTop = pageOffsets[i];
    const pageBottom = pageTop + pageHeights[i];

    if (pageBottom >= visibleStart && pageTop <= visibleEnd) {
      indices.push(i);
    }
  }

  return indices;
}, [currentYRef.current, pageOffsets, pageHeights, containerHeight, scoreRegion?.height]);

// Render logic
{svgPages.map((svg, i) => {
  const isVisible = visiblePageIndices.includes(i);
  if (!isVisible) {
    // Placeholder: maintain scroll height
    return (
      <div
        key={i}
        style={{ height: pageHeights[i], width: scoreRegion?.width ?? containerWidth }}
      />
    );
  }

  return (
    <div
      key={i}
      ref={(el) => { pageContainerRefs.current[i] = el; }}
      style={{ width: scoreRegion?.width ?? containerWidth }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
})}
```

**Pros**:
- Simple, no new files
- useMemo prevents recalculation unless camera moves
- Direct access to existing state

**Cons**:
- Couples virtualization to component logic
- Harder to test in isolation

**Dependencies**: `currentYRef.current` as trigger (requires minor refactor to track cameraY)

### Option B: Custom useVirtualization Hook

**Where**: New file `src/hooks/useVirtualization.ts`

**Structure**:
```typescript
export function useVirtualization({
  totalHeight,
  pageHeights,
  pageOffsets,
  cameraY,
  viewportHeight,
  bufferPages = 1,
}: {
  totalHeight: number;
  pageHeights: number[];
  pageOffsets: number[];
  cameraY: number;
  viewportHeight: number;
  bufferPages?: number;
}) {
  return useMemo(() => {
    // Same calculation as Option A
  }, [cameraY, pageOffsets, pageHeights, viewportHeight, bufferPages]);
}
```

**Pros**:
- Reusable for future renderers
- Testable independently
- Cleaner component code

**Cons**:
- Extra abstraction for single use case
- Adds file overhead

**Recommendation**: Use Option A for MVP (simpler), refactor to Option B if SingleLineRenderer needs virtualization.

### Option C: TanStack Virtual Library

**Library**: [@tanstack/react-virtual](https://tanstack.com/virtual/latest)

**Integration**:
```typescript
import { useVirtualizer } from '@tanstack/react-virtual';

const virtualizer = useVirtualizer({
  count: svgPages.length,
  getScrollElement: () => cameraRef.current,
  estimateSize: (index) => pageHeights[index],
  overscan: 1, // Buffer pages
});

// Render
{virtualizer.getVirtualItems().map((virtualItem) => (
  <div
    key={virtualItem.key}
    style={{
      position: 'absolute',
      top: 0,
      left: 0,
      width: '100%',
      transform: `translateY(${virtualItem.start}px)`,
      height: `${virtualItem.size}px`,
    }}
    dangerouslySetInnerHTML={{ __html: svgPages[virtualItem.index] }}
  />
))}
```

**Pros**:
- Battle-tested for variable heights
- Handles edge cases (resize, dynamic content)
- 18.5k npm downloads/week ([npm-compare](https://npm-compare.com/@tanstack/react-virtual,react-infinite-scroll-component,react-virtualized,react-window))

**Cons**:
- External dependency (+10KB bundle)
- Requires CSS transform refactor (currently using translateY on parent)
- Overkill for static page list (not infinite scroll)

**Recommendation**: Avoid for MVP. TanStack Virtual excels at [dynamic/measured sizing](https://medium.com/@eva.matova6/optimizing-large-datasets-with-virtualized-lists-70920e10da54), but our page heights are pre-computed from Verovio SVG parsing.

### Confidence Assessment

| Aspect | Confidence | Reason |
|--------|------------|--------|
| useMemo approach | HIGH | Standard React pattern, matches [React docs guidance](https://react.dev/reference/react/useMemo) |
| Visible range calculation | HIGH | Verified with [multiple virtualization tutorials](https://blog.logrocket.com/virtual-scrolling-core-principles-and-basic-implementation-in-react/) |
| Camera Y extraction | MEDIUM | Requires minor refactor to expose cameraY as state/ref |
| Animation guards | MEDIUM | Need to verify querySelector behavior when page unmounts |

## Cursor Architecture

### Option A: Absolute-Positioned Overlay (Recommended)

**Where**: Inside score container, sibling to camera div

**Structure**:
```typescript
// Track active event Y position
const cursorY = useMemo(() => {
  if (interpolatedEvents.length === 0 || eventIndexRef.current < 0) return null;
  return interpolatedEvents[eventIndexRef.current]?.y ?? null;
}, [interpolatedEvents, eventIndexRef.current]); // Trigger on event change

// Render (inside score container, after camera div)
{cursorY !== null && (
  <div
    style={{
      position: 'absolute',
      left: scoreRegion?.x ?? 0,
      top: cursorY, // Absolute Y within score container
      width: scoreRegion?.width ?? containerWidth,
      height: 2, // Thin line cursor
      backgroundColor: '#FF0000',
      pointerEvents: 'none',
      zIndex: 2,
      transition: 'top 200ms ease-out', // Match camera easing
    }}
  />
)}
```

**Pros**:
- Simple CSS positioning
- No DOM queries needed (uses event.y directly)
- Transitions handled by CSS
- Sibling to camera div, so scrolls with score

**Cons**:
- Requires exposing `eventIndexRef.current` to render (currently not a dependency)
- CSS transition may not match rAF-driven camera movement perfectly

**Integration Point**: Lines 757-782 (score container div)

### Option B: Ref-Based Imperative Updates

**Where**: Inside animateSync function (lines 353-409)

**Structure**:
```typescript
const cursorRef = useRef<HTMLDivElement>(null);

// In animateSync, after applyCamera
if (cursorRef.current) {
  cursorRef.current.style.top = `${currentYRef.current}px`;
}

// Render
<div
  ref={cursorRef}
  style={{
    position: 'absolute',
    left: scoreRegion?.x ?? 0,
    top: 0,
    width: scoreRegion?.width ?? containerWidth,
    height: 2,
    backgroundColor: '#FF0000',
    pointerEvents: 'none',
    zIndex: 2,
    transition: 'none', // Controlled by rAF
  }}
/>
```

**Pros**:
- Precise timing sync with camera updates
- No React re-renders for cursor position
- Matches animation frame timing exactly

**Cons**:
- Imperative style (less React-idiomatic)
- Couples cursor to animation logic
- No CSS easing (must implement manually if desired)

**Recommendation**: Use Option A for MVP (simpler), Option B if precise frame-by-frame sync needed for Puppeteer rendering.

### Option C: Framer Motion or GSAP Library

**Libraries**:
- [Framer Motion](https://motion.dev/docs/cursor): React-native animation library
- [GSAP](https://blog.olivierlarose.com/tutorials/blend-mode-cursor): Professional web animator choice

**Structure (Framer Motion example)**:
```typescript
import { motion } from 'framer-motion';

<motion.div
  animate={{ top: cursorY }}
  transition={{ type: 'tween', ease: 'easeOut', duration: 0.2 }}
  style={{
    position: 'absolute',
    left: scoreRegion?.x ?? 0,
    width: scoreRegion?.width ?? containerWidth,
    height: 2,
    backgroundColor: '#FF0000',
  }}
/>
```

**Pros**:
- Professional-grade easing ([60fps with CSS transforms](https://blog.olivierlarose.com/tutorials/blend-mode-cursor))
- Handles complex animations easily
- Better cross-browser consistency

**Cons**:
- External dependency (Framer Motion: 48KB gzipped)
- Overkill for simple Y-position animation
- May conflict with existing CSS transitions

**Recommendation**: Avoid for MVP. Framer Motion excels at [complex cursor trails](https://blog.olivierlarose.com/tutorials/cartoon-cursor-trailing), but our cursor is a static position indicator.

### Cursor Visibility During Virtualization

**Challenge**: If active event is on an unmounted page, cursor position invalid

**Solution**: Guard check in cursor render
```typescript
const cursorY = useMemo(() => {
  if (interpolatedEvents.length === 0 || eventIndexRef.current < 0) return null;
  const activeEvent = interpolatedEvents[eventIndexRef.current];

  // Find which page contains this Y position
  const pageIndex = pageOffsets.findIndex((offset, i) => {
    const pageTop = offset;
    const pageBottom = offset + pageHeights[i];
    return activeEvent.y >= pageTop && activeEvent.y < pageBottom;
  });

  // Only show cursor if page is mounted
  if (pageIndex === -1 || !visiblePageIndices.includes(pageIndex)) return null;

  return activeEvent.y;
}, [interpolatedEvents, eventIndexRef.current, visiblePageIndices, pageOffsets, pageHeights]);
```

### Confidence Assessment

| Aspect | Confidence | Reason |
|--------|------------|--------|
| Absolute positioning | HIGH | Standard CSS pattern, no library needed |
| CSS transitions | MEDIUM | Timing may drift from rAF animation |
| Visibility guard | HIGH | Logical check, prevents phantom cursor |
| Performance | HIGH | Single div, no expensive operations |

## SVGO Integration Architecture

### Option A: Preprocess in useVerovio Hook (Recommended)

**Where**: `src/hooks/useVerovio.ts`, lines 100-104 (after renderToSVG)

**Structure**:
```typescript
import { optimize } from 'svgo';

// In useVerovio, after rendering pages
const count = toolkit.getPageCount();
const pages: string[] = [];
for (let i = 1; i <= count; i++) {
  const rawSvg = toolkit.renderToSVG(i);

  // SVGO optimization
  const optimized = optimize(rawSvg, {
    plugins: [
      'removeDoctype',
      'removeXMLProcInst',
      'removeComments',
      'removeMetadata',
      'removeEditorsNSData',
      'cleanupAttrs',
      'mergeStyles',
      'inlineStyles',
      'minifyStyles',
      'cleanupIds',
      'removeUselessDefs',
      'cleanupNumericValues',
      'convertColors',
      'removeUnknownsAndDefaults',
      'removeNonInheritableGroupAttrs',
      'removeUselessStrokeAndFill',
      'removeViewBox', // Keep viewBox for responsive scaling
      'cleanupEnableBackground',
      'removeHiddenElems',
      'removeEmptyText',
      'convertShapeToPath',
      'convertEllipseToCircle',
      'moveElemsAttrsToGroup',
      'moveGroupAttrsToElems',
      'collapseGroups',
      'convertPathData',
      'convertTransform',
      'removeEmptyAttrs',
      'removeEmptyContainers',
      'mergePaths',
      'removeUnusedNS',
      'sortDefsChildren',
      'removeTitle',
      'removeDesc',
    ],
  });

  pages.push(optimized.data);
}
```

**Pros**:
- Happens once per score load (cached in svgPages[])
- No runtime overhead (preprocessing done upfront)
- Reduces DOM size for all pages (virtualized or not)
- Integrates naturally with existing render flow

**Cons**:
- Increases initial load time (~50-100ms per page based on [SVGO benchmarks](https://github.com/svg/svgo))
- For 50-page score: +2.5-5s load time
- May interfere with Verovio's specific SVG structure (IDs, classes)

**Mitigation**: Make SVGO optional via prop `enableSvgOptimization?: boolean`

### Option B: Web Worker Background Processing

**Where**: New file `src/workers/svgOptimizer.worker.ts`

**Structure**:
```typescript
// worker
import { optimize } from 'svgo';

self.onmessage = (e) => {
  const { svgPages, options } = e.data;
  const optimized = svgPages.map(svg => optimize(svg, options).data);
  self.postMessage(optimized);
};

// In useVerovio
const [optimizedPages, setOptimizedPages] = useState<string[]>([]);

useEffect(() => {
  if (svgPages.length === 0) return;

  const worker = new Worker(new URL('../workers/svgOptimizer.worker.ts', import.meta.url));
  worker.postMessage({ svgPages, options });
  worker.onmessage = (e) => {
    setOptimizedPages(e.data);
    worker.terminate();
  };

  return () => worker.terminate();
}, [svgPages]);
```

**Pros**:
- Non-blocking (preserves UI responsiveness)
- Good for large scores (50+ pages)
- Progressive enhancement (show unoptimized first, swap in optimized)

**Cons**:
- Complexity: worker setup, bundler config
- Memory overhead: two copies of SVG strings in memory
- Race conditions: user scrolls before optimization completes

**Recommendation**: Defer to future optimization. Current scores are <20 pages, blocking is acceptable.

### Option C: Build-Time Preprocessing

**Where**: Not applicable (SVG generated at runtime from XML)

**Reason**: Verovio generates SVG dynamically based on score width, scale, font. Cannot pre-optimize static files.

### SVGO Plugin Caveats for Verovio

**Critical**: Verovio relies on specific SVG structure for animation queries

**Must preserve**:
- Element IDs (event.svgIds like `note-0000001234567890`)
- Class names (`.notehead`, `.staff`, `.definition-scale`)
- Group hierarchy (`<g class="note">` wrapping noteheads)

**Recommended config**:
```typescript
{
  plugins: [
    {
      name: 'cleanupIds',
      params: {
        preserve: [/^note-/, /^measure-/], // Keep Verovio IDs
      },
    },
    {
      name: 'removeViewBox',
      active: false, // Keep viewBox for responsive rendering
    },
  ],
}
```

**Testing required**: Verify querySelector still finds noteheads after optimization.

### Confidence Assessment

| Aspect | Confidence | Reason |
|--------|------------|--------|
| SVGO integration | MEDIUM | Library stable, but Verovio SVG structure unknown |
| Performance gain | LOW | No benchmarks for Verovio-generated SVG |
| ID preservation | LOW | Must verify with test score |
| Load time impact | MEDIUM | Estimated based on [SVGO benchmarks](https://github.com/svg/svgo), not measured |

### Recommendation: Defer SVGO

**Rationale**:
1. Virtualization provides immediate performance boost (removes 80%+ of DOM nodes)
2. SVGO optimization is incremental (reduces remaining 20% by ~30-50%)
3. Risk of breaking animation queries is non-trivial
4. Testing burden high (must verify across multiple score types)

**Alternative**: Investigate Verovio's `compress` option (may have built-in optimization)

## Build Order and Dependencies

### Phase 1: Virtualization Foundation

**Goal**: Reduce DOM nodes for long scores

**Tasks**:
1. Refactor camera state: expose `cameraY` as state or ref (currently derived from transform)
2. Implement visible range calculation (useMemo with buffer)
3. Update render logic: conditional mount + placeholder divs
4. Test querySelector with unmounted pages (add guards if needed)

**Files Modified**:
- `src/renderers/RegularRenderer.tsx` (lines 307-322, 771-779)

**Success Criteria**:
- 50-page score renders <10 pages in DOM
- Camera scrolling smooth (no jank)
- Animation still works for visible noteheads
- No errors when animating off-screen events

**Risk**: Animation queries may fail silently if event's page is unmounted. Mitigation: Add guard `if (!element) continue` in animation loop.

### Phase 2: Cursor Overlay

**Goal**: Visual indicator for active event position

**Tasks**:
1. Calculate cursor Y from `interpolatedEvents[eventIndexRef.current].y`
2. Add cursor div as sibling to camera div (absolute positioning)
3. Implement visibility guard (hide if page unmounted)
4. Match CSS transition timing to camera easing

**Files Modified**:
- `src/renderers/RegularRenderer.tsx` (lines 757-782)

**Success Criteria**:
- Red line cursor tracks active event
- Cursor hidden when event off-screen
- Smooth transition matches camera movement
- No layout shift when cursor appears/disappears

**Risk**: CSS transition may lag behind rAF-driven camera. Mitigation: Test with fast playback, switch to imperative updates if needed.

### Phase 3: SVGO Optimization (Optional)

**Goal**: Reduce SVG file size and DOM complexity

**Tasks**:
1. Add SVGO dependency (`npm install svgo`)
2. Integrate optimize() call in useVerovio hook
3. Configure plugins to preserve Verovio IDs and classes
4. Test querySelector with optimized SVG
5. Benchmark load time impact
6. Add `enableSvgOptimization` prop with default `false`

**Files Modified**:
- `src/hooks/useVerovio.ts` (lines 100-104)
- `src/renderers/RegularRenderer.tsx` (add prop)

**Success Criteria**:
- SVG strings 30-50% smaller (measure with `svg.length`)
- Animation still works (noteheads found by querySelector)
- Load time increase <1s per 10 pages
- Opt-in via prop (safe default)

**Risk**: HIGH - May break animation if IDs mangled. Mitigation: Extensive testing, make opt-in, document known issues.

## Alternative Architectures Considered

### react-window VariableSizeList

**Rejected because**:
- Designed for scrolling containers, but we use CSS `translateY` on fixed viewport
- Would require major refactor of camera system
- [Comparison shows](https://mashuktamim.medium.com/react-virtualization-showdown-tanstack-virtualizer-vs-react-window-for-sticky-table-grids-69b738b36a83) TanStack better for custom layouts, but both overkill for static page list

### Intersection Observer API

**Rejected because**:
- Async callbacks may lag behind 60fps camera movement
- Requires ref for each page div (memory overhead)
- [Virtualization patterns](https://www.patterns.dev/vanilla/virtual-lists/) prefer sync calculation for predictable behavior

### Canvas Rendering

**Rejected because**:
- Verovio outputs SVG, converting to canvas is expensive
- Loses SVG benefits (crisp scaling, DOM queries for animation)
- Out of scope for this milestone

## Performance Expectations

### Baseline (Current)

| Metric | 10 Pages | 50 Pages | 100 Pages |
|--------|----------|----------|-----------|
| DOM Nodes | ~5,000 | ~25,000 | ~50,000 |
| Initial Render | 200ms | 1,000ms | 2,000ms |
| Scroll FPS | 60 | 45 | 30 |
| Memory | 50MB | 250MB | 500MB |

**Source**: Estimated based on [React virtualization benchmarks](https://medium.com/@ignatovich.dm/virtualization-in-react-improving-performance-for-large-lists-3df0800022ef)

### After Virtualization

| Metric | 10 Pages | 50 Pages | 100 Pages |
|--------|----------|----------|-----------|
| DOM Nodes | ~5,000 | ~10,000 | ~10,000 |
| Initial Render | 200ms | 400ms | 400ms |
| Scroll FPS | 60 | 60 | 60 |
| Memory | 50MB | 80MB | 80MB |

**Improvement**: 5x reduction in DOM nodes for large scores, 60fps maintained

### After SVGO (If Implemented)

| Metric | Improvement |
|--------|-------------|
| SVG String Size | -30% to -50% |
| DOM Node Count | -10% to -20% (fewer empty groups/defs) |
| Parse Time | -15% to -25% (smaller strings) |

**Source**: [SVGO documentation](https://github.com/svg/svgo) claims 20-50% size reduction

**Trade-off**: +50-100ms load time per page for optimization

## Integration Risks and Mitigations

### Risk 1: Animation Queries Fail on Unmounted Pages

**Scenario**: User scrubs to timestamp, active event on page 5, but only pages 1-3 mounted

**Impact**: `querySelector` returns null, animation silently fails

**Mitigation**:
```typescript
for (const id of event.svgIds) {
  const stavenote = scoreRef.current.querySelector(`#${CSS.escape(id)}`);
  if (!stavenote) {
    console.warn(`[Animation] Element ${id} not found (page may be unmounted)`);
    continue; // Skip this notehead
  }
  // Apply animation
}
```

**Confidence**: HIGH - Standard defensive programming

### Risk 2: Camera Y Extraction Coupling

**Scenario**: Currently `currentYRef.current` stores target Y, but camera applies clamping and centering. Visible range calculation needs actual camera Y (post-clamping).

**Impact**: Incorrect visible range if camera clamped at edges

**Mitigation**: Track actual camera Y in separate ref inside `applyCamera`:
```typescript
function applyCamera(targetY: number) {
  const scoreHeight = totalHeight || 0;
  const viewportHeight = scoreRegion?.height ?? containerHeight;

  let cameraY = targetY - viewportHeight / 2;
  cameraY = Math.max(0, cameraY);
  cameraY = Math.min(cameraY, Math.max(0, scoreHeight - viewportHeight));

  cameraYRef.current = cameraY; // NEW: Track actual camera Y

  if (cameraRef.current) {
    cameraRef.current.style.transform = `translateY(${-cameraY}px)`;
  }
}
```

**Confidence**: HIGH - Minor refactor, no API changes

### Risk 3: SVGO Breaks Verovio IDs

**Scenario**: SVGO's `cleanupIds` plugin renames `note-0000001234567890` to `a` or removes it

**Impact**: Animation queries return null for all noteheads

**Mitigation**:
1. Configure SVGO to preserve ID patterns: `preserve: [/^note-/, /^measure-/]`
2. Test with sample score before and after optimization
3. Compare querySelector results for same event ID
4. Make feature opt-in with default disabled

**Confidence**: MEDIUM - Depends on SVGO plugin behavior, requires empirical testing

### Risk 4: Cursor Flicker During Transitions

**Scenario**: CSS transition duration doesn't match camera easing, cursor appears to lead/lag

**Impact**: Visual jank, unprofessional appearance

**Mitigation**:
1. Match cursor transition exactly: `transition: 'top 200ms ease-out'` (same as camera line 759)
2. If still janky, switch to imperative updates in `animateSync` (Option B)
3. Use `will-change: top` CSS hint for GPU acceleration

**Confidence**: MEDIUM - CSS transitions usually smooth, but [timing drift is possible](https://blog.olivierlarose.com/tutorials/blend-mode-cursor)

## Testing Recommendations

### Virtualization Tests

1. **Visual Test**: Load 50-page score, scroll through, verify all pages render when visible
2. **Performance Test**: Measure DOM node count with `document.querySelectorAll('*').length` before/after
3. **Animation Test**: Play through score, verify noteheads animate on visible pages
4. **Edge Case**: Scrub to end of score, verify last page renders

### Cursor Tests

1. **Visual Test**: Play score, verify red line appears and follows active event
2. **Visibility Test**: Scrub to off-screen event, verify cursor disappears
3. **Timing Test**: Play at 2x speed, verify cursor doesn't lag behind camera
4. **Edge Case**: First/last event, verify cursor appears correctly

### SVGO Tests (If Implemented)

1. **Correctness Test**: Load optimized score, verify visually identical to unoptimized
2. **Animation Test**: Verify noteheads still animate after optimization
3. **Size Test**: Measure `svgPages[0].length` before/after, verify 30%+ reduction
4. **Load Time Test**: Measure `useVerovio` hook duration, verify increase <100ms per page

## Future Optimization Opportunities

### Dynamic Buffer Sizing

**Current**: Fixed 1-page buffer above/below
**Future**: Adaptive buffer based on scroll velocity (fast scroll = larger buffer)

### Page-Level Memoization

**Current**: Re-render all visible pages on every camera move
**Future**: Memoize individual page divs with `React.memo`, only re-render if visibility changes

### Lazy Event Extraction

**Current**: Extract all events on SVG load (line 254)
**Future**: Extract events only for mounted pages, defer off-screen pages

### Cursor Enhancements

**Current**: Static red line
**Future**:
- Animated pulse during playback
- Color based on note velocity/dynamics
- Note name tooltip on hover

## Sources

### Virtualization
- [Virtualization in React: Improving Performance for Large Lists](https://medium.com/@ignatovich.dm/virtualization-in-react-improving-performance-for-large-lists-3df0800022ef)
- [List Virtualization in React](https://medium.com/@atulbanwar/list-virtualization-in-react-3db491346af4)
- [Virtual scrolling: Core principles and basic implementation in React](https://blog.logrocket.com/virtual-scrolling-core-principles-and-basic-implementation-in-react/)
- [TanStack Virtual Documentation](https://tanstack.com/virtual/latest)
- [List Virtualization Patterns](https://www.patterns.dev/vanilla/virtual-lists/)

### Library Comparisons
- [React Virtualization Showdown: TanStack Virtualizer vs React-Window](https://mashuktamim.medium.com/react-virtualization-showdown-tanstack-virtualizer-vs-react-window-for-sticky-table-grids-69b738b36a83)
- [Comparing TanStack Virtual with React-Window](https://borstch.com/blog/development/comparing-tanstack-virtual-with-react-window-which-one-should-you-choose)
- [npm-compare: React Virtualization Libraries](https://npm-compare.com/@tanstack/react-virtual,react-infinite-scroll-component,react-virtualized,react-window)

### Cursor and Animation
- [How to Make an Animated Cursor using React and GSAP](https://blog.olivierlarose.com/tutorials/blend-mode-cursor)
- [Custom Cursor - React cursor animation | Motion](https://motion.dev/docs/cursor)
- [useMousePosition React Hook](https://www.joshwcomeau.com/snippets/react-hooks/use-mouse-position/)
- [Build Scroll Timeline Animation Component in React 2026](https://zoer.ai/posts/zoer/react-scroll-timeline-animation-component)

### Performance Optimization
- [React useMemo Documentation](https://react.dev/reference/react/useMemo)
- [React Performance Optimization: 15 Best Practices for 2025](https://dev.to/alex_bobes/react-performance-optimization-15-best-practices-for-2025-17l9)
- [React 19 Compiler in 2025: Why useMemo/useCallback Are Dead](https://isitdev.com/react-19-compiler-usememo-usecallback-dead-2025/)

### SVGO
- [SVGO GitHub Repository](https://github.com/svg/svgo)
- [SVGO Documentation](https://svgo.dev/)
- [Master React SVG Integration, Animation and Optimization](https://strapi.io/blog/mastering-react-svg-integration-animation-optimization)
- [Improving SVG Runtime Performance](https://codepen.io/tigt/post/improving-svg-rendering-performance)
