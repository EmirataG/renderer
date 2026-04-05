---
phase: quick-28
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/SyncEditor.tsx
  - src/App.tsx
autonomous: true
must_haves:
  truths:
    - "Mouse wheel zoom works on the preview container in App.tsx"
    - "Trackpad pinch-to-zoom works on Chrome macOS (document-level wheel listener with passive:false)"
    - "Safari gesturestart/gesturechange pinch-to-zoom works on preview"
    - "Space+left-click and middle-click pan work on preview"
    - "Double-click on empty space resets zoom/pan on preview"
    - "Zoom indicator appears at bottom-right of preview when zoom != 1"
    - "SyncEditor no longer has any zoom/pan functionality (clean revert)"
    - "SyncEditor note clicking still works (no didPanRef suppression)"
  artifacts:
    - path: "src/components/SyncEditor.tsx"
      provides: "Clean SyncEditor without zoom/pan code"
    - path: "src/App.tsx"
      provides: "Preview container with zoom/pan functionality"
  key_links:
    - from: "src/App.tsx"
      to: "document wheel listener"
      via: "document.addEventListener('wheel', ...) with container.contains(e.target) guard"
      pattern: "document\\.addEventListener.*wheel"
---

<objective>
Move zoom/pan from SyncEditor to the preview container in App.tsx and fix Chrome trackpad pinch-to-zoom.

Purpose: Zoom/pan was added to SyncEditor (quick-26/27) but belongs on the preview view. Also, Chrome macOS requires a document-level wheel listener with `{ passive: false }` to reliably intercept trackpad pinch-to-zoom (container-level listeners don't reliably call preventDefault on Chrome).

Output: SyncEditor.tsx cleaned of zoom/pan code, App.tsx preview container with full zoom/pan including reliable Chrome pinch-to-zoom.
</objective>

<execution_context>
@/Users/emirahmed/.claude/get-shit-done/workflows/execute-plan.md
@/Users/emirahmed/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/components/SyncEditor.tsx
@src/App.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Revert all zoom/pan code from SyncEditor.tsx</name>
  <files>src/components/SyncEditor.tsx</files>
  <action>
Remove ALL zoom/pan code added in quick-26 and quick-27 from SyncEditor.tsx. Here is the exact list of things to remove:

**State declarations to remove (lines 33-41):**
```tsx
const [zoom, setZoom] = useState(1);
const [pan, setPan] = useState({ x: 0, y: 0 });
const panRef = useRef({ x: 0, y: 0 });
const isPanningRef = useRef(false);
const didPanRef = useRef(false);
const panStartRef = useRef({ x: 0, y: 0 });
const panOriginRef = useRef({ x: 0, y: 0 });
const isSpaceDownRef = useRef(false);
const [cursorStyle, setCursorStyle] = useState<'default' | 'grab' | 'grabbing'>('default');
```

**panRef sync useEffect to remove (line 44):**
```tsx
useEffect(() => { panRef.current = pan; }, [pan]);
```

**didPanRef check in handleScoreClick to remove (lines 148-151):**
Remove these lines from the beginning of `handleScoreClick`:
```tsx
if (didPanRef.current) {
  didPanRef.current = false;
  return;
}
```

**Wheel + gesture useEffect to remove (lines 536-590):**
Remove the entire useEffect that starts with `// Zoom toward cursor on mouse wheel` -- the one containing `handleWheel`, `handleGestureStart`, `handleGestureChange`, and the container event listeners.

**Space key tracking useEffect to remove (lines 592-613):**
Remove the entire useEffect that starts with `// Track space key for space+left-click panning` -- the one with `isSpaceDownRef`, `setCursorStyle('grab')`, etc.

**handlePanMouseDown callback to remove (lines 616-646):**
Remove the entire `const handlePanMouseDown = useCallback(...)` block including the inner `handleMouseMove` and `handleMouseUp`.

**handleZoomReset callback to remove (lines 648-654):**
Remove the entire `const handleZoomReset = useCallback(...)` block.

**JSX changes on the score container div (around line 736-741):**
On the `scoreContainerRef` div, change:
```tsx
style={{ cursor: cursorStyle, touchAction: 'none' }}
onClick={handleScoreClick}
onMouseDown={handlePanMouseDown}
onDoubleClick={handleZoomReset}
```
To just:
```tsx
onClick={handleScoreClick}
```
(Remove `style`, `onMouseDown`, and `onDoubleClick` attributes entirely.)

**Transform on inner scoreRef div (lines 745-749):**
Change the style from:
```tsx
style={{
  width: FIXED_SCORE_WIDTH,
  minWidth: FIXED_SCORE_WIDTH,
  transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
  transformOrigin: '0 0',
}}
```
To just:
```tsx
style={{
  width: FIXED_SCORE_WIDTH,
  minWidth: FIXED_SCORE_WIDTH,
}}
```

**Zoom indicator div to remove (lines 761-772):**
Remove the entire `{zoom !== 1 && (` block that renders the zoom percentage and reset button.

**KEEP `scoreContainerRef`** -- it existed before quick-26 for other purposes. Only remove zoom/pan-related refs and state.
  </action>
  <verify>Run `grep -n 'zoom\|isPanning\|didPan\|panStart\|panOrigin\|isSpaceDown\|cursorStyle\|handlePanMouseDown\|handleZoomReset\|gesturestart\|gesturechange\|touchAction\|transformOrigin' src/components/SyncEditor.tsx` -- should return zero matches. Run `grep -n 'scoreContainerRef' src/components/SyncEditor.tsx` -- should return matches (it stays).</verify>
  <done>SyncEditor.tsx has zero zoom/pan code remaining. Note clicking works without didPanRef suppression. scoreContainerRef is preserved.</done>
</task>

<task type="auto">
  <name>Task 2: Add zoom/pan to preview container in App.tsx</name>
  <files>src/App.tsx</files>
  <action>
Add zoom/pan functionality to the preview container in App.tsx. This is the `{/* Renderer content */}` section at lines 674-736.

**1. Add imports:** Add `useCallback` to the existing React import (already has `useState, useRef, useEffect`).

**2. Add state and refs** inside the `App` component, near the other state declarations (e.g. after line 52 `const [transportEl, ...]`):

```tsx
// Preview zoom/pan state
const previewContainerRef = useRef<HTMLDivElement>(null);
const [previewZoom, setPreviewZoom] = useState(1);
const [previewPan, setPreviewPan] = useState({ x: 0, y: 0 });
const previewPanRef = useRef({ x: 0, y: 0 });
const previewIsPanningRef = useRef(false);
const previewDidPanRef = useRef(false);
const previewPanStartRef = useRef({ x: 0, y: 0 });
const previewPanOriginRef = useRef({ x: 0, y: 0 });
const previewIsSpaceDownRef = useRef(false);
const [previewCursor, setPreviewCursor] = useState<'default' | 'grab' | 'grabbing'>('default');
```

**3. Add panRef sync useEffect** (right after the state declarations):

```tsx
useEffect(() => { previewPanRef.current = previewPan; }, [previewPan]);
```

**4. Add document-level wheel listener** (CRITICAL: must be on `document`, not the container, for Chrome trackpad pinch-to-zoom reliability):

```tsx
// Document-level wheel listener for Chrome trackpad pinch-to-zoom reliability
// Container-level listeners cannot reliably preventDefault on Chrome macOS
useEffect(() => {
  const container = previewContainerRef.current;
  if (!container) return;

  const handleWheel = (e: WheelEvent) => {
    // Only handle wheel events inside the preview container
    if (!container.contains(e.target as Node)) return;

    e.preventDefault();
    const factor = 1.1;
    const rect = container.getBoundingClientRect();
    const cursorX = e.clientX - rect.left;
    const cursorY = e.clientY - rect.top;

    setPreviewZoom(prevZoom => {
      const direction = e.deltaY < 0 ? factor : 1 / factor;
      const newZoom = Math.min(5, Math.max(0.25, prevZoom * direction));

      const currentPan = previewPanRef.current;
      const scoreX = (cursorX - currentPan.x) / prevZoom;
      const scoreY = (cursorY - currentPan.y) / prevZoom;
      const newPanX = cursorX - scoreX * newZoom;
      const newPanY = cursorY - scoreY * newZoom;
      setPreviewPan({ x: newPanX, y: newPanY });

      return newZoom;
    });
  };

  // Safari uses non-standard gesture events for trackpad pinch
  const handleGestureStart = (e: Event) => {
    if (!container.contains(e.target as Node)) return;
    e.preventDefault();
  };
  const handleGestureChange = (e: Event) => {
    if (!container.contains(e.target as Node)) return;
    e.preventDefault();
    const ge = e as unknown as { scale: number; clientX: number; clientY: number };
    const rect = container.getBoundingClientRect();
    const cursorX = ge.clientX - rect.left;
    const cursorY = ge.clientY - rect.top;

    setPreviewZoom(prevZoom => {
      const newZoom = Math.min(5, Math.max(0.25, prevZoom * ge.scale));
      const currentPan = previewPanRef.current;
      const scoreX = (cursorX - currentPan.x) / prevZoom;
      const scoreY = (cursorY - currentPan.y) / prevZoom;
      setPreviewPan({ x: cursorX - scoreX * newZoom, y: cursorY - scoreY * newZoom });
      return newZoom;
    });
  };

  document.addEventListener('wheel', handleWheel, { passive: false });
  document.addEventListener('gesturestart', handleGestureStart, { passive: false } as EventListenerOptions);
  document.addEventListener('gesturechange', handleGestureChange, { passive: false } as EventListenerOptions);
  return () => {
    document.removeEventListener('wheel', handleWheel);
    document.removeEventListener('gesturestart', handleGestureStart);
    document.removeEventListener('gesturechange', handleGestureChange);
  };
}, []);
```

**5. Add space key tracking useEffect:**

```tsx
// Track space key for space+left-click panning in preview
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.code === 'Space' && !(e.target instanceof HTMLInputElement)) {
      e.preventDefault();
      previewIsSpaceDownRef.current = true;
      setPreviewCursor('grab');
    }
  };
  const handleKeyUp = (e: KeyboardEvent) => {
    if (e.code === 'Space') {
      previewIsSpaceDownRef.current = false;
      setPreviewCursor(previewIsPanningRef.current ? 'grabbing' : 'default');
    }
  };
  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('keyup', handleKeyUp);
  return () => {
    window.removeEventListener('keydown', handleKeyDown);
    window.removeEventListener('keyup', handleKeyUp);
  };
}, []);
```

**6. Add pan mouse handler callback:**

```tsx
// Pan handlers for preview (middle-click or space+left-click)
const handlePreviewPanMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
  const isMiddle = e.button === 1;
  const isSpaceLeft = e.button === 0 && previewIsSpaceDownRef.current;

  if (!isMiddle && !isSpaceLeft) return;

  e.preventDefault();
  previewIsPanningRef.current = true;
  previewDidPanRef.current = false;
  previewPanStartRef.current = { x: e.clientX, y: e.clientY };
  previewPanOriginRef.current = { ...previewPanRef.current };
  setPreviewCursor('grabbing');

  const handleMouseMove = (ev: MouseEvent) => {
    if (!previewIsPanningRef.current) return;
    previewDidPanRef.current = true;
    const dx = ev.clientX - previewPanStartRef.current.x;
    const dy = ev.clientY - previewPanStartRef.current.y;
    setPreviewPan({ x: previewPanOriginRef.current.x + dx, y: previewPanOriginRef.current.y + dy });
  };

  const handleMouseUp = () => {
    previewIsPanningRef.current = false;
    setPreviewCursor(previewIsSpaceDownRef.current ? 'grab' : 'default');
    window.removeEventListener('mousemove', handleMouseMove);
    window.removeEventListener('mouseup', handleMouseUp);
  };

  window.addEventListener('mousemove', handleMouseMove);
  window.addEventListener('mouseup', handleMouseUp);
}, []);
```

**7. Add zoom reset handler:**

```tsx
// Double-click to reset preview zoom and pan
const handlePreviewZoomReset = useCallback(() => {
  setPreviewZoom(1);
  setPreviewPan({ x: 0, y: 0 });
}, []);
```

**8. Modify the preview container JSX** (line 674). Change:

```tsx
<div className="flex-1 min-h-0 overflow-auto">
```

To:

```tsx
<div
  ref={previewContainerRef}
  className="flex-1 min-h-0 overflow-hidden relative"
  style={{ cursor: previewCursor, touchAction: 'none' }}
  onMouseDown={handlePreviewPanMouseDown}
  onDoubleClick={handlePreviewZoomReset}
>
```

Note: Changed `overflow-auto` to `overflow-hidden` because zoom/pan replaces scrolling. Added `relative` for the zoom indicator positioning.

**9. Modify the inner wrapper div** (line 676). Change:

```tsx
<div className="relative m-auto w-fit">
```

To:

```tsx
<div
  className="relative m-auto w-fit"
  style={{
    transform: `translate(${previewPan.x}px, ${previewPan.y}px) scale(${previewZoom})`,
    transformOrigin: '0 0',
  }}
>
```

**10. Add zoom indicator** after the closing `</div>` of the inner wrapper (after the ScoreRegionEditor overlay, before the closing `</div>` of the outer container -- i.e., before line 736). Add:

```tsx
{/* Zoom indicator */}
{previewZoom !== 1 && (
  <div className="absolute bottom-2 right-2 flex items-center gap-2 bg-black/70 text-white text-xs font-mono px-3 py-1.5 rounded select-none z-10">
    <span>{Math.round(previewZoom * 100)}%</span>
    <button
      onClick={(e) => { e.stopPropagation(); setPreviewZoom(1); setPreviewPan({ x: 0, y: 0 }); }}
      className="text-neutral-400 hover:text-white ml-1"
      title="Reset zoom"
    >
      Reset
    </button>
  </div>
)}
```

**IMPORTANT NOTES:**
- The wheel listener MUST be on `document`, not the container element. This is the Chrome macOS fix. The `container.contains(e.target)` guard ensures it only fires for events inside the preview.
- Use `overflow-hidden` (not `overflow-auto`) on the container since pan replaces scrolling.
- Only add these behaviors when `currentView === 'renderer'` is implicitly handled because the renderer div has `display: 'none'` when sync view is active (the refs won't match elements that are display:none for contains checks, and the space key handler is global but harmless).
  </action>
  <verify>Run `npx tsc --noEmit` to verify no type errors. Run `grep -n 'document.addEventListener.*wheel' src/App.tsx` to confirm document-level wheel listener. Run `grep -n 'previewContainerRef\|previewZoom\|previewPan\|handlePreviewPanMouseDown\|handlePreviewZoomReset' src/App.tsx` to confirm all zoom/pan code is present.</verify>
  <done>Preview container in App.tsx has full zoom/pan: mouse wheel zoom centered on cursor (0.25x-5x), trackpad pinch-to-zoom on Chrome (document-level listener) and Safari (gesture events), space+left-click and middle-click pan, double-click reset, zoom indicator at bottom-right.</done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` passes with no type errors
2. No zoom/pan code remains in SyncEditor.tsx: `grep -c 'zoom\|isPanning\|didPan\|panStart\|panOrigin\|isSpaceDown\|cursorStyle\|handlePanMouseDown\|handleZoomReset\|gesturestart\|gesturechange\|touchAction\|transformOrigin' src/components/SyncEditor.tsx` returns 0
3. All zoom/pan code present in App.tsx: `grep -c 'previewZoom\|previewPan\|document.addEventListener.*wheel\|gesturestart\|handlePreviewPanMouseDown' src/App.tsx` returns multiple matches
4. Manual test: Open preview, use trackpad pinch-to-zoom on Chrome macOS -- browser zoom should NOT trigger, score zoom should work
</verification>

<success_criteria>
- SyncEditor.tsx is cleanly reverted to pre-quick-26 state (no zoom/pan artifacts)
- App.tsx preview has working zoom/pan with document-level wheel listener
- Chrome macOS trackpad pinch-to-zoom is intercepted (no browser zoom)
- Safari gesturestart/gesturechange handlers work
- Space+click and middle-click pan work
- Double-click resets zoom
- Zoom indicator shows percentage and reset button
- TypeScript compiles without errors
</success_criteria>

<output>
After completion, create `.planning/quick/28-move-zoom-pan-from-synceditor-to-preview/28-SUMMARY.md`
</output>
