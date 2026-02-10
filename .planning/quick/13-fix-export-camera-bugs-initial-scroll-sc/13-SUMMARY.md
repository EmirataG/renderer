# Quick Task 13: Fix Export Camera Bugs

## Root Cause

`computeEventPositions()` in `src/lib/getEvents.ts` uses `getBoundingClientRect()` to measure
system Y positions. This API returns **viewport coordinates** that include CSS transforms.

In the export, `RenderApp` wraps `RegularRenderer` in `scale(viewportWidth / 980)`. This inflates
all `localY` measurements by the scale factor (~2x for 1080p), while `pageOffsets` (from Verovio
SVG attributes) stay in pre-scale CSS pixels.

**Result:** `globalY = pageOffset(pre-scale) + localY(post-scale)` — coordinate space mismatch.
All event Y positions were ~2x too large, causing:
1. Camera scrolls past first line on frame 0 (inflated Y → cameraY doesn't clamp to 0)
2. Camera overshoots to score end on system changes (inflated Y → excessive scroll)

## Fix

**File:** `src/lib/getEvents.ts`

Detect the DOM scale factor automatically:
```typescript
const domScale = container.getBoundingClientRect().width / container.clientWidth;
```

`getBoundingClientRect().width` includes CSS transforms; `clientWidth` does not.
In preview (no scale): `domScale = 1` (no effect).
In export (with scale): `domScale = scaleFactor` (compensates correctly).

Then divide all localY measurements by domScale before adding to pageOffset:
```typescript
const localY = (sysRect.top - containerRect.top + sysRect.height / 2) / domScale;
```

## Commit
`e4d482e`
