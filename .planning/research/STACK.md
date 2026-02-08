# Stack Research: PixiJS WebGL Migration

**Domain:** GPU-accelerated rendering for SingleLineRenderer
**Researched:** 2026-02-08
**Confidence:** HIGH (verified via official PixiJS documentation and release notes)

---

## Context

The existing SingleLineRenderer uses SVG DOM rendering with CSS transforms for scrolling. For GPU acceleration, we need:

1. **GPU-accelerated scrolling** - Container position transforms on GPU, not CPU
2. **Shader-based highlighting** - Tint property for note highlighting
3. **SVG-to-texture conversion** - Verovio SVG output rendered as GPU textures
4. **React 19.1.1 compatibility** - Native integration with existing React app

---

## Executive Summary

**PixiJS v8 with @pixi/react v8 is the recommended stack.** The @pixi/react v8 library was specifically rebuilt for React 19 and provides a declarative JSX interface. PixiJS v8's "render groups" offload position/scale/rotation transforms to the GPU - precisely what's needed for smooth camera scrolling.

**Key Finding:** PixiJS v8 introduced render groups which handle transforms at the GPU level. Moving a render group container with thousands of children requires zero CPU recalculation of child positions.

---

## Recommended Stack

### Core Libraries

| Library | Version | Purpose | Confidence |
|---------|---------|---------|------------|
| `pixi.js` | ^8.16.0 | WebGL/WebGPU 2D rendering engine | HIGH |
| `@pixi/react` | ^8.0.5 | React 19 bindings for PixiJS | HIGH |

### Installation

```bash
npm install pixi.js@^8.16.0 @pixi/react@^8.0.5
```

**Note:** Both libraries include TypeScript definitions. No additional @types packages needed.

---

## React 19.1.1 Integration

### Compatibility Status: CONFIRMED

@pixi/react v8 was "built from the ground up to harness the power of PixiJS v8 and designed exclusively for React 19" ([PixiJS Blog](https://pixijs.com/blog/pixi-react-v8-live)).

A previous React 19 compatibility issue ([GitHub Issue #551](https://github.com/pixijs/pixi-react/issues/551)) was resolved in `@pixi/react@8.0.0-beta.17` (December 2024). The current stable v8.0.5 includes this fix.

### Component Registration with `extend`

@pixi/react v8 uses a tree-shakeable architecture. You must explicitly register PixiJS components before use:

```typescript
import { Application, extend } from '@pixi/react';
import { Container, Sprite, Graphics } from 'pixi.js';

// Register components for JSX use
extend({ Container, Sprite, Graphics });

// Now usable as JSX
const MyComponent = () => (
  <Application>
    <pixiContainer>
      <pixiSprite texture={myTexture} />
    </pixiContainer>
  </Application>
);
```

### TypeScript Configuration

For custom components or extended types, add to a `global.d.ts`:

```typescript
import { PixiReactElementProps } from '@pixi/react';
import { Container, Sprite } from 'pixi.js';

declare module '@pixi/react' {
  interface PixiElements {
    pixiContainer: PixiReactElementProps<typeof Container>;
    pixiSprite: PixiReactElementProps<typeof Sprite>;
  }
}
```

---

## Key PixiJS v8 Features for This Project

### 1. Render Groups (GPU Transforms)

**Critical for scrolling performance.** Render groups offload position transforms to the GPU:

```typescript
// Create a render group for the camera container
const camera = new Container({ isRenderGroup: true });

// Moving this container is GPU-accelerated
// No CPU recalculation of child positions needed
camera.x = -scrollPosition;
```

From the [PixiJS documentation](https://pixijs.com/8.x/guides/concepts/render-groups):
> "When a container is promoted to a render group, transformations are applied at the GPU level, so moving a render group with complex and numerous children doesn't require recalculating rendering instructions."

**Best practice:** Use sparingly at broad levels (e.g., camera container), not per-child.

### 2. SVG to Texture Conversion

PixiJS v8 supports loading Verovio SVG output as textures:

```typescript
import { Assets, Sprite, Graphics } from 'pixi.js';

// Option A: Load SVG string directly via Graphics
const graphics = new Graphics().svg(verovioSvgString);
const texture = renderer.generateTexture(graphics);
const sprite = new Sprite(texture);

// Option B: Higher resolution rasterization
const texture = await Assets.load({
  src: 'data:image/svg+xml,' + encodeURIComponent(svgString),
  data: { resolution: 2 } // 2x resolution for retina
});
```

**Limitations:**
- Maximum texture size: 4096x4096 pixels
- Text elements, filters (blur, drop shadow), and patterns not supported
- For very wide scores, split into multiple section textures

### 3. Sprite Tinting for Highlighting

PixiJS sprites have native tinting support - no shaders required:

```typescript
const noteSprite = new Sprite(noteTexture);

// Apply highlight tint (GPU-accelerated)
noteSprite.tint = 0xFFD700; // Gold highlight

// Reset to original
noteSprite.tint = 0xFFFFFF; // White = no tint
```

From [PixiJS Scene Objects](https://pixijs.com/8.x/guides/components/scene-objects):
> "You can tint any scene object by setting the tint property, which modifies the color of the rendered pixels."

### 4. cacheAsTexture for Static Content

For static score sections, cache as texture to reduce draw calls:

```typescript
// Cache a complex container as a single texture
scoreSection.cacheAsTexture();

// Update cache when content changes
scoreSection.updateCacheTexture();

// Disable caching
scoreSection.cacheAsTexture(false);
```

**Best for:**
- Static UI elements
- Score sections that don't change during playback
- Complex containers with many children

**Avoid:**
- Containers > 4096x4096 pixels
- Frequently changing content
- Containers with very few elements

---

## Vite Compatibility

PixiJS v8 works out of the box with Vite. No special configuration required beyond the existing setup:

```typescript
// vite.config.ts - no changes needed
// pixi.js is fully ESM compatible
```

The existing `vite-plugin-wasm` for Verovio remains unaffected.

---

## What NOT to Add

### Avoid: pixi-viewport

| Library | Reason to Avoid |
|---------|-----------------|
| `pixi-viewport` | Overkill for single-axis scrolling. The renderer only needs horizontal camera movement, which is trivially implemented with a render group's `x` property. pixi-viewport adds ~15KB and complexity for features (pinch-zoom, bounce, deceleration) not needed here. |

### Avoid: @pixi/filter-* packages

| Library | Reason to Avoid |
|---------|-----------------|
| Filter packages | The highlighting requirement is fully satisfied by Sprite.tint. No need for ColorMatrixFilter or custom shaders. Filters add overhead and memory usage. |

### Avoid: @pixi-essentials/svg

| Library | Reason to Avoid |
|---------|-----------------|
| `@pixi-essentials/svg` | PixiJS v8 has built-in SVG support via `Graphics.svg()` and `Assets.load()`. The essentials package is for v7 and adds unnecessary dependency. |

### Avoid: Direct Canvas API

| Approach | Reason to Avoid |
|----------|-----------------|
| Raw Canvas 2D/WebGL | Loses React integration benefits. @pixi/react provides declarative components that work with React's reconciler, making state management natural. |

---

## Comparison: PixiJS vs Konva (Already in Project)

The project already has `konva` and `react-konva` installed. Here's the comparison:

| Criterion | PixiJS v8 | Konva |
|-----------|-----------|-------|
| **Rendering** | WebGL (GPU) | Canvas 2D (CPU) |
| **Transform performance** | GPU-accelerated via render groups | CPU-calculated |
| **React 19 support** | Native (@pixi/react v8) | Requires compatibility shim |
| **SVG loading** | Built-in, multiple methods | Via image conversion only |
| **Tinting** | Native sprite.tint | Requires filters/image manipulation |
| **Bundle size** | ~200KB | ~150KB |
| **Learning curve** | Moderate | Lower |

**Recommendation:** PixiJS is the better choice for this use case because:
1. GPU-accelerated transforms are essential for smooth scrolling
2. Native SVG support aligns with Verovio output
3. Built-in tinting eliminates shader complexity
4. React 19 support is first-class

If Konva migration was attempted and found insufficient (as suggested by the branch name), the likely issue was CPU-bound transform calculations. PixiJS's render groups solve this at the GPU level.

---

## Version Compatibility Matrix

| Library | Version | Peer Requirements | Status |
|---------|---------|-------------------|--------|
| `pixi.js` | 8.16.0 | None | Latest stable (Feb 3, 2026) |
| `@pixi/react` | 8.0.5 | `pixi.js ^8.2.6`, `react ^18.0.0 \|\| ^19.0.0` | React 19 compatible |
| `react` | 19.1.1 | - | Already installed |
| `react-dom` | 19.1.1 | - | Already installed |

All peer dependencies are satisfied by the existing project setup.

---

## Integration Architecture

Recommended component structure for the PixiJS renderer:

```
src/renderers/
  PixiSingleLineRenderer.tsx  # Main component
  lib/
    pixiSetup.ts              # extend() registration, app init
    svgToTexture.ts           # Verovio SVG -> PixiJS texture conversion
    cameraController.ts       # Render group scrolling logic
```

### Key Integration Points

1. **Verovio SVG Output:** Convert each section's SVG string to a texture using `Graphics.svg()` + `generateTexture()`
2. **Camera Container:** Create a Container with `isRenderGroup: true` for GPU-accelerated scrolling
3. **Event Positions:** Reuse existing `computeEventPositions()` logic - positions remain valid
4. **Highlighting:** Replace CSS-based notehead animation with sprite tinting

---

## Migration Path from SVG DOM

The existing SingleLineRenderer uses:
- `cameraRef.current.style.transform = translateX(...)` for scrolling
- CSS animations for notehead highlighting
- `dangerouslySetInnerHTML` for SVG injection

PixiJS equivalent:

| Current (SVG DOM) | PixiJS v8 |
|-------------------|-----------|
| CSS transform translateX | Container.x with render group |
| CSS fill color animation | Sprite.tint interpolation |
| SVG DOM elements | Sprite textures from SVG |
| requestAnimationFrame loop | PixiJS Ticker or external RAF |

---

## Sources

**Official Documentation:**
- [PixiJS v8 Render Groups](https://pixijs.com/8.x/guides/concepts/render-groups)
- [PixiJS SVG Loading](https://pixijs.com/8.x/guides/components/assets/svg)
- [PixiJS Performance Tips](https://pixijs.com/8.x/guides/concepts/performance-tips)
- [PixiJS cacheAsTexture](https://pixijs.com/8.x/guides/components/scene-objects/container/cache-as-texture)
- [PixiJS Scene Objects (Tinting)](https://pixijs.com/8.x/guides/components/scene-objects)
- [@pixi/react v8 Announcement](https://pixijs.com/blog/pixi-react-v8-live)
- [@pixi/react extend API](https://react.pixijs.io/extend/)
- [@pixi/react Getting Started](https://react.pixijs.io/getting-started/)

**Version Information:**
- [PixiJS GitHub Releases](https://github.com/pixijs/pixijs/releases) - v8.16.0 (Feb 3, 2026)
- [pixi-react GitHub](https://github.com/pixijs/pixi-react) - v8.0.5

**React 19 Compatibility:**
- [React 19 Issue Resolution](https://github.com/pixijs/pixi-react/issues/551) - Fixed in beta.17

---

## Confidence Assessment

| Area | Confidence | Reasoning |
|------|------------|-----------|
| Core versions | HIGH | Verified via GitHub releases and official docs |
| React 19 compatibility | HIGH | Official announcement + issue resolution confirmed |
| SVG to texture | HIGH | Official documentation with code examples |
| Render groups for scrolling | HIGH | Official docs explicitly describe GPU transform offloading |
| Tinting approach | HIGH | Built-in sprite.tint is documented |
| What NOT to add | MEDIUM | Based on feature analysis, not production testing |

---

## Open Questions for Phase-Specific Research

1. **SVG Text Handling:** Verovio SVG includes text elements (lyrics, dynamics). PixiJS SVG loader doesn't support text. Need to investigate if Verovio can render text as paths, or if text needs separate handling.

2. **Texture Memory:** Large scores may create many textures. Should profile memory usage and consider texture atlasing or on-demand loading for very long pieces.

3. **Transition Strategy:** Whether to run PixiJS and SVG renderers in parallel during migration, or full replacement.

---

*Stack research for: PixiJS WebGL Migration*
*Researched: 2026-02-08*
