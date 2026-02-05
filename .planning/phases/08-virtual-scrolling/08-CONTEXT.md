# Phase 8: Virtual Scrolling - Context

**Gathered:** 2026-02-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Mount only pages near the current camera position in the DOM, bounding memory usage regardless of score length. Includes Puppeteer render mode compatibility where all pages must remain mounted for frame capture.

</domain>

<decisions>
## Implementation Decisions

### Viewport window size
- Fixed 3-page window: current page + 1 before + 1 after
- Centered on camera position (not forward-biased)
- Unmounted pages represented by empty divs with correct heights
- Instant swap when camera jumps to different location

### Transition behavior
- Preload pages ahead (mount next page before camera reaches it)
- Immediate unmount when page leaves the 3-page window (no hysteresis)
- Virtual scrolling applies to both playback and manual scroll
- Pages stay unmounted even when playback is paused
- Fixed 3-page window regardless of scroll speed (no adaptive sizing)
- Disable virtual scrolling for short scores (3 or fewer pages) — mount all

### Animation targeting
- If current note is on unmounted page, mount that page first before animating
- Use event's pageIndex to look up element within the correct page container
- Same animation code path for both normal and Puppeteer render mode
- Puppeteer mode just has more pages mounted, animations work identically

### Puppeteer mode detection
- Claude's discretion on detection mechanism (URL param, global flag, etc.)
- When in render mode: mount all pages, disable virtual scrolling entirely

### Claude's Discretion
- Update frequency for viewport window calculation
- Animation cleanup behavior when pages unmount
- Exact threshold for "short score" (3 pages suggested, can adjust)
- Loading indicator (none expected, but can add if mounts are slow)

</decisions>

<specifics>
## Specific Ideas

- No loading indicators — page mounts should be fast enough
- Memory should stay bounded regardless of score length
- Behavior should be invisible to user during normal playback

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 08-virtual-scrolling*
*Context gathered: 2026-02-05*
