# Roadmap: Manuscript Renderer

## Milestones

- **v1.0 Migration** - Phases 1-5 (shipped 2026-02-04)
- **v1.1 Efficiency** - Phases 6-9 (shipped 2026-02-05)
- **v1.2 SingleLineRenderer** - Phases 10-13 (paused)
- **v1.3 Performance & Polish** - Phases 14-15 (in progress)

## Phases

<details>
<summary>v1.0 Migration (Phases 1-5) - SHIPPED 2026-02-04</summary>

Replaced OSMD rendering engine with Verovio across the entire application. Five phases: Core Verovio Integration, Event System Migration, Sync-Only Playback (inserted), Animation and Camera, SyncEditor Migration. All validated requirements confirmed working. OSMD removal deferred to v1.1 cleanup.

- [x] Phase 1: Core Verovio Integration (2 plans)
- [x] Phase 2: Event System Migration (1 plan)
- [x] Phase 2.1: Sync-Only Playback & SyncEditor Verovio (2 plans, inserted)
- [x] Phase 3: Animation and Camera (completed informally)
- [x] Phase 4: SyncEditor Migration (absorbed into Phase 2.1)
- [x] Phase 5: Validation and Cleanup (completed informally, OSMD removal deferred)

</details>

<details>
<summary>v1.1 Efficiency (Phases 6-9) - SHIPPED 2026-02-05</summary>

Reduced memory usage and improved rendering performance for long scores through paginated rendering, event position caching, and virtual scrolling. Removed legacy OSMD dependency.

- [x] Phase 6: Paginated Rendering & Camera (3 plans)
- [x] Phase 7: Event Position Caching (2 plans)
- [x] Phase 8: Virtual Scrolling (1 plan)
- [x] Phase 9: OSMD Cleanup (1 plan)

</details>

<details>
<summary>v1.2 SingleLineRenderer (Phases 10-13) - PAUSED</summary>

**Milestone Goal:** Add a new renderer that displays scores as a single horizontal line with smooth camera tracking and lazy section loading for performance. Music scrolls beneath a fixed center point while notehead animations highlight active notes.

- [x] **Phase 10: Single-Line Verovio Hook** - Section-based horizontal rendering with Verovio ✓
- [x] **Phase 11: Single-Line Event Extraction** - Extract events with X coordinates and section assignments ✓
- [x] **Phase 12: SingleLineRenderer Core** - Horizontal camera, animation, and smooth scrolling ✓
- [ ] **Phase 13: Section Virtualization** - Lazy section loading with seamless transitions (paused)
- [ ] **Phase 13.1: Unplayed Score Styling** - Visual differentiation of played vs unplayed score regions (paused)

</details>

### v1.3 Performance & Polish (IN PROGRESS)

**Milestone Goal:** Finalize RegularRenderer with page virtualization (only visible pages in DOM), seamless page transitions, and a moving playhead cursor that follows playback.

- [ ] **Phase 14: Page Virtualization** - Only mount visible pages + buffer, placeholder divs for unmounted, fix page gaps
- [ ] **Phase 15: Playhead Cursor** - Vertical line cursor synchronized with audio playback

## Phase Details

### Phase 10: Single-Line Verovio Hook
**Goal**: Verovio renders score as horizontal sections using `breaks: 'none'` configuration and measure-range selection
**Depends on**: v1.1 complete
**Requirements**: HOR-01, HOR-02, SEC-01, SEC-02
**Success Criteria** (what must be TRUE):
  1. A MusicXML file renders as a single horizontal system with no line breaks (one continuous staff line)
  2. Long scores are divided into 10-20 measure sections, each rendered as a separate SVG via `select({ measureRange })`
  3. Section SVGs can be laid out horizontally with correct widths from viewBox dimensions
  4. Changing the score produces new sections with correct measure assignments
**Plans:** 1 plan
Plans:
- [x] 10-01-PLAN.md — Type augments + useSingleLineVerovio hook

### Phase 11: Single-Line Event Extraction
**Goal**: Musical events are extracted with X coordinates and section assignments for horizontal positioning
**Depends on**: Phase 10
**Requirements**: ANI-03
**Success Criteria** (what must be TRUE):
  1. Each event has a `globalX` coordinate representing its horizontal position across all sections
  2. Each event has a `sectionIndex` identifying which section SVG contains it
  3. X coordinates are computed from section offsets plus local element positions (analogous to vertical page offsets)
**Plans:** 1 plan
Plans:
- [x] 11-01-PLAN.md — Extend CachedEvent type + computeSectionPositions function

### Phase 12: SingleLineRenderer Core
**Goal**: Users can play back a score in horizontal single-line mode with smooth camera tracking and notehead animation
**Depends on**: Phase 10, Phase 11
**Requirements**: CAM-01, CAM-02, CAM-03, CAM-04, CAM-05, ANI-01, ANI-02
**Success Criteria** (what must be TRUE):
  1. During playback, the active note stays near the center of the score region (not drifting to edges)
  2. Camera movement uses CSS `translateX()` with smooth easing transitions (no jumps or jitter)
  3. Notehead animation (scale, color, entry/hold/exit) works identically to RegularRenderer on the horizontal layout
  4. Score region bounds control the animation viewport (same as RegularRenderer)
  5. Transport controls (play, stop, reset) work correctly with horizontal layout
**Plans:** 2 plans
Plans:
- [x] 12-01-PLAN.md — Create SingleLineRenderer component with horizontal camera and animation
- [x] 12-02-PLAN.md — Visual verification checkpoint

### Phase 13: Section Virtualization
**Goal**: Only visible sections are mounted in DOM, with seamless transitions that hide section boundaries
**Depends on**: Phase 12
**Requirements**: SEC-03, SEC-04, HOR-03
**Success Criteria** (what must be TRUE):
  1. During playback, inspecting the DOM shows only 3 sections mounted at any time (current + buffer), with placeholder divs for unmounted sections
  2. Section boundaries are invisible to users (staff lines appear continuous, no gaps or visual seams)
  3. Tied notes and slurs that cross section boundaries render correctly (overlap strategy working)
  4. Switching sections during playback causes no animation glitches or missing noteheads
**Plans:** 3 plans
Plans:
- [ ] 13-01-PLAN.md — Basic virtualization (cameraX tracking, visibleSectionIndices, conditional rendering)
- [ ] 13-02-PLAN.md — Overlap rendering + clip-path for seamless boundaries
- [ ] 13-03-PLAN.md — Visual verification checkpoint

### Phase 13.1: Unplayed Score Styling (PAUSED)
**Goal**: Inspector option to visually differentiate played vs unplayed score regions using clip-path for complex elements and direct styling for noteheads/stems/accidentals/dots
**Depends on**: Phase 13
**Requirements**: STY-01, STY-02, STY-03
**Success Criteria** (what must be TRUE):
  1. Inspector has a dropdown/toggle to enable "unplayed styling" with options (e.g., dimmed, invisible, different color)
  2. Noteheads, stems, accidentals, and dots change style directly when transitioning from unplayed to played
  3. Staff lines, barlines, beams, and other complex elements use clip-path to reveal played portions progressively
  4. The clip-path boundary follows the current playback position (X coordinate in SingleLineRenderer)
  5. Style changes apply to both SingleLineRenderer and RegularRenderer
**Plans:** 3 plans
Plans:
- [x] 13.1-01-PLAN.md — Store + Inspector UI controls
- [x] 13.1-02-PLAN.md — Core styling logic + SingleLineRenderer integration
- [ ] 13.1-03-PLAN.md — RegularRenderer integration + visual verification

### Phase 14: Page Virtualization
**Goal**: RegularRenderer only mounts visible pages + buffer in DOM, with seamless page transitions (no gaps)
**Depends on**: v1.1 complete
**Requirements**: VIRT-01, VIRT-02, VIRT-03, VIRT-04, VIRT-05, GAP-01, GAP-02
**Success Criteria** (what must be TRUE):
  1. During playback, inspecting the DOM shows only 3 pages mounted at any time (current + 1 above + 1 below), with placeholder divs for unmounted pages
  2. Pages far from viewport are unmounted to free memory
  3. No visible gaps between adjacent pages - staff lines appear continuous
  4. Fast initial load - only first 1-2 pages rendered on mount
  5. No visible flash or jank when pages mount/unmount during scroll
**Plans:** 2 plans
Plans:
- [ ] 14-01-PLAN.md — Core virtualization (camera-driven visible page range, conditional rendering, placeholder divs) + isRenderMode removal
- [ ] 14-02-PLAN.md — Seamless page stacking (adjustPageHeight, viewBox trimming) + visual verification

### Phase 15: Playhead Cursor
**Goal**: Vertical line cursor follows active event during playback, synchronized with audio
**Depends on**: Phase 14
**Requirements**: CUR-01, CUR-02, CUR-03, CUR-04, CUR-05, POL-01, POL-02
**Success Criteria** (what must be TRUE):
  1. During playback, a vertical line cursor is positioned at the active event's X coordinate
  2. Cursor spans the height of the current system (not full page)
  3. Cursor position updates in sync with audio.currentTime (no drift or lag)
  4. Cursor movement is smooth (CSS transition between positions)
  5. Cursor is hidden when not playing or no audio loaded
  6. Cursor color is configurable (default: red)
**Plans:** 2 plans
Plans:
- [ ] 15-01-PLAN.md — Core cursor rendering and positioning
- [ ] 15-02-PLAN.md — Cursor styling and configuration

## Requirement Coverage

### v1.3 Requirements

| ID | Requirement | Phase |
|----|-------------|-------|
| VIRT-01 | Only visible pages + buffer mounted in DOM | Phase 14 |
| VIRT-02 | Placeholder divs maintain layout for unmounted pages | Phase 14 |
| VIRT-03 | Pages unmount when scrolled out of view + buffer | Phase 14 |
| VIRT-04 | Fast initial load - only first 1-2 pages rendered | Phase 14 |
| VIRT-05 | No visible flash or jank during mount/unmount | Phase 14 |
| GAP-01 | No visible gaps between adjacent pages | Phase 14 |
| GAP-02 | Staff lines appear continuous across page boundaries | Phase 14 |
| CUR-01 | Vertical line cursor at active event X coordinate | Phase 15 |
| CUR-02 | Cursor spans height of current system | Phase 15 |
| CUR-03 | Cursor synchronized with audio timestamp | Phase 15 |
| CUR-04 | Smooth cursor movement (CSS transition) | Phase 15 |
| CUR-05 | Cursor hidden when not playing | Phase 15 |
| POL-01 | Camera follows cursor during playback | Phase 15 |
| POL-02 | Configurable cursor color | Phase 15 |

**Coverage: 14/14 v1.3 requirements mapped**

<details>
<summary>v1.2 Requirements (paused)</summary>

| ID | Requirement | Phase |
|----|-------------|-------|
| HOR-01 | Score renders as single horizontal line with no system breaks | Phase 10 |
| HOR-02 | Verovio configured with `breaks: 'none'` for single-system output | Phase 10 |
| HOR-03 | Section transitions are visually seamless (no gaps, staff lines continuous) | Phase 13 |
| CAM-01 | Horizontal camera tracking keeps active note in viewport | Phase 12 |
| CAM-02 | Camera uses CSS `translateX()` transforms | Phase 12 |
| CAM-03 | Score region bounds control animation viewport | Phase 12 |
| CAM-04 | Active event positioned at center of score region | Phase 12 |
| CAM-05 | Smooth easing transitions during camera movement | Phase 12 |
| SEC-01 | Long scores split into sections (10-20 measures each) | Phase 10 |
| SEC-02 | Sections rendered via Verovio `select({ measureRange })` API | Phase 10 |
| SEC-03 | Lazy loading -- only visible sections mounted in DOM | Phase 13 |
| SEC-04 | Section overlap for tied notes/slurs continuity | Phase 13 |
| ANI-01 | Notehead animation works on horizontal layout | Phase 12 |
| ANI-02 | Animation targets correct section's SVG elements | Phase 12 |
| ANI-03 | Each event has a single X coordinate for animation targeting | Phase 11 |
| STY-01 | Inspector option to enable unplayed score styling | Phase 13.1 |
| STY-02 | Noteheads/stems/accidentals/dots use direct style changes | Phase 13.1 |
| STY-03 | Staff lines/barlines/beams use clip-path for progressive reveal | Phase 13.1 |

</details>

### Dependency Chain

**v1.3 (current):**
```
Phase 14: Page Virtualization
    |
    v
Phase 15: Playhead Cursor  (requires working virtualization from Phase 14)
```

<details>
<summary>v1.2 dependency chain (paused)</summary>

```
Phase 10: Single-Line Verovio Hook
    |
    v
Phase 11: Single-Line Event Extraction  (requires section containers from Phase 10)
    |
    v
Phase 12: SingleLineRenderer Core  (requires events with X coordinates from Phase 11)
    |
    v
Phase 13: Section Virtualization  (requires working renderer from Phase 12)
    |
    v
Phase 13.1: Unplayed Score Styling  (requires virtualization for clip-path boundaries)
```

</details>

## Progress

**Execution Order:**
v1.3: 14 -> 15

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Core Verovio Integration | v1.0 | 2/2 | Complete | 2026-02-03 |
| 2. Event System Migration | v1.0 | 1/1 | Complete | 2026-02-03 |
| 2.1. Sync-Only Playback | v1.0 | 2/2 | Complete | 2026-02-04 |
| 3. Animation and Camera | v1.0 | -- | Complete | 2026-02-04 |
| 4. SyncEditor Migration | v1.0 | -- | Complete | 2026-02-04 |
| 5. Validation and Cleanup | v1.0 | -- | Complete | 2026-02-04 |
| 6. Paginated Rendering & Camera | v1.1 | 3/3 | Complete | 2026-02-04 |
| 7. Event Position Caching | v1.1 | 2/2 | Complete | 2026-02-04 |
| 8. Virtual Scrolling | v1.1 | 1/1 | Complete | 2026-02-05 |
| 9. OSMD Cleanup | v1.1 | 1/1 | Complete | 2026-02-05 |
| 10. Single-Line Verovio Hook | v1.2 | 1/1 | Complete | 2026-02-05 |
| 11. Single-Line Event Extraction | v1.2 | 1/1 | Complete | 2026-02-05 |
| 12. SingleLineRenderer Core | v1.2 | 2/2 | Complete | 2026-02-07 |
| 13. Section Virtualization | v1.2 | 0/3 | Paused | -- |
| 13.1. Unplayed Score Styling | v1.2 | 2/3 | Paused | -- |
| 14. Page Virtualization | v1.3 | 0/2 | Planned | -- |
| 15. Playhead Cursor | v1.3 | 0/2 | Planned | -- |
