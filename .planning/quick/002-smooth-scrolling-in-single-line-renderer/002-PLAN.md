---
phase: quick
plan: 002
type: execute
wave: 1
depends_on: []
files_modified:
  - src/renderers/SingleLineRenderer.tsx
autonomous: true

must_haves:
  truths:
    - "Camera moves continuously during playback, not in discrete jumps"
    - "Scrolling feels smooth and natural at all playback speeds"
  artifacts:
    - path: "src/renderers/SingleLineRenderer.tsx"
      provides: "Interpolated camera positioning"
      contains: "lerp"
  key_links:
    - from: "animateSync loop"
      to: "applyCamera"
      via: "interpolated X position (not discrete event X)"
---

<objective>
Make single-line renderer scrolling feel smooth instead of grainy/steppy.

Purpose: Current implementation jumps camera to event positions with CSS transitions, creating stuttering. Smooth scrolling interpolates position continuously.

Output: Camera glides smoothly during playback with no visible stepping.
</objective>

<context>
@src/renderers/SingleLineRenderer.tsx (lines 315-332, 356-425, 769-776)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Implement smooth camera interpolation</name>
  <files>src/renderers/SingleLineRenderer.tsx</files>
  <action>
Replace the discrete "jump to event X" camera logic with continuous interpolation:

1. Remove the CSS transition from cameraRef div (line 775):
   - Delete `transition: "transform 200ms ease-out"` - this causes stuttering when combined with frame updates

2. In `animateSync()`, calculate interpolated camera position:
   - Get current event and next event timestamps/positions
   - Calculate progress between current and next event: `(currentTime - currentEvent.timestamp) / (nextEvent.timestamp - currentEvent.timestamp)`
   - Lerp X position: `currentX + (nextX - currentX) * progress`
   - Use this interpolated X for `applyCamera()` instead of discrete `event.x`

3. Add a lerp helper function at top of component:
   ```typescript
   function lerp(a: number, b: number, t: number): number {
     return a + (b - a) * Math.max(0, Math.min(1, t));
   }
   ```

4. Update animateSync to interpolate between events:
   - Find current event (already done)
   - Find next event (currentIndex + 1, or use current if at end)
   - Calculate time-based progress
   - Apply lerped position to camera

This removes the stuttering from discrete CSS transitions and provides frame-perfect smooth scrolling.
  </action>
  <verify>
Run `npm run dev`, load a score with sync anchors, play back. Camera should glide smoothly without any visible stepping or stuttering. Movement should be continuous, not jump-then-ease.
  </verify>
  <done>
Camera position interpolates smoothly between events during playback. No CSS transition delays. No discrete jumping.
  </done>
</task>

</tasks>

<verification>
- Visual: Play a synced score and observe camera movement is fluid
- No stuttering or "catching up" motion visible
- Camera arrives at each note position exactly when the note plays
</verification>

<success_criteria>
1. Camera scrolling is perceptually smooth during playback
2. No visible discrete jumps between events
3. No CSS transition delays causing lag
</success_criteria>

<output>
After completion, create `.planning/quick/002-smooth-scrolling-in-single-line-renderer/002-SUMMARY.md`
</output>
