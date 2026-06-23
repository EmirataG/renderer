# Progressive Reveal — Debug Handoff

## RESOLUTION (single-line) — clip g.page-margin live, no wrapper
Root cause confirmed by two clues: (a) `document.querySelector('.preview-score
g.reveal-content')` → `false` (the injected wrapper was gone), and (b) "works on
manual scroll, breaks on play." During PLAYBACK the camera pans continuously →
virtualization remounts sections → React's `dangerouslySetInnerHTML` gives each a
fresh SVG with NO reveal structure, so the cached `RevealHandle.content` nodes
detach. Clips landed on detached nodes while the live SVGs showed the full score.
Manual scroll is a single jump, so the layout effect rebuilt handles in time.

Fix (in `revealMask.ts` + `SingleLineRenderer.tsx`): drop the skeleton/wrapper
split for single-line. Clip `g.page-margin` DIRECTLY (the one primitive proven to
render — fact #2) via `clipReveal(pm, rightPct)`, and re-resolve the page-margin
from the live DOM every frame (`pageMarginOf(container)`) so a remount can never
leave a stale handle. `applyRevealFrontier` now iterates `sectionContainerRefs`,
computes the playhead's screen X, and clips each section's page-margin by the
screen fraction. No persistent handles, no `reveal-content`, no `getBBox` race.

SKELETON (staff always visible, no clone): `ensureRevealSplit(svg)` MOVES (not
copies) staff lines (`g.staff > path`) + barlines into an unclipped
`g.reveal-skeleton`, leaving everything else in `g.reveal-content` which gets
clipped. Safe because single-line content shares one absolute coord space (only
page-margin/definition-scale transform), so reparenting preserves position. It's
idempotent and re-ensured EVERY frame in `applyRevealFrontier`, so a remounted
section is re-split before it's clipped (no full-score flash). The old code did
the same split but cached the node → detached on remount; the fix is to never
cache, always re-resolve.

SMOOTH REVEAL: `revealEdge(content, rightPct, bandPct)`. bandPct>0 adds a
`mask-image: linear-gradient(to right, #000 … , transparent …)` fading ahead of
the playhead, BACKED by a hard `clip-path` cut just past the fade — so if the
compositor won't render CSS mask, it degrades to a hard edge instead of
disappearing. Band = `REVEAL_BAND_PX`(64px)/sectionWidth. CSS `mask-image`
PROPERTY (alpha mode for a gradient) is distinct from SVG `<mask>` ELEMENTS
(which don't render here).

Page mode (RegularRenderer) is UNCHANGED — still uses the old wrapper/mask path.

---

## (historical) Original handoff — UNSOLVED at the time

## Goal
Implement the dead settings `hideUnplayedNotes` + `smoothReveal`: hide score content
that hasn't been played yet; reveal it as the playhead passes. **A spatial clip is
required** (not per-note opacity) because wide horizontal elements (beams, slurs,
hairpins) must reveal *partially* as the playhead sweeps across them.

Staff lines (`g.staff > path`) + barlines (`g.barLine`) must stay always-visible
(the "skeleton"); everything else reveals.

User is testing in **single-line** view mode.

## CURRENT STATUS: STILL BROKEN
Symptom (latest, with CSS clip-path + screen-space measurement):
- At rest / toggled on: **score correctly hidden** ✅
- Re-toggle off: notes show; on: notes hide ✅ (so the hide mechanism works)
- **Hit play → ALL notes appear** ❌ (the reveal flips to fully-revealed)

Earlier symptom (before lazy-bbox fix): notes hidden, then all appeared ~0.5s after load.
That part was fixed by `ensureBBox`. The "all appear on play" persists across EVERY approach.

## CONFIRMED FACTS (verified live in the browser console)
1. **Inline `opacity` on `g.note` WORKS** — `n.style.opacity='0.15'` visibly faded a note.
   So we ARE mutating the displayed DOM (not a phantom/duplicate).
2. **CSS `clip-path: inset()` WORKS** — `el.style.clipPath='inset(0 60% 0 0)'` on
   `g.page-margin` clipped the right 60% of the visible score.
3. **SVG `<mask>` element does NOT render** — even with structurally-perfect rects
   (live diagnostic showed `vbW=43111`, `solidW=2914`, `maskAttr=url(#reveal-8)`,
   `maskInDom=true`, `contentInSvg=true`) the content still showed fully. Confirmed
   it fails on BOTH the normal route AND a route without react-zoom-pan-pinch
   (`/project-notransform/[id]`), so GPU compositing from TransformWrapper is NOT
   the cause.
4. `page-margin` transform in single-line was `translate(0,0)` (not 500,0).
5. Console warning (PRE-EXISTING, orthogonal): `[computeEventPositions] 422/527
   event(s) could not be positioned (id missing from rendered SVG)`. Many events'
   `positionSvgId` are not in the rendered SVG → they inherit prev position.

## APPROACHES TRIED (all failed in-app, all worked in offline headless-Chrome tests)
Offline I rendered the exact Verovio SVG + applied each approach via headless Chrome
and screenshotted — mask, clip-path, opacity, with content-visibility, with camera
transforms, with overflow=visible, at full 147980-unit width — **ALL worked offline.**
In the app, none reveal correctly. This gap is the core mystery.

1. **SVG `<mask>` + gradient** (skeleton split + `reveal-content` masked, position-driven
   rects). Single-line non-zero viewBox origin handled, viewBox parsed from attribute
   string. → mask doesn't render in-app (fact #3).
2. **Per-element inline `opacity`** (hide `g.note,g.chord,...` by playback order, reveal
   up to frontier). → "still doesn't work, everything revealed on play." (opacity works
   on individual elements per fact #1, but the reveal logic over-revealed.)
3. **SVG `<clipPath>` element** → same as mask, doesn't render in-app.
4. **CSS `clip-path: inset()` %, relative to content.getBBox()** (current-ish) →
   bbox read as ~1 before layout → fixed with lazy `ensureBBox` → now hidden at rest,
   but still all-appear on play (revealFull triggered).
5. **CSS `clip-path: inset()` driven by SCREEN coords** (latest) — `getBoundingClientRect`
   of current event element (playX) vs each section's content rect; clip each section by
   `(r.right-playX)/r.width`. Designed to avoid all coordinate-space/section-index bugs.
   → user reports "doesn't work" (didn't get the diagnostic numbers).

## THE UNSOLVED QUESTION
Why does "hide" work (rest) but "play" reveals everything? In the single-line logic,
full reveal only happens via `revealFull(h)`, called when:
- a section is "before" the current playhead section, OR
- the clip fraction computes to <= 0 (playhead past the content's right edge).

We NEVER captured a live `[reveal]` log line during play (user didn't paste it). That
one line (playX, each section's r.left/r.right/r.width, computed pct, clip string) would
immediately show whether it's (a) wrong section, (b) bad width, or (c) clip not applying.
**Get that log first next session.**

Hypotheses not yet ruled out:
- `h.content.getBoundingClientRect()` returns the FULL content rect (good) but if there
  are 2 sections and the visible one's `r.right < playX`, it reveals full. Need the numbers.
- On play, a re-render/virtualization remounts sections; the new `g.reveal-content` may
  briefly have no clip and the `useLayoutEffect` re-setup may race or the handle may point
  at a detached node. Check `svg.isConnected` / whether `setupReveal` re-ran.
- `animateNoteheads` (runs on play in `animateSync`) sets inline styles on noteheads — does
  it touch anything that affects the clip? (It shouldn't, but verify it's not clearing
  `g.reveal-content` styles or re-rendering.)
- Maybe `eventIndexRef` jumps to a high index immediately on play (events with
  computedTimestamp≈0), so `cur` is a late event → its element is in a later section →
  earlier sections `revealFull`. CHECK `index` at the first play frame.

## KEY FILES
- `src/lib/revealMask.ts` — reveal helpers. Current: CSS clip-path inset. `revealPct(h, rightPct)`
  is the screen-space entry. `setupReveal` splits skeleton/content; `teardownReveal` restores.
  Dead-ish now for single-line: `revealSingleLineAt`, `revealAt`, `ensureBBox`, `bx/bw`,
  `computeSystems` (page mode still uses `revealAt`).
- `src/renderers/SingleLineRenderer.tsx` — `applyRevealFrontier(index)` (screen-space),
  `syncRevealStructure` (setup/teardown per section, runs in a `useLayoutEffect` on
  `[sections, visibleSections, hideUnplayedNotes, smoothReveal]`), called per-frame from
  `animateSync` after `applyCamera`, plus on seek/reset. `locateEvent` now unused.
- `src/renderers/RegularRenderer.tsx` — page mode, still mask/clip via `revealAt` (untested
  recently; user is single-line).
- `src/App.tsx` — UI toggles in "Note Animation" section; passes `hideUnplayedNotes`/
  `smoothReveal` to both renderers. Has TEMP `noZoom` prop + `MaybeTransform` wrapper.
- `src/app/project-notransform/[id]/` — TEMP test route (no TransformWrapper). Confirmed
  TransformWrapper is NOT the cause; **can be deleted**.
- `src/stores/projectStore.ts` — `hideUnplayedNotes` default now `false` (opt-in).

## RECOMMENDED NEXT STEPS
1. **Get the live numbers.** Add a throttled `console.log` in `applyRevealFrontier`'s
   `forEach`: `{index, playX, left:r.left, right:r.right, width:r.width, pct, clip:h.content.style.clipPath}`.
   Play, paste 2-3 lines. This ends the guessing.
2. If `playX >= r.right` for the section that's visible → the measured event element is in
   the wrong section OR `index` is wrong at play start (check step: log `index`/`cur.id`).
3. If numbers look right but content still shows → the clip isn't being applied to the
   element holding the notes — verify `g.reveal-content` is the actual parent of the
   `g.note`s in the DISPLAYED svg (the user's `clip-path:inset` test was on `g.page-margin`,
   which DID clip — so try applying clip to `g.page-margin` instead of an injected
   `g.reveal-content`; maybe the skeleton-split wrapper is the problem). **This is the most
   promising untested idea: skip the skeleton split entirely — apply clip-path to
   `g.page-margin` directly (proven to clip), and instead keep staff lines visible by
   drawing a separate always-visible copy, OR accept staff lines clip too for a first
   working version.**
4. Once working: remove temp route + `noZoom`, remove dead code, consider page mode.

## NOTE
The user's working console test clipped **`g.page-margin`** directly. Our code injects a
`g.reveal-content` wrapper and clips THAT. If the wrapper/split is somehow not the real
parent of the rendered notes (e.g. another `page-margin` exists, or the split moved notes
unexpectedly), clipping `reveal-content` would do nothing visible while `page-margin` works.
**Verify in console: does `document.querySelector('.preview-score g.reveal-content')` exist
when hide is ON, and is it the parent of the visible notes?**
