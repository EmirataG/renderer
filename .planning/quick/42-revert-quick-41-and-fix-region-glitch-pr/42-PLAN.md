---
phase: quick-42
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/App.tsx
  - src/components/ScoreRegionEditor.tsx
autonomous: true
must_haves:
  truths:
    - "Zoom/pan works at all times including during region editing (no disabled prop)"
    - "Region drag/resize tracks pointer correctly at any zoom level"
    - "No transformRef or resetTransform logic remains in App.tsx"
  artifacts:
    - path: "src/App.tsx"
      provides: "zoomScale state + onTransformed callback on TransformWrapper"
      contains: "onTransformed"
    - path: "src/components/ScoreRegionEditor.tsx"
      provides: "scale prop forwarded to Rnd"
      contains: "scale={scale}"
  key_links:
    - from: "src/App.tsx"
      to: "src/components/ScoreRegionEditor.tsx"
      via: "scale prop"
      pattern: "scale=\\{zoomScale\\}"
---

<objective>
Revert quick-41's workaround (disabling zoom during region editing) and fix the region glitch properly by passing the current zoom scale to react-rnd's `<Rnd>` component via its built-in `scale` prop.

Purpose: Quick-41 disabled zoom/pan entirely during region editing as a workaround for pointer-position mismatch. The proper fix is to tell `<Rnd>` the current CSS transform scale so it adjusts pointer deltas correctly. This restores full zoom/pan during editing.

Output: Two modified files -- App.tsx (reverted + zoomScale state) and ScoreRegionEditor.tsx (new scale prop).
</objective>

<execution_context>
@/Users/emirahmed/.claude/get-shit-done/workflows/execute-plan.md
@/Users/emirahmed/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/App.tsx
@src/components/ScoreRegionEditor.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Revert quick-41 changes and add zoomScale plumbing in App.tsx</name>
  <files>src/App.tsx</files>
  <action>
In src/App.tsx, make these changes:

1. REVERT quick-41 import change (line 14): Remove `type ReactZoomPanPinchContentRef` from the react-zoom-pan-pinch import. The import should be:
   `import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";`

2. REVERT quick-41 ref (line 55-56): Remove the entire `const transformRef = useRef<ReactZoomPanPinchContentRef>(null);` line. Also remove the `useRef` import if no other useRef remains -- but audioRef and wsRef still use useRef, so keep the useRef import.

3. ADD new state after the isEditingRegion state (~line 60): `const [zoomScale, setZoomScale] = useState(1);`

4. REVERT quick-41 button handler (lines 422-425): Change the Edit Region button onClick back to simple: `onClick={() => setIsEditingRegion(true)}`

5. REVERT quick-41 TransformWrapper props (line 699): Remove `ref={transformRef} disabled={isEditingRegion}` from TransformWrapper. ADD `onTransformed` callback:
   `<TransformWrapper onTransformed={(_, state) => setZoomScale(state.scale)} minScale={0.25} maxScale={5} panning={{ activationKeys: ["Alt"] }} doubleClick={{ mode: "reset" }}>`

6. ADD scale prop to ScoreRegionEditor (line 754-759): Add `scale={zoomScale}` prop:
   ```
   <ScoreRegionEditor
     containerWidth={regionContainerDims.width}
     containerHeight={regionContainerDims.height}
     initialRegion={scoreRegion}
     onRegionChange={setScoreRegion}
     onClose={() => setIsEditingRegion(false)}
     scale={zoomScale}
   />
   ```
  </action>
  <verify>Run `npx tsc --noEmit` -- should pass (after Task 2 adds the scale prop to ScoreRegionEditor).</verify>
  <done>All quick-41 additions removed. zoomScale state added. onTransformed callback on TransformWrapper. scale={zoomScale} passed to ScoreRegionEditor.</done>
</task>

<task type="auto">
  <name>Task 2: Add scale prop to ScoreRegionEditor and forward to Rnd</name>
  <files>src/components/ScoreRegionEditor.tsx</files>
  <action>
In src/components/ScoreRegionEditor.tsx:

1. Add `scale` to the Props interface:
   ```
   interface Props {
     containerWidth: number;
     containerHeight: number;
     initialRegion: ScoreRegion | null;
     onRegionChange: (region: ScoreRegion | null) => void;
     onClose: () => void;
     scale?: number;
   }
   ```

2. Destructure `scale` in the component function params (default to 1):
   ```
   export function ScoreRegionEditor({
     containerWidth,
     containerHeight,
     initialRegion,
     onRegionChange,
     onClose,
     scale = 1,
   }: Props) {
   ```

3. Pass `scale` to the `<Rnd>` component (add it as a prop alongside `bounds`, `minWidth`, etc.):
   ```
   <Rnd
     scale={scale}
     default={{
       ...
   ```

That is it -- react-rnd's Rnd component already accepts a `scale` prop that adjusts pointer delta calculations for CSS-transformed parents.
  </action>
  <verify>Run `npx tsc --noEmit` to confirm no type errors. Then run `npm run build` to confirm production build succeeds.</verify>
  <done>ScoreRegionEditor accepts optional scale prop (default 1) and forwards it to Rnd. Type-checks pass. Build succeeds.</done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` -- no type errors
2. `npm run build` -- production build succeeds
3. Manual: Open app, zoom preview to 2x, enter Edit Score Region, drag region -- pointer should track correctly (no offset glitch)
4. Manual: Zoom/pan should work while editing region (not disabled)
</verification>

<success_criteria>
- All quick-41 code removed (no transformRef, no disabled={isEditingRegion}, no resetTransform)
- zoomScale state flows from TransformWrapper.onTransformed -> ScoreRegionEditor.scale -> Rnd.scale
- TypeScript compiles, production build passes
- Region editor drag/resize works correctly at any zoom level
</success_criteria>

<output>
After completion, create `.planning/quick/42-revert-quick-41-and-fix-region-glitch-pr/42-SUMMARY.md`
</output>
