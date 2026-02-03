# Project Research Summary

**Project:** Manuscript Renderer — OSMD to Verovio Migration
**Domain:** Music notation rendering engine replacement in React/Vite browser application
**Researched:** 2026-02-03
**Confidence:** MEDIUM-HIGH

## Executive Summary

This migration replaces the OpenSheetMusicDisplay (OSMD) rendering engine with Verovio, a WASM-based music engraving library. The migration is a pure engine swap — same features, better engraving quality and performance. Verovio uses MEI-based engraving with SMuFL fonts, compiled to WebAssembly, delivering faster rendering and cleaner SVG output than OSMD's JavaScript-based VexFlow renderer.

The recommended approach is a phased migration that preserves the existing architecture while adapting to fundamental API differences. The most significant architectural change is the loss of OSMD's Cursor API — Verovio provides no equivalent for iterating through note positions. Instead, the migration must build a new event extraction system using Verovio's time-query methods (`getTimeForElement()`) combined with DOM position queries after SVG insertion. The existing interpolation and sync anchor system remains unchanged since it operates on a stable `MusicalEvent` interface.

Critical risks center around three areas: (1) WASM initialization timing in Vite's dev server, (2) SVG `<use>` element styling for notehead animations, and (3) rebuilding the Y-position extraction system that drives camera scrolling. All three risks are mitigable through early validation in Phase 1 (core rendering) and careful sequencing of migration tasks to validate each dependency before building on it.

## Key Findings

### Recommended Stack

**Core migration:** Replace `opensheetmusicdisplay` with `verovio@^6.0.1` (released Jan 28, 2026). Add `vite-plugin-wasm@^3.5.0` and `vite-plugin-top-level-await@^1.6.0` to handle WASM module loading in Vite. Use `@types/verovio@^5.1.0` for TypeScript coverage, with local type augmentations for any gaps (types lag behind by one major version but cover the stable API surface).

**Core technologies:**
- **Verovio 6.0.1 (WASM)** — MusicXML-to-SVG engraving engine. WASM-compiled C++ delivers faster rendering than OSMD's JavaScript. Auto-detects MusicXML input, outputs clean SVG strings with MEI-based element IDs.
- **vite-plugin-wasm** — Required for ESM WASM imports in Vite. Prevents pre-bundling issues with Verovio's WASM binary. Must exclude `verovio` from `optimizeDeps`.
- **vite-plugin-top-level-await** — Enables async WASM initialization in browsers without native top-level await support. Pairs with Vite WASM plugin for broad compatibility.

**Initialization pattern:** Singleton WASM module (`createVerovioModule()` called once at app startup), multiple lightweight `VerovioToolkit` instances (one per renderer). This matches OSMD's current pattern (global library, multiple instances for RegularRenderer vs SyncEditor) but makes WASM loading explicit.

**Critical version constraints:** Verovio 6.0.1 types are at 5.1.0 — core methods are typed, but new 6.x features may need local augmentations. Vite 6.3.5 (current) is compatible with `vite-plugin-wasm@^3.5.0` which supports Vite 2-7.

### Expected Features

All current features must migrate. This is a rendering engine swap, not a feature change.

**Must migrate (table stakes):**
- **MusicXML loading** — `tk.loadData(xmlString)` replaces `osmd.load()`. Auto-format detection. Complexity: LOW.
- **SVG rendering** — `tk.renderToSVG(pageNo)` returns SVG string; insert via `dangerouslySetInnerHTML`. Complexity: LOW.
- **Event extraction (timing)** — Build event list by iterating SVG DOM `g.note` elements and calling `tk.getTimeForElement(id)` for each. Replaces Cursor iteration. Complexity: MEDIUM.
- **SVG element IDs** — Verovio preserves MEI `xml:id` directly as SVG `id` attribute on `<g class="note">` elements. No VexFlow `vf-` prefix. Complexity: LOW.
- **Notehead targeting** — CSS selector changes from `.vf-notehead` to `g.notehead`. Noteheads are `<use xlink:href>` elements referencing SMuFL glyphs, not inline `<path>`/`<ellipse>`. Requires both `fill` and `color` styling. Complexity: MEDIUM.
- **Score color (global CSS)** — Update selectors to target `g.note`, `g.staff`, `use` elements. Add `color` property alongside `fill`. Complexity: LOW.
- **Zoom/scale** — `tk.setOptions({scale: percentage})` + re-render. Convert OSMD's decimal zoom to percentage (1.0 → 100). Complexity: LOW.
- **Score layout options** — Map OSMD options to Verovio: `drawTitle: false` → `header: 'none'`, `drawComposer: false` → `footer: 'none'`. Complexity: LOW.
- **MusicXML validation** — Simpler with Verovio: `tk.loadData()` returns boolean, no DOM container needed. Complexity: LOW.
- **Cursor X/Y position** — No built-in cursor in Verovio. Use `getBoundingClientRect()` on SVG elements after DOM insertion. Complexity: HIGH. Risk: HIGH.

**Defer (v2+):**
- **Web Worker rendering** — Verovio WASM can run in Web Workers for large scores. Not needed for typical single-page lead sheets. Defer until profiling shows >200ms render times.
- **Multi-format support** — Verovio supports Humdrum, ABC, MEI natively. Current app is MusicXML-only. No user demand for other formats.
- **MEI export** — `tk.getMEI()` enables format conversion. Not in current requirements.
- **`svgAdditionalAttribute` enrichment** — Expose pitch/octave as `data-*` attributes for CSS selection like `g[data-pname="c"]`. Enables future features but not needed for parity.

### Architecture Approach

The migration preserves the existing React component structure and state management (Zustand) while replacing OSMD-specific rendering, event extraction, and DOM queries. The core insight: OSMD manages its own DOM (renders directly into a container), and current code queries into that DOM for animation. Verovio just makes the DOM insertion explicit (via `dangerouslySetInnerHTML`) but the query pattern remains identical.

**Major components:**
1. **verovioService.ts (NEW)** — Singleton WASM module initialization. Exposes `createToolkit()` factory and `isReady` Promise. Ensures one WASM load (~3-5MB) shared across all consumers.
2. **useVerovio.ts (NEW)** — React hook wrapping Verovio lifecycle: `loadData()` → `setOptions()` → `renderToSVG()` → `renderToMIDI()`. Returns `{svgString, toolkit, pageCount, isLoading}`.
3. **getVerovioEvents.ts (NEW, replaces getEvents.ts)** — Walks rendered SVG DOM for `g.note` elements, calls `tk.getTimeForElement(id)` for timing, uses `getBoundingClientRect()` for positions. Returns same `MusicalEvent[]` interface (drop-in for interpolation.ts).
4. **RegularRenderer.tsx (MODIFIED)** — Swap `new OpenSheetMusicDisplay()` for `useVerovio()` hook. Render SVG via `<div ref={scoreRef} dangerouslySetInnerHTML={{__html: svgString}} />`. Update animation selectors. Camera/scroll logic structurally unchanged.
5. **SyncEditor.tsx (MODIFIED)** — Same `useVerovio()` pattern. Click handling changes from `.vf-stavenote` to `g.note`. Note coloring updates for `<use>` elements.
6. **noteAnimation.ts (MODIFIED)** — Selector updates: `g.notehead` instead of `.vf-notehead`. Style `fill` and `color` on parent `<g>` to propagate through `<use>` elements.
7. **interpolation.ts (UNCHANGED)** — Pure function on `MusicalEvent[]` interface. No engine dependency. Zero changes.

**Key architectural patterns:**
- **Singleton WASM, multiple toolkits:** One `createVerovioModule()` call, multiple `VerovioToolkit` instances (one per renderer). Prevents duplicate WASM loads.
- **SVG-as-string rendering:** Verovio returns SVG strings. Insert via `dangerouslySetInnerHTML`, then query live DOM. Same timing as current OSMD (query after render).
- **Event extraction via DOM walk:** After SVG insertion, iterate `g.note` elements and call `tk.getTimeForElement(id)` for each. Replaces Cursor's sequential iteration model.
- **Multi-page via tall single page:** Set `pageHeight: 60000` + `adjustPageHeight: true` to get single continuous SVG for vertical scrolling (matches current behavior). Avoids pagination.

### Critical Pitfalls

1. **CSS Fill/Stroke Does Not Propagate Through `<use>` Elements**
   - **Risk:** Noteheads render as `<use xlink:href="#glyph">` referencing SMuFL glyphs in `<defs>`. Setting only `fill` on `<use>` may fail if the referenced glyph has presentation attributes.
   - **Prevention:** Set BOTH `fill` and `color` on parent `g.note` or `g.notehead`. Verovio glyphs use `currentColor`, so the `color` property propagates. Validate with early proof-of-concept coloring test before animation work.
   - **Phase:** Phase 1 (Core Verovio Integration) — must validate in first rendering spike.

2. **WASM Initialization Race Condition in Vite Dev Server**
   - **Risk:** WASM files from `node_modules` may fail to resolve in Vite dev mode with 404 or MIME type errors. Production build may work but dev mode fails (or vice versa). React components may call toolkit methods before WASM Promise resolves.
   - **Prevention:** Add `vite-plugin-wasm` + `vite-plugin-top-level-await`. Exclude `verovio` from `optimizeDeps`. Test BOTH `vite dev` AND `vite build && vite preview`. Use singleton async init pattern, not per-component `useEffect` init.
   - **Phase:** Phase 1 (Core Verovio Integration) — first task, nothing else works until WASM loads reliably.

3. **Lost Cursor API — No Direct Y-Position Equivalent**
   - **Risk:** OSMD's `cursor.cursorElement.style.top` provides Y positions for camera scrolling. Verovio has no cursor. No `getPositionForElement()` method. Camera scrolling system breaks without Y positions.
   - **Prevention:** After SVG DOM insertion, query `g.note` elements with `getBoundingClientRect()` to extract Y positions. Group notes into systems by Y-coordinate clustering (existing `Y_THRESHOLD = 20` logic adapts). Must happen AFTER DOM render.
   - **Phase:** Phase 2 (Event System Migration) — after basic rendering works, position extraction must be rebuilt before camera/animation.

4. **Verovio Timing Model Mismatch (MIDI Milliseconds vs Beat Fractions)**
   - **Risk:** OSMD uses beat fractions (0.0, 0.25, 0.5 for quarter notes). Verovio uses MIDI milliseconds (tempo-dependent absolute time). Mixing the two produces incorrect timing. Interpolation system expects beat fractions.
   - **Prevention:** Decide on ONE timing coordinate system. Recommended: switch to Verovio's milliseconds (aligns with audio `currentTime * 1000`). Replace `beatOnset` with `timeMs` from `getTimeForElement()`. Must call `renderToMIDI()` before timing queries work.
   - **Phase:** Phase 2 (Event System Migration) — must be addressed alongside event extraction, before animation system connects.

5. **`renderToMIDI()` Prerequisite Not Called — Silent Timing Failures**
   - **Risk:** `getElementsAtTime()`, `getTimeForElement()`, `getMIDIValuesForElement()` require prior `renderToMIDI()` call. Without it, methods return empty/zero results without errors. App appears to work but timing is wrong.
   - **Prevention:** Establish strict initialization sequence: `loadData()` → `renderToSVG()` → `renderToMIDI()` → timing queries safe. Enforce via wrapper service. Store MIDI result even if unused (side effect populates timing data).
   - **Phase:** Phase 1 (Core Verovio Integration) — establish correct init sequence from the start.

## Implications for Roadmap

Based on dependency analysis, the migration must follow a strict sequence where each phase validates its foundational dependencies before building higher-level features. The critical path is: WASM init → basic rendering → event extraction → position data → animation/camera.

### Phase 1: Core Verovio Integration (Foundation)
**Rationale:** Everything depends on working Verovio rendering. Validates WASM loading, MusicXML input, SVG output, and critical unknowns (WASM in Vite, `<use>` element styling) before committing to the migration approach.

**Delivers:**
- WASM module loading reliably in dev and production
- Basic Verovio SVG rendering in RegularRenderer (no animation, no events)
- Proof-of-concept notehead coloring via `<use>` element styling
- Correct initialization sequence (`loadData` → `renderToSVG` → `renderToMIDI`)

**Addresses:**
- MusicXML loading (Feature #1)
- SVG rendering (Feature #2)
- Score color CSS (Feature #6)
- Zoom/scale (Feature #7)
- Layout options (Feature #8)
- MusicXML validation (Feature #9)

**Avoids:**
- Pitfall #2: WASM init race condition (test both dev and prod modes)
- Pitfall #1: CSS `<use>` element styling (validate coloring works)
- Pitfall #6: `renderToMIDI()` prerequisite (establish init sequence)

**Research flag:** LOW — Verovio has excellent official documentation at book.verovio.org. Stack research already covers the critical integration patterns. This phase is about execution, not discovery.

---

### Phase 2: Event System Migration (Critical Path)
**Rationale:** Animation, camera, sync anchors, and click-to-select all depend on having a working `MusicalEvent[]` array. This phase rebuilds the event extraction system using Verovio's time-query API and DOM position queries. Must verify the output matches `interpolation.ts` expectations (same interface) before proceeding.

**Delivers:**
- `getVerovioEvents.ts` function that builds `MusicalEvent[]` from Verovio toolkit + rendered SVG DOM
- Timing data from `getTimeForElement()` mapped to event onset
- X/Y positions from `getBoundingClientRect()` for camera scrolling
- System detection (grouping notes by Y coordinate)
- Verified compatibility with existing `interpolateTimestamps()` function

**Addresses:**
- Event extraction (Feature #3)
- SVG element IDs (Feature #4)
- Cursor Y position extraction (Feature #10)

**Avoids:**
- Pitfall #3: Lost Cursor API (rebuild Y-position extraction via DOM queries)
- Pitfall #4: Timing model mismatch (unify on milliseconds or convert to beats)

**Dependencies:** Phase 1 complete (needs rendered SVG DOM to query)

**Research flag:** MEDIUM — The timing model conversion (milliseconds → beat fractions or vice versa) needs validation with actual scores to ensure sync anchor interpolation still works. The Y-position clustering logic may need tuning if Verovio's SVG layout differs significantly from OSMD's.

---

### Phase 3: Animation and Camera (User-Facing Features)
**Rationale:** With events available, restore interactive features. Animation depends on SVG element queries (updated selectors). Camera depends on Y positions from events. Both use patterns already established in Phases 1-2.

**Delivers:**
- Notehead animation (scale, color) with updated selectors (`g.notehead`)
- Camera vertical scrolling using Y positions from events
- Puppeteer `animationController` API (same interface, new implementation)
- Play/Pause/Reset playback preview with synchronized highlighting

**Addresses:**
- Notehead animation (Feature #5)
- Cursor Y position for camera (Feature #10, continuation)

**Avoids:**
- Pitfall #1: `<use>` styling (already validated in Phase 1, just apply pattern)

**Dependencies:** Phase 2 complete (needs `MusicalEvent[]` with Y positions)

**Research flag:** LOW — Direct application of selectors and patterns validated in earlier phases. No new unknowns.

---

### Phase 4: SyncEditor Migration
**Rationale:** SyncEditor is a secondary view (not in default user flow). Reuses all patterns from Phases 1-3. Can be done independently once foundation is solid.

**Delivers:**
- SyncEditor.tsx using `useVerovio()` hook
- Click-to-select notes with updated event delegation (`g.note` selector)
- Note coloring for sync anchors
- Keyboard navigation and anchor assignment

**Addresses:**
- Click-to-select (Feature #9 from FEATURES.md)

**Avoids:**
- Pitfall #5: React 19 click events on `dangerouslySetInnerHTML` (use native DOM listeners via `useEffect`)

**Dependencies:** Phases 1-2 complete (uses `useVerovio` + event extraction)

**Research flag:** LOW — Replicates RegularRenderer patterns in a different component.

---

### Phase 5: Validation and Cleanup
**Rationale:** All features migrated. Remove OSMD dependency, reduce bundle size, clean up dead code. Cross-score testing to validate edge cases (multi-voice, chords, grace notes, key/time changes).

**Delivers:**
- OSMD uninstalled from `package.json`
- Dead code removal (old `getEvents.ts`, OSMD imports)
- Cross-score testing with diverse MusicXML files
- Performance benchmarking (Verovio vs OSMD render times)
- Puppeteer render pipeline validation

**Dependencies:** All previous phases complete and verified

**Research flag:** NONE — Cleanup phase, no new integrations.

---

### Phase Ordering Rationale

**Why this sequence:**
1. **Foundation first (Phase 1):** WASM loading and SVG rendering are the bedrock. Everything breaks without them. Early validation of critical unknowns (`<use>` styling, Vite WASM config) prevents late-stage blockers.
2. **Events before animation (Phase 2 → Phase 3):** Animation and camera both consume `MusicalEvent[]`. Building animation first would mean mocking event data or reworking it when the real event system arrives.
3. **RegularRenderer before SyncEditor (Phase 3 → Phase 4):** RegularRenderer is the default view and has more complex requirements (camera, Puppeteer). Patterns proven there transfer cleanly to SyncEditor.
4. **Cleanup last (Phase 5):** Cannot remove OSMD until all features are migrated and verified. Premature removal would make rollback impossible.

**Dependency chain:**
```
WASM Init (Phase 1)
    ↓
SVG Rendering (Phase 1)
    ↓
Event Extraction (Phase 2) ← requires rendered SVG DOM
    ↓
Animation + Camera (Phase 3) ← requires MusicalEvent[] with Y positions
    ↓
SyncEditor (Phase 4) ← reuses Phase 1-3 patterns
    ↓
Cleanup (Phase 5)
```

**How this avoids pitfalls:**
- **Pitfall #2 (WASM init):** Addressed in Phase 1 before any other work begins.
- **Pitfall #1 (`<use>` styling):** Validated in Phase 1 proof-of-concept before animation implementation.
- **Pitfall #3 (Lost Cursor API):** Phase 2 rebuilds Y-position extraction before Phase 3 needs it for camera.
- **Pitfall #4 (Timing mismatch):** Phase 2 establishes timing model before Phase 3 connects animation to events.
- **Pitfall #6 (`renderToMIDI`):** Phase 1 enforces init sequence; Phase 2 event extraction calls it automatically.
- **Pitfall #5 (React click events):** Phase 4 handles SyncEditor clicks with native listeners, proven in Phase 3 RegularRenderer.

### Research Flags

**Phases needing deeper research during planning:**
- **Phase 2 (Event System):** Timing model conversion and Y-position clustering may need research-phase investigation if initial approach fails. Low-medium risk — official docs cover the APIs, but integration with existing interpolation system needs validation.

**Phases with standard patterns (skip research-phase):**
- **Phase 1 (Core Integration):** Well-documented Verovio initialization and rendering patterns. Stack research already covers this comprehensively.
- **Phase 3 (Animation/Camera):** Direct application of DOM queries and CSS updates. No novel integrations.
- **Phase 4 (SyncEditor):** Replication of Phase 3 patterns in a different component.
- **Phase 5 (Cleanup):** Mechanical removal and testing. No research needed.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Verovio 6.0.1 verified via npm registry and official news. WASM initialization pattern documented at book.verovio.org. Vite plugin compatibility confirmed. Types available (though lagging by one major version). |
| Features | MEDIUM-HIGH | All current OSMD features have documented Verovio equivalents. Cursor API replacement (Y-position extraction) is the main architectural uncertainty — documented approach but needs runtime validation. |
| Architecture | HIGH | Singleton WASM + multiple toolkit pattern is standard and matches current OSMD usage. `dangerouslySetInnerHTML` + DOM queries is well-understood React pattern. Component boundaries are clean. |
| Pitfalls | MEDIUM | Critical pitfalls identified via Verovio GitHub issues, official docs, and codebase analysis. `<use>` element styling and WASM init timing are the main risks — both have documented mitigation strategies but need early-phase validation. |

**Overall confidence:** MEDIUM-HIGH

The migration path is clear and well-supported by official documentation. The main uncertainty is not "can Verovio do X?" (it can) but "will the `<use>` element styling and Y-position extraction work as expected in our specific setup?". Both are validatable in Phase 1 before committing further. If either fails, fallback strategies exist (explicit CSS classes for coloring, `svgBoundingBoxes` option for positions).

### Gaps to Address

**Type coverage gap (LOW priority):**
- `@types/verovio@5.1.0` may lack types for new 6.x methods. Mitigation: Create local `verovio.d.ts` augmentation file as needed. Many toolkit methods return `string` (JSON) that could be typed more precisely — wrap in a typed service layer.
- **Handle during:** Phase 1 implementation, when type errors surface.

**WASM bundler config (MEDIUM priority):**
- Vite 6.x WASM handling with `vite-plugin-wasm` is documented but not tested with Verovio 6.0.1 specifically. May need `optimizeDeps.exclude` tuning or fallback to copying `.wasm` to `public/`.
- **Handle during:** Phase 1 setup. Test both dev and production modes early. If plugin approach fails, manual WASM loading via `fetch()` + `WebAssembly.instantiate()` is fallback.

**Timing model conversion (MEDIUM priority):**
- Converting Verovio's MIDI milliseconds to beat fractions (for compatibility with existing interpolation system) or switching interpolation to milliseconds needs validation with real scores. Simple tempo markings are well-defined, but tempo changes, fermatas, and rubato need testing.
- **Handle during:** Phase 2 event extraction. Use test scores with tempo changes to verify timing accuracy. If millisecond-based interpolation works, simplify by removing beat-fraction conversion entirely.

**`<use>` element styling in all browsers (MEDIUM priority):**
- Setting `fill` and `color` on parent `<g>` to propagate through `<use>` elements is standard SVG, but browser implementations vary. Safari and Firefox may handle `currentColor` differently than Chrome.
- **Handle during:** Phase 1 proof-of-concept. Test coloring in Chrome, Firefox, Safari. If cross-browser issues arise, use Verovio's `svgCss` option to inject CSS directly into the SVG.

**Y-position clustering for system detection (LOW priority):**
- Verovio's SVG layout may space systems differently than OSMD. The existing `Y_THRESHOLD = 20` may need tuning.
- **Handle during:** Phase 2 event extraction. Test with multi-system scores. Adjust threshold if system grouping produces incorrect results.

## Sources

### Primary (HIGH confidence)
- [Verovio Reference Book](https://book.verovio.org) — Official documentation for toolkit methods, options, input formats, CSS/SVG interaction
- [Verovio npm package](https://www.npmjs.com/package/verovio) — Version 6.0.1 confirmed, release date verified
- [Verovio News](https://www.verovio.org/news.xhtml) — Changelog and version history
- [Verovio GitHub](https://github.com/rism-digital/verovio) — Issues #520 (SVG structure), discussion #2815 (npm improvements)
- [vite-plugin-wasm npm](https://www.npmjs.com/package/vite-plugin-wasm) — v3.5.0, Vite 2-7 support
- [vite-plugin-top-level-await npm](https://www.npmjs.com/package/vite-plugin-top-level-await) — v1.6.0
- [@types/verovio npm](https://www.npmjs.com/package/@types/verovio) — v5.1.0 TypeScript definitions

### Secondary (MEDIUM confidence)
- [Vite GitHub issues #4551, #13314](https://github.com/vitejs/vite) — WASM ESM integration patterns and dev server behavior
- [React GitHub issues #30994, #4963](https://github.com/facebook/react) — SVG `dangerouslySetInnerHTML` click events in React 19
- [Codrops: Styling SVG use content](https://tympanus.net/codrops/2015/07/16/styling-svg-use-content-css/) — `<use>` element CSS inheritance patterns
- Codebase analysis — Direct source code review of RegularRenderer.tsx, SyncEditor.tsx, getEvents.ts, noteAnimation.ts, animationController.ts, interpolation.ts, musicxmlValidation.ts

### Tertiary (LOW confidence)
- Verovio SVG samples in `/Users/emirahmed/Desktop/Manuscript/renderer/verovio_examples/` — Inspected for element structure, but not exhaustive coverage of all MusicXML features

---
*Research completed: 2026-02-03*
*Ready for roadmap: yes*
