# Pitfalls: SingleLineRenderer with Horizontal Lazy Loading

**Domain:** Horizontal single-line music score rendering with section-based lazy loading
**Researched:** 2026-02-05
**Confidence:** HIGH (based on codebase analysis, previous phase lessons, and verified DOM/CSS behavior)

## Critical Pitfalls

Mistakes that cause rewrites or major functionality failures.

### Pitfall 1: Coordinate System Axis Confusion

**What goes wrong:**
The existing RegularRenderer uses Y-axis coordinates throughout: `globalY` for event positions, `translateY` for camera movement, `pageOffsets` for cumulative vertical positions. The SingleLineRenderer uses X-axis coordinates: `globalX` for event positions, `translateX` for camera movement, `sectionOffsets` for cumulative horizontal positions. Mixing these coordinate systems causes the camera to move vertically when it should move horizontally, or vice versa.

Specific failure modes:
- Event extraction code uses `getBoundingClientRect().top` instead of `.left`
- Camera `applyCamera` function applies `translateY` instead of `translateX`
- System-center calculations use `height / 2` instead of `width / 2`
- Section offset accumulation uses heights instead of widths

**Why it happens:**
Copy-paste from RegularRenderer without systematic axis substitution. The RegularRenderer has 15+ locations that reference Y-axis concepts (see `getEvents.ts` lines 83-88, 114-119; `RegularRenderer.tsx` lines 298-313, 383-385). Each must be translated to X-axis equivalents.

**Prevention:**
1. Create explicit type aliases: `type HorizontalOffset = number` vs `type VerticalOffset = number` to catch mixing at compile time
2. Use coordinate-agnostic naming in shared code: `primaryAxis` / `secondaryAxis` instead of `x` / `y`
3. Build a mapping table before implementation:
   | RegularRenderer | SingleLineRenderer |
   |-----------------|-------------------|
   | globalY | globalX |
   | translateY | translateX |
   | pageHeights | sectionWidths |
   | pageOffsets | sectionOffsets |
   | scrollHeight | scrollWidth |
   | top/bottom | left/right |
   | height | width |
4. Code review checklist: grep for `Y`, `height`, `top`, `bottom`, `vertical` in SingleLineRenderer code

**Detection:**
- Camera moves perpendicular to score flow
- Events cluster at wrong axis positions
- Section boundary calculations produce NaN or Infinity
- getBoundingClientRect returns unexpected small values (measuring wrong dimension)

**Phase to address:** SingleLineRenderer MVP (Phase 1) -- must be correct from the start

---

### Pitfall 2: Section Boundary Visual Seams

**What goes wrong:**
When rendering music as multiple horizontal sections that are stitched together, visible seams appear at section boundaries:
- Hairline gaps (1-2px white lines between sections)
- Overlapping content (notes cut off or duplicated at boundaries)
- Misaligned staff lines that don't connect across sections
- Color/style discontinuities at section edges

These seams are especially visible because horizontal single-line layouts have continuous staff lines that must appear unbroken.

**Why it happens:**
1. **SVG inline stacking gaps:** Same issue as vertical pagination (see previous PITFALLS.md Pitfall 1) but horizontal -- `display: inline-block` elements have whitespace gaps
2. **Verovio section rendering:** Each section's SVG is independent. Staff lines start/end at section edges with natural termination caps
3. **Subpixel rendering:** Section widths may not align to pixel boundaries, causing anti-aliasing artifacts at joins
4. **CSS transform rounding:** `translateX` values may round differently than section positions

**Prevention:**
1. **Eliminate inline gaps:** Set `font-size: 0; line-height: 0;` on section container OR use `display: flex` with `gap: 0`
2. **Overlap strategy:** Render sections with 1-2 measure overlap, then use CSS `clip-path` to hide the redundant portion. This ensures staff lines connect properly.
3. **Staff line extension:** Post-process SVG to extend horizontal staff lines (`g.staff > path`) by 1-2px beyond section boundaries
4. **Integer pixel positioning:** Round section offsets to whole pixels: `Math.round(sectionOffset)` before setting positions
5. **Test with colored background:** Seams are invisible on white backgrounds. Test with `background: red` behind sections to reveal gaps.

**Detection:**
- Thin vertical lines visible between sections during playback
- Staff lines appear to "jump" at section boundaries
- Zooming in reveals misaligned notation at boundaries
- Different appearance in Chrome vs Firefox (subpixel rendering differs)

**Phase to address:** Section-based Rendering (Phase 2) -- cannot be deferred; seams break the "seamless" requirement

---

### Pitfall 3: Event Position Cache Invalidation with Horizontal Layout

**What goes wrong:**
The existing event cache (from Phase 7) stores `globalY` and `pageIndex` per event. For SingleLineRenderer, events need `globalX` and `sectionIndex`. If the cache structure is reused without modification:
- Events have Y positions but camera needs X positions
- `pageIndex` lookup returns wrong section
- Cache invalidation keys (xml, scale, width) don't include horizontal-specific parameters

Worse: if a shared cache is used for both renderers, switching between RegularRenderer and SingleLineRenderer produces incorrect positions because the cache contains data for the wrong axis.

**Why it happens:**
The event cache was designed for a single renderer type. Adding a second renderer with a different coordinate system requires either separate caches or a unified cache structure that accommodates both.

**Prevention:**
1. **Renderer-type cache key:** Include `rendererType: 'regular' | 'singleLine'` in cache key
2. **Dual-position events:** Store BOTH `globalX` and `globalY` for all events (extraction computes both)
3. **Separate extraction paths:** `computeEventPositions()` for vertical, `computeEventPositionsHorizontal()` for horizontal
4. **Invalidate on renderer switch:** When user switches renderer type, invalidate the position cache (timing cache can persist)

**Detection:**
- Camera scrolls to wrong positions after switching renderers
- Events appear at incorrect horizontal positions
- `sectionIndex` is always 0 or always the last section
- Cache hit but animation targets wrong elements

**Phase to address:** Event Integration (Phase 3) -- before camera/animation integration

---

### Pitfall 4: Section Loading Race Conditions

**What goes wrong:**
With lazy section loading, sections mount/unmount as the camera moves. If animation or camera code runs during a section transition:
- `querySelector` returns null for a note that exists but is on an unmounting section
- Camera position calculation references a section that is not yet mounted
- Animation starts on a section, section unmounts mid-animation, cleanup fails
- Multiple `requestAnimationFrame` callbacks fire for the same section transition

These race conditions cause intermittent failures -- works 95% of the time but occasionally breaks during fast playback or seeking.

**Why it happens:**
DOM mounting is asynchronous (React batches state updates). Camera position calculation is synchronous. The timing between "decide section X should be visible" and "section X is actually in DOM" creates a window where queries fail.

**Prevention:**
1. **Mount-before-query guard:** Before querying DOM elements on a section, verify the section is mounted: `if (!sectionRefs.current[sectionIndex]) return`
2. **Animation section locking:** When animating notes on a section, add that section to a "locked" set that prevents unmounting until animation completes
3. **Synchronous section mounting for seek:** When `setTimestamp` is called (Puppeteer frame capture), mount required sections synchronously before animation (disable React batching with `flushSync`)
4. **Camera lookahead:** Keep 1 section ahead of camera position mounted to prevent unmounting sections that are about to become visible
5. **Debounce visibility changes:** Don't unmount a section until it has been off-screen for N frames (hysteresis)

**Detection:**
- Console errors about null elements during fast playback
- Animation occasionally fails to apply during seeking
- Puppeteer frame capture has inconsistent results
- Works perfectly at 30fps but fails at 60fps

**Phase to address:** Lazy Section Loading (Phase 4) -- the core of the lazy loading implementation

---

### Pitfall 5: Horizontal Camera Centering Math

**What goes wrong:**
The RegularRenderer keeps the active note vertically centered in the viewport:
```typescript
let cameraY = targetY - viewportHeight / 2;
```
The SingleLineRenderer should keep the active note horizontally centered:
```typescript
let cameraX = targetX - viewportWidth / 2;
```

But "centered" for horizontal layouts has different UX implications:
- Horizontal viewport is typically wider than it is tall, so "center" is farther from edges
- Music reads left-to-right, so user needs to see MORE upcoming notes (to the right) than past notes
- At score start, centering pulls content right, showing empty space on the left
- At score end, centering pushes content left, showing empty space on the right

Simply changing Y to X produces awkward positioning that doesn't match user expectations for horizontal scroll.

**Why it happens:**
The vertical centering formula is symmetric (equal space above/below). Horizontal music reading is asymmetric (need to see what's coming more than what passed). Direct axis translation produces mathematically correct but UX-incorrect behavior.

**Prevention:**
1. **Asymmetric centering:** Use `let cameraX = targetX - viewportWidth * 0.3` (30% from left, not 50%)
2. **Lookahead bias:** Center position considers not just current note but also the next N notes' positions
3. **Edge clamping:** At score start, clamp so left edge aligns with viewport left (no empty space). At score end, clamp so right edge aligns with viewport right.
4. **User testing:** The exact centering ratio (0.3, 0.4, etc.) should be validated with real users watching playback
5. **Make configurable:** Expose `cameraHorizontalBias: number` prop for future tuning

**Detection:**
- Active note feels "too far right" during playback
- User cannot see upcoming notes before they play
- Awkward empty space at beginning/end of score
- Camera feels "jerky" because it is trying to center on rapidly changing positions

**Phase to address:** Horizontal Camera (Phase 2 or 3) -- affects core user experience

---

### Pitfall 6: Verovio Single-Line Mode Configuration

**What goes wrong:**
Verovio does not have a native "single line" mode. The assumption that setting `breaks: 'none'` or a very wide `pageWidth` produces a single horizontal line may be incorrect. Verovio may:
- Still insert page breaks at arbitrary points
- Produce a single extremely wide page that causes browser rendering issues (>32767px SVG width limit in some browsers)
- Change system layout in unexpected ways when pageWidth exceeds typical values
- Lose measure alignment when all measures are on one line

**Why it happens:**
Verovio is optimized for traditional page-based layouts. Single-line rendering is an unusual use case that may not be well-tested or may have undocumented limitations.

**Prevention:**
1. **Research Verovio capabilities first:** Before implementing, verify:
   - Does `breaks: 'none'` truly prevent all breaks?
   - What is the maximum practical pageWidth?
   - Does Verovio support measure-range rendering (render measures 1-10 as one section)?
2. **Section-based workaround:** If true single-line is impossible, render multiple sections and stitch them (the planned approach). Each section is a manageable width.
3. **Test with long scores:** Try rendering a 100+ measure score as a single line. Measure SVG width, browser rendering performance, and memory usage.
4. **Fallback strategy:** If Verovio cannot produce usable single-line output, consider alternative approaches (multiple narrow pages rotated and stitched).

**Detection:**
- Unexpected line breaks in "single line" mode
- Browser freezes or crashes on long scores
- SVG width exceeds browser limits (clipping occurs)
- Verovio throws errors or warnings about pageWidth values

**Phase to address:** Research/Spike phase before implementation -- must validate Verovio capabilities

---

### Pitfall 7: Animation State Persistence Across Section Mount/Unmount

**What goes wrong:**
Notes have animation state (current scale, current color) that evolves over time (entry -> hold -> exit). When a section unmounts:
- Animation timeouts scheduled for that section's notes continue to fire (but DOM elements are gone)
- When the section remounts, notes appear at default state instead of their correct mid-animation state
- The `resetNoteheadAnimations` function cannot reset unmounted notes

This is the horizontal analog of Pitfall 1 from the virtual scrolling PITFALLS.md, but with additional complexity because sections may unmount and remount multiple times during a single playback.

**Why it happens:**
Animation state is stored in the DOM (inline styles) not in JavaScript state. When DOM elements are removed, the state is lost. The existing `noteAnimation.ts` assumes DOM elements persist for the duration of the animation.

**Prevention:**
1. **JS-side animation state:** Track animation state in a JavaScript Map: `Map<eventId, { startTime: number, phase: 'entry'|'hold'|'exit' }>`
2. **State restoration on mount:** When a section mounts, iterate its events and apply the correct animation state based on current time vs event startTime
3. **Timeout cleanup:** When a section unmounts, cancel all pending animation timeouts for events on that section. Store timeout IDs in a `Map<sectionIndex, number[]>`.
4. **Stateless animation calculation:** For Puppeteer frame capture, calculate animation state mathematically from timestamp rather than relying on DOM state (already partially implemented in `setTimestamp`)

**Detection:**
- Notes flash to default state when section remounts
- Memory leaks from orphaned timeouts (increasing memory over playback)
- Console errors from timeouts firing on missing elements
- Animation appears to "restart" when scrolling back to earlier sections

**Phase to address:** Section Animation Integration (Phase 4 or 5)

---

## Moderate Pitfalls

Mistakes that cause delays or technical debt but don't break core functionality.

### Pitfall 8: Section Width Calculation Mismatch

**What goes wrong:**
Section widths must be calculated before sections are rendered (for offset table) but Verovio's output width depends on the actual content. If estimated widths don't match rendered widths:
- Sections overlap or have gaps
- Camera calculations are incorrect
- Event globalX positions are wrong

**Why it happens:**
Unlike vertical pages where height is somewhat predictable (N systems * system height), horizontal section widths depend on note density, which varies dramatically between sections.

**Prevention:**
1. **Post-render width extraction:** Parse actual width from SVG `width` attribute after rendering (same approach as vertical pages)
2. **Section offset recalculation:** After all sections render, rebuild offset table from actual widths
3. **Avoid fixed-width assumptions:** Don't assume all sections have the same width
4. **Allow section overlap:** If sections must be a minimum width for content, accept some empty space at section ends

**Detection:**
- Visible gaps between sections
- Events appear at wrong horizontal positions relative to notes
- Camera doesn't reach the end of the score

**Phase to address:** Section-based Rendering (Phase 2)

---

### Pitfall 9: Shared Code Divergence Between Renderers

**What goes wrong:**
RegularRenderer and SingleLineRenderer share significant logic: event extraction, animation, color styling, transport controls. As SingleLineRenderer is developed, the shared code may:
- Accumulate renderer-specific branches (`if (isHorizontal) { ... }`)
- Diverge so fixes in one renderer don't propagate to the other
- Create subtle behavioral differences that confuse users switching between modes

**Why it happens:**
Natural tendency to add quick fixes rather than properly abstracting shared functionality.

**Prevention:**
1. **Extract shared hooks:** Create `useScoreAnimation()`, `useTransportControls()`, `useScoreColor()` that both renderers use
2. **Axis-agnostic interfaces:** Design event cache with `primaryAxisPosition` and `secondaryAxisPosition` rather than `globalX`/`globalY`
3. **Document divergence:** When behavior must differ, document WHY in comments
4. **Test both renderers:** Any change to shared code must be tested with both renderers

**Detection:**
- Same bug appears in one renderer but not the other
- Code review reveals copy-paste between renderers
- User reports inconsistent behavior between render modes

**Phase to address:** All phases -- ongoing discipline

---

### Pitfall 10: Section Visibility Threshold Miscalculation

**What goes wrong:**
Virtual scrolling uses viewport intersection to determine which sections are visible. If the threshold is misconfigured:
- Too conservative: Too many sections mounted, no memory savings
- Too aggressive: Sections unmount before they're fully off-screen, visible popping

For horizontal scrolling, the "viewport" is the score region width, not the full browser viewport.

**Why it happens:**
Using window width instead of score region width for visibility calculations. Or using pixel thresholds that don't account for score scale.

**Prevention:**
1. **Use score region bounds:** Visibility = intersection with `scoreRegion.width`, not `window.innerWidth`
2. **Scale-aware thresholds:** Buffer zone should be N measures * average measure width, not fixed pixels
3. **Log visibility decisions:** During development, log "mount section X because..." and "unmount section Y because..." to debug
4. **Visual debugging mode:** Render section boundaries as visible boxes during development

**Detection:**
- Memory usage higher than expected (too many sections mounted)
- Sections pop in/out visibly at screen edges
- Visibility behaves differently at different score scales

**Phase to address:** Lazy Section Loading (Phase 4)

---

## Minor Pitfalls

Mistakes that cause annoyance but are easily fixable.

### Pitfall 11: Score Border Positioning for Horizontal Layout

**What goes wrong:**
The existing `scoreBorder` feature places decorative borders at top/bottom of the score region. For SingleLineRenderer, borders might be expected on left/right instead, or may not make sense at all for horizontal single-line display.

**Prevention:**
- Hide borders for SingleLineRenderer initially (simplest)
- If borders are desired, create left/right border variants
- Document that borders are only available for RegularRenderer

**Phase to address:** Later polish phase, or explicitly out of scope

---

### Pitfall 12: Touch/Mouse Horizontal Scroll Conflict

**What goes wrong:**
Users may try to manually scroll the horizontal score with mouse/touch gestures, conflicting with the camera animation system.

**Prevention:**
- Disable native scroll on the score container (`overflow: hidden`)
- Document that horizontal position is controlled by camera only
- Consider future enhancement: allow scrubbing by dragging on score

**Phase to address:** Out of scope for v1.2 per PROJECT.md

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Verovio single-line options | No native single-line mode | Research spike first; plan section-based approach |
| Section-based rendering | Visual seams at boundaries | Overlap + clip strategy from start |
| Horizontal camera | Wrong centering feels bad | Asymmetric centering (30/70 split) |
| Event position calculation | Y/X axis confusion | Type aliases, code review checklist |
| Lazy section loading | Race conditions during transitions | Mount guards, section locking |
| Animation integration | State lost on unmount | JS-side animation state map |
| Cache integration | Wrong positions for wrong renderer | Renderer-type cache key |

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Coordinate axis confusion | LOW | Global find/replace of axis-specific terms, targeted testing |
| Section boundary seams | MEDIUM | Add overlap rendering + clip-path; 4-8 hours |
| Cache invalidation issues | LOW | Add renderer type to cache key; 2 hours |
| Section loading races | MEDIUM | Add mount guards and section locking; 4-8 hours |
| Camera centering feels wrong | LOW | Tune centering ratio; 1-2 hours |
| Verovio limitations | HIGH | May require alternative approach (multiple rotated pages); 1-2 days |
| Animation state persistence | MEDIUM | Implement JS-side state tracking; 4-8 hours |

## Sources

### Primary (HIGH confidence)
- Codebase analysis: `RegularRenderer.tsx`, `getEvents.ts`, `noteAnimation.ts`, `useVerovio.ts`, `eventStore.ts`
- Previous pitfalls research: `.planning/research/PITFALLS.md` (Efficiency Features)
- Previous phase research: `.planning/phases/08-virtual-scrolling/08-RESEARCH.md`, `.planning/phases/06-paginated-rendering-and-camera/06-RESEARCH.md`

### Secondary (MEDIUM confidence)
- [MuseScore horizontal scrolling discussions](https://musescore.org/en/node/276676) -- Community reports of playback cursor synchronization issues
- [CSS-Tricks: transform property](https://css-tricks.com/almanac/properties/t/transform/) -- Transform order and coordinate system behavior
- [MDN: getBoundingClientRect](https://developer.mozilla.org/en-US/docs/Web/API/Element/getBoundingClientRect) -- Behavior with transformed elements

### Tertiary (LOW confidence)
- WebSearch findings on horizontal virtual scrolling -- General patterns, not specific to music notation
- Competitor analysis (forScore Reflow) -- Confirms horizontal teleprompter-style rendering is a valid approach

---
*Pitfalls research for: SingleLineRenderer with horizontal layout and lazy section loading*
*Researched: 2026-02-05*
