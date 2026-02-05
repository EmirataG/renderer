# Phase 10: Single-Line Verovio Hook - Research

**Researched:** 2026-02-05
**Domain:** Verovio horizontal rendering with section-based measure selection
**Confidence:** HIGH

## Summary

This phase implements a `useSingleLineVerovio` hook that renders MusicXML as horizontal single-line sections using Verovio's `breaks: 'none'` configuration and `select({ measureRange })` API. The hook divides long scores into 10-20 measure sections, rendering each as an independent SVG with extractable width dimensions.

The Verovio API for this is well-documented and verified:
- `breaks: 'none'` forces single horizontal system with no line wrapping
- `select({ measureRange: "1-10" })` limits rendering to specific measures
- `redoLayout()` must be called after every `select()` before rendering
- Section widths are extracted from SVG viewBox dimensions

The existing `useVerovio.ts` hook provides a solid reference implementation for the vertical case. The new hook follows the same patterns but returns sections (horizontal) instead of pages (vertical).

**Primary recommendation:** Create `useSingleLineVerovio.ts` hook that renders score as array of section SVGs with computed widths and offsets for horizontal layout.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| verovio | ^6.0.1 | Music notation rendering | Already installed, provides all required APIs |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| React | existing | Hook state management | Standard React hooks pattern |
| TypeScript | existing | Type safety | Type augments for `select()` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Section-based | Full-score SVG | Memory explosion on long scores |
| `select()` API | Manual MEI slicing | Far more complex, error-prone |

**Installation:**
No new dependencies required.

## Architecture Patterns

### Recommended Hook Interface

```typescript
export interface UseSingleLineVerovioResult {
  sections: string[];           // Array of SVG strings, one per section
  sectionWidths: number[];      // Width of each section in pixels
  sectionOffsets: number[];     // Cumulative X offset for each section
  totalWidth: number;           // Total score width (sum of all section widths)
  sectionCount: number;         // Number of sections
  measureCount: number;         // Total measures in score
  toolkit: VerovioToolkit | null;
  isLoading: boolean;
  error: string | null;
}
```

### Section Rendering Workflow

```typescript
// 1. Configure for horizontal layout
toolkit.setOptions({
  breaks: 'none',           // Single horizontal system
  pageWidth: 100000,        // Large width to prevent wrapping
  pageHeight: 100,          // Minimal height (adjustPageHeight will expand)
  adjustPageHeight: true,   // Shrink to content height
  pageMarginTop: 0,
  pageMarginBottom: 0,
  pageMarginLeft: 0,
  pageMarginRight: 0,
  scale: scale,
  svgViewBox: true,
  svgRemoveXlink: true,
  header: 'none',
  footer: 'none',
});

// 2. Load score and get measure count
toolkit.loadData(xml);
toolkit.renderToMIDI(); // Required for timing queries

// 3. Get measure count from timemap
const timemap = toolkit.renderToTimemap({ includeMeasures: true });
const measureCount = /* count unique measures from timemap */;

// 4. Render each section
const sections: string[] = [];
const MEASURES_PER_SECTION = 15; // Configurable, 10-20 range

for (let start = 1; start <= measureCount; start += MEASURES_PER_SECTION) {
  const end = Math.min(start + MEASURES_PER_SECTION - 1, measureCount);

  toolkit.select({ measureRange: `${start}-${end}` });
  toolkit.redoLayout();

  const svg = toolkit.renderToSVG(1); // Always page 1 after select
  sections.push(svg);
}

// 5. Clear selection for future operations
toolkit.select({});
toolkit.redoLayout();
```

### Width Extraction Pattern

```typescript
function extractSectionWidth(svgString: string): number {
  // Primary: width attribute
  const widthMatch = svgString.match(/width="(\d+(?:\.\d+)?)px"/);
  if (widthMatch) return parseFloat(widthMatch[1]);

  // Fallback: viewBox third value (0 0 WIDTH HEIGHT)
  const vbMatch = svgString.match(/viewBox="0 0 ([\d.]+) [\d.]+"/);
  if (vbMatch) return parseFloat(vbMatch[1]);

  return 0;
}
```

### Computing Offsets

```typescript
const widths = sections.map(extractSectionWidth);
const offsets: number[] = [];
let cumulative = 0;
for (const w of widths) {
  offsets.push(cumulative);
  cumulative += w;
}
// totalWidth = cumulative
```

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Measure counting | XML parsing | `renderToTimemap({ includeMeasures: true })` | Verovio already tracks measures |
| Section selection | MEI manipulation | `select({ measureRange })` | Built-in, handles edge cases |
| Layout recalc | Manual positioning | `redoLayout()` | Required by Verovio, optimized |
| Width extraction | DOM measurement | viewBox parsing | Works pre-mount, synchronous |

**Key insight:** Verovio's `select()` API was designed exactly for this use case. It handles all the complexity of measure boundaries, grace notes spanning measures, and layout adjustments.

## Common Pitfalls

### Pitfall 1: Forgetting redoLayout() After select()

**What goes wrong:** SVG renders full score instead of selected measures
**Why it happens:** `select()` only marks the selection; layout must be recalculated
**How to avoid:** Always call `redoLayout()` between `select()` and `renderToSVG()`
**Warning signs:** Section count is wrong, sections have full score width

### Pitfall 2: Large pageWidth Causing Browser Issues

**What goes wrong:** Very wide SVGs cause rendering glitches or memory issues
**Why it happens:** Browsers have viewport limits (~32767px in some cases)
**How to avoid:** Section-based rendering keeps each SVG under 10000px wide
**Warning signs:** SVG clipping, missing content at right edge

### Pitfall 3: Not Clearing Selection After Rendering

**What goes wrong:** Future toolkit operations render partial score
**Why it happens:** Selection persists until explicitly cleared
**How to avoid:** Call `toolkit.select({})` and `redoLayout()` after section loop
**Warning signs:** Subsequent SyncEditor or event extraction returns partial data

### Pitfall 4: measureRange Off-by-One

**What goes wrong:** Missing first or last measure in sections
**Why it happens:** measureRange is 1-based and inclusive
**How to avoid:** Use `${start}-${end}` where both bounds are included
**Warning signs:** Notes missing at section boundaries

### Pitfall 5: Measure Count from Wrong Source

**What goes wrong:** Incorrect section boundaries, empty sections
**Why it happens:** Counting `<measure>` elements in MEI doesn't match Verovio's numbering
**How to avoid:** Use Verovio's own measure tracking via timemap
**Warning signs:** Last section is empty or has unexpected measures

## Code Examples

Verified patterns from official sources:

### Complete Hook Structure

```typescript
// Source: Pattern from existing useVerovio.ts + Verovio official docs
import { useState, useEffect, useRef } from 'react';
import { VerovioToolkit } from 'verovio/esm';
import { createToolkit } from '../lib/verovioService';

export interface UseSingleLineVerovioResult {
  sections: string[];
  sectionWidths: number[];
  sectionOffsets: number[];
  totalWidth: number;
  sectionCount: number;
  measureCount: number;
  toolkit: VerovioToolkit | null;
  isLoading: boolean;
  error: string | null;
}

const MEASURES_PER_SECTION = 15;

function extractSectionWidth(svgString: string): number {
  const widthMatch = svgString.match(/width="(\d+(?:\.\d+)?)px"/);
  if (widthMatch) return parseFloat(widthMatch[1]);
  const vbMatch = svgString.match(/viewBox="0 0 ([\d.]+) [\d.]+"/);
  if (vbMatch) return parseFloat(vbMatch[1]);
  return 0;
}

export function useSingleLineVerovio(
  xml: string,
  scale: number = 40
): UseSingleLineVerovioResult {
  // ... state declarations similar to useVerovio.ts
  // ... effect with section rendering workflow
}
```

### Verovio select() API Usage

```typescript
// Source: https://book.verovio.org/interactive-notation/content-selection.html

// Select measures 1-10
toolkit.select({ measureRange: "1-10" });
toolkit.redoLayout();
const svg = toolkit.renderToSVG(1);

// Select from measure 20 to end
toolkit.select({ measureRange: "20-end" });
toolkit.redoLayout();

// Clear selection (return to full score)
toolkit.select({});
toolkit.redoLayout();
```

### Horizontal Layout Configuration

```typescript
// Source: https://book.verovio.org/advanced-topics/layout-options.html
toolkit.setOptions({
  breaks: 'none',           // Single system, no line breaks
  pageWidth: 100000,        // Large width for horizontal extent
  pageHeight: 100,          // Minimal height
  adjustPageHeight: true,   // Shrink height to content
  pageMarginTop: 0,
  pageMarginBottom: 0,
  pageMarginLeft: 0,
  pageMarginRight: 0,
  scale: scale,
  svgViewBox: true,
});
```

## Type Definitions Needed

The current `verovio-augments.d.ts` is missing the `select()` method:

```typescript
// Add to verovio-augments.d.ts
declare module 'verovio/esm' {
  export class VerovioToolkit {
    // ... existing methods ...

    /**
     * Select a portion of the score for rendering.
     * @param selection - JSON object with measureRange or start/end
     * @returns boolean indicating success
     */
    select(selection: VerovioSelection): boolean;
  }
}

export interface VerovioSelection {
  /** Measure range like "1-10", "20-end", or "start-end" */
  measureRange?: string;
  /** Start element xml:id like "measure-L337" */
  start?: string;
  /** End element xml:id like "measure-L355" */
  end?: string;
}
```

## Getting Measure Count

Verovio does not expose a direct `getMeasureCount()` method. Options:

### Option 1: Count from Timemap (Recommended)

```typescript
// renderToTimemap can include measure info
const timemap = toolkit.renderToTimemap({ includeMeasures: true });
// Parse timemap for measure count - structure TBD based on actual output
```

### Option 2: Parse MEI

```typescript
const mei = toolkit.getMEI();
const measureMatches = mei.match(/<measure /g);
const measureCount = measureMatches ? measureMatches.length : 0;
```

### Option 3: Binary Search with select()

```typescript
// Try progressively larger ranges until rendering returns empty
let measureCount = 1;
while (true) {
  toolkit.select({ measureRange: `${measureCount}-${measureCount}` });
  toolkit.redoLayout();
  const svg = toolkit.renderToSVG(1);
  if (/* svg is empty or has no content */) break;
  measureCount++;
}
```

**Recommendation:** Start with Option 2 (parse MEI) as it's most reliable. The MEI output always contains all measures with explicit `<measure>` tags.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Full-score SVG | Section-based rendering | This phase | Enables long score support |
| Vertical pages | Horizontal sections | This phase | New rendering mode |

**Deprecated/outdated:**
- `adjustPageWidth`: Status unclear (issue #1276 shows mixed implementation status). Don't rely on it; use explicit section sizing.

## Open Questions

Things that couldn't be fully resolved:

1. **Exact timemap measure format**
   - What we know: `includeMeasures: true` option exists in `renderToTimemap()`
   - What's unclear: Exact structure of timemap entries with measures included
   - Recommendation: Test with actual score, fall back to MEI parsing if needed

2. **Section overlap for seamless staff lines**
   - What we know: 1-2 measure overlap recommended for visual continuity
   - What's unclear: Whether Verovio select() supports overlapping ranges
   - Recommendation: Render sections without overlap first; add overlap in Phase 14 (Section Virtualization) if needed

3. **Maximum section width before browser issues**
   - What we know: Browsers have limits (~32767px)
   - What's unclear: Exact safe threshold
   - Recommendation: Default to 15 measures per section; monitor during testing

## Sources

### Primary (HIGH confidence)
- [Verovio Content Selection](https://book.verovio.org/interactive-notation/content-selection.html) - `select()` API with measureRange
- [Verovio Layout Options](https://book.verovio.org/advanced-topics/layout-options.html) - `breaks: 'none'` documentation
- [Verovio Toolkit Methods](https://book.verovio.org/toolkit-reference/toolkit-methods.html) - `select()`, `redoLayout()`, `renderToSVG()` signatures
- [Verovio Toolkit Options](https://book.verovio.org/toolkit-reference/toolkit-options.html) - All layout options with defaults/ranges
- Existing codebase: `src/hooks/useVerovio.ts` - Pattern for hook structure and SVG extraction

### Secondary (MEDIUM confidence)
- [GitHub Issue #1276](https://github.com/rism-digital/verovio/issues/1276) - `adjustPageWidth` implementation status
- Verovio npm package source: `node_modules/verovio/dist/verovio.mjs` - Confirmed `select` method exists

### Tertiary (LOW confidence)
- Project SUMMARY.md - General approach recommendations (needs validation)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Verovio is already installed and APIs verified in official docs
- Architecture: HIGH - Pattern follows existing useVerovio.ts hook
- Pitfalls: HIGH - Based on documented API requirements and browser constraints

**Research date:** 2026-02-05
**Valid until:** 2026-03-05 (30 days - stable Verovio APIs)
