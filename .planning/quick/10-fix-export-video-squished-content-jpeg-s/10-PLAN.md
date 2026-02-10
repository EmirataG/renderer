---
phase: quick-10
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/RenderApp.tsx
  - src/renderers/RegularRenderer.tsx
  - export-service/src/browser/captureFrames.ts
  - src/App.tsx
autonomous: true

must_haves:
  truths:
    - "Score fills the entire video frame, not squished in top-left corner"
    - "scoreRegion coordinates scale proportionally from 980px to viewport dimensions"
    - "Background image only rendered once (in RenderApp outer div, not duplicated inside RegularRenderer)"
    - "Screenshots use JPEG format for 2-3x faster capture"
    - "Default FPS is 30 not 60"
---

<objective>
Fix three issues: (1) score region coordinates must scale from 980px editor to actual viewport, (2) background rendered once not twice, (3) JPEG screenshots + 30fps default.

Root cause analysis from screenshot:
- scoreRegion is set at WIDTH=980 scale in the interactive editor (e.g. x=50, y=30, width=450, height=280)
- In render mode with viewport 1920x1080, containerWidth=1920 but scoreRegion values are still 980-scale
- The score region div is positioned at the 980-scale coords, making the score appear in the top-left ~30% of the frame
- Additionally, bgUrl is set on BOTH the RenderApp outer div AND inside RegularRenderer (line 783), creating a double background
</objective>

<tasks>

<task type="auto">
  <name>Task 1: Fix score region scaling, remove double background, JPEG + 30fps</name>
  <files>
    src/RenderApp.tsx
    src/renderers/RegularRenderer.tsx
    export-service/src/browser/captureFrames.ts
    src/App.tsx
  </files>
  <action>
  **RenderApp.tsx -- Scale scoreRegion and don't pass bgUrl to RegularRenderer:**

  1. In RenderApp, compute a scale factor: `scaleFactor = config.viewportWidth / 980` (980 is the WIDTH constant used in the interactive editor). When scoreRegion exists, scale all four values (x, y, width, height) by this factor before passing to RegularRenderer.

  2. Do NOT pass `bgUrl` to RegularRenderer in render mode. The background is already rendered by the RenderApp outer div. Passing it again causes the double background issue.

  **RegularRenderer.tsx -- No scoreRegion in setDims dependency; handle missing bgUrl gracefully in render mode:**

  3. When `viewportWidth` and `viewportHeight` are set, `setDims` already returns early. But the bgUrl useEffect still calls setDims. In render mode without bgUrl prop, the else branch calls `setDims(1920, 1080)` -- this works fine because setDims short-circuits. No change needed here.

  **captureFrames.ts -- JPEG screenshots:**

  4. Change `type: 'png'` to `type: 'jpeg'` and add `quality: 90` to the screenshot options.

  **App.tsx -- Default FPS 30:**

  5. Change `const [fps, setFps] = useState(60)` to `useState(30)`.
  </action>
  <verify>
  Run TypeScript compilation for both projects.
  </verify>
  <done>
  - scoreRegion scales proportionally from 980px to viewport dimensions
  - Background only in RenderApp outer div, not duplicated inside RegularRenderer
  - JPEG screenshots with quality 90
  - Default FPS 30
  </done>
</task>

</tasks>
