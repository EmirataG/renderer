---
phase: quick-23
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/renderers/RegularRenderer.tsx
autonomous: true
must_haves:
  truths:
    - "Export video scrolling matches preview smoothness"
    - "Camera easing curve in export matches CSS ease-out exactly"
    - "Sub-frame interpolation between events produces continuous Y motion"
  artifacts:
    - path: "src/renderers/RegularRenderer.tsx"
      provides: "Fixed setTimestamp camera simulation"
  key_links:
    - from: "setTimestamp"
      to: "cameraRef translateY"
      via: "cubic-bezier evaluation matching CSS ease-out"
      pattern: "cubicBezier.*0.*0.*0\\.58.*1"
---

<objective>
Fix export video scrolling to match preview smoothness.

**Root cause analysis:**

The preview uses CSS `transition: transform 200ms ease-out` which the browser
interpolates natively at paint time. In render mode (export), CSS transitions are
disabled and `setTimestamp()` simulates the transition manually. Two problems:

1. **Easing curve mismatch:** The export uses `1 - Math.pow(1 - t, 3)` (cubic power
   function) but CSS `ease-out` is `cubic-bezier(0, 0, 0.58, 1)` -- a completely
   different curve. The power function decelerates too aggressively at the end,
   creating a visible "snap" at the end of each scroll transition.

2. **No inter-event Y interpolation:** In preview, the camera Y jumps discretely at
   system boundaries, and CSS transition smooths it. In export, `setTimestamp` only
   reads the current event's Y -- it does NOT interpolate between the previous
   event's Y and the next event's Y within the transition window. This means the
   camera position is computed identically for all frames within a system, then
   jumps at system boundaries, relying solely on the simulated transition to smooth
   it. The simulation works but with the wrong easing curve.

**Fix:** Replace the power-function approximation with a proper cubic-bezier evaluator
that exactly matches CSS `ease-out` = `cubic-bezier(0, 0, 0.58, 1)`.

Purpose: Export videos should scroll as smoothly as the in-app preview.
Output: Updated RegularRenderer.tsx with correct easing.
</objective>

<execution_context>
@.planning/quick/23-scrolling-in-the-exported-videos-is-not-/23-PLAN.md
</execution_context>

<context>
@src/renderers/RegularRenderer.tsx (lines 570-608: setTimestamp camera simulation)
@src/lib/animationController.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Replace power-curve approximation with exact CSS cubic-bezier evaluator</name>
  <files>src/renderers/RegularRenderer.tsx</files>
  <action>
In `setTimestamp()` inside RegularRenderer.tsx, the camera transition simulation
(around lines 591-602) currently uses:

```js
const eased = 1 - Math.pow(1 - t, 3); // cubic ease-out ≈ CSS ease-out
```

This is NOT equivalent to CSS `ease-out`. Replace it with a proper cubic-bezier
evaluator that matches `cubic-bezier(0, 0, 0.58, 1)` exactly.

**Implementation:**

Add a `cubicBezier` helper function INSIDE the RegularRenderer component (or as a
module-level function above it) that evaluates a cubic-bezier curve at parameter t.
The standard approach is Newton-Raphson iteration to solve for the t parameter
on the X axis, then evaluate Y:

```typescript
/**
 * Attempt to match CSS cubic-bezier(x1, y1, x2, y2) evaluation.
 * Uses Newton-Raphson to find the curve parameter for a given X (time),
 * then evaluates Y (progress) at that parameter.
 */
function cubicBezierEase(x1: number, y1: number, x2: number, y2: number, t: number): number {
  // Clamp input
  if (t <= 0) return 0;
  if (t >= 1) return 1;

  // Coefficients for the X cubic polynomial: X(s) = ax*s^3 + bx*s^2 + cx*s
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;

  // Coefficients for the Y cubic polynomial
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;

  // Newton-Raphson to solve X(s) = t for s
  let s = t; // initial guess
  for (let i = 0; i < 8; i++) {
    const xVal = ((ax * s + bx) * s + cx) * s - t;
    const dxVal = (3 * ax * s + 2 * bx) * s + cx;
    if (Math.abs(dxVal) < 1e-6) break;
    s -= xVal / dxVal;
  }
  // Clamp s to [0,1]
  s = Math.max(0, Math.min(1, s));

  // Evaluate Y at s
  return ((ay * s + by) * s + cy) * s;
}
```

Then create a convenience wrapper for CSS ease-out:

```typescript
/** CSS ease-out = cubic-bezier(0, 0, 0.58, 1) */
function cssEaseOut(t: number): number {
  return cubicBezierEase(0, 0, 0.58, 1, t);
}
```

In the `setTimestamp` function, replace:
```js
const eased = 1 - Math.pow(1 - t, 3); // cubic ease-out ≈ CSS ease-out
```
with:
```js
const eased = cssEaseOut(t);
```

Keep everything else in setTimestamp the same -- the transition detection,
TRANSITION_SEC = 0.2, from/target tracking, and the final camera application
are all correct.
  </action>
  <verify>
Build succeeds: `cd /Users/emirahmed/Desktop/Manuscript/renderer && npm run build`

Manual check: run a test export and compare scrolling smoothness with preview.
The scroll transitions should now have the same feel -- smooth deceleration
matching the browser's native CSS ease-out curve, without the "snap" at the
end of each system transition.
  </verify>
  <done>
Export camera easing uses exact CSS cubic-bezier(0, 0, 0.58, 1) evaluation
instead of power-curve approximation. Scroll transitions in exported video
match the preview's native CSS ease-out behavior.
  </done>
</task>

</tasks>

<verification>
- `npm run build` succeeds with no TypeScript errors
- Export a test video and compare scrolling with preview playback
- Camera transitions should feel identical between preview and export
</verification>

<success_criteria>
Export video scrolling matches preview smoothness. The camera easing curve
is mathematically identical to CSS ease-out (cubic-bezier(0, 0, 0.58, 1)).
</success_criteria>

<output>
After completion, create `.planning/quick/23-scrolling-in-the-exported-videos-is-not-/23-SUMMARY.md`
</output>
