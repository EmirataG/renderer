# Manuscript Renderer

## What This Is

A browser-based MusicXML score renderer with animated playback, used to generate scrolling score videos. Powered by Verovio (WASM) for high-quality music engraving. The app renders scores with vertical camera scrolling, notehead animations, audio sync, and Puppeteer-based frame capture for video export. RegularRenderer uses page virtualization for memory-efficient rendering of long scores.

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
- ✓ VIRT-01: Page virtualization - only visible pages + buffer mounted in DOM — v1.3
- ✓ VIRT-02: Placeholder divs maintain layout for unmounted pages — v1.3
- ✓ VIRT-03: Pages unmount when scrolled out of view + buffer distance — v1.3
- ✓ GAP-01: Seamless page transitions with no visible gaps — v1.3
- ✓ GAP-02: Staff lines appear continuous across page boundaries — v1.3
- ✓ VIRT-04: Fast initial load - only first 1-2 pages rendered on mount — v1.3
- ✓ VIRT-05: No visible flash or jank during page mount/unmount — v1.3

### Active

(No active milestone — use `/gsd:new-milestone` to start next)

### Out of Scope

- hideUnplayedNotes feature — not currently implemented
- smoothReveal feature — not currently implemented
- BPM-based playback — permanently removed in v1.0
- Server-side rendering — remains a client-side SPA
- Mobile support — not in scope
- Canvas rendering — investigated, poor cost-benefit vs paginated SVG
- Web Worker rendering — defer until profiling shows need
- SVGO optimization — research showed limited benefit for music notation SVGs

## Context

**Current architecture (post-v1.3):** React SPA with Verovio (WASM) rendering MusicXML to paginated SVGs. Events are extracted once via Verovio's timemap API and cached with page assignments. Page virtualization mounts only visible pages + 1-page buffer using camera-driven visibility. Camera uses CSS `transform: translateY()` with system-boundary snapping. Pages stack seamlessly via `adjustPageHeight: true` and viewBox trimming on pages 2+.

**RegularRenderer:** Vertical paginated layout with smooth camera scrolling. Uses camera-driven page virtualization — only 3 pages in DOM at any time (current + 1 above + 1 below). Two-phase mount lifecycle: all pages mount for event extraction, then virtualize. Short scores (<=3 pages) skip virtualization.

**SingleLineRenderer (paused v1.2):** Horizontal single-line layout. Camera moves horizontally to keep active note centered. Section-based rendering with virtualization. Not actively developed.

**Verovio rendering modes:**
- RegularRenderer: `pageHeight: 2970` (A4), `adjustPageHeight: true` for content-fit heights
- SingleLineRenderer: `breaks: 'none'`, `pageWidth: 100000` for single horizontal system

**Verovio SVG structure:**
- Systems: `<g class="system">` — one per staff system line
- Notes: `<g id="..." class="note">` with `<g class="notehead">` containing `<use>` elements
- Measures: `<g class="measure">`
- IDs are unique per element, used for animation targeting and event extraction

## Constraints

- **Tech stack**: Verovio WASM — already integrated
- **RegularRenderer preserved**: Existing vertical renderer must remain functional
- **SVG compatibility**: Must maintain DOM queryability for animation and event extraction
- **Score region**: Animation viewport controlled by existing score region editor

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Use verovio npm package (WASM) | Standard approach, runs in browser | ✓ Good |
| Target Verovio semantic CSS classes for animations | `.note`, `.notehead` classes map cleanly | ✓ Good |
| BPM mode permanently removed | Sync-only simplifies playback path | ✓ Good |
| Camera uses g.system DOM elements for Y | Eliminates threshold heuristics, no jitter | ✓ Good |
| 5-phase sequential migration | Strict dependency chain worked well | ✓ Good |
| No Canvas migration | SVG DOM APIs too deeply integrated, paginated SVG is better path | ✓ Good |
| Paginated rendering over Web Workers | Addresses root cause (DOM size) not symptom (render speed) | ✓ Good |
| Virtual scrolling with CSS transform camera | Custom visibility manager, not scroll-based libraries | ✓ Good |
| isRenderMode removed from RegularRenderer | Puppeteer moving to backend; simplifies renderer | ✓ Good |
| Two-phase mount lifecycle for virtualization | All pages mount for event extraction, then virtualize after | ✓ Good |
| adjustPageHeight re-enabled (reverses v1.1 decision) | Now compatible with page virtualization approach | ✓ Good |
| ViewBox trimming on pages 2+ only | First page keeps natural top margin; seamless stacking | ✓ Good |
| Short scores skip virtualization | <=3 pages mount all without overhead | ✓ Good |
| Symmetric 1-page buffer | Equal above/below for smooth scrolling | ✓ Good |

---
*Last updated: 2026-02-09 after v1.3 milestone*
