# Phase 13: Section Virtualization - Research

**Researched:** 2026-02-07
**Domain:** React conditional rendering, horizontal windowing, seamless SVG section transitions
**Confidence:** HIGH

## Summary

This phase implements section virtualization for SingleLineRenderer, mounting only visible sections (current + buffer) while maintaining placeholder divs for unmounted sections. The research focused on adapting the existing RegularRenderer virtual scrolling pattern (Phase 8) for horizontal sections, and solving the unique challenge of seamless section boundaries for staff lines and tied notes/slurs.

The core approach is a direct horizontal adaptation of RegularRenderer's virtual scrolling: use `useMemo` to compute visible section indices based on camera X position, conditionally render SVG content for visible sections vs placeholder divs with correct widths for unmounted sections. The key differentiator is the overlap strategy for seamless boundaries -- sections must overlap by 1-2 measures, with CSS `clip-path` to hide redundant content while ensuring staff lines and cross-boundary notation render correctly.

The codebase has all necessary infrastructure: `useSingleLineVerovio` provides `sectionWidths` and `sectionOffsets`, `eventStore` has `sectionIndex` per event, and SingleLineRenderer already has `sectionContainerRefs` for element queries. The implementation requires adapting Phase 8 patterns and adding overlap/clipping logic.

**Primary recommendation:** Adapt RegularRenderer's `useMemo`-based visibility calculation for horizontal sections, implement 1-2 measure overlap rendering with `clip-path` clipping for seamless staff line continuity, and mount all sections in Puppeteer render mode.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 18+ | Conditional rendering, useMemo | Already in project |
| CSS clip-path | Native | Hide overlapping section content | GPU-accelerated, precise clipping |
| useSingleLineVerovio | Local hook | Section widths/offsets | Phase 10 output |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| eventStore | Local (Zustand) | sectionIndex per event | Animation targeting |
| sectionContainerRefs | Local ref array | DOM element access | Element queries per section |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom visibility calculation | react-window horizontal | Rejected per STATE.md -- CSS transform camera incompatible with scroll-based virtualization |
| CSS clip-path | SVG clipPath | CSS clip-path is simpler, works on divs, GPU-accelerated |
| Overlap rendering | Post-process SVG to extend staff lines | Overlap is cleaner, handles tied notes/slurs automatically |

**Installation:**
```bash
# No new packages required
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── renderers/
│   └── SingleLineRenderer.tsx  # Add visible sections computation + conditional rendering + overlap
├── hooks/
│   └── useSingleLineVerovio.ts # Already provides sectionWidths, sectionOffsets (may need overlap support)
└── stores/
    └── eventStore.ts           # Already provides events with sectionIndex
```

### Pattern 1: Visible Sections Calculation
**What:** Compute which sections should be mounted based on camera X position
**When to use:** Every time camera X position changes or section offsets change
**Example:**
```typescript
// Source: Adapted from RegularRenderer.tsx Phase 8 virtual scrolling
const visibleSectionIndices = useMemo(() => {
  // Short score optimization: mount all if 3 or fewer sections
  if (sectionCount <= 3) {
    return new Set(Array.from({ length: sectionCount }, (_, i) => i));
  }

  // In render mode: mount all sections
  if (isRenderMode) {
    return new Set(Array.from({ length: sectionCount }, (_, i) => i));
  }

  // Find which section the camera X position is in
  let currentSectionIndex = 0;
  for (let i = 0; i < sectionOffsets.length; i++) {
    const sectionEnd = sectionOffsets[i] + sectionWidths[i];
    if (cameraX < sectionEnd) {
      currentSectionIndex = i;
      break;
    }
  }

  // Window: current section +/- 1 (buffer for smooth transitions)
  const visible = new Set<number>();
  for (let i = Math.max(0, currentSectionIndex - 1); i <= Math.min(sectionCount - 1, currentSectionIndex + 1); i++) {
    visible.add(i);
  }
  return visible;
}, [cameraX, sectionOffsets, sectionWidths, sectionCount, isRenderMode]);
```

### Pattern 2: Conditional Rendering with Placeholder Widths
**What:** Render SVG for visible sections, placeholder divs with correct widths for unmounted sections
**When to use:** In the section rendering loop
**Example:**
```typescript
// Source: Adapted from RegularRenderer Phase 8 + codebase patterns
{sections.map((svg, i) => {
  const isVisible = visibleSectionIndices.has(i);

  return isVisible ? (
    <div
      key={i}
      ref={(el) => { sectionContainerRefs.current[i] = el; }}
      className={`preview-score${i > 0 ? ' section-continuation' : ''}`}
      style={{
        flexShrink: 0,
        width: sectionWidths[i],
        height: maxHeight,
        clipPath: i > 0 ? `inset(0 0 0 ${overlapWidth}px)` : undefined, // Clip overlap
      }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  ) : (
    <div
      key={i}
      ref={(el) => { sectionContainerRefs.current[i] = el; }}
      style={{
        flexShrink: 0,
        width: sectionWidths[i] - (i > 0 ? overlapWidth : 0), // Account for clipped overlap
        height: maxHeight,
      }}
    />
  );
})}
```

### Pattern 3: Overlap Rendering for Seamless Boundaries
**What:** Render sections with 1-2 measures of overlap, then clip the redundant portion
**When to use:** For tied notes, slurs, and continuous staff lines across section boundaries
**Example:**
```typescript
// Source: Research insights + PITFALLS.md recommendations

// In useSingleLineVerovio: render sections with overlap
// Section N renders measures (start) to (end + 1)
// Section N+1 renders measures (start - 1) to (end)
// This duplicates the overlap measure, ensuring ties/slurs connect

// In SingleLineRenderer: clip the overlap from display
const OVERLAP_MEASURES = 1; // 1 measure overlap
const overlapWidth = estimateOverlapWidth(sectionWidths, OVERLAP_MEASURES);

// CSS clip-path hides the left edge of each continuation section
// clip-path: inset(top right bottom left)
// inset(0 0 0 Xpx) clips X pixels from the left
```

### Pattern 4: Animation Targeting with Section Mounting
**What:** Ensure the target section is mounted before animating notes
**When to use:** In `animateSync` and `setTimestamp` functions
**Example:**
```typescript
// Source: Codebase animationController.ts patterns + Phase 8 research
function animateNotesForEvent(evt: InterpolatedEvent) {
  // Find the section this event belongs to
  const cachedEvent = events.find(e => e.id === evt.id);
  const sectionIndex = cachedEvent?.sectionIndex;

  // In render mode, all sections are mounted -- proceed directly
  // In normal mode, verify section is in visible set
  if (!isRenderMode && sectionIndex !== undefined && !visibleSectionIndices.has(sectionIndex)) {
    console.warn('[SingleLineRenderer] Target section not mounted:', sectionIndex);
    return;
  }

  // Query from the specific section container to avoid ID collisions
  const root = sectionIndex !== undefined && sectionContainerRefs.current[sectionIndex]
    ? sectionContainerRefs.current[sectionIndex]
    : scoreRef.current;

  animateNoteheads(root, evt.svgIds, animationOptions);
}
```

### Anti-Patterns to Avoid
- **Calculating visibility in render loop:** Always use `useMemo` to avoid recalculating on every render
- **Storing visible indices in state:** Causes unnecessary re-renders; derive from camera position
- **Animating unmounted sections:** Always check if section is in visible set before querying DOM
- **Re-extracting events when visibility changes:** Event extraction runs once when sections change, not when visibility changes
- **Hardcoded overlap widths:** Estimate overlap from section widths, or calculate from Verovio measure widths

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Section width/offset calculation | Custom accumulation | `useSingleLineVerovio().sectionWidths, sectionOffsets` | Already computed by Phase 10 |
| Event section assignments | Re-querying toolkit | `eventStore` with `sectionIndex` | Already indexed by Phase 11 |
| Render mode detection | Custom flag system | `URLSearchParams.get('render')` | Already implemented in codebase |
| Visibility calculation pattern | Custom windowing | Phase 8 `useMemo` pattern | Proven pattern, adapt for horizontal |
| Seamless clipping | Manual SVG manipulation | CSS `clip-path: inset()` | GPU-accelerated, declarative |

**Key insight:** Phase 8 (Virtual Scrolling) built the visibility pattern, Phase 10/11 built the section infrastructure. This phase adapts those patterns for horizontal sections and adds overlap/clipping for seamless boundaries.

## Common Pitfalls

### Pitfall 1: Section Boundary Visual Seams
**What goes wrong:** Visible gaps, hairlines, or misaligned staff lines at section boundaries
**Why it happens:**
- SVG sections are independent, staff lines terminate at edges
- Subpixel rendering causes anti-aliasing artifacts
- CSS inline-block whitespace gaps between sections
**How to avoid:**
- Use `display: flex` with `gap: 0` (already in place)
- Render sections with 1-2 measure overlap
- Use CSS `clip-path: inset(0 0 0 Xpx)` to hide redundant overlap from left edge
- Round section offsets to whole pixels
**Warning signs:** Test with `background: red` behind sections to reveal gaps

### Pitfall 2: Tied Notes and Slurs Cut Off at Boundaries
**What goes wrong:** Tied notes or slurs that cross section boundaries appear incomplete
**Why it happens:** Without overlap, each section only contains its own measures. A tie starting in section N and ending in section N+1 only renders half in each section.
**How to avoid:**
- Render sections with 1 measure overlap (section N includes measure N+1, section N+1 includes measure N)
- The overlap ensures both ends of the tie/slur are rendered in each adjacent section
- Clip the redundant measure from display using `clip-path`
**Warning signs:** Ties appear as separate arcs instead of continuous curves, slurs end abruptly

### Pitfall 3: Animation Targeting Unmounted Sections
**What goes wrong:** `animateNoteheads` queries return null for notes on unmounted sections
**Why it happens:** Camera moves fast, animation targets an event whose section was just unmounted
**How to avoid:**
- Check `visibleSectionIndices.has(sectionIndex)` before querying
- Use buffer of 1 section on each side (current +/- 1)
- Skip animation gracefully if section not mounted
**Warning signs:** Console warnings about missing elements, animation occasionally fails

### Pitfall 4: Stale sectionContainerRefs
**What goes wrong:** Refs to unmounted sections remain in array, causing stale queries
**Why it happens:** Refs not cleared when sections unmount
**How to avoid:**
- Set `sectionContainerRefs.current[i] = el` in ref callback (React handles null on unmount)
- For placeholder divs, still set the ref so it updates to null: `ref={(el) => { sectionContainerRefs.current[i] = el; }}`
- Filter to non-null refs when iterating
**Warning signs:** Animations target wrong sections, incorrect X position calculations

### Pitfall 5: Overlap Width Miscalculation
**What goes wrong:** Clipping removes too little (visible duplication) or too much (gap)
**Why it happens:**
- Overlap width varies with score content (measure widths differ)
- Fixed pixel value doesn't account for score scale
- Section widths don't include overlap in calculation
**How to avoid:**
- Store overlap width per section from Verovio (measure width * overlap count)
- Or estimate as `sectionWidths[i] / measuresPerSection * OVERLAP_MEASURES`
- Test with scores of varying density
**Warning signs:** Duplicate noteheads visible at boundaries, or gaps where notes should be

### Pitfall 6: Camera X Tracking Not Updating State
**What goes wrong:** `visibleSectionIndices` never changes because cameraX state doesn't update
**Why it happens:** Phase 12 may apply camera via ref without updating React state
**How to avoid:**
- Track `cameraX` in state for visibility calculation (same pattern as Phase 8 cameraY)
- Update cameraX state in `applyCamera` function
- Or calculate visibility directly from `currentXRef.current` if performance is a concern
**Warning signs:** Always the same sections mounted regardless of playback position

## Code Examples

Verified patterns from official sources and codebase:

### Visible Sections Calculation
```typescript
// Source: Adapted from RegularRenderer.tsx Phase 8 + horizontal adaptation
// Track camera X for visibility calculation
const [cameraX, setCameraX] = useState(0);

const visibleSectionIndices = useMemo(() => {
  // Short scores: mount all
  if (sectionCount <= 3) {
    return new Set(Array.from({ length: sectionCount }, (_, i) => i));
  }

  // Render mode: mount all
  if (isRenderMode) {
    return new Set(Array.from({ length: sectionCount }, (_, i) => i));
  }

  // Find current section from camera X
  let currentSection = 0;
  for (let i = 0; i < sectionOffsets.length; i++) {
    const sectionEnd = sectionOffsets[i] + sectionWidths[i];
    if (cameraX < sectionEnd) {
      currentSection = i;
      break;
    }
    currentSection = i; // Handle case where cameraX is past all sections
  }

  // Build window: current +/- 1
  const visible = new Set<number>();
  for (let i = Math.max(0, currentSection - 1); i <= Math.min(sectionCount - 1, currentSection + 1); i++) {
    visible.add(i);
  }
  return visible;
}, [cameraX, sectionOffsets, sectionWidths, sectionCount, isRenderMode]);
```

### Camera Apply with X Tracking
```typescript
// Source: Codebase SingleLineRenderer.tsx, modified for visibility tracking
function applyCamera(targetX: number) {
  const scoreWidth = totalWidth || 0;
  const viewportWidth = scoreRegion?.width ?? containerWidth;

  let newCameraX = targetX - viewportWidth / 2;
  newCameraX = Math.max(0, newCameraX);
  newCameraX = Math.min(newCameraX, Math.max(0, scoreWidth - viewportWidth));

  if (cameraRef.current) {
    cameraRef.current.style.transform = `translateX(${-newCameraX}px)`;
  }

  // Update state for visibility calculation
  setCameraX(newCameraX);
}
```

### Conditional Section Rendering with Overlap Clipping
```typescript
// Source: Adapted from RegularRenderer Phase 8 + overlap strategy from PITFALLS.md
const OVERLAP_MEASURES = 1;
const estimatedOverlapWidth = sectionWidths[0] / measuresPerSection * OVERLAP_MEASURES;

{sections.map((svg, i) => {
  const isVisible = visibleSectionIndices.has(i);
  const hasOverlap = i > 0; // All sections except first have overlap from previous

  if (isVisible) {
    return (
      <div
        key={i}
        ref={(el) => { sectionContainerRefs.current[i] = el; }}
        className={`preview-score${i > 0 ? ' section-continuation' : ''}`}
        style={{
          flexShrink: 0,
          width: sectionWidths[i],
          height: maxHeight,
          display: 'flex',
          alignItems: 'flex-start',
          // Clip the overlap from the left edge of continuation sections
          clipPath: hasOverlap ? `inset(0 0 0 ${estimatedOverlapWidth}px)` : undefined,
          // Shift left to compensate for clipped content
          marginLeft: hasOverlap ? -estimatedOverlapWidth : 0,
        }}
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    );
  } else {
    // Placeholder div maintains layout space
    return (
      <div
        key={i}
        ref={(el) => { sectionContainerRefs.current[i] = el; }}
        style={{
          flexShrink: 0,
          width: sectionWidths[i] - (hasOverlap ? estimatedOverlapWidth : 0),
          height: maxHeight,
        }}
      />
    );
  }
})}
```

### Animation with Section Check
```typescript
// Source: SingleLineRenderer.tsx animateSync pattern, with section guard
if (index !== eventIndexRef.current) {
  const prevIndex = eventIndexRef.current;
  eventIndexRef.current = index;

  const startIdx = Math.max(0, prevIndex + 1);
  for (let i = startIdx; i <= index; i++) {
    const evt = interpolatedEvents[i];
    if (evt?.svgIds?.length) {
      const cachedEvent = events.find(e => e.id === evt.id);
      const sectionIndex = cachedEvent?.sectionIndex;

      // Guard: skip if section not mounted
      if (sectionIndex !== undefined && !visibleSectionIndices.has(sectionIndex)) {
        continue;
      }

      const root = sectionIndex !== undefined && sectionContainerRefs.current[sectionIndex]
        ? sectionContainerRefs.current[sectionIndex]
        : scoreRef.current;

      animateNoteheads(root, evt.svgIds, {
        scale: activeNoteheadScale,
        entryMs: activeNoteheadAnimationEntryMs,
        holdMs: activeNoteheadAnimationHoldMs,
        exitMs: activeNoteheadAnimationExitMs,
        color: activeNoteheadColor,
        colorFullNote,
      });
    }
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Mount all sections | Virtual scrolling with placeholders | This phase | Memory bounded regardless of score length |
| Independent section boundaries | Overlap + clip-path | This phase | Seamless staff lines and tied notes |
| Section-independent animation | Section-aware animation targeting | This phase | Correct note targeting across sections |

**Deprecated/outdated:**
- SVG clipPath element: While still valid, CSS `clip-path: inset()` is simpler for rectangular clipping
- Intersection Observer for visibility: Overkill when camera position is already known

## Open Questions

Things that couldn't be fully resolved:

1. **Exact overlap width calculation**
   - What we know: Need 1-2 measures of overlap for tied notes/slurs
   - What's unclear: Whether Verovio's `select()` supports overlapping ranges, or if sections must be re-rendered with overlap
   - Recommendation: First attempt without overlap (Phase 10 current behavior), then add overlap in a follow-up plan if seams are visible. If Verovio doesn't support overlapping ranges, render full score sections with overlap manually.

2. **useSingleLineVerovio overlap support**
   - What we know: Current hook renders non-overlapping measure ranges
   - What's unclear: Whether to modify the hook or handle overlap in the renderer
   - Recommendation: Modify useSingleLineVerovio to accept `overlapMeasures` parameter. Each section renders `measuresPerSection + overlapMeasures` measures, starting from `start - overlapMeasures` for sections after the first.

3. **Clip-path + margin interaction with flexbox**
   - What we know: clip-path clips visually but doesn't affect layout; negative margin needed to close gap
   - What's unclear: Browser compatibility edge cases
   - Recommendation: Test in Chrome, Firefox, Safari. Fall back to absolute positioning if flexbox + clip-path has issues.

4. **Performance of cameraX state updates**
   - What we know: Phase 8 uses cameraY state for visibility, but camera updates every frame during playback
   - What's unclear: Whether frequent state updates cause performance issues
   - Recommendation: Start with state-based approach. If performance degrades, throttle state updates or use ref-based visibility calculation with manual useMemo invalidation.

## Sources

### Primary (HIGH confidence)
- SingleLineRenderer.tsx - Current implementation with sections, camera, animation
- RegularRenderer.tsx - Virtual scrolling pattern from Phase 8
- useSingleLineVerovio.ts - Section rendering, sectionWidths, sectionOffsets
- eventStore.ts - CachedEvent with sectionIndex, sectionContainerRefs pattern
- PITFALLS.md - Section boundary seam prevention strategies

### Secondary (MEDIUM confidence)
- [Verovio Content Selection](https://book.verovio.org/interactive-notation/content-selection.html) - `select({ measureRange })` API
- [React useMemo documentation](https://react.dev/reference/react/useMemo) - Visibility calculation memoization
- [CSS clip-path MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/clip-path) - `inset()` function for rectangular clipping
- [Dev.to Virtualization Tutorial](https://dev.to/mr_mornin_star/create-a-react-virtualizationwindowing-component-from-scratch-54lj) - Buffer zone and mount/unmount patterns

### Tertiary (LOW confidence)
- WebSearch results on music notation section boundaries - general guidance only
- [MEI Guidelines](https://music-encoding.org/guidelines/v3/content/cmn.html) - Tie/slur encoding (not rendering-specific)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All components exist from Phase 8, 10, 11
- Architecture: HIGH - Direct adaptation of proven RegularRenderer pattern
- Overlap strategy: MEDIUM - Concept validated in research, implementation details need testing
- Pitfalls: HIGH - Well-documented in PITFALLS.md and prior phase research

**Research date:** 2026-02-07
**Valid until:** 2026-03-07 (30 days - stable React patterns, no external dependencies)

## Implementation Strategy Recommendations

Based on the research, here's the recommended implementation approach:

### Plan 1: Basic Virtualization (No Overlap)
Adapt Phase 8 virtual scrolling pattern for horizontal sections:
1. Add `cameraX` state tracking in `applyCamera`
2. Implement `visibleSectionIndices` useMemo calculation
3. Conditional render: SVG for visible, placeholder divs for unmounted
4. Update animation targeting to check section visibility
5. Mount all sections in render mode

This delivers SEC-03 (lazy loading) without SEC-04 (overlap for continuity).

### Plan 2: Overlap Rendering + Clip-Path
Add seamless boundary handling:
1. Modify `useSingleLineVerovio` to render overlapping measure ranges
2. Add `clip-path: inset()` to hide redundant overlap content
3. Add negative margin to close visual gap from clipping
4. Adjust placeholder widths to account for clipped overlap
5. Test with tied notes and slurs across boundaries

This delivers SEC-04 and HOR-03 (seamless transitions).

### Plan 3: Testing and Edge Cases
Validate with various scores:
1. Test DOM inspector shows exactly 3 sections mounted
2. Test tied notes render correctly across boundaries
3. Test slurs render correctly across boundaries
4. Test no visual seams during playback
5. Test animation glitch-free during section transitions
