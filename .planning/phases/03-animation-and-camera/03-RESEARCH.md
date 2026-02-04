# Phase 3: Animation and Camera - Research

**Researched:** 2026-02-04
**Domain:** Camera scrolling fix, transport polish (sync-only playback)
**Confidence:** HIGH

## Summary

Phase 3 is significantly reduced from the original roadmap. Notehead animation already works correctly and must not be changed. BPM mode was removed in Phase 2.1. Puppeteer/render mode is deferred. The remaining work is: (1) fix the camera jitter bug during system-to-system transitions, and (2) polish transport controls for sync-only mode.

The camera jitter root cause was identified through code analysis: `RegularRenderer.tsx` lines 358-368 perform linear Y-interpolation between consecutive events, even when those events are on different staff systems (e.g., Y jumps from 120px to 450px). This interpolation creates intermediate Y values that cause the camera to smoothly scroll through the gap between systems, producing the "nudge up/down" oscillation described by the user.

**Primary recommendation:** Implement system-boundary detection in the Y calculation -- when two consecutive events have a large Y delta (system jump), snap immediately to the new system's Y instead of interpolating. Keep the current `applyCamera()` function unchanged but add a CSS transition on the camera div for smooth easing on snaps.

## Standard Stack

No new libraries needed. This phase uses only existing project dependencies.

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | (existing) | Component lifecycle, refs, state | Already in project |
| CSS transitions | (native) | Camera snap easing | Browser-native, no library needed |
| requestAnimationFrame | (native) | Animation loop | Already used in project |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Verovio | (existing) | Score rendering, event extraction | Already integrated, no changes needed |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| CSS `transition` for snap | JS-driven lerp (linear interpolation) | CSS transition is simpler and offloads to GPU; JS lerp gives more control but adds complexity. CSS transition is sufficient for discrete snaps. |
| `will-change: transform` | No hint | Slight memory cost but ensures GPU compositing for transform. Already effectively used since transforms are GPU-accelerated by default. |

**Installation:**
```bash
# No new packages needed
```

## Architecture Patterns

### Recommended Project Structure
```
src/
  renderers/
    RegularRenderer.tsx   # Camera fix goes here (animateSync + applyCamera)
  lib/
    noteAnimation.ts      # DO NOT CHANGE
    animationController.ts # DO NOT CHANGE (deferred Puppeteer)
    interpolation.ts      # No changes needed
    getEvents.ts          # No changes needed
  stores/
    syncStore.ts          # No changes needed
```

### Pattern 1: System Boundary Detection (Camera Y)
**What:** Detect when consecutive events cross a staff system boundary and snap instead of interpolating.
**When to use:** In the `animateSync()` function when calculating `currentYRef.current`.
**Example:**
```typescript
// Source: Code analysis of RegularRenderer.tsx lines 358-368

// CURRENT (broken): Always interpolates Y between events
const nextEvent = interpolatedEvents[index + 1];
if (nextEvent && nextEvent.computedTimestamp > event.computedTimestamp) {
  const progress = (currentTime - event.computedTimestamp) /
    (nextEvent.computedTimestamp - event.computedTimestamp);
  currentYRef.current = event.y + (nextEvent.y - event.y) * Math.min(1, progress);
} else {
  currentYRef.current = event.y;
}

// FIX: Detect system jump and snap instead of interpolating
const SYSTEM_JUMP_THRESHOLD = 50; // pixels — tune based on actual system spacing
const nextEvent = interpolatedEvents[index + 1];
if (nextEvent && nextEvent.computedTimestamp > event.computedTimestamp) {
  const yDelta = Math.abs(nextEvent.y - event.y);
  if (yDelta > SYSTEM_JUMP_THRESHOLD) {
    // System transition: snap to current event's Y (don't interpolate through gap)
    currentYRef.current = event.y;
  } else {
    // Same system: smooth interpolation is fine
    const progress = (currentTime - event.computedTimestamp) /
      (nextEvent.computedTimestamp - event.computedTimestamp);
    currentYRef.current = event.y + (nextEvent.y - event.y) * Math.min(1, progress);
  }
} else {
  currentYRef.current = event.y;
}
```

### Pattern 2: CSS Transition for Camera Snap Easing
**What:** Apply a CSS `transition` on the camera container's `transform` property so that snaps are eased rather than instant.
**When to use:** On the `cameraRef` div element.
**Example:**
```typescript
// Source: CSS transitions best practices (MDN)

// Add to the camera div's style:
// transition: transform 200ms ease-out;

// This means:
// - Same-system Y changes: smooth micro-adjustments (CSS handles interpolation)
// - System jumps: camera eases to new position over 200ms instead of instant snap
// - The JS only sets the target Y; the browser handles the smooth transition

// Alternative: use will-change for GPU hint
// will-change: transform;
```

### Pattern 3: Snap-Then-Ease for System Transitions
**What:** When a system boundary is detected, immediately update the target Y to the new system position and let CSS transition handle the visual easing.
**When to use:** When `event.y` jumps to a significantly different value.
**Example:**
```typescript
// The camera div gets CSS transition:
//   transition: transform 250ms ease-out;
//
// Then in animateSync():
// - When event changes to a new system, currentYRef jumps immediately
// - applyCamera() sets translateY to the new value
// - CSS transition smoothly animates from old to new position
// - Result: decisive snap with a brief 250ms ease
//
// Key: The transition duration should be SHORT (150-300ms)
// to feel "decisive" per user requirement, not "gradual"
```

### Anti-Patterns to Avoid
- **Interpolating Y across system boundaries:** This is the current bug. Linear interpolation between Y=120 and Y=450 creates camera movement through the empty space between systems.
- **Using JS-driven lerp for camera position:** Adds complexity (tracking lerp state, convergence threshold) when CSS `transition` achieves the same result with zero code.
- **Large transition durations (>400ms):** User wants "decisive" snaps. Long easing makes it feel sluggish.
- **Modifying noteAnimation.ts:** Animation is working -- do not touch.
- **Touching Puppeteer/animationController code:** Deferred to future phase.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Smooth camera easing | JS-based lerp/spring animation | CSS `transition: transform` on camera div | Browser GPU handles interpolation; zero JS complexity |
| System boundary detection | Complex musical structure analysis | Simple Y-delta threshold between consecutive events | Events already have Y positions from DOM; a large jump = system change |
| Frame-rate throttling | Custom timer logic | Already exists in `animateSync()` via `frameInterval` check | Don't duplicate; the existing throttle is correct |

**Key insight:** The fix is small -- a threshold check and a CSS property. The hard part is choosing the right threshold value and transition timing, which require testing with real scores.

## Common Pitfalls

### Pitfall 1: Threshold Value Too Small or Too Large
**What goes wrong:** If the SYSTEM_JUMP_THRESHOLD is too small, normal within-system Y variations (notes on different staves, ledger lines) trigger false system jumps. If too large, actual system transitions are missed and interpolation continues through the gap.
**Why it happens:** System spacing depends on Verovio's layout, which varies by score complexity and scale setting.
**How to avoid:** Analyze actual Y values from extracted events on test scores. A system typically spans 80-200px of vertical space, so a threshold of ~50px should safely distinguish within-system movement from system jumps. Test with multiple scores at different scale settings.
**Warning signs:** Camera snaps within a single system line (threshold too small) or still jitters at system transitions (threshold too large).

### Pitfall 2: CSS Transition Conflicts with Per-Frame Updates
**What goes wrong:** If `animateSync()` updates `translateY` every frame and there's a CSS transition, the transition restarts every frame, causing stuttering.
**Why it happens:** CSS transition triggers on every property change. If the animation loop sets `translateY(-100px)` then `translateY(-101px)` next frame, the transition restarts.
**How to avoid:** Only update `applyCamera()` when the target Y actually changes meaningfully. Within the same system, small Y changes are fine without transition (they're tiny). For system jumps, the transition handles the easing. Consider applying the CSS transition class only during system transitions and removing it for within-system micro-adjustments.
**Warning signs:** Camera movement feels "laggy" or "behind" during normal within-system scrolling.

### Pitfall 3: Regression in setTimestamp (Puppeteer Path)
**What goes wrong:** The `setTimestamp` callback (lines 488-622) has its own Y interpolation logic duplicated from `animateSync`. Fixing one without the other creates inconsistency.
**Why it happens:** The Puppeteer path is separate from the live playback path.
**How to avoid:** Per CONTEXT.md, Puppeteer is deferred. However, the `setTimestamp` callback is also used for the `window.animationController` exposed to any consumer. Apply the same system-jump threshold logic to `setTimestamp`'s Y calculation to keep consistency, even though Puppeteer is not the current focus.
**Warning signs:** Live playback looks correct but `window.animationController.setTimestamp()` produces different camera positions.

### Pitfall 4: Breaking Notehead Animation
**What goes wrong:** Changing camera-related code accidentally alters the notehead animation behavior.
**Why it happens:** The `animateSync()` function handles both camera AND notehead animation in the same function.
**How to avoid:** The notehead animation trigger (lines 343-356) is cleanly separated from the Y calculation (lines 358-368). Only modify the Y calculation block. Run verification: notehead scale, color, timing, chord behavior must be identical before and after.
**Warning signs:** Notes stop animating, animate at wrong times, or have different visual appearance.

### Pitfall 5: Transport State Leaks After Stop/Reset
**What goes wrong:** After pressing Stop then Play again, the camera starts at the wrong position or noteheads have stale animation state.
**Why it happens:** `eventIndexRef.current` or `currentYRef.current` not properly reset.
**How to avoid:** Verify `reset()` (line 419) properly resets both `eventIndexRef` and `currentYRef`. Test the sequence: Play -> Stop -> Play, and Play -> Reset -> Play.
**Warning signs:** Camera jumps to wrong position on resume; notes not animating after reset+play.

## Code Examples

Verified patterns from the actual codebase:

### Current Camera System (RegularRenderer.tsx)
```typescript
// Source: /src/renderers/RegularRenderer.tsx lines 282-297
function applyCamera(targetY: number) {
  const scoreHeight = osmdRef.current?.scrollHeight ?? 0;
  const viewportHeight = scoreRegion?.height ?? containerHeight;
  let cameraY = targetY - viewportHeight / 2;
  cameraY = Math.max(0, cameraY);
  cameraY = Math.min(cameraY, Math.max(0, scoreHeight - viewportHeight));
  if (cameraRef.current) {
    cameraRef.current.style.transform = `translateY(${-cameraY}px)`;
  }
}
```

### Current Y Interpolation (The Bug - RegularRenderer.tsx)
```typescript
// Source: /src/renderers/RegularRenderer.tsx lines 358-368
// BUG: Interpolates between systems, causing jitter
const nextEvent = interpolatedEvents[index + 1];
if (nextEvent && nextEvent.computedTimestamp > event.computedTimestamp) {
  const progress =
    (currentTime - event.computedTimestamp) /
    (nextEvent.computedTimestamp - event.computedTimestamp);
  currentYRef.current =
    event.y + (nextEvent.y - event.y) * Math.min(1, progress);
} else {
  currentYRef.current = event.y;
}
```

### Current Transport Controls (RegularRenderer.tsx)
```typescript
// Source: /src/renderers/RegularRenderer.tsx lines 383-434

// Transport gating: Play requires audio + first and last anchors
const hasAudio = !!audioUrl && !!audioRef.current;
const firstEventId = events.length > 0 ? events[0].id : null;
const lastEventId = events.length > 0 ? events[events.length - 1].id : null;
const hasFirstAnchor = !!(firstEventId && syncAnchors?.has(firstEventId));
const hasLastAnchor = !!(lastEventId && syncAnchors?.has(lastEventId));
const canPlay = hasAudio && hasFirstAnchor && hasLastAnchor;

function play() {
  if (isPlaying || !canPlay) return;
  setIsPlaying(true);
  lastFrameTimeRef.current = performance.now();
  audioRef.current!.play().catch(console.error);
  animationFrameRef.current = requestAnimationFrame(animateSync);
}

function stop() { /* pauses audio, cancels rAF */ }
function reset() { /* stops, resets index/-1, resets Y, resets audio.currentTime */ }
```

### Notehead Animation (DO NOT CHANGE)
```typescript
// Source: /src/lib/noteAnimation.ts
// This function is working correctly -- DO NOT MODIFY
export function animateNoteheads(root, svgIds, options) {
  // CSS transition-based scale + color animation on g.notehead elements
  // Entry: ease-out scale up + color change
  // Exit: setTimeout -> ease-in scale down + color restore
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| OSMD rendering | Verovio rendering | Phase 1 (2026-02-03) | SVG structure changed (`<use>` elements in `g.notehead`) |
| OSMD cursor for events | Verovio timemap for events | Phase 2 (2026-02-03) | Event Y positions now from `getBoundingClientRect` |
| BPM + Sync modes | Sync-only mode | Phase 2.1 (2026-02-04) | BPM animation loop removed entirely |
| Continuous Y interpolation | (needs fix) System-aware snapping | Phase 3 (this phase) | Camera should detect system boundaries |

**Deprecated/outdated:**
- BPM mode: Permanently removed in Phase 2.1. No BPM slider, no BPM animation loop.
- OSMD-based event extraction: Replaced by Verovio timemap. The old `getEvents()` function using OSMD cursor still exists in `getEvents.ts` but is unused.

## Root Cause Analysis: Camera Jitter

### The Bug

The camera "starts going up and down tiny nudges" during playback near system transitions.

### Root Cause

In `RegularRenderer.tsx` `animateSync()` (lines 358-368), the Y position is linearly interpolated between the current event and the next event:

```
currentY = event.y + (nextEvent.y - event.y) * progress
```

When two consecutive events are on different staff systems:
- `event.y` = 120 (bottom of system 1)
- `nextEvent.y` = 450 (top of system 2)
- As `progress` goes from 0 to 1, `currentY` smoothly traverses 120 -> 450

This creates a continuous camera drift through the empty space between systems. Combined with the `applyCamera()` centering logic (which offsets by `viewportHeight/2` and clamps), small progress changes near the transition point cause the camera to oscillate between two clamped positions, producing the visible jitter.

### The Fix

Detect when consecutive events cross a system boundary (Y delta > threshold) and use the current event's Y without interpolation. The next frame that lands on the new system's first event will snap the camera to the new Y position. Adding a CSS `transition` on the camera div provides smooth easing for the snap.

### Affected Code Locations

1. **Primary:** `RegularRenderer.tsx` lines 358-368 (animateSync Y interpolation)
2. **Secondary:** `RegularRenderer.tsx` lines 514-528 (setTimestamp Y interpolation -- same logic duplicated for Puppeteer path)
3. **Style:** `RegularRenderer.tsx` line 718 (cameraRef div -- add CSS transition)

## Transport Controls Assessment

### Current State

Transport controls (Play/Pause/Reset) are functional for sync-only mode:

- **Play gating** works correctly: requires audio + first AND last sync anchors (line 389)
- **Play** starts audio and rAF loop (line 397-403)
- **Stop** (labeled "Pause") cancels rAF and pauses audio (lines 405-417)
- **Reset** stops playback, resets `eventIndexRef` to -1, resets `currentYRef`, resets `audio.currentTime`, resets notehead animations (lines 419-434)
- **Transport message** shows appropriate guidance when requirements not met (lines 391-395)

### Identified Polish Items

1. **Button labeling:** "Stop" function is labeled "Pause" in the UI (line 803). This is correct behavior (it pauses audio, doesn't stop/reset). No change needed.
2. **Resume from pause:** After clicking Pause then Play, playback resumes from the paused position. This works because `audio.currentTime` is preserved. Verified correct.
3. **No progress indicator:** There is no playback progress bar or time display in the RegularRenderer transport bar. The SyncEditor has one (scrubber + time display), but RegularRenderer does not. This is a potential polish item but may be intentional for the "preview" mode.
4. **Audio ended handling:** `animateSync()` checks `audioRef.current.ended` (line 373) and calls `stop()`. This stops playback but does not reset to beginning. User must click Reset to return to start. This is standard behavior.
5. **Transport gating UX:** When requirements aren't met, buttons are disabled with a helpful message. This is clean.

### Verdict

Transport controls are functional and clean for sync-only mode. No critical bugs found. The only potential polish is adding a progress indicator, but this was not mentioned in the user's requirements and the SyncEditor already provides this functionality.

## Open Questions

Things that couldn't be fully resolved:

1. **Optimal SYSTEM_JUMP_THRESHOLD value**
   - What we know: System spacing depends on Verovio scale and score complexity. At scale=40 (default), systems are typically 150-300px apart in the rendered SVG.
   - What's unclear: The exact threshold that works for all scores at all scale settings.
   - Recommendation: Start with 50px threshold. Test with 2-3 real scores at different scales. May need to calculate threshold dynamically based on average system height from the extracted events.

2. **CSS transition duration for camera snap**
   - What we know: User wants "decisive" snaps, not gradual. 150-300ms range is typical for snappy transitions.
   - What's unclear: Exact value that feels right with this particular score display.
   - Recommendation: Start with 200ms ease-out. Tune by visual testing. Keep under 300ms for decisive feel.

3. **CSS transition interference with within-system micro-updates**
   - What we know: If CSS transition is always active, tiny Y changes within a system could feel laggy.
   - What's unclear: Whether the within-system Y changes are small enough that CSS transition doesn't noticeably delay them.
   - Recommendation: Test with always-on transition first. If within-system movement feels laggy, use a conditional approach: add/remove a CSS class for transition only during system jumps.

## Sources

### Primary (HIGH confidence)
- Direct code analysis of `/src/renderers/RegularRenderer.tsx` (camera, animation loop, transport)
- Direct code analysis of `/src/lib/noteAnimation.ts` (notehead animation -- confirmed working)
- Direct code analysis of `/src/lib/animationController.ts` (Puppeteer path -- deferred)
- Direct code analysis of `/src/lib/interpolation.ts` (timestamp interpolation)
- Direct code analysis of `/src/lib/getEvents.ts` (event extraction with Y positions)
- Direct code analysis of `/src/stores/syncStore.ts` (anchor state management)
- Phase planning docs: `.planning/STATE.md`, `.planning/ROADMAP.md`
- Phase context: `.planning/phases/03-animation-and-camera/03-CONTEXT.md`

### Secondary (MEDIUM confidence)
- [CSS transitions - MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Transitions/Using) - CSS transition syntax and easing functions
- [CSS-Tricks ease-out/ease-in guide](https://css-tricks.com/ease-out-in-ease-in-out/) - Easing function selection guidance
- [requestAnimationFrame explained - DEV Community](https://dev.to/tawe/requestanimationframe-explained-why-your-ui-feels-laggy-and-how-to-fix-it-3ep2) - rAF best practices for smooth animation

### Tertiary (LOW confidence)
- [model-viewer GPU jitter discussion](https://github.com/google/model-viewer/discussions/4226) - Similar jitter pattern from scroll-driven animation

## Metadata

**Confidence breakdown:**
- Root cause analysis: HIGH - Direct code reading identified exact lines and mechanism
- Fix approach (system detection): HIGH - Standard pattern; threshold-based boundary detection
- Fix approach (CSS transition easing): MEDIUM - Standard technique but interaction with per-frame updates needs testing
- Transport assessment: HIGH - Direct code reading, all paths traced
- Threshold/timing values: LOW - Require empirical testing with real scores

**Research date:** 2026-02-04
**Valid until:** 2026-03-06 (30 days -- stable domain, no moving dependencies)
