# Manuscript Renderer

## What This Is

A browser-based MusicXML score renderer with animated playback, used to generate scrolling score videos. Powered by Verovio (WASM) for high-quality music engraving. The app renders scores with vertical camera scrolling, notehead animations, audio sync, and Puppeteer-based frame capture for video export.

## Core Value

Scores render correctly and efficiently — high-quality engraving with smooth playback, even on long scores.

## Requirements

### Validated

Capabilities shipped and confirmed working:

- ✓ VAL-01: MusicXML file upload with drag-drop and validation — v1.0
- ✓ VAL-02: Score rendering from MusicXML to SVG (Verovio) — v1.0
- ✓ VAL-04: Sync-based animation: audio-driven playback with user-set anchor timestamps — v1.0
- ✓ VAL-05: Notehead animation: scale, color highlight, entry/hold/exit timing on active notes — v1.0
- ✓ VAL-06: Camera system: smooth vertical scrolling with system-boundary snapping — v1.0
- ✓ VAL-07: Score color customization: all SVG elements recolored to user-chosen color — v1.0
- ✓ VAL-08: Score scale/zoom: adjustable score size with layout reflow — v1.0
- ✓ VAL-09: Score region editor: draggable/resizable region positioning over background image — v1.0
- ✓ VAL-10: Score border styles: decorative top/bottom borders (line, ornate, flourish) — v1.0
- ✓ VAL-11: Background image support: score overlaid on user-uploaded image — v1.0
- ✓ VAL-12: Audio upload and preview playback — v1.0
- ✓ VAL-13: Sync Editor: visual event timeline for setting timestamp anchors per note — v1.0
- ✓ VAL-14: Timestamp interpolation: computes per-event timestamps from sparse anchor points — v1.0
- ✓ VAL-15: Puppeteer animation controller: frame-by-frame rendering API exposed on window — v1.0
- ✓ VAL-16: Render mode: scales output to fill viewport for video capture — v1.0
- ✓ VAL-17: Score shadow distance control — v1.0
- ✓ VAL-18: Transport controls: play, stop, reset (sync-only) — v1.0
- ✓ MIG-01: Verovio WASM rendering engine — v1.0
- ✓ MIG-02: Event extraction from Verovio timemap — v1.0
- ✓ MIG-03: Notehead animation targeting Verovio SVG structure — v1.0
- ✓ MIG-04: Score color styling via Verovio CSS conventions — v1.0
- ✓ MIG-05: MusicXML validation via Verovio — v1.0
- ✓ MIG-06: SyncEditor event extraction via Verovio — v1.0
- ✓ MIG-08: Zoom/scale via Verovio scale option — v1.0
- ✓ Color stems & accidentals option for note animation — v1.0 (quick task)
- ✓ EFF-01: Paginated SVG rendering (render pages on demand instead of one giant SVG) — v1.1
- ✓ EFF-02: Cache event positions after extraction (avoid repeated DOM queries) — v1.1
- ✓ EFF-03: Virtual scrolling (only mount SVG pages near current camera position) — v1.1
- ✓ CLN-01: Remove OSMD dependency entirely (package.json, dead imports, old code) — v1.1
- ✓ SLR-01: SingleLineRenderer component displaying score as one horizontal line — v1.2
- ✓ SLR-02: Horizontal camera system keeping active note centered in score region — v1.2
- ✓ SLR-03: Section-based rendering via Verovio for performance optimization — v1.2

### Active

- PIX-01: PixiJS WebGL renderer for SingleLineRenderer
- PIX-02: SVG-to-texture pipeline (Verovio SVG → PixiJS Sprite)
- PIX-03: GPU-accelerated camera via container transforms
- PIX-04: Tint-based note highlighting (GPU shader, no redraw)
- PIX-05: Render group architecture for true GPU camera movement
- PIX-06: Section virtualization via sprite visibility toggling
- PIX-07: Transport controls integration with WebGL renderer

### Out of Scope

- hideUnplayedNotes feature — not currently implemented
- smoothReveal feature — not currently implemented
- BPM-based playback — permanently removed in v1.0
- Server-side rendering — remains a client-side SPA
- Mobile support — not in scope
- Konva.js Canvas 2D — investigated in v1.3, abandoned due to CPU-bound redraws on position changes
- Web Worker rendering — defer until profiling shows need
- RegularRenderer WebGL migration — SVG works well for vertical, only SingleLineRenderer migrates

## Current Milestone: v1.3 PixiJS SingleLineRenderer

**Goal:** Migrate SingleLineRenderer from SVG to PixiJS WebGL rendering to achieve smooth 60fps scrolling and GPU-accelerated note highlighting.

**Why PixiJS over Konva.js:**
- True WebGL/GPU rendering (not Canvas 2D which is CPU-bound)
- Render groups enable GPU-accelerated camera movement (no redraw on position change)
- Tint property applies via GPU shader (highlighting without redraw)
- 60fps benchmark performance vs 23fps for Canvas 2D alternatives
- Native SVG-to-texture support

**Target features:**
- PixiJS Stage with render group for GPU camera
- Verovio SVG → PixiJS texture conversion pipeline
- Container position for smooth scrolling (GPU-accelerated)
- Sprite tint for note highlighting (shader-based, no redraw)
- Section virtualization via sprite visibility
- Transport controls integration

## Context

**Current architecture (post-v1.2):** React SPA with Verovio (WASM) rendering MusicXML to section SVGs. SingleLineRenderer displays horizontal single-line layout with section-based rendering. Events are extracted once via Verovio's timemap API and cached with section assignments.

**Why WebGL migration:**
The SVG-based SingleLineRenderer works but has limitations:
1. CSS transform scrolling is GPU-accelerated, but React re-renders can cause jitter
2. Note highlighting requires DOM manipulation (style changes)
3. Section virtualization requires React state management in RAF loops

PixiJS solves these by:
1. Container.position for scrolling (pure GPU, no React involvement)
2. Sprite.tint for highlighting (GPU shader, no DOM)
3. Sprite.visible for virtualization (no mounting/unmounting)

**Konva.js attempt (v1.3-abandoned):**
Attempted Canvas 2D migration via Konva.js. Failed because:
- Canvas 2D is CPU-rendered, not GPU
- Every position change triggers full canvas redraw
- Layer caching doesn't prevent stage position redraws
- 60 redraws/second for scrolling was too expensive

**PixiJS advantages:**
- WebGL is true GPU rendering
- Render groups (v8) enable GPU-accelerated transforms
- Tint is a shader uniform, not a redraw
- Benchmarked at 60fps vs Konva's effective ~23fps

## Constraints

- **Tech stack**: Verovio WASM (kept) + PixiJS v8 (new)
- **RegularRenderer preserved**: Existing vertical SVG renderer unchanged
- **Event extraction**: Must still map to Verovio timemap IDs
- **Score region**: Animation viewport controlled by existing score region editor
- **Skip Puppeteer**: WebGL Puppeteer support deferred to future milestone
- **Text handling**: SVG text must be converted to paths or pre-rendered as textures

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Use verovio npm package (WASM) | Standard approach, runs in browser | ✓ Good |
| Target Verovio semantic CSS classes for animations | `.note`, `.notehead` classes map cleanly | ✓ Good |
| BPM mode permanently removed | Sync-only simplifies playback path | ✓ Good |
| Camera uses g.system DOM elements for Y | Eliminates threshold heuristics, no jitter | ✓ Good |
| 5-phase sequential migration | Strict dependency chain worked well | ✓ Good |
| Paginated rendering over Web Workers | Addresses root cause (DOM size) not symptom (render speed) | ✓ Good |
| Virtual scrolling with CSS transform camera | Custom visibility manager, not scroll-based libraries | ✓ Good |
| Konva.js abandoned | Canvas 2D is CPU-bound, 60fps position updates too expensive | ⚠️ Lesson learned |
| PixiJS over Konva | True WebGL, GPU transforms, shader-based tint, 60fps benchmarks | — Pending |

---
*Last updated: 2026-02-08 after v1.3 PixiJS milestone start*
