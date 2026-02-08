# Phase 14: SVG-to-Texture Pipeline - Research

**Researched:** 2026-02-08
**Domain:** SVG rasterization, GPU texture creation, font loading, texture caching
**Confidence:** HIGH

## Summary

This phase implements the foundational conversion layer that transforms Verovio SVG section strings into PixiJS GPU textures. The pipeline uses the browser's HTMLImageElement with data URI encoding to rasterize SVG, combined with `await image.decode()` for reliable async loading. This is the critical validation point for the entire PixiJS migration - if SVG doesn't convert cleanly to textures, the approach fails here.

The key technical challenges are: (1) font loading - SVG text with custom fonts fails to render correctly because fonts are lazy-loaded and the Image API provides no events for completion, (2) black color preprocessing - PixiJS tint uses multiplicative blending where black (0x000000) multiplied by any color equals black, making black elements impossible to tint, and (3) texture caching - repeated conversions for the same section waste CPU and GPU memory.

**Primary recommendation:** Use `data:image/svg+xml,${encodeURIComponent(svgString)}` + `await image.decode()` + `Texture.from(image)` pattern, with color preprocessing to convert #000 to #111 before conversion, and verify Verovio's `smuflTextFont: "embedded"` option ensures fonts render correctly.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| pixi.js | ^8.16.0 | WebGL texture creation via `Texture.from()` | Project decision from SUMMARY.md |
| verovio | ^6.0.1 | SVG generation with embedded SMuFL fonts | Already in project, unchanged |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| document.fonts API | (browser) | Font loading verification | Before texture conversion to ensure fonts ready |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| data URI + Image decode | Graphics.svg() + generateTexture() | Graphics approach better for dynamic SVG; data URI better for existing SVG strings like Verovio output |
| Manual Map cache | PixiJS Assets.cache | Assets.cache designed for URL-based loading; Map simpler for string-keyed dynamic content |

**Installation:**
```bash
npm install pixi.js@^8.16.0
```

Note: @pixi/react installation is for Phase 15 (Basic PixiJS Renderer), not this phase.

## Architecture Patterns

### Recommended Project Structure
```
src/
├── lib/
│   └── svgToTexture.ts      # Core conversion module
├── hooks/
│   └── useSingleLineVerovio.ts  # Unchanged - continues producing SVG strings
└── renderers/
    └── PixiSingleLineRenderer.tsx  # Consumer (Phase 15)
```

### Pattern 1: Data URI + Image Decode Pipeline
**What:** Convert SVG string to PixiJS Texture using browser Image element with data URI encoding
**When to use:** Converting existing SVG strings (like Verovio output) to GPU textures
**Example:**
```typescript
// Source: https://github.com/pixijs/pixijs/discussions/10953
async function svgToTexture(svgString: string): Promise<Texture> {
  // 1. Pre-process colors for tint compatibility
  const processedSvg = preprocessSvgForTint(svgString);

  // 2. Create data URI from SVG string
  const dataUri = `data:image/svg+xml,${encodeURIComponent(processedSvg)}`;

  // 3. Create Image element and wait for decode
  const image = new Image();
  image.src = dataUri;
  await image.decode();  // Preferred over onload - returns Promise

  // 4. Create PixiJS texture from loaded image
  return Texture.from(image);
}
```

### Pattern 2: Color Preprocessing for Tint Compatibility
**What:** Replace pure black (#000, #000000, rgb(0,0,0)) with dark gray (#111111) to enable tinting
**When to use:** Always, before converting SVG to texture
**Example:**
```typescript
// Source: https://github.com/pixijs/pixijs/issues/3004 (tint multiplication explanation)
function preprocessSvgForTint(svgString: string): string {
  // Tint uses component-wise multiplication: textureColor * tintColor = finalColor
  // Black (0x000000) * any color = 0x000000 (stays black)
  // Dark gray (0x111111) * white = 0x111111 (can be tinted to any color)

  return svgString
    // Replace 3-digit hex black
    .replace(/#000(?![0-9a-fA-F])/g, '#111')
    // Replace 6-digit hex black
    .replace(/#000000/gi, '#111111')
    // Replace rgb(0,0,0) with rgb(17,17,17)
    .replace(/rgb\s*\(\s*0\s*,\s*0\s*,\s*0\s*\)/gi, 'rgb(17,17,17)');
}
```

### Pattern 3: Texture Caching with Composite Keys
**What:** Cache textures by composite key (section content hash + settings) to avoid duplicate conversions
**When to use:** When same section may be rendered multiple times
**Example:**
```typescript
// Simple Map-based cache for dynamic SVG content
const textureCache = new Map<string, Texture>();

function getCacheKey(svgString: string, scale: number, font: string): string {
  // Use combination of content hash and settings
  // For simplicity, use content length + first/last 100 chars as fingerprint
  const contentFingerprint = `${svgString.length}_${svgString.slice(0, 100)}_${svgString.slice(-100)}`;
  return `${contentFingerprint}_${scale}_${font}`;
}

async function getOrCreateTexture(
  svgString: string,
  scale: number,
  font: string
): Promise<Texture> {
  const key = getCacheKey(svgString, scale, font);

  if (textureCache.has(key)) {
    return textureCache.get(key)!;
  }

  const texture = await svgToTexture(svgString);
  textureCache.set(key, texture);
  return texture;
}
```

### Pattern 4: Font Loading Verification
**What:** Ensure SMuFL fonts are fully loaded before texture conversion
**When to use:** Before any SVG-to-texture conversion that contains text
**Example:**
```typescript
// Source: https://developer.mozilla.org/en-US/docs/Web/API/CSS_Font_Loading_API
async function ensureFontsLoaded(): Promise<void> {
  // Verovio embeds SMuFL fonts as base64 in SVG by default (smuflTextFont: "embedded")
  // However, if using external font references, we must wait for them

  // Option 1: Wait for all fonts in document
  await document.fonts.ready;

  // Option 2: Explicitly load specific fonts (if not using embedded)
  // await document.fonts.load('400 1em Bravura');
}

// Call before texture conversion batch
async function sectionsToTextures(
  sections: string[],
  scale: number,
  font: string
): Promise<Texture[]> {
  // Ensure fonts are ready before any conversion
  await ensureFontsLoaded();

  return Promise.all(
    sections.map(svg => getOrCreateTexture(svg, scale, font))
  );
}
```

### Anti-Patterns to Avoid
- **Using onload instead of decode():** `image.onload` is callback-based and race-prone; `await image.decode()` returns a Promise and is the modern approach
- **Mass parallel conversions:** Creating thousands of textures simultaneously queues browser work; batch reasonably (e.g., 10-20 concurrent)
- **Skipping color preprocessing:** Black elements will be impossible to tint, breaking highlighting functionality in Phase 17
- **Converting same section multiple times:** Without caching, each conversion creates new GPU texture, wasting memory
- **Using PixiJS Assets.cache for dynamic content:** Assets.cache is designed for URL-based loading; use simple Map for string-keyed dynamic SVG content

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SVG text rendering | Custom font embedding | Verovio `smuflTextFont: "embedded"` option | Verovio already embeds base64 fonts in SVG by default |
| Texture creation from Image | Custom WebGL texture upload | `Texture.from(image)` | PixiJS handles WebGL texture format, mipmaps, etc. |
| Image loading promise | Custom Promise wrapper around onload | `image.decode()` | Browser API, handles edge cases, returns Promise |
| Hex color parsing | Regex-only color replacement | Keep regex for SVG, but verify with tests | SVG color formats are well-defined but have edge cases |

**Key insight:** Verovio with `smuflTextFont: "embedded"` (the default) produces self-contained SVG with base64-encoded fonts. This eliminates the font loading problem for music symbols. Only verify `document.fonts.ready` if using external text fonts or non-embedded mode.

## Common Pitfalls

### Pitfall 1: Font Rendering Failure in Textures
**What goes wrong:** Text elements render as rectangles or wrong glyphs when SVG is converted to texture
**Why it happens:** Fonts are lazy-loaded; Image API provides no events for font loading completion; conversion happens before fonts are ready
**How to avoid:**
1. Verify Verovio options include `smuflTextFont: "embedded"` (default) for base64-embedded fonts
2. Call `await document.fonts.ready` before conversion batch if any external fonts are used
3. Test with actual Verovio output to verify fonts render correctly
**Warning signs:** Music symbols appear as boxes or question marks in rendered textures

### Pitfall 2: Black Elements Cannot Be Tinted
**What goes wrong:** When applying tint to highlight notes, black elements remain black instead of changing color
**Why it happens:** PixiJS tint uses multiplicative blending: `textureColor * tintColor = finalColor`. Black (0,0,0) multiplied by any color equals (0,0,0)
**How to avoid:** Preprocess SVG to replace #000, #000000, rgb(0,0,0) with #111111, rgb(17,17,17) before texture conversion
**Warning signs:** Test tinting early; if black elements don't change color, preprocessing is missing

### Pitfall 3: Texture Size Limit Exceeded
**What goes wrong:** Large sections fail to convert or render clipped/distorted
**Why it happens:** GPU textures have max size (typically 4096x4096, mobile may be 2048x2048)
**How to avoid:**
1. Query `gl.getParameter(gl.MAX_TEXTURE_SIZE)` on init
2. Keep section widths under 2048px for mobile safety
3. Adjust `measuresPerSection` in useSingleLineVerovio if sections exceed limit
**Warning signs:** Sections render partially or throw WebGL errors on some devices

### Pitfall 4: Memory Leak from Uncached Duplicate Textures
**What goes wrong:** GPU memory grows continuously during playback
**Why it happens:** Same section converted multiple times creates duplicate textures; old textures not destroyed
**How to avoid:** Always use texture cache; return same texture for same content+settings
**Warning signs:** Chrome Task Manager shows GPU memory increasing over time

### Pitfall 5: Encode URIComponent vs btoa Confusion
**What goes wrong:** SVG fails to load or renders incorrectly
**Why it happens:** Using wrong encoding for data URI; btoa requires pure ASCII, fails on Unicode
**How to avoid:** Always use `encodeURIComponent()` for SVG data URIs, not `btoa()`
**Warning signs:** Console errors about invalid data URI or malformed base64

## Code Examples

Verified patterns from official sources:

### Complete svgToTexture Module
```typescript
// src/lib/svgToTexture.ts
import { Texture } from 'pixi.js';

// Regex patterns for color preprocessing (compiled once at module load)
const BLACK_3_DIGIT = /#000(?![0-9a-fA-F])/g;
const BLACK_6_DIGIT = /#000000/gi;
const BLACK_RGB = /rgb\s*\(\s*0\s*,\s*0\s*,\s*0\s*\)/gi;

// Cache for converted textures
const textureCache = new Map<string, Texture>();

/**
 * Preprocess SVG colors for PixiJS tint compatibility.
 * Converts pure black to dark gray so tint multiplication works.
 *
 * Source: https://github.com/pixijs/pixijs/issues/3004
 */
export function preprocessSvgForTint(svgString: string): string {
  return svgString
    .replace(BLACK_3_DIGIT, '#111')
    .replace(BLACK_6_DIGIT, '#111111')
    .replace(BLACK_RGB, 'rgb(17,17,17)');
}

/**
 * Generate cache key from SVG content and render settings.
 */
function getCacheKey(svgString: string, scale: number, font: string): string {
  // Use content fingerprint for cache key
  const fingerprint = `${svgString.length}_${svgString.slice(0, 100)}_${svgString.slice(-100)}`;
  return `${fingerprint}_${scale}_${font}`;
}

/**
 * Convert SVG string to PixiJS Texture.
 *
 * Source: https://github.com/pixijs/pixijs/discussions/10953
 */
export async function svgToTexture(svgString: string): Promise<Texture> {
  // Preprocess for tint compatibility
  const processedSvg = preprocessSvgForTint(svgString);

  // Create data URI
  const dataUri = `data:image/svg+xml,${encodeURIComponent(processedSvg)}`;

  // Load via Image element
  const image = new Image();
  image.src = dataUri;

  // Wait for decode (modern Promise-based approach)
  await image.decode();

  // Create PixiJS texture
  return Texture.from(image);
}

/**
 * Get texture from cache or create new one.
 */
export async function getOrCreateTexture(
  svgString: string,
  scale: number,
  font: string
): Promise<Texture> {
  const key = getCacheKey(svgString, scale, font);

  const cached = textureCache.get(key);
  if (cached) {
    return cached;
  }

  const texture = await svgToTexture(svgString);
  textureCache.set(key, texture);
  return texture;
}

/**
 * Convert multiple sections to textures with font loading verification.
 */
export async function sectionsToTextures(
  sections: string[],
  scale: number,
  font: string
): Promise<Texture[]> {
  // Ensure all fonts are loaded before conversion
  await document.fonts.ready;

  // Convert all sections (can parallelize since fonts are ready)
  return Promise.all(
    sections.map(svg => getOrCreateTexture(svg, scale, font))
  );
}

/**
 * Clear texture cache and destroy textures.
 * Call when unmounting or changing scores.
 */
export function clearTextureCache(): void {
  for (const texture of textureCache.values()) {
    texture.destroy(true);  // true = destroy base texture too
  }
  textureCache.clear();
}

/**
 * Get current cache size for debugging.
 */
export function getTextureCacheSize(): number {
  return textureCache.size;
}
```

### Integration with useSingleLineVerovio
```typescript
// Example usage in a future PixiJS renderer
import { useSingleLineVerovio } from '../hooks/useSingleLineVerovio';
import { sectionsToTextures, clearTextureCache } from '../lib/svgToTexture';

function PixiSingleLineRenderer({ xml, scale, font }) {
  const { sections, sectionWidths, isLoading } = useSingleLineVerovio(xml, scale, 15, font);
  const [textures, setTextures] = useState<Texture[]>([]);

  useEffect(() => {
    if (sections.length === 0) return;

    // Convert all sections to textures
    sectionsToTextures(sections, scale, font)
      .then(setTextures)
      .catch(console.error);

    // Cleanup on unmount or section change
    return () => {
      clearTextureCache();
    };
  }, [sections, scale, font]);

  // ... render with textures
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `PIXI.Texture.from(svgString)` | data URI + image.decode() + Texture.from(image) | PixiJS v8 (2024) | SVGResource removed in v8; must use Image element |
| `image.onload` callback | `await image.decode()` | Browser standard | Promise-based, more reliable, avoids race conditions |
| BaseTexture + Texture | Texture + TextureSource | PixiJS v8 | Simplified texture hierarchy |
| External font loading | Verovio embedded fonts | Verovio default | smuflTextFont: "embedded" eliminates font loading issues |

**Deprecated/outdated:**
- `PIXI.Texture.from(svgString)`: Removed in PixiJS v8; SVGResource class no longer exists
- `BaseTexture`: Replaced by TextureSource in v8
- `@pixi-essentials/svg`: May conflict with v8; prefer built-in approaches

## Open Questions

Things that couldn't be fully resolved:

1. **Verovio smuflTextFont verification**
   - What we know: Verovio documentation states `smuflTextFont: "embedded"` is the default
   - What's unclear: Need to verify actual SVG output contains base64 font data
   - Recommendation: Test with actual Verovio output in Phase 14 implementation; if fonts render as boxes, investigate options

2. **Optimal cache key strategy**
   - What we know: Using content fingerprint (length + first/last chars) works for most cases
   - What's unclear: Whether hash collision is possible with real score content
   - Recommendation: Start with simple fingerprint; add full hash if collisions observed

3. **Texture memory limits for long scores**
   - What we know: Each section at 2000x400px uses ~3MB GPU memory
   - What's unclear: Exact memory limits on mobile Safari
   - Recommendation: Implement cache eviction in Phase 18 (Section Virtualization) if needed

## Sources

### Primary (HIGH confidence)
- [PixiJS v8 SVG Loading Guide](https://pixijs.com/8.x/guides/components/assets/svg) - Official texture size limits, loading patterns
- [PixiJS v8 Assets Documentation](https://pixijs.com/8.x/guides/components/assets) - Cache behavior and asset management
- [PixiJS Dynamic SVG Discussion #10953](https://github.com/pixijs/pixijs/discussions/10953) - Data URI + image.decode() pattern
- [PixiJS Tint Implementation #3004](https://github.com/pixijs/pixijs/issues/3004) - Multiplicative blending explanation
- [MDN CSS Font Loading API](https://developer.mozilla.org/en-US/docs/Web/API/CSS_Font_Loading_API) - document.fonts.ready pattern
- [PixiJS Cache Class](https://pixijs.download/dev/docs/assets.Cache.html) - Cache.set/get/has methods
- [Verovio Toolkit Options](https://book.verovio.org/toolkit-reference/toolkit-options.html) - smuflTextFont option documentation

### Secondary (MEDIUM confidence)
- [PixiJS SVG Font Discussion #7448](https://github.com/pixijs/pixijs/discussions/7448) - Font loading issues and solutions
- [Project SUMMARY.md](.planning/research/SUMMARY.md) - Prior decisions on PixiJS stack and tint approach

### Tertiary (LOW confidence)
- WebSearch results on regex color replacement - Multiple sources agree on approach but no single authoritative reference

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - PixiJS v8 patterns verified via official discussions and documentation
- Architecture: HIGH - Data URI + decode pattern confirmed by PixiJS maintainers in GitHub discussion
- Color preprocessing: HIGH - Multiplicative tint formula verified in GitHub issue with maintainer response
- Font loading: MEDIUM - Verovio embedded fonts documented but not tested with actual output
- Caching: MEDIUM - Simple approach, may need refinement based on actual usage patterns

**Research date:** 2026-02-08
**Valid until:** 2026-03-08 (30 days - PixiJS v8 is stable)
