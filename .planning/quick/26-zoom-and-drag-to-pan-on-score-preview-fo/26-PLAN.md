---
phase: quick-26
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/SyncEditor.tsx
autonomous: true

must_haves:
  truths:
    - "Mouse wheel zooms in/out on the SyncEditor score area"
    - "Click-drag pans the zoomed score view"
    - "Zoom and pan feel smooth and responsive"
    - "Note selection (click on note) still works correctly"
    - "Export render mode is NOT affected by zoom/pan state"
  artifacts:
    - path: "src/components/SyncEditor.tsx"
      provides: "Zoom and pan state + event handlers on the score container"
  key_links:
    - from: "SyncEditor score container div"
      to: "CSS transform: scale() + translate()"
      via: "onWheel and onMouseDown/Move/Up handlers"
      pattern: "transform.*scale.*translate"
---

<objective>
Add mouse-wheel zoom and click-drag pan to the SyncEditor score display area.

Purpose: Let the user zoom into specific measures/notes for precise timestamp syncing, and drag to navigate the zoomed view without relying on scrollbars.
Output: Updated SyncEditor.tsx with zoom/pan functionality on the score container.
</objective>

<execution_context>
@/Users/emirahmed/.claude/get-shit-done/workflows/execute-plan.md
@/Users/emirahmed/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/components/SyncEditor.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add zoom and drag-to-pan to SyncEditor score area</name>
  <files>src/components/SyncEditor.tsx</files>
  <action>
Add zoom/pan state and handlers to SyncEditor. This affects the score display container (lines 592-605 in current code) -- the `div.flex-1.min-h-0.overflow-auto.bg-white.p-4` that wraps the scoreRef div.

**State to add:**
- `zoom` state (number, default 1, range 0.25 to 5)
- `pan` state ({ x: number, y: number }, default { x: 0, y: 0 })
- `isPanning` ref (boolean, tracks active drag)
- `panStart` ref ({ x: number, y: number }, mouse position when drag started)
- `panOrigin` ref ({ x: number, y: number }, pan offset when drag started)

**Zoom (mouse wheel):**
- Add `onWheel` handler to the outer score container div (the overflow-auto one)
- Call `e.preventDefault()` to stop native scroll
- Use `e.deltaY` to determine direction: negative = zoom in, positive = zoom out
- Apply a zoom factor of 1.1 per wheel tick (multiply or divide current zoom)
- Clamp zoom between 0.25 and 5
- Zoom toward the cursor position:
  - Get cursor position relative to the container using `getBoundingClientRect()`
  - Compute the point in score-space the cursor is over: `scoreX = (cursorX - pan.x) / oldZoom`, `scoreY = (cursorY - pan.y) / oldZoom`
  - After changing zoom, adjust pan so the same score point stays under cursor: `newPanX = cursorX - scoreX * newZoom`, `newPanY = cursorY - scoreY * newZoom`

**Pan (click-drag):**
- Add `onMouseDown` handler to the same container div
- On mousedown: if NOT clicking on a note (check `e.target` -- only start pan if middle button OR if left button and not on a `g.note` or its descendants), set isPanning=true, record panStart and panOrigin
- Actually simpler approach: use **middle mouse button** (button===1) for pan, so left click still selects notes. ALSO support left-button drag but ONLY when holding **Space** key (track via keydown/keyup listener on window, store in a ref `isSpaceDown`).
- On mousemove (use a window-level listener added in mousedown, removed in mouseup): update pan by delta from panStart
- On mouseup: set isPanning=false, remove window listeners

**Apply transform:**
- On the inner div (the one with `ref={scoreRef}`), apply CSS transform: `transform: scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)` with `transformOrigin: '0 0'`
- Remove the `overflow-auto` class from the outer container and replace with `overflow-hidden` so the native scrollbars go away when zoomed (the user pans instead)
- Add `cursor` style: default cursor normally, `cursor: grab` when space is held, `cursor: grabbing` when actively panning

**Reset zoom:**
- Double-click on the container resets zoom to 1 and pan to {x:0, y:0}
- Add `onDoubleClick` handler (but NOT on notes -- check target)

**Important considerations:**
- The `handleScoreClick` already exists for note selection (line 131). Left-click on notes must still work -- only pan on middle-button or space+left-click.
- For the `onWheel` handler, must use `{ passive: false }` to allow preventDefault. Since React onWheel is passive, use a `useEffect` with `addEventListener('wheel', handler, { passive: false })` on the container ref instead of the React `onWheel` prop.
- Add a small zoom indicator in the bottom-right corner of the score area showing current zoom level (e.g., "150%") with a reset button. Style it with the existing grunge theme classes (semi-transparent black bg, white text, small).
- Do NOT change anything related to `isRenderMode` -- the export pipeline must not be affected.
  </action>
  <verify>
Run `npx tsc --noEmit` to verify no type errors. Run `npm run dev` and confirm:
1. Mouse wheel over the score area zooms in/out centered on cursor
2. Middle-click drag pans the view
3. Space + left-click drag pans the view
4. Left-click on a note still selects it (blue highlight)
5. Double-click on empty space resets zoom to 100%
6. Zoom indicator shows current percentage in bottom-right
  </verify>
  <done>SyncEditor score area supports smooth zoom (mouse wheel, 0.25x-5x range) and drag-to-pan (middle-click or space+left-click). Note selection still works. Zoom indicator visible. Export unaffected.</done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` passes
- Mouse wheel zooms in/out on the SyncEditor score
- Drag-to-pan works with middle mouse or space+left-click
- Note clicks still select events and show blue highlight
- Double-click resets zoom to 100%
- Arrow key navigation still works
- Audio playback sync highlighting still works
- Export/render mode is unaffected
</verification>

<success_criteria>
- Zoom: mouse wheel changes score scale 0.25x-5x, centered on cursor
- Pan: middle-click or space+left-click drags the view
- Existing note selection, keyboard nav, and playback highlighting unbroken
- Zoom level indicator visible with reset capability
</success_criteria>

<output>
After completion, create `.planning/quick/26-zoom-and-drag-to-pan-on-score-preview-fo/26-SUMMARY.md`
</output>
