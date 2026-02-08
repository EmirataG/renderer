# Roadmap: Manuscript Renderer

## Milestones

- **v1.0 Migration** - Phases 1-5 (shipped 2026-02-04)
- **v1.1 Efficiency** - Phases 6-9 (shipped 2026-02-05)
- **v1.2 SingleLineRenderer** - Phases 10-13 (in progress)
- **v1.3 PixiJS SingleLineRenderer** - Phases 14-19 (planned)

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
<summary>v1.2 SingleLineRenderer (Phases 10-13) - IN PROGRESS</summary>

**Milestone Goal:** Add a new renderer that displays scores as a single horizontal line with smooth camera tracking and lazy section loading for performance. Music scrolls beneath a fixed center point while notehead animations highlight active notes.

- [x] **Phase 10: Single-Line Verovio Hook** - Section-based horizontal rendering with Verovio
- [x] **Phase 11: Single-Line Event Extraction** - Extract events with X coordinates and section assignments
- [x] **Phase 12: SingleLineRenderer Core** - Horizontal camera, animation, and smooth scrolling
- [ ] **Phase 13: Section Virtualization** - Lazy section loading with seamless transitions
- [ ] **Phase 13.1: Unplayed Score Styling** - Visual differentiation of played vs unplayed score regions (INSERTED)

</details>

### v1.3 PixiJS SingleLineRenderer (IN PROGRESS)

**Milestone Goal:** Migrate SingleLineRenderer from SVG to PixiJS WebGL rendering to achieve smooth 60fps scrolling and GPU-accelerated note highlighting. PixiJS provides true GPU rendering where position transforms and color changes happen on the GPU via shaders, eliminating the CPU-bound redraws that made Konva.js Canvas 2D unsuitable.

- [ ] **Phase 14: SVG-to-Texture Pipeline** - Convert Verovio SVG sections to PixiJS GPU textures
- [ ] **Phase 15: Basic PixiJS Renderer** - Static score display with @pixi/react components
- [ ] **Phase 16: Camera System** - GPU-accelerated horizontal scrolling via render groups
- [ ] **Phase 17: Note Highlighting** - Section tinting via GPU shader (sprite.tint)
- [ ] **Phase 18: Section Virtualization** - Sprite visibility toggling for long scores
- [ ] **Phase 19: Integration and Polish** - Transport controls, color options, renderer toggle

## Phase Details

### Phase 14: SVG-to-Texture Pipeline
**Goal**: Verovio SVG sections convert reliably to PixiJS GPU textures with proper font handling and caching
**Depends on**: v1.2 complete (useSingleLineVerovio hook provides SVG sections)
**Requirements**: TEX-01, TEX-02, TEX-03, TEX-04, TEX-05
**Success Criteria** (what must be TRUE):
  1. A Verovio-generated SVG section renders as a PixiJS Texture without missing glyphs or font rendering issues
  2. Converting the same section twice returns the cached texture (no duplicate conversion)
  3. Black (#000) elements in SVG appear as dark gray (#111) in the texture (enabling tint highlighting)
  4. Music fonts (Bravura, etc.) are fully loaded before any texture conversion begins
  5. Long sections exceeding GPU texture limits are detected and handled (error or split)
**Plans:** 2 plans
Plans:
- [ ] 14-01-PLAN.md - Create svgToTexture module with color preprocessing, caching, and font loading
- [ ] 14-02-PLAN.md - Add texture size limits, tests, and manual verification

### Phase 15: Basic PixiJS Renderer
**Goal**: Static score displays correctly in PixiJS with proper React integration and resource cleanup
**Depends on**: Phase 14
**Requirements**: REN-01, REN-02, REN-03, REN-04, REN-05
**Success Criteria** (what must be TRUE):
  1. Score sections appear horizontally laid out in the PixiJS canvas, matching the SVG SingleLineRenderer layout
  2. PixiJS stage dimensions match the score region bounds (no overflow or clipping)
  3. Unmounting the renderer releases all GPU resources (no memory leak on component unmount)
  4. WebGL context loss triggers recovery handlers (renderer can rebuild after GPU reclaim)
  5. Score is positioned at start (leftmost section visible, not centered on empty space)
**Plans**: TBD

### Phase 16: Camera System
**Goal**: Smooth 60fps horizontal scrolling keeps active note centered using GPU-accelerated transforms
**Depends on**: Phase 15
**Requirements**: CAM-01, CAM-02, CAM-03, CAM-04, CAM-05, CAM-06
**Success Criteria** (what must be TRUE):
  1. During playback, the active note stays at the center of the viewport (fixed playhead behavior)
  2. Camera movement is smooth with no jitter or frame drops (60fps sustained)
  3. Camera position updates via container.position.x without triggering React re-renders
  4. Score region bounds constrain the visible area (camera respects region edges)
  5. Stopping/resetting playback smoothly transitions camera to appropriate position
**Plans**: TBD

### Phase 17: Note Highlighting
**Goal**: Active section highlights via GPU shader without redraw, matching RegularRenderer timing
**Depends on**: Phase 16
**Requirements**: HLT-01, HLT-02, HLT-03, HLT-04
**Success Criteria** (what must be TRUE):
  1. When a note plays, its containing section visibly highlights (color shift via tint)
  2. Highlight timing (entry, hold, exit) matches RegularRenderer behavior
  3. Highlight color respects the user's score color setting
  4. Highlighting causes no frame drops or performance degradation (GPU shader operation)
**Plans**: TBD

### Phase 18: Section Virtualization
**Goal**: Only visible sections consume GPU resources, enabling smooth playback of long scores
**Depends on**: Phase 17
**Requirements**: VIR-01, VIR-02, VIR-03, VIR-04
**Success Criteria** (what must be TRUE):
  1. Inspecting the scene graph shows only visible sections plus buffer (current +/- 1) have active sprites
  2. Off-screen sections are hidden via sprite.visible (not unmounted) for instant reveal
  3. Long scores (100+ sections) play back without memory growth or texture disposal issues
  4. Section transitions during playback are seamless (no pop-in or missing sections)
**Plans**: TBD

### Phase 19: Integration and Polish
**Goal**: PixiJS renderer integrates fully with existing app controls and options
**Depends on**: Phase 18
**Requirements**: INT-01, INT-02, INT-03, INT-04
**Success Criteria** (what must be TRUE):
  1. Transport controls (play/pause/reset) work correctly with PixiJS renderer
  2. Inspector toggle switches between SVG and PixiJS SingleLineRenderer
  3. Score color option applies to PixiJS-rendered score (texture tinting or regeneration)
  4. Music font selector works with PixiJS renderer (textures regenerate on font change)
**Plans**: TBD

## Requirement Coverage

### v1.3 Requirements

| ID | Requirement | Phase |
|----|-------------|-------|
| TEX-01 | Verovio SVG sections convert to PixiJS Texture objects | Phase 14 |
| TEX-02 | SVG-to-texture conversion uses data URI + HTMLImageElement pipeline | Phase 14 |
| TEX-03 | Textures are cached (same section + settings = same texture) | Phase 14 |
| TEX-04 | Black colors (#000) pre-processed to dark gray (#111) for tint | Phase 14 |
| TEX-05 | Music fonts fully loaded before texture conversion begins | Phase 14 |
| REN-01 | PixiSingleLineRenderer uses @pixi/react Application | Phase 15 |
| REN-02 | Section sprites positioned horizontally using sectionOffsets | Phase 15 |
| REN-03 | Stage dimensions match score region bounds | Phase 15 |
| REN-04 | Proper useEffect cleanup destroys PixiJS app and textures | Phase 15 |
| REN-05 | WebGL context loss recovery handlers registered | Phase 15 |
| CAM-01 | Camera container uses isRenderGroup: true for GPU transforms | Phase 16 |
| CAM-02 | Active note stays centered in viewport (fixed playhead at 50%) | Phase 16 |
| CAM-03 | Camera position updates via container.position.x (no React state) | Phase 16 |
| CAM-04 | Smooth interpolation using lerp for camera movement | Phase 16 |
| CAM-05 | Animation loop uses PixiJS Ticker exclusively (no custom RAF) | Phase 16 |
| CAM-06 | Score region bounds control visible viewport | Phase 16 |
| HLT-01 | Active section highlights via sprite.tint (GPU shader) | Phase 17 |
| HLT-02 | Highlight timing matches RegularRenderer (entry/hold/exit) | Phase 17 |
| HLT-03 | Highlight color configurable via score color option | Phase 17 |
| HLT-04 | Animation state stored in refs (no React state during playback) | Phase 17 |
| VIR-01 | Only visible sections + buffer have sprites created | Phase 18 |
| VIR-02 | Off-screen sections use sprite.visible = false (not unmount) | Phase 18 |
| VIR-03 | Texture GC timeout extended to prevent premature cleanup | Phase 18 |
| VIR-04 | Memory cleanup on section unload (texture disposal) | Phase 18 |
| INT-01 | Transport controls work with PixiJS renderer | Phase 19 |
| INT-02 | Renderer toggle switches between SVG and PixiJS SingleLineRenderer | Phase 19 |
| INT-03 | Score color option applies to PixiJS-rendered score | Phase 19 |
| INT-04 | Music font selector works with PixiJS renderer | Phase 19 |

**Coverage: 28/28 v1.3 requirements mapped**

### Dependency Chain

```
Phase 14: SVG-to-Texture Pipeline
    |
    v
Phase 15: Basic PixiJS Renderer  (requires textures from Phase 14)
    |
    v
Phase 16: Camera System  (requires working renderer from Phase 15)
    |
    v
Phase 17: Note Highlighting  (requires camera positioning from Phase 16)
    |
    v
Phase 18: Section Virtualization  (requires highlighting working from Phase 17)
    |
    v
Phase 19: Integration and Polish  (requires all features working)
```

## Progress

**Execution Order:**
Phases execute in order: 14 -> 15 -> 16 -> 17 -> 18 -> 19

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
| 13. Section Virtualization | v1.2 | 0/3 | Planned | -- |
| 13.1. Unplayed Score Styling | v1.2 | 2/3 | In Progress | -- |
| 14. SVG-to-Texture Pipeline | v1.3 | 0/2 | Planned | -- |
| 15. Basic PixiJS Renderer | v1.3 | 0/TBD | Not started | -- |
| 16. Camera System | v1.3 | 0/TBD | Not started | -- |
| 17. Note Highlighting | v1.3 | 0/TBD | Not started | -- |
| 18. Section Virtualization | v1.3 | 0/TBD | Not started | -- |
| 19. Integration and Polish | v1.3 | 0/TBD | Not started | -- |
