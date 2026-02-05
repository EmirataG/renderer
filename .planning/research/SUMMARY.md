# Project Research Summary

**Project:** Manuscript Renderer v1.2 - SingleLineRenderer
**Domain:** Horizontal single-line music notation rendering with section-based virtualization
**Researched:** 2026-02-05
**Confidence:** HIGH

## Executive Summary

The SingleLineRenderer adds horizontal single-system score rendering to Manuscript's existing vertical paginated renderer. This is a well-established pattern in music software (Soundslice, MuseScore, Yousician) where the playhead stays fixed while music scrolls beneath it like a teleprompter. The key insight is that most existing infrastructure (animation, event extraction, interpolation) can be reused with only axis changes.

Verovio fully supports this use case through `breaks: 'none'` configuration and section-based rendering via the `select({ measureRange })` API. No new dependencies are required. The critical architectural decision is section-based rendering: rendering the entire score as one massive horizontal SVG causes memory explosion on long scores, so we must render 10-20 measure chunks and lazy-load them based on camera position, exactly like the existing vertical virtual scrolling.

The primary risks are coordinate axis confusion (mixing X/Y logic between renderers), section boundary visual seams (horizontal staff lines must appear unbroken), and section loading race conditions (DOM queries during mount/unmount transitions). All are preventable through systematic axis mapping, CSS overlap strategies, and mount guards. Overall this is a low-risk addition that leverages proven patterns from RegularRenderer in a new orientation.

## Key Findings

### Recommended Stack

Verovio 6.0.1 (already installed) provides all required functionality for horizontal single-line rendering. No new dependencies needed.

**Core technologies:**
- **Verovio `breaks: 'none'`**: Forces single horizontal system with no line wrapping (verified in official docs)
- **Verovio `select({ measureRange })`**: Renders specific measure ranges as independent sections (verified in official docs + source code)
- **Verovio `redoLayout()`**: Required after selection changes to recompute layout (documented requirement)

**Configuration for horizontal layout:**
```typescript
{
  breaks: 'none',           // Single horizontal system
  pageWidth: 100000,        // Large width to accommodate score extent
  pageHeight: 100,          // Minimal height, adjusts to content
  adjustPageHeight: true,   // Shrink to single-system height
  pageMarginTop: 0,         // Remove margins for clean layout
  pageMarginBottom: 0,
}
```

**Section rendering workflow:**
1. Divide score into 10-20 measure sections
2. For each section: `toolkit.select({ measureRange: '1-10' })` → `toolkit.redoLayout()` → `toolkit.renderToSVG(1)`
3. Extract section widths from SVG viewBox
4. Mount/unmount sections based on camera visibility

**Confidence:** HIGH - All APIs verified in Verovio official documentation and source code inspection.

### Expected Features

Based on analysis of Soundslice, MuseScore, and guitar learning apps, the industry has converged on a fixed-playhead pattern for play-along scenarios.

**Must have (table stakes):**
- Horizontal continuous layout - Defines the renderer type
- Fixed-center playhead - Active note stays at predictable location (center of viewport)
- Smooth scrolling - CSS transform transitions, no jumpy discrete scrolling
- Score scrolls beneath playhead - Music moves left as playback progresses
- Notehead animation - Reuse existing `animateNoteheads()` from RegularRenderer
- Score region bounds - Control viewport position/size

**Should have (performance critical):**
- Section-based rendering - Required for long scores, same reason as vertical virtual scrolling
- Lazy section loading - Only mount visible + buffer sections
- Seamless section transitions - Section boundaries must be invisible to users

**Defer (v2+):**
- Adaptive scroll speed - Faster through rests, slower through dense passages
- Lookahead preview - Fade upcoming measures for anticipation
- Fixed-left playhead option - Alternative to center (Soundslice offers this)
- Measure number overlay
- Horizontal zoom control

**Critical UX insight:** Users are extremely sensitive to scroll jitter and page jumps in horizontal mode. MuseScore users consistently complain about "music redraws too late" causing "notes entirely lost" at page boundaries. This makes seamless section rendering the key differentiator.

### Architecture Approach

Most animation and event infrastructure can be reused between RegularRenderer (vertical) and SingleLineRenderer (horizontal). The core differences are rendering mode (Verovio options) and camera direction (translateX vs translateY).

**Major components:**
1. **useSingleLineVerovio hook** - Section-based rendering with `breaks: 'none'` + measure range selection. Returns `{ sections, sectionWidths, sectionOffsets, toolkit }` (analogous to `{ svgPages, pageHeights, pageOffsets }` in RegularRenderer).
2. **SingleLineRenderer component** - Horizontal camera with center-tracking, section-based virtual scrolling. Reuses `animateNoteheads()`, `interpolateTimestamps()`, transport controls.
3. **singleLineEventStore** - Event cache with `globalX` and `sectionIndex` instead of `globalY` and `pageIndex`. Same lookup patterns.

**Reusable without changes:**
- `noteAnimation.ts` - Targets SVG elements by ID, layout-agnostic
- `interpolation.ts` - Pure function on event arrays
- `animationController.ts` - Queries DOM by element ID
- `ScoreRegionEditor.tsx` - Viewport bounds work for horizontal too

**Reusable with axis modifications:**
- `getEvents.ts` - Add `computeSectionPositions()` for horizontal X extraction
- `eventStore.ts` - Extend interface or create parallel store with `globalX`/`sectionIndex`

**Camera system comparison:**
- RegularRenderer: `translateY(-(targetY - viewportHeight/2))` with system-boundary snapping
- SingleLineRenderer: `translateX(-(targetX - viewportWidth*0.3))` with continuous tracking and asymmetric centering (30% from left edge for lookahead)

**Virtual scrolling analogy:**
- Vertical: Mount 3-4 pages near camera Y, placeholder divs for unmounted pages
- Horizontal: Mount 3 sections near camera X, placeholder divs for unmounted sections

### Critical Pitfalls

1. **Coordinate axis confusion** - Systematically mixing Y/X throughout code causes camera to move perpendicular to score flow. Prevention: Create explicit type aliases (`HorizontalOffset` vs `VerticalOffset`), build mapping table (globalY→globalX, translateY→translateX, pageHeights→sectionWidths), code review grep for 'Y', 'height', 'top', 'vertical' in SingleLine code.

2. **Section boundary visual seams** - Hairline gaps or misaligned staff lines at section joins break the seamless illusion. Prevention: Use `display: flex` with `gap: 0` (not inline-block), render sections with 1-2 measure overlap then clip-path, extend staff lines 1-2px beyond boundaries, round section offsets to whole pixels, test with colored background.

3. **Event position cache invalidation** - Switching between renderers uses wrong axis data if cache doesn't include renderer type. Prevention: Include `rendererType: 'regular' | 'singleLine'` in cache key, invalidate position cache on renderer switch (timing cache can persist).

4. **Section loading race conditions** - DOM queries during mount/unmount transitions return null intermittently. Prevention: Mount-before-query guards (`if (!sectionRefs.current[sectionIndex]) return`), animation section locking (prevent unmounting sections with active animations), synchronous section mounting for Puppeteer seek (`flushSync`), camera lookahead (keep 1 section ahead mounted).

5. **Horizontal camera centering math** - Direct Y→X translation produces symmetric centering, but horizontal reading is asymmetric (need to see upcoming notes). Prevention: Use asymmetric centering `targetX - viewportWidth * 0.3` (30% from left, not 50%), clamp at score edges to avoid empty space, make configurable for tuning.

## Implications for Roadmap

Based on research, suggested phase structure follows dependency chain from rendering to camera to virtualization.

### Phase 1: Single-Line Verovio Hook
**Rationale:** Foundation layer - must render horizontal sections before building camera/events on top.
**Delivers:** `useSingleLineVerovio.ts` hook that takes MusicXML and returns horizontal sections array.
**Addresses:** Horizontal continuous layout (table stakes feature).
**Avoids:** Verovio configuration pitfall by verifying `breaks: 'none'` + `select()` behavior upfront.
**Research flag:** Skip research-phase - Verovio APIs are well-documented (book.verovio.org).

### Phase 2: Single-Line Event Extraction
**Rationale:** Events must be extracted with horizontal coordinates before camera can track them.
**Delivers:** `computeSectionPositions()` function, `SingleLineEvent` type with `globalX`/`sectionIndex`.
**Uses:** Section containers from Phase 1 for DOM measurement.
**Addresses:** Event extraction (required for animation).
**Avoids:** Coordinate axis confusion via explicit X-axis naming, cache invalidation via renderer-type key.
**Research flag:** Skip research-phase - Pattern proven in vertical case, just different axis.

### Phase 3: SingleLineRenderer Core
**Rationale:** Camera and animation working end-to-end validates the approach before adding virtualization complexity.
**Delivers:** `SingleLineRenderer.tsx` with horizontal camera, notehead animation, smooth scrolling.
**Implements:** Camera system with asymmetric centering (30/70 split for lookahead).
**Addresses:** Fixed-center playhead, smooth scrolling, notehead animation (all table stakes).
**Avoids:** Camera centering math pitfall by using asymmetric formula from start.
**Research flag:** Skip research-phase - Reuses proven RegularRenderer patterns on different axis.

### Phase 4: Section Virtualization
**Rationale:** Performance optimization for long scores. Add after core functionality working to avoid premature optimization.
**Delivers:** Section visibility calculation, mount/unmount based on camera position, placeholder divs.
**Implements:** Horizontal virtual scrolling (analogous to vertical page virtualization).
**Addresses:** Lazy section loading (performance-critical feature).
**Avoids:** Section loading race conditions via mount guards and section locking, section boundary seams via overlap strategy.
**Research flag:** Consider research-phase - Seamless section transitions are critical and may need experimentation.

### Phase 5: Integration and Polish
**Rationale:** Final integration after all core functionality validated.
**Delivers:** Renderer type toggle in App.tsx, score region bounds for horizontal, border handling.
**Addresses:** Complete feature set for v1.2 milestone.
**Research flag:** Skip research-phase - Integration patterns established.

### Phase Ordering Rationale

- **Foundation-first:** Hook → Events → Renderer → Virtualization follows natural dependency chain. Can't build camera without events, can't extract events without rendered sections.
- **Validation before optimization:** Core functionality (Phases 1-3) working end-to-end before adding virtualization complexity. This allows early testing with short scores and validates the approach.
- **Reuse maximization:** Existing infrastructure (noteAnimation.ts, interpolation.ts) reused immediately in Phase 3, minimizing new code surface area.
- **Risk mitigation:** Critical pitfalls (axis confusion, cache invalidation, camera math) addressed in early phases before compounding with virtualization complexity.

### Research Flags

**Phases likely needing deeper research during planning:**
- **Phase 4 (Section Virtualization):** Seamless section transitions are the key differentiator. May need experimentation with overlap amounts, clipping strategies, and visual testing across browsers. Consider `/gsd:research-phase` to investigate section boundary rendering techniques.

**Phases with standard patterns (skip research-phase):**
- **Phase 1 (Verovio Hook):** Verovio APIs well-documented, section-based rendering is straightforward.
- **Phase 2 (Event Extraction):** Proven pattern from RegularRenderer, just different axis.
- **Phase 3 (Renderer Core):** Camera and animation patterns established, horizontal is variant.
- **Phase 5 (Integration):** Standard React component integration.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All Verovio APIs verified in official documentation and source code. No new dependencies needed. |
| Features | HIGH | Multiple authoritative sources (Soundslice official docs, MuseScore forums) agree on fixed-playhead pattern. Table stakes clearly defined. |
| Architecture | HIGH | Existing RegularRenderer provides proven reference implementation. Component reuse strategy validated through code analysis. |
| Pitfalls | HIGH | Based on actual codebase experience (Phase 8 virtual scrolling lessons), verified DOM/CSS behavior, MuseScore community pain points. |

**Overall confidence:** HIGH

### Gaps to Address

- **Section overlap amount:** Research suggests 1-2 measure overlap for seamless staff lines, but exact amount may need tuning during implementation. Test with various scores to find optimal overlap.

- **Asymmetric camera centering ratio:** Recommended 30% from left edge (0.3 factor) based on reading direction, but optimal value should be validated with user testing. Make configurable for easy adjustment.

- **Section size (measures per section):** Suggested 10-20 measures balances lazy loading benefit vs rendering overhead, but optimal size may vary with score density. Monitor performance during implementation.

- **Maximum score width limits:** Browsers have SVG width limits (~32767px in some). Long scores may hit this even with sectioning if sections are very wide. Validate with stress testing (100+ measure sections).

All gaps are tuning parameters rather than fundamental unknowns. Implementation can proceed with conservative defaults and adjust based on testing.

## Sources

### Primary (HIGH confidence)
- [Verovio Layout Options](https://book.verovio.org/advanced-topics/layout-options.html) - `breaks: 'none'` documentation
- [Verovio Score Content Selection](https://book.verovio.org/interactive-notation/content-selection.html) - `select()` API with `measureRange`
- [Verovio Toolkit Options](https://book.verovio.org/toolkit-reference/toolkit-options.html) - All option documentation
- [Verovio Toolkit Methods](https://book.verovio.org/toolkit-reference/toolkit-methods.html) - `select()`, `redoLayout()`, `renderToSVG()` methods
- Verovio source code (`node_modules/verovio/dist/verovio.mjs`) - Confirmed `select` method exists
- [Soundslice Playhead Scrolling Options](https://www.soundslice.com/help/en/player/advanced/116/playhead-scrolling-options/) - Fixed-playhead pattern documentation
- [Soundslice Horizontal Layout](https://www.soundslice.com/help/en/player/advanced/115/horizontal-layout/) - Horizontal scrollable mode
- Existing codebase analysis - RegularRenderer.tsx, useVerovio.ts, getEvents.ts, noteAnimation.ts, eventStore.ts

### Secondary (MEDIUM confidence)
- [MuseScore Ticker-like Scrolling](https://musescore.org/en/node/109511) - Community requests for fixed-cursor scrolling
- [MuseScore Smooth Pan](https://musescore.org/en/node/339030) - Smooth scrolling implementation discussion
- [MuseScore Playback Cursor Sync Issues](https://musescore.org/en/node/276676) - User pain points with page jumps
- [GitHub Issue #1304](https://github.com/rism-digital/verovio/issues/1304) - Partial score rendering feature confirmation
- [GitHub Issue #1276](https://github.com/rism-digital/verovio/issues/1276) - `adjustPageWidth` not implemented
- Previous phase research - `.planning/phases/08-virtual-scrolling/08-RESEARCH.md`, `.planning/phases/06-paginated-rendering-and-camera/06-RESEARCH.md`

### Tertiary (LOW confidence)
- [Yousician Guitar App](https://yousician.com/guitar) - Scrolling fretboard pattern validation
- [Teleprompter Scroll Modes](https://www.speakflow.com/docs/scroll-modes-flow-auto) - Smooth scroll UX patterns

---
*Research completed: 2026-02-05*
*Ready for roadmap: yes*
