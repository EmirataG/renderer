# Architecture Research: SingleLineRenderer Integration

**Domain:** Horizontal single-line score rendering with section-based virtualization
**Researched:** 2026-02-05
**Confidence:** HIGH (verified against existing codebase analysis and Verovio official documentation)

## Executive Summary

This document analyzes how a SingleLineRenderer component should integrate with the existing Manuscript Renderer architecture. The existing RegularRenderer uses vertical paginated rendering with virtual scrolling. SingleLineRenderer requires horizontal layout with section-based rendering for performance.

The key insight: **Most animation and event infrastructure can be reused.** The core differences are in rendering mode (Verovio options) and camera direction (translateX vs translateY). Event extraction, interpolation, and notehead animation functions work identically.

**Recommended approach:**
1. Create `useSingleLineVerovio` hook (or extend `useVerovio`) with `breaks: 'none'` + measure-range sectioning
2. Create `SingleLineRenderer.tsx` that reuses animation and interpolation infrastructure
3. Implement horizontal camera with center-tracking instead of system-boundary snapping
4. Add section-based virtual scrolling (horizontal equivalent of page-based)

---

## Current Architecture (RegularRenderer)

```
App.tsx (state owner)
 |
 +--> useVerovio.ts (hook)
 |      - Verovio options: { pageHeight: 2970, breaks: 'auto' }
 |      - Returns svgPages[], pageHeights[], pageOffsets[], toolkit
 |
 +--> eventStore.ts (Zustand)
 |      - CachedEvent: { id, beatOnset, beatDuration, svgIds, pageIndex, globalY }
 |      - Lookup indices: eventById, eventsByPage
 |
 +--> RegularRenderer.tsx
 |      - Virtual scrolling: only 3-4 pages mounted near camera
 |      - Camera: CSS translateY() on cameraRef div
 |      - Event extraction: extractTimemapEvents() + computeEventPositions()
 |      - Animation: animateNoteheads() from noteAnimation.ts
 |
 +--> interpolation.ts
 |      - interpolateTimestamps(): beats -> timestamps via anchors
 |
 +--> noteAnimation.ts
        - animateNoteheads(): scale + color animation on g.notehead
        - resetNoteheadAnimations(): cleanup
```

### Key Data Structures

```typescript
// CachedEvent (from eventStore.ts)
interface CachedEvent {
  id: string;            // "evt-0", "evt-1", etc.
  beatOnset: number;     // Quarter-note-based timing
  beatDuration: number;  // Duration until next event
  svgIds: string[];      // Verovio note xml:id values
  pageIndex: number;     // 0-based page index
  globalY: number;       // Y position in global coordinate space
}

// For SingleLineRenderer, we'd need:
interface SingleLineEvent {
  id: string;
  beatOnset: number;
  beatDuration: number;
  svgIds: string[];
  sectionIndex: number;  // Which section contains this event
  globalX: number;       // X position in global coordinate space
}
```

---

## Proposed SingleLineRenderer Architecture

```
App.tsx (state owner)
 |
 +--> useSingleLineVerovio.ts (NEW hook)
 |      - Verovio options: { breaks: 'none', pageWidth: large }
 |      - Section rendering via toolkit.select({ measureRange })
 |      - Returns sections[], sectionWidths[], sectionOffsets[], toolkit
 |
 +--> singleLineEventStore.ts (NEW or extend eventStore)
 |      - SingleLineEvent: { id, beatOnset, svgIds, sectionIndex, globalX }
 |      - Lookup indices: eventById, eventsBySection
 |
 +--> SingleLineRenderer.tsx (NEW)
 |      - Section-based virtual scrolling (horizontal)
 |      - Camera: CSS translateX() on cameraRef div
 |      - Event extraction: extractTimemapEvents() + computeSectionPositions()
 |      - Animation: REUSE animateNoteheads() from noteAnimation.ts
 |
 +--> interpolation.ts (UNCHANGED)
 |      - interpolateTimestamps() works identically
 |
 +--> noteAnimation.ts (UNCHANGED)
        - animateNoteheads() works on any mounted SVG elements
```

---

## Component Analysis: Reuse vs New

### REUSABLE (No Changes)

| Component | Why Reusable |
|-----------|--------------|
| `noteAnimation.ts` | Targets SVG elements by ID. Works regardless of layout direction. |
| `interpolation.ts` | Pure function on events array. No layout awareness. |
| `animationController.ts` | Queries DOM by element ID. Layout-agnostic. |
| `verovioService.ts` | Singleton toolkit creation. No layout-specific code. |
| `ScoreRegionEditor.tsx` | Defines viewport bounds. Works for horizontal too. |
| `SyncEditor.tsx` | Different view, doesn't need SingleLine mode. |
| `eventStore.ts` | Interface is compatible; may need to extend for sectionIndex/globalX |

### REUSABLE WITH MODIFICATIONS

| Component | Modifications Needed |
|-----------|---------------------|
| `useVerovio.ts` | Option A: Add mode parameter for single-line options. Option B: Create separate `useSingleLineVerovio.ts`. Recommend Option B for clarity. |
| `getEvents.ts` | Add `computeSectionPositions()` for horizontal X extraction. `extractTimemapEvents()` is reusable as-is. |
| `eventStore.ts` | Extend `CachedEvent` interface or create parallel `SingleLineEvent` type with `globalX` and `sectionIndex`. |

### NEW IMPLEMENTATIONS REQUIRED

| Component | Purpose |
|-----------|---------|
| `useSingleLineVerovio.ts` | Hook for section-based rendering with `breaks: 'none'` + measure range selection |
| `SingleLineRenderer.tsx` | Main renderer component with horizontal camera and section virtualization |
| `singleLineEventStore.ts` | (Optional) Separate store for horizontal event cache, or extend existing store |

---

## Verovio Configuration for Single-Line Rendering

### Option 1: Full Single-Line (Not Recommended for Long Scores)

```typescript
toolkit.setOptions({
  breaks: 'none',           // No system/page breaks
  pageWidth: 100000,        // Very wide page
  adjustPageWidth: true,    // Shrink to content
  pageHeight: 200,          // Minimal height
  adjustPageHeight: true,   // Shrink to content
});
const svg = toolkit.renderToSVG(1);
```

**Problem:** Creates one massive SVG for entire score. Same memory issues as pre-v1.1 vertical rendering. Not viable for long scores.

### Option 2: Section-Based Rendering (Recommended)

Use Verovio's `select()` API to render measure ranges as independent sections:

```typescript
// Render sections of ~10-20 measures each
const MEASURES_PER_SECTION = 15;
const totalMeasures = getMeasureCount(toolkit); // Need to determine this

const sections: string[] = [];
for (let i = 0; i < totalMeasures; i += MEASURES_PER_SECTION) {
  const start = i + 1; // 1-based
  const end = Math.min(i + MEASURES_PER_SECTION, totalMeasures);

  toolkit.select({ measureRange: `${start}-${end}` });

  // After selection, renderToSVG outputs only selected measures
  toolkit.setOptions({
    breaks: 'none',
    pageWidth: 100000,
    adjustPageWidth: true,
    pageHeight: 200,
    adjustPageHeight: true,
  });

  sections.push(toolkit.renderToSVG(1));

  // Reset selection for next section
  toolkit.select({});
}
```

**Benefits:**
- Each section is an independent SVG
- Enables virtual scrolling (only mount visible sections)
- Section boundaries are invisible to users
- Memory bounded regardless of score length

**Challenges:**
- Need to determine total measure count (Verovio doesn't expose this directly)
- Must reselect and re-render for each section
- Section widths vary; need to compute offsets

### Determining Measure Count

Verovio doesn't provide a `getMeasureCount()` API. Options:

1. **Binary search with select():** Try large range, reduce until valid
2. **Parse MEI/MusicXML directly:** Count `<measure>` elements before loading
3. **Use timemap:** Extract from `renderToTimemap()` (each entry has measure info implicitly)
4. **Render once with breaks: 'none', measure the SVG:** Then section it

Recommend: **Parse timemap** since we already call `renderToTimemap()` for event extraction.

---

## Camera System Comparison

### RegularRenderer (Vertical)

```typescript
function applyCamera(targetY: number) {
  const viewportHeight = scoreRegion?.height ?? containerHeight;
  let cameraY = targetY - viewportHeight / 2;
  cameraY = Math.max(0, cameraY);
  cameraY = Math.min(cameraY, totalHeight - viewportHeight);
  cameraRef.current.style.transform = `translateY(${-cameraY}px)`;
}
```

**Characteristics:**
- System-boundary snapping (all events in same system share Y)
- Vertical scrolling with transition easing
- Camera stays still within a system, jumps at system boundaries

### SingleLineRenderer (Horizontal)

```typescript
function applyCameraX(targetX: number) {
  const viewportWidth = scoreRegion?.width ?? containerWidth;
  // Keep active note centered horizontally
  let cameraX = targetX - viewportWidth / 2;
  cameraX = Math.max(0, cameraX);
  cameraX = Math.min(cameraX, totalWidth - viewportWidth);
  cameraRef.current.style.transform = `translateX(${-cameraX}px)`;
}
```

**Characteristics:**
- Continuous tracking (camera moves with each note, no snapping)
- Horizontal scrolling with transition easing
- Active note stays centered in viewport

### Camera Transition Timing

RegularRenderer uses `transition: transform 200ms ease-out`. SingleLineRenderer should use similar timing but may need adjustment for smoother horizontal motion:

```css
/* Consider longer transition for horizontal */
transition: transform 150ms linear;
/* Or spring-like easing */
transition: transform 200ms cubic-bezier(0.25, 0.1, 0.25, 1);
```

---

## Event Position Extraction

### RegularRenderer: Global Y Positions

```typescript
// From getEvents.ts - computeEventPositions()
for (const event of cachedEvents) {
  const pageNum = toolkit.getPageWithElement(event.svgIds[0]);
  const pageIndex = pageNum - 1;
  event.pageIndex = pageIndex;

  const container = pageContainers[pageIndex];
  const containerRect = container.getBoundingClientRect();
  const noteEl = container.querySelector(`#${CSS.escape(event.svgIds[0])}`);
  const systemEl = noteEl.closest('g.system');
  const sysRect = systemEl.getBoundingClientRect();
  const localY = sysRect.top - containerRect.top + sysRect.height / 2;
  event.globalY = pageOffsets[pageIndex] + localY;
}
```

### SingleLineRenderer: Global X Positions

```typescript
function computeSectionPositions(
  timemapEvents: TimemapEvent[],
  toolkit: VerovioToolkit,
  sectionContainers: HTMLElement[],
  sectionOffsets: number[]  // Cumulative X offsets
): SingleLineEvent[] {
  const events: SingleLineEvent[] = timemapEvents.map(e => ({
    ...e,
    sectionIndex: 0,
    globalX: 0,
  }));

  for (const event of events) {
    if (event.svgIds.length === 0) continue;

    // Find which section contains this note
    // Note: With select(), element IDs persist, but we need to know
    // which section SVG contains it
    for (let sectionIdx = 0; sectionIdx < sectionContainers.length; sectionIdx++) {
      const container = sectionContainers[sectionIdx];
      const noteEl = container.querySelector(`#${CSS.escape(event.svgIds[0])}`);
      if (noteEl) {
        event.sectionIndex = sectionIdx;
        const containerRect = container.getBoundingClientRect();
        const noteRect = noteEl.getBoundingClientRect();
        const localX = noteRect.left - containerRect.left + noteRect.width / 2;
        event.globalX = sectionOffsets[sectionIdx] + localX;
        break;
      }
    }
  }

  return events;
}
```

---

## Virtual Scrolling Strategy

### RegularRenderer (Vertical Pages)

```typescript
// Mount pages near camera Y position
const visiblePages = useMemo(() => {
  const buffer = 1; // Mount 1 page before/after
  const currentPage = /* find page containing cameraY */;
  return [currentPage - buffer, currentPage, currentPage + buffer]
    .filter(i => i >= 0 && i < pageCount);
}, [cameraY, pageOffsets, pageCount]);

// Render
{svgPages.map((svg, i) => (
  visiblePages.includes(i) ? (
    <div key={i} dangerouslySetInnerHTML={{ __html: svg }} />
  ) : (
    <div key={i} style={{ height: pageHeights[i] }} /> // Placeholder
  )
))}
```

### SingleLineRenderer (Horizontal Sections)

```typescript
// Mount sections near camera X position
const visibleSections = useMemo(() => {
  const buffer = 1;
  const currentSection = /* find section containing cameraX */;
  return [currentSection - buffer, currentSection, currentSection + buffer]
    .filter(i => i >= 0 && i < sectionCount);
}, [cameraX, sectionOffsets, sectionCount]);

// Render in horizontal flex container
<div style={{ display: 'flex', flexDirection: 'row' }}>
  {sections.map((svg, i) => (
    visibleSections.includes(i) ? (
      <div key={i} dangerouslySetInnerHTML={{ __html: svg }} />
    ) : (
      <div key={i} style={{ width: sectionWidths[i] }} /> // Placeholder
    )
  ))}
</div>
```

---

## Integration Points

### 1. App.tsx Changes

```typescript
// Add renderer type selection
const [rendererType, setRendererType] = useState<'regular' | 'singleLine'>('regular');

// Render appropriate component
{rendererType === 'regular' ? (
  <RegularRenderer {...props} />
) : (
  <SingleLineRenderer {...props} />
)}
```

### 2. Shared Props Interface

Both renderers share most props:

```typescript
interface SharedRendererProps {
  xml: string;
  bgUrl?: string;
  fps?: number;
  scoreColor?: string;
  syncAnchors?: Map<string, number>;
  audioUrl?: string;
  scoreRegion?: ScoreRegion | null;
  scoreBorder?: BorderStyle;
  scoreScale?: number;
  activeNoteheadColor?: string;
  activeNoteheadScale?: number;
  activeNoteheadAnimationEntryMs?: number;
  activeNoteheadAnimationHoldMs?: number;
  activeNoteheadAnimationExitMs?: number;
  colorFullNote?: boolean;
}
```

### 3. Event Store Extension

Option A: Single store with discriminated union

```typescript
type LayoutEvent =
  | { layout: 'vertical'; pageIndex: number; globalY: number; ... }
  | { layout: 'horizontal'; sectionIndex: number; globalX: number; ... };
```

Option B: Separate stores (simpler, less coupling)

```typescript
// Keep eventStore for RegularRenderer
// Create singleLineEventStore for SingleLineRenderer
```

**Recommend: Option B** - Simpler implementation, no risk of breaking existing RegularRenderer.

---

## Build Order

Based on dependency analysis, recommended phase structure:

### Phase 1: Single-Line Verovio Hook

**Goal:** Create `useSingleLineVerovio` that renders score as horizontal sections

**Deliverables:**
- `useSingleLineVerovio.ts` hook
- Section-based rendering with `breaks: 'none'` + `select({ measureRange })`
- Returns `{ sections, sectionWidths, sectionOffsets, toolkit, isLoading, error }`

**Dependencies:** None (uses existing Verovio service)

### Phase 2: Single-Line Event Extraction

**Goal:** Extract events with section assignments and global X positions

**Deliverables:**
- `computeSectionPositions()` function in getEvents.ts
- `SingleLineEvent` type definition
- `singleLineEventStore.ts` (or extend eventStore)

**Dependencies:** Phase 1 (needs section containers in DOM for position measurement)

### Phase 3: SingleLineRenderer Core

**Goal:** Basic horizontal renderer with camera tracking (no virtualization yet)

**Deliverables:**
- `SingleLineRenderer.tsx` component
- Horizontal camera with center-tracking
- Notehead animation working (reuse noteAnimation.ts)

**Dependencies:** Phase 1, Phase 2

### Phase 4: Section Virtualization

**Goal:** Only mount visible sections for memory efficiency

**Deliverables:**
- Section visibility calculation based on cameraX
- Placeholder divs for unmounted sections
- Seamless section transitions

**Dependencies:** Phase 3

### Phase 5: Integration and Polish

**Goal:** Integrate with App.tsx, add renderer selection UI

**Deliverables:**
- Renderer type toggle in UI
- Score region bounds working for horizontal layout
- Borders working at horizontal viewport edges

**Dependencies:** Phase 4

---

## Risk Areas

### 1. Verovio Element ID Persistence Across Selections

**Risk:** When using `select({ measureRange })`, do element IDs remain consistent across different selections of the same score?

**Mitigation:** Verovio IDs are based on MEI xml:id attributes, which are stable. Verify with testing.

### 2. Section Width Measurement Before DOM Mount

**Risk:** Computing section widths requires parsing SVG or measuring in DOM.

**Mitigation:** Parse SVG width attribute from string before mounting, or render invisibly first.

### 3. Events Spanning Section Boundaries

**Risk:** Tied notes or slurs that cross section boundaries may render incorrectly.

**Mitigation:**
- Use generous section overlap (last measure of section N = first measure of section N+1)
- Or accept minor visual artifacts at boundaries (acceptable for v1.2)

### 4. Different Y Positioning Needs

**Risk:** SingleLineRenderer has single-system Y but may have multi-voice vertical variation.

**Mitigation:** Y positioning not needed for horizontal camera. Ignore Y in single-line mode.

---

## Confidence Assessment

| Area | Confidence | Reasoning |
|------|------------|-----------|
| Reuse of noteAnimation.ts | HIGH | Pure DOM manipulation by ID, verified layout-agnostic |
| Reuse of interpolation.ts | HIGH | Pure function on event arrays, no layout code |
| Verovio breaks: 'none' | HIGH | Documented at book.verovio.org, standard API |
| Verovio select() for sections | MEDIUM | Documented, but not verified for performance with many sections |
| Section virtualization | MEDIUM | Pattern proven in vertical case, horizontal is analogous |
| Element ID stability | MEDIUM | Expected to work, needs verification |

---

## Sources

- [Verovio Toolkit Options](https://book.verovio.org/toolkit-reference/toolkit-options.html) - Official breaks, pageWidth, adjustPageWidth documentation
- [Verovio Layout Options](https://book.verovio.org/advanced-topics/layout-options.html) - breaks: 'none' behavior
- [Verovio Content Selection](https://book.verovio.org/interactive-notation/content-selection.html) - select() API for measure ranges
- [Verovio Toolkit Methods](https://book.verovio.org/toolkit-reference/toolkit-methods.html) - select(), getPageWithElement() methods
- Existing codebase analysis (RegularRenderer.tsx, useVerovio.ts, getEvents.ts, noteAnimation.ts, eventStore.ts)
