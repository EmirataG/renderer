# Feature Landscape: SingleLineRenderer

**Domain:** Single-line horizontal score display for music notation playback
**Researched:** 2026-02-05
**Updated:** 2026-02-08 (PixiJS WebGL capabilities added)

## Executive Summary

Single-line horizontal score displays are a well-established pattern in music notation software, particularly for play-along and learning applications. The key differentiator from traditional paginated views is that users' eyes stay in roughly the same place while the music scrolls past, similar to a teleprompter or karaoke display.

The primary design decision is **camera behavior**: whether the playhead stays fixed while music scrolls beneath it, or whether the playhead moves within a stationary viewport until scrolling is necessary. Industry leaders like Soundslice, Yousician, and MuseScore have all converged on similar patterns, with fixed-playhead being the preferred mode for play-along scenarios.

---

## Table Stakes

Features users expect from any single-line horizontal score renderer. Missing any of these would make the product feel incomplete or broken.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Horizontal continuous layout** | Defines the renderer type; users selecting "single line mode" expect music to flow left-to-right | Medium | Requires Verovio configuration for single-system output |
| **Fixed playhead position** | Industry standard for play-along; active note stays in predictable location (center or left) | Low | CSS transform on score container, inverse of RegularRenderer pattern |
| **Smooth scrolling** | Jumpy/discrete scrolling is jarring and makes following music difficult | Low | CSS transition on transform, already proven in RegularRenderer |
| **Score scrolls, not playhead** | In horizontal mode, music moves beneath fixed playhead position | Low | Opposite of traditional page-based scrolling |
| **Notehead animation** | Already exists in RegularRenderer; users expect consistent behavior | Low | Reuse existing `animateNoteheads()` |
| **Score region bounds** | Control viewport position/size over background | Low | Already implemented, just needs horizontal awareness |
| **Audio sync** | Playback tied to audio timestamps, not BPM | Low | Already implemented via syncAnchors |

### Expected Camera Behaviors

Based on research of Soundslice, MuseScore, and guitar learning apps:

| Behavior | Description | When Used |
|----------|-------------|-----------|
| **Fixed center** | Playhead stays at horizontal center of viewport; score scrolls beneath | Primary mode for Manuscript |
| **Fixed left** | Playhead stays at left edge; score scrolls right-to-left | Alternative, Soundslice offers this |
| **Page-at-a-time** | Playhead moves across viewport, jumps when reaching edge | Not recommended for play-along |

**Recommendation:** Implement fixed-center as the default and only mode for v1.2. This matches Manuscript's existing RegularRenderer philosophy (active note centered vertically). Fixed-left can be added later if users request it.

---

## Differentiators

Features that would set SingleLineRenderer apart. Not expected, but valued if present.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Seamless section rendering** | Long scores render in chunks without visible breaks | High | Core performance feature; section boundaries must be invisible |
| **Adaptive scroll speed** | Scroll velocity matches musical density (faster through rests, slower through dense passages) | Medium | Would require timestamp-aware velocity calculation |
| **Lookahead preview** | Show upcoming measures with reduced opacity | Low | CSS styling; helps anticipation |
| **Measure number overlay** | Show current measure number without cluttering score | Low | Positioned outside score region |
| **Horizontal zoom/scale** | Adjust how many measures visible at once | Medium | May conflict with Verovio rendering approach |
| **Fixed-left playhead option** | Alternative playhead position (Soundslice-style) | Low | Config option changing transform calculation |

### Differentiator Analysis

**Seamless section rendering** is the most valuable differentiator because it's technically necessary for performance anyway. If implemented well, users won't even know sections exist - they'll just see a smooth, infinite horizontal scroll. This is where most implementations fail (MuseScore users frequently complain about jumpy scrolling at page boundaries).

**Adaptive scroll speed** would be impressive but is complex to implement correctly. Requires calculating velocity between events and smoothly interpolating. Consider for v1.3+.

**Lookahead preview** is low-hanging fruit with high impact. Showing the next 1-2 measures faded helps users anticipate what's coming.

---

## Anti-Features

Features to explicitly NOT build. Common mistakes in this domain.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Page-at-a-time scrolling** | Causes jarring jumps; loses user's place; MuseScore users consistently complain about this | Smooth continuous scrolling with fixed playhead |
| **Discrete/stepped scrolling** | Even small jumps are noticeable and disorienting | Use CSS transitions for smooth motion |
| **Playhead moving across screen** | Forces user to track moving element while also reading music | Keep playhead fixed, scroll music beneath it |
| **Rendering full score at once** | Memory explosion on long scores; defeats purpose of section-based approach | Lazy load sections based on camera position |
| **Vertical scrolling in horizontal mode** | Confuses the spatial metaphor | Score should have no vertical overflow; single system only |
| **Complex easing curves** | Over-engineered motion can feel laggy or unnatural | Simple linear or ease-out transitions |
| **User-controllable scroll speed during playback** | Conflicts with audio sync; would cause drift between audio and visual | Speed is determined by audio timestamps |

### Anti-Pattern Deep Dive: Page Jumps

The most common complaint in MuseScore forums about horizontal/continuous view is page jumping:

> "When the playback wiper gets to the right edge of the screen, the music redraws, but too late to be able to play along. Sometimes a note or two will be entirely lost as the window auto-jumps to the next batch of music."

**Prevention:**
- Use CSS transform for smooth scrolling (not DOM manipulation)
- Pre-load upcoming sections before they're needed
- Never wait until edge-of-viewport to load next section
- Buffer at least one full viewport width ahead

---

## Feature Dependencies

```
Score Region Bounds (existing)
    |
    v
Horizontal Camera System
    |
    +---> Smooth Scroll Transform
    |
    v
Section-Based Rendering
    |
    +---> Section Loading/Unloading
    |     |
    |     v
    |     Seamless Transitions (no visible breaks)
    |
    v
Notehead Animation (reuse existing)
```

**Critical Path:**
1. Horizontal layout from Verovio (single-system output)
2. Horizontal camera (inverse of RegularRenderer's vertical camera)
3. Section rendering (for performance)
4. Section transitions (for UX)

---

## MVP Recommendation

For SingleLineRenderer v1.2, prioritize in this order:

### Must Have (Table Stakes)
1. **Horizontal continuous layout** - Core identity of the renderer
2. **Fixed-center playhead** - Score scrolls beneath stationary center point
3. **Smooth scrolling** - CSS transform with transition
4. **Notehead animation** - Reuse existing implementation
5. **Score region bounds** - Already exists, ensure horizontal compatibility

### Should Have (Performance Critical)
6. **Section-based rendering** - Required for long scores
7. **Lazy section loading** - Only mount visible + buffer sections
8. **Seamless section transitions** - Invisible breaks between sections

### Defer to v1.3+
- Adaptive scroll speed
- Lookahead preview styling
- Fixed-left playhead option
- Measure number overlay
- Horizontal zoom control

---

## Camera Behavior Specification

Based on research findings, here is the expected camera behavior for SingleLineRenderer:

### Primary Mode: Fixed-Center Playhead

```
Viewport (score region)
+-------------------------------------------------+
|                        |                        |
|     Past music         |*|     Future music     |
|     (scrolling left)   |*|     (scrolling right)|
|                        |*|                      |
+-------------------------------------------------+
                         ^ Playhead (fixed at center X)
```

**Behavior:**
- Active note's X position is always at viewport center
- Music scrolls left as playback progresses
- Camera transform: `translateX(-(eventX - viewportWidth/2))`
- Transition: `transform 200ms ease-out` (match RegularRenderer)

### Edge Cases

| Situation | Behavior |
|-----------|----------|
| Start of score | Don't scroll past left edge; playhead may be right of center initially |
| End of score | Don't scroll past right edge; playhead may be left of center at end |
| Very short score | Score may not need scrolling at all; center it |
| Fast passages | Scroll smoothly; don't skip frames |

### Scroll Smoothness Requirements

Based on teleprompter research, users are very sensitive to scroll jitter:

> "Even at high frame rates, scrolls often do not look as smooth as one might hope. Some messages don't get through and with those that do there is a high degree of jitter."

**Prevention:**
- Use CSS transitions, not JavaScript-driven animation
- Lock to 60fps or match display refresh rate
- Avoid forcing layout/reflow during scroll
- Use `will-change: transform` on scroll container

---

## Section Transition Specification

The key differentiator for SingleLineRenderer is making section boundaries invisible.

### Concept

```
Section 1        Section 2        Section 3
[======]         [======]         [======]
   ^                 ^
   |                 |
   Overlap region (rendered in both sections)
```

### Requirements

1. **No visual seams** - Section boundaries must be pixel-perfect continuous
2. **No flash/flicker** - Section swap must not cause visible artifacts
3. **Preload ahead** - Load next section before current section ends
4. **Unload behind** - Remove sections no longer visible to free memory

### Buffer Strategy

```
                    Viewport
                  [===========]
Loading Zone: [                           ]
Mounted:      [   ][===========][   ]
              Past   Visible   Future
```

- Mount: Current section + 1 section ahead + 1 section behind
- Load: Start loading when camera is 50% through current section
- Unload: Remove sections more than 1 section away from viewport

---

## PixiJS WebGL Capabilities (v1.3 Migration)

**Added:** 2026-02-08
**Purpose:** Document PixiJS-specific features for WebGL migration

### SVG-to-Texture Pipeline

PixiJS v8 supports two primary methods for converting SVG to renderable content:

#### Method 1: SVG as Texture (Rasterization) - RECOMMENDED

The preferred approach for Verovio SVG sections:

```javascript
// From dynamic SVG string (Verovio output)
const image = new Image();
image.src = `data:image/svg+xml,${encodeURIComponent(svgString)}`;
await image.decode();
const texture = Texture.from(image);
const sprite = new Sprite(texture);
```

**Characteristics:**
- Fast to render (single quad, not geometry)
- GPU-accelerated display
- Supports tint property for color modification
- Does NOT scale cleanly (pixelation when zoomed)
- Maximum texture size: 4096x4096 pixels

#### Resolution Control

```javascript
// Higher resolution = sharper at larger sizes, more VRAM
const texture = await Assets.load('section.svg', { resolution: 2 });
```

**Recommendation for music scores:**
- Use `resolution: 2` for standard displays
- Use `resolution: 3-4` for retina/HiDPI displays
- Pre-calculate section dimensions to avoid 4096px limit

**Source:** [PixiJS SVG Documentation](https://pixijs.com/8.x/guides/components/assets/svg)

---

### GPU-Accelerated Camera (Render Groups)

Render Groups enable true GPU-accelerated camera movement by offloading transform calculations to the GPU:

```javascript
// Create a render group for the entire score world
const scoreWorld = new Container({ isRenderGroup: true });

// Add all section sprites to this container
for (const section of sections) {
  scoreWorld.addChild(section.sprite);
}

// Camera movement = moving the container (GPU-handled)
scoreWorld.position.x = -cameraX;
```

**Why this matters:**
- Moving a render group does NOT recalculate child transforms on CPU
- Transform (position, scale, rotation), tint, and alpha are GPU-computed
- Perfect for panning large static worlds (exactly our use case)

**Performance Benefits (from PixiJS v8 benchmarks):**
- 100k stationary sprites: CPU improvement of 17,417% (v7: ~21ms, v8: ~0.12ms)
- 100k moving sprites: CPU improvement of 233% (v7: ~50ms, v8: ~15ms)

**When NOT to Use Render Groups:**
> "Render groups do not batch together...turning every container into a render group could actually slow things down."

**Best practice:**
- Use ONE render group for the score world (all sections)
- Do NOT make each section sprite a render group
- The root stage is automatically a render group

**Source:** [PixiJS Render Groups](https://pixijs.com/8.x/guides/concepts/render-groups), [PixiJS v8 Launch Blog](https://pixijs.com/blog/pixi-v8-launches)

---

### Tint-Based Highlighting

Tint is implemented via GPU fragment shader - it multiplies each pixel's color by the tint color:

```javascript
// Fragment shader logic (simplified):
// outputColor = textureColor * tintColor

sprite.tint = 0xff0000;  // Red tint
sprite.tint = 0xffffff;  // No tint (white = identity for multiply)
```

**Technical implementation:**
1. Tint color added to vertex buffer
2. Uploaded as attribute to GPU
3. Passed to fragment shader via varying
4. Texture color multiplied by tint color per-pixel

**Performance advantage over SVG/DOM:**
- Tint change = updating a shader uniform
- NO redraw of geometry required
- NO DOM manipulation
- GPU handles the color math per-pixel in parallel

**Critical Limitation: Multiply-Only**
- Can darken colors (multiply by < 1.0)
- Can colorize (shift hue via RGB multipliers)
- CANNOT brighten a channel that's 0 in the original

```javascript
// Example: Cannot turn black to red via tint
// Black texture (0, 0, 0) * Red tint (1, 0, 0) = still (0, 0, 0)
```

**Workaround for black noteheads:**
- Use light gray noteheads in SVG to enable tint-based colorization
- OR use ColorMatrixFilter for additive color changes (more expensive)

**Source:** [PixiJS Tint Implementation (GitHub)](https://github.com/pixijs/pixijs/issues/3004)

---

### Sprite Visibility (Virtualization)

The `visible` property is the performant way to hide/show sprites:

```javascript
// Hide a section (completely skips rendering AND transform calculation)
sectionSprite.visible = false;

// Show a section
sectionSprite.visible = true;
```

**Key optimization:** When `visible = false`:
- Object is not drawn
- Transform calculations are SKIPPED entirely
- Children also hidden (inherited)

| Property | Rendering | Transform Calc | Use Case |
|----------|-----------|----------------|----------|
| `visible = false` | Skipped | Skipped | Static hiding (virtualization) |
| `renderable = false` | Skipped | Still runs | Animated hiding (need position updates) |

**For section virtualization:** Use `visible` - we don't need transforms for off-screen sections.

**Source:** [PixiJS Container API](https://pixijs.download/dev/docs/scene.Container.html)

---

### Text Handling in SVG

**Critical Limitation:** SVG Text elements are NOT supported when rendering SVGs in PixiJS.

This is a browser limitation:
- SVG text requires fonts to be loaded
- Canvas drawImage() can't access lazy-loaded fonts

**Workarounds:**
1. **Convert Text to Paths (RECOMMENDED)** - Verovio uses SMuFL font glyphs as paths
2. **Base64 Encode Fonts** - Embed fonts directly in SVG (increases size)
3. **Use PixiJS Text Objects** - For dynamic text requirements

**Verification needed:** Check if Verovio's SMuFL fonts render as `<use>` references to glyph paths or as actual text elements.

**Source:** [PixiJS GitHub Discussion #7448](https://github.com/pixijs/pixijs/discussions/7448)

---

## PixiJS Table Stakes vs Differentiators

### Table Stakes (Must Have for PixiJS Migration)

| Feature | PixiJS Capability | Complexity | Notes |
|---------|-------------------|------------|-------|
| SVG-to-Texture conversion | `Texture.from(image)` | Low | Core workflow |
| Horizontal scrolling | Container.position.x | Low | Render group for GPU |
| Section visibility toggle | Sprite.visible | Low | Automatic transform skip |
| Basic note highlighting | Sprite.tint | Low | Multiplicative only |
| 60fps smooth scrolling | Render groups | Medium | v8 required |
| Score color customization | Shader/tint | Medium | May need ColorMatrixFilter |

### PixiJS Differentiators (vs Canvas 2D / SVG)

| Feature | Why It's Better | Impact |
|---------|-----------------|--------|
| GPU-accelerated camera | No CPU transform recalculation on pan | 60fps vs 23fps (Konva) |
| Shader-based tint | No DOM/canvas redraw for highlighting | Instant color changes |
| WebGL batching | Multiple sprites in single draw call | Better GPU utilization |
| Render groups | Transform offloading to GPU | Scales to 100k+ sprites |
| Reactive render loop | Only update what changed | Power efficiency |

### PixiJS Anti-Features (Deliberately NOT Build)

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Per-sprite render groups | Destroys batching, worse performance | One render group for score world |
| Dynamic SVG scaling | Pixelation, defeats GPU caching | Pre-render at target resolution |
| Additive tint for black | Not possible with multiply blend | Use light gray base OR ColorMatrixFilter |
| Text as SVG text elements | Browser font loading issues | Verovio path-based glyphs |
| Manual texture management | Memory leaks, complex lifecycle | Use Assets API with proper disposal |
| CSS transitions on sprites | PixiJS doesn't use DOM | Implement in animation loop |

---

## Sources

### HIGH Confidence (Official Documentation)
- [Soundslice Playhead Scrolling Options](https://www.soundslice.com/help/en/player/advanced/116/playhead-scrolling-options/) - Detailed playhead behavior options
- [Soundslice Horizontal Layout](https://www.soundslice.com/help/en/player/advanced/115/horizontal-layout/) - Horizontal scrollable mode documentation
- [Soundslice Introducing Horizontal View](https://www.soundslice.com/blog/47/introducing-horizontal-view-and-advanced-settings/) - Feature design rationale
- [PixiJS SVG Documentation](https://pixijs.com/8.x/guides/components/assets/svg)
- [PixiJS Render Groups](https://pixijs.com/8.x/guides/concepts/render-groups)
- [PixiJS Container API](https://pixijs.download/dev/docs/scene.Container.html)
- [PixiJS Sprite API](https://pixijs.download/release/docs/scene.Sprite.html)
- [PixiJS v8 Launch Blog](https://pixijs.com/blog/pixi-v8-launches)

### MEDIUM Confidence (Multiple Sources Agree)
- [MuseScore Ticker-like Scrolling](https://musescore.org/en/node/109511) - User request for fixed-cursor scrolling
- [MuseScore Add Scroll View with Fixed Playback Cursor](https://musescore.org/en/node/386609) - Feature discussion
- [MuseScore Keep Cursor Centered](https://musescore.org/en/node/93376) - Centered playhead request
- [MuseScore Smooth Pan](https://musescore.org/en/node/339030) - Smooth scrolling implementation
- [Dynamic SVG Textures in v8](https://github.com/pixijs/pixijs/discussions/10953)
- [Tint Implementation Details](https://github.com/pixijs/pixijs/issues/3004)
- [SVG Text and Font Loading](https://github.com/pixijs/pixijs/discussions/7448)
- [Container Performance Regression](https://github.com/pixijs/pixijs/issues/10353)

### LOW Confidence (Single Source / Community)
- [Logic Pro Score Editor](https://support.apple.com/guide/logicpro/view-music-notation-lgcp8535c066/mac) - Linear view mentioned
- [FL Studio Piano Roll Auto-Follow](https://forum.image-line.com/viewtopic.php?t=317884) - Auto-scroll patterns
- [Teleprompter Scroll Modes](https://www.speakflow.com/docs/scroll-modes-flow-auto) - Smooth scroll UX patterns

### Guitar Learning Apps (Pattern Validation)
- Yousician, Simply Guitar, Gibson App all use scrolling fretboard pattern
- Confirms fixed-position playhead as industry standard for play-along
- [Yousician Guitar App](https://yousician.com/guitar) - Scrolling fretboard approach

---

## Confidence Assessment

| Area | Confidence | Reason |
|------|------------|--------|
| Camera behavior patterns | HIGH | Multiple authoritative sources (Soundslice docs) agree on fixed-playhead approach |
| Smooth scrolling importance | HIGH | Consistent user complaints in MuseScore forums; teleprompter research confirms |
| Section-based rendering need | HIGH | Already proven necessary in RegularRenderer; same principles apply horizontally |
| Seamless transitions | MEDIUM | Concept well-understood; implementation specifics depend on Verovio capabilities |
| Feature priorities | MEDIUM | Based on synthesis of competitor features and Manuscript's existing patterns |
| PixiJS SVG-to-texture | HIGH | Verified via official PixiJS documentation and GitHub discussions |
| PixiJS render groups | HIGH | Official documentation with benchmark data |
| PixiJS tint mechanism | HIGH | Verified via GitHub issue with maintainer explanation |
| PixiJS text handling | HIGH | Documented limitation in official compatibility table |
