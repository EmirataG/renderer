# Project Research Summary

**Project:** Manuscript Renderer v1.3 - PixiJS WebGL Migration
**Domain:** GPU-accelerated horizontal scrolling music notation renderer
**Researched:** 2026-02-08
**Confidence:** HIGH

## Executive Summary

This project migrates SingleLineRenderer from SVG/DOM to PixiJS WebGL rendering to achieve 60fps smooth scrolling. The existing system uses SVG with CSS transforms for horizontal camera movement, which works but has performance limitations. A previous Konva.js (Canvas 2D) migration was abandoned because Canvas 2D is CPU-bound - every position change triggers full canvas redraws, making 60fps scrolling too expensive.

PixiJS v8 solves this through GPU-accelerated render groups. When a container is marked as a render group, position transforms are applied at the GPU level without recalculating rendering instructions. This is the critical architectural difference: Konva redraws from scratch every frame, while PixiJS applies transforms as GPU shader operations on pre-compiled instructions. Combined with shader-based sprite tinting for note highlighting, PixiJS provides true WebGL rendering where the expensive operations (position transforms, color changes) happen on the GPU in parallel.

The recommended approach uses PixiJS v8.16.0 with @pixi/react v8.0.5 for React 19 integration. Verovio continues to render MusicXML to SVG strings (unchanged), which are then converted to GPU textures using a data URI pipeline. The architecture maintains the existing section-based rendering approach but replaces DOM manipulation with declarative PixiJS components. Key risks include WebGL context loss, texture size limits (4096x4096), and SVG text/font rendering issues - all of which have documented mitigation strategies.

## Key Findings

### Recommended Stack

PixiJS v8 with @pixi/react v8 is the recommended stack. The @pixi/react v8 library was specifically rebuilt for React 19 and provides a declarative JSX interface that integrates naturally with React's lifecycle. PixiJS v8's "render groups" feature offloads position, scale, and rotation transforms to the GPU - precisely what's needed for smooth camera scrolling without CPU overhead.

**Core technologies:**
- **pixi.js ^8.16.0**: WebGL/WebGPU 2D rendering engine - provides GPU-accelerated transforms via render groups, eliminating CPU-bound redraws that killed Konva performance
- **@pixi/react ^8.0.5**: React 19 bindings for PixiJS - declarative component system with tree-shakeable architecture, officially built for React 19 compatibility
- **Verovio (unchanged)**: Continues rendering MusicXML to SVG strings - only the rendering pipeline changes, not the notation generation

**Critical version requirements:**
- PixiJS v8+ required for render groups (v7 lacks this feature)
- @pixi/react v8.0.5 includes React 19 fix (issue #551 resolved in beta.17)
- No additional @types packages needed (TypeScript definitions included)

**What NOT to add:**
- pixi-viewport: Overkill for single-axis scrolling, adds 15KB for unused features
- @pixi/filter-* packages: Sprite.tint handles highlighting, no need for filters
- @pixi-essentials/svg: PixiJS v8 has built-in SVG support

### Expected Features

Single-line horizontal score displays are well-established in music notation software. The key design decision is camera behavior - whether the playhead stays fixed while music scrolls beneath it, or whether the playhead moves within the viewport. Industry leaders (Soundslice, Yousician, MuseScore) have converged on fixed-playhead as the preferred mode for play-along scenarios.

**Must have (table stakes):**
- Horizontal continuous layout - defines the renderer type, users expect left-to-right flow
- Fixed playhead position - industry standard, active note stays at center or left
- Smooth scrolling - jumpy scrolling is jarring and makes following music difficult
- Score scrolls beneath fixed playhead - opposite of traditional page-based scrolling
- Notehead animation - already exists in RegularRenderer, users expect consistent behavior
- Score region bounds - control viewport over background (already implemented)
- Audio sync - playback tied to timestamps (already implemented via syncAnchors)

**Should have (competitive differentiators):**
- Seamless section rendering - section boundaries must be invisible during scrolling
- Lookahead preview - show upcoming measures with reduced opacity (low-hanging fruit)
- Fixed-left playhead option - alternative to fixed-center (Soundslice offers this)

**Defer (v2+):**
- Adaptive scroll speed - velocity matches musical density (complex, requires timestamp-aware calculations)
- Horizontal zoom/scale - adjust visible measure count (may conflict with Verovio rendering)
- Measure number overlay - show current measure outside score region

**PixiJS-specific capabilities:**
- SVG-to-texture conversion via data URI + Image decode
- GPU-accelerated camera via render groups (Container.isRenderGroup)
- Shader-based highlighting via Sprite.tint (multiplicative blending)
- Section virtualization via Sprite.visible flag (skips transform calculations)

**Anti-features to avoid:**
- Page-at-a-time scrolling - causes jarring jumps, users consistently complain
- Playhead moving across screen - forces user to track moving element
- Per-sprite render groups - destroys batching, worse performance than no render groups
- Graphics clear/redraw pattern - leaks ~10MB/second in PixiJS v8
- CSS transitions on sprites - PixiJS doesn't use DOM

### Architecture Approach

The architecture maintains the existing section-based approach but replaces DOM manipulation with PixiJS WebGL rendering. Verovio continues generating SVG strings, which are converted to GPU textures via a data URI pipeline. The critical insight: animation state (camera position, tint values) uses refs instead of React state to avoid re-renders during 60fps animation loops. PixiJS Ticker provides the animation loop, and render groups enable GPU-accelerated transforms.

**Major components:**

1. **svgToPixi.ts conversion module** - converts Verovio SVG strings to PixiJS Textures using data URI + HTMLImageElement approach, includes texture caching system

2. **PixiSingleLineRenderer.tsx** - main component using @pixi/react Application, replaces SingleLineRenderer.tsx with declarative PixiJS components instead of DOM manipulation

3. **Camera container with render group** - Container with isRenderGroup: true enables GPU transforms, moving position.x scrolls entire score without redraw

4. **Animation refs pattern** - refs hold cameraContainer, sprites, and frame state to avoid React re-renders during useTick animation loop

5. **Sprite tinting for highlights** - GPU shader operation (sprite.tint) replaces DOM-based CSS animations for notehead highlighting

**Data flow:**
MusicXML → Verovio (SVG) → svgToTexture (GPU texture) → Sprite display → useTick loop (camera position + tint updates) → WebGL render

**Integration with existing code:**
- useSingleLineVerovio hook unchanged (continues producing SVG strings)
- eventStore unchanged (CachedEvent structure preserved)
- interpolation logic unchanged (pure function, layout-agnostic)
- Only SingleLineRenderer.tsx and noteAnimation.ts change

### Critical Pitfalls

These are the mistakes that cause rewrites or major performance failures:

1. **WebGL Context Loss Without Recovery** - WebGL contexts can be lost when browser reclaims GPU resources. Without handlers, renderer goes blank and cannot recover. Prevention: Register webglcontextlost/restored event listeners from start, keep application state separate from PixiJS objects, store texture source references for recreation. Must design from Phase 1, cannot retrofit.

2. **Dual Animation Loop Conflict** - Running both PixiJS Ticker AND custom requestAnimationFrame causes dropped frames and audio-visual desync. Prevention: Use PixiJS Ticker exclusively OR disable Ticker and use custom RAF with manual app.render() calls. Never mix both.

3. **Graphics Clear/Redraw Memory Leak** - Using graphics.clear() and redrawing every frame leaks ~10MB/second due to WebGLBuffer objects not being deallocated in v8. Prevention: Never clear and redraw Graphics each frame, use Sprite.tint for highlighting instead of redrawing geometry.

4. **SVG Text/Font Rendering Failure** - Text elements with custom fonts render incorrectly when converted to textures because fonts are lazy-loaded and PixiJS cannot detect readiness. Prevention: Use Verovio's text-as-paths option, OR pre-load fonts with document.fonts.load() before texture conversion.

5. **Texture Size Limit (4096x4096) Exceeded** - GPU texture size is limited (typically 4096x4096, mobile may be less). Long sections that exceed this fail silently or get clipped. Prevention: Query gl.MAX_TEXTURE_SIZE on init, keep sections under 2048px width (safe for all devices), calculate maxMeasuresPerSection based on limit.

6. **Render Group Overuse** - Creating too many render groups (one per section, one per note) destroys batching and slows rendering. Prevention: Use ONE render group for entire score container, NOT one per section or note. Profile before adding more render groups.

7. **React useEffect Cleanup Memory Leak** - Destroying PixiJS application without proper options leaves GPU resources allocated. Prevention: Call app.destroy(true, { children: true, texture: true, textureSource: true }) in cleanup, stop ticker first, remove canvas from DOM.

**Konva lessons applied:**
- Konva failure: Canvas 2D position changes trigger full redraw → PixiJS solution: Render groups handle transforms on GPU without redraw
- Konva failure: Layer caching didn't prevent position redraws → PixiJS solution: cacheAsTexture + render groups = near-zero CPU during scroll
- Konva failure: 60fps updates were too expensive → PixiJS solution: Position is GPU uniform, benchmarks show 60fps sustained

## Implications for Roadmap

Based on research, the migration follows a foundation-first approach where conversion infrastructure is validated before adding complexity. The build order ensures each phase has working dependencies and produces testable output.

### Phase 1: SVG-to-Texture Pipeline
**Rationale:** Cannot display sprites without textures. This is the foundation that validates the entire approach - if Verovio SVG doesn't convert cleanly to GPU textures, the migration fails here before investing in animation complexity.

**Delivers:**
- svgToPixi.ts conversion module with svgToTexture() and sectionsToTextures() functions
- Texture caching system (Map-based with cache keys)
- Validation that Verovio-generated SVG converts to GPU textures correctly

**Addresses:** SVG text/font rendering pitfall (must handle before textures are created)

**Avoids:** Texture size limit pitfall (implement MAX_TEXTURE_SIZE check from start)

**Research flag:** May need phase-specific research on Verovio text-as-paths option if font rendering fails

---

### Phase 2: Basic PixiJS Renderer
**Rationale:** Prove the rendering approach works before adding animation. Static display validates @pixi/react integration, texture positioning, and coordinate space mapping. Catching integration issues early prevents rework in later phases.

**Delivers:**
- PixiSingleLineRenderer.tsx component with @pixi/react Application
- Declarative section sprites positioned horizontally using sectionOffsets
- Static score display (no animation loop yet)
- Proper useEffect cleanup with app.destroy() options

**Uses:** pixi.js and @pixi/react from stack, textures from Phase 1

**Implements:** Basic component structure from architecture (Application wrapper, sprite children)

**Avoids:** React cleanup memory leak (implement proper destroy() sequence from start), render group overuse (establish correct pattern before animation)

**Research flag:** Standard pattern, well-documented in PixiJS docs - skip research-phase

---

### Phase 3: Camera System
**Rationale:** Camera movement is the core value proposition - must work before adding highlighting complexity. This phase validates that render groups actually deliver 60fps scrolling without CPU overhead, proving the PixiJS approach superior to Konva.

**Delivers:**
- Camera container with isRenderGroup: true for GPU transforms
- useTick animation loop integrated with audio timestamps
- Smooth interpolation (lerp) for camera position updates
- Refs pattern for animation state (no React re-renders during animation)

**Addresses:** Fixed-center playhead (table stakes feature), smooth scrolling (table stakes)

**Avoids:** Dual animation loop conflict (use PixiJS Ticker exclusively, no custom RAF)

**Validates:** 60fps sustained scrolling - the core success metric for this migration

**Research flag:** Standard animation pattern - skip research-phase

---

### Phase 4: Note Highlighting
**Rationale:** With working camera, add the visual feedback that makes the renderer useful. Highlighting is simpler in PixiJS (sprite.tint) than in DOM (CSS animations), but requires event-to-sprite mapping logic.

**Delivers:**
- Section tinting for active section (MVP approach: tint entire section when it contains active note)
- Event-to-section mapping using CachedEvent.sectionIndex
- Animation timing (hold/exit durations matching existing RegularRenderer)
- GPU shader-based color changes (sprite.tint property)

**Addresses:** Notehead animation (table stakes feature parity with RegularRenderer)

**Avoids:** Graphics clear/redraw memory leak (use tint instead of redrawing geometry), blend mode batch breaking (stick to normal blend mode)

**Research flag:** Standard pattern - skip research-phase

---

### Phase 5: Section Virtualization
**Rationale:** Optimization phase that enables long scores. Only necessary after features work. Premature optimization would complicate earlier phases without delivering user-facing value.

**Delivers:**
- Visibility calculation from camera position and viewport bounds
- Sprite.visible toggling (not mount/unmount) based on distance from viewport
- Buffer strategy (load current + 1 ahead + 1 behind)
- Section loading/unloading triggers

**Addresses:** Seamless section rendering (differentiator feature)

**Avoids:** Texture GC timing issues (extend textureGCMaxIdle setting), culling configuration backfire (use simple visible flag instead of PixiJS culling system)

**Research flag:** Standard optimization pattern - skip research-phase

---

### Phase 6: Integration and Polish
**Rationale:** Final integration phase ensuring feature parity with SVG renderer. Handles edge cases and production requirements like Puppeteer frame capture.

**Delivers:**
- Transport controls integration (play/pause/seek from existing controls)
- Score region bounds compatibility (horizontal viewport awareness)
- Border rendering (may need hybrid approach or separate canvas)
- Puppeteer frame capture support (app.renderer.extract.canvas())

**Addresses:** Score region bounds (table stakes), full replacement of SVG renderer

**Avoids:** N/A (polish phase)

**Research flag:** Puppeteer integration may need research-phase (different extraction API from DOM-based approach)

---

### Phase Ordering Rationale

The phases follow strict dependencies:
1. **Pipeline before display** - Phase 1 creates textures, Phase 2 displays them
2. **Display before animation** - Phase 2 proves rendering works, Phase 3 adds movement
3. **Camera before highlights** - Phase 3 establishes position system, Phase 4 animates notes
4. **Features before optimization** - Phase 4 completes functionality, Phase 5 adds virtualization

**Why this order avoids pitfalls:**
- WebGL context loss handling designed in Phase 2 (cleanup), not retrofitted later
- Render group architecture established in Phase 2 before animation complexity
- Animation loop pattern (Ticker vs RAF) decided in Phase 3, avoiding dual-loop conflict
- Tint approach proven in Phase 4 before virtualization adds complexity
- Texture GC configuration tuned in Phase 5 when virtualization reveals the need

**Critical path validation:**
- Phase 1 validates: SVG converts to textures (if this fails, entire approach fails)
- Phase 2 validates: PixiJS displays textures (coordinate space mapping works)
- Phase 3 validates: Render groups deliver 60fps (core performance goal)
- Phase 4 validates: Tinting works for highlighting (feature parity)
- Phase 5 validates: Virtualization handles long scores (scalability)

### Research Flags

Phases with standard patterns (skip research-phase):
- **Phase 2:** Basic PixiJS rendering - well-documented in @pixi/react getting started guide
- **Phase 3:** Camera system - standard Ticker animation loop pattern in PixiJS docs
- **Phase 4:** Note highlighting - sprite.tint is documented feature with examples
- **Phase 5:** Section virtualization - standard optimization pattern (visibility toggling)

Phases likely needing deeper research during planning:
- **Phase 1:** SVG-to-texture pipeline - may need Verovio-specific research if text rendering fails (text-as-paths option, font embedding, pre-loading strategy)
- **Phase 6:** Puppeteer integration - different extraction API from DOM-based approach, may need research on app.renderer.extract usage with headless Chrome

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Verified via GitHub releases and official PixiJS documentation, React 19 compatibility confirmed via issue resolution and blog announcement |
| Features | HIGH | Multiple authoritative sources (Soundslice docs) agree on fixed-playhead approach, PixiJS capabilities verified via official guides and benchmarks |
| Architecture | HIGH | @pixi/react integration documented with examples, render groups explicitly described in v8 guides, refs pattern is standard React optimization |
| Pitfalls | HIGH | Each pitfall sourced from GitHub issues with maintainer responses, Konva failure analysis provides direct comparison, mitigation strategies documented in official guides |

**Overall confidence:** HIGH

### Gaps to Address

Areas where research was inconclusive or needs validation during implementation:

- **Verovio text rendering as paths:** Documentation confirms PixiJS text-in-SVG issue, but need to verify Verovio's text-as-paths option exists and produces acceptable output. Validation: Test Verovio renderToSVG with text-as-paths flag during Phase 1.

- **Texture memory for long scores:** Calculated ~3MB per section at 2000x400px, but need actual profiling with real scores. Validation: Monitor GPU memory in Chrome Task Manager during Phase 5 virtualization testing.

- **Puppeteer frame capture API:** Architecture suggests app.renderer.extract.canvas() but this differs from DOM-based capture. Validation: Test extraction with headless Chrome during Phase 6, may need format conversion.

- **Coordinate space mapping:** CachedEvent.globalX positions were measured from DOM. PixiJS sprites use different coordinate space but offsets should be preserved. Validation: Verify note positions during Phase 4 highlighting implementation.

- **Font pre-loading timing:** Unclear if document.fonts.load() is sufficient or if need to wait for document.fonts.ready promise. Validation: Test font loading sequence during Phase 1 texture conversion.

## Sources

### Primary (HIGH confidence)
- [PixiJS v8 Render Groups](https://pixijs.com/8.x/guides/concepts/render-groups) - GPU transform documentation
- [PixiJS v8 Performance Tips](https://pixijs.com/8.x/guides/concepts/performance-tips) - Optimization strategies and render group usage
- [PixiJS SVG Loading](https://pixijs.com/8.x/guides/components/assets/svg) - SVG-to-texture conversion methods
- [@pixi/react v8 Announcement](https://pixijs.com/blog/pixi-react-v8-live) - React 19 compatibility confirmation
- [@pixi/react Getting Started](https://react.pixijs.io/getting-started/) - Component integration patterns
- [PixiJS GitHub Releases](https://github.com/pixijs/pixijs/releases) - Version 8.16.0 release notes
- [PixiJS Garbage Collection Guide](https://pixijs.com/8.x/guides/concepts/garbage-collection) - Texture GC behavior
- [PixiJS Cache As Texture](https://pixijs.com/8.x/guides/components/scene-objects/container/cache-as-texture) - Texture size limits
- [Soundslice Playhead Scrolling Options](https://www.soundslice.com/help/en/player/advanced/116/playhead-scrolling-options/) - Industry patterns for camera behavior
- [Soundslice Horizontal Layout](https://www.soundslice.com/help/en/player/advanced/115/horizontal-layout/) - Feature design rationale

### Secondary (MEDIUM confidence)
- [React 19 Issue Resolution](https://github.com/pixijs/pixi-react/issues/551) - React 19 compatibility fix in beta.17
- [Dynamic SVG Textures Discussion](https://github.com/pixijs/pixijs/discussions/10953) - Data URI approach validation
- [PixiJS Tint Implementation](https://github.com/pixijs/pixijs/issues/3004) - Shader tint mechanism explanation
- [SVG Text and Font Loading](https://github.com/pixijs/pixijs/discussions/7448) - Text rendering limitations
- MuseScore forum discussions on continuous scrolling (multiple threads on page jumping issues)

### GitHub Issues (HIGH confidence for specific bugs)
- [Issue #6494: WebGL Context Loss](https://github.com/pixijs/pixijs/issues/6494) - Context loss recovery patterns
- [Issue #10549: Graphics Redraw Memory Leak](https://github.com/pixijs/pixijs/issues/10549) - Memory leak in v8 with clear/redraw
- [Issue #8986: Memory Leak After Destroy](https://github.com/pixijs/pixijs/issues/8986) - Cleanup options for proper disposal
- [Issue #1897: requestAnimationFrame Conflict](https://github.com/pixijs/pixijs/issues/1897) - Dual animation loop issues

### Project-Specific (HIGH confidence)
- Previous Konva migration attempt in this codebase (feature/canvas-konva-migration branch)
- Existing RegularRenderer.tsx for animation pattern reference
- useSingleLineVerovio.ts hook for section generation logic

---
*Research completed: 2026-02-08*
*Ready for roadmap: yes*
