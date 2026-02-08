# Phase 15: Basic PixiJS Renderer - Research

**Researched:** 2026-02-08
**Domain:** PixiJS v8 + @pixi/react with React 19 integration
**Confidence:** HIGH

## Summary

This phase implements a PixiJS-based renderer for static score display, integrating with the existing `useSingleLineVerovio` hook and the `svgToTexture` module from Phase 14. The research focuses on @pixi/react v8 patterns for React 19, proper resource cleanup on unmount, and WebGL context loss recovery.

The standard approach is to use @pixi/react v8.0.5 with its JSX pragma system (lowercase `pixi`-prefixed components), the `extend` API for tree-shaking, and the `useApplication` hook to access the PixiJS Application instance for context loss handler registration. Resource cleanup is handled by the Application component's automatic cleanup on unmount, supplemented by manual texture cache clearing via the Phase 14 `clearTextureCache()` function.

**Primary recommendation:** Use @pixi/react v8 with the `extend` API pattern, register WebGL context loss handlers via `app.canvas.addEventListener()` in a child component using `useApplication`, and call `clearTextureCache()` in a cleanup useEffect.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| pixi.js | ^8.16.0 | WebGL/WebGPU 2D rendering engine | Already installed, required by prior decisions |
| @pixi/react | ^8.0.5 | React 19 bindings for PixiJS v8 | Official PixiJS React integration, rebuilt for React 19 |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| (none required) | - | - | Phase 14 svgToTexture.ts handles all texture conversion |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| @pixi/react | Manual PixiJS in useRef | More control but loses React declarative benefits, more cleanup boilerplate |
| Sprite components | Manual Texture management | Sprite is simpler, texture lifecycle handled by PixiJS |

**Installation:**
```bash
npm install @pixi/react
```

Note: pixi.js@^8.16.0 is already installed. @pixi/react 8.0.5 requires pixi.js@^8.2.6 (compatible with 8.16.0).

## Architecture Patterns

### Recommended Project Structure
```
src/
├── renderers/
│   ├── SingleLineRenderer.tsx      # Existing SVG renderer (keep unchanged)
│   └── PixiSingleLineRenderer.tsx  # New PixiJS renderer (Phase 15)
├── components/
│   └── pixi/
│       └── SectionSprite.tsx       # (Optional) If sprite logic is complex
├── lib/
│   └── svgToTexture.ts             # Phase 14 module (use as-is)
└── hooks/
    └── useSingleLineVerovio.ts     # Existing hook (use as-is)
```

### Pattern 1: @pixi/react v8 Extend API
**What:** Register only the PixiJS components you need to minimize bundle size
**When to use:** Always required in @pixi/react v8
**Example:**
```typescript
// Source: https://github.com/pixijs/pixi-react
import { Application, extend, useApplication } from '@pixi/react';
import { Container, Sprite } from 'pixi.js';

// Register components before using them in JSX
extend({ Container, Sprite });

function MyComponent() {
  return (
    <Application>
      <pixiContainer x={0} y={0}>
        <pixiSprite texture={myTexture} x={100} y={0} />
      </pixiContainer>
    </Application>
  );
}
```

### Pattern 2: Accessing Application via Hook
**What:** Use `useApplication` hook to get the PixiJS Application instance in child components
**When to use:** When you need access to renderer, canvas, or stage
**Example:**
```typescript
// Source: https://react.pixijs.io/hooks/useApplication/
import { useApplication } from '@pixi/react';

function ChildComponent() {
  const { app } = useApplication();

  // Access canvas for event listeners
  const canvas = app.canvas;
  // Access renderer for WebGL context
  const renderer = app.renderer;

  return <pixiSprite texture={texture} />;
}
```

### Pattern 3: WebGL Context Loss Handling
**What:** Register handlers for WebGL context loss/restore on the canvas element
**When to use:** Required for REN-05 compliance
**Example:**
```typescript
// Source: MDN webglcontextlost event + PixiJS patterns
import { useApplication } from '@pixi/react';
import { useEffect } from 'react';

function ContextLossHandler() {
  const { app } = useApplication();

  useEffect(() => {
    const canvas = app.canvas;

    const handleContextLost = (event: Event) => {
      console.warn('[PixiRenderer] WebGL context lost');
      // PixiJS handles internal state; we log for observability
    };

    const handleContextRestored = () => {
      console.log('[PixiRenderer] WebGL context restored');
      // Textures may need re-creation - PixiJS handles most cases
    };

    canvas.addEventListener('webglcontextlost', handleContextLost);
    canvas.addEventListener('webglcontextrestored', handleContextRestored);

    return () => {
      canvas.removeEventListener('webglcontextlost', handleContextLost);
      canvas.removeEventListener('webglcontextrestored', handleContextRestored);
    };
  }, [app]);

  return null; // Render nothing, just handles events
}
```

### Pattern 4: Texture Cleanup on Unmount
**What:** Clear texture cache when component unmounts to free GPU memory
**When to use:** Required for REN-04 compliance
**Example:**
```typescript
// Source: Phase 14 svgToTexture.ts
import { clearTextureCache } from '../lib/svgToTexture';
import { useEffect } from 'react';

function PixiSingleLineRenderer() {
  useEffect(() => {
    return () => {
      // Called on unmount
      clearTextureCache();
    };
  }, []);

  return <Application>...</Application>;
}
```

### Pattern 5: Horizontal Sprite Layout
**What:** Position section sprites horizontally using sectionOffsets
**When to use:** Core rendering pattern for this phase
**Example:**
```typescript
// Position sprites using offsets from useSingleLineVerovio
{sections.map((_, index) => (
  <pixiSprite
    key={index}
    texture={textures[index]}
    x={sectionOffsets[index]}
    y={0}
  />
))}
```

### Anti-Patterns to Avoid
- **Creating Application outside React lifecycle:** Always use `<Application>` component, never `new PIXI.Application()` directly in React
- **Using RenderGroup for every sprite:** Excessive RenderGroups degrade performance; use only for distinct scene parts (camera container)
- **Calling extend() inside component body:** Call `extend()` at module level or in useExtend() hook, not in render
- **Accessing `useApplication()` in same component as `<Application>`:** The hook only works in CHILD components

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SVG-to-texture conversion | Custom canvas rendering | Phase 14 `svgToTexture.ts` | Handles fonts, color preprocessing, caching |
| Texture caching | Manual Map/WeakMap | Phase 14 `getOrCreateTexture()` | Already optimized with fingerprinting |
| GPU memory cleanup | Manual texture.destroy() calls | Phase 14 `clearTextureCache()` | Properly destroys base textures |
| Application lifecycle | useRef + new Application() | @pixi/react `<Application>` | Handles init/destroy automatically |
| React-PixiJS bridge | Custom reconciler | @pixi/react JSX pragma | Production-tested, TypeScript support |

**Key insight:** Phase 14 already solved the hard texture management problems. This phase is primarily React integration and layout.

## Common Pitfalls

### Pitfall 1: Application Not Initialized Before Child Render
**What goes wrong:** `useApplication()` returns undefined or throws because Application hasn't initialized
**Why it happens:** Application.init() is async; React renders children before it completes
**How to avoid:** @pixi/react handles this internally - children only render after init. Don't conditionally render Application.
**Warning signs:** "Cannot read property 'canvas' of undefined" errors

### Pitfall 2: Memory Leak from Texture Cache
**What goes wrong:** GPU memory grows unbounded on score changes
**Why it happens:** Phase 14's texture cache persists across renders; must be cleared on unmount
**How to avoid:** Call `clearTextureCache()` in useEffect cleanup
**Warning signs:** Chrome DevTools shows increasing GPU memory, eventual WebGL context loss

### Pitfall 3: Stale Textures After Score Change
**What goes wrong:** Old score still displays after XML changes
**Why it happens:** Texture cache key matches despite different content (unlikely but possible with fingerprinting edge cases)
**How to avoid:** Clear cache before loading new score, or include score hash in cache key
**Warning signs:** Visual mismatch between expected and displayed score

### Pitfall 4: Stage Size Mismatch
**What goes wrong:** Score is clipped or has extra whitespace
**Why it happens:** Application canvas size doesn't match score dimensions
**How to avoid:** Set Application width/height to match `totalWidth` and `maxHeight` from hook
**Warning signs:** Score appears cropped or positioned incorrectly

### Pitfall 5: Tint Not Working on Black Elements
**What goes wrong:** Tint color change has no effect
**Why it happens:** PixiJS tint is multiplicative; black * anything = black
**How to avoid:** Phase 14's `preprocessSvgForTint()` converts black to dark gray (#111)
**Warning signs:** Elements remain black regardless of tint value
**Note:** This is already handled by Phase 14, but critical to understand for debugging

### Pitfall 6: Context Loss Without Recovery
**What goes wrong:** App shows blank canvas after GPU reclaim (e.g., after long background tab)
**Why it happens:** WebGL context lost, textures need recreation
**How to avoid:** Register contextlost/contextrestored handlers (REN-05)
**Warning signs:** Blank canvas after tab switch or system sleep

## Code Examples

Verified patterns from official sources:

### Complete PixiSingleLineRenderer Structure
```typescript
// Source: Synthesis of @pixi/react docs + Phase 14 patterns
import { Application, extend, useApplication } from '@pixi/react';
import { Container, Sprite } from 'pixi.js';
import { useEffect, useState } from 'react';
import { useSingleLineVerovio } from '../hooks/useSingleLineVerovio';
import { sectionsToTextures, clearTextureCache, TextureResult } from '../lib/svgToTexture';

// Register PixiJS components at module level
extend({ Container, Sprite });

interface Props {
  xml: string;
  scoreScale?: number;
  musicFont?: string;
}

// Child component to handle context loss (needs useApplication)
function ContextLossHandler() {
  const { app } = useApplication();

  useEffect(() => {
    const canvas = app.canvas;

    const handleLost = (e: Event) => console.warn('[Pixi] Context lost');
    const handleRestored = () => console.log('[Pixi] Context restored');

    canvas.addEventListener('webglcontextlost', handleLost);
    canvas.addEventListener('webglcontextrestored', handleRestored);

    return () => {
      canvas.removeEventListener('webglcontextlost', handleLost);
      canvas.removeEventListener('webglcontextrestored', handleRestored);
    };
  }, [app]);

  return null;
}

export default function PixiSingleLineRenderer({ xml, scoreScale = 1, musicFont = 'Bravura' }: Props) {
  const verovioScale = Math.round(40 * scoreScale);
  const { sections, sectionOffsets, totalWidth, maxHeight, isLoading } =
    useSingleLineVerovio(xml, verovioScale, 15, musicFont);

  const [textures, setTextures] = useState<TextureResult[]>([]);

  // Convert sections to textures when they change
  useEffect(() => {
    if (sections.length === 0) return;

    let cancelled = false;

    sectionsToTextures(sections, verovioScale, musicFont)
      .then(results => {
        if (!cancelled) setTextures(results);
      });

    return () => { cancelled = true; };
  }, [sections, verovioScale, musicFont]);

  // Cleanup textures on unmount
  useEffect(() => {
    return () => {
      clearTextureCache();
    };
  }, []);

  if (isLoading || textures.length === 0) {
    return <div>Loading...</div>;
  }

  return (
    <Application
      width={totalWidth}
      height={maxHeight}
      backgroundColor={0xffffff}
      backgroundAlpha={0}
    >
      <ContextLossHandler />
      <pixiContainer x={0} y={0}>
        {textures.map((result, index) => (
          <pixiSprite
            key={index}
            texture={result.texture}
            x={sectionOffsets[index]}
            y={0}
          />
        ))}
      </pixiContainer>
    </Application>
  );
}
```

### Application Destroy Options (for reference)
```typescript
// Source: https://pixijs.download/dev/docs/app.Application.html
// Note: @pixi/react handles this automatically, but useful for debugging

// When manually destroying:
app.destroy(
  true,  // Remove canvas from DOM
  {
    children: true,     // Destroy all children
    texture: true,      // Destroy textures
    textureSource: true // Destroy texture sources (base textures)
  }
);
```

### RenderGroup for Camera (Future Phase)
```typescript
// Source: https://pixijs.com/8.x/guides/concepts/render-groups
// For Phase 16+ when implementing camera panning

import { Container } from 'pixi.js';

// Create camera container with GPU-accelerated transforms
const cameraContainer = new Container({ isRenderGroup: true });

// Moving this container is GPU-accelerated
cameraContainer.x = -scrollPosition;
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| @pixi/react v7 with `<Stage>` | @pixi/react v8 with `<Application>` | March 2025 | Complete rewrite, new JSX pragma |
| PascalCase `<Sprite>` imports | lowercase `<pixiSprite>` via pragma | v8 | No wrapper components needed |
| Automatic Pixi imports | `extend()` API for tree-shaking | v8 | Smaller bundles, explicit dependencies |
| `useApp()` hook | `useApplication()` hook | v8 | Same functionality, clearer name |
| `image` prop on Sprite | `texture` prop on Sprite | v8 | Matches PixiJS core API |

**Deprecated/outdated:**
- `@inlet/react-pixi`: Old package name, replaced by `@pixi/react`
- `<Stage>` component: v7 pattern, replaced by `<Application>` in v8
- Importing components from `@pixi/react`: v7 pattern, now import from `pixi.js` directly

## Open Questions

Things that couldn't be fully resolved:

1. **Context Loss Texture Recreation**
   - What we know: PixiJS internally handles context restoration, but textures may need recreation
   - What's unclear: Whether svgToTexture cached textures survive context loss automatically
   - Recommendation: Test context loss with WEBGL_lose_context extension; may need to clear and rebuild cache on restore

2. **Application backgroundAlpha with transparent canvas**
   - What we know: Application accepts backgroundColor and backgroundAlpha options
   - What's unclear: Whether backgroundAlpha: 0 works correctly for overlay use cases
   - Recommendation: Test with actual background image behind canvas; adjust if needed

3. **Performance with Many Section Sprites**
   - What we know: Each sprite is a draw call; RenderGroups batch children
   - What's unclear: Whether section count (15-20) is enough to benefit from RenderGroup
   - Recommendation: Profile first, add RenderGroup only if needed (Phase 16+)

## Sources

### Primary (HIGH confidence)
- [PixiJS React v8 GitHub](https://github.com/pixijs/pixi-react) - extend API, component patterns
- [PixiJS React Docs - Application](https://react.pixijs.io/components/application/) - Application props
- [PixiJS React Docs - useApplication](https://react.pixijs.io/hooks/useApplication/) - Hook usage
- [PixiJS 8.x Docs - Application](https://pixijs.download/dev/docs/app.Application.html) - destroy options
- [PixiJS 8.x Docs - RenderGroups](https://pixijs.com/8.x/guides/concepts/render-groups) - GPU camera pattern
- [PixiJS 8.x Docs - Garbage Collection](https://pixijs.com/8.x/guides/concepts/garbage-collection) - Texture cleanup
- [MDN - webglcontextlost event](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/webglcontextlost_event) - Context loss handling

### Secondary (MEDIUM confidence)
- [PixiJS React v8 Blog Post](https://pixijs.com/blog/pixi-react-v8-live) - v8 features and migration
- [PixiJS GitHub Issue #493](https://github.com/pixijs/pixi-react/issues/493) - v8 development notes

### Tertiary (LOW confidence)
- WebSearch results about memory leaks in PixiJS 8 - some issues may be version-specific

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Official PixiJS React documentation, verified versions
- Architecture: HIGH - Patterns from official docs and Phase 14 established patterns
- Pitfalls: MEDIUM - Synthesized from GitHub issues and general PixiJS patterns

**Research date:** 2026-02-08
**Valid until:** 2026-03-08 (30 days - @pixi/react is stable post-v8 release)
