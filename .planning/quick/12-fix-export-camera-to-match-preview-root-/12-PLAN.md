---
phase: quick-12
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/renderers/RegularRenderer.tsx
autonomous: true

must_haves:
  truths:
    - "Export video camera movement matches preview exactly"
    - "Camera transitions simulate CSS 'transform 200ms ease-out' on cameraY (post-clamp), not on raw targetY"
    - "Camera stays still within a system (no continuous interpolation between events with same Y)"
    - "Camera transitions discretely on system change, smoothed over 200ms with cubic ease-out"
  artifacts:
    - path: "src/renderers/RegularRenderer.tsx"
      provides: "CSS transition simulation refs and setTimestamp camera logic"
      contains: "cameraTransitionFrom"
  key_links:
    - from: "setTimestamp callback"
      to: "cameraRef DOM transform"
      via: "CSS transition simulation bypassing applyCamera"
      pattern: "cameraRef\\.current\\.style\\.transform"
---

<objective>
Fix export video camera to match preview by replacing the incorrect interpolation model in `setTimestamp` with a CSS transition simulation that operates on post-clamp cameraY values.

Purpose: The export camera currently uses continuous inter-event Y interpolation with cubic easing on raw targetY, then clamps. The preview uses discrete camera jumps smoothed by CSS `transition: transform 200ms ease-out` on the already-clamped cameraY. These are fundamentally different motion models producing visually different results. This fix replaces the export model to exactly match the preview.

Output: Modified RegularRenderer.tsx with CSS transition simulation in setTimestamp.
</objective>

<execution_context>
@/Users/emirahmed/.claude/get-shit-done/workflows/execute-plan.md
@/Users/emirahmed/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/renderers/RegularRenderer.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add CSS transition simulation refs and replace setTimestamp camera logic</name>
  <files>src/renderers/RegularRenderer.tsx</files>
  <action>
  Two changes to RegularRenderer.tsx:

  **Change 1: Add 3 new refs after line 108 (after `cameraYRef`)**

  Add these refs to simulate the CSS `transition: transform 200ms ease-out` that the preview uses:

  ```typescript
  // Render-mode: simulate CSS "transform 200ms ease-out" transition
  const cameraTransitionFrom = useRef(0);        // cameraY we're transitioning FROM
  const cameraTransitionTarget = useRef(0);       // cameraY we're transitioning TO
  const cameraTransitionStart = useRef(-Infinity); // timestamp (seconds) when transition started
  ```

  **Change 2: Replace the camera section in `setTimestamp` (lines 562-601)**

  Remove ALL of:
  - Lines 562-581: The inter-event Y interpolation block (interpolates raw targetY between events with cubic easing)
  - Lines 583-596: The first-event transition hack (special-cases index 0 with ease-out)
  - Lines 598-601: The `eventIndexRef`, `currentYRef`, and `applyCamera` calls

  Replace with this CSS transition simulation:

  ```typescript
      // --- Camera: simulate preview's CSS "transform 200ms ease-out" ---
      // In preview, applyCamera() sets translateY instantly and CSS transitions
      // smooth it. In render mode CSS transitions are disabled, so we replicate
      // the effect by computing the target cameraY and interpolating changes.
      const eventY = currentEvent.y;
      const scoreHeight = totalHeight || (scoreRef.current?.scrollHeight ?? 0);
      const viewportHeight = scoreRegion?.height ?? containerHeight;

      // Compute what applyCamera would produce for this event's Y
      let newTargetCameraY = eventY - viewportHeight / 2;
      newTargetCameraY = Math.max(0, newTargetCameraY);
      newTargetCameraY = Math.min(newTargetCameraY, Math.max(0, scoreHeight - viewportHeight));

      // Detect target change — start a new transition
      if (Math.abs(newTargetCameraY - cameraTransitionTarget.current) > 0.5) {
        cameraTransitionFrom.current = cameraYRef.current; // from current visual position
        cameraTransitionTarget.current = newTargetCameraY;
        cameraTransitionStart.current = seconds;
      }

      // Simulate 200ms ease-out (matching CSS transition)
      const TRANSITION_SEC = 0.2;
      const elapsed = seconds - cameraTransitionStart.current;
      let visualCameraY: number;
      if (elapsed >= 0 && elapsed < TRANSITION_SEC) {
        const t = elapsed / TRANSITION_SEC;
        const eased = 1 - Math.pow(1 - t, 3); // cubic ease-out ≈ CSS ease-out
        visualCameraY = cameraTransitionFrom.current +
          (cameraTransitionTarget.current - cameraTransitionFrom.current) * eased;
      } else {
        visualCameraY = cameraTransitionTarget.current;
      }

      // Apply camera directly (bypass applyCamera — we already did the clamping)
      cameraYRef.current = visualCameraY;
      if (cameraRef.current) {
        cameraRef.current.style.transform = `translateY(${-visualCameraY}px)`;
      }

      eventIndexRef.current = currentIndex;
      currentYRef.current = eventY;
  ```

  **Critical details:**
  - The new code operates on cameraY (post-clamp), NOT on raw event Y. This is the root cause fix.
  - The new code uses discrete transitions (triggered when target changes by >0.5px), NOT continuous interpolation. This matches the preview's motion model.
  - `applyCamera()` is NOT called — we bypass it because we already compute and clamp cameraY ourselves. The other call sites of `applyCamera` (preview playback, reset, extraction) remain unchanged.
  - `currentYRef.current` is set to `eventY` (raw, unclamped) — same as before, since other code may depend on it for notehead highlighting.
  </action>
  <verify>
  1. `npx tsc --noEmit` — no TypeScript errors
  2. `npm run build` — builds successfully
  3. Grep for the old interpolation pattern to confirm it's gone: search for "3 - 2 * progress" — should NOT appear in RegularRenderer.tsx
  4. Grep for new pattern: search for "cameraTransitionFrom" — should appear in RegularRenderer.tsx
  </verify>
  <done>
  - Three new refs (cameraTransitionFrom, cameraTransitionTarget, cameraTransitionStart) exist after cameraYRef
  - setTimestamp camera section uses CSS transition simulation on post-clamp cameraY
  - No inter-event Y interpolation remains
  - No first-event special-case hack remains
  - applyCamera is NOT called from setTimestamp (but still called from preview playback and reset)
  - TypeScript compiles, build succeeds
  </done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` passes
2. `npm run build` passes
3. No "3 - 2 * progress" pattern in RegularRenderer.tsx (old interpolation removed)
4. "cameraTransitionFrom" pattern found in RegularRenderer.tsx (new simulation added)
5. `applyCamera` still exists as a function and is called from preview playback/reset, but NOT from setTimestamp
</verification>

<success_criteria>
- Export video camera movement uses CSS transition simulation on post-clamp cameraY values
- Camera transitions are discrete (triggered on system change) with 200ms cubic ease-out, matching preview behavior
- Camera stays still within a system (no continuous interpolation)
- Build and type-check pass cleanly
</success_criteria>

<output>
After completion, create `.planning/quick/12-fix-export-camera-to-match-preview-root-/12-SUMMARY.md`
</output>
