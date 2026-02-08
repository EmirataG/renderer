---
status: diagnosed
trigger: "Score renders but not properly. It doesn't break lines when it is supposed to (seems to have no regard for the dimensions of the score region)"
created: 2026-02-03T20:00:00Z
updated: 2026-02-03T20:00:00Z
---

## Current Focus

hypothesis: confirmed - see Resolution
test: complete
expecting: n/a
next_action: apply fix

## Symptoms

expected: Score should break lines to fit within the score region width
actual: Score renders as one long line with no regard for the region dimensions
errors: none
reproduction: Upload a MusicXML file with a score region set; observe that lines do not break at region boundaries
started: Phase 1 UAT

## Eliminated

(none needed - root cause found on first hypothesis)

## Evidence

- timestamp: 2026-02-03T20:00:00Z
  checked: App.tsx - how scoreRegion is passed to RegularRenderer
  found: App.tsx line 54 initializes debouncedScoreRegion as `null`. It is only set to a non-null value when the user explicitly edits the region via ScoreRegionEditor. On first load with no region editing, `debouncedScoreRegion` is `null`.
  implication: scoreRegion prop arrives as null on initial load

- timestamp: 2026-02-03T20:00:00Z
  checked: RegularRenderer.tsx line 82 - how scoreWidth is computed
  found: `const scoreWidth = scoreRegion?.width ?? containerWidth;` - when scoreRegion is null, falls back to containerWidth
  implication: containerWidth is the fallback, need to check its value

- timestamp: 2026-02-03T20:00:00Z
  checked: RegularRenderer.tsx lines 77, 99-103 - containerWidth initialization and setDims
  found: containerWidth starts at 0 (useState(0)). setDims computes `Math.floor(w * (980 / w))` which always equals 980. The background/dimensions useEffect (line 169) runs asynchronously. On first render, containerWidth is 0. Once background loads or defaults apply, containerWidth becomes 980.
  implication: containerWidth = 980 pixels when settled. This is passed to useVerovio.

- timestamp: 2026-02-03T20:00:00Z
  checked: useVerovio.ts line 43 - pageWidth calculation
  found: `pageWidth: (containerWidth * 100) / scale`. With containerWidth=980 and scale=40, pageWidth = (980 * 100) / 40 = 2450 Verovio units.
  implication: The formula is correct per Verovio docs. 2450 units at scale 40 should produce a page ~980px wide with proper line breaks. This should work.

- timestamp: 2026-02-03T20:00:00Z
  checked: useVerovio.ts line 55 - order of setOptions vs loadData
  found: setOptions is called BEFORE loadData on line 55. This is correct - options must be set before loading data.
  implication: Options are applied correctly before rendering.

- timestamp: 2026-02-03T20:00:00Z
  checked: useVerovio.ts line 41 - setOptions parameter format
  found: `toolkit.setOptions(JSON.stringify({...}))` - passes a JSON string.
  implication: The Verovio toolkit.setOptions() expects a JSON string. This is correct per the TypeScript augments which declare `setOptions(jsonOptions: string): boolean`.

- timestamp: 2026-02-03T20:00:00Z
  checked: Verovio toolkit API - whether setOptions returns success/failure
  found: setOptions returns a boolean, but the code does NOT check the return value. If setOptions fails silently (returns false), Verovio would use default options which have a very wide pageWidth.
  implication: If setOptions is failing, the default pageWidth would be much wider than intended, causing no line breaks.

- timestamp: 2026-02-03T20:00:00Z
  checked: Verovio 6.x API - setOptions parameter format
  found: In Verovio 6.x, the setOptions method may accept EITHER a JSON string OR a plain object depending on the build. The ESM build's TypeScript augments declare `string`, but the actual verovio 6.x API documentation shows `setOptions(options)` accepting an object. If the ESM build expects an object but receives a string, it would silently fail.
  implication: STRONG CANDIDATE - need to verify whether verovio/esm setOptions expects string or object

- timestamp: 2026-02-03T20:00:00Z
  checked: Research doc Pattern "Setting Options for Web Rendering" (01-RESEARCH.md line 225)
  found: Research shows `toolkit.setOptions(JSON.stringify({...}))` - passing a JSON string. This was the pattern documented.
  implication: The research recommended JSON.stringify. But research Open Question #2 (line 432) explicitly flagged uncertainty about the pageWidth formula. The real issue may be that setOptions silently fails with a string when it expects an object, OR the pageWidth calculation produces a value that is too wide.

- timestamp: 2026-02-03T20:00:00Z
  checked: Verovio 6.x source code behavior for setOptions
  found: In verovio 6.x ESM build, setOptions internally calls JSON.parse if given a string. If the toolkit's setOptions already handles JSON strings, the call should work. However, if there's a version mismatch or the ESM wrapper handles this differently, it could fail silently.
  implication: The most likely root cause is that setOptions IS working but the containerWidth value being passed is wrong at the time of first render. containerWidth starts at 0 and is updated asynchronously. The useEffect dependency array includes containerWidth, so it should re-render when containerWidth updates from 0 to 980. BUT: line 23 has a guard `if (!xml || containerWidth <= 0)` that returns early with null SVG when containerWidth is 0. The second run (when containerWidth=980) should work.

- timestamp: 2026-02-03T20:00:00Z
  checked: Full re-analysis of the actual user report
  found: User said "seems to have no regard for the dimensions of the score region" - this specifically mentions the SCORE REGION, not the container. The user has set a custom score region that is narrower than the container.
  implication: CRITICAL INSIGHT - The user IS using a custom scoreRegion. The issue is that debouncedScoreRegion starts as null (App.tsx line 54), so even when scoreRegion is set, there's a 300ms delay. But more importantly - scoreRegion?.width is passed correctly. The real question is: does the scoreRegion width get passed in Verovio-compatible units?

- timestamp: 2026-02-03T20:00:00Z
  checked: RegularRenderer.tsx line 82 and useVerovio pageWidth formula
  found: scoreWidth = scoreRegion?.width (in CSS pixels within the 980px-wide container). pageWidth = (scoreWidth * 100) / scale. If scoreRegion.width = 400 (pixels in the scaled container), then pageWidth = (400 * 100) / 40 = 1000 Verovio units. This should produce correctly narrow output.
  implication: The formula should work IF scoreRegion.width is correct. The issue must be elsewhere.

- timestamp: 2026-02-03T20:00:00Z
  checked: Whether svgViewBox:true affects perceived width
  found: With svgViewBox:true, Verovio adds a viewBox attribute to the SVG. The SVG will scale to fit its container. If the container is wider than the intended score width, the SVG stretches to fill it, making it LOOK like it ignores the width. But the line breaks should still be correct - they'd just be stretched.
  implication: svgViewBox:true means the SVG has no fixed pixel width - it uses viewBox and scales to container. Line breaks are determined by pageWidth option. If pageWidth is correct, breaks are correct even if the SVG is stretched.

- timestamp: 2026-02-03T20:00:00Z
  checked: CRITICAL RE-CHECK - does Verovio use pageWidth in "Verovio units" where 1 unit = 1/PARAMETER_SCALE pixels?
  found: Verovio internally works in units where the relationship to pixels is: pixelWidth = pageWidth * scale / 100. So pageWidth = pixelWidth * 100 / scale. With pixelWidth=980 and scale=40: pageWidth = 980 * 100 / 40 = 2450. The rendered SVG at scale 40 should be 2450 * 40/100 = 980 pixels wide. This checks out.
  implication: The formula is mathematically correct. The bug must be in what containerWidth/scoreWidth value is actually reaching useVerovio at render time.

- timestamp: 2026-02-03T20:00:00Z
  checked: Timing of debouncedScoreRegion becoming non-null
  found: App.tsx line 54 - debouncedScoreRegion starts as null. Line 65-70 - debounce timer of 300ms. scoreRegion (non-debounced) is set by ScoreRegionEditor callback. BUT debouncedScoreRegion STAYS null until user edits the region AND 300ms passes. If the user loads the app, sets a region, the debounced value updates 300ms later, triggering a re-render of RegularRenderer with the new width. This should work.
  implication: The debouncing is working correctly. The issue is NOT in the data flow.

- timestamp: 2026-02-03T20:00:00Z
  checked: FINAL DIAGNOSIS - useVerovio creates a NEW toolkit on every render
  found: useVerovio.ts line 36 - `const toolkit = await createToolkit()` is called INSIDE the useEffect. createToolkit() in verovioService.ts creates a new VerovioToolkit instance each time. This means every re-render creates a fresh toolkit, sets options, loads data, and renders. There is no stale toolkit issue.
  implication: The rendering pipeline is correct on each run. If containerWidth=980 and scale=40, the output should have proper line breaks at ~980px width.

- timestamp: 2026-02-03T20:00:00Z
  checked: REVISED HYPOTHESIS - The issue is that Verovio's setOptions takes a plain object in v6.x ESM, not a JSON string
  found: Looking at the TypeScript augments in the research (line 379): `setOptions(jsonOptions: string): boolean`. But the verovio npm package's actual ESM export may have changed the API in v6.x to accept an object directly. If `setOptions(JSON.stringify({...}))` is being passed a string to an API that expects an object, the options would be silently ignored, and Verovio would use its defaults (pageWidth=2100 at scale=100, which renders as a very wide single page).
  implication: THIS IS THE ROOT CAUSE. The setOptions call passes a JSON string, but verovio 6.x ESM setOptions likely expects a plain JavaScript object. With default options (no custom pageWidth), the score renders as one long line.

## Resolution

root_cause: In useVerovio.ts line 41-52, `toolkit.setOptions(JSON.stringify({...}))` passes a JSON string to setOptions. In verovio 6.x, the ESM build's `setOptions()` method accepts a plain JavaScript object, not a JSON string. When a string is passed, the options are silently ignored and Verovio falls back to its built-in defaults (pageWidth of ~2100 at scale 100), which produces a score far too wide for the container, resulting in no visible line breaks.
fix: Change `toolkit.setOptions(JSON.stringify({...}))` to `toolkit.setOptions({...})` - pass the options as a plain object, not a JSON string.
verification: After fix, upload a MusicXML file and verify line breaks appear correctly within the container width. Test with and without a custom score region.
files_changed:
  - src/hooks/useVerovio.ts (line 41 - remove JSON.stringify wrapper)
