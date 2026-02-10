# Quick Task 16: Fix Preview Overflow + Sticky Export Bar

## Problem

Tall background images made the preview area overflow `h-screen`, causing the
entire page to scroll and revealing a black void beneath the inspector sidebar.
The Export button was buried at the bottom of the inspector, requiring scrolling.

## Changes

**File:** `src/App.tsx`

1. **Preview overflow fix**: Added `overflow-hidden` to the renderer content wrapper
   (`flex-1 flex items-center justify-center overflow-hidden`) so tall content is
   clipped to the available viewport height.

2. **Sidebar layout restructure**: Changed aside from `overflow-auto` (whole sidebar scrolls)
   to a flex column with:
   - Header (`flex-shrink-0`)
   - Scrollable content (`flex-1 overflow-auto grunge-scrollbar`)
   - Export bar (`flex-shrink-0 border-t`) — always visible at bottom

3. **Export bar**: Moved the entire Export section out of the scrollable area into
   a sticky bottom bar with `border-t border-neutral-800` separator.

## Commit
`181ad3d`
