# Stack Research: Verovio Integration for Manuscript Renderer

**Domain:** MusicXML rendering engine migration (OSMD to Verovio) in React/Vite/TypeScript
**Researched:** 2026-02-03
**Confidence:** MEDIUM-HIGH (verified via official docs and npm registry; some Vite-WASM config is LOW confidence)

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended | Confidence |
|------------|---------|---------|-----------------|------------|
| `verovio` | ^6.0.1 | MusicXML-to-SVG engraving engine (WASM) | Latest stable release (Jan 28, 2026). C++ engine compiled to WASM -- significantly faster than OSMD's JavaScript-based rendering. Auto-detects MusicXML input. Outputs clean SVG strings. | HIGH -- verified via npm registry (`npx npm-remote-ls`) and official news page |
| `@types/verovio` | ^5.1.0 | TypeScript type definitions for verovio | Community-maintained DefinitelyTyped types. Covers VerovioToolkit class, createVerovioModule, and core API methods. | MEDIUM -- version lags behind verovio 6.0.1; types cover the stable API surface but may miss new 6.x methods |
| `vite-plugin-wasm` | ^3.5.0 | WASM ESM integration for Vite | Required to load verovio's WASM module correctly in Vite dev and production builds. Supports Vite 2.x-7.x. 142K weekly downloads. | HIGH -- verified via npm registry |
| `vite-plugin-top-level-await` | ^1.6.0 | Top-level await support for non-esnext targets | Needed because verovio initialization is async (WASM load). Without this, you must wrap everything in async functions or set build.target to esnext. | MEDIUM -- may be unnecessary if build.target is set to esnext, but recommended for broader browser compat |

### Existing Stack (Unchanged)

These technologies are already in the project and remain unchanged:

| Technology | Current Version | Purpose |
|------------|-----------------|---------|
| React | ^19.1.1 | UI framework |
| Vite | ^6.3.5 | Build tool and dev server |
| TypeScript | ~5.9.3 | Type safety |
| Zustand | ^5.0.10 | State management |
| Tailwind CSS | ^4.1.16 | Styling |

## Verovio Initialization Pattern

This is the critical integration pattern. Verovio uses a two-step async initialization: load the WASM module, then construct the toolkit.

### ESM Imports (Recommended)

```typescript
import createVerovioModule from 'verovio/wasm';
import { VerovioToolkit } from 'verovio/esm';
```

**Key entry points in the verovio npm package:**
- `verovio/wasm` -- Exports `createVerovioModule()`, which async-loads the WASM binary and returns a Promise
- `verovio/esm` -- Exports `VerovioToolkit` class (the JS wrapper around the WASM engine)
- `verovio/wasm-hum` -- Alternative WASM module with Humdrum format support (not needed for MusicXML-only use)

### Initialization Code

```typescript
// Initialize once, reuse the toolkit instance
const VerovioModule = await createVerovioModule();
const toolkit = new VerovioToolkit(VerovioModule);

// Configure for web rendering
toolkit.setOptions(JSON.stringify({
  pageWidth: 2100,
  pageHeight: 60000,      // large height = effectively infinite
  adjustPageHeight: true,  // shrink to content
  scale: 40,
  svgHtml5: true,          // CRITICAL: outputs data-id attributes for element identification
  svgViewBox: true,        // enables responsive scaling via viewBox
  breaks: 'auto',          // auto page/system breaks
}));

// Load MusicXML (auto-detected, no format flag needed)
const success: boolean = toolkit.loadData(musicXmlString);

// Render page 1 to SVG string
const svgString: string = toolkit.renderToSVG(1);
```

**Confidence:** HIGH -- this exact pattern is documented in the official Verovio reference book at book.verovio.org.

### For Compressed MusicXML (.mxl files)

```typescript
// .mxl files require different loading methods
const response = await fetch('score.mxl');
const buffer = await response.arrayBuffer();
toolkit.loadZipDataBuffer(buffer);
// OR for base64:
toolkit.loadZipDataBase64(base64String);
```

**Confidence:** HIGH -- documented at book.verovio.org/toolkit-reference/input-formats.html.

## Key API Methods

Methods relevant to Manuscript's needs, verified against official toolkit reference:

| Method | Returns | Purpose | Notes |
|--------|---------|---------|-------|
| `loadData(data: string)` | `boolean` | Load MusicXML/MEI string | Auto-detects format. Returns true on success. |
| `renderToSVG(pageNo?: number)` | `string` | Render page to SVG string | 1-indexed. Default page 1. |
| `getPageCount()` | `number` | Number of pages in loaded score | Call after loadData. |
| `setOptions(jsonString: string)` | `boolean` | Set rendering options | Pass JSON.stringify'd object. |
| `getOptions()` | `string` | Get current options as JSON | Returns JSON string, parse it. |
| `getTimeForElement(xmlId: string)` | `number` | Playback time (ms) for element | Requires prior `renderToMIDI()` call. |
| `getMIDIValuesForElement(xmlId: string)` | `string` | MIDI note data as JSON | Requires prior `renderToMIDI()` call. |
| `getElementsAtTime(ms: number)` | `string` | Elements playing at given time (JSON) | For playback cursor sync. |
| `getTimesForElement(xmlId: string)` | `string` | Onset/offset timing data (JSON) | Returns scoreTimeOnset, realTimeOnsetMilliseconds, etc. |
| `getElementAttr(xmlId: string)` | `string` | Element MEI attributes as JSON | For inspecting note properties. |
| `renderToMIDI()` | `string` | Render to base64 MIDI | Must call before timing methods. |
| `getMEI()` | `string` | Export current document as MEI | Useful for round-tripping or saving. |
| `loadZipDataBuffer(buffer: ArrayBuffer)` | `boolean` | Load compressed .mxl file | For .mxl MusicXML files only. |

**Confidence:** HIGH -- all methods verified against book.verovio.org/toolkit-reference/toolkit-methods.html.

## Key Rendering Options

Options passed via `toolkit.setOptions(JSON.stringify({...}))`:

| Option | Type | Default | Recommended | Why |
|--------|------|---------|-------------|-----|
| `pageWidth` | integer | 2100 | Dynamic (container width) | Match to container for responsive layout |
| `pageHeight` | integer | 2970 | 60000 | Set very large + adjustPageHeight to get single continuous output |
| `adjustPageHeight` | boolean | false | true | Shrinks page to actual content height |
| `scale` | integer (1-1000) | 100 | 40-60 | Controls music size. 100 = full size, 40 = readable in web context |
| `svgHtml5` | boolean | false | **true** | Outputs `data-id` and `data-class` attributes instead of bare `id`. Essential for JS interactivity and avoids DOM id clashes when multiple SVGs exist. |
| `svgViewBox` | boolean | false | true | Adds viewBox to SVG root for responsive scaling |
| `breaks` | string | "auto" | "auto" or "none" | "auto" = verovio decides line breaks. "none" = single system (for short excerpts) |
| `font` | string | "Leipzig" | "Leipzig" | Default music font, high quality. Alternatives: Bravura, Gootville, Petaluma |
| `spacingStaff` | integer | 12 | 12 | Staff-to-staff spacing in MEI units |
| `spacingSystem` | integer | 4 | 4-8 | System-to-system spacing |
| `svgAdditionalAttribute` | string[] | [] | `["note@pname", "note@oct"]` | Exposes MEI attributes as data-* on SVG elements. Enables CSS selection like `g[data-pname="c"][data-oct="5"]` |

**Confidence:** HIGH -- verified against book.verovio.org/toolkit-reference/toolkit-options.html.

## Vite Configuration

### Required Changes to vite.config.ts

```typescript
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
    exclude: ['verovio'],  // Prevent Vite from pre-bundling the WASM package
  },
});
```

**Why each piece:**
- `wasm()` -- Enables ESM-style WASM imports. Without this, Vite cannot properly handle the `verovio/wasm` entry point which loads a `.wasm` binary.
- `topLevelAwait()` -- The WASM module initialization is inherently async. This plugin transforms the code so top-level await works in browsers that do not support it natively. Can be omitted if `build.target` is `esnext`.
- `optimizeDeps.exclude: ['verovio']` -- Vite's dependency pre-bundling (via esbuild) does not handle WASM modules correctly. Excluding verovio prevents broken pre-bundling and lets the WASM plugin handle it properly.

**Confidence:** MEDIUM -- the wasm plugin + optimizeDeps.exclude pattern is widely documented for WASM packages in Vite, but this specific combination has not been tested with verovio 6.0.1 in this research. If issues arise, the fallback is to copy the `.wasm` file to `public/` and load it manually.

### Alternative: esnext target (simpler but narrower browser support)

```typescript
export default defineConfig({
  plugins: [
    react(),
    wasm(),
    // No topLevelAwait needed
  ],
  build: {
    target: 'esnext',  // Enables native top-level await
  },
  optimizeDeps: {
    exclude: ['verovio'],
  },
});
```

This is simpler but limits browser support to very modern browsers only. The current tsconfig.app.json targets ES2020, so using `topLevelAwait` plugin is the safer choice.

## Installation

```bash
# New dependency (replaces opensheetmusicdisplay)
npm install verovio

# TypeScript types
npm install -D @types/verovio

# Vite WASM support
npm install -D vite-plugin-wasm vite-plugin-top-level-await

# Remove old dependency
npm uninstall opensheetmusicdisplay
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| `verovio` (WASM) | `opensheetmusicdisplay` (current) | Only if you need OSMD's specific DOM-insertion rendering model or its cursor/audio playback plugins. Verovio is faster and more standards-compliant. |
| `verovio/wasm` entry | `verovio` root import (CJS) | Never -- the root import uses the legacy `onRuntimeInitialized` callback pattern. Always use the ESM entry points. |
| `vite-plugin-wasm` | Manual WASM loading via `fetch()` + `WebAssembly.instantiate()` | Only if vite-plugin-wasm causes issues. Manual loading is more work but gives full control. |
| `@types/verovio` | `@sourceandsummit/verovio-types` | Never -- this alternative package was last updated Feb 2021 and is abandoned. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `verovio-dev` npm package | Deprecated. Was the development builds package. | `verovio` (stable releases only) |
| `verovio` root import (`import verovio from 'verovio'`) | Uses legacy CJS/callback pattern (`onRuntimeInitialized`). Not tree-shakeable. Poor bundler compat. | `import createVerovioModule from 'verovio/wasm'` + `import { VerovioToolkit } from 'verovio/esm'` |
| `@sourceandsummit/verovio-types` | Abandoned since Feb 2021. | `@types/verovio` (DefinitelyTyped, updated Mar 2025) |
| `renderData()` for production use | Combines load + render in one call. No access to page count or options between steps. Fine for demos, bad for real apps. | `loadData()` then `renderToSVG()` separately |
| `innerHTML` for SVG insertion | XSS risk, no React reconciliation | `dangerouslySetInnerHTML={{ __html: svg }}` with sanitization, or parse SVG into React elements |

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| `verovio@^6.0.1` | `@types/verovio@^5.1.0` | Types lag behind by ~1 major version. Core API is stable; new 6.x-specific methods may lack types. Augment with custom declarations as needed. |
| `verovio@^6.0.1` | Vite 6.x + `vite-plugin-wasm@^3.5.0` | WASM plugin supports Vite 2-7. Should work with Vite 6.3.5. |
| `vite-plugin-wasm@^3.5.0` | `vite-plugin-top-level-await@^1.6.0` | Same author (Menci), designed to work together. |
| `verovio@^6.0.1` | React 19 | No direct dependency -- verovio outputs SVG strings. React version is irrelevant to verovio itself. |
| `verovio@^6.0.1` | TypeScript ~5.9 | Works fine. Types are ambient declarations, no TS version constraints. |

## TypeScript Considerations

### Type Coverage Gap

`@types/verovio` is at version 5.1.0 while `verovio` is at 6.0.1. This means:

**What IS typed:**
- `createVerovioModule` function signature
- `VerovioToolkit` class with core methods (loadData, renderToSVG, setOptions, getPageCount, etc.)
- Basic option types

**What MAY lack types (needs validation during implementation):**
- Any new methods added in verovio 5.2-6.0
- New options introduced in recent versions
- Return type specifics (many methods return `string` which is actually JSON that could be typed more precisely)

**Mitigation strategy:**
1. Install `@types/verovio` for baseline coverage
2. Create a local `verovio.d.ts` augmentation file for any missing or imprecise types
3. Wrap verovio toolkit in a typed service layer that parses JSON returns into proper TypeScript types

```typescript
// Example: src/types/verovio-augments.d.ts
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
    getMIDIValuesForElement(xmlId: string): string;
    getElementsAtTime(millisec: number): string;
    getTimesForElement(xmlId: string): string;
    getElementAttr(xmlId: string): string;
    renderToMIDI(): string;
    getMEI(jsonOptions?: string): string;
    loadZipDataBuffer(data: ArrayBuffer): boolean;
    loadZipDataBase64(data: string): boolean;
  }
}
```

**Confidence:** MEDIUM -- the augmentation approach is standard TypeScript practice. Whether `@types/verovio` covers the ESM entry points or only the root import needs to be tested during implementation.

## Performance Considerations

### Web Worker Strategy (For Large Scores)

Verovio WASM rendering is CPU-intensive for large scores (orchestral works, multi-movement pieces). Consider running verovio in a Web Worker:

```typescript
// worker.ts
import createVerovioModule from 'verovio/wasm';
import { VerovioToolkit } from 'verovio/esm';

let toolkit: VerovioToolkit;

self.onmessage = async (e) => {
  if (e.data.type === 'init') {
    const module = await createVerovioModule();
    toolkit = new VerovioToolkit(module);
    self.postMessage({ type: 'ready' });
  }
  if (e.data.type === 'render') {
    toolkit.setOptions(JSON.stringify(e.data.options));
    toolkit.loadData(e.data.musicXml);
    const pages = toolkit.getPageCount();
    for (let i = 1; i <= pages; i++) {
      self.postMessage({ type: 'page', pageNo: i, svg: toolkit.renderToSVG(i) });
    }
  }
};
```

**Confidence:** MEDIUM -- verovio's WASM module should work in Web Workers (it is just JavaScript + WASM, no DOM dependency), but this has not been tested with Vite's worker bundling specifically. The Vite `?worker` import syntax should handle it, but may need WASM plugin configuration for workers.

**Recommendation:** Start on the main thread. Only move to Web Worker if rendering latency exceeds ~200ms for typical scores (which it likely will not for single-page lead sheets and short pieces).

## Sources

- [Verovio npm package](https://www.npmjs.com/package/verovio) -- version 6.0.1 confirmed via npm registry
- [Verovio News page](https://www.verovio.org/news.xhtml) -- version 6.0 release date (Jan 28, 2026) and changelog
- [Verovio Reference Book: JavaScript and WebAssembly](https://book.verovio.org/installing-or-building-from-sources/javascript-and-webassembly.html) -- ESM initialization pattern (HIGH confidence)
- [Verovio Reference Book: Toolkit Methods](https://book.verovio.org/toolkit-reference/toolkit-methods.html) -- full API reference (HIGH confidence)
- [Verovio Reference Book: Toolkit Options](https://book.verovio.org/toolkit-reference/toolkit-options.html) -- rendering options (HIGH confidence)
- [Verovio Reference Book: Input Formats](https://book.verovio.org/toolkit-reference/input-formats.html) -- MusicXML and .mxl loading (HIGH confidence)
- [Verovio Reference Book: CSS and SVG](https://book.verovio.org/interactive-notation/css-and-svg.html) -- interactive notation, data attributes (HIGH confidence)
- [@types/verovio npm](https://www.npmjs.com/package/@types/verovio) -- TypeScript types v5.1.0 (MEDIUM confidence for 6.x coverage)
- [vite-plugin-wasm npm](https://www.npmjs.com/package/vite-plugin-wasm) -- v3.5.0, Vite 2-7 support (HIGH confidence)
- [vite-plugin-top-level-await npm](https://www.npmjs.com/package/vite-plugin-top-level-await) -- v1.6.0 (HIGH confidence)
- [Verovio GitHub Discussion #2815](https://github.com/rism-digital/verovio/discussions/2815) -- npm package ESM improvements context (MEDIUM confidence)

---
*Stack research for: Verovio WASM integration into React/Vite/TypeScript*
*Researched: 2026-02-03*
