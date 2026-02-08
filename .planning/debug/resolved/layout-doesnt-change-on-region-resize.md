---
status: diagnosed
trigger: "the layout doesn't change at all when I change the region"
created: 2026-02-03T20:00:00Z
updated: 2026-02-03T20:00:00Z
---

## Current Focus

hypothesis: confirmed - see Resolution
test: complete
expecting: n/a
next_action: apply fix (same fix as Issue 1)

## Symptoms

expected: When the user changes the score region (resizes it), the score layout should reflow - line breaks should change to match the new region width
actual: The layout doesn't change at all when the region is changed
errors: none
reproduction: Upload a MusicXML file, set a background image, open the score region editor, resize the region - the score layout stays the same
started: Phase 1 UAT

## Eliminated

- hypothesis: useVerovio dependency array missing containerWidth/scoreWidth
  evidence: useVerovio.ts line 88 includes `[xml, containerWidth, scale]` in the dependency array. containerWidth here is the second parameter passed to useVerovio, which is scoreWidth from RegularRenderer. The dependency array is correct.
  timestamp: 2026-02-03T20:00:00Z

- hypothesis: scoreRegion changes are not debounced/propagated
  evidence: App.tsx line 65-70 debounces scoreRegion with 300ms delay. debouncedScoreRegion is passed to RegularRenderer (line 515). RegularRenderer line 82 computes scoreWidth from scoreRegion?.width. The data flow is correct.
  timestamp: 2026-02-03T20:00:00Z

## Evidence

- timestamp: 2026-02-03T20:00:00Z
  checked: Data flow from App.tsx through RegularRenderer to useVerovio
  found: App.tsx passes `debouncedScoreRegion` to RegularRenderer as `scoreRegion` prop (line 515). RegularRenderer computes `scoreWidth = scoreRegion?.width ?? containerWidth` (line 82). This scoreWidth is passed to useVerovio as the second argument (line 83). useVerovio's useEffect has `[xml, containerWidth, scale]` in its dependency array (line 88), where `containerWidth` is the `scoreWidth` value.
  implication: The data flow is correct. When scoreRegion.width changes, scoreWidth changes, which triggers useVerovio's useEffect to re-run.

- timestamp: 2026-02-03T20:00:00Z
  checked: useVerovio.ts - what happens when the effect re-runs
  found: The useEffect calls setOptions with the new containerWidth and then loadData + renderToSVG. BUT - this is the same issue as Issue 1. setOptions is called with JSON.stringify (line 41), which means options are silently ignored. Verovio uses default pageWidth on every render regardless of what width is passed.
  implication: ROOT CAUSE CONFIRMED. This is the same underlying bug as Issue 1. Because setOptions(JSON.stringify({...})) silently fails, the pageWidth never actually changes. Verovio always uses its default width, so changing the region width has no visible effect on the layout.

- timestamp: 2026-02-03T20:00:00Z
  checked: Whether Issues 1 and 3 share the same root cause
  found: Both issues stem from `toolkit.setOptions(JSON.stringify({...}))` silently failing. Issue 1 = initial render uses wrong width. Issue 3 = subsequent re-renders with new width also use wrong width. Same fix resolves both.
  implication: Fixing Issue 1 (remove JSON.stringify from setOptions) will also fix Issue 3.

## Resolution

root_cause: Same root cause as Issue 1. In useVerovio.ts line 41, `toolkit.setOptions(JSON.stringify({...}))` passes a JSON string instead of a plain object. The verovio 6.x ESM build expects a plain object. Because options are silently ignored, the pageWidth never changes regardless of what scoreWidth is passed. The score always renders with Verovio's default width, making it appear that region resizing has no effect on layout.
fix: Same fix as Issue 1 - change `toolkit.setOptions(JSON.stringify({...}))` to `toolkit.setOptions({...})` in useVerovio.ts. This single fix resolves both Issue 1 (wrong initial width) and Issue 3 (width doesn't update on region change).
verification: After fix, upload a MusicXML file, set a background, edit the score region to be narrower - the score should reflow with more line breaks to fit the narrower width.
files_changed:
  - src/hooks/useVerovio.ts (line 41 - remove JSON.stringify wrapper)
