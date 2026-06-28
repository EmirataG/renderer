# Progressive Reveal ("Hide Unplayed Notes") — Context & Handoff

Status as of this session. Feature is **single-line only**. Branch: `main` (uncommitted working tree).

## What the feature does
Hides score content that hasn't been played yet; reveals it spatially as the playhead
sweeps left→right. Staff lines + barlines stay always-visible (the "skeleton"). Opacity of
the unplayed region is configurable (`unplayedOpacity`, 0..1): `0` = hidden, `>0` = faded.
Ported from the abandoned `hide-feature` branch (its `REVEAL_DEBUG_NOTES.md` documents the
original author's long struggle and the *proven facts* below).

## Proven facts (do NOT relitigate)
1. SVG `<mask>` / `<clipPath>` **elements** silently fail to render in this app's compositing
   context. Use CSS `clip-path: inset()` and CSS `mask-image: linear-gradient()` **properties**.
2. Virtualization remounts sections (`dangerouslySetInnerHTML`) during camera pan → cached SVG
   nodes detach. **Never cache reveal nodes; re-resolve `g.page-margin` from the live DOM and
   re-ensure the split every frame.**

## Key files
- `src/lib/revealMask.ts` — core. `ensureRevealSplit(svg)` (idempotent + now **self-healing**),
  `applyReveal(content, params)` (clip-path when `unplayedOpacity===0`, mask-image gradient when
  `>0`), `clearRevealSplit(svg)`, `playedFractionFromScreen(...)` (unused now; see below).
- `src/renderers/SingleLineRenderer.tsx` — `syncRevealStructure()` + `applyRevealFrontier(index)`
  (called every frame from `applyCamera`). Reveal fraction is computed in **local content space**
  `(playX − sectionOffsets[i]) / sectionWidths[i]` using `currentXRef`/`lastRevealXRef` — this is
  rotation/zoom/pan-invariant (works under a rotated single-line region).
- `src/lib/clientExport/index.ts` — export parity. `revealOn` gated to single-line. Rasterizes a
  content layer + skeleton layer per section (`svgPageToImage(..., revealLayer)`), composites
  content through `drawContentWithReveal()` (canvas `destination-in` gradient mirroring the CSS).
- `src/App.tsx` — passes reveal props to `<SingleLineRenderer>` only; control-panel reveal UI
  (Hide Unplayed Notes / Smooth Reveal / Unplayed Opacity slider) is wrapped in
  `{viewMode === 'single-line' && ...}`.
- Settings plumbed in: `projectStore` (`unplayedOpacity` default 0; `hideUnplayedNotes` default
  **false**), `autoSave`, PATCH `ALLOWED_SETTINGS`, `types/project.ts`, `ExportSettings`.

## Page mode
**Fully removed.** `RegularRenderer.tsx` has zero reveal references (verified by grep). The
branch had left page mode on the non-rendering SVG-`<mask>` path (broken). Do not re-add.

## Bugs fixed this session
1. **Export note quality regression** — `drawContentWithReveal` sized its scratch canvas in CSS
   px, downsampling the high-res note raster then upscaling it (blurry notes; staff was fine since
   it draws directly). Fixed by adding a `pixelScale` (= `scaleFactor`) param so the scratch
   renders at output device resolution. `clientExport/index.ts`.
2. **Preview "everything goes blank" glitch** — `applyRevealFrontier` reset the frontier to null
   (→ `playedFrac=0` for all sections → all hidden) whenever the current event was momentarily
   missing. Now it only resets before the first event / on reset (`index < 0`); a transient
   missing event **holds the last frontier**. `SingleLineRenderer.tsx:648`.
3. **"Staff goes blank in big/virtualized scores"** — on a remount, staff/barlines could leak
   back into the *clipped* content group → staff clipped to nothing. `ensureRevealSplit` is now
   **self-healing**: every frame, if `g.reveal-content` contains `g.staff > path` or `g.barLine`,
   it lifts them back into `g.reveal-skeleton`. `revealMask.ts:61`.
4. **"Note highlights stop / long-held note reverts to normal early in preview (but export is
   fine)"** — single-line *live preview* drove note coloring with fire-and-forget
   `animateNoteheads` + `setTimeout` exit timers: each note was colored exactly ONCE when the
   playhead crossed it. Under virtualization that desyncs — a section that unmounts/remounts loses
   the inline color on its detached noteheads (highlights stop), and a long/tied note's
   continuation noteheads (which live in LATER sections not yet mounted at onset) were never
   colored at all (long note "reverts early"). Export never had this because it re-derives the
   active-note window every frame. Fix: `animateSync` now drives playback through the same
   stateless per-frame `setTimestamp` engine the export uses — it recomputes the active window and
   re-applies color to whatever is in the live DOM each frame, self-healing across remounts.
   `SingleLineRenderer.tsx` (`animateSync`). Side effects: highlight entry is now instant (no
   `entryMs` CSS ease) — matching the exported video exactly; the per-frame forced reflow in
   `setTimestamp` is now gated to render mode only.
5. **"Reveal freezes during playback, only updates on pause" (regression from #4's `setTimestamp`
   routing)** — `setTimestamp` (a `useCallback`) drives the camera + reveal each frame, but it
   called `applyCamera` directly, and `applyCamera`/`applyRevealFrontier` are NOT in its deps. So
   it captured a STALE `applyCamera` whose closed-over `hideUnplayedNotes`/`unplayedOpacity` were
   out of date once the user toggled reveal on after load → `applyRevealFrontier` early-returned
   every frame; pausing re-rendered and re-ran the reveal layout effect (fresh closure), which is
   why pause "revealed" it. Fix: `setTimestamp` now calls `applyCameraRef.current(...)`, a ref
   reassigned to the latest `applyCamera` every render, so the camera/reveal call is always fresh.
   `SingleLineRenderer.tsx` (`applyCameraRef`). Coloring was unaffected because its inputs ARE in
   `setTimestamp`'s deps.

## `entryMs` removed
The active-notehead **Entry** duration setting was removed entirely (UI slider + store +
`ProjectSettings`/`ExportSettings` types + autosave + PATCH allowlist + both renderer props).
Highlight entry is now always instant everywhere — the export pipeline never used an entry ramp,
and after fix #4 single-line preview doesn't either, so the knob was dead. `animateNoteheads`
(page mode) now applies color/scale with no entry transition.

## OPEN RISK — verify the blank-staff fix
The user reported the blank-staff bug appeared **only in bigger scores that need
virtualization**. Fixes #2 and #3 above both target that, but neither has been verified live
(can't test headlessly — needs a browser with audio playback + a long single-line score).
**Next session: play a long single-line score with Hide Unplayed Notes on and confirm the staff
never blanks during pans.** If it still does:
- Leading suspect remains the destructive skeleton DOM split fighting React reconciliation.
- The `hide-feature` branch's *final* single-line resolution avoided the split entirely by
  clipping `g.page-margin` **directly** (re-resolved every frame) — but that clips the staff too.
  A robust alternative: keep the staff visible by rendering it from a separate, non-React-managed
  overlay, or by reconciling our DOM mutation with React (e.g., mutate inside a ref callback that
  React won't overwrite). Read `git show hide-feature:REVEAL_DEBUG_NOTES.md` (top section) first.

## Needs runtime verification (all modes — cannot be tested headlessly)
- Single-line preview: reveal sweeps; staff/barlines always visible; wide elements (beams/slurs)
  reveal partially; opacity slider (0 = hidden, e.g. 30% = faded); smooth vs hard edge.
- Single-line under a **rotated region** (−90°): reveal still sweeps along the strip.
- **Export MP4** single-line, reveal on, opacity 0 and >0: must visually match the preview, with
  **sharp notes** (the quality fix).

## Type-check
`npx tsc --noEmit` clean (the only error, `src/components/Toast.tsx:80`, is pre-existing and
unrelated). Nothing committed.
</content>
