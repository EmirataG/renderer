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

### Active

- KNV-01: SingleLineRenderer using Konva.js canvas instead of SVG
- KNV-02: Verovio SVG → Konva conversion layer
- KNV-03: Horizontal camera with smooth tracking via Konva stage positioning
- KNV-04: Note highlighting via Konva tweens (color/scale animation)
- KNV-05: Click-to-edit note selection via Konva hit testing
- KNV-06: Section-based caching (Konva layer.cache()) for performance
- KNV-07: Section virtualization via Konva layer visibility

### Out of Scope

- hideUnplayedNotes feature — not currently implemented
- smoothReveal feature — not currently implemented
- BPM-based playback — permanently removed in v1.0
- Server-side rendering — remains a client-side SPA
- Mobile support — not in scope
- Web Worker rendering — defer until profiling shows need
- RegularRenderer canvas migration — SVG works well for vertical, only SingleLineRenderer migrates
- Puppeteer support for canvas — defer to future milestone

## Current Milestone: v1.3 Canvas SingleLineRenderer

**Goal:** Migrate SingleLineRenderer from SVG to Konva.js canvas rendering to eliminate React state/effect timing issues that caused animation glitches in SVG virtualization.

**Target features:**
- Verovio SVG → Konva shape conversion pipeline
- Konva Stage with horizontal camera tracking
- Section-based layer caching for performance
- Layer visibility for virtualization (no React state needed)
- Built-in Konva.Tween for smooth note animations
- Konva hit testing for click-to-edit functionality
- RegularRenderer unchanged (stays SVG)

**Why Canvas/Konva.js:**
- Eliminates React re-render timing issues with requestAnimationFrame
- Built-in tweening (no manual animation loop management)
- Layer caching provides virtualization without React state
- Hit testing built-in (no manual bounding box tracking)
- Stage positioning for camera (no CSS transform conflicts)

## Context

**Current architecture (post-v1.1):** React SPA with Verovio (WASM) rendering MusicXML to paginated SVGs. Events are extracted once via Verovio's timemap API and cached with page assignments.

**RegularRenderer:** Vertical paginated layout with smooth camera scrolling. Uses page-based virtual scrolling for memory efficiency. Stays as SVG — working well.

**SingleLineRenderer (v1.2 attempt):** Horizontal single-line layout using SVG. Hit React state/effect timing issues with section virtualization — camera would snap back to beginning, animations would stop at section boundaries. Root cause: React's setState in requestAnimationFrame loops causes re-renders that break animation continuity.

**Canvas migration rationale:**
- Konva.js provides object model with per-shape events (like SVG DOM)
- Layer caching replaces virtualization (cached layers are bitmap textures)
- Stage.position() for camera (no React state needed)
- Konva.Tween handles animation interpolation (no manual RAF management)
- SVG-to-Konva conversion is the main technical challenge

**Verovio integration:**
- Verovio still generates SVG from MusicXML
- New conversion layer parses SVG and creates Konva shapes
- Element IDs preserved for event extraction mapping
- One-time conversion per section, then cached as Konva layer

## Constraints

- **Tech stack**: Verovio WASM (kept) + Konva.js (new)
- **RegularRenderer preserved**: Existing vertical SVG renderer unchanged
- **Event extraction**: Must still map to Verovio timemap IDs
- **Score region**: Animation viewport controlled by existing score region editor
- **Skip Puppeteer**: Canvas Puppeteer support deferred to future milestone

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
| Konva.js over PixiJS | Better SVG compat, built-in tweening, simpler API, no WebGL edge cases | — Pending |
| SVG virtualization abandoned | React state timing issues in RAF loops unfixable without architectural change | ⚠️ Revisit |
| SingleLineRenderer-only canvas migration | RegularRenderer SVG works well, minimize scope | — Pending |

---
*Last updated: 2026-02-07 after v1.3 Canvas migration milestone start*
