---
phase: 43-fix-notehead-z-index
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/lib/noteAnimation.ts
  - src/renderers/RegularRenderer.tsx
  - src/renderers/SingleLineRenderer.tsx
autonomous: true

must_haves:
  truths:
    - "Colored noteheads are fully visible above stems during playback animation"
    - "Colored noteheads are fully visible above stems in export/render mode (animationController)"
    - "Score renders identically when no coloring is active (no visual regression)"
  artifacts:
    - path: "src/lib/noteAnimation.ts"
      provides: "reorderNoteheadsAboveStems utility function"
      exports: ["reorderNoteheadsAboveStems"]
    - path: "src/renderers/RegularRenderer.tsx"
      provides: "Post-render DOM reordering call for paginated mode"
    - path: "src/renderers/SingleLineRenderer.tsx"
      provides: "Post-render DOM reordering call for single-line mode"
  key_links:
    - from: "src/renderers/RegularRenderer.tsx"
      to: "src/lib/noteAnimation.ts"
      via: "import reorderNoteheadsAboveStems"
      pattern: "reorderNoteheadsAboveStems"
    - from: "src/renderers/SingleLineRenderer.tsx"
      to: "src/lib/noteAnimation.ts"
      via: "import reorderNoteheadsAboveStems"
      pattern: "reorderNoteheadsAboveStems"
---

<objective>
Fix colored noteheads being obscured by stems in SVG rendering.

Purpose: In SVG, there is no z-index property -- rendering order is determined by DOM order (later elements paint on top of earlier ones). Verovio generates SVG where `g.stem` elements appear after `g.notehead` within each `g.note` group, causing stems to paint over noteheads. When noteheads are colored (during playback highlighting or export), the stem obscures the colored notehead. The fix reorders DOM elements within each `g.note` so that `g.notehead` is the last child, ensuring noteheads always paint on top of stems.

Output: Utility function + integration in both renderers, colored noteheads render cleanly above stems.
</objective>

<execution_context>
@.planning/quick/43-fix-notehead-z-index-so-colored-notehead/43-PLAN.md
</execution_context>

<context>
@src/lib/noteAnimation.ts
@src/renderers/RegularRenderer.tsx
@src/renderers/SingleLineRenderer.tsx
@src/lib/animationController.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create DOM reordering utility and integrate into both renderers</name>
  <files>
    src/lib/noteAnimation.ts
    src/renderers/RegularRenderer.tsx
    src/renderers/SingleLineRenderer.tsx
  </files>
  <action>
In `src/lib/noteAnimation.ts`, add and export a new function `reorderNoteheadsAboveStems(root: HTMLElement | null): void` that:

1. Takes a root container element (the score container)
2. Queries all `g.note` elements within the root
3. For each `g.note`, finds any `g.notehead` child elements
4. For each `g.notehead`, calls `parentElement.appendChild(notehead)` to move it to be the last child of its parent `g.note` group -- this is a DOM move (not clone), so it simply reorders the existing element to render last (on top) in SVG painter's order
5. Also handle `g.chord` containers: within a chord group, notes contain noteheads but the stem is a direct child of the chord. Query `g.chord` elements and for each, find `g.notehead` descendants and ensure each notehead's parent `g.note` is moved to be after `g.stem` within the chord. Specifically: for each `g.chord`, find the `g.stem` child and all `g.note` children. Append each `g.note` after the `g.stem` (they may already be, but this ensures stems are before notes in DOM order).

Actually, the simpler and more robust approach: For EVERY `g.notehead` found anywhere in the root, move it to be the last child of its direct parent. This handles both `g.note > g.notehead` (single notes) and any nested structure. The stem is a sibling of the notehead within `g.note`, so making notehead last ensures it paints on top.

Implementation:
```typescript
export function reorderNoteheadsAboveStems(root: HTMLElement | null): void {
  if (!root) return;
  const noteheads = root.querySelectorAll<SVGGElement>('g.notehead');
  noteheads.forEach((nh) => {
    const parent = nh.parentElement;
    if (parent && parent.lastElementChild !== nh) {
      parent.appendChild(nh);
    }
  });
}
```

In `src/renderers/RegularRenderer.tsx`:
- Import `reorderNoteheadsAboveStems` from `../lib/noteAnimation`
- In the existing `useEffect` that fires when `svgPages` change (around line 231), inside the `requestAnimationFrame` callback, AFTER the Verovio SVG guard check and BEFORE `resetNoteheadAnimations(scoreRef.current)`, add:
  ```
  reorderNoteheadsAboveStems(scoreRef.current);
  ```
  This must run before resetNoteheadAnimations so the DOM order is correct before any animation state is cleared.

In `src/renderers/SingleLineRenderer.tsx`:
- Import `reorderNoteheadsAboveStems` from `../lib/noteAnimation`
- In the existing `useEffect` that fires when `sections` change (around line 236), inside the `requestAnimationFrame` callback, AFTER the Verovio SVG guard check and BEFORE `resetNoteheadAnimations(scoreRef.current)`, add:
  ```
  reorderNoteheadsAboveStems(scoreRef.current);
  ```

Note: The animationController.ts file does NOT need changes -- it only applies color to existing DOM elements via querySelector; the DOM reorder from the renderers persists and the controller's coloring will naturally benefit from noteheads being on top.
  </action>
  <verify>
1. `npx tsc --noEmit` compiles without errors
2. Run the app, load a score, start playback -- colored noteheads should appear fully visible on top of stems
3. Check in browser DevTools: within any `g.note` element, `g.notehead` should be the last child element
  </verify>
  <done>
Colored noteheads render visually above stems in both RegularRenderer and SingleLineRenderer during playback animation and export rendering. No visual regression when coloring is inactive (reorder is paint-order only, no style changes).
  </done>
</task>

</tasks>

<verification>
1. TypeScript compiles cleanly: `npx tsc --noEmit`
2. Load a score in paginated (regular) mode, play audio -- noteheads colored during playback are fully visible, stems do not obscure them
3. Load a score in single-line mode, play audio -- same visual confirmation
4. Inspect SVG DOM: within `g.note` groups, `g.notehead` is the last child element
5. Score appearance is identical when not animating (no unintended visual side effects from reordering)
</verification>

<success_criteria>
- Colored noteheads are fully visible above stems in both renderer modes
- No TypeScript errors
- No visual regression when coloring is not active
- DOM reordering runs once per SVG render (not per frame)
</success_criteria>

<output>
After completion, create `.planning/quick/43-fix-notehead-z-index-so-colored-notehead/43-SUMMARY.md`
</output>
