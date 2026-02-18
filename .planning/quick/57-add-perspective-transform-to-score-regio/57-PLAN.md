---
phase: quick-57
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/types/score.ts
  - src/types/project.ts
  - src/types/global.d.ts
  - export-service/src/shared/exportSettings.ts
  - export-service/src/browser/pageSetup.ts
  - export-service/src/standalone/render.ts
  - src/lib/perspectiveTransform.ts
  - src/components/ScoreRegionEditor.tsx
  - src/renderers/RegularRenderer.tsx
  - src/renderers/SingleLineRenderer.tsx
autonomous: true
requirements: [QUICK-57]

must_haves:
  truths:
    - "User can drag individual corners of the score region to create perspective distortion"
    - "Score content inside the region visually warps to match the non-rectangular shape"
    - "Perspective distortion appears correctly in both RegularRenderer and SingleLineRenderer previews"
    - "Perspective distortion appears correctly in exported video"
    - "Corner offsets persist across page refresh via auto-save"
  artifacts:
    - path: "src/lib/perspectiveTransform.ts"
      provides: "matrix3d CSS transform computation from corner offsets"
    - path: "src/types/score.ts"
      provides: "ScoreRegion with perspective corner offsets"
      contains: "perspective"
    - path: "src/components/ScoreRegionEditor.tsx"
      provides: "Draggable corner handles for perspective adjustment"
  key_links:
    - from: "src/components/ScoreRegionEditor.tsx"
      to: "src/lib/perspectiveTransform.ts"
      via: "computeMatrix3d import"
      pattern: "computeMatrix3d"
    - from: "src/renderers/RegularRenderer.tsx"
      to: "src/lib/perspectiveTransform.ts"
      via: "computeMatrix3d import"
      pattern: "computeMatrix3d"
    - from: "export-service/src/standalone/render.ts"
      to: "inline matrix3d computation"
      via: "duplicated computeMatrix3d (same pattern as animation.ts duplication)"
      pattern: "matrix3d"
---

<objective>
Add perspective transform to score region allowing independent corner movement for depth illusion.

Purpose: Allow users to create depth/perspective effects by moving individual corners of the score region, causing the score content to warp via CSS matrix3d transform to match the non-rectangular shape. This follows the same pattern as quick-54 (rotation) -- extending ScoreRegion type, adding editor UI, applying transform in renderers and export.

Output: Perspective corner handles in ScoreRegionEditor, CSS matrix3d warp in both renderers, export service support, auto-save via existing scoreRegion pipeline.
</objective>

<execution_context>
@/Users/emirahmed/.claude/get-shit-done/workflows/execute-plan.md
@/Users/emirahmed/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/quick/54-add-an-option-to-rotate-the-score-region/54-SUMMARY.md
@src/types/score.ts
@src/components/ScoreRegionEditor.tsx
@src/renderers/RegularRenderer.tsx
@src/renderers/SingleLineRenderer.tsx
@export-service/src/standalone/render.ts
@export-service/src/shared/exportSettings.ts
@export-service/src/browser/pageSetup.ts
@src/types/project.ts
@src/types/global.d.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add perspective field to ScoreRegion type and create matrix3d utility</name>
  <files>
    src/types/score.ts
    src/types/project.ts
    src/types/global.d.ts
    export-service/src/shared/exportSettings.ts
    export-service/src/browser/pageSetup.ts
    export-service/src/standalone/render.ts
    src/lib/perspectiveTransform.ts
  </files>
  <action>
**1. Extend ScoreRegion with perspective field (all 6 type locations):**

Add an optional `perspective` field to `ScoreRegion` representing corner offsets from the rectangular default. Each corner has an `{x, y}` offset (0,0 = no distortion).

In `src/types/score.ts`:
```typescript
export interface PerspectiveCorners {
  topLeft: { x: number; y: number };
  topRight: { x: number; y: number };
  bottomRight: { x: number; y: number };
  bottomLeft: { x: number; y: number };
}

export interface ScoreRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  perspective?: PerspectiveCorners;
}
```

In `src/types/project.ts`, add `perspective?: { topLeft: { x: number; y: number }; topRight: { x: number; y: number }; bottomRight: { x: number; y: number }; bottomLeft: { x: number; y: number } }` to the inline scoreRegion type.

In `src/types/global.d.ts`, add the same `perspective?` field to the ExportConfig scoreRegion inline type.

In `export-service/src/shared/exportSettings.ts`, add to ScoreRegionSchema:
```typescript
perspective: Type.Optional(Type.Object({
  topLeft: Type.Object({ x: Type.Number(), y: Type.Number() }),
  topRight: Type.Object({ x: Type.Number(), y: Type.Number() }),
  bottomRight: Type.Object({ x: Type.Number(), y: Type.Number() }),
  bottomLeft: Type.Object({ x: Type.Number(), y: Type.Number() }),
})),
```

In `export-service/src/browser/pageSetup.ts`, add `perspective?: { topLeft: { x: number; y: number }; topRight: { x: number; y: number }; bottomRight: { x: number; y: number }; bottomLeft: { x: number; y: number } }` to the ExportConfig scoreRegion inline type.

In `export-service/src/standalone/render.ts`, add the same `perspective?` field to the inline ExportConfig scoreRegion type.

**2. Create `src/lib/perspectiveTransform.ts`:**

This module computes a CSS `matrix3d()` string from 4 source corners (rectangle) mapped to 4 destination corners (distorted quadrilateral). The algorithm:

1. Source corners are the rectangle: `(0,0), (w,0), (w,h), (0,h)`
2. Destination corners are source + offsets from `PerspectiveCorners`
3. Solve for the 3x3 homography matrix H that maps source to destination (using adjugate method, no external deps)
4. Convert the 3x3 homography to a CSS `matrix3d(...)` string

Export two functions:
- `computeMatrix3d(width: number, height: number, corners: PerspectiveCorners): string` - returns `matrix3d(...)` CSS value or empty string if all offsets are zero
- `hasPerspective(corners: PerspectiveCorners | undefined): boolean` - returns true if any offset is non-zero

The homography computation: Given 4 source points (s) and 4 destination points (d), solve the 8-equation system for the 8 unknowns of the projective transform matrix. Use the standard DLT (Direct Linear Transform) approach:

```
| a b c |     | sx |     | dx * w |
| d e f |  *  | sy |  =  | dy * w |
| g h 1 |     | 1  |     |   w    |
```

The CSS matrix3d maps to this as:
```
matrix3d(
  a, d, 0, g,
  b, e, 0, h,
  0, 0, 1, 0,
  c, f, 0, 1
)
```

The transform-origin MUST be set to `0 0` (top-left) when applying this matrix, since the homography is computed relative to the top-left corner.

Important: Do NOT use CSS `perspective()` function -- it creates a 3D projection that doesn't allow independent corner control. Use `matrix3d()` which allows arbitrary 2D homography as a degenerate case of 3D transform.
  </action>
  <verify>
    TypeScript compiles without errors: `cd /Users/emirahmed/Desktop/Manuscript/renderer && npx tsc --noEmit 2>&1 | head -20`

    Verify the perspectiveTransform module exists and exports the expected functions.
  </verify>
  <done>
    - ScoreRegion type has optional `perspective` field in all 6 locations (score.ts, project.ts, global.d.ts, exportSettings.ts, pageSetup.ts, render.ts)
    - `src/lib/perspectiveTransform.ts` exports `computeMatrix3d` and `hasPerspective`
    - TypeScript compiles cleanly
    - Auto-save works automatically since `perspective` is nested inside `scoreRegion` which is already in the save pipeline
  </done>
</task>

<task type="auto">
  <name>Task 2: Add perspective corner handles to ScoreRegionEditor</name>
  <files>
    src/components/ScoreRegionEditor.tsx
  </files>
  <action>
Add 4 draggable corner handles to ScoreRegionEditor that allow independent corner movement for perspective distortion. These are SEPARATE from the existing resize handles (which move corners symmetrically to resize the rectangle). The perspective handles sit ON TOP of the region corners and adjust the `perspective` field offsets.

**State management:**
- Add `const [perspectiveCorners, setPerspectiveCorners] = useState<PerspectiveCorners>(() => initialRegion?.perspective ?? { topLeft: {x:0,y:0}, topRight: {x:0,y:0}, bottomRight: {x:0,y:0}, bottomLeft: {x:0,y:0} });`
- Import `PerspectiveCorners` from `../types/score`
- Import `computeMatrix3d, hasPerspective` from `../lib/perspectiveTransform`

**Corner handle UI:**
Add 4 perspective handles positioned at the actual corner positions (region corner + offset). Each handle is a small diamond shape (rotated square) to visually distinguish from the square resize handles. Use a distinct color (e.g., cyan/teal `#06b6d4`) to differentiate from the white resize handles.

Each handle:
- Size: 12x12px diamond (8x8 square rotated 45deg)
- Color: cyan border + semi-transparent cyan fill (`bg-cyan-500/30 border-cyan-500`)
- Cursor: `move`
- Position: at the corner of the region + the perspective offset

**Drag behavior:**
Use the same window mousemove/mouseup pattern as the rotation handle. On drag:
1. Compute delta from initial mousedown position
2. Divide by `scale` prop to account for zoom
3. Update the specific corner's offset in perspectiveCorners state
4. On mouseup, call `onRegionChange` with the updated region including `perspective`

**Visual preview of perspective:**
Apply the `computeMatrix3d` result as a CSS transform on a semi-transparent overlay div inside the Rnd component, so the user can see the perspective effect while editing. The overlay should have a subtle colored border (cyan dashed) showing the warped shape.

Actually, simpler approach: apply the perspective transform to the entire region content area using a preview overlay. Add a div inside the Rnd that shows the warped outline using the matrix3d transform. This gives real-time visual feedback.

**Integration with existing region change flow:**
When calling `onRegionChange`, include the perspective field:
```typescript
const newRegion: ScoreRegion = {
  ...currentRegion,
  rotation,
  perspective: perspectiveCorners,
};
onRegionChange(newRegion);
```

This applies to `handleDragStop`, `handleResizeStop`, and `handleRotateMouseDown`'s mouseup handler as well -- they must propagate the current perspective corners.

**Reset perspective:**
Update the help text to mention perspective corners: "Drag to move . Corners to resize . Top handle to rotate . Diamond handles for perspective"

**Handle positioning math:**
The 4 corner handles are positioned at:
- topLeft: `(0 + offset.x, 0 + offset.y)` relative to the region
- topRight: `(width + offset.x, 0 + offset.y)` relative to the region
- bottomRight: `(width + offset.x, height + offset.y)` relative to the region
- bottomLeft: `(0 + offset.x, height + offset.y)` relative to the region

These positions need to be rendered OUTSIDE the Rnd component (in the rotation wrapper div) so they aren't clipped. They should be positioned absolutely relative to the rotation wrapper.
  </action>
  <verify>
    The app compiles: `cd /Users/emirahmed/Desktop/Manuscript/renderer && npx tsc --noEmit 2>&1 | head -20`

    Open the app, click "Edit Region", verify 4 cyan diamond handles appear at the corners of the score region. Drag a corner handle to see perspective offset change.
  </verify>
  <done>
    - ScoreRegionEditor shows 4 cyan diamond perspective handles at region corners
    - Dragging a corner handle updates that corner's offset independently
    - onRegionChange is called with perspective data on every interaction (drag, resize, rotate, perspective)
    - All existing functionality (drag, resize, rotate) continues to work with perspective data preserved
  </done>
</task>

<task type="auto">
  <name>Task 3: Apply perspective matrix3d in renderers and export service</name>
  <files>
    src/renderers/RegularRenderer.tsx
    src/renderers/SingleLineRenderer.tsx
    export-service/src/standalone/render.ts
  </files>
  <action>
Apply the CSS matrix3d perspective transform in all 3 rendering contexts. The transform is applied to the rotation wrapper div that already wraps the score region + borders.

**RegularRenderer.tsx:**
1. Import `computeMatrix3d, hasPerspective` from `../lib/perspectiveTransform` and `PerspectiveCorners` from `../types/score`
2. In the IIFE that builds the rotation wrapper, read `const regionPerspective = scoreRegion?.perspective;`
3. Build the combined transform string. The order matters -- rotation first, then perspective:
   - If both rotation and perspective: `transform: rotate(${regionRotation}deg) ${computeMatrix3d(regionWidth, regionHeight, regionPerspective)}`

   WAIT -- this ordering is wrong. matrix3d already encodes the full mapping. The correct approach is:

   - If ONLY rotation (no perspective): `transform: rotate(${regionRotation}deg)` (existing behavior)
   - If ONLY perspective (no rotation): `transform: ${computeMatrix3d(regionWidth, regionHeight, regionPerspective)}`, with `transformOrigin: '0 0'`
   - If BOTH rotation AND perspective: Apply rotation wrapper as before, then add an INNER div with the matrix3d transform. This keeps the two transforms separate and composable.

   Actually, the simplest correct approach: The rotation wrapper keeps its existing `rotate()` transform. Add the matrix3d as a CSS transform on the **score container div** (the `overflow: hidden` child of the rotation wrapper). This way rotation and perspective compose naturally -- rotation happens on the outer wrapper, perspective distortion on the inner content.

   Update the score container div (currently at `position: absolute, left: 0, top: 0, width: regionWidth, height: regionHeight, overflow: hidden`) to also include:
   ```
   transform: hasPerspective(regionPerspective) ? computeMatrix3d(regionWidth, regionHeight, regionPerspective) : undefined,
   transformOrigin: hasPerspective(regionPerspective) ? '0 0' : undefined,
   ```

   IMPORTANT: The `overflow: hidden` must remain so the score is clipped to the warped region. CSS overflow + matrix3d should work since the overflow clips to the element's border-box which is then transformed.

   Actually, `overflow: hidden` on an element with a matrix3d transform may not clip as expected because the transform creates a new stacking context and the overflow clips in the untransformed coordinate space.

   Better approach: Apply the matrix3d to the rotation wrapper itself, COMPOSING with the rotation:
   ```
   transform: [rotation ? `rotate(${regionRotation}deg)` : ''] + [perspective ? computeMatrix3d(...) : '']
   ```
   Both rotation and matrix3d are CSS transform functions that compose via concatenation. The matrix3d will distort the entire wrapper (score + borders) in the same coordinate space as the rotation.

   Set `transformOrigin: '0 0'` when perspective is active (the matrix3d is computed relative to top-left). When only rotation is active, keep `transformOrigin: 'center center'` for rotation around center.

   When BOTH are active: We need rotation around center + perspective from top-left. These don't compose cleanly with a single transform-origin.

   FINAL CORRECT APPROACH: Use a nested div structure:
   - Outer div: rotation wrapper (existing) with `rotate()` and `transformOrigin: center center`
   - Inner div (NEW): perspective wrapper with `matrix3d()` and `transformOrigin: 0 0`, wrapping the score container + borders

   This cleanly separates the two transforms. The perspective wrapper goes INSIDE the rotation wrapper and OUTSIDE the score container.

   Add a new `perspectiveWrapperEl` div between the rotation wrapper and its children (regionEl + border elements):
   ```tsx
   <div style={{
     width: regionWidth,
     height: regionHeight,
     transform: hasPerspective(regionPerspective) ? computeMatrix3d(regionWidth, regionHeight, regionPerspective) : undefined,
     transformOrigin: '0 0',
   }}>
     {/* score container */}
     {/* borders */}
   </div>
   ```

   If no perspective is active, skip the wrapper div or render without the transform (to avoid unnecessary DOM nesting).

**SingleLineRenderer.tsx:**
Same pattern as RegularRenderer -- add a perspective wrapper div inside the rotation wrapper, around the score container and borders. Import the same utilities.

**export-service/src/standalone/render.ts:**
Same pattern but using vanilla DOM APIs (no React). After creating `rotationWrapperEl` and before appending `regionEl`:

1. Read `const regionPerspective = config.scoreRegion?.perspective;`
2. Duplicate the `computeMatrix3d` and `hasPerspective` functions inline in render.ts (following the established pattern of duplicating logic in the export service, same as animation.ts). Keep it self-contained.
3. If perspective is active, create a `perspectiveWrapperEl` div:
   ```javascript
   const perspectiveWrapperEl = document.createElement('div');
   perspectiveWrapperEl.style.width = `${regionWidth}px`;
   perspectiveWrapperEl.style.height = `${regionHeight}px`;
   perspectiveWrapperEl.style.transform = computeMatrix3d(regionWidth, regionHeight, regionPerspective);
   perspectiveWrapperEl.style.transformOrigin = '0 0';
   ```
4. Adjust DOM hierarchy: `rotationWrapperEl > perspectiveWrapperEl > regionEl` and borders are appended to perspectiveWrapperEl instead of rotationWrapperEl.
5. If no perspective, keep existing hierarchy (rotationWrapperEl > regionEl, borders on rotationWrapperEl).
  </action>
  <verify>
    TypeScript compiles: `cd /Users/emirahmed/Desktop/Manuscript/renderer && npx tsc --noEmit 2>&1 | head -20`

    Export service bundle builds: `cd /Users/emirahmed/Desktop/Manuscript/renderer/export-service && npm run build:standalone 2>&1 | tail -5`

    Open the app, adjust perspective corners in the editor, confirm the preview shows the distorted score region in the renderer.
  </verify>
  <done>
    - RegularRenderer applies matrix3d perspective via nested wrapper div inside rotation wrapper
    - SingleLineRenderer applies same matrix3d perspective pattern
    - Export service standalone render.ts applies same perspective transform with duplicated computeMatrix3d
    - Borders distort together with score content (inside perspective wrapper)
    - Rotation and perspective compose correctly (rotation on outer wrapper, perspective on inner wrapper)
    - Existing behavior unchanged when no perspective offsets are set
  </done>
</task>

</tasks>

<verification>
1. TypeScript compiles without errors across both frontend and export service
2. Open app, load a project with background image
3. Click "Edit Region" -- confirm 4 cyan diamond handles at corners
4. Drag one corner handle -- confirm it moves independently, the offset is visible
5. Click away to close editor -- confirm the renderer shows the perspective-distorted score
6. Refresh page -- confirm perspective persists (auto-save)
7. Export service builds successfully
</verification>

<success_criteria>
- ScoreRegion type extended with optional `perspective` field across all type definitions
- ScoreRegionEditor shows 4 draggable corner handles for perspective adjustment
- CSS matrix3d transform applied in RegularRenderer, SingleLineRenderer, and export standalone
- Perspective distortion composes with rotation (nested wrapper approach)
- Auto-save preserves perspective corners automatically (nested in scoreRegion)
- No regressions to existing drag/resize/rotate functionality
</success_criteria>

<output>
After completion, create `.planning/quick/57-add-perspective-transform-to-score-regio/57-SUMMARY.md`
</output>
