# Phase 12: SingleLineRenderer Core - Research

**Researched:** 2026-02-05
**Domain:** React component with CSS transform-based horizontal camera animation
**Confidence:** HIGH

## Summary

This phase builds a new `SingleLineRenderer.tsx` component that displays scores horizontally with smooth camera tracking. The foundation work from Phase 10 (useSingleLineVerovio hook) and Phase 11 (computeSectionPositions for globalX coordinates) is complete and verified. This phase wires those building blocks into a working renderer.

The core technical challenge is implementing teleprompter-style horizontal camera movement. The user has decided on:
- Active note at viewport center (50%)
- Continuous smooth movement (no snapping)
- Score flush left at start, camera catches up
- Stop at right edge at end (no empty space)

CSS `translateX()` transforms with smooth easing transitions are the standard approach for 60fps camera movement. This is identical to the existing vertical camera system in RegularRenderer, just rotated 90 degrees.

**Primary recommendation:** Mirror RegularRenderer's camera pattern exactly, replacing translateY with translateX and globalY with globalX. Reuse noteAnimation.ts as-is.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 18+ | Component framework | Already in use |
| CSS transforms | Native | GPU-accelerated animation | 60fps performance, no layout thrash |
| useSingleLineVerovio | Local hook | Section rendering | Phase 10 output |
| computeSectionPositions | Local function | X coordinate extraction | Phase 11 output |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| noteAnimation.ts | Local | Notehead scale/color animation | On event triggers |
| interpolation.ts | Local | Timestamp computation from sync anchors | For audio-synced playback |
| eventStore.ts | Local (Zustand) | Event caching | Already wired to events |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| CSS transitions | requestAnimationFrame + manual interpolation | Manual is more control but CSS is simpler, already proven |
| Inline camera logic | useSingleLineCamera hook | Hook extraction is optional, inline simpler for now |

**Installation:**
No new packages required. All dependencies already exist in the project.

## Architecture Patterns

### Recommended Project Structure
```
src/
├── renderers/
│   ├── RegularRenderer.tsx    # Existing vertical renderer
│   └── SingleLineRenderer.tsx # NEW - horizontal renderer
├── hooks/
│   ├── useVerovio.ts          # Existing page-based hook
│   └── useSingleLineVerovio.ts # Phase 10 - section-based hook
├── lib/
│   ├── noteAnimation.ts       # Reuse as-is
│   ├── interpolation.ts       # Reuse as-is
│   └── getEvents.ts           # Phase 11 - computeSectionPositions
└── stores/
    └── eventStore.ts          # CachedEvent with globalX
```

### Pattern 1: CSS Transform Camera (Horizontal)
**What:** Use `translateX()` on a camera ref element to scroll content horizontally
**When to use:** All horizontal camera movement
**Example:**
```typescript
// Source: RegularRenderer.tsx applyCamera pattern, adapted for horizontal
function applyCameraX(targetX: number) {
  const scoreWidth = totalWidth; // From useSingleLineVerovio
  const viewportWidth = scoreRegion?.width ?? containerWidth;

  // Keep target X at viewport center (50%)
  let cameraX = targetX - viewportWidth / 2;

  // Start: flush left (cameraX >= 0)
  cameraX = Math.max(0, cameraX);

  // End: stop at right edge (don't scroll past content)
  cameraX = Math.min(cameraX, Math.max(0, scoreWidth - viewportWidth));

  if (cameraRef.current) {
    cameraRef.current.style.transform = `translateX(${-cameraX}px)`;
  }
}
```

### Pattern 2: Section Layout (Horizontal Flexbox)
**What:** Render section SVGs in a horizontal row using flexbox
**When to use:** Laying out sections from useSingleLineVerovio
**Example:**
```typescript
// Source: Adaptation of RegularRenderer page layout
<div
  ref={cameraRef}
  style={{
    display: 'flex',
    flexDirection: 'row',
    transition: 'transform 200ms ease-out',
  }}
>
  {sections.map((svg, i) => (
    <div
      key={i}
      ref={(el) => { sectionContainerRefs.current[i] = el; }}
      className="preview-score"
      style={{ flexShrink: 0 }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  ))}
</div>
```

### Pattern 3: Event Extraction with X Coordinates
**What:** Call computeSectionPositions after sections mount to get globalX values
**When to use:** After section SVGs are in DOM
**Example:**
```typescript
// Source: Phase 11 computeSectionPositions
useEffect(() => {
  if (sections.length === 0 || !scoreRef.current) return;

  requestAnimationFrame(() => {
    const containers = sectionContainerRefs.current.filter(
      (c): c is HTMLDivElement => c !== null
    );

    // Extract timing events from Verovio timemap
    const timemapEvents = extractTimemapEvents(toolkit);

    // Compute vertical positions (for compatibility)
    const withY = computeEventPositions(timemapEvents, toolkit, containers, [0]);

    // Compute horizontal positions for camera
    const withX = computeSectionPositions(withY, containers, sectionOffsets);

    setEventsInStore(withX, sections);
  });
}, [sections, toolkit, sectionOffsets]);
```

### Pattern 4: Animation Loop (Audio-Synced)
**What:** Use requestAnimationFrame to track audio.currentTime and update camera/animations
**When to use:** During playback
**Example:**
```typescript
// Source: RegularRenderer animateSync pattern, adapted for horizontal
function animateSync() {
  if (!audioRef.current) return;

  const frameInterval = 1000 / fps;
  const now = performance.now();
  if (now - lastFrameTimeRef.current < frameInterval) {
    animationFrameRef.current = requestAnimationFrame(animateSync);
    return;
  }
  lastFrameTimeRef.current = now;

  const currentTime = audioRef.current.currentTime;
  const { event, index } = getEventAtTimestamp(currentTime);

  if (!event) {
    animationFrameRef.current = requestAnimationFrame(animateSync);
    return;
  }

  // Animate noteheads for any skipped events
  if (index !== eventIndexRef.current) {
    // ... trigger animations for events prevIndex+1 to index
    eventIndexRef.current = index;
  }

  // Update camera X position using globalX
  currentXRef.current = event.globalX ?? 0;
  applyCameraX(currentXRef.current);

  if (audioRef.current.ended) {
    stop();
    return;
  }

  animationFrameRef.current = requestAnimationFrame(animateSync);
}
```

### Anti-Patterns to Avoid
- **Animating left/margin:** Use translateX only. Left/margin trigger layout recalculation and cause jank.
- **Creating new Verovio hook:** Reuse useSingleLineVerovio from Phase 10. Don't duplicate.
- **Modifying noteAnimation.ts:** Animation works on any SVG element regardless of orientation. Don't change it.
- **Using scrollLeft/scrollTo:** CSS transforms are GPU-accelerated; scroll APIs are not.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Timestamp interpolation | Custom tempo calculations | `interpolateTimestamps()` | Handles anchor-based timing, extrapolation, edge cases |
| Event extraction | Manual timemap parsing | `extractTimemapEvents()` + `computeSectionPositions()` | Already handles DOM measurement, section search |
| Notehead animation | Custom CSS animation | `animateNoteheads()` + `resetNoteheadAnimations()` | Handles chords, timing, color transitions |
| Audio element management | Custom audio state | Pattern from RegularRenderer | Handles loadedmetadata, pause, error |
| Score region clipping | Custom overflow logic | `overflow: hidden` on region container | Browser-native, works with transforms |

**Key insight:** Phase 10 and 11 built the foundation. This phase is primarily wiring and adapting RegularRenderer patterns. Almost zero new algorithms needed.

## Common Pitfalls

### Pitfall 1: Querying Elements Before DOM Mount
**What goes wrong:** computeSectionPositions returns 0 for all globalX values
**Why it happens:** Section SVGs haven't mounted when useEffect runs immediately
**How to avoid:** Wrap DOM queries in `requestAnimationFrame()` to ensure paint cycle completes
**Warning signs:** All events have globalX = 0 or undefined

### Pitfall 2: Camera Overshooting at Edges
**What goes wrong:** Empty space visible at start or end of score
**Why it happens:** Camera position not clamped to valid range
**How to avoid:**
- Start clamp: `cameraX = Math.max(0, cameraX)`
- End clamp: `cameraX = Math.min(cameraX, totalWidth - viewportWidth)`
**Warning signs:** Blank area visible left of first measure or right of last measure

### Pitfall 3: Animation Targeting Wrong Section
**What goes wrong:** Notehead animation highlights element in wrong section
**Why it happens:** SVG IDs may not be unique across sections (Verovio reuses IDs)
**How to avoid:** Pass section container to animation query, not root. Use `sectionContainerRefs.current[sectionIndex]` as root for `animateNoteheads()`
**Warning signs:** Animation appears on wrong horizontal position

### Pitfall 4: Transition Easing Causes Lag
**What goes wrong:** Camera feels "behind" the active note
**Why it happens:** ease-out easing decelerates at end, creating perceived lag
**How to avoid:** Use `ease-out` (standard) or custom `cubic-bezier(0.25, 0.1, 0.25, 1)` for responsive feel. 200ms duration is good balance.
**Warning signs:** User perceives note "pulling" camera rather than camera "tracking" note

### Pitfall 5: Missing Event Animations During Seek
**What goes wrong:** Noteheads don't animate when jumping forward in audio
**Why it happens:** Animation loop only animates "new" events from prevIndex+1 to current
**How to avoid:** When seeking, animate ALL events from prevIndex+1 to new index (existing pattern handles this)
**Warning signs:** Notes flash briefly when seeking forward

### Pitfall 6: Hardcoded Container Dimensions
**What goes wrong:** Camera calculations break when scoreRegion changes
**Why it happens:** Using fixed numbers instead of dynamic scoreRegion values
**How to avoid:** Always use `scoreRegion?.width ?? containerWidth` pattern
**Warning signs:** Camera doesn't adjust when user resizes score region

## Code Examples

Verified patterns from official sources:

### Camera Apply Function (Horizontal)
```typescript
// Source: Adapted from RegularRenderer.tsx lines 298-313
function applyCameraX(targetX: number) {
  const scoreWidth = totalWidth; // From useSingleLineVerovio
  const viewportWidth = scoreRegion?.width ?? containerWidth;

  // Center active note in viewport
  let cameraX = targetX - viewportWidth / 2;

  // Clamp to valid range
  cameraX = Math.max(0, cameraX); // Flush left at start
  cameraX = Math.min(cameraX, Math.max(0, scoreWidth - viewportWidth)); // Stop at end

  if (cameraRef.current) {
    cameraRef.current.style.transform = `translateX(${-cameraX}px)`;
  }
}
```

### Transport Controls (Identical to RegularRenderer)
```typescript
// Source: RegularRenderer.tsx lines 412-449
function play() {
  if (isPlaying || !canPlay) return;
  setIsPlaying(true);
  lastFrameTimeRef.current = performance.now();
  audioRef.current!.play().catch(console.error);
  animationFrameRef.current = requestAnimationFrame(animateSync);
}

function stop() {
  if (animationFrameRef.current) {
    cancelAnimationFrame(animationFrameRef.current);
    animationFrameRef.current = null;
  }
  if (audioRef.current && !audioRef.current.paused) {
    audioRef.current.pause();
  }
  setIsPlaying(false);
}

function reset() {
  stop();
  eventIndexRef.current = -1;
  currentXRef.current = 0; // Start at left edge
  applyCameraX(0);
  if (audioRef.current) {
    audioRef.current.currentTime = 0;
  }
  if (scoreRef.current) {
    resetNoteheadAnimations(scoreRef.current);
  }
}
```

### Interpolated Events with X Coordinates
```typescript
// Source: Adapted from RegularRenderer.tsx interpolatedEvents
const [interpolatedEvents, setInterpolatedEvents] = useState<
  (CachedEvent & { computedTimestamp: number; isAnchor: boolean; x: number })[]
>([]);

useEffect(() => {
  if (events.length === 0) {
    setInterpolatedEvents([]);
    return;
  }

  if (syncAnchors && syncAnchors.size > 0) {
    const interpolated = interpolateTimestamps(events, syncAnchors);
    // Map globalX to x for camera (mirrors globalY -> y in RegularRenderer)
    const merged = interpolated.map((evt) => ({
      ...evt,
      x: events.find(e => e.id === evt.id)?.globalX ?? 0,
    }));
    setInterpolatedEvents(merged);
  } else {
    setInterpolatedEvents([]);
  }
}, [events, syncAnchors]);
```

### CSS Transition on Camera Element
```typescript
// Source: MDN CSS transitions, RegularRenderer pattern
<div
  ref={cameraRef}
  style={{
    display: 'flex',
    flexDirection: 'row',
    width: '100%',
    pointerEvents: 'none',
    // Smooth continuous movement: 200ms ease-out
    transition: 'transform 200ms ease-out',
  }}
>
  {/* Section SVGs here */}
</div>
```

### Section Container with Vertical Centering
```typescript
// Source: CONTEXT.md decision - vertical centering within region
<div
  style={{
    position: 'absolute',
    left: scoreRegion?.x ?? 0,
    top: scoreRegion?.y ?? 0,
    width: scoreRegion?.width ?? containerWidth,
    height: scoreRegion?.height ?? containerHeight,
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center', // Vertical centering
  }}
>
  <div ref={cameraRef}>
    {/* Horizontally scrolling sections */}
  </div>
</div>
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| scrollLeft/scrollTo | CSS translateX() | ~2018 | GPU-accelerated, 60fps |
| JavaScript easing | CSS transition | Native support | Less code, better performance |
| Full score render | Section-based render | Phase 10 | Manageable DOM size |
| Verovio API for X | DOM measurement | Phase 11 | Reliable cross-section lookup |

**Deprecated/outdated:**
- `Element.scrollIntoView()` - Triggers layout, not smooth for continuous animation
- Manual pixel interpolation in JS - CSS transitions handle easing better

## Open Questions

Things that couldn't be fully resolved:

1. **Camera hook extraction**
   - What we know: Camera logic can be inline or extracted to useSingleLineCamera hook
   - What's unclear: Whether future phases benefit from hook reuse
   - Recommendation: Keep inline initially; extract later if needed (YAGNI)

2. **Exact easing curve**
   - What we know: `ease-out` (cubic-bezier(0, 0, 0.58, 1)) works well for "following"
   - What's unclear: User preference for snappier vs smoother feel
   - Recommendation: Start with 200ms ease-out (matches RegularRenderer), tunable later

3. **Section animation targeting**
   - What we know: Need to query from section container, not root
   - What's unclear: Whether event.sectionIndex is always reliable
   - Recommendation: Use sectionIndex if available, fall back to searching all sections

## Sources

### Primary (HIGH confidence)
- RegularRenderer.tsx - Existing vertical camera pattern (lines 298-313, 338-394, 412-449)
- useSingleLineVerovio.ts - Phase 10 hook, verified working
- computeSectionPositions in getEvents.ts - Phase 11 function, verified working
- noteAnimation.ts - Existing animation utilities, proven on vertical layout
- MDN CSS transition-timing-function documentation

### Secondary (MEDIUM confidence)
- [CSS Animation Performance - CSS-Tricks](https://css-tricks.com/tale-of-animation-performance/) - translateX performance patterns
- [Josh Comeau CSS Transitions Guide](https://www.joshwcomeau.com/animation/css-transitions/) - Easing function explanations
- [Easings.net](https://easings.net/) - Easing function reference

### Tertiary (LOW confidence)
- WebSearch results on teleprompter animation patterns - general guidance only

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All components exist and are verified from Phase 10/11
- Architecture: HIGH - Direct adaptation of RegularRenderer patterns
- Pitfalls: HIGH - Derived from existing codebase patterns and DOM timing issues

**Research date:** 2026-02-05
**Valid until:** 2026-03-05 (30 days - stable domain, no external dependencies)

## Claude's Discretion Recommendations

Based on the research, here are recommendations for areas left to Claude's discretion:

### Camera Hook Extraction
**Recommendation:** Keep inline initially.

Rationale:
- SingleLineRenderer is the only consumer
- Camera logic is ~20 lines
- Extracting to hook adds indirection without clear benefit yet
- Can always extract later if needed (easy refactor)

### CSS Transition Timing/Easing
**Recommendation:** Use `transition: 'transform 200ms ease-out'`

Rationale:
- Matches RegularRenderer (200ms ease-out on line 738)
- ease-out gives responsive "camera catches up" feel
- 200ms is fast enough to feel responsive, slow enough to be smooth
- Can be tuned via props if needed later

### Internal State Management
**Recommendation:** Mirror RegularRenderer exactly

Use:
- `useState` for UI state (isPlaying, containerWidth/Height, etc.)
- `useRef` for mutable values not triggering re-render (currentXRef, eventIndexRef, audioRef)
- Zustand eventStore for cached events

This matches established patterns and keeps SingleLineRenderer consistent with RegularRenderer.
