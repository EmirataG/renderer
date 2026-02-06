---
phase: 12-singlelinerenderer-core
created: 2026-02-05
source: /gsd:discuss-phase
---

# Phase 12: SingleLineRenderer Core - Context

## Decisions

### Camera Behavior

- **Active note position:** Center of viewport (50%)
- **Easing:** Smooth continuous movement (teleprompter-style), no snapping between notes
- **Score start:** Flush left edge, camera catches up to center position as playback progresses
- **Score end:** Stop at right edge, no empty space beyond score

### Component Structure

- **Separate component:** New `SingleLineRenderer.tsx`, not extending RegularRenderer
- **Location:** `src/renderers/` folder alongside RegularRenderer
- **Renderer switching:** Hardcode SingleLineRenderer for this phase (toggle UI is future work)
- **Camera hook:** Claude's discretion whether to extract to separate hook or inline

### Animation Integration

- **Reuse existing:** Use `noteAnimation.ts` as-is, no horizontal-specific modifications
- **Element targeting:** Query from specific section container that contains the event (not root)
- **Timing system:** Reuse `interpolateTimestamps` and existing timing logic
- **Stop behavior:** Match RegularRenderer (same behavior on playback stop)

### Score Region Handling

- **Region bounds:** Identical behavior to RegularRenderer, just horizontal axis
- **Vertical fit:** Score centered vertically within region (space above/below if taller)
- **Borders:** Use existing border system, applied to horizontal layout
- **Overflow:** Clipped (overflow hidden), clean boundaries at region edges

## Claude's Discretion

- Whether camera logic should be extracted to `useSingleLineCamera.ts` hook or kept inline
- CSS transition timing/easing curve specifics
- Internal state management approach

## Deferred Ideas

None — discussion stayed within phase scope.

## Notes

- Transport controls (play, stop, reset) should work identically to RegularRenderer
- Event extraction with globalX from Phase 11 enables camera targeting
- Section containers from Phase 10 are passed to animation for element queries
