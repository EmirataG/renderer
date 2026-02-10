# Quick Task 20: Portal Transport Bar to Sticky Bottom of Preview

## Problem

Play/Pause/Reset buttons were rendered inside RegularRenderer below the score content.
When the background image was tall, the buttons got pushed below the viewport.

## Fix

**Files:** `src/renderers/RegularRenderer.tsx`, `src/App.tsx`

1. Added `transportPortalEl` prop to RegularRenderer (accepts a DOM element)
2. When the prop is set, transport bar renders via `createPortal` into that element
   instead of inline below the score
3. In App.tsx, added a `flex-shrink-0` target div at the bottom of the preview
   column layout (below the scrollable content, always visible)
4. Used callback ref (`ref={setTransportEl}`) via useState to ensure re-render
   when the portal target mounts (useRef wouldn't trigger re-render)

## Commit
`6c932dd`
