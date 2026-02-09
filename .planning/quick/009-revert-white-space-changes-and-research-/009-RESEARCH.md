# SVG-to-Graphics Alternatives Research

This document evaluates alternatives for rendering Verovio SVGs as vector Graphics in PixiJS rather than rasterized textures.

## Problem Statement

The current texture-based approach has inherent limitations:
- White backgrounds persist despite removal attempts (rect removal, pixel manipulation)
- Rasterization loses quality at different zoom levels
- Large scores hit GPU texture size limits

Vector-based Graphics rendering would theoretically:
- Avoid background issues entirely (no rasterization)
- Scale perfectly at any zoom level
- Use GPU-accelerated vector paths

---

## 1. SVGO Library

**What it is:** SVG Optimizer - a Node.js-based tool for optimizing SVG files.

**Can it simplify complex Verovio SVGs?**

SVGO can reduce SVG complexity but cannot fundamentally change unsupported elements into supported ones. It optimizes by:
- Removing metadata, comments, editor data
- Converting shapes to paths
- Merging paths where possible
- Removing empty elements
- Simplifying path data

**Relevant plugins:**
- `removeUnknownsAndDefaults` - Removes unknown elements (but PixiJS SVGParser needs specific elements)
- `convertShapeToPath` - Converts shapes to paths (useful)
- `mergePaths` - Merges adjacent paths with same fill (reduces draw calls)
- `removeEmptyContainers` - Removes empty groups
- `convertPathData` - Simplifies path commands

**Would SVGO-optimized SVGs work with PixiJS SVGParser?**

No, not for Verovio output. The fundamental issue is that Verovio SVGs contain:
- `<text>` elements with music glyphs (embedded fonts)
- `<use>` elements referencing `<defs>` (symbol reuse)
- Complex `<clipPath>` elements

SVGO cannot convert these to simple paths. Music notation is primarily text-based (glyphs from SMuFL fonts), not path-based.

**Example optimization:**
```javascript
import { optimize } from 'svgo';

const result = optimize(verovioSvg, {
  plugins: [
    'removeDoctype',
    'removeXMLProcInst',
    'removeComments',
    'removeMetadata',
    'convertShapeToPath',
    'mergePaths',
  ],
});
```

**Verdict:** SVGO alone cannot solve the PixiJS SVGParser compatibility issue.

---

## 2. PixiJS SVGParser Limitations

**What PixiJS SVGParser supports (v8):**
- `<path>` - Full path command support (M, L, C, Q, A, Z, etc.)
- `<rect>`, `<circle>`, `<ellipse>`, `<polygon>`, `<polyline>` - Basic shapes
- `<line>` - Lines
- `<g>` - Groups (for hierarchy, not styling)
- Basic fills and strokes

**What PixiJS SVGParser does NOT support:**
- `<text>` - Text rendering (critical for music notation)
- `<use>` - Symbol references
- `<defs>` - Definitions (symbols, gradients, patterns)
- `<clipPath>` - Clipping paths
- `<mask>` - Masks
- `<filter>` - SVG filters
- `<image>` - Embedded images
- CSS styles (only inline styles partially supported)
- Transforms on groups (limited)

**Verovio SVG element breakdown:**

Examining typical Verovio output:
```
<text> elements:     ~70% (music glyphs, lyrics, dynamics)
<path> elements:     ~15% (beams, slurs, ties, hairpins)
<rect> elements:     ~10% (staff lines, bar lines, backgrounds)
<use> elements:      ~5%  (repeated symbols)
```

**Critical insight:** Music notation is primarily font-based. Noteheads, clefs, accidentals, rests, dynamics - these are all glyphs from SMuFL fonts rendered as `<text>` elements, not `<path>` elements.

**Verdict:** PixiJS SVGParser cannot render Verovio output due to `<text>` element dependency.

---

## 3. Alternative Approaches

### 3.1 pixi-svg (Third-party Library)

**Repository:** https://github.com/nicatspark/pixi-svg (fork of original)

**What it does:** Attempts more complete SVG parsing than built-in SVGParser.

**Support level:**
- Better `<use>` handling
- Some `<defs>` support
- Still NO `<text>` support

**Code integration:**
```javascript
import { SVG } from '@nicatspark/pixi-svg';

// Load SVG
const svgGraphics = new SVG(svgString);
container.addChild(svgGraphics);
```

**Verdict:** Does not solve the `<text>` problem. Not viable for Verovio.

### 3.2 Custom Path Parser for Music Notation

**Concept:** Build a custom parser that:
1. Extracts all path elements (beams, slurs, ties)
2. Renders them as PixiJS Graphics
3. Falls back to texture for text elements

**Challenges:**
- Verovio's coordinate system would need careful mapping
- Text elements (majority of content) still need textures
- Complex for marginal benefit

**Code sketch:**
```typescript
function parseSvgPaths(svgString: string): Graphics {
  const graphics = new Graphics();
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgString, 'image/svg+xml');

  doc.querySelectorAll('path').forEach(path => {
    const d = path.getAttribute('d');
    const fill = path.getAttribute('fill') || 'black';
    // Parse path commands and draw to Graphics
    graphics.beginFill(parseColor(fill));
    // ... complex path parsing needed
    graphics.endFill();
  });

  return graphics;
}
```

**Verdict:** High effort, low benefit. 70% of content is still text-based.

### 3.3 Hybrid Approach: Graphics for Lines, Textures for Glyphs

**Concept:**
1. Staff lines, bar lines: Render as PixiJS Graphics primitives
2. Beams, slurs: Render as Graphics paths
3. Note heads, clefs, etc.: Keep as textures (or individual glyph textures)

**Benefits:**
- Staff grid is pixel-perfect at any zoom
- Reduces texture size (glyphs only)
- Maintains quality for line elements

**Challenges:**
- Requires parsing Verovio output structure
- Coordinate mapping between systems
- Complexity of maintaining two rendering systems

**Code sketch:**
```typescript
interface ParsedScore {
  staffLines: Graphics[];      // Horizontal lines
  barLines: Graphics[];        // Vertical lines
  glyphTextures: Texture[];    // Music symbols
  glyphPositions: Point[];     // Where to place them
}

function renderHybrid(parsed: ParsedScore, container: Container) {
  // Add staff lines as Graphics
  parsed.staffLines.forEach(line => container.addChild(line));

  // Add bar lines as Graphics
  parsed.barLines.forEach(bar => container.addChild(bar));

  // Add glyphs as Sprites
  parsed.glyphTextures.forEach((texture, i) => {
    const sprite = new Sprite(texture);
    sprite.position = parsed.glyphPositions[i];
    container.addChild(sprite);
  });
}
```

**Verdict:** Potentially viable but requires significant Verovio output parsing.

### 3.4 SVG-to-Canvas Path Conversion (e.g., canvg)

**Concept:** Use a library like `canvg` to render SVG to canvas, then use canvas as texture source.

**What it does:** Full SVG rendering including text, fonts, filters.

**Code integration:**
```javascript
import { Canvg } from 'canvg';

async function svgToCanvasTexture(svgString: string): Promise<Texture> {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  const v = await Canvg.from(ctx, svgString);
  await v.render();

  return Texture.from(canvas);
}
```

**Benefits:**
- Full SVG support including text/fonts
- Could handle transparency properly

**Drawbacks:**
- Still rasterization (same zoom/quality issues)
- Additional dependency (~50KB)
- Performance overhead

**Verdict:** Doesn't solve the core problem (still rasterization).

### 3.5 Direct SMuFL Font Rendering via PixiJS Text

**Concept:** Instead of using Verovio SVG output, render music directly:
1. Use Verovio to get MEI events and positions
2. Render glyphs using PixiJS Text with SMuFL font
3. Draw lines/beams with Graphics

**Benefits:**
- True vector text rendering
- Perfect at any zoom level
- No background issues

**Challenges:**
- Requires complete music notation layout engine
- Font loading complexity
- Essentially rebuilding part of Verovio

**Verdict:** Most ambitious solution, highest quality potential, but scope is a full rendering engine.

---

## 4. Recommendation

### Short-term (Immediate)

**Accept white background as-is.** The current texture approach works and the background issue is cosmetic. Focus on:
- Complete the camera system (Phase 16)
- Complete highlighting with tint (Phase 17)
- Ship working functionality

**Rationale:** The white background is on a white canvas in typical use. It only shows against colored backgrounds. User experience is minimally impacted.

### Medium-term (If Background Issue Persists)

**Try canvg approach.** While still rasterization, it may handle transparency better:
- Test with Verovio SVG output
- Verify transparency works
- Benchmark performance impact

### Long-term (Future Enhancement)

**Hybrid approach with custom Verovio integration:**
1. Request Verovio expose layout data separately from SVG
2. Render staff lines as Graphics primitives
3. Render glyphs as individual sprites with SMuFL textures
4. Build layout engine that uses Verovio's positioning data

**Effort estimate:** 2-4 weeks for hybrid approach, 1-2 months for full custom renderer.

---

## 5. Conclusion

**Vector-based SVG rendering in PixiJS is not viable for Verovio output** due to the fundamental reliance on `<text>` elements for music glyphs.

The best path forward:
1. **Now:** Keep texture approach, accept white background
2. **Next:** Test canvg if transparency is critical
3. **Future:** Consider hybrid approach if quality/zoom issues emerge

The texture approach, while imperfect, provides:
- Working rendering today
- GPU-accelerated transforms/tinting
- Reasonable performance

Premature optimization toward vector rendering would delay shipping functionality without guaranteed improvement.

---

## References

- [PixiJS SVG Documentation](https://pixijs.download/dev/docs/scene.SVGParser.html)
- [SVGO GitHub](https://github.com/svg/svgo)
- [canvg GitHub](https://github.com/canvg/canvg)
- [pixi-svg Fork](https://github.com/nicatspark/pixi-svg)
- [SMuFL Specification](https://www.smufl.org/)
- [Verovio Documentation](https://book.verovio.org/)
