# Stack Research: SingleLineRenderer - Verovio Horizontal Rendering

**Domain:** Horizontal single-system score rendering with section-based output for lazy loading
**Researched:** 2026-02-05
**Confidence:** HIGH (verified via official Verovio documentation and source code inspection)

## Context

The existing RegularRenderer uses vertical paginated layout with `breaks: 'auto'` and `pageHeight: 2970`. For v1.2 SingleLineRenderer, we need:

1. **Horizontal single-line rendering** - All music on one continuous horizontal system
2. **Section-based rendering** - Render measure ranges separately for performance
3. **Lazy section loading** - Only mount visible sections in DOM

## Executive Summary

**Verovio fully supports single-line horizontal rendering** via `breaks: 'none'` option. **Section-based rendering is supported** via the `select()` method with `measureRange` parameter. No new dependencies are needed.

## Recommended Stack

### Core Configuration: No New Libraries

The existing Verovio installation (^6.0.1) provides all required APIs. This is the correct approach - Verovio has native support for both horizontal layout and measure-range selection.

### Verovio Options for SingleLineRenderer

| Option | Value | Purpose |
|--------|-------|---------|
| `breaks` | `'none'` | **Critical** - Forces all music onto single horizontal system. No system or page breaks. |
| `pageHeight` | `100` | Minimal height, used with adjustPageHeight |
| `adjustPageHeight` | `true` | Shrinks SVG height to actual content (one system height) |
| `pageWidth` | Large value (e.g., 100000) | Accommodate full score width; SVG will shrink if adjustPageWidth not used |
| `svgViewBox` | `true` | Enables responsive scaling |
| `pageMarginTop` | `0` | Remove margins for clean horizontal layout |
| `pageMarginBottom` | `0` | Remove margins for clean horizontal layout |
| `scale` | Same as RegularRenderer | Maintain consistent notation size |

### Key Verovio APIs for Section Rendering

| Method | Signature | Purpose | Confidence |
|--------|-----------|---------|------------|
| `select()` | `(selection: {measureRange: string}) => boolean` | Select measure range for rendering. Format: `"1-10"`, `"start-20"`, `"15-end"` | HIGH - verified in Verovio source |
| `redoLayout()` | `() => void` | Re-layout after selection change. **Required** after `select()` | HIGH - documented requirement |
| `renderToSVG()` | `(pageNo?: number) => string` | Renders selected portion after `select()` + `redoLayout()` | HIGH - verified |
| `getPageCount()` | `() => number` | Returns page count (will be 1 for sections with `breaks: 'none'`) | HIGH - verified |

**Source:** [Score content selection - Verovio Reference Book](https://book.verovio.org/interactive-notation/content-selection.html)

## Feature 1: Horizontal Single-Line Rendering

### How `breaks: 'none'` Works

Setting `breaks: 'none'` forces Verovio to render all music on a single horizontal system with no line wraps:

```typescript
toolkit.setOptions({
  breaks: 'none',           // No system/page breaks - one continuous line
  pageHeight: 100,          // Minimal, will expand to fit one system
  adjustPageHeight: true,   // Shrink to actual content height
  pageWidth: 100000,        // Large width to fit entire score
  svgViewBox: true,
  pageMarginTop: 0,
  pageMarginBottom: 0,
  scale: 40,               // Match existing RegularRenderer scale
  header: 'none',
  footer: 'none',
});

toolkit.loadData(xml);
const svg = toolkit.renderToSVG(1);  // Single page, entire score horizontally
```

**Warning from official docs:** "Be aware that this can produce very large files, regarding both the dimension of the SVG image and the actual file size."

This warning is why section-based rendering is essential for performance.

**Confidence:** HIGH - `breaks: 'none'` behavior is documented at [Layout options - Verovio Reference Book](https://book.verovio.org/advanced-topics/layout-options.html)

### SVG Output Characteristics

With `breaks: 'none'` + `adjustPageHeight: true`:

| Attribute | Behavior |
|-----------|----------|
| SVG width | Expands to fit all measures horizontally |
| SVG height | Shrinks to single-system height (staff height + margins) |
| viewBox | Reflects actual content dimensions |
| Coordinate system | Left-to-right horizontal, element IDs preserved |

**Note on adjustPageWidth:** The `adjustPageWidth` option (to shrink width to content) is **not implemented** in Verovio as of v6.0.1. The SVG width will be the full `pageWidth` value. Workaround: either use a very large `pageWidth` or post-process the SVG viewBox.

**Source:** [GitHub Issue #1276](https://github.com/rism-digital/verovio/issues/1276) - adjustPageWidth not yet implemented

## Feature 2: Section-Based Rendering via `select()`

### The `select()` Method

Verovio's `select()` method enables rendering only a specific measure range. This is the key API for section-based lazy loading.

```typescript
// Select measures 1-10
toolkit.select({ measureRange: '1-10' });
toolkit.redoLayout();  // REQUIRED after selection
const sectionSvg = toolkit.renderToSVG(1);

// Select measures 11-20
toolkit.select({ measureRange: '11-20' });
toolkit.redoLayout();
const section2Svg = toolkit.renderToSVG(1);

// Clear selection (render full score again)
toolkit.select({});
toolkit.redoLayout();
```

**measureRange syntax:**
- `"1-10"` - Measures 1 through 10 (1-indexed by position, not measure number)
- `"start-10"` - Beginning through measure 10
- `"15-end"` - Measure 15 through end
- `"5"` - Just measure 5

**Critical:** `redoLayout()` must be called after `select()` before rendering.

**Confidence:** HIGH - verified via:
- [Score content selection documentation](https://book.verovio.org/interactive-notation/content-selection.html)
- Verovio source code inspection (confirmed `select` method exists in `verovio.mjs`)
- [GitHub Issue #1304](https://github.com/rism-digital/verovio/issues/1304) confirming implementation

### Section Rendering Strategy

For a score with N measures, divide into sections of M measures each:

```typescript
interface Section {
  measureStart: number;  // 1-indexed
  measureEnd: number;    // 1-indexed
  svg: string | null;    // Rendered SVG or null if not yet rendered
  width: number;         // SVG width in pixels (from viewBox)
  offsetX: number;       // Cumulative X offset from previous sections
}

async function renderSection(
  toolkit: VerovioToolkit,
  measureStart: number,
  measureEnd: number
): Promise<{ svg: string; width: number }> {
  toolkit.select({ measureRange: `${measureStart}-${measureEnd}` });
  toolkit.redoLayout();
  const svg = toolkit.renderToSVG(1);

  // Extract width from SVG viewBox or width attribute
  const widthMatch = svg.match(/viewBox="0 0 ([\d.]+)/);
  const width = widthMatch ? parseFloat(widthMatch[1]) : 0;

  return { svg, width };
}
```

**Section size recommendation:** 10-20 measures per section. This balances:
- Lazy loading benefit (smaller sections = fewer measures loaded at once)
- Rendering overhead (each section requires `select()` + `redoLayout()` + `renderToSVG()`)
- SVG fragment count (too many tiny sections = DOM overhead)

### Type Definition Updates

Add `select()` to the existing type augmentation:

```typescript
// src/types/verovio-augments.d.ts
declare module 'verovio/esm' {
  export class VerovioToolkit {
    // ... existing methods ...
    select(selection: { measureRange?: string } | {}): boolean;
    redoLayout(): void;
  }
}
```

**Confidence:** HIGH - `select()` exists in Verovio 6.0.1 (verified in source code)

## Feature 3: Integration with Existing Infrastructure

### Compatibility with Existing Patterns

| Existing Pattern | SingleLineRenderer Compatibility | Notes |
|------------------|----------------------------------|-------|
| `renderToTimemap()` | Works across full score before selection | Call once on load, cache globally |
| `getPageWithElement()` | Works but returns 1 for all (single page per section) | Use section boundaries instead |
| Event extraction | Same approach, X-coordinates instead of Y | `getBoundingClientRect()` works identically |
| Notehead animation | Same DOM targeting | `.note`, `.notehead` CSS classes preserved |
| CSS transform camera | Change `translateY()` to `translateX()` | Same pattern, different axis |

### Timemap and Event Extraction

Verovio's `renderToTimemap()` returns timing for the **entire score** regardless of section selection. Strategy:

1. Load full score, call `renderToTimemap()` once to get all events
2. For each event, determine which section contains it (by measure range)
3. Extract element positions when section mounts (same as paginated approach)

```typescript
interface HorizontalEvent extends MusicalEvent {
  sectionIndex: number;   // Which section contains this event
  localX: number;         // X within section SVG
  globalX: number;        // X in overall score coordinate space
}
```

### Measure Count Discovery

To determine section boundaries, first get total measure count:

```typescript
// Load full score first to get measure count
toolkit.loadData(xml);
const mei = toolkit.getMEI();  // Get MEI to count measures
// Or use renderToTimemap() and find max measure indices

// Then create sections
const sections = createSections(totalMeasures, measuresPerSection);
```

**Alternative:** Use `renderToTimemap({ includeMeasures: true })` to get measure boundaries from timing data.

## What NOT to Attempt

| Approach | Why Not | Use Instead |
|----------|---------|-------------|
| Render full horizontal score as single SVG | Memory explosion on long scores. Same problem as pre-v1.1 vertical layout. | Section-based rendering with `select()` |
| Use `adjustPageWidth` option | Not implemented in Verovio 6.0.1 | Accept large pageWidth or parse/adjust viewBox |
| Split single large SVG with DOM parsing | Fragile, loses proper scoping, element ID conflicts | Native `select()` + per-section render |
| Render all sections upfront | Defeats lazy loading purpose | Render sections on demand as they enter viewport |
| Use vertical virtual scrolling code directly | Camera axis is different (X vs Y) | Adapt visibility calculation for horizontal axis |

## Installation

```bash
# No new dependencies needed.
# Verovio 6.0.1 already installed with all required APIs.
```

## Verovio Options Summary

### RegularRenderer (Current - Vertical Paginated)
```typescript
{
  breaks: 'auto',           // Let Verovio decide line breaks
  pageHeight: 2970,         // A4 height, produces multiple pages
  pageWidth: calculated,    // Based on container width
  adjustPageHeight: true,
  svgViewBox: true,
  scale: 40,
}
```

### SingleLineRenderer (New - Horizontal Sections)
```typescript
{
  breaks: 'none',           // Force single horizontal system
  pageHeight: 100,          // Minimal, will adjust to content
  pageWidth: 100000,        // Large to accommodate horizontal extent
  adjustPageHeight: true,
  svgViewBox: true,
  scale: 40,
  pageMarginTop: 0,
  pageMarginBottom: 0,
}
// Plus: use select({ measureRange: 'X-Y' }) for section rendering
```

## Confidence Assessment

| Finding | Confidence | Basis |
|---------|------------|-------|
| `breaks: 'none'` produces single horizontal system | HIGH | Official documentation, explicit quote |
| `select()` method exists and works for measure ranges | HIGH | Official docs + source code verification |
| `redoLayout()` required after `select()` | HIGH | Official docs with code example |
| `adjustPageWidth` not implemented | HIGH | GitHub issue confirms not available |
| Section-based rendering viable | HIGH | Combination of verified APIs |
| TypeScript types need update for `select()` | HIGH | Method exists in source, not in @types/verovio |

## Sources

### Primary (HIGH confidence)
- [Layout options - Verovio Reference Book](https://book.verovio.org/advanced-topics/layout-options.html) - `breaks: 'none'` documentation
- [Score content selection - Verovio Reference Book](https://book.verovio.org/interactive-notation/content-selection.html) - `select()` method with `measureRange`
- [Toolkit methods - Verovio Reference Book](https://book.verovio.org/toolkit-reference/toolkit-methods.html) - API reference
- [Toolkit options - Verovio Reference Book](https://book.verovio.org/toolkit-reference/toolkit-options.html) - All option documentation
- Verovio source code (`node_modules/verovio/dist/verovio.mjs`) - Confirmed `select` method exists

### Secondary (MEDIUM confidence)
- [GitHub Issue #1304](https://github.com/rism-digital/verovio/issues/1304) - Partial score rendering feature confirmation
- [GitHub Issue #1276](https://github.com/rism-digital/verovio/issues/1276) - `adjustPageWidth` not implemented confirmation

### Codebase References
- `src/hooks/useVerovio.ts` - Current Verovio integration pattern
- `src/types/verovio-augments.d.ts` - Type definitions to update
- `src/lib/verovioService.ts` - Toolkit instantiation

---
*Stack research for: SingleLineRenderer - Horizontal rendering with section-based output*
*Researched: 2026-02-05*
