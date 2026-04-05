# Feasibility Assessment: Migrating to WASM/resvg Rendering Pipeline (v2)

## Context

The current export pipeline uses Puppeteer (headless Chrome) to screenshot SVG frames — taking **25-35 minutes for a 10-minute video at 30fps**. The browser preview uses SVG DOM manipulation for note animations. The goals for v2 are: dramatically faster exports, deterministic rendering, eliminating Chrome/Puppeteer, higher animation control (flying notes, custom keyframes, hiding logic), and a unified render pipeline.

---

## Honest Assessment

### What IS feasible and useful

| Area | Verdict | Why |
|------|---------|-----|
| **Server export via resvg-js (native)** | Highly feasible | Eliminates Puppeteer entirely. Native Rust rasterization at ~10-30ms/frame → **5-10x speedup** (2-4 min instead of 25-35 min). Docker image shrinks from ~1.5GB to ~200MB. |
| **Verovio SVG → resvg compatibility** | Works well | Verovio outputs paths + `<use>` references to `<defs>`. resvg handles these natively. Music glyphs are paths, not text — no font issues for notation. |
| **Shared animation engine** | Highly feasible | `animation.ts` is already pure math. Extract `computeFrame()` → renderer-agnostic. Same animation logic drives both DOM (browser) and pixel (server) renderers. |
| **Advanced animations (flying notes, keyframes)** | Feasible with scene graph | Requires a `NoteTimeline` keyframe abstraction. The extracted animation engine can support arbitrary per-note transforms, opacity, color curves. |

### The real question: can resvg-wasm work in the browser?

**Full-SVG re-rasterization per frame: NO (too slow)**

resvg always renders the entire SVG document as a complete unit — no incremental/partial rendering. Performance benchmarks:
- paris-30k.svg (complex, 30k elements): ~290ms on M1 Pro native, significantly slower in WASM
- A typical Verovio score page (1,000-5,000 elements): estimated ~50-200ms in WASM
- At 200ms/frame = 5fps, at 50ms/frame = 20fps. Neither hits 60fps.

For reference, SVG DOM benchmarks show:
- 1,000 SVG DOM elements: 15ms render, 60fps
- 5,000 SVG DOM elements: 85ms render, 35fps
- Canvas 2D: 10,000 elements at 60fps, 50,000 at 55fps

**Sprite-based resvg-wasm: YES (feasible at 60fps)**

The key insight: you don't re-rasterize the full SVG per frame. Instead:
1. **One-time pre-rasterization** via resvg-wasm:
   - Full score pages → large ImageBitmap textures (~200-500ms per page, done once)
   - Individual note glyphs → small sprite textures (~0.5-2ms per note, tiny SVGs)
   - Total one-time cost: ~1-3 seconds for a full score
2. **Per-frame compositing** on Canvas 2D (NOT resvg):
   - `drawImage()` the static score bitmap cropped at cameraY: ~1ms
   - `drawImage()` each animated note sprite with transforms: ~0.1ms per sprite
   - Total per-frame: ~2-5ms → easily 60fps

This gives you:
- **Deterministic rendering** — resvg produces identical pixels on every platform
- **Server/browser parity** — same rasterizer (resvg) in both contexts
- **Full animation control** — sprites are just bitmaps you can transform freely
- **60fps** — per-frame work is just Canvas 2D compositing, which is GPU-accelerated

### Browser preview: three viable paths

| Approach | Animation Control | Server Parity | Effort | 60fps |
|----------|-------------------|---------------|--------|-------|
| **A: SVG DOM (current)** | Limited (CSS transforms only) | No (browser vs resvg differences) | None | Yes |
| **B: Canvas 2D + resvg-wasm sprites** | Full (arbitrary transforms) | Yes (same rasterizer) | Medium | Yes |
| **C: Canvas 2D + browser `drawImage(svg)`** | Full (arbitrary transforms) | No (browser SVG renderer) | Medium | Yes |

**Approach B is the recommended target** — it's the only option that gives both full animation control AND deterministic server/browser parity. But Approach A (current SVG DOM) works fine as a stepping stone.

### SyncEditor interaction on canvas

If the preview moves to canvas, SyncEditor needs click detection. Options:
- **Bounding box lookup** — build `Map<svgId, {x,y,w,h}>` from SVG geometry, point-in-rect test on click. Simple, fast, handles 99% of cases.
- **Invisible SVG overlay** — render SVG DOM at opacity:0 on top of canvas. Click events hit SVG, visual comes from canvas. Zero-effort interactivity.
- **Keep SyncEditor as SVG DOM** — it's a different component, can use a different renderer. Simplest migration path.

---

## Recommended Architecture

```
MusicXML → Verovio (WASM) → SVG string (layout + IDs preserved)
                                  ↓
                           CSS Inlining
                        (inline all styles)
                                  ↓
                        ┌─────────┴──────────┐
                        ↓                    ↓
                  resvg-js native      resvg-wasm (browser)
                  (server export)      (browser preview)
                        ↓                    ↓
               ┌────────┴────────┐   ┌──────┴──────┐
               ↓                ↓   ↓              ↓
         Static score     Note sprites    Static score   Note sprites
         (RGBA buffer)    (RGBA buffers)  (ImageBitmap)  (ImageBitmap)
               ↓                ↓              ↓              ↓
         PixelCompositor ←── computeFrame() ──→ CanvasCompositor
         (Rust/sharp,          (pure math,      (Canvas 2D,
          pipe to FFmpeg)       shared engine)   GPU-accelerated)
```

Both server and browser use the same pipeline:
1. **Same SVG preprocessing** (CSS inlining)
2. **Same rasterizer** (resvg — native on server, WASM in browser)
3. **Same animation engine** (`computeFrame()`)
4. **Same compositing model** (static layer + animated sprites)

The only difference is the compositing backend: `sharp`/Rust on server, Canvas 2D in browser.

### Core abstraction: `computeFrame()`

```typescript
interface AnimationFrame {
  cameraY: number;
  activeNotes: Array<{
    svgId: string;
    scale: number;
    color: string;
    translateX?: number;  // for fly-in effects
    translateY?: number;
    opacity?: number;
    rotation?: number;
  }>;
  resetNotes: string[];  // return to base state
}

// Pure math — no DOM, no canvas, no resvg
function computeFrame(seconds, events, state, config, keyframes?): AnimationFrame
```

This is the single source of truth. Both `PixelCompositor` (server) and `CanvasCompositor` (browser) consume it.

---

## Phased Migration

### Phase 0: Extract animation core (1-2 days)
- Refactor `export-service/src/standalone/animation.ts`
- Extract `computeFrame()` → returns `AnimationFrame` object
- `setTimestamp` becomes thin wrapper: `computeFrame()` → apply to DOM
- **No behavior change.** Existing pipeline still works.
- **Files:** `export-service/src/standalone/animation.ts` (refactor), new `export-service/src/animation/computeFrame.ts`

### Phase 1: CSS inlining preprocessor (2-3 days)
- New `export-service/src/svg/inlineCss.ts`
- Converts Verovio's `<style>` + app's `scoreColor` CSS → inline SVG attributes
- Resolves `currentColor`, applies `fill`/`stroke` rules, removes `<style>` block
- Use `linkedom` (lightweight Node DOM, ~10x faster than jsdom)
- **Validates:** resvg can rasterize Verovio SVG correctly
- **Files:** new `export-service/src/svg/inlineCss.ts`

### Phase 2: Static score rasterization via resvg-js (2-3 days)
- Add `@resvg/resvg-js` dependency
- Pre-rasterize each SVG page to RGBA bitmap (once per job)
- Implement viewport cropping (camera position → sub-rectangle extraction)
- Visual comparison tests vs. Puppeteer screenshots (SSIM/PSNR)
- **Independently useful:** thumbnail generation, preview images without Chrome
- **Files:** new `export-service/src/raster/rasterizePages.ts`

### Phase 3: Note sprite extraction (3-4 days)
- Parse Verovio SVG to build `Map<svgId, {pageIndex, x, y, w, h}>`
- Extract each note's SVG subtree, wrap in minimal SVG, rasterize as small sprite
- Pre-generate colored variants (active color + base color)
- **Files:** new `export-service/src/raster/extractSprites.ts`

### Phase 4: Pixel frame compositor (3-5 days)
- Assemble frames from pre-rasterized layers:
  1. Background image
  2. Static score cropped at cameraY
  3. Animated note sprites (composited over static layer)
  4. Border overlays
- Use `sharp` (libvips bindings) for fast pixel operations
- Output raw RGBA to FFmpeg (`-f rawvideo -pix_fmt rgba`)
- **Files:** new `export-service/src/raster/compositor.ts`, modify `export-service/src/encoding/encodeVideo.ts`

### Phase 5: Replace Puppeteer pipeline (2-3 days)
- Wire native renderer into `jobManager.ts`
- Remove `browserPool.ts`, `captureFrames.ts`, `pageSetup.ts`
- Update Dockerfile: `node:22-bookworm-slim` + FFmpeg (no Puppeteer/Chrome)
- **Result:** 5-10x faster exports, ~200MB Docker image
- **Files:** modify `export-service/src/jobs/jobManager.ts`, `Dockerfile`, remove browser/ directory

### Phase 6: Browser canvas preview via resvg-wasm (5-7 days)
- Add `@resvg/resvg-wasm` dependency to frontend
- Share CSS inlining logic (from Phase 1) with browser
- On score load: pre-rasterize pages + note sprites via resvg-wasm → ImageBitmap textures
- New `CanvasPreviewRenderer` component:
  - Per frame: `computeFrame()` → Canvas 2D compositing of pre-rasterized layers
  - `drawImage()` static score cropped at cameraY + animated note sprites
  - Expected: ~2-5ms/frame → 60fps
- SyncEditor: keep SVG DOM initially; add bounding-box hit-testing as future option
- **Result:** deterministic preview matching server export pixel-for-pixel

### Phase 7: Advanced animations + keyframe system (ongoing)
- Extend `AnimationFrame` with translateX/Y, opacity, rotation
- Build `NoteTimeline` keyframe interpolation
- Apply in both `PixelCompositor` (server) and `CanvasCompositor` (browser)
- Add UI for defining custom animation timelines
- Hide/reveal logic: control note sprite opacity per keyframe

---

## What to Keep vs. Replace

| Keep | Replace |
|------|---------|
| Verovio WASM (excellent engraving) | Puppeteer/Chrome → resvg-js native (server) |
| Animation math from animation.ts | SVG DOM preview → Canvas 2D + resvg-wasm sprites (browser) |
| SyncEditor as SVG DOM (for now) | Docker Puppeteer image → node:22-slim |
| FFmpeg for encoding + audio mux | JPEG frame pipe → raw RGBA pipe |
| Job manager architecture | DOM-based animation on server → sprite compositing |

---

## Key Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Visual parity (resvg vs Chrome) | HIGH | Phase 1 includes visual diff tests. Verovio SVG is mostly paths — renders consistently. Accept sub-pixel differences invisible in video. |
| Sprite bounding box accuracy | MEDIUM | Parse SVG DOM for positions (not regex). Verify by overlaying sprites on static image. Use generous padding. |
| Memory for large scores | MEDIUM | Keep pages separate in memory. Only load pages near cameraY (~3 pages = ~23MB for 1920px wide). |
| resvg-js platform compatibility | LOW | Pre-built binaries for Linux x64/arm64, macOS x64/arm64. Fallback: resvg-wasm (slower but portable). |

---

## Performance Projection

| Metric | Current (Puppeteer) | After Migration (resvg-js) |
|--------|--------------------|-----------------------------|
| 10-min video @ 30fps | 25-35 min | **2-4 min** |
| Docker image size | ~1.5 GB | **~200 MB** |
| Concurrent exports | 3 (browser pool limit) | **CPU-bound, ~5-10** |
| Frame determinism | Non-deterministic (browser) | **Deterministic** |
| Animation capabilities | Scale + color only | **Full transform + opacity + fly-in** |

---

## Bottom Line

**Yes, this is feasible and useful — including WASM in the browser.**

The key insight is **don't re-rasterize the full SVG per frame**. Instead, use resvg (native or WASM) for **one-time pre-rasterization** into a static score bitmap + individual note sprite textures. Per-frame work is just Canvas 2D compositing of cached bitmaps — fast enough for 60fps.

This gives a truly unified pipeline:
- **Same rasterizer** (resvg) on server and browser → pixel-perfect parity
- **Same animation engine** (`computeFrame()`) → identical behavior
- **Same compositing model** (static layer + animated sprites) → same visual output
- **5-10x faster exports** (eliminate Puppeteer), **~200MB Docker image** (eliminate Chrome)
- **Full animation control** — flying notes, custom keyframes, hide/reveal, arbitrary transforms

The migration is phased so each step is independently valuable. Phases 0-5 deliver the server-side speedup. Phase 6 brings the browser preview onto the unified canvas pipeline.

## Sources

- [resvg - SVG rendering library (Rust)](https://github.com/linebender/resvg)
- [resvg-js - Node.js/WASM bindings](https://github.com/thx/resvg-js)
- [@resvg/resvg-wasm - npm](https://www.npmjs.com/package/@resvg/resvg-wasm)
- [Felt: From SVG to Canvas (migration case study)](https://felt.com/blog/from-svg-to-canvas-part-1-making-felt-faster)
- [SVG vs Canvas vs WebGL benchmarks](https://www.svggenie.com/blog/svg-vs-canvas-vs-webgl-performance-2025)
- [Vello - GPU compute-centric 2D renderer (future option)](https://github.com/linebender/vello)
- [OffscreenCanvas for worker-based rendering](https://web.dev/articles/offscreen-canvas)
- [Canvas optimization best practices (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas)
