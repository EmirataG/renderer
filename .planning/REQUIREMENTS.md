# Requirements: Manuscript Renderer v1.3 Performance & Polish

**Defined:** 2026-02-08
**Core Value:** Scores render correctly and efficiently -- high-quality engraving with smooth playback, even on long scores.

## v1.3 Requirements

### Page Virtualization

- [x] **VIRT-01**: Only visible pages + buffer mounted in DOM (not entire score)
- [x] **VIRT-02**: Placeholder divs maintain layout for unmounted pages
- [x] **VIRT-03**: Pages unmount when scrolled out of view + buffer distance
- [x] **VIRT-04**: Fast initial load - only first 1-2 pages rendered on load
- [x] **VIRT-05**: No visible flash or jank during page mount/unmount

### Page Gap Fix

- [x] **GAP-01**: No visible gaps between adjacent pages during scroll
- [x] **GAP-02**: Staff lines appear continuous across page boundaries

### Playhead Cursor

- [ ] **CUR-01**: Vertical line cursor positioned at active event's X coordinate
- [ ] **CUR-02**: Cursor spans height of current system (not full page)
- [ ] **CUR-03**: Cursor synchronized with audio playback timestamp
- [ ] **CUR-04**: Smooth cursor movement during playback (CSS transition)
- [ ] **CUR-05**: Cursor hidden when not playing or no audio loaded

### Polish

- [ ] **POL-01**: Camera follows cursor during playback (existing behavior maintained)
- [ ] **POL-02**: Configurable cursor color (default: red)

## Deferred to Future Milestones

- **SVGO optimization**: Research showed limited benefit for music notation SVGs (preserve element IDs, complex structure)
- **Cursor scrubbing**: Click/drag cursor to seek audio
- **Cursor hover tooltips**: Show measure number, timestamp on hover
- **Multi-voice cursors**: Separate cursor per voice/staff

## Out of Scope

| Feature | Reason |
|---------|--------|
| SingleLineRenderer changes | Focus on RegularRenderer for this milestone |
| Puppeteer frame capture changes | Not affected by virtualization |
| Mobile/touch gestures | Desktop-first priority |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| VIRT-01 | Phase 14 | Complete |
| VIRT-02 | Phase 14 | Complete |
| VIRT-03 | Phase 14 | Complete |
| VIRT-04 | Phase 14 | Complete |
| VIRT-05 | Phase 14 | Complete |
| GAP-01 | Phase 14 | Complete |
| GAP-02 | Phase 14 | Complete |
| CUR-01 | Phase 15 | Pending |
| CUR-02 | Phase 15 | Pending |
| CUR-03 | Phase 15 | Pending |
| CUR-04 | Phase 15 | Pending |
| CUR-05 | Phase 15 | Pending |
| POL-01 | Phase 15 | Pending |
| POL-02 | Phase 15 | Pending |

**Coverage:**
- v1.3 requirements: 14 total
- Mapped to phases: 14
- Unmapped: 0

---
*Requirements defined: 2026-02-08*
