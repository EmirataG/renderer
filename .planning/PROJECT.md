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

### Active

- EFF-01: Paginated SVG rendering (render pages on demand instead of one giant SVG)
- EFF-02: Cache event positions after extraction (avoid repeated DOM queries)
- EFF-03: Virtual scrolling (only mount SVG pages near current camera position)
- CLN-01: Remove OSMD dependency entirely (package.json, dead imports, old code)

### Out of Scope

- hideUnplayedNotes feature — not currently implemented
- smoothReveal feature — not currently implemented
- BPM-based playback — permanently removed in v1.0
- Server-side rendering — remains a client-side SPA
- Mobile support — not in scope
- Canvas rendering — investigated, poor cost-benefit vs paginated SVG
- Web Worker rendering — defer until profiling shows need

## Current Milestone: v1.1 Efficiency

**Goal:** Reduce memory usage and improve rendering performance for long scores through paginated rendering, event position caching, and virtual scrolling. Also remove the legacy OSMD dependency.

**Target features:**
- Paginated SVG rendering (Verovio page-by-page output)
- Event position caching (extract once, reuse)
- Virtual scrolling (mount only visible pages)
- OSMD dependency removal (cleanup)

## Context

**Current architecture:** React SPA with Verovio (WASM) rendering MusicXML to a single 60,000px-tall SVG. Events are extracted via Verovio's timemap API with Y positions from `getBoundingClientRect()` on `g.system` elements. Camera scrolling uses CSS `transform: translateY()` with system-boundary snapping.

**Performance problem:** Long scores (50+ systems) generate a single massive SVG with thousands of elements. Event extraction calls `getBoundingClientRect()` per note, and the entire SVG stays in the DOM. This causes 6GB+ memory usage on longer scores.

**Verovio pagination support:** Verovio natively supports page-by-page rendering via `renderToSVG(pageNumber)`. The current setup uses `pageHeight: 60000` with `adjustPageHeight: true` to force a single page. Switching to multiple pages is a configuration change, but the camera, event extraction, and animation systems all assume a single continuous SVG and need adaptation.

**Verovio SVG structure:**
- Systems: `<g class="system">` — one per staff system line
- Notes: `<g id="..." class="note">` with `<g class="notehead">` containing `<use>` elements
- Measures: `<g class="measure">`
- IDs are unique per element, used for animation targeting and event extraction

## Constraints

- **Tech stack**: Verovio WASM — already integrated
- **No feature regression**: All v1.0 features must continue working
- **No UI changes**: Sidebar controls and user interactions remain unchanged
- **SVG compatibility**: Must maintain DOM queryability for animation and event extraction
- **Browser WASM**: Verovio WASM loads reliably in modern browsers (validated in v1.0)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Use verovio npm package (WASM) | Standard approach, runs in browser | ✓ Good |
| Target Verovio semantic CSS classes for animations | `.note`, `.notehead` classes map cleanly | ✓ Good |
| BPM mode permanently removed | Sync-only simplifies playback path | ✓ Good |
| Camera uses g.system DOM elements for Y | Eliminates threshold heuristics, no jitter | ✓ Good |
| 5-phase sequential migration | Strict dependency chain worked well | ✓ Good |
| No Canvas migration | SVG DOM APIs too deeply integrated, paginated SVG is better path | ✓ Good |
| Paginated rendering over Web Workers | Addresses root cause (DOM size) not symptom (render speed) | — Pending |

---
*Last updated: 2026-02-04 after v1.1 milestone start*
