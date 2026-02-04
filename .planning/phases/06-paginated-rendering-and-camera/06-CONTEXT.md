# Phase 6: Paginated Rendering & Camera - Context

**Gathered:** 2026-02-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Switch Verovio from rendering one 60,000px-tall SVG to rendering multiple page SVGs. Camera and playback must work seamlessly across page boundaries. This phase establishes the multi-page foundation that event caching (Phase 7) and virtual scrolling (Phase 8) build on.

Requirements: PAG-01, PAG-02, PAG-03, PAG-04, CAM-01, CAM-02, CAM-03

</domain>

<decisions>
## Implementation Decisions

### Page break behavior
- Page height: Claude's discretion — pick whichever approach works best for the architecture (viewport-matched vs fixed A4-ish)
- Break quality: Trust Verovio defaults — don't over-constrain page break placement
- Re-paginate on viewport resize — recalculate pages when window size changes
- Scale change: re-render visible pages first, render remaining pages lazily in background
- Short scores (fits on one page): use single SVG path, skip pagination overhead — `pages.length === 1` means no paginated code path

### Cross-page visual continuity
- Page boundaries must be INVISIBLE — user should never perceive page breaks during playback
- Pages stacked with no gap — seamless continuous scroll appearance
- Camera transition across pages: smooth scroll, same 200ms ease-out as within a page — no special behavior at page boundaries
- Pre-mount adjacent pages: always mount current page + previous + next neighbors for seamless scrolling

### Loading & re-render experience
- Initial score load: Claude's discretion on loading pattern (show first page immediately vs wait for all)
- Scale slider: same debounce as current — re-render all pages after slider settles
- Unrendered page placeholder: empty space with correct height (no stale content, no skeleton)
- No visual feedback for background rendering — silent background work

### Score display fidelity
- Minor layout differences from pagination are acceptable — music must be correct and readable, doesn't need to match single-page pixel-for-pixel
- Pages must be flush — no padding between pages, strip any Verovio page margins
- Score color: apply color class to each page container individually, same pattern as current
- Score borders: keep borders exactly where they are now — above and below the score container div (not per-page)

### Claude's Discretion
- Page height strategy (viewport-matched vs fixed)
- Initial load pattern (progressive vs blocking)
- Exact debounce timing for resize re-pagination
- How to strip/suppress Verovio page margins for flush stacking

</decisions>

<specifics>
## Specific Ideas

- Short scores should feel identical to current behavior — pagination is an optimization, not a visible change
- The seamless scroll requirement means page containers must be positioned so the global Y coordinate space is continuous (no gaps, no overlaps)
- Pre-mounting neighbors is important for visual continuity during playback — a flash of empty space between pages would be unacceptable

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 06-paginated-rendering-and-camera*
*Context gathered: 2026-02-04*
