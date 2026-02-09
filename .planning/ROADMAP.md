# Roadmap: Manuscript Renderer

## Milestones

- **v1.0 Migration** - Phases 1-5 (shipped 2015-02-04)
- **v1.1 Efficiency** - Phases 6-9 (shipped 2015-02-05)
- **v1.2 SingleLineRenderer** - Phases 10-13 (paused)
- **v1.3 Performance & Polish** - Phase 14 (shipped 2026-02-09)

## Phases

<details>
<summary>v1.0 Migration (Phases 1-5) - SHIPPED 2015-02-04</summary>

Replaced OSMD rendering engine with Verovio across the entire application. Five phases: Core Verovio Integration, Event System Migration, Sync-Only Playback (inserted), Animation and Camera, SyncEditor Migration. All validated requirements confirmed working. OSMD removal deferred to v1.1 cleanup.

- [x] Phase 1: Core Verovio Integration (2 plans)
- [x] Phase 2: Event System Migration (1 plan)
- [x] Phase 2.1: Sync-Only Playback & SyncEditor Verovio (2 plans, inserted)
- [x] Phase 3: Animation and Camera (completed informally)
- [x] Phase 4: SyncEditor Migration (absorbed into Phase 2.1)
- [x] Phase 5: Validation and Cleanup (completed informally, OSMD removal deferred)

</details>

<details>
<summary>v1.1 Efficiency (Phases 6-9) - SHIPPED 2015-02-05</summary>

Reduced memory usage and improved rendering performance for long scores through paginated rendering, event position caching, and virtual scrolling. Removed legacy OSMD dependency.

- [x] Phase 6: Paginated Rendering & Camera (3 plans)
- [x] Phase 7: Event Position Caching (2 plans)
- [x] Phase 8: Virtual Scrolling (1 plan)
- [x] Phase 9: OSMD Cleanup (1 plan)

</details>

<details>
<summary>v1.2 SingleLineRenderer (Phases 10-13) - PAUSED</summary>

**Milestone Goal:** Add a new renderer that displays scores as a single horizontal line with smooth camera tracking and lazy section loading for performance. Music scrolls beneath a fixed center point while notehead animations highlight active notes.

- [x] **Phase 10: Single-Line Verovio Hook** - Section-based horizontal rendering with Verovio
- [x] **Phase 11: Single-Line Event Extraction** - Extract events with X coordinates and section assignments
- [x] **Phase 12: SingleLineRenderer Core** - Horizontal camera, animation, and smooth scrolling
- [ ] **Phase 13: Section Virtualization** - Lazy section loading with seamless transitions (paused)
- [ ] **Phase 13.1: Unplayed Score Styling** - Visual differentiation of played vs unplayed score regions (paused)

</details>

<details>
<summary>v1.3 Performance & Polish (Phase 14) - SHIPPED 2026-02-09</summary>

Page virtualization for RegularRenderer: only visible pages + buffer mounted in DOM, placeholder divs for unmounted pages, seamless page stacking via adjustPageHeight + viewBox trimming. Removed isRenderMode flag.

- [x] **Phase 14: Page Virtualization** - Camera-driven visible page range, conditional rendering, placeholder divs, seamless page stacking (2 plans)

</details>
