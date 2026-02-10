# Quick Task 19: Sticky Bottom Playback Bar in SyncEditor

## Problem

Play/pause/reset buttons and scrubber in SyncEditor were below the score content.
When the score was tall, these controls were pushed offscreen.

## Fix

**File:** `src/components/SyncEditor.tsx`

- Score display: added `min-h-0` so the `flex-1` item can shrink below its content size
- Audio controls: added `flex-shrink-0` — always stays visible at bottom
- Event list: added `flex-shrink-0` — always stays visible at bottom

The flex column layout is now: header (shrink-0) | score (flex-1 min-h-0 overflow-auto) | audio bar (shrink-0) | event list (shrink-0).

## Commit
`e301898`
