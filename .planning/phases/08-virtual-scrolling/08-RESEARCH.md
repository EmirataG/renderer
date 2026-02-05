# Phase 8: Virtual Scrolling - Research

**Researched:** 2026-02-05
**Domain:** React conditional rendering, DOM window virtualization, animation state management
**Confidence:** HIGH

## Summary

This phase implements virtual scrolling for the paginated score renderer, mounting only pages near the current camera position while maintaining placeholder divs with correct heights for unmounted pages. The research focused on React patterns for conditional rendering, animation cleanup when components unmount, and Puppeteer render mode detection.

The codebase already has all necessary infrastructure: events are cached with `pageIndex` assignments (Phase 7), `pageHeights` and `pageOffsets` are computed by `useVerovio`, and render mode detection via URL parameter (`?render=true`) is already implemented in both `RegularRenderer` and `SyncEditor`. The implementation requires no new dependencies -- only React patterns using `useMemo` for computing visible page indices and conditional rendering.

**Primary recommendation:** Implement a `useMemo`-based visible pages calculation driven by camera Y position, with conditional rendering of SVG pages vs placeholder divs. No external libraries needed.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | existing | Conditional rendering, useMemo | Already in project |
| Zustand | existing | Store visible page state if needed | Already in project for eventStore |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| None needed | -- | -- | Custom implementation is simpler for this use case |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom implementation | react-window | Rejected per STATE.md -- CSS transform camera incompatible with scroll-based virtualization models |
| Custom implementation | react-virtuoso | Same issue -- assumes native scroll, not CSS transform camera |
| Custom implementation | IntersectionObserver | Unnecessary complexity -- camera position already known, no need to observe DOM |

**Installation:**
```bash
# No new packages required
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── renderers/
│   └── RegularRenderer.tsx  # Add visible pages computation + conditional rendering
├── hooks/
│   └── useVerovio.ts        # Already provides pageHeights, pageOffsets
└── stores/
    └── eventStore.ts        # Already provides events with pageIndex
```

### Pattern 1: Visible Pages Calculation
**What:** Compute which pages should be mounted based on camera Y position
**When to use:** Every time camera Y position changes or page offsets change
**Example:**
```typescript
// Source: React useMemo documentation + codebase patterns
const visiblePageIndices = useMemo(() => {
  // Short score optimization: mount all if 3 or fewer pages
  if (pageCount <= 3) {
    return Array.from({ length: pageCount }, (_, i) => i);
  }

  // In render mode: mount all pages
  if (isRenderMode) {
    return Array.from({ length: pageCount }, (_, i) => i);
  }

  // Find which page the camera Y position is on
  let currentPageIndex = 0;
  for (let i = 0; i < pageOffsets.length; i++) {
    if (cameraY >= pageOffsets[i]) {
      currentPageIndex = i;
    } else {
      break;
    }
  }

  // Window: current page +/- 1
  const start = Math.max(0, currentPageIndex - 1);
  const end = Math.min(pageCount - 1, currentPageIndex + 1);

  const visible: number[] = [];
  for (let i = start; i <= end; i++) {
    visible.push(i);
  }
  return visible;
}, [cameraY, pageOffsets, pageCount, isRenderMode]);
```

### Pattern 2: Conditional Rendering with Placeholders
**What:** Render SVG for visible pages, placeholder divs for unmounted pages
**When to use:** In the page rendering loop
**Example:**
```typescript
// Source: React conditional rendering patterns + codebase
{svgPages.map((svg, i) => {
  const isVisible = visiblePageIndices.includes(i);

  return isVisible ? (
    <div
      key={i}
      ref={(el) => { pageContainerRefs.current[i] = el; }}
      className="preview-score"
      style={{ width: scoreRegion?.width ?? containerWidth }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  ) : (
    <div
      key={i}
      style={{
        width: scoreRegion?.width ?? containerWidth,
        height: pageHeights[i],
      }}
    />
  );
})}
```

### Pattern 3: Animation Targeting with Page Mounting
**What:** Ensure the target page is mounted before animating notes on it
**When to use:** In `setTimestamp` and playback animation loops
**Example:**
```typescript
// Source: Codebase animationController.ts patterns
function setTimestamp(seconds: number): void {
  // Find target event and its page
  const targetEvent = events.find(evt => evt.computedTimestamp <= seconds);
  if (!targetEvent) return;

  // If in render mode, all pages are mounted -- proceed directly
  // If in normal mode, check if page is visible
  if (!isRenderMode && !visiblePageIndices.includes(targetEvent.pageIndex)) {
    // For Puppeteer setTimestamp, this shouldn't happen if render mode is correctly detected
    // For normal playback, the camera position drives visibility, so target page should be visible
    console.warn('Target page not mounted:', targetEvent.pageIndex);
    return;
  }

  // Proceed with animation...
}
```

### Anti-Patterns to Avoid
- **Calculating visibility in render loop:** Always use `useMemo` to avoid recalculating on every render
- **Storing visible indices in state:** Causes unnecessary re-renders; derive from camera position
- **Using IntersectionObserver:** Unnecessary overhead when camera position is already known
- **Animating unmounted elements:** Always check if page is in visible set before querying DOM

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Page height calculation | Custom DOM measurement | `useVerovio().pageHeights` | Already computed by Phase 6 |
| Event page assignments | Re-querying toolkit | `eventStore.eventsByPage` | Already indexed by Phase 7 |
| Render mode detection | Custom flag system | `URLSearchParams.get('render')` | Already implemented in codebase |
| Page offset calculation | Manual accumulation | `useVerovio().pageOffsets` | Already computed by Phase 6 |

**Key insight:** Phase 6 and 7 built all the infrastructure needed. This phase is pure presentation logic -- no new data structures required.

## Common Pitfalls

### Pitfall 1: Animation Timeouts on Unmounted Pages
**What goes wrong:** CSS transition timeouts (from `noteAnimation.ts`) fire after a page unmounts, causing "can't find element" errors or memory leaks
**Why it happens:** `window.setTimeout` in `animateNoteheads` schedules cleanup that references DOM elements that may no longer exist
**How to avoid:** Clear all pending animation timeouts when a page unmounts. Track timeout IDs per page and cancel them in cleanup.
**Warning signs:** Console warnings about missing elements, memory usage not decreasing when pages unmount

### Pitfall 2: Stale pageContainerRefs
**What goes wrong:** Refs to unmounted pages remain in the array, causing `computeEventPositions` or animation code to access stale/null refs
**Why it happens:** The refs array isn't cleared when pages unmount
**How to avoid:** Set `pageContainerRefs.current[i] = null` when a page unmounts (in conditional rendering, React handles this automatically for replaced elements). For event extraction, filter to non-null refs.
**Warning signs:** Animations targeting wrong pages, incorrect Y position calculations

### Pitfall 3: Camera Y Calculation on First Render
**What goes wrong:** Initial render has cameraY=0, which may not align with the first visible page if score starts mid-page
**Why it happens:** Camera position not yet initialized from first event
**How to avoid:** Initialize visible pages based on first event's pageIndex, not cameraY, until camera has been positioned
**Warning signs:** Wrong pages visible on initial load, flash of content before correct pages show

### Pitfall 4: Off-by-One in Page Range
**What goes wrong:** Only 2 pages visible instead of 3, or 4 pages visible
**Why it happens:** Incorrect boundary math in "current +/- 1" calculation
**How to avoid:** Use `Math.max(0, ...)` for start and `Math.min(pageCount - 1, ...)` for end; verify with unit tests
**Warning signs:** Memory savings less than expected, or missing page during fast scroll

### Pitfall 5: Re-extraction When Pages Mount
**What goes wrong:** `computeEventPositions` re-runs every time pages change, causing performance issues
**Why it happens:** Phase 7 event extraction depends on `pageContainerRefs` which change when pages mount/unmount
**How to avoid:** Event extraction should only run once when `svgPages` change (as implemented). Position data is cached and valid regardless of which pages are mounted. Do NOT re-extract events when visible pages change.
**Warning signs:** Slow scrolling, visible event extraction logs during playback

## Code Examples

Verified patterns from official sources and codebase:

### Visible Pages Calculation Hook
```typescript
// Source: React useMemo docs + codebase patterns
// Place in RegularRenderer.tsx

// Track camera Y for visibility calculation (updated by applyCamera)
const [cameraY, setCameraY] = useState(0);

// Compute visible page indices
const visiblePageIndices = useMemo(() => {
  // Short scores: mount all
  if (pageCount <= 3) {
    return new Set(Array.from({ length: pageCount }, (_, i) => i));
  }

  // Render mode: mount all
  if (isRenderMode) {
    return new Set(Array.from({ length: pageCount }, (_, i) => i));
  }

  // Find current page from camera Y
  let currentPage = 0;
  for (let i = 0; i < pageOffsets.length; i++) {
    const pageEnd = (pageOffsets[i + 1] ?? totalHeight);
    if (cameraY < pageEnd) {
      currentPage = i;
      break;
    }
  }

  // Build window: current +/- 1
  const visible = new Set<number>();
  for (let i = Math.max(0, currentPage - 1); i <= Math.min(pageCount - 1, currentPage + 1); i++) {
    visible.push(i);
  }
  return visible;
}, [cameraY, pageOffsets, pageCount, totalHeight, isRenderMode]);
```

### Conditional Page Rendering
```typescript
// Source: React patterns, codebase RegularRenderer.tsx
{svgPages.map((svg, i) => (
  visiblePageIndices.has(i) ? (
    <div
      key={i}
      ref={(el) => { pageContainerRefs.current[i] = el; }}
      className="preview-score"
      style={{ width: scoreRegion?.width ?? containerWidth }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  ) : (
    <div
      key={i}
      style={{
        width: scoreRegion?.width ?? containerWidth,
        height: pageHeights[i],
        // No content -- just maintains layout space
      }}
    />
  )
))}
```

### Render Mode Detection (Existing Pattern)
```typescript
// Source: Codebase RegularRenderer.tsx line 152-153
const isRenderMode =
  typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).get("render") === "true";
```

### Camera Update with Y Tracking
```typescript
// Source: Codebase patterns, modified for visibility tracking
function applyCamera(targetY: number) {
  const scoreHeight = totalHeight || (osmdRef.current?.scrollHeight ?? 0);
  const viewportHeight = scoreRegion?.height ?? containerHeight;

  let newCameraY = targetY - viewportHeight / 2;
  newCameraY = Math.max(0, newCameraY);
  newCameraY = Math.min(newCameraY, Math.max(0, scoreHeight - viewportHeight));

  if (cameraRef.current) {
    cameraRef.current.style.transform = `translateY(${-newCameraY}px)`;
  }

  // Update state for visibility calculation
  setCameraY(newCameraY);
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Mount all pages | Virtual scrolling with placeholder divs | This phase | Memory bounded regardless of score length |
| Full DOM tree | Partial DOM with height placeholders | This phase | Faster initial render, lower memory |

**Deprecated/outdated:**
- react-virtualized: While still maintained, assumes native scroll - incompatible with CSS transform camera
- Intersection Observer for visibility: Overkill when camera position is already known

## Open Questions

Things that couldn't be fully resolved:

1. **Animation timeout cleanup strategy**
   - What we know: `noteAnimation.ts` uses `window.setTimeout` which continues after unmount
   - What's unclear: Best pattern for canceling these -- track IDs globally vs per-page vs use refs
   - Recommendation: Track timeout IDs in a ref, clear them when visibility changes. Consider using `requestAnimationFrame` chain instead of `setTimeout` for easier cleanup.

2. **Camera position update frequency**
   - What we know: User decision marked as "Claude's discretion"
   - What's unclear: Performance impact of frequent state updates for visibility
   - Recommendation: Update cameraY state in `applyCamera` function (already called on every animation frame during playback). `useMemo` dependency on cameraY will recalculate visibility only when it changes.

3. **Short score threshold**
   - What we know: User suggested 3 pages, marked as Claude's discretion
   - What's unclear: Whether 3 is optimal or if 4 would be better
   - Recommendation: Use 3 as suggested -- it matches the 3-page window size, meaning no pages would ever unmount anyway.

## Sources

### Primary (HIGH confidence)
- [React useMemo documentation](https://react.dev/reference/react/useMemo) - Computed visible pages pattern
- Codebase: `RegularRenderer.tsx` - Existing render mode detection, page rendering loop, camera logic
- Codebase: `useVerovio.ts` - pageHeights, pageOffsets, totalHeight computation
- Codebase: `eventStore.ts` - CachedEvent with pageIndex, eventsByPage index

### Secondary (MEDIUM confidence)
- [Virtual scrolling core principles](https://blog.logrocket.com/virtual-scrolling-core-principles-and-basic-implementation-in-react/) - General virtualization patterns
- [React conditional rendering optimization](https://medium.com/@cowi4030/optimizing-conditional-rendering-in-react-3fee6b197a20) - Mount/unmount patterns

### Tertiary (LOW confidence)
- None - all patterns verified with primary sources or codebase

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - No new dependencies, all patterns from React docs and existing codebase
- Architecture: HIGH - Clear patterns from codebase, simple conditional rendering
- Pitfalls: HIGH - Well-documented React patterns, codebase-specific issues identified from code review

**Research date:** 2026-02-05
**Valid until:** 30+ days (stable React patterns, no fast-moving dependencies)
