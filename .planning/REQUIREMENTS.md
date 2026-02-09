# Requirements: Manuscript Renderer v1.3 PixiJS SingleLineRenderer

**Defined:** 2026-02-08
**Core Value:** Scores render correctly and efficiently -- high-quality engraving with smooth playback, even on long scores.

## v1.3 Requirements

### SVG-to-Texture Pipeline

- [x] **TEX-01**: Verovio SVG sections convert to PixiJS Texture objects
- [x] **TEX-02**: SVG-to-texture conversion uses data URI + HTMLImageElement pipeline
- [x] **TEX-03**: Textures are cached (same section + settings = same texture, no duplicate conversion)
- [x] **TEX-04**: Black colors (#000) pre-processed to dark gray (#111) before conversion (enables tint highlighting)
- [x] **TEX-05**: Music fonts (Bravura, etc.) fully loaded before texture conversion begins

### Renderer Structure

- [x] **REN-01**: PixiSingleLineRenderer component uses @pixi/react Application
- [x] **REN-02**: Section sprites positioned horizontally using sectionOffsets from Verovio hook
- [x] **REN-03**: Stage dimensions match score region bounds
- [x] **REN-04**: Proper useEffect cleanup destroys PixiJS application and textures on unmount
- [x] **REN-05**: WebGL context loss recovery handlers registered from initialization

### Camera System

- [ ] **CAM-01**: Camera container uses isRenderGroup: true for GPU-accelerated transforms
- [ ] **CAM-02**: Active note stays centered in viewport (fixed playhead at 50%)
- [ ] **CAM-03**: Camera position updates via container.position.x (no React state in RAF)
- [ ] **CAM-04**: Smooth interpolation using lerp for camera movement
- [ ] **CAM-05**: Animation loop uses PixiJS Ticker exclusively (no custom RAF)
- [ ] **CAM-06**: Score region bounds control visible viewport

### Note Highlighting

- [ ] **HLT-01**: Active section highlights via sprite.tint property (GPU shader operation)
- [ ] **HLT-02**: Highlight timing matches RegularRenderer (entry/hold/exit phases)
- [ ] **HLT-03**: Highlight color configurable via existing score color option
- [ ] **HLT-04**: Animation state stored in refs (no React state during playback)

### Section Virtualization

- [ ] **VIR-01**: Only visible sections + buffer (±1) have sprites created
- [ ] **VIR-02**: Off-screen sections use sprite.visible = false (not unmount)
- [ ] **VIR-03**: Texture GC timeout extended to prevent premature cleanup
- [ ] **VIR-04**: Memory cleanup on section unload (texture disposal)

### Integration

- [ ] **INT-01**: Transport controls (play/pause/reset) work with PixiJS renderer
- [ ] **INT-02**: Renderer toggle switches between SVG and PixiJS SingleLineRenderer
- [ ] **INT-03**: Score color option applies to PixiJS-rendered score
- [ ] **INT-04**: Music font selector works with PixiJS renderer

## Future Requirements

Deferred to later milestones:

- **Puppeteer canvas capture** -- app.renderer.extract.canvas() for video export
- **Click-to-edit on WebGL** -- SyncEditor continues using SVG for click detection
- **RegularRenderer WebGL migration** -- Vertical renderer stays SVG

## Out of Scope

| Feature | Reason |
|---------|--------|
| Konva.js Canvas 2D | Abandoned - CPU-bound redraws on position changes |
| Per-note highlighting | Section-level tinting is simpler, per-note requires overlay sprites |
| Adaptive scroll speed | Complex timestamp-aware calculations, defer to v2+ |
| pixi-viewport library | Overkill for single-axis scrolling |
| @pixi/filter-* packages | Sprite.tint handles highlighting without filters |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| TEX-01 | Phase 14 | Complete |
| TEX-02 | Phase 14 | Complete |
| TEX-03 | Phase 14 | Complete |
| TEX-04 | Phase 14 | Complete |
| TEX-05 | Phase 14 | Complete |
| REN-01 | Phase 15 | Complete |
| REN-02 | Phase 15 | Complete |
| REN-03 | Phase 15 | Complete |
| REN-04 | Phase 15 | Complete |
| REN-05 | Phase 15 | Complete |
| CAM-01 | Phase 16 | Pending |
| CAM-02 | Phase 16 | Pending |
| CAM-03 | Phase 16 | Pending |
| CAM-04 | Phase 16 | Pending |
| CAM-05 | Phase 16 | Pending |
| CAM-06 | Phase 16 | Pending |
| HLT-01 | Phase 17 | Pending |
| HLT-02 | Phase 17 | Pending |
| HLT-03 | Phase 17 | Pending |
| HLT-04 | Phase 17 | Pending |
| VIR-01 | Phase 18 | Pending |
| VIR-02 | Phase 18 | Pending |
| VIR-03 | Phase 18 | Pending |
| VIR-04 | Phase 18 | Pending |
| INT-01 | Phase 19 | Pending |
| INT-02 | Phase 19 | Pending |
| INT-03 | Phase 19 | Pending |
| INT-04 | Phase 19 | Pending |

**Coverage:**
- v1.3 requirements: 28 total
- Mapped to phases: 28
- Unmapped: 0

---
*Requirements defined: 2026-02-08*
*Last updated: 2026-02-08 after research completion*
