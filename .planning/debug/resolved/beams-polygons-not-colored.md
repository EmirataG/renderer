---
status: diagnosed
trigger: "beams (polygons in the svg) are not colored"
created: 2026-02-03T20:00:00Z
updated: 2026-02-03T20:00:00Z
---

## Current Focus

hypothesis: confirmed - see Resolution
test: complete
expecting: n/a
next_action: apply fix

## Symptoms

expected: All score elements change to the user-chosen color, including beams
actual: Beams (polygon elements in the SVG) are not colored
errors: none
reproduction: Upload a MusicXML file with beamed notes, change the score color picker - beams stay black while other elements change color
started: Phase 1 UAT

## Eliminated

(none needed - root cause found directly from code inspection)

## Evidence

- timestamp: 2026-02-03T20:00:00Z
  checked: verovio_examples/sample1.svg - how beams are rendered
  found: Beams are rendered as `<polygon>` elements inside `<g class="beam">` groups. Example: `<polygon fill-opacity="1" points="4045,3159 4783,3159 4783,3069 4045,3069"></polygon>`. There are 20 polygon elements in the sample SVG.
  implication: Beams are definitely polygon elements, not path or rect.

- timestamp: 2026-02-03T20:00:00Z
  checked: verovio_examples/sample1.svg line 71 - embedded stylesheet
  found: The SVG stylesheet contains `ellipse, path, polygon, polyline, rect {stroke:currentColor}` - this sets stroke via currentColor for polygons. But it does NOT set fill for polygons.
  implication: Setting CSS `color` on the SVG root cascades to stroke via currentColor, but fill must be set separately via CSS rules targeting polygon elements.

- timestamp: 2026-02-03T20:00:00Z
  checked: RegularRenderer.tsx lines 278-282 - CSS fill rules
  found: The fill rules target `path`, `rect`, and `use` elements only:
    ```
    .preview-score svg path,
    .preview-score svg rect,
    .preview-score svg use {
      fill: ${scoreColor};
    }
    ```
    There is NO rule targeting `polygon` elements.
  implication: ROOT CAUSE CONFIRMED. Polygon elements are missing from the CSS fill rules. The `color` property on svg.definition-scale (line 274) handles stroke via currentColor, but polygons need explicit fill rules too.

- timestamp: 2026-02-03T20:00:00Z
  checked: 01-RESEARCH.md Pattern 4 (lines 126-141) - recommended CSS
  found: The research document's Pattern 4 example CSS (line 129-133) ALSO does not include polygon in the fill selectors:
    ```
    .preview-score svg path,
    .preview-score svg rect,
    .preview-score svg use {
      fill: ${scoreColor};
    }
    ```
    However, line 122 explicitly notes: "line 71 of sample1.svg contains: ellipse, path, polygon, polyline, rect {stroke:currentColor}" - the research identified that polygon exists but the example CSS pattern omitted it from fill rules.
  implication: The research identified the polygon elements but the recommended CSS pattern was incomplete - it missed adding polygon to the fill selectors.

## Resolution

root_cause: In RegularRenderer.tsx lines 279-281, the CSS fill rules target `path`, `rect`, and `use` elements but do NOT include `polygon`. Verovio renders beams as `<polygon>` elements (confirmed by 20 polygon elements in sample1.svg). While the `color` property on the SVG root cascades to strokes via `currentColor`, the fill color for polygons is not set, so beams retain their default black fill.
fix: Add `polygon` to the CSS fill selector in RegularRenderer.tsx. Change the rule from `.preview-score svg path, .preview-score svg rect, .preview-score svg use` to `.preview-score svg path, .preview-score svg rect, .preview-score svg polygon, .preview-score svg use`.
verification: After fix, upload a MusicXML file with beamed notes, change the score color - all beams should change color along with other elements.
files_changed:
  - src/renderers/RegularRenderer.tsx (lines 279-281 - add polygon to fill selector)
