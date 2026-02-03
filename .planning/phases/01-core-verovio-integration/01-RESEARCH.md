# Phase 1: Core Verovio Integration - Research

**Researched:** 2026-02-03
**Domain:** Verovio WASM integration into React/Vite/TypeScript music renderer
**Confidence:** HIGH

## Summary

Phase 1 replaces the OpenSheetMusicDisplay (OSMD) rendering engine with Verovio WASM in the RegularRenderer component. This involves installing the Verovio npm package with Vite WASM support plugins, creating a singleton WASM service layer, swapping the SVG rendering pipeline, migrating CSS color selectors for the new SVG structure, implementing scale/zoom via Verovio options, and replacing OSMD-based MusicXML validation with Verovio's `loadData()` boolean check.

The prior project-level research (STACK.md, ARCHITECTURE.md, PITFALLS.md, FEATURES.md) already established the core patterns. This phase-specific research verifies those findings against actual Verovio SVG output samples in the repo, confirms the `svgHtml5` option behavior (critical selector decision), validates the `currentColor` CSS propagation strategy for `<use>` element coloring, and documents the exact initialization sequence required for timing methods.

The primary technical risks for Phase 1 are: (1) WASM loading in both Vite dev and production modes, (2) CSS color propagation through SVG `<use>` elements, and (3) establishing the correct `loadData -> renderToSVG -> renderToMIDI` sequence from the start.

**Primary recommendation:** Do NOT use `svgHtml5: true`. Keep standard `id`/`class` attributes so that `getElementById()` and `querySelector('g.note')` work without modification. Set `color` on parent SVG element to cascade via `currentColor` for global score coloring.

## Standard Stack

The established libraries/tools for this phase:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `verovio` | ^6.0.1 | MusicXML-to-SVG WASM engraving engine | Latest stable (Jan 28, 2026). Auto-detects MusicXML. Returns SVG strings. |
| `vite-plugin-wasm` | ^3.5.0 | WASM ESM integration for Vite | Required for Vite to handle verovio's WASM binary. Supports Vite 2-7. |
| `vite-plugin-top-level-await` | ^1.6.0 | Top-level await for non-esnext targets | Needed because WASM init is async. Safer than setting build.target to esnext. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@types/verovio` | ^5.1.0 | TypeScript type definitions | Types lag behind verovio 6.x; augment with local `.d.ts` for ESM entry points |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `vite-plugin-wasm` + `vite-plugin-top-level-await` | `build.target: 'esnext'` (no plugins) | Simpler config but narrows browser support |
| `@types/verovio` | Custom `.d.ts` only | More work but fully accurate for 6.x API |
| `verovio/wasm` ESM import | Manual `fetch()` + `WebAssembly.instantiate()` | Only if plugin approach fails; more control but more code |

**Installation:**
```bash
# Add new dependencies
npm install verovio
npm install -D @types/verovio vite-plugin-wasm vite-plugin-top-level-await

# Do NOT remove opensheetmusicdisplay yet -- that happens in Phase 5
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── lib/
│   ├── verovioService.ts       # NEW: Singleton WASM module + toolkit factory
│   ├── musicxmlValidation.ts   # MODIFIED: Use verovioService instead of OSMD
│   ├── noteAnimation.ts        # MODIFIED in Phase 1: selector changes only
│   ├── animationController.ts  # NOT changed in Phase 1 (Phase 3)
│   └── ...
├── hooks/
│   └── useVerovio.ts           # NEW: React hook for Verovio lifecycle
├── renderers/
│   └── RegularRenderer.tsx     # MODIFIED: swap OSMD for useVerovio hook
└── types/
    └── verovio-augments.d.ts   # NEW: TypeScript augmentations for ESM imports
```

### Pattern 1: Singleton WASM Module, Multiple Toolkits
**What:** Initialize the WASM module (`createVerovioModule()`) exactly once at app startup. Create lightweight `VerovioToolkit` instances per consumer.
**When to use:** Always. The WASM module is ~3-5MB. Loading it multiple times wastes memory.
**Example:**
```typescript
// Source: Verified against book.verovio.org/installing-or-building-from-sources/javascript-and-webassembly.html
// src/lib/verovioService.ts
import createVerovioModule from 'verovio/wasm';
import { VerovioToolkit } from 'verovio/esm';

let modulePromise: Promise<any> | null = null;
let resolvedModule: any = null;

function ensureModule(): Promise<any> {
  if (resolvedModule) return Promise.resolve(resolvedModule);
  if (!modulePromise) {
    modulePromise = createVerovioModule().then(mod => {
      resolvedModule = mod;
      return mod;
    });
  }
  return modulePromise;
}

export async function createToolkit(): Promise<VerovioToolkit> {
  const mod = await ensureModule();
  return new VerovioToolkit(mod);
}

export const isReady: Promise<void> = ensureModule().then(() => {});
```

### Pattern 2: SVG-as-String via dangerouslySetInnerHTML on a div
**What:** Verovio returns SVG as a string. Insert into a `<div>` wrapper using `dangerouslySetInnerHTML`.
**When to use:** Always for Verovio SVG rendering in React.
**Why a div, not an SVG element:** React has a known issue where `dangerouslySetInnerHTML` on SVG `<g>` elements may not update correctly. A `<div>` wrapper avoids this.
**Example:**
```typescript
// In RegularRenderer.tsx
<div
  ref={scoreRef}
  className="preview-score"
  dangerouslySetInnerHTML={{ __html: svgString }}
/>
```

### Pattern 3: Strict Initialization Sequence
**What:** Verovio timing methods (`getTimeForElement`, `getElementsAtTime`) require `renderToMIDI()` to be called first. Establish the sequence: `loadData() -> renderToSVG() -> renderToMIDI()`.
**When to use:** Every time a score is loaded or re-rendered.
**Why critical:** Without `renderToMIDI()`, timing queries silently return 0 for all elements -- no error is thrown.

### Pattern 4: Global Score Coloring via CSS color Property
**What:** Verovio's embedded SVG stylesheet uses `stroke: currentColor` on all shape elements. Setting the CSS `color` property on the SVG root (or a parent element) cascades to all strokes. Setting `fill` separately handles fill colors.
**When to use:** For the global score color feature (user-chosen color).
**Verified from:** Sample SVG files in `verovio_examples/` -- line 71 of sample1.svg contains: `ellipse, path, polygon, polyline, rect {stroke:currentColor}`
**Example:**
```css
/* Global score coloring for Verovio SVG */
.preview-score svg.definition-scale {
  color: ${scoreColor};    /* cascades to stroke via currentColor */
}
.preview-score svg path,
.preview-score svg rect,
.preview-score svg use {
  fill: ${scoreColor};
}
/* Staff lines: stroke only, no fill */
.preview-score g.staff > path {
  fill: none !important;
  stroke: ${scoreColor} !important;
  stroke-width: 1 !important;
  shape-rendering: crispEdges !important;
}
```

### Anti-Patterns to Avoid
- **Initializing WASM per component:** Call `createVerovioModule()` inside each component's `useEffect`. Each call loads the entire ~3-5MB WASM binary again. Use singleton service instead.
- **Using `svgHtml5: true`:** Replaces `id`/`class` with `data-id`/`data-class`, breaking `getElementById()` and `querySelector('g.note')`. Only needed when multiple SVGs share a DOM (not our case -- each renderer has its own container).
- **Re-rendering SVG on every animation frame:** `renderToSVG()` is computationally expensive (~10-50ms). Animate by manipulating inline styles on existing SVG DOM elements instead.
- **Storing toolkit in `useState`:** Verovio toolkit is a WASM-backed C++ object. Use `useRef` to avoid unnecessary re-renders and recreation.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| WASM loading in Vite | Manual `fetch()` + `WebAssembly.instantiate()` | `vite-plugin-wasm` + `optimizeDeps.exclude` | Handles dev server, production build, and HMR edge cases |
| MusicXML format detection | Parse XML to check root element | `toolkit.loadData(xml)` auto-detects | Verovio handles MusicXML, MEI, and Humdrum format detection internally |
| MusicXML validation | Try-catch render in hidden container | `toolkit.loadData(xml)` returns `false` on invalid input | No DOM needed, synchronous, much faster |
| SVG scaling/responsive | CSS transform on SVG container | `svgViewBox: true` option | Verovio adds proper viewBox attribute; CSS handles responsive sizing |
| Score pagination to single scroll | Manual page concatenation | `pageHeight: 60000` + `adjustPageHeight: true` | Forces Verovio to output one tall page matching current scroll model |

**Key insight:** Verovio's toolkit API already handles most of what OSMD required custom code for. The migration simplifies several patterns.

## Common Pitfalls

### Pitfall 1: WASM Load Fails in Vite Dev but Works in Production (or vice versa)
**What goes wrong:** Vite's dev server uses ESBuild for dependency pre-bundling, which does not handle WASM modules. The app shows a blank score container with no error, or console shows `"No loader is configured for '.wasm' files"`.
**Why it happens:** ESBuild processes `node_modules` by default. WASM binary imports inside the verovio package fail during this pre-bundling step.
**How to avoid:**
1. Add `vite-plugin-wasm` and `vite-plugin-top-level-await` to plugins
2. Add `optimizeDeps: { exclude: ['verovio'] }` to vite.config.ts
3. Test BOTH `vite dev` AND `vite build && vite preview` after every config change
**Warning signs:** `createVerovioModule()` Promise never resolves; console shows MIME type or loader errors; works in one mode but not the other.
**Confidence:** HIGH -- the `optimizeDeps.exclude: ['verovio']` pattern is confirmed by the vue-verovio-canvas reference project and vite-plugin-wasm documentation.

### Pitfall 2: CSS Fill Does Not Propagate Through `<use>` Elements
**What goes wrong:** Setting `style.fill` on a `<use>` element or its parent `<g>` does not change the notehead color. Stems change but noteheads stay black.
**Why it happens:** Verovio renders noteheads as `<use xlink:href="#E0A4-...">` referencing glyph definitions in `<defs>`. The `<defs>` paths do NOT have explicit `fill` attributes -- they rely on inheritance. However, CSS specificity can prevent cascade.
**How to avoid:**
1. Set BOTH `fill` AND `color` on the target element. Verovio's stylesheet uses `stroke: currentColor`, so the `color` property controls strokes.
2. For global coloring: set `color` on the SVG root element, `fill` via CSS rules targeting shapes.
3. For per-note coloring (animation): set `fill` and `color` directly on the `<g class="note">` element or its `<use>` children.
4. Validate coloring works BEFORE building the animation system.
**Warning signs:** Notes appear but refuse to change color; stems change but noteheads do not; all noteheads change simultaneously.
**Confidence:** HIGH -- verified from sample SVG analysis. The `<defs>` paths have no explicit fill, relying on inheritance. The SVG stylesheet confirms `stroke: currentColor`.

### Pitfall 3: `renderToMIDI()` Not Called Before Timing Queries
**What goes wrong:** `getTimeForElement()` returns 0 for all elements. `getElementsAtTime()` returns empty arrays. No error is thrown.
**Why it happens:** Verovio computes timing data lazily as part of MIDI generation. The API does not enforce calling order.
**How to avoid:** Establish strict sequence: `loadData() -> renderToSVG() -> renderToMIDI()`. Call `renderToMIDI()` even if you don't need the MIDI data -- the side effect of populating timing data is what matters.
**Warning signs:** `getTimeForElement()` returns 0; timing appears to "not work" despite SVG rendering correctly.
**Confidence:** HIGH -- documented in Verovio reference book under MIDI playback section.

### Pitfall 4: Score Re-render on Scale Change Requires Full Pipeline
**What goes wrong:** After changing scale, the SVG is re-rendered but events/positions are stale, causing camera scroll to target wrong positions.
**Why it happens:** Verovio re-renders the entire layout when options change. Line breaks, element positions, and page structure all change.
**How to avoid:** After any `setOptions()` + `renderToSVG()` call, also call `renderToMIDI()` and re-extract all events. Debounce scale changes (existing 300ms pattern is good).
**Warning signs:** Camera jumps to wrong position after zoom; animation targets wrong notes after resize.
**Confidence:** HIGH -- same behavior as current OSMD zoom which already re-extracts events.

### Pitfall 5: TypeScript Types Lag Behind Verovio 6.x
**What goes wrong:** Import from `verovio/wasm` or `verovio/esm` shows TypeScript errors ("Cannot find module").
**Why it happens:** `@types/verovio` is at v5.1.0, may not declare the ESM entry points (`verovio/wasm`, `verovio/esm`).
**How to avoid:** Create `src/types/verovio-augments.d.ts` with module declarations for `verovio/wasm` and `verovio/esm`. This is needed regardless of whether `@types/verovio` covers them.
**Warning signs:** TypeScript red squiggles on import statements; `tsc -b` fails on verovio imports.
**Confidence:** MEDIUM -- the type coverage gap is documented but whether ESM entries are typed needs validation at install time.

## Code Examples

Verified patterns from official sources and sample SVG analysis:

### Verovio Initialization (Complete)
```typescript
// Source: book.verovio.org/installing-or-building-from-sources/javascript-and-webassembly.html
import createVerovioModule from 'verovio/wasm';
import { VerovioToolkit } from 'verovio/esm';

const VerovioModule = await createVerovioModule();
const toolkit = new VerovioToolkit(VerovioModule);
```

### Setting Options for Web Rendering
```typescript
// Source: book.verovio.org/toolkit-reference/toolkit-options.html
// Verified against existing RegularRenderer requirements
toolkit.setOptions(JSON.stringify({
  pageWidth: containerWidth * 100 / scale,  // Verovio units
  pageHeight: 60000,          // Very tall -> single page
  adjustPageHeight: true,     // Shrink to content
  scale: 40,                  // Percentage (40 = small, readable for web)
  svgViewBox: true,           // Adds viewBox for responsive scaling
  svgRemoveXlink: true,       // Modern SVG: href instead of xlink:href
  breaks: 'auto',             // Verovio decides line breaks
  header: 'none',             // No title (matches OSMD drawTitle: false)
  footer: 'none',             // No footer
  // Do NOT set svgHtml5: true -- it replaces id/class with data-id/data-class
}));
```

### Load, Render, and Prepare Timing
```typescript
// Source: book.verovio.org/toolkit-reference/toolkit-methods.html
const success: boolean = toolkit.loadData(musicXmlString);
if (!success) {
  throw new Error('Invalid MusicXML');
}

const svgString: string = toolkit.renderToSVG(1); // Page 1 (1-indexed)
const midiBase64: string = toolkit.renderToMIDI(); // MUST call for timing queries

// Now timing methods work:
const timeMs: number = toolkit.getTimeForElement('note-0000001234');
```

### Verovio SVG Structure (Verified from repo samples)
```xml
<!-- From verovio_examples/sample1.svg -->
<svg width="955px" height="273px" ...>
  <defs>
    <g id="E0A4-w1622us0">
      <path transform="scale(1,-1)" d="M0 -39c0 68..."/>  <!-- notehead glyph -->
    </g>
  </defs>
  <style>
    /* stroke:currentColor on all shapes -- CSS color property cascades */
    #w1622us0 ellipse, #w1622us0 path, ... {stroke:currentColor}
  </style>
  <svg class="definition-scale" color="black" viewBox="0 0 23870 6820">
    <g class="page-margin">
      <g class="system">
        <g class="measure">
          <g class="staff">
            <g class="layer">
              <g id="n1lxdw3k" class="note">        <!-- note group with MEI ID -->
                <g class="notehead">                  <!-- notehead container -->
                  <use xlink:href="#E0A4-w1622us0"    <!-- glyph reference -->
                       transform="translate(3355, 2439) scale(0.72, 0.72)"/>
                </g>
                <g id="y1cnwaio" class="stem">       <!-- stem with path -->
                  <path d="M3364 2467 L3364 3069" stroke-width="18"/>
                </g>
              </g>
            </g>
          </g>
        </g>
      </g>
    </g>
  </svg>
</svg>
```

### Selector Migration Table (OSMD -> Verovio)
```typescript
// Source: Verified against verovio_examples/sample1.svg

// Find note by ID
// OSMD:    `#${CSS.escape('vf-' + id)}`
// Verovio: `#${CSS.escape(id)}`            // MEI IDs directly, no prefix

// All noteheads in a note
// OSMD:    `.vf-notehead`
// Verovio: `g.notehead`                    // or `.notehead`

// Shapes to color inside notehead
// OSMD:    `.vf-notehead path, .vf-notehead ellipse`
// Verovio: `g.notehead use`               // <use> elements, not path/ellipse

// All notes
// OSMD:    `.vf-stavenote`
// Verovio: `g.note`

// Staff lines
// OSMD:    `.vf-stave path`
// Verovio: `g.staff > path`

// Reset all noteheads
// OSMD:    `.vf-notehead`
// Verovio: `.notehead`
```

### Vite Configuration (Complete)
```typescript
// Source: vue-verovio-canvas project + vite-plugin-wasm docs
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';

export default defineConfig({
  plugins: [
    react(),
    wasm(),
    topLevelAwait(),
  ],
  optimizeDeps: {
    exclude: ['verovio'],  // Prevent ESBuild from pre-bundling WASM
  },
});
```

### MusicXML Validation (Simplified)
```typescript
// Source: book.verovio.org/toolkit-reference/toolkit-methods.html
// No hidden DOM container needed -- Verovio validates without DOM
import { createToolkit } from './verovioService';

export async function validateMusicXML(xmlContent: string) {
  const toolkit = await createToolkit();
  const loaded = toolkit.loadData(xmlContent);

  if (!loaded) {
    return { valid: false, error: 'Invalid MusicXML file' };
  }

  // Render to verify it produces valid output
  const svg = toolkit.renderToSVG(1);
  if (!svg || svg.length === 0) {
    return { valid: false, error: 'Cannot render score' };
  }

  return { valid: true, pageCount: toolkit.getPageCount() };
}
```

### TypeScript Augmentations
```typescript
// Source: Standard TypeScript module augmentation pattern
// src/types/verovio-augments.d.ts
declare module 'verovio/wasm' {
  export default function createVerovioModule(): Promise<any>;
}

declare module 'verovio/esm' {
  export class VerovioToolkit {
    constructor(module: any);
    loadData(data: string): boolean;
    renderToSVG(pageNo?: number, xmlDeclaration?: boolean): string;
    setOptions(jsonOptions: string): boolean;
    getOptions(): string;
    getPageCount(): number;
    getTimeForElement(xmlId: string): number;
    getElementsAtTime(millisec: number): string;
    getTimesForElement(xmlId: string): string;
    getElementAttr(xmlId: string): string;
    getMIDIValuesForElement(xmlId: string): string;
    renderToMIDI(): string;
    getMEI(jsonOptions?: string): string;
    loadZipDataBuffer(data: ArrayBuffer): boolean;
    loadZipDataBase64(data: string): boolean;
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `import verovio from 'verovio'` (CJS, callback) | `import from 'verovio/wasm'` + `'verovio/esm'` (ESM) | Verovio 3.11.0+ | Must use ESM entry points; CJS is legacy |
| `onRuntimeInitialized` callback | `await createVerovioModule()` Promise | Verovio 3.11.0+ | Cleaner async init, works with top-level await |
| `verovio-dev` npm package | `verovio` npm package only | Deprecated | Do not install verovio-dev |
| `@sourceandsummit/verovio-types` | `@types/verovio` (DefinitelyTyped) | 2021 | Alternative package abandoned since 2021 |
| Verovio 5.x | Verovio 6.0.1 (Jan 28, 2026) | Jan 2026 | Latest stable; types at 5.1.0 lag behind |

**Deprecated/outdated:**
- `verovio-dev` package: Deprecated, do not use
- Root CJS import (`import verovio from 'verovio'`): Legacy pattern, use ESM entry points
- `@sourceandsummit/verovio-types`: Abandoned since Feb 2021

## Critical Phase 1 Decision: Do NOT Use svgHtml5

**Decision:** Set `svgHtml5: false` (the default). Do NOT enable it.

**Why this matters:** The `svgHtml5` option REPLACES standard `id` and `class` attributes with `data-id` and `data-class`. This means:
- `document.getElementById('note-123')` stops working -> must use `document.querySelector('[data-id="note-123"]')`
- `querySelector('g.note')` stops working -> must use `querySelector('g[data-class~="note"]')`
- All DOM queries throughout the animation system would need rewriting

**When svgHtml5 IS useful:** When multiple Verovio SVGs share the same DOM (ID uniqueness requirement). Our app renders one score per container, so this is not needed.

**Verified:** Sample SVGs in `verovio_examples/` were generated without `svgHtml5` and use standard `id`/`class` attributes. All selector patterns in this research assume standard attributes.

## Open Questions

Things that couldn't be fully resolved:

1. **Does `@types/verovio@5.1.0` declare `verovio/wasm` and `verovio/esm` entry points?**
   - What we know: The types package is DefinitelyTyped v5.1.0, verovio is at v6.0.1
   - What's unclear: Whether the ESM entry points have type declarations or only the root import
   - Recommendation: Create `verovio-augments.d.ts` proactively. If `@types/verovio` already covers them, the augmentations will be harmless overrides.

2. **Exact Verovio scale-to-pixel conversion formula for pageWidth**
   - What we know: Prior research says `pageWidth = containerWidth * 100 / scale`
   - What's unclear: Whether this formula is exact or approximate; depends on Verovio's internal unit system
   - Recommendation: Test empirically during implementation. Start with the formula, adjust if line breaks look wrong.

3. **Does `svgRemoveXlink: true` affect `<use>` element behavior?**
   - What we know: It changes `xlink:href` to `href` on `<use>` elements
   - What's unclear: Whether modern browser SVG rendering handles `href` identically to `xlink:href` on `<use>`
   - Recommendation: Enable it for modern SVG compliance but test `<use>` element color inheritance after enabling.

4. **Performance of `renderToMIDI()` on large scores**
   - What we know: Must call after every `loadData()` for timing; prior research says "it is fast"
   - What's unclear: How fast for 50+ measure orchestral scores
   - Recommendation: Measure during implementation. If slow, make it lazy (call only when timing data is actually needed).

## Sources

### Primary (HIGH confidence)
- Verovio sample SVGs in `verovio_examples/sample1.svg` through `sample4.svg` -- directly inspected SVG structure, class names, `<use>` elements, `currentColor` stylesheet
- [Verovio Reference Book: Toolkit Methods](https://book.verovio.org/toolkit-reference/toolkit-methods.html) -- loadData returns boolean, renderToMIDI requirement
- [Verovio Reference Book: Toolkit Options](https://book.verovio.org/toolkit-reference/toolkit-options.html) -- svgHtml5 replaces id/class with data-id/data-class
- [Verovio Reference Book: JavaScript/WASM](https://book.verovio.org/installing-or-building-from-sources/javascript-and-webassembly.html) -- ESM import pattern
- [Verovio Reference Book: CSS and SVG](https://book.verovio.org/interactive-notation/css-and-svg.html) -- fill + color needed for note coloring
- Current codebase analysis: RegularRenderer.tsx, musicxmlValidation.ts, noteAnimation.ts, animationController.ts

### Secondary (MEDIUM confidence)
- [vue-verovio-canvas project](https://github.com/WolfgangDrescher/vue-verovio-canvas) -- Vite config with `optimizeDeps.exclude: ['verovio']`
- [vite-plugin-wasm npm](https://www.npmjs.com/package/vite-plugin-wasm) -- v3.5.0, Vite 2-7 support
- [vite-plugin-top-level-await npm](https://www.npmjs.com/package/vite-plugin-top-level-await) -- v1.6.0
- [Verovio npm registry](https://www.npmjs.com/package/verovio) -- v6.0.1 confirmed

### Tertiary (LOW confidence)
- svgHtml5 "replaces" vs "adds" behavior -- confirmed by WebSearch + logical analysis of sample SVGs (samples have id/class, not data-id/data-class, confirming svgHtml5 was off), but not verified against Verovio source code

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- versions verified via npm registry, patterns verified via official docs
- Architecture: HIGH -- singleton pattern verified against official docs, SVG structure verified against repo samples
- Pitfalls: HIGH -- WASM loading pitfall verified via vue-verovio-canvas; `<use>` styling verified via SVG sample inspection; renderToMIDI requirement from official docs
- Code examples: HIGH -- patterns from official Verovio reference book, selectors verified against actual SVG output

**Research date:** 2026-02-03
**Valid until:** 2026-03-03 (stable domain -- Verovio 6.x API unlikely to change within 30 days)
