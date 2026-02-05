# Roadmap: Manuscript Renderer

## Milestones

- **v1.0 Migration** - Phases 1-5 (shipped 2026-02-04)
- **v1.1 Efficiency** - Phases 6-9 (in progress)

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

### v1.1 Efficiency (In Progress)

**Milestone Goal:** Reduce memory usage and improve rendering performance for long scores through paginated rendering, event position caching, and virtual scrolling. Remove the legacy OSMD dependency.

- [x] **Phase 6: Paginated Rendering & Camera** - Multi-page SVG output with working camera and playback ✓
- [x] **Phase 7: Event Position Caching** - Extract events once, cache with page assignments, reuse everywhere ✓
- [ ] **Phase 8: Virtual Scrolling** - Mount only visible pages, with Puppeteer compatibility
- [ ] **Phase 9: OSMD Cleanup** - Remove all OSMD code and dependencies

## Phase Details

### Phase 6: Paginated Rendering & Camera
**Goal**: Score renders as multiple smaller SVG pages with a global coordinate system, and camera/playback work seamlessly across page boundaries
**Depends on**: v1.0 complete
**Requirements**: PAG-01, PAG-02, PAG-03, PAG-04, CAM-01, CAM-02, CAM-03
**Success Criteria** (what must be TRUE):
  1. Loading a MusicXML file produces multiple SVG page elements in the DOM instead of one continuous SVG (visible in DevTools as separate page containers)
  2. Camera scrolls smoothly across page boundaries during sync playback with no visual discontinuity or jump at the transition between pages
  3. System-boundary snapping works correctly using paginated global coordinates (camera locks to system tops, not page tops)
  4. Changing the score scale slider re-renders all pages at the new size and camera/playback continue to work correctly
  5. Transport controls (play, stop, reset) function identically to v1.0 behavior on the paginated layout
**Plans**: 3 plans

Plans:
- [x] 06-01-PLAN.md -- useVerovio multi-page rendering + type augments
- [x] 06-02-PLAN.md -- RegularRenderer paginated rendering + camera + events
- [x] 06-03-PLAN.md -- SyncEditor pagination + visual verification

### Phase 7: Event Position Caching
**Goal**: Musical events are extracted once per score load with page assignments and global Y positions, eliminating redundant DOM queries
**Depends on**: Phase 6
**Requirements**: EVT-01, EVT-02, EVT-03, EVT-04
**Success Criteria** (what must be TRUE):
  1. After loading a score, event data (timing, page assignment, Y position) is extracted once and reused across playback sessions without re-extraction
  2. Each event knows which page it belongs to, enabling O(1) page lookup by event ID or timestamp
  3. Global Y positions computed from the page offset map match the actual rendered positions (camera scrolls to the correct vertical location for any event)
  4. Changing scale or reloading a score invalidates the cache and rebuilds it automatically (no stale position data)
**Plans**: 2 plans

Plans:
- [x] 07-01-PLAN.md -- Event cache infrastructure (eventStore + extraction functions)
- [x] 07-02-PLAN.md -- Wire components to use event cache

### Phase 8: Virtual Scrolling
**Goal**: Only pages near the current camera position are mounted in the DOM, bounding memory usage regardless of score length
**Depends on**: Phase 6, Phase 7
**Requirements**: VIR-01, VIR-02, VIR-03, VIR-04, VIR-05, CAM-04
**Success Criteria** (what must be TRUE):
  1. During playback, inspecting the DOM shows only 3-4 page SVGs mounted at any time, with placeholder divs maintaining correct heights for unmounted pages
  2. Notehead animations (scale, color, timing) work correctly on the currently visible page during playback -- no missing or broken animations
  3. In Puppeteer render mode, all pages are mounted and `setTimestamp()` correctly applies animations and captures frames identical to v1.0 output
  4. Scrolling through a long score (50+ systems) maintains consistent memory usage instead of scaling linearly with score length
**Plans**: TBD

Plans:
- [ ] 08-01: TBD
- [ ] 08-02: TBD

### Phase 9: OSMD Cleanup
**Goal**: All traces of OpenSheetMusicDisplay are removed from the codebase
**Depends on**: Nothing (independent, but scheduled after efficiency work)
**Requirements**: CLN-01, CLN-02, CLN-03
**Success Criteria** (what must be TRUE):
  1. `opensheetmusicdisplay` does not appear in `package.json` or `node_modules`
  2. No OSMD imports, references, or dead code paths exist anywhere in the codebase (grep returns zero results)
  3. `npm run build` succeeds and `npm run dev` serves the application without errors after removal
**Plans**: TBD

Plans:
- [ ] 09-01: TBD

## Requirement Coverage

### v1.1 Requirements

| ID | Requirement | Phase |
|----|-------------|-------|
| PAG-01 | Verovio renders score as multiple page SVGs | Phase 6 |
| PAG-02 | All page SVG strings pre-rendered and cached | Phase 6 |
| PAG-03 | Page heights computed into global coordinate system | Phase 6 |
| PAG-04 | Score re-renders all pages on scale change | Phase 6 |
| EVT-01 | Events extracted once from timemap and cached | Phase 7 |
| EVT-02 | Events assigned to pages via getPageWithElement() | Phase 7 |
| EVT-03 | Global Y positions pre-computed from page offsets | Phase 7 |
| EVT-04 | Event cache invalidates on data/layout change | Phase 7 |
| VIR-01 | Only 3-4 SVG pages mounted near camera position | Phase 8 |
| VIR-02 | Unmounted pages represented by placeholder divs | Phase 8 |
| VIR-03 | Page mount/unmount updates during playback | Phase 8 |
| VIR-04 | Virtual scrolling disabled in Puppeteer render mode | Phase 8 |
| VIR-05 | Notehead animation targets correct mounted page | Phase 8 |
| CAM-01 | Camera scrolling works across page boundaries | Phase 6 |
| CAM-02 | System-boundary snapping with paginated coordinates | Phase 6 |
| CAM-03 | Transport controls work with paginated layout | Phase 6 |
| CAM-04 | Puppeteer setTimestamp() mounts correct page | Phase 8 |
| CLN-01 | OSMD package removed from package.json | Phase 9 |
| CLN-02 | All OSMD imports and dead code removed | Phase 9 |
| CLN-03 | Application builds and runs after removal | Phase 9 |

**Coverage: 20/20 requirements mapped**

### Dependency Chain

```
Phase 6: Paginated Rendering & Camera
    |
    v
Phase 7: Event Position Caching  (requires page coordinate system from Phase 6)
    |
    v
Phase 8: Virtual Scrolling  (requires cached events with page assignments from Phase 7)

Phase 9: OSMD Cleanup  (independent, scheduled last)
```

## Progress

**Execution Order:**
Phases execute in order: 6 -> 7 -> 8 -> 9

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
| 8. Virtual Scrolling | v1.1 | 0/? | Not started | - |
| 9. OSMD Cleanup | v1.1 | 0/? | Not started | - |
