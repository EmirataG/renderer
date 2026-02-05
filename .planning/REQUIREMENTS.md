# Requirements: Manuscript Renderer v1.2 SingleLineRenderer

**Defined:** 2026-02-05
**Core Value:** Scores render correctly and efficiently — high-quality engraving with smooth playback, even on long scores.

## v1.2 Requirements

### Horizontal Layout

- [ ] **HOR-01**: Score renders as single horizontal line with no system breaks
- [ ] **HOR-02**: Verovio configured with `breaks: 'none'` for single-system output
- [ ] **HOR-03**: Section transitions are visually seamless (no gaps, staff lines continuous)

### Camera System

- [ ] **CAM-01**: Horizontal camera tracking keeps active note in viewport
- [ ] **CAM-02**: Camera uses CSS `translateX()` transforms
- [ ] **CAM-03**: Score region bounds control animation viewport (same as RegularRenderer)
- [ ] **CAM-04**: Active event positioned at center of score region
- [ ] **CAM-05**: Smooth easing transitions during camera movement

### Section-Based Performance

- [ ] **SEC-01**: Long scores split into sections (10-20 measures each)
- [ ] **SEC-02**: Sections rendered via Verovio `select({ measureRange })` API
- [ ] **SEC-03**: Lazy loading — only visible sections mounted in DOM
- [ ] **SEC-04**: Section overlap for tied notes/slurs continuity

### Animation

- [ ] **ANI-01**: Notehead animation (scale, color, entry/hold/exit) works on horizontal layout
- [ ] **ANI-02**: Animation targets correct section's SVG elements
- [ ] **ANI-03**: Each event has a single X coordinate for animation targeting

## Future Requirements

Deferred to later milestones:

- **Puppeteer support** — Frame capture for SingleLineRenderer video export
- **Renderer toggle UI** — User can switch between RegularRenderer and SingleLineRenderer
- **Variable section sizes** — Optimize section boundaries based on measure density

## Out of Scope

| Feature | Reason |
|---------|--------|
| Vertical rendering changes | RegularRenderer unchanged, this milestone is horizontal only |
| Puppeteer frame capture | Focus on preview playback, Puppeteer support deferred |
| Mobile/touch gestures | Desktop-first, same as v1.0/v1.1 |
| Score border styles | Use existing border system, no horizontal-specific changes |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| HOR-01 | TBD | Pending |
| HOR-02 | TBD | Pending |
| HOR-03 | TBD | Pending |
| CAM-01 | TBD | Pending |
| CAM-02 | TBD | Pending |
| CAM-03 | TBD | Pending |
| CAM-04 | TBD | Pending |
| CAM-05 | TBD | Pending |
| SEC-01 | TBD | Pending |
| SEC-02 | TBD | Pending |
| SEC-03 | TBD | Pending |
| SEC-04 | TBD | Pending |
| ANI-01 | TBD | Pending |
| ANI-02 | TBD | Pending |
| ANI-03 | TBD | Pending |

**Coverage:**
- v1.2 requirements: 15 total
- Mapped to phases: 0
- Unmapped: 15

---
*Requirements defined: 2026-02-05*
*Last updated: 2026-02-05 after initial definition*
