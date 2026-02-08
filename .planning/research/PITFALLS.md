# Pitfalls Research: PixiJS WebGL Migration

**Domain:** PixiJS WebGL migration for horizontal scrolling music score renderer
**Researched:** 2026-02-08
**Confidence:** HIGH (based on official PixiJS documentation, GitHub issues, and lessons from failed Konva migration)

---

## Critical Pitfalls

Mistakes that cause rewrites, major performance issues, or core functionality failures.

### 1. WebGL Context Loss Without Recovery

**Risk:** WebGL contexts can be lost when the browser reclaims GPU resources (tab backgrounded, GPU memory pressure, driver crash). Without proper handling, the entire PixiJS renderer goes blank and cannot recover.

**Warning Signs:**
- Black canvas after tab switch
- Renderer stops responding after extended use
- Console errors: `CONTEXT_LOST_WEBGL`
- Works initially but fails after browser resource pressure

**Prevention:**
1. Register context loss handlers on the canvas:
```typescript
canvas.addEventListener('webglcontextlost', (e) => {
  e.preventDefault(); // Critical: tells browser we will handle recovery
  pauseAnimationLoop();
});
canvas.addEventListener('webglcontextrestored', () => {
  reinitializeTextures();
  resumeAnimationLoop();
});
```
2. Keep application state (timestamps, camera position) separate from PixiJS objects
3. Store texture source references (original SVG blobs) for recreation
4. Design texture loading as idempotent (can be called multiple times safely)

**Phase:** Phase 1 (Infrastructure) - must be designed from the start, not retrofitted

**Sources:**
- [PixiJS GitHub Issue #6494: Context Loss](https://github.com/pixijs/pixijs/issues/6494)
- [PixiJS GitHub Issue #5386: Cannot recover from context loss](https://github.com/pixijs/pixijs/issues/5386)

---

### 2. Dual Animation Loop Conflict (PixiJS Ticker vs React RAF)

**Risk:** Running both PixiJS's internal Ticker AND a custom `requestAnimationFrame` loop causes:
- Dropped frames from competing RAF calls
- Audio-visual desync when one loop processes faster
- CPU overhead from duplicate update cycles
- Inconsistent delta time calculations

**Warning Signs:**
- Inconsistent frame rates (alternating fast/slow)
- Audio playback gets ahead of/behind visual animation
- CPU usage higher than expected
- `app.ticker.deltaTime` values fluctuate wildly

**Prevention:**
1. Choose ONE animation loop architecture:
   - **Option A (Recommended):** Use PixiJS Ticker exclusively
     ```typescript
     app.ticker.add((ticker) => {
       updateCamera(ticker.deltaTime);
       updateHighlighting(ticker.deltaTime);
     });
     ```
   - **Option B:** Disable PixiJS Ticker, use custom RAF
     ```typescript
     app.ticker.autoStart = false;
     app.ticker.stop();
     // Manual render in your RAF loop:
     app.render();
     ```
2. Never mix `requestAnimationFrame` calls with `app.ticker.add`
3. For audio sync, use `app.ticker.elapsedMS` not `performance.now()` in a separate RAF

**Phase:** Phase 2 (Basic Rendering) - establish pattern before adding complexity

**Sources:**
- [PixiJS GitHub Issue #1897: requestAnimationFrame called by Pixi](https://github.com/pixijs/pixijs/issues/1897)
- [PixiJS Ticker Documentation](https://pixijs.com/8.x/guides/components/ticker)

---

### 3. Graphics Clear/Redraw Memory Leak

**Risk:** Using `graphics.clear()` and redrawing every frame causes severe memory leaks. In PixiJS v8, this leaks ~10MB/second due to WebGLBuffer objects not being deallocated.

**Warning Signs:**
- Memory usage grows steadily during playback
- Browser becomes sluggish after minutes of use
- Heap snapshots show growing `WebGLBuffer` counts
- Performance degrades over time

**Prevention:**
1. **Never clear and redraw Graphics each frame** - Graphics are not designed for this pattern
2. For dynamic content, swap pre-built `GraphicsContext` objects:
   ```typescript
   // Pre-build contexts
   const contextA = new GraphicsContext().rect(0, 0, 100, 100).fill('red');
   const contextB = new GraphicsContext().rect(0, 0, 100, 100).fill('blue');

   // Swap (cheap operation):
   graphics.context = isHighlighted ? contextB : contextA;
   ```
3. For note highlighting, use `Sprite.tint` instead of redrawing
4. If geometry must change, use position/scale/alpha transforms instead

**Phase:** Phase 3 (Note Highlighting) - critical for the highlighting feature

**Sources:**
- [PixiJS GitHub Issue #10549: Redrawing Graphics leaks memory](https://github.com/pixijs/pixijs/issues/10549)
- [PixiJS Graphics Documentation](https://pixijs.com/8.x/guides/components/scene-objects/graphics)

---

### 4. SVG Text/Font Rendering Failure

**Risk:** SVG text elements with custom fonts render incorrectly or not at all when converted to PixiJS textures. Fonts are lazy-loaded, and PixiJS cannot detect when they're ready.

**Warning Signs:**
- Text appears as system fallback font (Times New Roman, Arial)
- Text completely missing from rendered sprites
- Works locally with fonts installed, fails in production
- Inconsistent rendering across browsers

**Prevention:**
1. **Use Verovio's text-as-paths option** (most reliable):
   - Verovio can output all text as SVG `<path>` elements
   - No font loading required
   - Note: Increases SVG size

2. **Pre-load fonts before SVG rendering:**
   ```typescript
   await document.fonts.load('1em Bravura'); // Music font
   await document.fonts.load('1em YourTextFont');
   // Only then render SVG to texture
   ```

3. **Embed fonts in SVG:**
   - Base64-encode font and add `<style>` section to SVG
   - Guarantees font availability

4. **Use HTMLText for dynamic text overlays** (not for score notation)

**Phase:** Phase 2 (SVG-to-Texture Pipeline) - must solve before textures are generated

**Sources:**
- [PixiJS Discussion #7448: SVG text rendering](https://github.com/pixijs/pixijs/discussions/7448)
- [PixiJS SVG Guide](https://pixijs.com/8.x/guides/components/assets/svg)

---

### 5. Texture Size Limit (4096x4096) Exceeded

**Risk:** GPU texture size is limited (typically 4096x4096 pixels). Long music score sections can exceed this, causing:
- Textures fail to create silently
- Content clipped or not rendered
- `cacheAsTexture` fails without warning

**Warning Signs:**
- Parts of score don't render
- Works for short scores, fails for long ones
- Different behavior on different devices (mobile has smaller limits)
- Textures appear clipped on the right edge

**Prevention:**
1. **Query actual GPU limit:**
   ```typescript
   const gl = app.renderer.gl;
   const maxSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
   // Typically: 4096 (mobile), 8192 (desktop), 16384 (high-end)
   ```

2. **Section sizing strategy:**
   - Keep section width < 2048px (safe for all devices)
   - Never exceed 4096px per section
   - Calculate: `maxMeasuresPerSection = 4096 / avgMeasureWidth`

3. **Dynamic section sizing:**
   ```typescript
   const maxWidth = Math.min(4096, gl.getParameter(gl.MAX_TEXTURE_SIZE));
   const sectionWidth = Math.min(targetWidth, maxWidth);
   ```

4. **Resolution scaling for high-DPI:**
   - At 2x resolution, effective max is 2048px
   - Calculate: `effectiveMax = maxTextureSize / devicePixelRatio`

**Phase:** Phase 2 (SVG-to-Texture Pipeline) - affects section sizing calculations

**Sources:**
- [PixiJS Cache As Texture Guide](https://pixijs.com/8.x/guides/components/scene-objects/container/cache-as-texture)
- [PixiJS Textures Guide](https://pixijs.com/8.x/guides/components/textures)

---

### 6. Render Group Overuse Performance Degradation

**Risk:** Creating too many render groups (one per note, one per section) actually slows rendering because render groups don't batch together.

**Warning Signs:**
- Frame rate lower than expected
- GPU profiler shows many small draw calls
- Performance worse than non-render-group approach
- Adding more content causes non-linear slowdown

**Prevention:**
1. **Use render groups sparingly:**
   - One render group for the entire scrolling score content
   - NOT one per section
   - NOT one per note

2. **Correct architecture:**
   ```typescript
   // Good: Single render group containing all sections
   const scoreContainer = new Container();
   scoreContainer.isRenderGroup = true; // GPU handles transform

   sections.forEach(section => {
     const sprite = new Sprite(sectionTexture);
     scoreContainer.addChild(sprite); // Batches together
   });
   ```

3. **Profile before adding render groups** - measure to verify benefit

**Phase:** Phase 2 (Basic Rendering) - architectural decision at start

**Sources:**
- [PixiJS Render Groups Guide](https://pixijs.com/8.x/guides/concepts/render-groups)
- [PixiJS Performance Tips](https://pixijs.com/8.x/guides/concepts/performance-tips)

---

### 7. React useEffect Cleanup Memory Leak

**Risk:** Destroying PixiJS application in React useEffect cleanup without proper options leaves GPU resources allocated. Common in hot-reload development and component unmounts.

**Warning Signs:**
- Memory grows on each hot-reload
- "Too many active WebGL contexts" warnings
- GPU memory not released after navigating away
- Browser crashes after many component remounts

**Prevention:**
1. **Complete cleanup sequence:**
   ```typescript
   useEffect(() => {
     const app = new Application();

     return () => {
       // 1. Stop ticker first
       app.ticker.stop();

       // 2. Destroy with full options
       app.destroy(true, {
         children: true,
         texture: true,
         textureSource: true,
       });

       // 3. Remove canvas from DOM (if not auto-removed)
       if (canvasRef.current) {
         canvasRef.current.remove();
       }
     };
   }, []);
   ```

2. **Destroy individual resources explicitly:**
   ```typescript
   // Before app.destroy()
   sectionTextures.forEach(texture => texture.destroy(true));
   noteSprites.forEach(sprite => sprite.destroy({ texture: false }));
   ```

3. **In development:** Monitor "GPU process" memory in Chrome Task Manager

**Phase:** Phase 1 (Infrastructure) - setup correctly from the start

**Sources:**
- [PixiJS Garbage Collection Guide](https://pixijs.com/8.x/guides/concepts/garbage-collection)
- [PixiJS GitHub Issue #8986: Memory leak after destroy](https://github.com/pixijs/pixijs/issues/8986)

---

### 8. Culling Configuration Backfire

**Risk:** Enabling culling (`cullable = true`) when CPU-bound actually makes performance worse. Culling saves GPU work but adds CPU overhead for bounds calculations.

**Warning Signs:**
- Frame rate drops after enabling culling
- `getBounds` appears frequently in CPU profiler
- Works for few objects, degrades with many
- Moving objects causes more lag than static scene

**Prevention:**
1. **Profile first, cull later:**
   - If GPU-bound (high GPU usage, low CPU): enable culling
   - If CPU-bound (high CPU, low GPU): disable culling

2. **Use cullArea instead of dynamic bounds:**
   ```typescript
   section.cullable = true;
   section.cullArea = new Rectangle(0, 0, sectionWidth, sectionHeight);
   // Avoids expensive getBounds() calculation
   ```

3. **For scrolling score, visibility is simpler:**
   ```typescript
   // Cheaper than PixiJS culling system:
   sections.forEach((section, i) => {
     const isVisible = isSectionInViewport(i, cameraX);
     section.visible = isVisible;
   });
   ```

4. **Don't set `cullableChildren = true` on deep hierarchies**

**Phase:** Phase 4 (Section Virtualization) - only add after profiling

**Sources:**
- [PixiJS Scene Graph: Culling](https://pixijs.com/8.x/guides/concepts/scene-graph)
- [PixiJS Performance Tips](https://pixijs.com/8.x/guides/concepts/performance-tips)

---

## Moderate Pitfalls

Mistakes that cause delays or technical debt but don't break core functionality.

### 9. Texture Garbage Collection Timing

**Risk:** PixiJS's automatic texture garbage collection (TextureGCSystem) removes textures after 60 seconds of non-use. For section virtualization, an off-screen section's texture may be GC'd, requiring expensive recreation when scrolling back.

**Warning Signs:**
- Stutter when scrolling backward
- Texture loading visible on previously-viewed sections
- Memory drops unexpectedly, then spikes again
- Works smoothly forward, janky backward

**Prevention:**
1. **Extend GC timeout for score sections:**
   ```typescript
   const app = new Application({
     textureGCMaxIdle: 60 * 60 * 60, // 1 hour at 60fps
     textureGCCheckCountMax: 6000,    // Check every 100 seconds
   });
   ```

2. **Pin essential textures:**
   - Keep section textures in a Map/Array reference
   - GC only removes unreferenced textures

3. **Manual GC for memory-constrained scenarios:**
   ```typescript
   // Explicitly unload distant sections
   if (distance > 10) {
     texture.source.unload(); // Removes from GPU, keeps in memory
   }
   ```

**Phase:** Phase 4 (Section Virtualization)

**Sources:**
- [PixiJS Garbage Collection Guide](https://pixijs.com/8.x/guides/concepts/garbage-collection)

---

### 10. Blend Mode Batch Breaking

**Risk:** Different blend modes break sprite batching, causing separate draw calls. If notes with highlighting use a different blend mode than the score background, performance degrades.

**Warning Signs:**
- Draw call count higher than expected
- Performance degrades when many notes are highlighted
- WebGL profiler shows many small batches

**Prevention:**
1. **Use same blend mode throughout:**
   ```typescript
   // All sprites should use NORMAL or all use the same mode
   sprite.blendMode = 'normal';
   ```

2. **Order by blend mode:**
   ```typescript
   // Bad: alternating modes = many batches
   [normal, add, normal, add, normal] // 5 draw calls

   // Good: grouped modes = fewer batches
   [normal, normal, normal, add, add] // 2 draw calls
   ```

3. **For highlighting, use tint instead of blend modes:**
   ```typescript
   // GPU shader, no batch break
   noteSprite.tint = 0xff0000;
   ```

**Phase:** Phase 3 (Note Highlighting)

**Sources:**
- [PixiJS Performance Tips](https://pixijs.com/8.x/guides/concepts/performance-tips)

---

### 11. Filter Performance Trap

**Risk:** Filters (blur, glow, shadow) are expensive. Applying filters to many objects or dynamically changing filter properties causes frame drops.

**Warning Signs:**
- Frame rate drops when filters are active
- GPU usage spikes with filter count
- Smooth without filters, janky with

**Prevention:**
1. **Avoid filters for note highlighting** - use tint instead
2. **If filters needed, apply to parent container** not individual sprites
3. **Cache filtered content:**
   ```typescript
   container.cacheAsTexture(true);
   container.filters = [new BlurFilter()];
   // Filter applied once to cached texture
   ```
4. **Clean up filters:**
   ```typescript
   container.filters = null; // Releases filter resources
   ```

**Phase:** Phase 3 (Note Highlighting) - avoid filters entirely for MVP

**Sources:**
- [PixiJS Performance Tips](https://pixijs.com/8.x/guides/concepts/performance-tips)

---

### 12. PixiJS v8 Migration Guide Gaps

**Risk:** PixiJS v8 has significant API changes from v7. Documentation and community examples may reference v7 patterns that don't work in v8.

**Warning Signs:**
- Methods from tutorials don't exist
- Type errors for properties that "should" exist
- Examples work in CodePen but fail locally
- `ParticleContainer` not found (removed in v8)

**Key v8 Changes:**
| v7 Pattern | v8 Pattern |
|------------|------------|
| `graphics.beginFill().drawRect().endFill()` | `graphics.rect().fill()` |
| `new BaseTexture()` | Various `TextureSource` types |
| `ParticleContainer` | Removed - use regular Container |
| `text.maxWidth` | `textStyle.wordWrapWidth` |

**Prevention:**
1. **Use v8 documentation only:** https://pixijs.com/8.x/
2. **Check version in examples** before copying
3. **Run TypeScript** - catches API mismatches

**Phase:** All phases - ongoing awareness

**Sources:**
- [PixiJS v8 Migration Guide](https://pixijs.com/8.x/guides/migrations/v8)
- [PixiJS GitHub Issue #10311: Missing migration info](https://github.com/pixijs/pixijs/issues/10311)

---

## Konva Lessons Applied to PixiJS

The failed Konva.js migration provides specific lessons for this PixiJS implementation:

### Konva Failure: Canvas 2D CPU-Bound Redraws

**What happened:** Every frame, moving the Stage position triggered a full canvas redraw. At 60fps, this was 60 full redraws/second, all on CPU.

**PixiJS Solution:** Render groups handle transforms on GPU. Moving `container.position.x` does NOT trigger redraw - the GPU applies the transform to already-compiled render instructions.

**Verification:** Profile GPU vs CPU usage. CPU should be low during scrolling.

---

### Konva Failure: Layer Caching Did Not Prevent Position Redraws

**What happened:** Caching layers to bitmaps helped static content, but moving the cached layer still required re-compositing the full canvas.

**PixiJS Solution:**
1. `cacheAsTexture` caches to GPU texture
2. Render groups mean position changes are GPU matrix operations
3. Combine: Cache section content + use render group = near-zero CPU during scroll

**Verification:** Moving camera should show no CPU work in profiler.

---

### Konva Failure: Stage Position Updates Triggered Full Redraws

**What happened:** `stage.position({ x: newX })` caused complete re-render regardless of what changed.

**PixiJS Solution:**
```typescript
// Create render group at the top level
const scoreContainer = new Container();
scoreContainer.isRenderGroup = true;

// Position changes are GPU-only:
scoreContainer.position.x = -cameraX; // No redraw!
```

**Key Difference:** PixiJS v8's render groups compile instructions once, then GPU applies transforms. Konva re-renders from scratch.

---

### Konva Failure: 60fps Position Updates Were Too Expensive

**What happened:** Smooth scrolling required position updates every frame. Konva couldn't keep up, resulting in ~23fps effective rendering.

**PixiJS Solution:**
1. Position is a GPU uniform, not a redraw trigger
2. Benchmarks show 60fps with container.position updates
3. PixiJS Ticker provides stable delta time for smooth animation

**Target Metric:** 60fps during continuous scrolling with 10+ sections.

---

## Phase-Specific Warnings

| Phase | Likely Pitfall | Mitigation |
|-------|---------------|------------|
| Phase 1: Infrastructure | Context loss without recovery | Design context handlers from start |
| Phase 1: Infrastructure | React cleanup memory leak | Proper destroy() options |
| Phase 2: SVG-to-Texture | Font rendering failure | Use Verovio text-as-paths |
| Phase 2: SVG-to-Texture | Texture size exceeded | Check GPU limits, size sections appropriately |
| Phase 2: Basic Rendering | Render group overuse | One render group for all sections |
| Phase 2: Basic Rendering | Dual animation loops | Use PixiJS Ticker exclusively |
| Phase 3: Highlighting | Graphics redraw leak | Use Sprite.tint, never Graphics.clear() |
| Phase 3: Highlighting | Blend mode batch breaking | Stick to normal blend mode |
| Phase 4: Virtualization | Texture GC removes sections | Extend GC timeout |
| Phase 4: Virtualization | Culling hurts performance | Use simple visibility toggle instead |

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Context loss not handled | MEDIUM | Add event listeners, refactor texture creation to be re-callable |
| Dual animation loops | LOW | Remove custom RAF, convert to ticker.add callbacks |
| Graphics memory leak | MEDIUM | Replace Graphics with Sprites + tint |
| Font rendering issues | MEDIUM | Enable Verovio text-as-paths, regenerate SVGs |
| Texture size exceeded | LOW | Reduce section width, check on app init |
| Render group overuse | LOW | Remove isRenderGroup from child containers |
| React cleanup leak | LOW | Add proper destroy options |
| GC timing issues | LOW | Adjust GC config parameters |

---

## Sources

### Primary (HIGH confidence)
- [PixiJS v8 Performance Tips](https://pixijs.com/8.x/guides/concepts/performance-tips)
- [PixiJS Render Groups Guide](https://pixijs.com/8.x/guides/concepts/render-groups)
- [PixiJS Garbage Collection Guide](https://pixijs.com/8.x/guides/concepts/garbage-collection)
- [PixiJS Cache As Texture](https://pixijs.com/8.x/guides/components/scene-objects/container/cache-as-texture)
- [PixiJS v8 Migration Guide](https://pixijs.com/8.x/guides/migrations/v8)
- [PixiJS SVG Guide](https://pixijs.com/8.x/guides/components/assets/svg)
- [PixiJS Ticker Documentation](https://pixijs.com/8.x/guides/components/ticker)

### GitHub Issues (HIGH confidence for specific bugs)
- [Issue #6494: WebGL Context Loss](https://github.com/pixijs/pixijs/issues/6494)
- [Issue #5386: Context Loss Recovery](https://github.com/pixijs/pixijs/issues/5386)
- [Issue #10549: Graphics Redraw Memory Leak](https://github.com/pixijs/pixijs/issues/10549)
- [Issue #8986: Memory Leak After Destroy](https://github.com/pixijs/pixijs/issues/8986)
- [Discussion #7448: SVG Text Rendering](https://github.com/pixijs/pixijs/discussions/7448)

### Secondary (MEDIUM confidence)
- [Casey Primozic: PIXI.JS Optimizations](https://cprimozic.net/notes/posts/pixi-js-optimizations/)
- [Medium: PixiJS Optimization Deep Dive](https://medium.com/@turkmergin/maximising-performance-a-deep-dive-into-pixijs-optimization-6689688ead93)
- [Medium: Inside PixiJS's Update Loop](https://medium.com/swlh/inside-pixijss-high-performance-update-loop-856fb1d841a0)

### Project-Specific (HIGH confidence)
- `.planning/PROJECT.md` - Konva failure analysis
- Previous Konva implementation attempts in this codebase

---

*Pitfalls research for: PixiJS WebGL migration for SingleLineRenderer*
*Researched: 2026-02-08*
