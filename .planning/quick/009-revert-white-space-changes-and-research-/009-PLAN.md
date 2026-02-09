---
id: "009"
type: quick
title: "Revert white-space removal and research SVG-to-Graphics alternatives"
files_modified:
  - src/lib/svgToTexture.ts
autonomous: true
---

<objective>
Revert failed white-space removal code from svgToTexture.ts and research alternatives for loading Verovio SVGs as PixiJS Graphics (vector-based) rather than rasterized textures.

Purpose: The texture approach has inherent limitations - white backgrounds persist despite multiple removal attempts (rect removal, pixel manipulation). Vector-based Graphics would provide better quality and avoid the rasterization issues entirely.

Output: Clean svgToTexture.ts (reverted) + research findings on SVGO, SVGParser workarounds, and alternative approaches.
</objective>

<context>
@.planning/STATE.md
@src/lib/svgToTexture.ts
@src/renderers/PixiSingleLineRenderer.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Revert white-space removal code from svgToTexture.ts</name>
  <files>src/lib/svgToTexture.ts</files>
  <action>
Remove the following failed white-space removal code from svgToTexture():

1. Remove the DOMParser/serializer block (lines ~201-251) that:
   - Parses SVG with DOMParser
   - Removes rects (first rect, white-fill rects, 0,0 positioned large rects)
   - Re-serializes with XMLSerializer

2. Remove the pixel manipulation block (lines ~286-297) that:
   - Gets imageData from canvas
   - Iterates pixels to make white (>250) transparent
   - Puts modified imageData back

3. Restore the simpler data URI approach:
   - Preprocess SVG with preprocessSvgForTint()
   - Create blob URL directly from SVG string
   - Load image, create texture

Keep the dimension extraction and GPU limit checking logic.

The function should return to a clean state that simply converts SVG to texture without manipulation attempts.
  </action>
  <verify>
TypeScript compiles without errors: `npm run typecheck`
Score renders (white background is expected/acceptable for now)
  </verify>
  <done>
svgToTexture.ts contains clean, simple SVG-to-texture conversion without failed white-space removal attempts.
  </done>
</task>

<task type="auto">
  <name>Task 2: Research SVG-to-Graphics alternatives</name>
  <files>.planning/quick/009-revert-white-space-changes-and-research-/009-RESEARCH.md</files>
  <action>
Research and document alternatives for rendering Verovio SVGs as vector Graphics in PixiJS:

1. **SVGO Library**
   - Can it simplify complex Verovio SVGs?
   - Which plugins would help (removeUnknowns, convertPathData, mergePaths)?
   - Would simplified SVGs work with PixiJS SVGParser?

2. **PixiJS SVGParser limitations**
   - What elements does SVGParser support vs not support?
   - What Verovio elements cause failures (text, use, defs, clipPath)?
   - Is there a subset of SVG that would work?

3. **Alternative approaches**
   - pixi-svg library (third-party)
   - @nicatspark/pixi-svg or similar forks
   - Custom path parser for music notation elements
   - Hybrid: Graphics for simple elements, textures for complex

4. **Recommendation**
   - Which approach is most viable for Verovio output?
   - Effort vs benefit analysis
   - Short-term vs long-term solutions

Include code snippets showing how each approach would integrate.
  </action>
  <verify>
Research document exists at .planning/quick/009-revert-white-space-changes-and-research-/009-RESEARCH.md
Contains concrete findings for each area
  </verify>
  <done>
Research document provides actionable recommendations for SVG-to-Graphics conversion approaches.
  </done>
</task>

</tasks>

<verification>
- `npm run typecheck` passes
- svgToTexture.ts is simplified (no rect removal, no pixel manipulation)
- Research document exists with concrete findings
</verification>

<success_criteria>
1. svgToTexture.ts reverted to clean state without failed white-space hacks
2. Research document provides clear recommendation on best path forward for vector-based SVG rendering
</success_criteria>

<output>
After completion, the user can decide whether to:
- Accept white background temporarily while pursuing vector approach
- Implement SVGO preprocessing if research shows promise
- Use hybrid texture/graphics approach
</output>
