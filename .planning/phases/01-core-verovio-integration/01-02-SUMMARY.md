---
plan: 01-02
phase: 01-core-verovio-integration
status: complete
commits:
  - b5ddb7e feat(01-02): swap RegularRenderer from OSMD to Verovio rendering with CSS color migration
  - e7f4bfb feat(01-02): update noteAnimation and animationController selectors for Verovio SVG
  - fd9a28b fix(01-02): fix setOptions to pass plain object and add polygon to color selector
  - bd7147b fix(01-02): stabilize score color styling across re-renders
---

## What was done

### Task 1: Swap RegularRenderer from OSMD to Verovio
- Replaced OSMD rendering with `useVerovio` hook + `dangerouslySetInnerHTML`
- Added CSS color cascade for Verovio SVG (color on svg.definition-scale, fill on shape elements)
- Targeted staff lines with stroke-only styling (no fill)

### Task 2: Update animation selectors for Verovio SVG
- Changed `.vf-notehead` → `g.notehead` and `path, ellipse` → `use` in noteAnimation.ts
- Updated animationController.ts selectors and removed OSMD instance dependency
- Fixed SyncEditor.tsx which also passed osmdInstance (deviation handled)

### Fixes applied during UAT
1. **setOptions JSON.stringify bug**: Verovio 6.x ESM expects plain object, not JSON string. Removed wrapper — fixed line breaks and region-responsive layout.
2. **Beam coloring**: Added `polygon` to CSS fill selector (Verovio renders beams as `<polygon>`)
3. **Dot coloring**: Added `ellipse` to CSS fill selector (Verovio renders dots as `<ellipse>`)
4. **Staff line thickness**: Removed `stroke-width: 1 !important` override that made staff lines invisible
5. **Color stability**: Moved CSS from manually-appended DOM style element to React-managed `<style>` JSX tag to survive `dangerouslySetInnerHTML` updates
6. **Type declaration**: Updated `setOptions` in verovio-augments.d.ts to accept `Record<string, unknown> | string`
