# Phase 11: Single-Line Event Extraction - Research

**Researched:** 2026-02-05
**Domain:** Horizontal event position extraction for single-line score rendering
**Confidence:** HIGH

## Summary

This phase adds horizontal position fields to the existing event extraction system, enabling animation targeting in SingleLineRenderer. The research focused on: (1) which X-related fields MusicEvent needs for animation centering, (2) when and how to compute globalX from section offsets, and (3) integration patterns that minimize changes to existing code.

The codebase already has a proven two-phase extraction pattern from Phase 7 (timemap first, DOM positions second) that works well for vertical rendering. The horizontal case is structurally identical -- instead of `pageIndex + localY = globalY`, we compute `sectionIndex + localX = globalX`. The key insight is that the existing `CachedEvent` type can be extended with optional fields rather than creating a parallel type, maintaining compatibility with the animation system.

The primary recommendation is to add three optional fields to `CachedEvent` (`globalX`, `sectionIndex`, `localX`) and create a new `computeSectionPositions()` function that mirrors `computeEventPositions()` for the horizontal axis. The extraction should happen during render when section containers are available in the DOM, following the same pattern RegularRenderer uses for Y positions.

**Primary recommendation:** Extend CachedEvent with optional `globalX`, `sectionIndex`, and `localX` fields; create `computeSectionPositions()` function mirroring the vertical extraction pattern.

## Standard Stack

This phase uses existing infrastructure with no new dependencies.

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Verovio | 4.x | Music rendering + timemap API | Already integrated, provides element IDs and timing |
| Zustand | 4.x | State management for event cache | Already used for eventStore |
| React | 18.x | DOM access via refs | Standard for component lifecycle |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| CSS.escape | Native | Safe DOM queries with IDs | Query elements by Verovio xml:id |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Extending CachedEvent | New SingleLineEvent type | Creates parallel types, complicates animation system compatibility |
| DOM measurement | SVG viewBox parsing | DOM is more reliable for transformed elements |

**Installation:**
No new packages needed.

## Architecture Patterns

### Recommended Field Additions to CachedEvent

Based on animation targeting requirements, three fields are recommended:

```typescript
export interface CachedEvent {
  // Existing fields (unchanged)
  id: string;
  beatOnset: number;
  beatDuration: number;
  svgIds: string[];
  pageIndex: number;    // For vertical rendering
  globalY: number;      // For vertical camera

  // New optional fields for horizontal rendering
  sectionIndex?: number;  // Which section contains this event (0-based)
  localX?: number;        // X position within the section SVG
  globalX?: number;       // Absolute X = sectionOffsets[sectionIndex] + localX
}
```

**Why all three fields:**
- `globalX` is the primary field needed for camera positioning
- `sectionIndex` is needed to know which section DOM container to query
- `localX` is useful for debugging and may be needed for future section virtualization (camera lookahead calculations)

**Why optional:**
- Only populated in single-line mode (when `computeSectionPositions` is called)
- Regular paginated rendering does not need them
- Maintains backward compatibility with existing code

### Pattern: Two-Phase Extraction (Horizontal Mirror)

Following the established Phase 7 pattern:

**Phase 1: Timemap extraction (shared, already implemented)**
```typescript
// From getEvents.ts - already exists
const timemapEvents = extractTimemapEvents(toolkit);
// Returns: { id, beatOnset, beatDuration, svgIds }[]
```

**Phase 2a: Vertical positions (existing)**
```typescript
// From getEvents.ts - already exists
const cachedEvents = computeEventPositions(
  timemapEvents,
  toolkit,
  pageContainers,
  pageOffsets
);
// Adds: pageIndex, globalY
```

**Phase 2b: Horizontal positions (new)**
```typescript
// New function to add
const eventsWithX = computeSectionPositions(
  cachedEvents,  // or timemapEvents if starting fresh
  toolkit,
  sectionContainers,  // Array of section container elements
  sectionOffsets      // Array of cumulative X offsets
);
// Adds: sectionIndex, localX, globalX
```

### Pattern: Element X Position Extraction

For each event, compute X position relative to section:

```typescript
// Source: Codebase analysis of computeEventPositions pattern
function getElementLocalX(
  container: HTMLElement,
  elementId: string
): number | null {
  const noteEl = container.querySelector(`#${CSS.escape(elementId)}`);
  if (!noteEl) return null;

  const containerRect = container.getBoundingClientRect();
  const noteRect = noteEl.getBoundingClientRect();

  // Use element center for consistent targeting
  return noteRect.left - containerRect.left + noteRect.width / 2;
}
```

### Pattern: Section Index Discovery

Use Verovio's `getPageWithElement` API adapted for sections:

```typescript
// Note: getPageWithElement returns 1-based page number
// For sections, we need to map measure ranges to section indices

function getSectionIndexForElement(
  toolkit: VerovioToolkit,
  elementId: string,
  measuresPerSection: number,
  totalMeasures: number
): number {
  // Option A: Use Verovio API if available for measure lookup
  // Option B: Query each section container until element found
  // Option B is more reliable as it matches actual rendered state

  // Implementation uses Option B (DOM search)
}
```

### Recommended Project Structure

No new files needed. Extend existing files:

```
src/
├── stores/
│   └── eventStore.ts      # Extend CachedEvent interface
├── lib/
│   └── getEvents.ts       # Add computeSectionPositions()
└── hooks/
    └── useSingleLineVerovio.ts  # Call extraction after render
```

### Anti-Patterns to Avoid

- **Duplicate event arrays:** Do NOT create separate `horizontalEvents[]` -- use the same events array with optional fields
- **Premature extraction:** Do NOT extract positions before sections are rendered to DOM
- **Sync during render:** Do NOT call extraction inside render() -- use useEffect after sections mount
- **Y/X field confusion:** Do NOT reuse `globalY` for horizontal -- use explicitly named `globalX`

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Element positioning | Manual SVG coordinate parsing | `getBoundingClientRect()` | Handles transforms, browser differences |
| Safe ID escaping | Regex-based escaping | `CSS.escape()` | Native, handles all edge cases |
| Section offset calculation | Manual accumulation | `sectionOffsets` from hook | Already computed by useSingleLineVerovio |

**Key insight:** The existing codebase already solved these problems for vertical rendering. Mirror the patterns exactly, just swap Y for X.

## Common Pitfalls

### Pitfall 1: Extraction Before DOM Ready

**What goes wrong:** `computeSectionPositions` called before section containers are mounted returns null positions for all elements.
**Why it happens:** Eager extraction in component body instead of effect.
**How to avoid:** Only call extraction in useEffect after verifying `sectionContainers.every(c => c !== null)`.
**Warning signs:** All `globalX` values are 0 or undefined.

### Pitfall 2: Coordinate Axis Confusion

**What goes wrong:** Using `globalY` when `globalX` is needed, or vice versa.
**Why it happens:** Copy-paste from vertical code without updating field names.
**How to avoid:** Explicit naming: `sectionIndex` (not `pageIndex`), `localX` (not `localY`), `globalX` (not `globalY`).
**Warning signs:** Camera moves vertically when it should move horizontally.

### Pitfall 3: Section Index Off-by-One

**What goes wrong:** Events mapped to wrong section container.
**Why it happens:** Verovio's `getPageWithElement` is 1-based; section arrays are 0-based.
**How to avoid:** Document index base clearly, always convert: `sectionIndex = verovioPage - 1`.
**Warning signs:** Events near section boundaries have wrong globalX.

### Pitfall 4: Missing Offset Accumulation

**What goes wrong:** `globalX` computed as `localX` without adding section offset.
**Why it happens:** Forgetting that `sectionOffsets[i]` is cumulative X position.
**How to avoid:** Always: `globalX = sectionOffsets[sectionIndex] + localX`.
**Warning signs:** Events in later sections have X values that seem too small.

### Pitfall 5: Stale Position Cache

**What goes wrong:** Positions computed for old sections used with new sections after re-render.
**Why it happens:** Cache not invalidated when sections change.
**How to avoid:** Include `sections` reference in cache validity check (same pattern as `svgPagesRef`).
**Warning signs:** Events highlight wrong notes after score re-render.

## Code Examples

### computeSectionPositions Function

```typescript
// Source: Pattern from computeEventPositions in src/lib/getEvents.ts
export function computeSectionPositions(
  events: CachedEvent[],
  sectionContainers: HTMLElement[],
  sectionOffsets: number[]
): CachedEvent[] {
  // Clone events to avoid mutation
  const result = events.map(event => ({ ...event }));

  for (const event of result) {
    if (event.svgIds.length === 0) continue;

    // Find which section contains this element
    let sectionIndex = -1;
    let localX = 0;

    for (let i = 0; i < sectionContainers.length; i++) {
      const container = sectionContainers[i];
      if (!container) continue;

      const noteEl = container.querySelector(
        `#${CSS.escape(event.svgIds[0])}`
      );
      if (noteEl) {
        sectionIndex = i;
        const containerRect = container.getBoundingClientRect();
        const noteRect = noteEl.getBoundingClientRect();
        localX = noteRect.left - containerRect.left + noteRect.width / 2;
        break;
      }
    }

    if (sectionIndex >= 0) {
      event.sectionIndex = sectionIndex;
      event.localX = localX;
      event.globalX = sectionOffsets[sectionIndex] + localX;
    }
  }

  return result;
}
```

### Integration with SingleLineRenderer

```typescript
// Source: Pattern from RegularRenderer.tsx
useEffect(() => {
  if (sections.length === 0 || !toolkit) return;
  if (sectionContainers.some(c => c === null)) return;

  // Phase 1: Timemap (no DOM needed)
  const timemapEvents = extractTimemapEvents(toolkit);

  // Phase 2: Compute X positions (DOM required)
  const containers = sectionContainerRefs.current.filter(
    (c): c is HTMLDivElement => c !== null
  );
  const eventsWithPositions = computeSectionPositions(
    timemapEvents.map(e => ({ ...e, pageIndex: 0, globalY: 0 })),
    containers,
    sectionOffsets
  );

  // Store in eventStore with sections reference for cache validity
  setEventsInStore(eventsWithPositions, sections);
}, [sections, sectionOffsets, toolkit]);
```

### Extended CachedEvent Type

```typescript
// Source: Extend existing src/stores/eventStore.ts
export interface CachedEvent {
  id: string;
  beatOnset: number;
  beatDuration: number;
  svgIds: string[];
  pageIndex: number;
  globalY: number;
  // Horizontal position fields (optional, only for single-line mode)
  sectionIndex?: number;
  localX?: number;
  globalX?: number;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single extraction function | Two-phase extraction | Phase 7 (v1.1) | Separates timing from DOM, enables caching |
| Separate stores per renderer | Shared store with optional fields | Phase 11 (this) | Simpler architecture, unified animation |

**Deprecated/outdated:**
- Creating separate event arrays for different renderers - complicates state management
- Extracting positions synchronously during render - causes React warnings

## Open Questions

1. **Should localX be stored?**
   - What we know: localX is derivable from globalX - sectionOffsets[sectionIndex]
   - What's unclear: Whether any code will need localX directly
   - Recommendation: Include it - small memory overhead, useful for debugging, may help with section virtualization later

2. **Verovio API for section-element mapping?**
   - What we know: `getPageWithElement` returns page number (1-based), not measure
   - What's unclear: Whether there's a direct measure-to-section API
   - Recommendation: Use DOM search (iterate sections, querySelector for element) - more reliable as it matches actual rendered state

3. **Should extraction happen in hook or component?**
   - What we know: Hook provides toolkit, sections, offsets; component has container refs
   - What's unclear: Clean separation of concerns
   - Recommendation: Extraction in component (like RegularRenderer) - component owns refs, calls extraction in useEffect, stores results

## Sources

### Primary (HIGH confidence)
- Existing codebase analysis:
  - `src/stores/eventStore.ts` - CachedEvent type, store pattern
  - `src/lib/getEvents.ts` - Two-phase extraction pattern
  - `src/renderers/RegularRenderer.tsx` - DOM measurement integration
  - `src/hooks/useSingleLineVerovio.ts` - Section offsets computation
- Phase 7 research and plan - Established extraction architecture

### Secondary (MEDIUM confidence)
- Phase 10 plan (10-01-PLAN.md) - Section rendering pattern
- SUMMARY.md - Architecture approach for horizontal rendering

### Tertiary (LOW confidence)
- None - All patterns verified in codebase

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All existing infrastructure, no new dependencies
- Architecture: HIGH - Pattern proven in vertical case, direct mirror for horizontal
- Pitfalls: HIGH - Based on actual codebase experience and existing gotchas

**Research date:** 2026-02-05
**Valid until:** 2026-03-05 (30 days - stable pattern, unlikely to change)
