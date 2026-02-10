---
phase: quick-9
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - export-service/src/browser/pageSetup.ts
  - export-service/src/jobs/jobManager.ts
  - src/types/global.d.ts
  - src/RenderApp.tsx
  - src/renderers/RegularRenderer.tsx
autonomous: true

must_haves:
  truths:
    - "Exported video fills the entire frame with no dead space or squished content"
    - "Background image aspect ratio determines video dimensions (not hardcoded 1920x1080)"
    - "Score animation fills the viewport matching the background, not a 980px box in the corner"
    - "Camera scrolling in render mode is smooth between events, not snapping discretely"
  artifacts:
    - path: "export-service/src/browser/pageSetup.ts"
      provides: "Background image dimension reading and viewport derivation"
      contains: "buildBgDataUrl"
    - path: "export-service/src/jobs/jobManager.ts"
      provides: "Dynamic viewport from background image dimensions"
    - path: "src/types/global.d.ts"
      provides: "viewportWidth and viewportHeight fields on ExportConfig"
    - path: "src/RenderApp.tsx"
      provides: "Passes viewport dimensions to RegularRenderer"
    - path: "src/renderers/RegularRenderer.tsx"
      provides: "Render mode uses viewport dimensions instead of WIDTH=980; smooth camera interpolation"
  key_links:
    - from: "export-service/src/browser/pageSetup.ts"
      to: "export-service/src/jobs/jobManager.ts"
      via: "buildExportConfig returns viewport dimensions; renderJob uses them for Puppeteer viewport"
      pattern: "viewportWidth|viewportHeight"
    - from: "export-service/src/jobs/jobManager.ts"
      to: "src/RenderApp.tsx"
      via: "ExportConfig injected into page contains viewportWidth/viewportHeight"
      pattern: "config\\.viewportWidth"
    - from: "src/RenderApp.tsx"
      to: "src/renderers/RegularRenderer.tsx"
      via: "viewportWidth and viewportHeight props override WIDTH=980 sizing"
      pattern: "viewportWidth|viewportHeight"
---

<objective>
Fix three critical export video bugs: (1) video dimensions derive from background image instead of hardcoded 1920x1080, (2) RegularRenderer uses viewport dimensions in render mode instead of WIDTH=980 scaling, (3) camera scrolling interpolates smoothly between events in render mode.

Purpose: Exported videos currently have wrong aspect ratio (score squished in top-left corner of 1920x1080 frame), and camera movement is jerky because it snaps between event Y positions without interpolation.

Output: Working export pipeline where video dimensions match the background image, the score fills the entire frame, and camera scrolling is smooth frame-by-frame.
</objective>

<execution_context>
@/Users/emirahmed/.claude/get-shit-done/workflows/execute-plan.md
@/Users/emirahmed/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@export-service/src/browser/pageSetup.ts
@export-service/src/jobs/jobManager.ts
@export-service/src/encoding/encodeVideo.ts
@src/RenderApp.tsx
@src/renderers/RegularRenderer.tsx
@src/types/global.d.ts
@src/main.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Dynamic viewport from background image + pass to frontend</name>
  <files>
    export-service/src/browser/pageSetup.ts
    export-service/src/jobs/jobManager.ts
    src/types/global.d.ts
  </files>
  <action>
  **pageSetup.ts - Read background image dimensions and return them from buildExportConfig:**

  1. In `buildBgDataUrl()`, change it to also return the image dimensions. Rename to `buildBgInfo()` returning `{ dataUrl: string | null, width: number, height: number }`. Read the PNG/JPEG file buffer that's already loaded for base64. Parse dimensions from the buffer header WITHOUT adding a new dependency:
     - For PNG: bytes 16-19 = width (big-endian uint32), bytes 20-23 = height
     - For JPEG: search for SOF0 marker (0xFF 0xC0), height is 2 bytes at offset+5, width at offset+7
     - For WEBP: bytes 26-27 = width (little-endian), bytes 28-29 = height (after RIFF header check)
     - If parsing fails, default to `{ width: 1920, height: 1080 }`
     - If no background file exists, default to `{ width: 1920, height: 1080 }`

  2. Add `viewportWidth: number` and `viewportHeight: number` fields to the `ExportConfig` interface in pageSetup.ts.

  3. In `buildExportConfig()`, call the new `buildBgInfo()`, set `bgUrl` from its dataUrl, and set `viewportWidth` / `viewportHeight` from the parsed dimensions.

  4. Also export a helper `getViewportFromConfig(config: ExportConfig): { width: number, height: number }` that returns `{ width: config.viewportWidth, height: config.viewportHeight }`. This is used by jobManager.

  **jobManager.ts - Use dynamic viewport:**

  5. In `renderJob()`, after `buildExportConfig()` on line 151, derive viewport from the config instead of hardcoding:
     ```
     const viewport = { width: exportConfig.viewportWidth, height: exportConfig.viewportHeight };
     ```
     Remove the hardcoded `{ width: 1920, height: 1080 }` on line 158.

  **global.d.ts - Add viewport fields to frontend ExportConfig:**

  6. Add `viewportWidth: number` and `viewportHeight: number` to the `ExportConfig` interface (after `bgUrl`).
  </action>
  <verify>
  Run `cd /Users/emirahmed/Desktop/Manuscript/renderer/export-service && npx tsc --noEmit` to verify the export-service compiles.
  Run `cd /Users/emirahmed/Desktop/Manuscript/renderer && npx tsc --noEmit` to verify the frontend compiles.
  Grep for the old hardcoded `1920` in jobManager.ts -- should NOT appear as viewport dimensions.
  </verify>
  <done>
  - `buildBgInfo()` parses PNG/JPEG/WEBP dimensions from file buffer without new dependencies
  - `ExportConfig` carries `viewportWidth` and `viewportHeight` on both backend and frontend
  - `jobManager.ts` uses config-derived viewport for Puppeteer and FFmpeg
  - Both TypeScript projects compile cleanly
  </done>
</task>

<task type="auto">
  <name>Task 2: Fix RenderApp + RegularRenderer sizing and smooth camera interpolation</name>
  <files>
    src/RenderApp.tsx
    src/renderers/RegularRenderer.tsx
  </files>
  <action>
  **RegularRenderer.tsx - Add viewport override props and smooth camera interpolation:**

  1. Add two optional props to the `Props` interface:
     ```
     viewportWidth?: number;
     viewportHeight?: number;
     ```
     Add them to the destructured props with no defaults.

  2. Modify the `setDims` function and its usage. Currently `setDims` always scales to `WIDTH=980`:
     ```
     function setDims(w: number, h: number) {
       const f = WIDTH / w;
       setContainerWidth(Math.floor(w * f));
       setContainerHeight(Math.floor(h * f));
     }
     ```
     Change: When `viewportWidth` and `viewportHeight` are provided (render mode), skip the WIDTH=980 scaling entirely:
     ```
     function setDims(w: number, h: number) {
       if (viewportWidth && viewportHeight) {
         setContainerWidth(viewportWidth);
         setContainerHeight(viewportHeight);
         return;
       }
       const f = WIDTH / w;
       setContainerWidth(Math.floor(w * f));
       setContainerHeight(Math.floor(h * f));
     }
     ```
     This means in render mode, the container is the exact viewport size (e.g., 1920x1080 matching the background), so the score fills the frame.

  3. In the `useEffect` for background/dimensions (lines 170-178), also trigger when `viewportWidth`/`viewportHeight` change. Add them to the dependency array. The logic already calls `setDims(img.naturalWidth, img.naturalHeight)` or `setDims(1920, 1080)` -- the override inside setDims handles the rest.

  4. **Smooth camera interpolation in render mode.** In the `setTimestamp` callback (line 535), after finding `currentEvent` at `currentIndex` via binary search, add Y interpolation between the current event and the next event:

     After line 560 (`const currentEvent = events[currentIndex];`), replace the camera Y section (lines 562-568) with:

     ```typescript
     // Camera Y with interpolation for smooth scrolling in render mode
     let targetY = currentEvent.y;

     // Interpolate between current event Y and next event Y based on timestamp position
     if (currentIndex < totalEvents - 1) {
       const nextEvent = events[currentIndex + 1];
       // Only interpolate if the two events have different Y positions (different systems)
       if (nextEvent.y !== currentEvent.y) {
         const segmentStart = currentEvent.computedTimestamp;
         const segmentEnd = nextEvent.computedTimestamp;
         const segmentDuration = segmentEnd - segmentStart;
         if (segmentDuration > 0) {
           const progress = (seconds - segmentStart) / segmentDuration;
           // Use ease-in-out for natural-feeling camera movement
           // cubic-bezier approximation: 3t^2 - 2t^3
           const eased = progress * progress * (3 - 2 * progress);
           targetY = currentEvent.y + (nextEvent.y - currentEvent.y) * eased;
         }
       }
     }

     eventIndexRef.current = currentIndex;
     currentYRef.current = targetY;
     applyCamera(currentYRef.current);
     ```

     This replaces the existing lines:
     ```
     eventIndexRef.current = currentIndex;
     currentYRef.current = currentEvent.y;
     applyCamera(currentYRef.current);
     ```

  **RenderApp.tsx - Pass viewport dimensions to RegularRenderer:**

  5. In `RenderApp.tsx`, pass `viewportWidth` and `viewportHeight` from config to RegularRenderer:
     ```
     <RegularRenderer
       xml={config.musicXml}
       bgUrl={config.bgUrl ?? undefined}
       fps={config.fps}
       viewportWidth={config.viewportWidth}
       viewportHeight={config.viewportHeight}
       ... (rest unchanged)
     />
     ```

  6. Also in `RenderApp.tsx`, change the outer div from `width: "100vw", height: "100vh"` to use the explicit viewport dimensions:
     ```
     width: config.viewportWidth,
     height: config.viewportHeight,
     ```
     This ensures the wrapper div is exactly the viewport size (no CSS unit ambiguity with vw/vh).
  </action>
  <verify>
  Run `cd /Users/emirahmed/Desktop/Manuscript/renderer && npx tsc --noEmit` to verify compilation.
  Grep RegularRenderer.tsx for `WIDTH / w` -- should still exist (for interactive mode) but the `viewportWidth && viewportHeight` guard should short-circuit it in render mode.
  Grep setTimestamp for `3 - 2 \* progress` to confirm the ease-in-out interpolation is present.
  Grep RenderApp.tsx for `100vw` -- should NOT appear (replaced with explicit pixel values).
  </verify>
  <done>
  - RegularRenderer accepts `viewportWidth`/`viewportHeight` props; when present, container uses those dimensions instead of WIDTH=980 scaling
  - Interactive mode (no viewportWidth/viewportHeight) is completely unchanged -- same WIDTH=980 behavior
  - `setTimestamp` interpolates camera Y between events using cubic ease-in-out for smooth frame-by-frame scrolling
  - RenderApp passes viewport dimensions from ExportConfig and uses explicit pixel dimensions on the wrapper div
  - Both frontend TypeScript compiles cleanly
  </done>
</task>

</tasks>

<verification>
After both tasks:

1. **TypeScript compilation:** Both `export-service` and frontend compile without errors.
2. **No regression in interactive mode:** `RegularRenderer` without `viewportWidth`/`viewportHeight` props behaves identically to before (WIDTH=980 scaling, CSS transition camera).
3. **Render mode sizing:** When `viewportWidth=1920, viewportHeight=1080` (from a 1920x1080 background), RegularRenderer's container is 1920x1080, not 980x551. The Puppeteer viewport matches.
4. **Camera smoothness:** In `setTimestamp`, the camera Y is interpolated between events with cubic ease-in-out, producing smooth per-frame movement instead of discrete jumps.
5. **Dynamic dimensions:** If a background image is 2560x1440, the viewport and video output will be 2560x1440. If no background, defaults to 1920x1080.
</verification>

<success_criteria>
- Exported video dimensions match background image dimensions (not hardcoded 1920x1080)
- Score animation fills the entire video frame (no 980px box in corner)
- Camera movement in exported video is smooth between system transitions
- Interactive mode (App.tsx path) is completely unchanged
- No new npm dependencies added
</success_criteria>

<output>
After completion, create `.planning/quick/9-fix-export-video-create-clean-render-com/9-SUMMARY.md`
</output>
