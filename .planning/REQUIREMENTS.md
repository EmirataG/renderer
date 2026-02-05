# Requirements: Manuscript Renderer v1.1 Efficiency

**Defined:** 2026-02-04
**Core Value:** Scores render correctly and efficiently -- high-quality engraving with smooth playback, even on long scores.

## v1.1 Requirements

### Paginated Rendering

- [x] **PAG-01**: Verovio renders score as multiple page SVGs instead of a single 60,000px SVG
- [x] **PAG-02**: All page SVG strings are pre-rendered at load time and cached in memory
- [x] **PAG-03**: Page heights are computed and accumulated into a global coordinate system (page offset map)
- [x] **PAG-04**: Score re-renders all pages when scale/zoom changes (cache invalidation on layout reflow)

### Event Caching

- [ ] **EVT-01**: Musical events are extracted once from `renderToTimemap()` and cached (not re-extracted on every render)
- [ ] **EVT-02**: Each event is assigned to its page via `getPageWithElement()` and stored in an event-to-page index
- [ ] **EVT-03**: Global Y positions are pre-computed from page offset map + per-page system positions
- [ ] **EVT-04**: Event cache invalidates and rebuilds when score data or layout options change

### Virtual Scrolling

- [ ] **VIR-01**: Only 3-4 SVG pages near the current camera position are mounted in the DOM
- [ ] **VIR-02**: Unmounted pages are represented by placeholder divs with correct heights
- [ ] **VIR-03**: Page mount/unmount updates as camera position changes during playback
- [ ] **VIR-04**: Virtual scrolling is disabled in Puppeteer render mode (all pages mounted for frame capture)
- [ ] **VIR-05**: Notehead animation targets the correct mounted page's SVG container

### Camera & Playback Adaptation

- [x] **CAM-01**: Camera scrolling works identically across page boundaries (no visual discontinuity)
- [x] **CAM-02**: System-boundary snapping works with paginated coordinates (page offset + local Y)
- [x] **CAM-03**: Transport controls (play, stop, reset) work correctly with paginated layout
- [ ] **CAM-04**: Puppeteer `setTimestamp()` mounts the correct page before applying animations and capturing frame

### OSMD Cleanup

- [ ] **CLN-01**: `opensheetmusicdisplay` package removed from `package.json`
- [ ] **CLN-02**: All OSMD imports and dead code removed from codebase
- [ ] **CLN-03**: Application builds and runs without errors after removal (`npm run build` + `npm run dev`)

## Future Requirements

Deferred to later milestones:

- **Web Worker rendering** -- Offload `renderToSVG()` to background thread for main-thread responsiveness. Defer until profiling shows render blocking is a problem.
- **Render-mode page sequencer** -- In Puppeteer mode, mount only the needed page per frame instead of all pages. Defer until memory in Puppeteer becomes a constraint.

## Out of Scope

| Feature | Reason |
|---------|--------|
| Canvas rendering | SVG DOM APIs too deeply integrated; paginated SVG is the better path |
| Measure-level virtual scrolling | Verovio renders by page, no `renderMeasureToSVG()` API exists |
| SVG `<use>` deduplication across pages | Each page is self-contained; virtual mounting already limits DOM to 3-4 pages |
| Streaming/progressive rendering | Verovio rendering is synchronous and fast per page (5-50ms); unnecessary |
| Incremental re-render on options change | Verovio `redoLayout` changes all pages; no incremental layout API |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| PAG-01 | Phase 6 | Complete |
| PAG-02 | Phase 6 | Complete |
| PAG-03 | Phase 6 | Complete |
| PAG-04 | Phase 6 | Complete |
| EVT-01 | Phase 7 | Pending |
| EVT-02 | Phase 7 | Pending |
| EVT-03 | Phase 7 | Pending |
| EVT-04 | Phase 7 | Pending |
| VIR-01 | Phase 8 | Pending |
| VIR-02 | Phase 8 | Pending |
| VIR-03 | Phase 8 | Pending |
| VIR-04 | Phase 8 | Pending |
| VIR-05 | Phase 8 | Pending |
| CAM-01 | Phase 6 | Complete |
| CAM-02 | Phase 6 | Complete |
| CAM-03 | Phase 6 | Complete |
| CAM-04 | Phase 8 | Pending |
| CLN-01 | Phase 9 | Pending |
| CLN-02 | Phase 9 | Pending |
| CLN-03 | Phase 9 | Pending |

**Coverage:**
- v1.1 requirements: 20 total
- Mapped to phases: 20
- Unmapped: 0

---
*Requirements defined: 2026-02-04*
*Last updated: 2026-02-04 after roadmap creation*
