---
phase: quick-54
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/types/score.ts
  - src/types/project.ts
  - src/types/global.d.ts
  - src/stores/projectStore.ts
  - src/components/ScoreRegionEditor.tsx
  - src/renderers/RegularRenderer.tsx
  - src/renderers/SingleLineRenderer.tsx
  - src/App.tsx
  - src/lib/exportClient.ts
  - src/app/api/projects/[id]/route.ts
  - export-service/src/shared/exportSettings.ts
  - export-service/src/standalone/render.ts
  - export-service/src/browser/pageSetup.ts
autonomous: true
must_haves:
  truths:
    - "User can rotate the score region by dragging a circular rotation handle"
    - "Rotation angle persists across page refresh (auto-saved)"
    - "Rotation is visually applied in the preview renderer"
    - "Rotation is applied during video export"
  artifacts:
    - path: "src/types/score.ts"
      provides: "ScoreRegion type with rotation field"
      contains: "rotation"
    - path: "src/components/ScoreRegionEditor.tsx"
      provides: "Rotation handle UI with circular arrow icon"
    - path: "src/renderers/RegularRenderer.tsx"
      provides: "CSS transform rotate on score region container"
      contains: "rotate"
  key_links:
    - from: "src/components/ScoreRegionEditor.tsx"
      to: "src/stores/projectStore.ts"
      via: "onRegionChange callback includes rotation"
      pattern: "rotation"
    - from: "src/renderers/RegularRenderer.tsx"
      to: "scoreRegion.rotation"
      via: "CSS transform: rotate()"
      pattern: "rotate.*deg"
---

<objective>
Add a rotation handle to the ScoreRegionEditor that lets users rotate the score region. The handle should appear as a circular arrow icon (like image editing software) positioned above the region. Dragging it rotates the region around its center. The rotation angle is stored as part of ScoreRegion, persisted via auto-save, and applied during both preview and export rendering.

Purpose: Allow users to tilt/angle the score region on their background image for creative video layouts.
Output: Working rotation handle in ScoreRegionEditor, rotation applied in both renderers and export service.
</objective>

<execution_context>
@/Users/emirahmed/.claude/get-shit-done/workflows/execute-plan.md
@/Users/emirahmed/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/types/score.ts
@src/types/project.ts
@src/types/global.d.ts
@src/stores/projectStore.ts
@src/components/ScoreRegionEditor.tsx
@src/renderers/RegularRenderer.tsx
@src/renderers/SingleLineRenderer.tsx
@src/App.tsx
@src/lib/exportClient.ts
@src/app/api/projects/[id]/route.ts
@export-service/src/shared/exportSettings.ts
@export-service/src/standalone/render.ts
@export-service/src/browser/pageSetup.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add rotation to ScoreRegion type and propagate through data layer</name>
  <files>
    src/types/score.ts
    src/types/project.ts
    src/types/global.d.ts
    src/lib/exportClient.ts
    export-service/src/shared/exportSettings.ts
    export-service/src/browser/pageSetup.ts
  </files>
  <action>
1. In `src/types/score.ts`, add `rotation?: number` to the ScoreRegion interface (degrees, defaults to 0 when undefined).

2. In `src/types/project.ts`, the `scoreRegion` field is an inline `{ x, y, width, height }` object -- add `rotation?: number` to match.

3. In `src/types/global.d.ts`, find the `scoreRegion` property on `ExportConfig` interface and add `rotation?: number` to its inline type.

4. In `export-service/src/shared/exportSettings.ts`, add `rotation: Type.Optional(Type.Number())` to the `ScoreRegionSchema` object.

5. In `export-service/src/browser/pageSetup.ts`, add `rotation?: number` to the inline `scoreRegion` type in the `ExportConfig` interface (line ~87).

No changes needed to `src/lib/exportClient.ts` -- it imports ScoreRegion from types/score.ts which will pick up the new field automatically.

No changes needed to `src/stores/projectStore.ts` or `src/lib/autoSave.ts` -- scoreRegion is stored as a whole object; the rotation field will be included automatically when set.

No changes needed to `src/app/api/projects/[id]/route.ts` -- `scoreRegion` is already in the ALLOWED_SETTINGS whitelist, and the entire object (including rotation) is saved to Firestore as-is.
  </action>
  <verify>Run `npx tsc --noEmit` from the renderer root. No type errors related to ScoreRegion or rotation.</verify>
  <done>ScoreRegion type includes optional `rotation` field across all type definitions (frontend types, export service schema, global ExportConfig). Existing code continues to compile since the field is optional.</done>
</task>

<task type="auto">
  <name>Task 2: Add rotation handle to ScoreRegionEditor</name>
  <files>
    src/components/ScoreRegionEditor.tsx
  </files>
  <action>
Add a rotation handle to the ScoreRegionEditor component. The handle should:

1. **Track rotation state**: Add `rotation` to the `currentRegion` state, initialized from `initialRegion?.rotation ?? 0`.

2. **Include rotation in callbacks**: When calling `onRegionChange`, always include `rotation: currentRegion.rotation` (or the updated value) in the region object.

3. **Render a rotation handle**: Position a circular rotation handle ABOVE the Rnd box, centered horizontally. The handle should:
   - Be placed ~30px above the top edge of the region, connected by a thin vertical line (like Figma/Canva rotation handles).
   - Display a circular arrow icon (use an inline SVG: a circle with two curved arrow tips suggesting rotation, ~20x20px).
   - Have `cursor: grab` (and `grabbing` while dragging).
   - Be styled: white fill, 1px neutral-600 border, same aesthetic as the existing resize handles.

4. **Implement rotation drag logic** (no external library needed):
   - On mousedown on the rotation handle, capture the center of the region (centerX = region.x + region.width/2, centerY = region.y + region.height/2).
   - On mousemove, calculate the angle from center to mouse position using `Math.atan2(dy, dx)`, convert to degrees. Subtract the initial angle offset to get a delta. Update rotation state.
   - On mouseup, finalize and call `onRegionChange` with the final rotation value.
   - IMPORTANT: Account for the `scale` prop when calculating mouse positions. The mouse coordinates need to be divided by `scale` to match the coordinate space of the region.
   - Snap to 0 degrees when within +/- 3 degrees of 0 (so users can easily return to no rotation).

5. **Apply rotation to the Rnd wrapper**: Wrap the `<Rnd>` component in a div that applies `transform: rotate(${rotation}deg)` with `transformOrigin: center center`. This way the Rnd drag/resize still works while the visual rotation is applied.

6. **Update the instruction text** in the center label: "Drag to move . Corners to resize . Top handle to rotate"

7. **Display current rotation**: Show the rotation value (rounded to nearest degree) near the handle when rotation is non-zero, e.g., a small label like "12deg" in the same style as the center instruction text (small, semi-transparent).
  </action>
  <verify>Run `npx tsc --noEmit`. Open the app, set a background image, click "Edit Score Region", and verify: rotation handle appears above the region with a circular arrow icon, dragging it rotates the region visually, releasing it saves the rotation value.</verify>
  <done>ScoreRegionEditor renders a rotation handle with circular arrow icon. Dragging the handle rotates the region. Rotation angle is included in the onRegionChange callback. Handle snaps to 0 degrees near zero. Current angle is displayed during rotation.</done>
</task>

<task type="auto">
  <name>Task 3: Apply rotation in preview renderers and export service</name>
  <files>
    src/renderers/RegularRenderer.tsx
    src/renderers/SingleLineRenderer.tsx
    export-service/src/standalone/render.ts
  </files>
  <action>
1. **RegularRenderer.tsx** (~line 855-863): The score region container div uses `position: absolute` with `left`, `top`, `width`, `height` from scoreRegion. Add `transform: rotate(${scoreRegion?.rotation ?? 0}deg)` and `transformOrigin: center center` to this div's style object. This rotates the entire score region (including its contents and overflow clipping) around its center.

   Also apply the same rotation to the border container section (~line 914-960). The borders should rotate with the score. Wrap BOTH the top and bottom border divs in a single parent div that has the same rotation transform, positioned at the region's bounding box. Alternatively, since borders are already positioned relative to the region, apply the same `transform: rotate()` to each border div individually, with `transformOrigin` set relative to the region center.

   Simpler approach: Wrap the entire score container + borders section in a single wrapper div that applies the rotation. This means:
   - Create a wrapper div with `position: absolute`, `left: regionX`, `top: regionY`, `width: regionWidth`, `height: regionHeight`, `transform: rotate(${rotation}deg)`, `transformOrigin: center center`.
   - The inner score container div becomes `position: relative` (or `absolute` with `left: 0, top: 0`) instead of using regionX/regionY.
   - Borders also become relative to this wrapper.

2. **SingleLineRenderer.tsx** (~line 798-809): Same pattern as RegularRenderer. The score region container div at line 798-809 gets `transform: rotate(${scoreRegion?.rotation ?? 0}deg)` and `transformOrigin: center center`. Apply identical wrapper approach for the border section (~line 850-870).

3. **export-service/src/standalone/render.ts** (~line 425-431): The `regionEl` is created with `position: absolute`, `left`, `top`, `width`, `height`. Add:
   ```
   const rotation = config.scoreRegion?.rotation ?? 0;
   if (rotation !== 0) {
     regionEl.style.transform = `rotate(${rotation}deg)`;
     regionEl.style.transformOrigin = 'center center';
   }
   ```
   Also apply rotation to the border elements in the standalone renderer if they exist (search for border positioning in the same file).

IMPORTANT: Use `overflow: hidden` on the rotated wrapper so the score contents don't bleed outside the rotated region boundary.
  </action>
  <verify>
1. Run `npx tsc --noEmit` -- no type errors.
2. Open the app with a background image, set a score region with some rotation, and confirm the score renders rotated in the preview.
3. The score content should be clipped to the rotated region rectangle.
4. Borders (if enabled) should rotate with the score region.
  </verify>
  <done>Score region rotation is visually applied in RegularRenderer, SingleLineRenderer, and the export-service standalone renderer. The score, its overflow clipping, and borders all rotate together around the region center. Export output matches preview rotation.</done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` passes with no errors
2. Open app -> upload score + background -> Edit Score Region -> rotation handle visible above region
3. Drag rotation handle -> region rotates smoothly -> angle label shown
4. Release handle -> rotation persists -> click Done -> rotation visible in preview
5. Refresh page -> rotation value restored from auto-save
6. Enable score border -> borders rotate with the score region
7. Score region info text in inspector shows rotation when non-zero
</verification>

<success_criteria>
- ScoreRegion type includes optional `rotation` field across all type definitions
- Circular arrow rotation handle appears above the score region editor
- Dragging the handle rotates the region with angle snapping near 0 degrees
- Rotation applied via CSS transform in both RegularRenderer and SingleLineRenderer
- Rotation persists via existing auto-save pipeline (no extra plumbing needed)
- Export service applies rotation to standalone render output
- No TypeScript errors
</success_criteria>

<output>
After completion, create `.planning/quick/54-add-an-option-to-rotate-the-score-region/54-SUMMARY.md`
</output>
