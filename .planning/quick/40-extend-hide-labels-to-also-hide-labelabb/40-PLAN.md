---
phase: quick-40
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/renderers/RegularRenderer.tsx
  - src/renderers/SingleLineRenderer.tsx
autonomous: true
must_haves:
  truths:
    - "When hideLabels is enabled, elements with class 'label' are hidden"
    - "When hideLabels is enabled, elements with class 'labelAbbr' are also hidden"
    - "Export pipeline inherits the same behavior via RenderApp"
  artifacts:
    - path: "src/renderers/RegularRenderer.tsx"
      provides: "CSS rule targeting both .label and .labelAbbr"
      contains: ".labelAbbr"
    - path: "src/renderers/SingleLineRenderer.tsx"
      provides: "CSS rule targeting both .label and .labelAbbr"
      contains: ".labelAbbr"
  key_links:
    - from: "src/renderers/RegularRenderer.tsx"
      to: "SVG .label and .labelAbbr elements"
      via: "CSS display:none rule"
      pattern: "\\.label.*\\.labelAbbr.*display:\\s*none"
    - from: "src/renderers/SingleLineRenderer.tsx"
      to: "SVG .label and .labelAbbr elements"
      via: "CSS display:none rule"
      pattern: "\\.label.*\\.labelAbbr.*display:\\s*none"
---

<objective>
Extend the "Hide Instrument Labels" CSS rule to also hide `.labelAbbr` elements.

Purpose: The hideLabels feature (quick-39) only hides elements with class `label`. Verovio also generates abbreviated labels with class `labelAbbr` which remain visible. Both must be hidden.
Output: Updated CSS selectors in both renderers.
</objective>

<execution_context>
@/Users/emirahmed/.claude/get-shit-done/workflows/execute-plan.md
@/Users/emirahmed/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@src/renderers/RegularRenderer.tsx
@src/renderers/SingleLineRenderer.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Extend hideLabels CSS selector to include .labelAbbr</name>
  <files>src/renderers/RegularRenderer.tsx, src/renderers/SingleLineRenderer.tsx</files>
  <action>
In both RegularRenderer.tsx (line 318) and SingleLineRenderer.tsx (line 331), change the hideLabels CSS rule from:

```
${hideLabels ? '.preview-score .label { display: none !important; }' : ''}
```

to:

```
${hideLabels ? '.preview-score .label, .preview-score .labelAbbr { display: none !important; }' : ''}
```

This adds `.preview-score .labelAbbr` as a second selector in the same CSS rule. No other files need changes -- the export pipeline passes hideLabels to RenderApp which uses these same renderers.
  </action>
  <verify>
    grep -n "labelAbbr" src/renderers/RegularRenderer.tsx src/renderers/SingleLineRenderer.tsx
    Both files should show the updated CSS rule containing `.labelAbbr`.
    Run: npm run build (confirm no TypeScript errors)
  </verify>
  <done>Both RegularRenderer and SingleLineRenderer hide .label AND .labelAbbr elements when hideLabels is true. Export pipeline inherits the fix automatically.</done>
</task>

</tasks>

<verification>
- grep confirms `.labelAbbr` appears in both renderer files
- npm run build succeeds
</verification>

<success_criteria>
- The hideLabels CSS rule in RegularRenderer.tsx targets both `.label` and `.labelAbbr`
- The hideLabels CSS rule in SingleLineRenderer.tsx targets both `.label` and `.labelAbbr`
- Build passes with no errors
</success_criteria>

<output>
After completion, create `.planning/quick/40-extend-hide-labels-to-also-hide-labelabb/40-SUMMARY.md`
</output>
