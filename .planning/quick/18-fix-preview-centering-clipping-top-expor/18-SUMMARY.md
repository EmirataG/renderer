# Quick Task 18: Fix Preview Top Clipping + Export Bar Visibility

## Problem

1. `flex items-center justify-center` with `overflow-auto` clips the top of oversized
   content — the child is centered within the scroll container, pushing its top above
   the scrollable area (unreachable).
2. Sidebar aside lacked `overflow-hidden`, allowing content to potentially exceed viewport.

## Fix

**File:** `src/App.tsx`

1. Renderer content wrapper: replaced `flex items-center justify-center overflow-auto`
   with `min-h-0 overflow-auto`. Child wrapper gets `m-auto w-fit` — CSS `margin: auto`
   centers when child is smaller than container but preserves full scroll range when larger.
2. Added `overflow-hidden` on aside element to hard-constrain sidebar to viewport height.

## Commit
`3d2a55d`
