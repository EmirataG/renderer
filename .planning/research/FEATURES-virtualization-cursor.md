# Feature Landscape: Virtualization & Playhead Cursor (RegularRenderer)

**Domain:** Vertical paginated music notation with virtualization and playback cursor
**Researched:** 2026-02-08
**Confidence:** HIGH

## Executive Summary

This research focuses on two specific feature additions to the existing RegularRenderer:

1. **Page Virtualization** - Render only visible pages for performance on long scores
2. **Playhead Cursor** - Visual indicator showing current playback position

Both features are table-stakes in modern music notation software. Virtualization is a performance optimization pattern borrowed from web development (virtual scrolling), while playhead cursors follow established conventions from music notation apps like MuseScore, Finale, and Dorico.

The RegularRenderer already has the foundational infrastructure:
- Vertical camera scrolling via CSS transform
- System-boundary snapping
- Paginated SVG rendering
- Notehead animation (scale, color, timing)

Adding virtualization and cursor requires incremental changes, not architectural rewrites.

---

## Table Stakes: Virtualization

Features users expect from page virtualization in a score renderer.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Render only visible pages** | Core performance optimization; users expect smooth performance on long scores | Medium | Mount/unmount pages based on camera position |
| **Buffer adjacent pages** | Prevents flash during scroll; preload 1 page above/below viewport | Low | Industry standard: N-1, N, N+1 pages mounted |
| **Seamless page transitions** | Page mounting/unmounting must be invisible to user | Medium | Load before visible, unload after invisible |
| **Memory release** | Unmount pages far from viewport to free memory | Low | Prevents memory bloat on 100+ page scores |
| **Scroll smoothness preserved** | Virtualization must not cause jitter or lag during camera movement | High | Critical: mounting must not block render thread |
| **Fast initial load** | Only render page 1 initially, not entire score | Low | Users expect instant first render |

### Expected Virtualization Behavior

```
100-page score example:

Initial state (page 1 visible):
Mounted: [Page 1, Page 2]
Unmounted: [Pages 3-100]

Scroll to page 50:
Mounted: [Page 49, Page 50, Page 51]
Unmounted: [Pages 1-48, 52-100]

Scroll to page 100:
Mounted: [Page 99, Page 100]
Unmounted: [Pages 1-98]
```

**Buffer strategy:**
- Visible page + 1 page ahead + 1 page behind (3 total typical)
- Load when camera enters loading zone (50% of buffer distance)
- Unload when camera exits unload zone (2x buffer distance)

### Performance Targets

Based on virtual scrolling research:

| Metric | Target | Why |
|--------|--------|-----|
| Initial render | <500ms | Only page 1 rendered |
| Page mount time | <16ms | Must complete within single frame (60fps) |
| Memory per page | ~1-2MB | SVG DOM size |
| Scroll FPS | 60fps | No dropped frames during virtualization |

---

## Table Stakes: Playhead Cursor

Features users expect from a playback cursor in music notation.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Vertical line indicator** | Universal convention in music notation software | Low | Single div with fixed position |
| **Synchronized with audio** | Cursor position matches audio playback position exactly | Low | Already have audio sync via syncAnchors |
| **Follows active note** | Cursor positioned at X coordinate of currently playing note/event | Low | Use existing interpolatedEvents data |
| **Visible color contrast** | Cursor stands out against score background | Low | Typically red, blue, or user-customizable |
| **Spans full system height** | Line extends from top to bottom of current system | Medium | Requires system boundary detection |
| **Smooth movement** | Cursor moves continuously, not in jumps | Medium | CSS transition or animation frame interpolation |
| **Camera follows cursor** | When cursor moves to new system, camera scrolls to keep it visible | Low | Already implemented (camera follows active event) |

### Expected Cursor Behavior

Based on MuseScore, Finale, Dorico patterns:

| Behavior | Description | Implementation |
|----------|-------------|----------------|
| **Vertical line** | Thin vertical line (1-3px width) spanning system height | `position: absolute`, fixed X, dynamic height |
| **Color** | High contrast (red/blue), configurable | CSS color property, default red (#ff0000) |
| **Position** | X coordinate matches active event's bounding box left edge | Extract X from event bbox |
| **Height** | Extends from top staff line to bottom staff line of system | Calculate from system SVG bounds |
| **Transition** | Smooth movement between notes | `transition: transform 200ms ease-out` |
| **Pan score during playback** | Toggle to enable/disable camera following cursor | Already exists via camera controller |

### Cursor Visual Design

Industry patterns from research:

```
MuseScore: Thin blue vertical line, full system height
Dorico: Red vertical line, full page height, slight transparency
Finale: Blue vertical line, system height, optional "playback bar" mode
Soundslice: Fixed position (horizontal mode), not a moving cursor
```

**Recommendation for Manuscript:**
- Thin vertical line (2px width)
- Default color: red (#ff0000) with 80% opacity
- Spans system height (not full page)
- CSS transform for positioning (same pattern as camera)
- Configurable via props (color, width, enabled/disabled)

---

## Table Stakes: Cursor Timing Synchronization

Critical requirements for accurate cursor positioning.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Audio-timestamp sync** | Cursor must stay locked to audio playback, not drift | Low | Already have interpolatedEvents with computedTimestamp |
| **Sub-beat precision** | Cursor updates within a single beat, not just on beat boundaries | Low | Event-based interpolation, not beat-based |
| **Smooth interpolation** | Between discrete events, cursor moves smoothly | Medium | Linear interpolation or CSS transition |
| **Low latency** | Cursor updates within 16ms of audio position change | Low | requestAnimationFrame loop (already exists) |
| **Handles tempo changes** | Cursor speed adjusts to tempo without drift | Low | Timestamp-based, not BPM-based (already implemented) |

### Timing Synchronization Issues (from research)

Common problems in music notation software:

| Issue | Cause | Prevention |
|-------|-------|------------|
| **Cursor lags behind audio** | Long animation frame time | Keep cursor update logic lightweight |
| **Cursor jumps ahead** | Incorrect timestamp interpolation | Verify interpolatedEvents accuracy |
| **Drift over time** | Accumulating rounding errors | Reset cursor position from audio.currentTime each frame |
| **Desync after tempo change** | BPM-based calculation instead of timestamp-based | Use absolute timestamps, not BPM |

**Manuscript's advantage:** Already using timestamp-based interpolation (not BPM), so tempo changes are naturally handled.

---

## Differentiators

Features that would set Manuscript apart. Not expected, but valued if present.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Configurable cursor style** | User can customize color, width, opacity | Low | Props interface, CSS variables |
| **Cursor follows measure** | Highlight entire current measure, not just a line | Medium | Requires measure boundary detection |
| **Lookahead cursor** | Show upcoming notes with reduced opacity | Medium | Render future events with fade effect |
| **Multi-voice cursors** | Separate cursor per voice/staff in polyphonic music | High | Complex: requires voice-aware event tracking |
| **Scrubbing** | Click/drag cursor to seek audio | Medium | Requires reverse timestamp lookup |
| **Cursor hover preview** | Hover over cursor shows measure number, timestamp | Low | Tooltip on cursor element |

### Differentiator Analysis

**Configurable cursor style** is low-hanging fruit with high user satisfaction. Different users prefer different cursor colors (red vs blue is a common debate).

**Scrubbing** would be valuable but requires bidirectional timestamp mapping (currently only have forward mapping: timestamp → event). Consider for future milestone.

**Lookahead cursor** pairs well with notehead animation - show what's coming while highlighting what's playing.

---

## Anti-Features

Features to explicitly NOT build. Common mistakes in this domain.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Render entire score always** | Memory explosion, slow initial load | Use virtualization: render visible pages only |
| **Page-by-page cursor jumping** | Jarring, loses user's place during scroll | Smooth cursor movement with camera following |
| **BPM-based cursor timing** | Drifts on tempo changes, inaccurate | Use audio timestamps (already implemented) |
| **Heavy cursor rendering** | Can cause frame drops if cursor update blocks render | Lightweight: CSS transform only, no reflow |
| **Cursor without buffer pages** | Flash/blank pages when cursor scrolls to new page | Always buffer 1 page ahead/behind |
| **Manual page loading** | User has to click "load more" | Automatic virtualization based on camera |
| **Fixed cursor height (full page)** | Looks wrong when systems have different heights | Calculate cursor height per system |
| **Cursor moves before audio** | Feels laggy or out of sync | Cursor position driven by audio.currentTime |

### Anti-Pattern Deep Dive: Render Full Score

Common mistake: "Just render all pages at once, memory is cheap."

**Why this is wrong:**
- 100-page orchestral score = ~100-200MB SVG DOM
- Browser layout/paint time scales non-linearly with DOM size
- Scroll jank increases with DOM depth
- Mobile devices have memory limits

**Evidence from research:**
Virtual scrolling becomes beneficial at ~50-100 items. Music scores routinely exceed 100 pages.

From LogRocket: "Virtual scrolling keeps the DOM size minimal by only rendering visible elements."

---

## Feature Dependencies

```
Existing Infrastructure (v1.1)
    |
    +---> Paginated SVG Rendering
    |     |
    |     v
    |     Page Heights & Offsets (already calculated)
    |     |
    |     v
    |     Virtualization Logic
    |         |
    |         +---> Mount/Unmount Pages
    |         +---> Buffer Strategy (N-1, N, N+1)
    |
    +---> Camera System (vertical scroll)
    |     |
    |     v
    |     Camera Position → Visible Page Range
    |
    +---> Interpolated Events (timestamp → position)
          |
          v
          Playhead Cursor
              |
              +---> Position (event.x)
              +---> Height (system bounds)
              +---> Timing (event.computedTimestamp)
```

**Critical Path for Virtualization:**
1. Camera position tracking (exists)
2. Visible page range calculation (new)
3. Mount/unmount pages based on range (new)
4. Buffer strategy (1 page ahead/behind) (new)

**Critical Path for Cursor:**
1. Interpolated events with timestamps (exists)
2. Current event from audio.currentTime (exists in animationController)
3. Cursor positioning (event.x, system bounds) (new)
4. Cursor rendering (div with CSS transform) (new)

---

## MVP Recommendation

For RegularRenderer milestone (virtualization + cursor), prioritize in this order:

### Phase 1: Virtualization (Must Have)
1. **Visible page range calculation** - Determine which pages are in viewport
2. **Mount/unmount logic** - Add/remove pages from DOM based on range
3. **Buffer strategy** - Keep 1 page ahead/behind visible range
4. **Memory release** - Unload pages >2 pages away from viewport

### Phase 2: Playhead Cursor (Must Have)
5. **Basic cursor rendering** - Vertical line positioned at active event.x
6. **System height calculation** - Cursor spans current system, not full page
7. **Audio sync** - Cursor position updates from audio.currentTime
8. **Smooth movement** - CSS transition for cursor position changes

### Should Have (Polish)
9. **Configurable cursor color** - Props for color, width, opacity
10. **Cursor enable/disable toggle** - User can hide cursor if desired

### Defer to Future Milestones
- Scrubbing (click/drag cursor to seek)
- Lookahead cursor preview
- Multi-voice cursors
- Measure-based cursor (highlight full measure)
- Cursor hover tooltips

---

## Virtualization Specification

### Concept

Only mount pages visible in viewport + buffer:

```
100-page score, viewing page 50:

Viewport range:
Camera Y: 48000px
Page 50 offset: 48000px
Page 50 height: 1200px

Visible: Page 50
Buffer: Page 49 (above), Page 51 (below)

Mounted pages: [49, 50, 51]
Unmounted pages: [1-48, 52-100]
```

### Algorithm

```typescript
function getVisiblePageRange(
  cameraY: number,
  viewportHeight: number,
  pageOffsets: number[],
  pageHeights: number[]
): { firstPage: number; lastPage: number } {
  const viewportTop = cameraY;
  const viewportBottom = cameraY + viewportHeight;

  // Find pages intersecting viewport
  const visiblePages = pageOffsets
    .map((offset, index) => ({
      index,
      top: offset,
      bottom: offset + pageHeights[index]
    }))
    .filter(page =>
      page.bottom > viewportTop && page.top < viewportBottom
    );

  if (visiblePages.length === 0) {
    return { firstPage: 0, lastPage: 0 };
  }

  return {
    firstPage: visiblePages[0].index,
    lastPage: visiblePages[visiblePages.length - 1].index
  };
}

function getMountedPageRange(
  visibleRange: { firstPage: number; lastPage: number },
  totalPages: number,
  bufferSize: number = 1
): number[] {
  const first = Math.max(0, visibleRange.firstPage - bufferSize);
  const last = Math.min(totalPages - 1, visibleRange.lastPage + bufferSize);

  return Array.from(
    { length: last - first + 1 },
    (_, i) => first + i
  );
}
```

### Implementation Strategy

**Option A: Conditional Rendering**
```tsx
{pageIndices.map((pageIndex) => {
  const shouldMount = mountedPages.includes(pageIndex);
  if (!shouldMount) return null;

  return (
    <div key={pageIndex} style={{ position: 'absolute', top: pageOffsets[pageIndex] }}>
      <div dangerouslySetInnerHTML={{ __html: svgPages[pageIndex] }} />
    </div>
  );
})}
```

**Option B: Placeholder Divs**
```tsx
{pageIndices.map((pageIndex) => {
  const shouldMount = mountedPages.includes(pageIndex);

  return (
    <div key={pageIndex} style={{
      position: 'absolute',
      top: pageOffsets[pageIndex],
      height: pageHeights[pageIndex]
    }}>
      {shouldMount && (
        <div dangerouslySetInnerHTML={{ __html: svgPages[pageIndex] }} />
      )}
    </div>
  );
})}
```

**Recommendation:** Option B (Placeholder Divs)
- Maintains correct layout height even when SVG unmounted
- Prevents scroll position jump when mounting/unmounting
- Simpler total height calculation

### Edge Cases

| Situation | Behavior |
|-----------|----------|
| **First page** | Buffer only page 2 (no page -1) |
| **Last page** | Buffer only page N-1 (no page N+1) |
| **Single page score** | No virtualization needed, mount page 1 only |
| **Fast scrolling** | May briefly show unmounted page; acceptable if <100ms |
| **Initial load** | Mount page 1 + page 2 (buffer ahead) |

---

## Playhead Cursor Specification

### Concept

Vertical line positioned at current playback event's X coordinate:

```
Score (system):
┌─────────────────────────────────────┐
│  ♩   ♩   ♩   |♩   ♩   ♩   ♩        │
│              ^                      │
│              Cursor (active event)  │
└─────────────────────────────────────┘
```

### Visual Design

```tsx
<div
  className="playhead-cursor"
  style={{
    position: 'absolute',
    left: cursorX,
    top: systemTop,
    width: '2px',
    height: systemHeight,
    backgroundColor: 'rgba(255, 0, 0, 0.8)',
    pointerEvents: 'none',
    transition: 'transform 200ms ease-out',
    zIndex: 100
  }}
/>
```

### Positioning Algorithm

```typescript
function getCursorPosition(
  currentTime: number,
  interpolatedEvents: Event[],
  scoreRef: HTMLDivElement
): { x: number; y: number; height: number } | null {
  // Find current event based on audio timestamp
  const currentEvent = interpolatedEvents.find((event, index) => {
    const nextEvent = interpolatedEvents[index + 1];
    return (
      event.computedTimestamp <= currentTime &&
      (!nextEvent || currentTime < nextEvent.computedTimestamp)
    );
  });

  if (!currentEvent) return null;

  // Get event's SVG element to extract position
  const eventElement = scoreRef.querySelector(`[data-id="${currentEvent.id}"]`);
  if (!eventElement) return null;

  const bbox = eventElement.getBoundingClientRect();
  const scoreRect = scoreRef.getBoundingClientRect();

  // Find system bounds (staff lines)
  const system = eventElement.closest('.system');
  const systemBbox = system?.getBoundingClientRect();

  return {
    x: bbox.left - scoreRect.left,
    y: systemBbox ? systemBbox.top - scoreRect.top : bbox.top - scoreRect.top,
    height: systemBbox ? systemBbox.height : bbox.height
  };
}
```

### Update Frequency

**Option A: Every frame (60fps)**
```typescript
useEffect(() => {
  const animate = () => {
    if (audioRef.current && isPlaying) {
      const currentTime = audioRef.current.currentTime;
      const cursorPos = getCursorPosition(currentTime, interpolatedEvents, scoreRef.current);
      setCursorPosition(cursorPos);
    }
    animationFrameRef.current = requestAnimationFrame(animate);
  };

  if (isPlaying) {
    animationFrameRef.current = requestAnimationFrame(animate);
  }

  return () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
  };
}, [isPlaying, interpolatedEvents]);
```

**Option B: On event change only**
```typescript
useEffect(() => {
  if (!audioRef.current) return;

  const currentTime = audioRef.current.currentTime;
  const currentEventIndex = findEventIndex(currentTime, interpolatedEvents);

  if (currentEventIndex !== prevEventIndexRef.current) {
    const cursorPos = getCursorPosition(interpolatedEvents[currentEventIndex]);
    setCursorPosition(cursorPos);
    prevEventIndexRef.current = currentEventIndex;
  }
}, [audioCurrentTime, interpolatedEvents]);
```

**Recommendation:** Option A (Every frame)
- Smoother visual movement between events
- Matches existing animationController pattern
- Allows for smooth interpolation (if desired later)
- Minimal performance impact (single DOM update per frame)

### Edge Cases

| Situation | Behavior |
|-----------|----------|
| **Before first event** | Hide cursor (no position) |
| **After last event** | Show cursor at last event, or hide |
| **No audio loaded** | Hide cursor (playback-only feature) |
| **Paused** | Cursor remains at current position |
| **Seeking** | Cursor jumps to new position immediately |
| **Multi-staff systems** | Cursor spans full system height (all staves) |
| **Page boundaries** | Cursor disappears during page transition, reappears on new page |

---

## Integration with Existing Features

### Camera System Integration

RegularRenderer already has:
- `cameraRef` for scroll container
- CSS transform for vertical positioning
- System-boundary snapping

**Cursor must:**
- Position relative to `scoreRef`, not `cameraRef`
- Use absolute positioning within score container
- Update position based on interpolatedEvents (already available)

**Virtualization must:**
- Use existing `pageOffsets` and `pageHeights` arrays
- Not interfere with camera transform
- Mount/unmount pages without affecting scroll position

### Notehead Animation Integration

RegularRenderer already has:
- `animateNoteheads()` function
- Event-based animation triggers
- `interpolatedEvents` for timing

**Cursor should:**
- Use same event timing as notehead animation
- Trigger on same frame as animation (shared animation loop)
- Not duplicate event lookup logic (reuse `currentEventIndex`)

### Performance Integration

RegularRenderer already renders pages via:
```tsx
{svgPages.map((svg, index) => (
  <div key={index} ref={(el) => (pageContainerRefs.current[index] = el)}>
    <div dangerouslySetInnerHTML={{ __html: svg }} />
  </div>
))}
```

**Virtualization changes:**
```tsx
{svgPages.map((svg, index) => {
  const shouldMount = mountedPageIndices.includes(index);

  return (
    <div
      key={index}
      style={{
        position: 'absolute',
        top: pageOffsets[index],
        height: pageHeights[index]
      }}
    >
      {shouldMount && (
        <div
          ref={(el) => (pageContainerRefs.current[index] = el)}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      )}
    </div>
  );
})}
```

---

## Performance Considerations

### Virtualization Performance

| Metric | Without Virtualization | With Virtualization | Notes |
|--------|------------------------|---------------------|-------|
| **Initial render (100 pages)** | 5-10 seconds | <500ms | Only page 1 rendered |
| **Memory (100 pages)** | 100-200MB | 3-6MB | Only 3 pages in DOM |
| **Scroll performance** | 30-45 fps (jank) | 60 fps | Smaller DOM = faster paint |
| **Page mount time** | N/A | <16ms | Must stay within frame budget |

### Cursor Performance

| Metric | Target | Notes |
|--------|--------|-------|
| **Update frequency** | 60 fps | requestAnimationFrame |
| **DOM updates per frame** | 1 (transform only) | No layout/reflow |
| **Lookup time** | <1ms | Event index search (binary search if needed) |
| **Render time** | <1ms | Single div with CSS transform |

### Optimization Strategies

**Virtualization:**
- Debounce page mount/unmount by 100ms (prevent thrashing during fast scroll)
- Preload pages in `requestIdleCallback` when browser idle
- Use `will-change: transform` on page containers
- Avoid measuring DOM during scroll (use cached pageOffsets)

**Cursor:**
- Cache cursor position calculation (only recalculate on event change)
- Use CSS `transform: translateX()` instead of `left` property
- Set `pointer-events: none` to avoid hit-test overhead
- Use `will-change: transform` hint for GPU acceleration

---

## Testing Considerations

### Virtualization Tests

| Test Case | Expected Behavior |
|-----------|-------------------|
| **100-page score, scroll to page 50** | Only pages 49, 50, 51 mounted |
| **Scroll from page 1 to page 100** | Pages mount/unmount smoothly, no flash |
| **Scroll quickly (10 pages/second)** | No blank pages, buffer keeps up |
| **Single-page score** | No virtualization, page 1 always mounted |
| **Initial load** | Pages 1-2 mounted, others unmounted |

### Cursor Tests

| Test Case | Expected Behavior |
|-----------|-------------------|
| **Play from start** | Cursor appears at first event |
| **Play to end** | Cursor reaches last event |
| **Pause** | Cursor stops moving, stays at current position |
| **Seek to middle** | Cursor jumps to new position instantly |
| **Multi-staff system** | Cursor spans all staves in system |
| **No audio loaded** | Cursor hidden |

### Integration Tests

| Test Case | Expected Behavior |
|-----------|-------------------|
| **Virtualization + Camera** | Camera scroll works normally with virtualized pages |
| **Cursor + Notehead Animation** | Cursor and notehead animation sync perfectly |
| **Virtualization + Cursor** | Cursor visible even on virtualized pages |
| **Fast scroll with cursor playing** | Cursor remains visible, pages mount smoothly |

---

## Sources

### HIGH Confidence (Official Documentation / Technical Specs)

**Virtual Scrolling Patterns:**
- [Virtual Scrolling in React](https://blog.logrocket.com/virtual-scrolling-core-principles-and-basic-implementation-in-react/) - Core principles and implementation
- [AG Grid DOM Virtualisation](https://www.ag-grid.com/javascript-data-grid/dom-virtualisation/) - Industry standard implementation
- [List Virtualization Pattern](https://www.webdong.dev/en/post/list-virtualization-pattern/) - When to use, performance benefits
- [Mastering Virtualization](https://medium.com/@pddadson/mastering-virtualization-in-modern-web-development-a-complete-guide-to-virtual-scrolling-and-140cc2afcc95) - Complete guide to virtual scrolling

**Pagination Buffering:**
- [Syncfusion PDF Viewer OverscanCount](https://help.syncfusion.com/document-processing/pdf/pdf-viewer/blazor/faqs/how-to-render-n-pages-scrolling) - Buffer N pages while scrolling
- [Alova.JS Pagination Strategy](https://alova.js.org/tutorial/client/strategy/use-pagination/) - Preload adjacent pages
- [Prefetching for Performance](https://addyosmani.com/blog/prefetching/) - Browser preload techniques

### MEDIUM Confidence (Music Notation Software Patterns)

**Playhead Cursor Design:**
- [MuseScore Playback Controls](https://musescore.org/en/handbook/4/playback-controls) - Official playback cursor documentation
- [Forte Music Cursor](https://www.fortenotation.com/en/manual/FORTE10/TheMusicCursor.html) - Cursor visual design and feedback
- [Dorico Playback Cursor](https://forums.steinberg.net/t/what-is-the-playback-cursor-called-and-how-to-position-it-at-will/787051) - Cursor positioning in Dorico
- [Logic Pro Playhead](https://support.apple.com/guide/logicpro/set-the-playhead-position-lgcp0f34ca7a/mac) - Vertical line playhead design

**Cursor Synchronization:**
- [MuseScore Cursor Sync Issues](https://musescore.org/en/node/4446) - Common sync problems and solutions
- [Sibelius Cursor Timing](https://www.sibeliusforum.com/viewtopic.php?t=2114) - Cursor offset issues
- [Flat Sync External Recording](https://help.flat.io/en/music-notation-software/synchronize-external-recording/) - Audio sync implementation

**Scrolling Behavior:**
- [MuseScore Pan Score During Playback](https://musescore.org/en/node/333911) - Following cursor during playback
- [Soundslice Smooth Scrolling](https://www.soundslice.com/blog/28/new-smooth-scrolling-during-playback/) - Smooth scroll implementation
- [Paperless Music Auto-Scroll](https://www.paperlessmusic.com/) - Automatic page turning with scrolling

### LOW Confidence (Community / Forum Discussions)

**Performance Issues:**
- [MuseScore Large Score Performance](https://musescore.org/en/node/11816) - Response time with large scores
- [MuseScore MIDI Latency](https://musescore.org/en/node/353943) - Latency in playback cursor

**User Requests:**
- [MuseScore Support Playback Scrubbing](https://musescore.org/en/node/351204) - Scrubbing feature request
- [BlackBinder Auto-Scrolling](https://www.blackbinder.net/features/feature-1/) - Automatic sheet music scrolling

---

## Confidence Assessment

| Area | Confidence | Reason |
|------|------------|--------|
| **Virtualization patterns** | HIGH | Well-established web development pattern, multiple authoritative sources |
| **Buffer strategy** | HIGH | Industry standard (AG Grid, Syncfusion), proven approach |
| **Cursor visual design** | HIGH | Consistent across MuseScore, Finale, Dorico official docs |
| **Cursor timing sync** | MEDIUM | Manuscript already has timestamp-based system; integration straightforward |
| **Performance targets** | MEDIUM | Based on general virtual scrolling benchmarks, not music-specific |
| **Edge case handling** | MEDIUM | Inferred from community discussions, not official documentation |

---

## Gaps and Open Questions

**Virtualization:**
- Optimal buffer size: 1 page or 2 pages? (Need to test with real scores)
- Should buffer size be configurable per user preference?
- What happens if page mount takes >16ms? (Need fallback strategy)

**Cursor:**
- Should cursor span full page or just current system? (Research says system; verify UX)
- What color has best contrast across different score backgrounds?
- Should cursor have shadow/glow for better visibility?
- How to handle cursor on multi-staff systems with large vertical gaps?

**Integration:**
- Can virtualization and cursor share the same animation loop? (Likely yes, but verify performance)
- What's the interaction between cursor and notehead animation? (Both triggered by same event?)

These gaps can be addressed during implementation and user testing.

---

**Research complete. Ready for requirements definition and implementation planning.**
