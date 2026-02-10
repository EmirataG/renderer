---
phase: quick-25
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/renderers/RegularRenderer.tsx
  - src/lib/noteAnimation.ts
autonomous: true
must_haves:
  truths:
    - "Export frames only mutate DOM elements for events in the active animation window (typically 5-15 events), not all noteheads in the score"
    - "Events that exit the active window are reset individually (0-2 per frame), not via global querySelectorAll blast"
    - "First frame works correctly with no previous state"
    - "Preview mode (non-renderMode) is completely unaffected"
    - "Visual output is identical to the current approach -- same colors, same scale, same timing"
  artifacts:
    - path: "src/lib/noteAnimation.ts"
      provides: "resetEventNoteheads helper function"
      contains: "resetEventNoteheads"
    - path: "src/renderers/RegularRenderer.tsx"
      provides: "Delta-based setTimestamp with prevActiveRange ref"
      contains: "prevActiveRange"
  key_links:
    - from: "src/renderers/RegularRenderer.tsx"
      to: "src/lib/noteAnimation.ts"
      via: "import resetEventNoteheads"
      pattern: "resetEventNoteheads"
---

<objective>
Replace the O(N) reset-all + reapply-from-zero notehead animation strategy in `setTimestamp` (export/render mode) with a delta-based approach that only touches changed DOM elements per frame.

Purpose: The current approach queries ALL noteheads in the entire score DOM every frame (`resetNoteheadAnimations` hits every `g.notehead`, `g.stem`, `g.accid`, `g.flag`, `g.dots`, `g.artic`) then loops from event 0 to currentIndex re-applying styles. For a 500-notehead score at 30fps, this is 500+ querySelectorAll + style mutations per frame. The delta approach tracks the active animation window (typically 5-15 events) and only resets the 0-2 events that fall off per frame.

Output: Modified `setTimestamp` in RegularRenderer.tsx, new `resetEventNoteheads` helper in noteAnimation.ts.
</objective>

<execution_context>
@/Users/emirahmed/.claude/get-shit-done/workflows/execute-plan.md
@/Users/emirahmed/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/renderers/RegularRenderer.tsx (lines 534-755: setTimestamp callback and interpolateColor)
@src/lib/noteAnimation.ts (lines 119-154: resetNoteheadAnimations function)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add resetEventNoteheads helper to noteAnimation.ts</name>
  <files>src/lib/noteAnimation.ts</files>
  <action>
Add a new exported function `resetEventNoteheads` to `src/lib/noteAnimation.ts` after the existing `resetNoteheadAnimations` function. This function resets styles for a SINGLE event's SVG elements (the inverse of the per-event apply block in setTimestamp).

Signature:
```ts
export function resetEventNoteheads(
  root: HTMLElement,
  svgIds: string[],
  colorFullNote: boolean,
): void
```

Implementation:
- For each id in `svgIds`:
  - `root.querySelector<SVGGElement>(`#${CSS.escape(id)}`)` -- if not found, continue
  - Query `g.notehead` elements within the stavenote:
    - Set `nh.style.transform = "scale(1)"`
    - Set `nh.style.transition = ""`
    - For each `use` child: `removeProperty("fill")`, `removeProperty("stroke")`, `removeProperty("color")`
  - If `colorFullNote` is true, query `g.stem, g.accid, g.flag, g.dots, g.artic` within the stavenote:
    - `removeProperty("fill")`, `removeProperty("stroke")`, `removeProperty("color")`, `transition = ""`
    - For each `path, use, polygon, line` child: same removeProperty calls

This mirrors the reset logic from `resetNoteheadAnimations` but scoped to a single event's DOM nodes instead of the entire score root. The querySelector patterns (`g.notehead`, `use`, `g.stem, g.accid, g.flag, g.dots, g.artic`, `path, use, polygon, line`) must exactly match those in the existing `resetNoteheadAnimations` and the apply block in `setTimestamp` (lines 695-737 of RegularRenderer.tsx).
  </action>
  <verify>
`npx tsc --noEmit` passes (no type errors). Grep for `resetEventNoteheads` confirms it exists in noteAnimation.ts.
  </verify>
  <done>
`resetEventNoteheads` is exported from `src/lib/noteAnimation.ts` and accepts (root, svgIds, colorFullNote) to reset a single event's notehead/stem/accid/flag/dots/artic styles.
  </done>
</task>

<task type="auto">
  <name>Task 2: Replace setTimestamp with delta-based animation in RegularRenderer.tsx</name>
  <files>src/renderers/RegularRenderer.tsx</files>
  <action>
Three changes to RegularRenderer.tsx:

**A. Add import and ref (near line 17 and ~line 147):**

1. Add `resetEventNoteheads` to the import from `../lib/noteAnimation` (line 17 already imports `resetNoteheadAnimations`).

2. Add a ref after the existing camera transition refs (around line 151):
```ts
const prevActiveRangeRef = useRef<{ start: number; end: number } | null>(null);
```

**B. Replace the notehead animation section of setTimestamp (lines 648-743):**

Replace the block from `// For frame capture, we need to calculate...` through `void scoreRef.current.offsetHeight;` with the delta-based approach:

```ts
// For frame capture: delta-based animation (only touch changed DOM elements)
const holdSeconds = activeNoteheadAnimationHoldMs / 1000;
const exitSeconds = activeNoteheadAnimationExitMs / 1000;
const animDuration = holdSeconds + exitSeconds;

if (!scoreRef.current) return;

// Find firstActiveIndex: scan backwards from currentIndex to find the
// earliest event still within the animation window
let firstActiveIndex = currentIndex;
while (firstActiveIndex > 0) {
  const prevEvent = events[firstActiveIndex - 1];
  const timeSincePrev = seconds - prevEvent.computedTimestamp;
  if (timeSincePrev >= animDuration || !prevEvent.svgIds?.length) {
    break;
  }
  firstActiveIndex--;
}
// Also skip forward past events with no svgIds at the start
while (firstActiveIndex < currentIndex && !events[firstActiveIndex].svgIds?.length) {
  firstActiveIndex++;
}

const prev = prevActiveRangeRef.current;

// Reset events that fell out of the active window
// These are events that were in prev range but are now before firstActiveIndex
if (prev !== null) {
  const resetEnd = Math.min(prev.end, firstActiveIndex - 1);
  for (let i = prev.start; i <= resetEnd; i++) {
    const evt = events[i];
    if (evt.svgIds?.length) {
      resetEventNoteheads(scoreRef.current, evt.svgIds, colorFullNote);
    }
  }
}

// Apply/update styles for the active window [firstActiveIndex, currentIndex]
for (let i = firstActiveIndex; i <= currentIndex; i++) {
  const event = events[i];
  const eventTime = event.computedTimestamp;
  const timeSinceEvent = seconds - eventTime;

  if (timeSinceEvent < 0 || !event.svgIds?.length) continue;

  let scale: number;
  let color: string | undefined;

  if (timeSinceEvent < holdSeconds) {
    // Hold period: full scale and color
    scale = activeNoteheadScale;
    color = activeNoteheadColor;
  } else if (timeSinceEvent < animDuration) {
    // Exit period: interpolate scale and color using ease-in curve
    const exitProgress = (timeSinceEvent - holdSeconds) / exitSeconds;
    const easedProgress = Math.pow(exitProgress, 1.675);
    scale = activeNoteheadScale + (1 - activeNoteheadScale) * easedProgress;
    color = interpolateColor(activeNoteheadColor, scoreColor, easedProgress);
  } else {
    // Animation complete -- this event shouldn't be in the window but
    // guard defensively. Reset it and continue.
    resetEventNoteheads(scoreRef.current!, event.svgIds, colorFullNote);
    continue;
  }

  // Apply animation directly to SVG elements (no CSS transitions)
  for (const id of event.svgIds) {
    const stavenote = scoreRef.current.querySelector<SVGGElement>(
      `#${CSS.escape(id)}`,
    );
    if (!stavenote) continue;

    const noteheads = stavenote.querySelectorAll<SVGGElement>("g.notehead");
    noteheads.forEach((nh) => {
      nh.style.transformBox = "fill-box";
      nh.style.transformOrigin = "center";
      nh.style.transition = "";
      nh.style.transform = `scale(${scale})`;

      if (color) {
        const shapes = nh.querySelectorAll<SVGGraphicsElement>("use");
        shapes.forEach((shape) => {
          shape.style.fill = color!;
          shape.style.stroke = color!;
          shape.style.color = color!;
        });
      }
    });

    if (color && colorFullNote) {
      const extras = stavenote.querySelectorAll<SVGGraphicsElement>(
        "g.stem, g.accid, g.flag, g.dots, g.artic"
      );
      extras.forEach((group) => {
        group.style.fill = color!;
        group.style.stroke = color!;
        group.style.color = color!;
        group.querySelectorAll<SVGGraphicsElement>("path, use, polygon, line").forEach((child) => {
          child.style.fill = color!;
          child.style.stroke = color!;
          child.style.color = color!;
        });
      });
    }
  }
}

// Store current active range for next frame's delta
prevActiveRangeRef.current = { start: firstActiveIndex, end: currentIndex };

// Force reflow to ensure CSS styles are applied synchronously
// before Puppeteer takes the screenshot
void scoreRef.current.offsetHeight;
```

**C. Reset prevActiveRangeRef when resetNoteheadAnimations is called (lines 247, 522):**

After each existing `resetNoteheadAnimations(scoreRef.current)` call (lines 247 and 522), add:
```ts
prevActiveRangeRef.current = null;
```
This ensures the delta tracker is cleared when a full reset happens (e.g., on stop/reset or re-extraction), so the next setTimestamp call does a clean apply pass.

**Key invariants to preserve:**
- The `resetNoteheadAnimations` import must remain (it is still used at lines 247 and 522 for preview mode resets)
- The camera positioning code above the notehead section (lines 605-645) is untouched
- The `eventIndexRef.current = currentIndex` and `currentYRef.current = eventY` assignments (line 645-646) remain
- The useCallback dependency array (lines 745-754) stays the same -- no new deps needed since `prevActiveRangeRef` is a ref (stable identity)
  </action>
  <verify>
1. `npx tsc --noEmit` passes.
2. Grep for `resetNoteheadAnimations(scoreRef.current)` still appears at lines ~247 and ~522 (preview mode resets preserved).
3. Grep for `prevActiveRangeRef` shows the ref declaration, the delta logic in setTimestamp, and the null resets after full-reset calls.
4. Grep confirms `resetEventNoteheads` is imported and called in the delta reset loop.
5. The old pattern `for (let i = 0; i <= currentIndex; i++)` no longer exists in setTimestamp.
  </verify>
  <done>
The `setTimestamp` callback uses delta-based animation: tracks `prevActiveRangeRef`, resets only fallen-off events via `resetEventNoteheads`, and applies styles only to the active window [firstActiveIndex, currentIndex]. The global `resetNoteheadAnimations` call is removed from setTimestamp. Preview mode is unaffected.
  </done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` -- no type errors
2. Build succeeds: `npm run build` (or equivalent)
3. Manual check: The setTimestamp function no longer calls `resetNoteheadAnimations` -- only the preview-mode reset paths (lines ~247 and ~522) still call it
4. The apply block logic (scale, color interpolation, CSS.escape selectors, notehead/stem/accid/flag/dots/artic queries) is identical to the original -- only the iteration range changed
</verification>

<success_criteria>
- setTimestamp touches O(active_window) DOM elements per frame (typically 5-15) instead of O(total_noteheads) (hundreds)
- Events exiting the active window are reset individually (0-2 per frame) via resetEventNoteheads
- First frame with null prevActiveRangeRef does a clean apply with no stale reset
- Full-reset paths (stop, re-extraction) clear prevActiveRangeRef to null
- Visual output is byte-identical to current approach (same colors, scale, timing math)
- Preview mode completely unaffected (no renderMode guard needed since setTimestamp is only called in render mode by Puppeteer)
</success_criteria>

<output>
After completion, create `.planning/quick/25-delta-based-notehead-animation-in-export/25-SUMMARY.md`
</output>
