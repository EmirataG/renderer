# Progressive Reveal ("Hide Unplayed Notes") + Active/Reveal Lines — Context

Current architecture (post-refactor). **Single-line only.** Page mode has no reveal.

## What it does
As playback sweeps left→right, notes behind the playhead are full opacity; notes
ahead are hidden (`unplayedOpacity = 0`) or faded (`> 0`), with an optional soft
fade band (`smoothReveal`). Two positions are user-configurable in the score
region editor:
- **Active line** (`activeLinePosition`, 0..1) — where the currently-playing note
  sits on screen. Drives the camera. Both modes (single-line x, page-mode y).
- **Reveal line** (`revealLinePosition`, 0..1, single-line) — where unplayed notes
  get revealed. Always `>= activeLinePosition`; ahead of the active line ⇒ notes
  reveal before they're played (read-ahead). Persists even when hide is off.
- Defaults `0.5` / `0.5` reproduce the legacy "centered, reveal at the playhead".

## How the reveal is rendered (the hard-won core)
The mask is **one CSS mask on the static viewport `<div>`** (the overflow-clipped
"Score container" that does NOT translate — the camera div inside it does), in
SCREEN space. `applyRevealFrontier` (`SingleLineRenderer`) computes
`playedFrac = (currentXRef - cameraXRef)/viewportWidth + (revealLine - activeLine)`
and calls `applyReveal(viewport, …)` (`lib/revealMask.ts`: `clip-path: inset()`
for hidden mode, `mask-image: linear-gradient()` for faded; gradient stops are
UNCLAMPED so the band is continuous; deduped via `dataset.revealKey`).

**DO NOT move the mask back onto an SVG element.** Chromium does not invalidate a
`mask-image` on an SVG `<g>`/`<svg>` when only the gradient's color stops change →
the faded reveal froze under virtualization (layer promotion, none→mask, and
display-toggle repaint forces ALL failed). HTML elements invalidate it correctly.
The viewport is always mounted, so the mask never touches section virtualization
and there are no per-section boundary seams (the old per-section-mask approach is
gone, along with `sectionContainerRefs` and `ensureRevealSplit`/skeleton split).

The frontier follows the live playhead `currentXRef` (NOT the event index — that
desynced from the camera). Before playback `currentXRef` is parked at the first
note, so the pre-play view is exactly the first frame of playback.

## Coloring + camera
Preview playback runs the SAME stateless per-frame `setTimestamp` engine as the
export (was fire-and-forget `animateNoteheads`+timers, which lost colors on
virtualization remounts). `setTimestamp` calls `applyCamera` via `applyCameraRef`
(ref to the latest instance) to dodge a stale-closure freeze.

## Export parity (`lib/clientExport/`)
Export dims each section uniformly with a `<canvas>` `destination-in` gradient
(`drawContentWithReveal`, immune to the CSS-mask bug); boundary-continuous via
edge-extrapolated stops. Camera uses `activeLinePosition` (`animation.ts`); reveal
boundary uses `(revealLinePosition - activeLinePosition) * regionWidth`.

## Editor UI (`components/ScoreRegionEditor.tsx`)
When editing the region: cyan solid **Active** line (handle on the leading edge),
and in single-line+hide an amber dashed **Reveal** line (handle on the opposite
edge — never collides on overlap), a look-ahead zone between them, rotation-aware
dragging, live preview, snap-to-middle (+ reveal-snaps-to-active). Region Reset
recenters both to 0.5.

## Settings plumbing
`activeLinePosition` / `revealLinePosition` in `projectStore` (+ `DEFAULT_SETTINGS`),
`types/project.ts`, `types/global.d.ts`, `autoSave`, PATCH `ALLOWED_SETTINGS`,
`ExportSettings`, and passed App → renderers/editor.

## Type-check
`npx tsc --noEmit` clean (only pre-existing `Toast.tsx` warning is unrelated).
