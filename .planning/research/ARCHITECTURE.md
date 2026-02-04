# Architecture Research: Efficiency Features Integration

**Domain:** Paginated rendering, event caching, and virtual scrolling for Verovio-based music score renderer
**Researched:** 2026-02-04
**Confidence:** HIGH (verified against existing codebase, Verovio official docs, and Intersection Observer MDN spec)

## Executive Summary

This document analyzes how three efficiency features -- paginated SVG rendering, event position caching, and virtual scrolling -- integrate with the existing Manuscript renderer architecture. The existing system renders the entire score as a single tall SVG (via `pageHeight: 60000` + `adjustPageHeight: true`). This works for short lead sheets but becomes a performance bottleneck for longer scores: the browser must parse and layout one massive SVG, all note elements exist in the DOM simultaneously, and `getBoundingClientRect()` triggers layout recalculation across the entire SVG tree.

The recommended approach is an incremental three-layer refactor: (1) switch from single-SVG to paginated rendering using Verovio's native `renderToSVG(pageNum)` API, (2) cache extracted event data so re-extraction from DOM is unnecessary, and (3) add virtual scrolling so only visible pages are mounted in the DOM. Each layer is independently valuable and builds on the previous one.

**Critical constraint:** The Puppeteer frame-capture pipeline (`window.animationController.setTimestamp()`) requires that animated elements be present in the DOM at screenshot time. Virtual scrolling must ensure the correct page is mounted before Puppeteer captures a frame. This is the primary architectural challenge.

---

## Current Architecture (What Exists Today)

```
App.tsx (state owner)
 |
 +--> useVerovio.ts (hook)
 |      - Creates VerovioToolkit via verovioService.ts singleton
 |      - Calls setOptions({ pageHeight: 60000, adjustPageHeight: true })
 |      - Calls renderToSVG(1) -- SINGLE PAGE, entire score
 |      - Calls renderToMIDI() for timing data
 |      - Returns { svgString, toolkit, isLoading, error }
 |
 +--> RegularRenderer.tsx
 |      - Receives svgString from useVerovio
 |      - Renders via <div dangerouslySetInnerHTML={{ __html: svgString }} />
 |      - After DOM commit: extracts events via getEventsFromVerovio()
 |      - Events include Y positions from getBoundingClientRect() on g.system
 |      - Camera: CSS translateY() on wrapper div, driven by event.y
 |      - Animation: inline styles on g.notehead elements
 |      - Puppeteer: window.animationController.setTimestamp(sec)
 |
 +--> getEvents.ts (getEventsFromVerovio)
 |      - Calls toolkit.renderToTimemap() for timing data
 |      - Walks SVG DOM: querySelectorAll('g.system') for Y positions
 |      - For each event: querySelector(`#${noteId}`).closest('g.system')
 |      - Returns MusicalEventWithY[] with { id, beatOnset, svgIds, y }
 |
 +--> noteAnimation.ts
 |      - querySelector(`#${CSS.escape(id)}`) to find note in DOM
 |      - querySelectorAll('g.notehead') for scale animation
 |      - querySelectorAll('use') for color animation
 |      - ALL elements must be in DOM for animation to work
 |
 +--> animationController.ts
        - Same querySelector pattern for Puppeteer frame capture
        - Synchronous DOM manipulation (no async, no waiting)
```

### Current Performance Characteristics

| Metric | Current Behavior | Problem at Scale |
|--------|-----------------|------------------|
| SVG rendering | Single call: `renderToSVG(1)` for entire score | Large scores produce SVGs with thousands of elements; browser layout is expensive |
| DOM size | All note elements in DOM simultaneously | 500+ note score = 2000+ SVG elements, slows querySelector and layout |
| Event extraction | Full DOM walk on every render | `getBoundingClientRect()` on hundreds of elements triggers forced reflow |
| Y position calculation | `getBoundingClientRect()` per g.system | Accurate but expensive; recalculated on every svgString change |
| Camera | Reads event.y directly | Fast (just reads cached value), no problem |
| Animation | querySelector by note ID | Fast for individual notes, but ALL notes must be in DOM |

### Current Data Flow (Single SVG)

```
xml + containerWidth + scale
       |
       v
useVerovio: toolkit.renderToSVG(1) --> svgString (ENTIRE score)
       |
       v
dangerouslySetInnerHTML --> FULL SVG in DOM
       |
       v
getEventsFromVerovio(toolkit, container)
  - toolkit.renderToTimemap() --> timing data
  - querySelectorAll('g.system') --> system Y positions
  - querySelector per noteId --> note-to-system mapping
       |
       v
MusicalEventWithY[] (with absolute Y in single SVG coordinate space)
       |
       v
interpolateTimestamps(events, anchors) --> InterpolatedEvent[]
       |
       v
animateSync / setTimestamp:
  - Find event at currentTime
  - event.y --> camera translateY
  - event.svgIds --> querySelector --> animate noteheads
```

---

## Recommended Architecture (Paginated + Cached + Virtual)

### System Overview

```
                          +-----------------------+
                          |     useVerovio.ts      |
                          |  (MODIFIED: paginated) |
                          |                        |
                          |  renderToSVG(1..N)     |
                          |  returns svgPages[]    |
                          |  + pageCount           |
                          +-----------+-----------+
                                      |
                    +-----------------+-----------------+
                    |                                   |
           +--------v--------+               +---------v---------+
           | EventCache (NEW)|               | PageManager (NEW) |
           |                 |               |                   |
           | Extracted once  |               | Tracks which      |
           | from timemap +  |               | pages mounted     |
           | DOM measurement |               | in DOM            |
           | per page.       |               | Uses Intersection |
           | Persists across |               | Observer          |
           | re-renders.     |               +--------+----------+
           +--------+--------+                        |
                    |                                  |
                    +----------------+-----------------+
                                     |
                          +----------v----------+
                          | RegularRenderer.tsx  |
                          |  (MODIFIED)          |
                          |                      |
                          |  Renders only        |
                          |  mounted pages       |
                          |  Uses cached events  |
                          |  Camera: page-aware  |
                          |  Animation: ensures  |
                          |  target page mounted |
                          +---------------------+
```

### Component Responsibilities

| Component | Responsibility | Status |
|-----------|---------------|--------|
| `useVerovio.ts` | Render score into N pages instead of 1; return `svgPages: string[]` and `pageCount` | MODIFIED |
| `EventCache` (new module) | Extract events once per score load, cache with page-relative and absolute Y positions | NEW |
| `PageManager` / virtual scroll logic | Track viewport, mount/unmount page SVGs via IntersectionObserver | NEW |
| `RegularRenderer.tsx` | Render page containers, coordinate camera with page offsets, ensure animation targets are mounted | MODIFIED |
| `getEvents.ts` | Split event extraction into per-page extraction + merge; use SVG attributes for Y when DOM unavailable | MODIFIED |
| `noteAnimation.ts` | No change -- still queries by element ID within mounted DOM | UNCHANGED |
| `animationController.ts` | Must ensure target page is mounted before querySelector; add page-awareness | MODIFIED |
| `interpolation.ts` | No change -- operates on MusicalEvent[] interface | UNCHANGED |
| `SyncEditor.tsx` | All pages always mounted (no virtual scroll needed -- user clicks on notes) | MINIMAL CHANGE |

---

## Architectural Patterns

### Pattern 1: Paginated Rendering via Verovio Native API

**What:** Instead of `pageHeight: 60000` producing one giant SVG, use normal pagination (`pageHeight: default or calculated`) and render each page separately with `renderToSVG(pageNum)`.

**Why this matters:** Verovio's `renderToSVG(pageNum)` is the designed API. The current "single tall page" approach forces Verovio to produce one enormous SVG string, which the browser must parse and layout as a single document. Paginated output produces smaller, independent SVGs that can be inserted and removed from the DOM independently.

**Verovio API (verified from official docs):**
- `toolkit.getPageCount()` -- returns number of pages after layout
- `toolkit.renderToSVG(pageNo)` -- renders specific page (1-indexed)
- `pageHeight` option: integer, default 2970, range 100-60000
- `adjustPageHeight: true` -- shrinks each page to content height (important: each page can have different height)
- `breaks: 'auto'` -- Verovio decides system breaks per page

**Trade-offs:**
- Pro: Smaller SVGs per page, faster parse/layout, enables virtual scrolling
- Pro: Each page is an independent SVG document -- mounting/unmounting is clean
- Con: Camera Y positions become page-relative, need absolute offset calculation
- Con: Events spanning page boundaries need careful handling (rare but possible with tied notes)
- Con: Must render all pages at load time to build event cache (but can do this lazily for display)

**Confidence:** HIGH -- `renderToSVG(pageNum)` and `getPageCount()` are core Verovio API methods, documented at book.verovio.org.

**Implementation in useVerovio:**

```typescript
// CURRENT: single page
toolkit.setOptions({ pageHeight: 60000, adjustPageHeight: true });
const svg = toolkit.renderToSVG(1);

// NEW: paginated
toolkit.setOptions({
  pageHeight: calculatedPageHeight,  // e.g., viewport height or standard page
  adjustPageHeight: true,            // shrink each page to content
  // pageWidth, scale, etc. remain same
});
const pageCount = toolkit.getPageCount();
const svgPages: string[] = [];
for (let i = 1; i <= pageCount; i++) {
  svgPages.push(toolkit.renderToSVG(i));
}
```

### Pattern 2: Event Cache with Page Mapping

**What:** Extract all events once when the score loads (from `renderToTimemap()`), then measure DOM positions per-page as pages mount. Cache both timing data and position data separately.

**Why this matters:** Currently, `getEventsFromVerovio()` is called every time `svgString` changes. It walks the entire DOM, calling `getBoundingClientRect()` on every `g.system` element. With virtual scrolling, not all pages are mounted, so DOM positions cannot be extracted for unmounted pages. The solution is to split event extraction into two phases:

1. **Timing extraction (no DOM needed):** `toolkit.renderToTimemap()` returns all events with timing data and note IDs. This can be done immediately after `loadData()` + `renderToMIDI()`.

2. **Position extraction (needs DOM):** When a page mounts, measure `g.system` Y positions within that page. Cache these with page offsets for absolute positioning.

**Data structure:**

```typescript
interface PageInfo {
  pageNum: number;         // 1-indexed Verovio page number
  svgString: string;       // rendered SVG for this page
  heightPx: number;        // measured height after mount (from adjustPageHeight)
  offsetY: number;         // cumulative Y offset from pages above
  systemCenterYs: number[]; // center Y of each g.system, relative to page top
  isMeasured: boolean;     // has this page been mounted and measured?
}

interface EventCache {
  events: MusicalEventWithPage[];  // all events with page assignment
  pages: PageInfo[];                // per-page metadata
  totalHeight: number;              // sum of all page heights
}

interface MusicalEventWithPage extends MusicalEventWithY {
  pageNum: number;    // which page this event lives on
  pageLocalY: number; // Y position within the page's SVG
  // y: number -- absolute Y (pageLocalY + page.offsetY)
}
```

**Trade-offs:**
- Pro: Event timing data available immediately (no DOM needed)
- Pro: Position data cached per page, survives mount/unmount cycles
- Con: Initial measurement requires mounting each page at least once
- Con: Must invalidate cache on scale/width change (triggers full re-layout)
- Mitigation: For initial load, measure pages sequentially (mount, measure, unmount, next). Or use Verovio SVG `viewBox` height as proxy for page height.

**Key insight -- SVG viewBox as height proxy:** Each page SVG from Verovio with `svgViewBox: true` has a `viewBox="0 0 W H"` attribute. The H value gives the page height in SVG units. With known scale, this can be converted to pixel height WITHOUT mounting the SVG in DOM. This eliminates the need to mount every page just to measure heights.

```typescript
function getPageHeightFromSvg(svgString: string): number {
  // Parse viewBox from SVG string (fast regex, no DOM needed)
  const match = svgString.match(/viewBox="0\s+0\s+([\d.]+)\s+([\d.]+)"/);
  if (!match) return 0;
  return parseFloat(match[2]); // height in SVG units
}
```

**Confidence:** HIGH for timing extraction (renderToTimemap is verified). MEDIUM for viewBox height proxy (needs validation that viewBox dimensions match rendered pixel height at given scale).

### Pattern 3: Virtual Scrolling with IntersectionObserver

**What:** Mount only the pages visible in the viewport (plus a buffer of 1-2 pages above and below). Use IntersectionObserver to detect which pages enter/leave the viewport. Replace unmounted pages with empty placeholder divs of known height.

**Why this pattern:** The browser IntersectionObserver API is the standard approach for viewport-aware lazy rendering. It runs off the main thread, does not trigger layout, and is supported in all modern browsers. For this use case, each "item" in the virtual list is a page SVG.

**Why NOT react-window/react-virtualized:** Those libraries are designed for uniform-height rows in long lists. Our pages have variable heights (each page's system count varies). IntersectionObserver is simpler and more appropriate for a small number of large items (typically 2-10 pages, not thousands of rows).

**Implementation pattern:**

```typescript
// Each page container: either renders SVG or shows placeholder
function PageSlot({ pageInfo, isVisible }: { pageInfo: PageInfo; isVisible: boolean }) {
  const ref = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={ref}
      style={{ height: pageInfo.heightPx, width: '100%' }}
      data-page={pageInfo.pageNum}
    >
      {isVisible ? (
        <div dangerouslySetInnerHTML={{ __html: pageInfo.svgString }} />
      ) : null}
    </div>
  );
}
```

**Camera integration:** The camera currently uses `translateY(-cameraY)` on a wrapper div. With pages, cameraY is computed as `event.pageLocalY + event.page.offsetY`. The camera wrapper still contains all page slots (visible or placeholder), so translateY works the same way -- the total scrollable height equals the sum of all page heights.

**Trade-offs:**
- Pro: DOM node count is bounded (only 2-4 pages mounted at any time)
- Pro: Large scores feel as responsive as small ones
- Pro: Page mounting/unmounting is handled by React reconciler (no manual DOM manipulation)
- Con: Animation on an unmounted page requires ensuring the page is mounted first
- Con: IntersectionObserver callbacks are asynchronous -- not suitable for synchronous Puppeteer captures
- Mitigation: Puppeteer mode disables virtual scrolling (mounts all pages) OR explicitly mounts the needed page before capture

**Confidence:** HIGH for IntersectionObserver pattern (MDN-documented, widely used). MEDIUM for integration with camera and Puppeteer (needs validation).

---

## Integration Points: Detailed Analysis

### Integration 1: Camera System

**Current behavior:**
- Camera reads `event.y` (absolute Y in single SVG) and calls `applyCamera(targetY)`
- `applyCamera` computes `cameraY = targetY - viewportHeight/2`, clamps to valid range
- Applies `cameraRef.current.style.transform = translateY(-cameraY)`
- `scoreHeight` is `osmdRef.current.scrollHeight` (total SVG height)

**With pagination:**
- `event.y` must become absolute Y across all pages: `event.pageLocalY + pages[event.pageNum].offsetY`
- `scoreHeight` becomes sum of all page heights: `eventCache.totalHeight`
- `applyCamera()` logic is structurally unchanged -- just different Y source
- The camera wrapper div still contains all page slots, so the total height is correct

**Required changes:**
1. `MusicalEventWithY.y` must store absolute Y (page offset + local Y)
2. `scoreHeight` calculation uses `eventCache.totalHeight` instead of `scrollHeight`
3. No change to `applyCamera()` function itself

**Risk:** LOW. The camera does not care about page boundaries -- it just needs an absolute Y value and a total height.

### Integration 2: Event Extraction (getEventsFromVerovio)

**Current behavior:**
- Called after SVG mount with `(toolkit, svgContainer)` args
- `toolkit.renderToTimemap()` returns all timing entries
- For each event: `svgContainer.querySelector('#noteId').closest('g.system')` gives system
- `g.system.getBoundingClientRect()` gives Y relative to container

**With pagination:**
- Timing extraction (timemap) is unchanged -- toolkit has all timing data regardless of pagination
- Position extraction splits into per-page work
- Each page has its own set of `g.system` elements
- When a page mounts, measure its systems and update the cache
- Events on unmounted pages: use cached positions (or estimated from viewBox height)

**Required changes:**

```typescript
// Phase 1: Extract timing (no DOM needed, do once at load)
function extractTimingEvents(toolkit: VerovioToolkit): TimingEvent[] {
  const timemap = toolkit.renderToTimemap();
  return timemap
    .filter(entry => entry.on?.length)
    .map((entry, i) => ({
      id: `evt-${i}`,
      beatOnset: entry.qstamp / 4,
      beatDuration: 0,
      svgIds: entry.on!,
      pageNum: 0,    // assigned in Phase 2
    }));
}

// Phase 2: Assign events to pages and measure positions
function assignPagePositions(
  events: TimingEvent[],
  toolkit: VerovioToolkit,
  pages: PageInfo[]
): MusicalEventWithPage[] {
  // Use toolkit.getElementsAtTime(ms) which returns { page, notes[] }
  // to determine which page each event belongs to.
  // OR: use the note IDs and check which page's SVG contains the ID.
}
```

**Key API for page assignment:** `toolkit.getElementsAtTime(millisec)` returns a JSON object with `page` field indicating which page the element appears on. This is the reliable way to map events to pages without DOM access.

**Risk:** MEDIUM. The `getElementsAtTime` return format needs validation. If it does not include page number, fallback is to search each page's SVG string for the note ID (substring match on the SVG string).

### Integration 3: Notehead Animation

**Current behavior:**
- `animateNoteheads(root, svgIds, options)` calls `root.querySelector('#noteId')`
- If element not found, silently skips (no error)
- `resetNoteheadAnimations(root)` resets ALL noteheads in root

**With pagination:**
- Animation only works on mounted pages (element must be in DOM)
- For real-time playback (animateSync): the camera is already pointing at the current event's page, so that page must be visible and mounted
- Virtual scrolling ensures visible pages are mounted -- so current-event page is always mounted when the camera points to it
- Puppeteer frame capture: must explicitly ensure the target page is mounted

**Required changes:**
- `animateNoteheads` root parameter should be the specific page container, not the entire score container (narrower querySelector scope)
- `resetNoteheadAnimations` should operate on currently mounted pages only
- OR: keep the current pattern (query from score root) -- querySelector will find elements on any mounted page, and skip elements on unmounted pages (current silent-skip behavior)

**Risk:** LOW. The existing silent-skip behavior (`if (!stavenote) return`) already handles the case where an element is not in DOM. During playback, the current page is always mounted because the camera points there.

### Integration 4: Puppeteer Frame Capture

**Current behavior:**
- `window.animationController.setTimestamp(seconds)` is synchronous
- Finds event at timestamp, applies camera + animation, forces reflow
- Puppeteer takes screenshot immediately after setTimestamp returns

**With pagination + virtual scrolling:**
- setTimestamp must ensure the target event's page is mounted in DOM
- Virtual scrolling (IntersectionObserver) is async -- cannot wait for it in synchronous setTimestamp
- Two options:

**Option A: Disable virtual scrolling in render mode (RECOMMENDED)**
- When `?render=true` URL param is detected, mount ALL pages
- DOM is larger but Puppeteer captures are frame-accurate
- Simple, no async coordination needed
- The current render mode already sets up specific viewport and scale

**Option B: Synchronous page mounting in setTimestamp**
- Before animating, check if target page is mounted
- If not, force-mount it synchronously (update React state, flush)
- Complex, fragile, React does not guarantee synchronous re-render

**Recommendation: Option A.** Render mode is already a special case in the code. Puppeteer sessions render one video at a time, so DOM size is not a concern. Virtual scrolling is a preview-mode optimization.

**Required changes:**
- Add `isRenderMode` check to virtual scrolling logic
- If render mode: mount all pages, skip IntersectionObserver
- setTimestamp logic unchanged (all elements in DOM)

**Risk:** LOW with Option A. The render mode flag already exists and is checked in RegularRenderer.

### Integration 5: SyncEditor

**Current behavior:**
- Renders full score SVG (no virtual scrolling needed -- user scrolls manually)
- Click-to-select notes requires all notes in DOM
- All events visible in event list

**With pagination:**
- SyncEditor should render ALL pages (no virtual scrolling)
- SyncEditor does not have camera animation or Puppeteer concerns
- Could benefit from paginated rendering for DOM performance, but virtual scrolling would break click-to-select on off-screen notes

**Required changes:**
- Switch to paginated SVGs (for consistency and reduced parse cost)
- No virtual scrolling -- mount all page SVGs
- Event extraction uses same EventCache

**Risk:** LOW. SyncEditor is simpler than RegularRenderer.

---

## Data Flow (Paginated Architecture)

```
xml + containerWidth + scale
       |
       v
useVerovio (MODIFIED):
  toolkit.setOptions({ pageHeight: calculated, adjustPageHeight: true })
  toolkit.loadData(xml)
  toolkit.renderToMIDI()
  pageCount = toolkit.getPageCount()
  svgPages = [toolkit.renderToSVG(1), ..., toolkit.renderToSVG(N)]
       |
       v
EventCache (NEW):
  Step 1 - Timing (no DOM):
    timemap = toolkit.renderToTimemap()
    events[] = timemap entries with timing + svgIds
    Page assignment via getElementsAtTime or SVG string search

  Step 2 - Page heights (no DOM needed with viewBox):
    For each page: parse viewBox from SVG string
    Compute cumulative offsetY per page
    Compute absolute Y per event: pageLocalY + page.offsetY

  Step 3 - System positions (needs DOM, lazy):
    When page mounts: querySelectorAll('g.system')
    Measure system center Y, update event Y positions
    Cache result; skip measurement on subsequent mounts
       |
       v
RegularRenderer (MODIFIED):
  Page slots:
    [PageSlot(page1)] [PageSlot(page2)] ... [PageSlot(pageN)]
    Each slot: { height: page.heightPx, content: mounted ? SVG : null }

  Virtual scrolling (preview mode only):
    IntersectionObserver on each PageSlot
    Mount pages within viewport + 1 page buffer
    Unmount pages far from viewport

  Camera:
    event.y = absolute Y (unchanged interface)
    translateY(-cameraY) on wrapper (unchanged logic)

  Animation:
    querySelector within mounted page DOM
    Skips unmounted pages silently (existing behavior)

  Puppeteer (render mode):
    All pages mounted (no virtual scrolling)
    setTimestamp works exactly as before
```

---

## New Components Needed

### 1. EventCache Module

**Location:** `src/lib/eventCache.ts`
**Purpose:** Extract and cache event timing + position data, keyed by score identity (xml hash or toolkit instance).

```typescript
export interface EventCache {
  events: MusicalEventWithPage[];
  pages: PageInfo[];
  totalHeight: number;
}

export function buildEventCache(
  toolkit: VerovioToolkit,
  svgPages: string[],
  scale: number
): EventCache;

export function updatePageMeasurements(
  cache: EventCache,
  pageNum: number,
  container: HTMLElement
): void;
```

### 2. Page Height Calculator

**Location:** `src/lib/pageMetrics.ts` (or inline in eventCache)
**Purpose:** Extract page dimensions from SVG viewBox without DOM mounting.

### 3. Virtual Scroll Hook

**Location:** `src/hooks/useVirtualPages.ts`
**Purpose:** IntersectionObserver-based page visibility tracking.

```typescript
export function useVirtualPages(
  pageCount: number,
  pageHeights: number[],
  containerRef: RefObject<HTMLDivElement>,
  options?: { buffer?: number; disabled?: boolean }
): {
  visiblePages: Set<number>;  // currently mounted page numbers
  pageRefs: RefObject<HTMLDivElement>[];  // refs for observer targets
};
```

---

## Modified Components

### useVerovio.ts

**Changes:**
- Remove `pageHeight: 60000` single-page mode
- Add `pageHeight` calculation based on container/viewport
- Return `svgPages: string[]` and `pageCount` instead of single `svgString`
- Return continues to include `toolkit` for event extraction

**Interface change:**
```typescript
// CURRENT
interface UseVerovioResult {
  svgString: string | null;
  toolkit: VerovioToolkit | null;
  isLoading: boolean;
  error: string | null;
}

// NEW
interface UseVerovioResult {
  svgPages: string[];           // per-page SVG strings
  pageCount: number;
  toolkit: VerovioToolkit | null;
  isLoading: boolean;
  error: string | null;
}
```

### RegularRenderer.tsx

**Changes:**
- Replace single `<div dangerouslySetInnerHTML>` with N page slot components
- Add IntersectionObserver for virtual scrolling (preview mode)
- Disable virtual scrolling in render mode (mount all pages)
- Camera logic: use absolute Y from EventCache instead of single-SVG Y
- Event extraction: use EventCache instead of calling getEventsFromVerovio on every render
- Animation: scoped to page container or full container (both work with existing silent-skip)

### getEvents.ts (getEventsFromVerovio)

**Changes:**
- Split into `extractTimingEvents(toolkit)` (no DOM) and `measurePagePositions(pageNum, container)` (with DOM)
- Timing extraction uses `renderToTimemap()` once
- Position extraction called per-page when mounted
- Returns `MusicalEventWithPage[]` with page assignment

### animationController.ts

**Changes:**
- Minor: may want to accept page container ref instead of full score container
- Or: no change needed if querySelector is scoped to the overall wrapper (which contains all mounted pages)

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Re-rendering All Pages on Scale Change

**What people do:** Call `renderToSVG(n)` for all N pages synchronously when user changes zoom.
**Why it is wrong:** If score has 10 pages, this is 10 sequential Verovio render calls, blocking the main thread.
**Do this instead:** Re-render only the currently visible pages. Update other pages lazily when they enter the viewport. Or: defer the full re-render to requestIdleCallback.

### Anti-Pattern 2: Mounting All Pages to Measure Heights

**What people do:** Insert all SVG pages into the DOM just to call `getBoundingClientRect()` and get heights.
**Why it is wrong:** Defeats the purpose of virtual scrolling. Large DOM even temporarily causes layout cost.
**Do this instead:** Parse `viewBox` attribute from SVG string to get height. This is a string operation, no DOM needed. Formula: `heightPx = viewBoxHeight * (scale / 100)` if `svgViewBox: true` (which it is in current config).

### Anti-Pattern 3: Async Page Mounting for Puppeteer

**What people do:** Make `setTimestamp()` async to wait for React to mount a page before capturing.
**Why it is wrong:** Puppeteer's frame capture protocol expects synchronous state updates. Introducing async breaks the frame-accurate capture pipeline.
**Do this instead:** In render mode, mount all pages upfront. Virtual scrolling is a preview-mode optimization only.

### Anti-Pattern 4: Using a Virtual Scroll Library (react-window, etc.)

**What people do:** Use react-window or react-virtualized for page virtualization.
**Why it is wrong:** These libraries are designed for thousands of uniform-height rows. Music scores have 2-10 pages with variable heights. The overhead and API complexity of these libraries is unnecessary.
**Do this instead:** Simple IntersectionObserver hook with explicit height placeholders. Under 50 lines of code, zero dependencies.

### Anti-Pattern 5: Invalidating Event Cache on Every Render

**What people do:** Re-extract all events whenever any SVG page re-renders.
**Why it is wrong:** Timing data does not change unless the score XML or layout options change. Position data only changes if scale/width changes.
**Do this instead:** Cache events keyed by `(xml, pageWidth, scale)`. Invalidate only when these inputs change.

---

## Suggested Build Order

Based on dependency analysis and integration complexity:

### Step 1: Paginated Rendering (Foundation)

**What changes:**
- `useVerovio.ts`: switch from single-page to multi-page rendering
- `RegularRenderer.tsx`: render N page divs instead of one
- No virtual scrolling yet -- mount all pages

**Why first:**
- All subsequent work depends on having per-page SVGs
- Can be validated visually (does the score still look correct?)
- Camera and animation continue to work (all pages mounted)
- Lowest risk: if pagination breaks something, easy to revert to single-page

**Validates:**
- Verovio page breaks look correct
- Multiple SVGs stack visually like the single SVG
- Camera Y positions still work (after offset calculation)

**Dependencies:** None (builds on existing architecture)

### Step 2: Event Cache (Decouple from DOM)

**What changes:**
- `eventCache.ts`: new module for timing extraction + caching
- `getEvents.ts`: refactor into timing-only and position-measurement functions
- `RegularRenderer.tsx`: use EventCache instead of calling getEventsFromVerovio per render

**Why second:**
- Virtual scrolling requires events to exist for unmounted pages
- Cache eliminates the "must mount all pages to get events" problem
- Improves performance even without virtual scrolling (no redundant extraction)

**Validates:**
- Events match previous getEventsFromVerovio output
- Interpolation still works correctly
- Animation still targets correct notes

**Dependencies:** Step 1 (needs per-page SVGs to assign events to pages)

### Step 3: Virtual Scrolling (Performance)

**What changes:**
- `useVirtualPages.ts`: new hook with IntersectionObserver
- `RegularRenderer.tsx`: conditional page mounting based on visibility
- Render mode bypass: mount all pages when `?render=true`

**Why third:**
- Pure performance optimization, not correctness change
- Requires Steps 1 and 2 (paginated rendering + cached events)
- Can be disabled easily (just set all pages visible) if issues arise

**Validates:**
- Score looks and behaves identically in preview mode
- Camera scrolling triggers page mounting correctly
- Puppeteer frame capture still works (render mode mounts all)
- Animation on boundary pages works when page becomes visible

**Dependencies:** Steps 1 and 2

---

## Scaling Considerations

| Score Length | Pages | Current Approach | Paginated + Virtual |
|-------------|-------|-----------------|---------------------|
| 1-2 systems (lead sheet) | 1 | Fine | Same (1 page, no virtualization) |
| 3-8 systems | 1-2 | Fine | Minimal improvement |
| 10-30 systems | 2-5 | Noticeable SVG parse time | 3-4x smaller per-page SVGs |
| 50+ systems | 5-10+ | Sluggish, high memory | Only 2-4 pages in DOM at a time |
| 100+ systems (orchestral) | 10-20+ | Likely unusable | Bounded DOM size, smooth scroll |

### First Bottleneck: SVG Parse Time

Large single-SVG scores cause noticeable delay when React inserts the innerHTML. With pagination, each page SVG is much smaller. Even without virtual scrolling, inserting 10 small SVGs is faster than 1 huge SVG because the browser can layout each independently.

### Second Bottleneck: DOM Node Count

After parsing, too many SVG elements slow down querySelector, style recalculation, and forced reflow. Virtual scrolling bounds this to ~2-4 pages worth of elements regardless of score length.

---

## Sources

### Primary (HIGH confidence)
- [Verovio Toolkit Methods](https://book.verovio.org/toolkit-reference/toolkit-methods.html) -- `renderToSVG(pageNum)`, `getPageCount()`, `getElementsAtTime()`, `renderToTimemap()`
- [Verovio Toolkit Options](https://book.verovio.org/toolkit-reference/toolkit-options.html) -- `pageHeight`, `adjustPageHeight`, `svgViewBox`, `breaks`
- [Verovio Controlling SVG Output](https://book.verovio.org/advanced-topics/controlling-the-svg-output.html) -- scale, page dimensions, SVG viewBox behavior
- [MDN Intersection Observer API](https://developer.mozilla.org/en-US/docs/Web/API/Intersection_Observer_API) -- viewport detection, performance characteristics
- Existing codebase analysis: RegularRenderer.tsx, useVerovio.ts, getEvents.ts, noteAnimation.ts, animationController.ts, SyncEditor.tsx, verovioService.ts, interpolation.ts (all files read and analyzed)

### Secondary (MEDIUM confidence)
- [Verovio Basic Rendering](https://book.verovio.org/first-steps/basic-rendering.html) -- page rendering fundamentals
- [IntersectionObserver virtual scrolling patterns](https://gusruss89.medium.com/super-simple-list-virtualization-in-react-with-intersectionobserver-ca340fe98a34) -- React IntersectionObserver implementation patterns

---
*Architecture research for: Efficiency features integration in Manuscript renderer*
*Researched: 2026-02-04*
