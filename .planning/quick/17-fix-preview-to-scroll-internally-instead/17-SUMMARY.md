# Quick Task 17: Fix Preview Scroll + Visible Export Bar

## Problem

Quick-16 used `overflow-hidden` on the preview area, which clipped the content instead
of allowing internal scrolling. The export bar at the sidebar bottom was also not visible
because the scrollable content div lacked `min-h-0`, preventing it from shrinking in the
flex column.

## Fix

**File:** `src/App.tsx`

1. Preview content wrapper: `overflow-hidden` → `overflow-auto` (scroll, don't clip)
2. Sidebar scrollable content: added `min-h-0` so `flex-1` can shrink below content size,
   keeping the export bar visible at the bottom

## Commit
`1b7b4da`
