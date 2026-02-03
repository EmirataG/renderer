# Roadmap: OSMD-to-Verovio Migration

## Overview

This roadmap replaces the OpenSheetMusicDisplay (OSMD) rendering engine with Verovio across a React music score renderer with animated playback. The migration follows a strict dependency chain: WASM foundation and basic rendering first, then event extraction (the critical path that everything else depends on), then animation/camera restoration, then the secondary SyncEditor view, and finally OSMD removal. Each phase validates its foundational assumptions before the next phase builds on them. The goal is zero feature regression with better engraving quality.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Core Verovio Integration** - WASM setup, basic rendering, color/scale validation
- [ ] **Phase 2: Event System Migration** - Rebuild event extraction using Verovio APIs
- [ ] **Phase 3: Animation and Camera** - Restore playback, notehead animation, camera scrolling
- [ ] **Phase 4: SyncEditor Migration** - Apply migration patterns to the sync editor view
- [ ] **Phase 5: Validation and Cleanup** - Remove OSMD, full regression testing

## Phase Details

### Phase 1: Core Verovio Integration
**Goal**: Verovio renders MusicXML scores in the browser with correct styling, proving the WASM foundation works
**Depends on**: Nothing (first phase)
**Requirements**: MIG-01, MIG-04, MIG-05, MIG-08, VAL-01, VAL-02, VAL-07, VAL-08
**Success Criteria** (what must be TRUE):
  1. A MusicXML file uploaded via drag-drop renders as an SVG score in the browser using Verovio (both `vite dev` and `vite build` modes)
  2. The score recolors to a user-chosen color, including noteheads rendered as `<use>` elements
  3. Changing the score scale slider causes the score to re-render at the new size with correct layout reflow
  4. An invalid MusicXML file shows a validation error toast without crashing
  5. The Verovio initialization sequence (`loadData` -> `renderToSVG` -> `renderToMIDI`) completes without errors, and `getTimeForElement()` returns non-zero values for note elements
**Plans**: 2 plans

Plans:
- [x] 01-01-PLAN.md -- Verovio WASM setup, service layer, useVerovio hook, and validation migration
- [x] 01-02-PLAN.md -- RegularRenderer rendering swap, CSS color migration, and animation selector updates

### Phase 2: Event System Migration
**Goal**: Musical events are extracted from Verovio output with timing and position data, compatible with the existing interpolation system
**Depends on**: Phase 1
**Requirements**: MIG-02, VAL-14
**Success Criteria** (what must be TRUE):
  1. A `MusicalEvent[]` array is built from the rendered Verovio SVG containing note IDs, onset times, and Y positions for every note in the score
  2. The event count matches the number of distinct beat positions in the score (no missing or duplicate events)
  3. Y positions extracted via `getBoundingClientRect()` correctly group notes into systems (lines of music) with the existing threshold logic
  4. The `interpolateTimestamps()` function produces correct computed timestamps when given Verovio-sourced events and user-set sync anchors
**Plans**: TBD

Plans:
- [ ] 02-01: Event extraction and interpolation integration

### Phase 3: Animation and Camera
**Goal**: Playback preview works end-to-end with note highlighting, camera scrolling, and Puppeteer frame capture
**Depends on**: Phase 2
**Requirements**: MIG-03, MIG-07, VAL-03, VAL-04, VAL-05, VAL-06, VAL-15, VAL-16, VAL-18
**Success Criteria** (what must be TRUE):
  1. Pressing Play in BPM mode scrolls the score vertically at the configured tempo, highlighting active noteheads with scale and color animation
  2. Pressing Play in sync mode (with audio and anchors) highlights notes in time with the audio, and the camera smoothly tracks the current playback position
  3. The Puppeteer `window.animationController` API works: calling `setTimestamp(seconds)` highlights the correct notes and positions the camera, producing frame-accurate output in render mode
  4. Transport controls (play, stop, reset) function correctly in both BPM and sync modes
  5. Notehead animation entry/hold/exit timing matches the pre-migration behavior (noteheads scale up on onset, hold during duration, scale back on exit)
**Plans**: TBD

Plans:
- [ ] 03-01: Notehead animation and selector migration
- [ ] 03-02: Camera system and Puppeteer controller

### Phase 4: SyncEditor Migration
**Goal**: The Sync Editor view works with Verovio, allowing users to set timestamp anchors on notes
**Depends on**: Phase 1, Phase 2
**Requirements**: MIG-06, VAL-12, VAL-13
**Success Criteria** (what must be TRUE):
  1. Opening the Sync Editor renders the score using Verovio with all note events displayed in the timeline
  2. Clicking a note in the rendered score selects it (highlighting it) and shows it in the timeline
  3. Setting a timestamp anchor on a selected note persists to the sync store and is consumed by RegularRenderer for interpolation
  4. Audio preview playback in the Sync Editor plays and highlights the current position in the timeline
**Plans**: TBD

Plans:
- [ ] 04-01: SyncEditor Verovio integration

### Phase 5: Validation and Cleanup
**Goal**: OSMD is fully removed, and the complete application works without regression across diverse scores
**Depends on**: Phase 1, Phase 2, Phase 3, Phase 4
**Requirements**: MIG-09, VAL-09, VAL-10, VAL-11, VAL-17
**Success Criteria** (what must be TRUE):
  1. The `opensheetmusicdisplay` package is removed from `package.json` and no OSMD imports remain in the codebase
  2. Score region editor (drag/resize overlay) works correctly with Verovio SVG dimensions
  3. Score border styles (line, ornate, flourish) render correctly above and below the Verovio score
  4. Background image display and score shadow distance controls work unchanged
  5. The application builds and runs without errors after OSMD removal (`npm run build` succeeds, `npm run dev` serves correctly)
**Plans**: TBD

Plans:
- [ ] 05-01: OSMD removal and regression testing

## Requirement Coverage

### Active Requirements (Migration Tasks)

| ID | Requirement | Phase |
|----|-------------|-------|
| MIG-01 | Replace OSMD with Verovio for MusicXML-to-SVG rendering | Phase 1 |
| MIG-02 | Extract musical events from Verovio output | Phase 2 |
| MIG-03 | Adapt notehead animation to Verovio SVG structure | Phase 3 |
| MIG-04 | Adapt score color styling to Verovio conventions | Phase 1 |
| MIG-05 | Adapt MusicXML validation to use Verovio | Phase 1 |
| MIG-06 | Adapt SyncEditor event extraction to use Verovio | Phase 4 |
| MIG-07 | Adapt Puppeteer animation controller to Verovio SVG | Phase 3 |
| MIG-08 | Implement zoom/scale via Verovio's scale option | Phase 1 |
| MIG-09 | Remove OSMD dependency entirely | Phase 5 |

### Validated Requirements (Feature Parity)

| ID | Requirement | Phase |
|----|-------------|-------|
| VAL-01 | MusicXML file upload with drag-drop and validation | Phase 1 |
| VAL-02 | Score rendering from MusicXML to SVG | Phase 1 |
| VAL-03 | BPM-based animation | Phase 3 |
| VAL-04 | Sync-based animation | Phase 3 |
| VAL-05 | Notehead animation | Phase 3 |
| VAL-06 | Camera system | Phase 3 |
| VAL-07 | Score color customization | Phase 1 |
| VAL-08 | Score scale/zoom | Phase 1 |
| VAL-09 | Score region editor | Phase 5 |
| VAL-10 | Score border styles | Phase 5 |
| VAL-11 | Background image support | Phase 5 |
| VAL-12 | Audio upload and preview playback | Phase 4 |
| VAL-13 | Sync Editor | Phase 4 |
| VAL-14 | Timestamp interpolation | Phase 2 |
| VAL-15 | Puppeteer animation controller | Phase 3 |
| VAL-16 | Render mode | Phase 3 |
| VAL-17 | Score shadow distance control | Phase 5 |
| VAL-18 | Transport controls | Phase 3 |

**Coverage: 27/27 requirements mapped (9 active + 18 validated)**

### Dependency Chain

```
Phase 1: Core Verovio Integration
    |
    v
Phase 2: Event System Migration  (requires rendered SVG DOM from Phase 1)
    |
    +-------> Phase 3: Animation and Camera  (requires MusicalEvent[] from Phase 2)
    |
    +-------> Phase 4: SyncEditor Migration  (requires useVerovio + events from Phase 1-2)
                 |
                 v
Phase 5: Validation and Cleanup  (requires all phases complete)
```

Note: Phase 3 and Phase 4 could execute in parallel since they have independent component boundaries (RegularRenderer vs SyncEditor), but Phase 3 is sequenced first because it validates animation patterns that Phase 4 reuses.

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5

| Phase | Plans Complete | Status | Completed |
|-------|---------------|--------|-----------|
| 1. Core Verovio Integration | 2/2 | Complete | 2026-02-03 |
| 2. Event System Migration | 0/1 | Not started | - |
| 3. Animation and Camera | 0/2 | Not started | - |
| 4. SyncEditor Migration | 0/1 | Not started | - |
| 5. Validation and Cleanup | 0/1 | Not started | - |
