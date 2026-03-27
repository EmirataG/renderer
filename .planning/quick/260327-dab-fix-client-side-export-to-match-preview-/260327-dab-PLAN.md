---
phase: quick
plan: 260327-dab
type: execute
wave: 1
depends_on: []
files_modified:
  - src/lib/clientExport/index.ts
autonomous: true
requirements: []

must_haves:
  truths:
    - "Client export output matches preview dimensions (aspect ratio from background image, not hardcoded 1920x1080)"
    - "Client export camera scrolling matches preview (containerHeight derived from actual image dimensions)"
    - "Client export SVG color rendering matches preview (fill=none elements preserved)"
  artifacts:
    - path: "src/lib/clientExport/index.ts"
      provides: "Fixed client export with dynamic dimensions and correct CSS"
  key_links:
    - from: "src/lib/clientExport/index.ts"
      to: "src/renderers/RegularRenderer.tsx"
      via: "Same dimension/animation logic"
      pattern: "viewportWidth.*viewportHeight"
---

<objective>
Fix client-side export to match preview dimensions and animations.

Purpose: The client export hardcodes 1920x1080 viewport regardless of background image dimensions, causing aspect ratio mismatch and incorrect camera scrolling compared to the preview. It also has a missing CSS rule for `fill="none"` elements.

Output: Client export that produces video matching the preview's visual output.
</objective>

<context>
@src/lib/clientExport/index.ts
@src/renderers/RegularRenderer.tsx
@export-service/src/browser/pageSetup.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix viewport dimensions, container height, and SVG color CSS</name>
  <files>src/lib/clientExport/index.ts</files>
  <action>
Three bugs cause the client export to not match the preview:

**Bug 1 -- Hardcoded viewport dimensions (1920x1080)**

The preview (RegularRenderer) loads the background image, reads its `naturalWidth` and `naturalHeight`, then scales to fit `WIDTH=980`:
```
f = WIDTH / img.naturalWidth
containerWidth = Math.floor(img.naturalWidth * f)  // always 980
containerHeight = Math.floor(img.naturalHeight * f)
```
The export viewport is then `containerWidth * scaleFactor` x `containerHeight * scaleFactor` where `scaleFactor = viewportWidth / EDITOR_WIDTH`.

The server-side export (pageSetup.ts) correctly reads actual image dimensions via `buildBgInfo()` and uses them as `viewportWidth/viewportHeight`.

The client export hardcodes `viewportWidth = 1920` and `viewportHeight = 1080`. Fix: when `bgImageUrl` is provided, load the image to get its natural dimensions and use those as `viewportWidth` and `viewportHeight`. When no bg image, default to 1920x1080 (matching the preview's default `setDims(1920, 1080)`).

Specifically, before the "Compute layout constants" section (step 1), add image dimension loading:

```typescript
let viewportWidth = 1920;
let viewportHeight = 1080;
if (bgImageUrl) {
  const dims = await new Promise<{ w: number; h: number }>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => reject(new Error('Failed to load background image for dimensions'));
    img.src = bgImageUrl;
  });
  viewportWidth = dims.w;
  viewportHeight = dims.h;
}
```

Then remove the hardcoded `const viewportWidth = 1920` and `const viewportHeight = 1080` lines. The rest of the code (scaleFactor, containerWidth, containerHeight) flows correctly from there.

**Bug 2 -- Missing fill="none" preservation CSS**

The preview has this CSS rule that the client export lacks:
```css
.preview-score svg [fill="none"] {
  fill: none !important;
}
```

Without it, SVG elements that have `fill="none"` (like certain decorative elements) get overridden by the scoreColor fill rule, causing visual differences.

Add this rule to BOTH `buildScoreColorCss()` and `inlineScoreColorInSvg()`:

In `buildScoreColorCss`, add after the existing `fill: ${scoreColor}` rules:
```css
.client-export-score svg [fill="none"] {
  fill: none !important;
}
```

In `inlineScoreColorInSvg`, add after the existing inline style rules:
```css
[fill="none"] { fill: none !important; }
```

**Bug 3 -- Canvas and encoder use stale hardcoded dimensions**

Verify that the canvas dimensions (`canvas.width`, `canvas.height`) and the `VideoExporter` config use the dynamic `viewportWidth`/`viewportHeight` variables (they already reference these variable names, so once Bug 1 is fixed, they will automatically use the correct values).
  </action>
  <verify>
    TypeScript compilation: npx tsc --noEmit --project tsconfig.json 2>&1 | head -20
  </verify>
  <done>
    - viewportWidth/viewportHeight derived from background image natural dimensions (or 1920x1080 default)
    - buildScoreColorCss and inlineScoreColorInSvg include fill="none" preservation rule
    - Canvas and encoder use dynamic dimensions
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>Fixed client export dimensions and CSS to match preview</what-built>
  <how-to-verify>
    1. Open a project with a background image (ideally non-16:9 aspect ratio to make dimension issues obvious)
    2. Play the preview -- note the score position, scrolling behavior, and visual appearance
    3. Click "Export Video" and wait for the client-side export to complete
    4. Open the exported MP4 and compare:
       a. Video dimensions should match the background image aspect ratio (not always 1920x1080)
       b. Score scrolling/camera movement should match the preview
       c. Staff lines and other fill="none" elements should render correctly (not filled with score color)
    5. Also test with no background image -- should default to 1920x1080
  </how-to-verify>
  <resume-signal>Type "approved" or describe issues</resume-signal>
</task>

</tasks>

<verification>
- TypeScript compiles without errors
- Exported video dimensions match background image dimensions
- Camera scrolling in export matches preview playback
- SVG rendering fidelity matches preview (fill="none" preserved)
</verification>

<success_criteria>
Client-side export produces video that visually matches the preview in both dimensions and animation behavior.
</success_criteria>

<output>
After completion, create `.planning/quick/260327-dab-fix-client-side-export-to-match-preview-/260327-dab-SUMMARY.md`
</output>
