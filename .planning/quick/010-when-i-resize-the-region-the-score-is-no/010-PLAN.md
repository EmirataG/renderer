---
quick_task: 010
type: execute
files_modified: [src/renderers/PixiSingleLineRenderer.tsx]
autonomous: true
---

<objective>
Fix score centering when viewport/region dimensions change.

Problem: When the score region is resized, the camera position is not recalculated, leaving the score off-center. The camera starts at x=0 and only updates during playback via CameraController.

Root cause: The camera container starts at x=0 and only repositions when `isPlaying=true`. When the region resizes, the viewport dimensions change but the camera position is stale.

Solution: Center the score horizontally within the viewport when not playing, and reset camera position when viewport dimensions change.
</objective>

<context>
@src/renderers/PixiSingleLineRenderer.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Center score when not playing and reset on viewport change</name>
  <files>src/renderers/PixiSingleLineRenderer.tsx</files>
  <action>
    The score should be horizontally centered when:
    1. Initially loaded (not playing)
    2. When viewport dimensions change (region resize)
    3. When playback is reset

    Changes needed:

    1. Add a `useEffect` that recalculates the initial/static camera position when:
       - `viewportWidth` changes
       - `scaledTotalWidth` changes
       - `isPlaying` becomes false

    2. Calculate the centered camera position for static (non-playing) state:
       - If score is narrower than viewport: center the score (containerX = (viewportWidth - scaledTotalWidth) / 2)
       - If score is wider than viewport: start at 0 (containerX = 0)

    3. Apply this static position to the camera container when NOT playing.
       - Add a `staticCameraX` state or ref
       - Use this value for the container's x position when `isPlaying` is false
       - The CameraController only animates when `isPlaying` is true

    4. Modify the container x logic:
       - When `isPlaying=false`: use staticCameraX to center the score
       - When `isPlaying=true`: CameraController manages the position

    5. Reset `targetXRef` and camera position on region resize to prevent stale values.

    Implementation approach:
    - Add `staticCameraXRef` to track the static centered position
    - Add useEffect to compute centered position when viewport/score dimensions change
    - When not playing, set container x to staticCameraXRef.current
    - Ensure CameraController respects this initial state

    Key insight: The score should appear centered within the viewport (score region), not left-aligned at x=0.
  </action>
  <verify>
    Manual testing:
    1. Load the score renderer
    2. Resize the score region (change width/height)
    3. Verify the score remains centered horizontally within the viewport
    4. Start playback, pause, and verify position is correct
    5. Reset and verify score re-centers
  </verify>
  <done>
    When the score region is resized, the score remains horizontally centered within the viewport. The score is centered when initially loaded and when playback is stopped/reset.
  </done>
</task>

</tasks>

<verification>
- Score is horizontally centered when initially loaded
- Score stays centered when region is resized
- Playback still works correctly with camera following notes
- Reset button re-centers the score
</verification>

<success_criteria>
- Resizing the score region keeps the score visually centered
- No regression in playback or camera tracking functionality
</success_criteria>

<output>
After completion, update `.planning/quick/010-when-i-resize-the-region-the-score-is-no/010-SUMMARY.md`
</output>
