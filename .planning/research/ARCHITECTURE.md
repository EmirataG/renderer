# Architecture Research: PixiJS Integration

**Domain:** PixiJS WebGL rendering integration for SingleLineRenderer
**Researched:** 2026-02-08
**Confidence:** HIGH (verified via PixiJS official documentation and @pixi/react sources)

## Executive Summary

This document defines the architecture for migrating SingleLineRenderer from SVG/DOM to PixiJS WebGL rendering. The key insight is that PixiJS provides GPU-accelerated rendering where container position changes and sprite tinting are handled by the GPU without requiring redraws - exactly what was missing with Konva's Canvas 2D approach.

**Architecture approach:**
1. Verovio continues to render MusicXML to SVG strings (unchanged)
2. New conversion module converts SVG strings to PixiJS textures
3. PixiSingleLineRenderer uses @pixi/react declarative components
4. Animation loop uses refs for position/tint updates (not React state)
5. Render groups enable true GPU camera movement

The critical insight from Konva's failure: Canvas 2D redraws the entire scene on position changes, while PixiJS WebGL applies transforms as GPU shader operations. This is the fundamental architectural difference that enables 60fps scrolling.

---

## Component Structure

### Current SVG Architecture (v1.2)

```
SingleLineRenderer.tsx
  |
  +-- useSingleLineVerovio (hook)
  |     - Returns: sections[], sectionWidths[], sectionOffsets[]
  |
  +-- eventStore (Zustand)
  |     - CachedEvent with globalX, sectionIndex
  |
  +-- cameraRef (DOM div)
  |     - CSS transform: translateX() for scrolling
  |
  +-- sectionContainerRefs (DOM divs)
  |     - dangerouslySetInnerHTML with SVG strings
  |
  +-- animateNoteheads() (DOM manipulation)
        - Queries SVG elements, applies styles
```

### Proposed PixiJS Architecture (v1.3)

```
PixiSingleLineRenderer.tsx
  |
  +-- useSingleLineVerovio (hook) [UNCHANGED]
  |     - Returns: sections[], sectionWidths[], sectionOffsets[]
  |
  +-- eventStore (Zustand) [UNCHANGED]
  |     - CachedEvent with globalX, sectionIndex
  |
  +-- svgToPixi.ts (NEW conversion module)
  |     - Converts SVG strings to PixiJS Textures
  |     - Caches textures for reuse
  |
  +-- @pixi/react Application (NEW)
  |     |
  |     +-- cameraContainer (Container with isRenderGroup)
  |           - position.x for GPU-accelerated scrolling
  |           |
  |           +-- sectionSprites (Sprite per section)
  |                 - texture from svgToPixi conversion
  |                 - visible flag for virtualization
  |
  +-- noteHighlightRefs (Map<string, Sprite>) (NEW)
  |     - Individual sprites for each note element
  |     - tint property for GPU-shader highlighting
  |
  +-- useTick (animation loop)
        - Updates cameraContainer.position.x
        - Updates noteSprite.tint
```

### Key Architectural Decisions

| Decision | Rationale |
|----------|-----------|
| Use @pixi/react declarative components | Better integration with React lifecycle, TypeScript support |
| Verovio hook unchanged | SVG generation works well, only rendering changes |
| Camera as render group | GPU-accelerated position transforms without redraw |
| Tint for highlighting | GPU shader operation, not texture regeneration |
| Refs for animation state | Avoid React re-renders during RAF loops |
| Section sprites, not graphics | Pre-rasterized textures faster than vector parsing |

---

## Conversion Pipeline

### SVG to Texture Flow

```
Verovio MusicXML      SVG String           PixiJS Texture        Sprite
    render()    -->    "<svg>..."   -->    Texture.from()   -->   display
                           |                    |
                           v                    v
                    Data URI encode      GPU texture upload
                           |                    |
                           v                    v
                    "data:image/svg+xml,..." --> Image --> Texture
```

### svgToPixi.ts Module

```typescript
// src/lib/svgToPixi.ts

import { Texture } from 'pixi.js';

interface ConversionOptions {
  resolution?: number;  // Default 1, increase for high DPI
}

/**
 * Convert SVG string to PixiJS Texture
 *
 * Uses data URI + HTMLImageElement approach (recommended for dynamic SVG)
 *
 * @param svgString - Raw SVG markup from Verovio
 * @param options - Conversion options
 * @returns Promise<Texture> - GPU-uploaded texture
 */
export async function svgToTexture(
  svgString: string,
  options: ConversionOptions = {}
): Promise<Texture> {
  const { resolution = 1 } = options;

  // Encode SVG as data URI
  const dataUri = `data:image/svg+xml,${encodeURIComponent(svgString)}`;

  // Load as Image element
  const image = new Image();
  image.src = dataUri;
  await image.decode();  // Wait for browser to decode

  // Convert to PixiJS texture
  return Texture.from(image, { resolution });
}

/**
 * Convert multiple section SVGs to textures
 *
 * Processes sections in parallel for faster loading
 */
export async function sectionsToTextures(
  sections: string[],
  options: ConversionOptions = {}
): Promise<Texture[]> {
  return Promise.all(
    sections.map(svg => svgToTexture(svg, options))
  );
}

/**
 * Texture cache for section reuse
 *
 * Keyed by section index + hash of SVG content
 */
const textureCache = new Map<string, Texture>();

export function getCachedTexture(key: string): Texture | undefined {
  return textureCache.get(key);
}

export function setCachedTexture(key: string, texture: Texture): void {
  textureCache.set(key, texture);
}

export function clearTextureCache(): void {
  textureCache.forEach(texture => texture.destroy());
  textureCache.clear();
}
```

### Texture Size Constraints

| Constraint | Value | Mitigation |
|------------|-------|------------|
| Max texture size | 4096x4096 px | Section-based rendering keeps textures small |
| SVG parsing cost | High for complex scores | Pre-convert on section change, cache aggressively |
| Memory per texture | ~width * height * 4 bytes | Virtualization limits loaded textures |

**Example calculation:**
- Section width: ~2000px (15 measures at scale 40)
- Section height: ~400px (single system)
- Texture memory: 2000 * 400 * 4 = 3.2MB per section
- 3 visible sections: ~10MB GPU memory (acceptable)

---

## Animation State Management

### The Refs Pattern (Critical)

**Problem with React state in animation loops:**
```typescript
// BAD: Causes re-render every frame
const [cameraX, setCameraX] = useState(0);

useTick(() => {
  setCameraX(audioRef.current.currentTime * pixelsPerSecond);
  // React re-renders component 60 times per second!
});
```

**Solution with refs:**
```typescript
// GOOD: No re-renders, direct PixiJS manipulation
const cameraContainerRef = useRef<Container | null>(null);

useTick(() => {
  if (cameraContainerRef.current) {
    cameraContainerRef.current.position.x =
      -audioRef.current.currentTime * pixelsPerSecond;
  }
  // PixiJS applies position as GPU uniform, no React involvement
});
```

### Ref Architecture for PixiSingleLineRenderer

```typescript
// Animation state refs (never trigger re-renders)
const cameraContainerRef = useRef<Container | null>(null);
const sectionSpritesRef = useRef<Sprite[]>([]);
const noteSpritesRef = useRef<Map<string, Sprite>>(new Map());
const lastEventIndexRef = useRef<number>(-1);
const currentXRef = useRef<number>(0);

// Declarative React state (only for initial setup / user actions)
const [isPlaying, setIsPlaying] = useState(false);
const [sectionsLoaded, setSectionsLoaded] = useState(false);

// Animation loop uses refs exclusively
useTick(useCallback(() => {
  if (!isPlaying || !cameraContainerRef.current) return;

  // Camera position (GPU transform)
  const targetX = getCurrentEventX(audioRef.current.currentTime);
  cameraContainerRef.current.position.x = -targetX + viewportWidth / 2;

  // Note highlighting (GPU tint)
  const currentEvent = getEventAtTimestamp(audioRef.current.currentTime);
  if (currentEvent && currentEvent.index !== lastEventIndexRef.current) {
    lastEventIndexRef.current = currentEvent.index;

    // Apply tint to active notes
    currentEvent.svgIds.forEach(id => {
      const sprite = noteSpritesRef.current.get(id);
      if (sprite) {
        sprite.tint = activeNoteheadColor;  // GPU shader operation
        // Schedule tint reset after animation
        setTimeout(() => { sprite.tint = 0xFFFFFF; }, holdMs + exitMs);
      }
    });
  }
}, [isPlaying, activeNoteheadColor, holdMs, exitMs]));
```

### When to Use State vs Refs

| Use React State | Use Refs |
|-----------------|----------|
| isPlaying toggle | cameraContainer.position |
| sectionsLoaded flag | sprite.tint |
| User settings changes | animation frame values |
| Initial texture setup | currentEventIndex |
| Error/loading states | interpolated positions |

---

## React-PixiJS Integration

### @pixi/react Setup

```typescript
// src/renderers/PixiSingleLineRenderer.tsx

import { Application, extend, useApplication, useTick } from '@pixi/react';
import { Container, Sprite, Texture } from 'pixi.js';

// Register PixiJS classes for JSX usage
extend({ Container, Sprite });

interface Props {
  xml: string;
  // ... same props as SingleLineRenderer
}

export default function PixiSingleLineRenderer(props: Props) {
  const { xml, scoreColor, syncAnchors, audioUrl, ... } = props;

  // Existing hooks (unchanged)
  const { sections, sectionWidths, sectionOffsets, toolkit } =
    useSingleLineVerovio(xml, verovioScale, 15, musicFont);
  const { events } = useEventStore();

  // Texture state (React state OK - only changes on section change)
  const [textures, setTextures] = useState<Texture[]>([]);

  // Convert sections to textures when they change
  useEffect(() => {
    if (sections.length === 0) return;

    sectionsToTextures(sections).then(setTextures);
  }, [sections]);

  return (
    <div style={{ width: containerWidth, height: containerHeight }}>
      <Application
        width={containerWidth}
        height={containerHeight}
        backgroundAlpha={0}  // Transparent for background image
      >
        <PixiScoreContent
          textures={textures}
          sectionWidths={sectionWidths}
          sectionOffsets={sectionOffsets}
          events={events}
          syncAnchors={syncAnchors}
          audioUrl={audioUrl}
          {...animationProps}
        />
      </Application>

      {/* Background image behind canvas (CSS layering) */}
      {bgUrl && (
        <div
          style={{
            position: 'absolute',
            zIndex: -1,
            backgroundImage: `url(${bgUrl})`
          }}
        />
      )}

      {/* Transport controls (React DOM) */}
      <TransportControls ... />
    </div>
  );
}
```

### Inner Component with useTick

```typescript
// Separate component to access useApplication/useTick hooks

interface PixiScoreContentProps {
  textures: Texture[];
  sectionWidths: number[];
  sectionOffsets: number[];
  events: CachedEvent[];
  // ...
}

function PixiScoreContent({ textures, sectionOffsets, events, ... }: PixiScoreContentProps) {
  const { app } = useApplication();

  // Refs for animation (no re-renders)
  const cameraRef = useRef<Container | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Animation loop
  useTick(useCallback((ticker) => {
    if (!audioRef.current || !cameraRef.current) return;

    const currentTime = audioRef.current.currentTime;
    const targetX = getTargetX(currentTime, events);

    // GPU-accelerated camera movement
    cameraRef.current.position.x = lerp(
      cameraRef.current.position.x,
      -targetX + viewportWidth / 2,
      0.1  // Smoothing factor
    );
  }, [events, viewportWidth]));

  return (
    <pixiContainer
      ref={cameraRef}
      isRenderGroup  // Enable GPU transforms
    >
      {textures.map((texture, i) => (
        <pixiSprite
          key={i}
          texture={texture}
          x={sectionOffsets[i]}
          y={0}
        />
      ))}
    </pixiContainer>
  );
}
```

### Render Group Configuration

```typescript
// Camera container with render group for GPU transforms
<pixiContainer
  ref={cameraRef}
  isRenderGroup={true}  // Critical: enables GPU-accelerated transforms
>
  {/* Children move with camera via GPU, no redraw */}
</pixiContainer>
```

**Why isRenderGroup matters:**
- Without: Position changes require recalculating render instructions for all children
- With: Position is a GPU uniform, children render from cached instructions

---

## Data Flow

### Complete Data Flow Diagram

```
                    +-----------------+
                    |   MusicXML File |
                    +--------+--------+
                             |
                             v
              +-----------------------------+
              |   useSingleLineVerovio.ts   |
              |   (Verovio WASM rendering)  |
              +-------------+---------------+
                            |
            sections[], sectionWidths[], sectionOffsets[]
                            |
            +---------------+---------------+
            |                               |
            v                               v
+-----------------------+     +---------------------------+
|   svgToPixi.ts        |     |   eventStore (Zustand)    |
|   SVG -> Texture      |     |   CachedEvent extraction  |
+-----------+-----------+     +-------------+-------------+
            |                               |
            v                               v
+-----------------------+     +---------------------------+
|   textures: Texture[] |     |   events: CachedEvent[]   |
+-----------+-----------+     +-------------+-------------+
            |                               |
            +---------------+---------------+
                            |
                            v
              +-----------------------------+
              |   PixiSingleLineRenderer    |
              |                             |
              |  +----------------------+   |
              |  | @pixi/react          |   |
              |  | Application          |   |
              |  |                      |   |
              |  | +------------------+ |   |
              |  | | cameraContainer  | |   |
              |  | | (isRenderGroup)  | |   |
              |  | |                  | |   |
              |  | | sectionSprites  | |   |
              |  | +------------------+ |   |
              |  +----------------------+   |
              +-----------------------------+
                            |
                            v
              +-----------------------------+
              |   useTick Animation Loop    |
              |                             |
              |   - Read audioRef.currentTime
              |   - Calculate targetX from events
              |   - Update cameraContainer.position.x (GPU)
              |   - Update sprite tints (GPU)
              +-----------------------------+
                            |
                            v
              +-----------------------------+
              |   WebGL GPU Rendering       |
              |   60fps smooth scrolling    |
              +-----------------------------+
```

### Integration Points with Existing Code

| Module | Change Required |
|--------|-----------------|
| `useSingleLineVerovio.ts` | None - continues producing SVG strings |
| `eventStore.ts` | None - CachedEvent structure unchanged |
| `interpolation.ts` | None - pure function, layout-agnostic |
| `getEvents.ts` | None - extraction from Verovio unchanged |
| `noteAnimation.ts` | Replaced with sprite tint (new approach) |
| `SingleLineRenderer.tsx` | Replaced by PixiSingleLineRenderer.tsx |

---

## Note Highlighting Architecture

### SVG Approach (Current)

```typescript
// DOM manipulation per note
function animateNoteheads(root, svgIds, options) {
  for (const id of svgIds) {
    const noteEl = root.querySelector(`#${CSS.escape(id)}`);
    const noteheads = noteEl.querySelectorAll('g.notehead');
    noteheads.forEach(nh => {
      nh.style.transform = `scale(${scale})`;
      nh.style.fill = color;
      // ... CSS transitions
    });
  }
}
```

**Problems:**
- DOM queries are slow
- CSS transitions compete with RAF
- React may re-render during animation

### PixiJS Approach (New)

**Option A: Tint on Section Sprites (Simple)**
```typescript
// Tint entire section when it contains active note
const activeSection = events[currentIndex].sectionIndex;
sectionSpritesRef.current.forEach((sprite, i) => {
  sprite.tint = (i === activeSection) ? 0xFFAA00 : 0xFFFFFF;
});
```
- Pro: Simple, no per-note sprites needed
- Con: Tints entire section, not individual notes

**Option B: Overlay Sprites for Notes (Recommended)**
```typescript
// Create sprite overlays for each note element
// Positioned using CachedEvent globalX coordinates

interface NoteSprite {
  sprite: Sprite;       // Positioned at note's globalX
  baseX: number;        // Original X position
  eventId: string;      // Links to CachedEvent
}

// In animation loop:
const activeEvent = events[currentIndex];
activeEvent.svgIds.forEach(id => {
  const noteSprite = noteSpritesMap.get(id);
  if (noteSprite) {
    noteSprite.sprite.tint = activeNoteColor;  // GPU tint
    noteSprite.sprite.scale.set(activeScale);  // GPU scale
  }
});
```

**Option C: Color Matrix Filter (Advanced)**
```typescript
// Apply color transform as GPU filter
import { ColorMatrixFilter } from 'pixi.js';

const highlightFilter = new ColorMatrixFilter();
highlightFilter.tint(0xFF6600);  // Orange tint

// Apply to specific sprites
sectionSprite.filters = isActive ? [highlightFilter] : [];
```

### Recommended Approach: Hybrid

1. **Phase 1 (MVP):** Use section tinting for simplicity
2. **Phase 2:** Add note overlay sprites for precise highlighting
3. **Phase 3:** Optimize with filter-based approach if needed

---

## Suggested Build Order

### Phase 14: SVG-to-Texture Pipeline

**Goal:** Create conversion module and validate texture generation

**Deliverables:**
- `src/lib/svgToPixi.ts` module
- `svgToTexture()` function with data URI approach
- `sectionsToTextures()` for batch conversion
- Texture caching system

**Depends on:** None (uses existing Verovio output)

**Validates:** SVG strings convert to GPU textures correctly

### Phase 15: Basic PixiJS Renderer

**Goal:** Render score sections as sprites in PixiJS canvas

**Deliverables:**
- `src/renderers/PixiSingleLineRenderer.tsx` component
- @pixi/react integration with Application
- Section sprites positioned horizontally
- Static display (no animation yet)

**Depends on:** Phase 14 (needs textures)

**Validates:** PixiJS displays Verovio-rendered sections

### Phase 16: Camera System

**Goal:** Implement GPU-accelerated horizontal scrolling

**Deliverables:**
- Camera container with `isRenderGroup: true`
- `useTick` animation loop
- Audio-driven position updates
- Smooth interpolation (lerp)

**Depends on:** Phase 15 (needs sprites)

**Validates:** 60fps scrolling without jitter

### Phase 17: Note Highlighting

**Goal:** Implement tint-based note animation

**Deliverables:**
- Section tinting for active section
- Event-to-section mapping
- Animation timing (hold/exit)
- Color interpolation for fade

**Depends on:** Phase 16 (needs animation loop)

**Validates:** Notes highlight in sync with audio

### Phase 18: Section Virtualization

**Goal:** Only render visible sections for memory efficiency

**Deliverables:**
- Visibility calculation from camera position
- Sprite.visible toggling (not mount/unmount)
- Buffer sections (1 before/after viewport)
- Texture loading/unloading

**Depends on:** Phase 17 (needs working animation)

**Validates:** Long scores don't exhaust GPU memory

### Phase 19: Integration and Polish

**Goal:** Feature parity with SVG SingleLineRenderer

**Deliverables:**
- Transport controls integration
- Score region bounds
- Border rendering (may need hybrid approach)
- Puppeteer frame capture support

**Depends on:** Phase 18 (needs virtualization)

**Validates:** Complete replacement of SVG renderer

### Build Order Rationale

```
Phase 14: SVG-to-Texture Pipeline
    |
    v
Phase 15: Basic PixiJS Renderer  (needs textures)
    |
    v
Phase 16: Camera System  (needs sprites to move)
    |
    v
Phase 17: Note Highlighting  (needs animation loop)
    |
    v
Phase 18: Section Virtualization  (optimization after features work)
    |
    v
Phase 19: Integration and Polish  (final integration)
```

**Why this order:**
1. **Foundation first:** Can't display sprites without textures
2. **Validate early:** Basic display proves the approach before complexity
3. **Camera before highlights:** Position system must work before animating notes
4. **Optimization last:** Virtualization is performance tuning, not core functionality

---

## Performance Expectations

### Target Metrics

| Metric | SVG Baseline | PixiJS Target |
|--------|--------------|---------------|
| Scrolling FPS | 40-50 (with jitter) | 60 (smooth) |
| Highlight latency | 16-32ms (DOM + CSS) | <1ms (GPU tint) |
| Memory per section | ~5MB (DOM nodes) | ~3MB (texture) |
| Initial load time | Fast (SVG parse) | Slower (texture upload) |

### GPU vs CPU Operations

| Operation | CPU (bad) | GPU (good) |
|-----------|-----------|------------|
| Container.position | - | Render group matrix |
| Sprite.tint | - | Shader uniform |
| Sprite.alpha | - | Blend equation |
| Sprite.rotation | - | Transform matrix |
| Texture regeneration | Image decode | - |
| Graphics.clear() + redraw | Geometry rebuild | - |

---

## Risk Areas

### 1. Text Rendering in Textures

**Risk:** Verovio SVG contains text elements (dynamics, lyrics). PixiJS text rasterization may differ.

**Mitigation:** SVG-to-texture approach rasterizes entire SVG including text. Text quality depends on texture resolution. Use `resolution: 2` for retina displays.

### 2. Precise Note Positioning for Highlights

**Risk:** CachedEvent.globalX positions were measured from DOM. PixiJS sprites use different coordinate space.

**Mitigation:** Positions are relative to section offsets which are preserved. Verify coordinate mapping during Phase 17.

### 3. Puppeteer Frame Capture

**Risk:** WebGL canvas capture differs from DOM-based capture.

**Mitigation:** PixiJS supports `app.renderer.extract.canvas()` for frame extraction. May need adjustments in animationController.ts.

### 4. Background Image Layering

**Risk:** PixiJS canvas needs to composite with background image.

**Mitigation:** Use `backgroundAlpha: 0` for transparent canvas, layer behind with CSS `z-index: -1` on background div.

---

## Confidence Assessment

| Area | Confidence | Reasoning |
|------|------------|-----------|
| SVG-to-texture conversion | HIGH | Documented approach, multiple verification sources |
| @pixi/react integration | HIGH | Official library, comprehensive documentation |
| Render group GPU transforms | HIGH | Core v8 feature, explicitly documented benefits |
| Tint for highlighting | HIGH | Confirmed GPU shader operation in docs |
| Animation loop with refs | HIGH | Standard React pattern, useTick documentation |
| Puppeteer integration | MEDIUM | Different extraction API, needs validation |
| Precise note coordinates | MEDIUM | Coordinate space mapping needs verification |

---

## Sources

### Primary (HIGH confidence)
- [PixiJS v8 Render Groups](https://pixijs.com/8.x/guides/concepts/render-groups) - GPU transform documentation
- [PixiJS Performance Tips](https://pixijs.com/8.x/guides/concepts/performance-tips) - Tint/alpha optimization
- [PixiJS SVG Loading](https://pixijs.com/8.x/guides/components/assets/svg) - Texture from SVG
- [PixiJS React Getting Started](https://react.pixijs.io/getting-started/) - @pixi/react integration
- [PixiJS React GitHub](https://github.com/pixijs/pixi-react) - extend API, Application usage
- [useTick Hook Documentation](https://react.pixijs.io/hooks/useTick/) - Animation loop patterns
- [Dynamic SVG Textures Discussion](https://github.com/pixijs/pixijs/discussions/10953) - Data URI approach

### Secondary (MEDIUM confidence)
- [PixiJS React v8 Announcement](https://pixijs.com/blog/pixi-react-v8-live) - React 19 support
- [Rendering Fast Graphics with PixiJS](https://medium.com/@bigtimebuddy/rendering-fast-graphics-with-pixijs-6f547895c08c) - Tint performance

### Codebase References
- `src/renderers/SingleLineRenderer.tsx` - Current SVG implementation
- `src/hooks/useSingleLineVerovio.ts` - Verovio section rendering
- `src/stores/eventStore.ts` - CachedEvent structure
- `src/lib/noteAnimation.ts` - Current DOM-based animation

---
*Architecture research for: PixiJS WebGL migration of SingleLineRenderer*
*Researched: 2026-02-08*
