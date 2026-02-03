# Manuscript Renderer — OSMD to Verovio Migration

## What This Is

A browser-based MusicXML score renderer with animated playback, used to generate scrolling score videos. Currently powered by OpenSheetMusicDisplay (OSMD), migrating to Verovio for higher quality music engraving. The app renders scores with vertical camera scrolling, notehead animations, audio sync, and Puppeteer-based frame capture for video export.

## Core Value

Scores render correctly with Verovio and all existing animation/sync features work identically — the user sees better engraving with zero feature regression.

## Requirements

### Validated

These capabilities exist today with OSMD and must continue working with Verovio:

- ✓ MusicXML file upload with drag-drop and validation — existing
- ✓ Score rendering from MusicXML to SVG in the browser — existing
- ✓ BPM-based animation: vertical scrolling through score at configurable tempo — existing
- ✓ Sync-based animation: audio-driven playback with user-set anchor timestamps — existing
- ✓ Notehead animation: scale, color highlight, entry/hold/exit timing on active notes — existing
- ✓ Camera system: smooth vertical scrolling that centers the current playback position — existing
- ✓ Score color customization: all SVG elements recolored to user-chosen color — existing
- ✓ Score scale/zoom: adjustable score size with layout reflow — existing
- ✓ Score region editor: draggable/resizable region positioning over background image — existing
- ✓ Score border styles: decorative top/bottom borders (line, ornate, flourish) — existing
- ✓ Background image support: score overlaid on user-uploaded image — existing
- ✓ Audio upload and preview playback — existing
- ✓ Sync Editor: visual event timeline for setting timestamp anchors per note — existing
- ✓ Timestamp interpolation: computes per-event timestamps from sparse anchor points — existing
- ✓ Puppeteer animation controller: frame-by-frame rendering API exposed on window — existing
- ✓ Render mode: scales output to fill viewport for video capture — existing
- ✓ Score shadow distance control — existing
- ✓ Transport controls: play, stop, reset — existing
- ✓ Toast notifications for user feedback — existing

### Active

- [ ] Replace OSMD with Verovio for MusicXML-to-SVG rendering
- [ ] Extract musical events (beat onset, duration, SVG element IDs) from Verovio output
- [ ] Adapt notehead animation to target Verovio SVG structure (`.note > .notehead` elements)
- [ ] Adapt score color styling to Verovio SVG class/ID conventions
- [ ] Adapt MusicXML validation to use Verovio instead of OSMD
- [ ] Adapt SyncEditor event extraction to use Verovio instead of OSMD Cursor
- [ ] Adapt Puppeteer animation controller to target Verovio SVG elements
- [ ] Implement zoom/scale via Verovio's `scale` option with re-render
- [ ] Remove OSMD dependency entirely

### Out of Scope

- hideUnplayedNotes feature — not currently implemented, skip for migration
- smoothReveal feature — not currently implemented, skip for migration
- New features or UI changes — pure engine swap only
- Server-side rendering — remains a client-side SPA
- Mobile support — not in scope

## Context

**Current architecture:** React SPA with OSMD rendering MusicXML to SVG in a DOM container. OSMD's Cursor API is used to iterate through musical events and extract SVG element IDs (prefixed `vf-`). These IDs drive notehead animations and the Puppeteer frame controller. Score color is applied via CSS selectors targeting OSMD's `.vf-*` class hierarchy.

**Why Verovio:** Verovio produces higher quality music engraving — better spacing, cleaner notation, more professional output. It's a C++ engine compiled to WASM, available as an npm package (`verovio`).

**Key migration challenge:** OSMD renders directly to the DOM and provides a Cursor API for event iteration. Verovio returns SVG as a string and has a different API — it provides MIDI timing data and structured SVG with semantic IDs/classes (e.g., `class="note"`, `class="notehead"`) rather than OSMD's VexFlow-based `vf-` prefixed IDs.

**Verovio SVG structure (from examples):**
- Notes: `<g id="n1lxdw3k" class="note">` containing `<g class="notehead">` with `<use>` elements
- Measures: `<g id="m1x1zmk6" class="measure">`
- Staff: `<g id="m1s1" class="staff">`
- Layers: `<g id="m1s1l1" class="layer">`
- Chords: `<g id="c1t7ombh" class="chord">` containing multiple notes
- Beams, tuplets, accidentals all have semantic classes
- IDs are unique per element and can be used for targeting

**Files requiring changes:**
- `src/renderers/RegularRenderer.tsx` — main renderer (OSMD init, event extraction, color styling, animation controller)
- `src/components/SyncEditor.tsx` — sync editor (OSMD init, event extraction)
- `src/lib/getEvents.ts` — event extraction helper (OSMD Cursor API)
- `src/lib/noteAnimation.ts` — notehead animation (targets `.vf-notehead` selectors)
- `src/lib/animationController.ts` — Puppeteer controller (targets `.vf-notehead` selectors)
- `src/lib/musicxmlValidation.ts` — validation (creates OSMD instance)
- `package.json` — swap `opensheetmusicdisplay` for `verovio`

## Constraints

- **Tech stack**: Must use `verovio` npm package (WASM) — user's explicit choice
- **Feature parity**: Every validated requirement must work identically after migration
- **No UI changes**: Sidebar controls, layout, and user interactions remain unchanged
- **SVG compatibility**: Verovio SVG uses `<use>` elements referencing `<defs>` — animation targeting must account for this
- **Browser WASM**: Verovio WASM module must load successfully in modern browsers

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Use verovio npm package (WASM) | Standard approach, runs in browser, good documentation | — Pending |
| Pure engine swap, no feature additions | Minimize risk, focused scope | — Pending |
| Target Verovio semantic CSS classes for animations | Verovio uses `.note`, `.notehead` classes — maps cleanly to animation needs | — Pending |
| Drop hideUnplayedNotes/smoothReveal from scope | Not implemented in current codebase | — Pending |

---
*Last updated: 2026-02-03 after initialization*
