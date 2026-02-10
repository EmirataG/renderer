# Quick Task 22: Fix ScoreRegionEditor UI Styling and Button Positioning

## Problem

1. Buttons ("Done", "Use Full Background") used generic Tailwind styles (rounded-lg, bg-blue-600)
   that didn't match the app's grunge theme.
2. Buttons were positioned `absolute top-4` inside the overlay — when the image was tall and
   scrolled, they scrolled out of view.

## Fix

**File:** `src/components/ScoreRegionEditor.tsx`

1. **Fixed positioning**: Controls bar uses `fixed bottom-6 left-1/2 -translate-x-1/2` — always
   visible at bottom center of viewport regardless of scroll.
2. **Grunge styling**: Buttons use `grunge-btn` and `grunge-btn-primary` classes. Region border
   is white (not blue). Resize handles are square white. Confirmation dialog matches theme
   (no rounded corners, serif heading).

## Commit
`fcd7348`
