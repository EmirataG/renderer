# Phase 14: Page Virtualization - Context

**Gathered:** 2026-02-08
**Status:** Ready for planning

<domain>
## Phase Boundary

RegularRenderer only mounts visible pages + buffer in DOM, with placeholder divs for unmounted pages. Pages look like one continuous document with no visible boundaries. Remove isRenderMode (Puppeteer moving to backend).

</domain>

<decisions>
## Implementation Decisions

### Buffer Strategy
- 1 page above + 1 page below the visible page (3 pages total max)
- Symmetric buffer — equal above and below regardless of playback state
- Visibility computed from camera Y position (existing translateY system), not IntersectionObserver

### Page Gap Handling
- Pages must look like one continuous document — no visible page boundaries
- Trim Verovio's built-in top/bottom margins from each page's SVG viewBox to eliminate spacing
- First page keeps its top margin (natural starting point); only internal boundaries are trimmed
- Goal: score appears as a single continuous vertical layout

### Mount/Unmount Transitions
- Instant mount — pages just appear, no fade or animation
- Placeholder divs are empty divs with correct height (no skeleton or background)
- Animation state does not survive unmount/remount — reset is fine since playback has moved past
- Seeking to distant position: instant jump (unmount old, mount new immediately)

### Puppeteer / Render Mode
- Remove isRenderMode flag entirely — Puppeteer is moving to backend in a future phase
- No need to accommodate render mode behavior in virtualization logic

### Claude's Discretion
- Initial load strategy (whether to show first 1-2 pages immediately or wait for all SVGs then virtualize)
- Exact viewBox trimming calculations for margin removal
- How to measure page heights for placeholder divs

</decisions>

<specifics>
## Specific Ideas

- "It should all look like one page" — the core visual requirement is seamlessness
- Current issue is excessive transparent space between pages, not white lines or misalignment
- Camera position is the source of truth for which pages are visible (consistent with existing CSS transform model)

</specifics>

<deferred>
## Deferred Ideas

- Puppeteer/video export moving to backend service — future milestone
- Skeleton loading placeholders — not needed with camera-based scrolling and instant mount

</deferred>

---

*Phase: 14-page-virtualization*
*Context gathered: 2026-02-08*
