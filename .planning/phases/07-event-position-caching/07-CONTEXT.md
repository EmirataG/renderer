# Phase 7: Event Position Caching - Context

**Gathered:** 2026-02-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Extract musical events once per score load with page assignments and global Y positions, eliminating redundant DOM queries. This phase creates the cached event layer that virtual scrolling (Phase 8) depends on — Y positions must be computed while all pages are mounted, before Phase 8 can safely unmount pages.

Requirements: EVT-01, EVT-02, EVT-03, EVT-04

</domain>

<decisions>
## Implementation Decisions

### Cache storage & scope
- Cache is SHARED between RegularRenderer and SyncEditor — single extraction per score load
- Cache lives in a Zustand store (new eventStore or extend existing store)
- Both components read from the same cache — no duplicate extraction

### Invalidation triggers
- Cache invalidates when `svgPages` reference changes
- This naturally covers all invalidation cases: XML change, scale change, width change
- No explicit hash needed — svgPages already encodes the rendering state

### Y position computation
- Compute ALL Y positions EAGERLY after svgPages render, while all pages are in DOM
- This is critical for Phase 8: Y positions must be cached before virtual scrolling unmounts pages
- Use getBoundingClientRect on DOM elements during the eager computation pass
- Cache persists even when pages later unmount (Phase 8)

### Cache structure
- Each event needs: id, beatOnset, beatDuration, svgIds[], pageIndex, globalY
- Page index enables O(1) lookup of which page contains an event
- Global Y computed as: pageOffsets[pageIndex] + localY (from Phase 6 pattern)

### Claude's Discretion
- Exact Zustand store structure (new store vs extend syncStore)
- Whether to use useMemo, useEffect, or store subscription pattern
- How to trigger eager computation (rAF callback, useLayoutEffect, etc.)
- Whether to expose a hook (useEvents) or direct store access

</decisions>

<specifics>
## Specific Ideas

- The eager Y computation should happen in a requestAnimationFrame after svgPages render, same pattern as current getEventsFromVerovio
- Consider extracting timemap data separately from Y positions — timemap is pure data (no DOM needed), Y positions need DOM
- The cache should be queryable by: eventId, timestamp range, page index
- SyncEditor may not need global Y positions (user-scrolled) — but having them cached doesn't hurt

</specifics>

<deferred>
## Deferred Ideas

- Lazy Y computation for unmounted pages — rejected in favor of eager computation while all pages mounted
- Per-component caches — rejected in favor of shared cache

</deferred>

---

*Phase: 07-event-position-caching*
*Context gathered: 2026-02-04*
