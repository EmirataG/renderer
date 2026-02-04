# Phase 3: Animation and Camera - Context

**Gathered:** 2026-02-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Fix the camera scrolling system (jittery system transitions) and polish transport controls for sync-only playback. Notehead animation is already working correctly and must not be changed. Puppeteer/render mode is deferred — not in scope.

This phase is significantly reduced from the original roadmap because:
- BPM mode was removed in Phase 2.1 (VAL-03 no longer applies)
- Notehead animation already works correctly (MIG-03, VAL-05 already satisfied)
- Puppeteer export is deferred (MIG-07, VAL-15, VAL-16 out of scope)

</domain>

<decisions>
## Implementation Decisions

### Notehead animation
- **DO NOT CHANGE** — animation is working perfectly as-is
- Scale, color, timing, chord behavior — all preserved exactly
- Only verify it still works after any camera changes

### Camera scrolling
- Camera should do **clean system-to-system snaps**, not continuous scrolling
- Current bug: camera produces jittery up/down nudges instead of smooth snaps
- The math for detecting system transitions needs to be made robust
- Look-ahead behavior: keep current behavior, no changes needed

### Transport controls
- Play/pause/reset must work cleanly in sync-only mode
- Polish any rough edges in the transport flow
- No BPM mode — sync-only is the sole playback path

### Puppeteer / Render mode
- **Deferred to a later phase** — do not touch Puppeteer code
- Render mode (URL parameter mode) is not currently used but leave code in place
- animationController.ts left as-is

### Claude's Discretion
- Camera snap easing/timing (whatever produces the cleanest visual transition)
- How to fix the jitter math (investigate root cause, apply fix)
- Transport control polish specifics (what "rough edges" exist, if any)

</decisions>

<specifics>
## Specific Ideas

- Camera jitter described as "starts going up and down tiny nudges" — likely a Y-position calculation issue where the camera oscillates between two close values instead of snapping cleanly to the next system
- The system-to-system snap should feel decisive, not gradual

</specifics>

<deferred>
## Deferred Ideas

- Puppeteer frame export / animationController — separate future phase
- Render mode cleanup — can be removed when Puppeteer is addressed
- VAL-03 (BPM-based animation) — permanently removed, not deferred

</deferred>

---

*Phase: 03-animation-and-camera*
*Context gathered: 2026-02-04*
