# Phase 16: Camera System - Research

**Researched:** 2026-02-08
**Domain:** PixiJS v8 animation, GPU-accelerated transforms, smooth camera scrolling
**Confidence:** HIGH

## Summary

This phase implements a smooth 60fps camera system for the PixiJS-based score renderer. The camera keeps the active note centered during playback using GPU-accelerated container transforms via PixiJS v8's render groups feature.

The existing SVG-based `SingleLineRenderer.tsx` demonstrates the required animation pattern: ref-based camera positioning without React state, lerp interpolation between events, and requestAnimationFrame-driven updates. For PixiJS, we replace custom RAF with the PixiJS Ticker and use `container.position.x` for GPU-accelerated scrolling.

Key architectural decisions are already locked (from STATE.md): PixiJS v8, render groups for camera, @pixi/react integration. Research confirms these patterns and documents the correct implementation approach.

**Primary recommendation:** Create a camera container with `isRenderGroup: true`, update `container.position.x` via useTick callback (memoized with useCallback), and use frame-rate-independent exponential smoothing for lerp interpolation.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| pixi.js | 8.16.0 | WebGL rendering engine | Already installed, provides Ticker and render groups |
| @pixi/react | 8.0.5 | React bindings for PixiJS | Already installed, provides useTick and useApplication hooks |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| zustand | 5.0.10 | State management | Already used for eventStore, can share playback state |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| useTick hook | Custom RAF loop | useTick integrates with PixiJS Ticker properly; custom RAF would duplicate frame scheduling |
| Render groups | Regular containers | Render groups offload transforms to GPU; required for CAM-01 |

**Installation:**
Already installed - no additional packages needed.

## Architecture Patterns

### Recommended Component Structure
```
src/renderers/
├── PixiSingleLineRenderer.tsx  # Main component (extend existing)
└── hooks/
    └── useCameraSystem.ts      # Optional: Extract camera logic if complex
```

### Pattern 1: Render Group for Camera Container
**What:** Mark the camera container as a render group for GPU-accelerated transforms
**When to use:** Always for the scrolling camera container

```typescript
// Source: PixiJS official docs - https://pixijs.com/8.x/guides/concepts/render-groups
import { Container } from 'pixi.js';
import { extend } from '@pixi/react';

extend({ Container });

// In JSX:
<pixiContainer
  ref={cameraContainerRef}
  isRenderGroup={true}
  x={0}
  y={0}
>
  {/* Score sprites go here */}
</pixiContainer>
```

### Pattern 2: useTick with Memoized Callback
**What:** Frame-by-frame camera updates via PixiJS Ticker without React re-renders
**When to use:** For all animation updates

```typescript
// Source: @pixi/react docs - https://react.pixijs.io/hooks/useTick/
import { useTick, useApplication } from '@pixi/react';
import { useCallback, useRef } from 'react';

function CameraController({ targetX, viewportWidth, scoreWidth }) {
  const { app } = useApplication();
  const cameraRef = useRef<Container>(null);
  const currentXRef = useRef(0);

  // CRITICAL: Must memoize callback to prevent ticker re-registration
  const animate = useCallback((ticker: Ticker) => {
    if (!cameraRef.current) return;

    const dt = ticker.deltaMS / 1000; // Convert to seconds
    const speed = 10; // Smoothing speed factor

    // Frame-rate-independent exponential smoothing
    currentXRef.current += (targetX - currentXRef.current) * (1 - Math.exp(-speed * dt));

    // Apply camera position (negative to scroll content left)
    const cameraX = Math.max(0, Math.min(currentXRef.current - viewportWidth / 2, scoreWidth - viewportWidth));
    cameraRef.current.position.x = -cameraX;
  }, [targetX, viewportWidth, scoreWidth]);

  useTick(animate);

  return <pixiContainer ref={cameraRef} isRenderGroup={true}>...</pixiContainer>;
}
```

### Pattern 3: Ref-Based Container Access
**What:** Use React refs to imperatively update PixiJS container positions
**When to use:** To avoid React re-renders during animation

```typescript
// Get container ref from @pixi/react component
const containerRef = useRef<Container>(null);

// Update position directly (bypasses React reconciliation)
containerRef.current.position.x = newX;
```

### Pattern 4: Child Component for Hooks
**What:** useApplication() only works inside Application component tree
**When to use:** Always when accessing app instance

```typescript
// Source: @pixi/react - confirmed in existing ContextLossHandler pattern
function CameraSystem() {
  const { app } = useApplication();
  // ...
}

// In main component:
<Application>
  <CameraSystem />
  {/* Other children */}
</Application>
```

### Anti-Patterns to Avoid
- **React state for camera position:** Setting setState in animation loop causes 60 re-renders/second. Use refs instead.
- **Non-memoized useTick callback:** Causes callback to be removed/added every frame, breaking animation.
- **Custom requestAnimationFrame:** PixiJS already uses RAF internally; adding another creates conflicts and potential double-rendering.
- **CSS transitions on container:** GPU transforms via position.x are instant; CSS transitions would fight the animation.
- **Too many render groups:** Each render group creates separate render pass. Use ONE for the camera container only.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Animation frame scheduling | Custom RAF loop | PixiJS Ticker via useTick | Ticker handles RAF internally, provides deltaTime, coordinates with renderer |
| Frame-rate-independent interpolation | Simple `lerp(a, b, 0.1)` | Exponential smoothing with deltaTime | Simple lerp is frame-rate dependent; exponential formula handles variable framerates |
| GPU-accelerated scrolling | CSS transforms / manual WebGL | container.position.x + isRenderGroup | PixiJS v8 render groups handle GPU batching automatically |
| Container refs in React | Custom context/global state | useRef + @pixi/react ref prop | Standard React pattern that works with @pixi/react components |

**Key insight:** PixiJS v8's architecture provides all the primitives needed. The complexity is in connecting them correctly within React's lifecycle, not in building custom solutions.

## Common Pitfalls

### Pitfall 1: Non-Memoized useTick Callback
**What goes wrong:** Animation stutters or stops; callback re-registered every frame
**Why it happens:** useTick doesn't memoize callbacks internally; each render creates new function reference
**How to avoid:** Always wrap useTick callback in useCallback with proper dependencies
**Warning signs:** Console shows "add/remove" ticker activity; animation starts and stops repeatedly

### Pitfall 2: Using React State in Animation Loop
**What goes wrong:** 60 React re-renders per second; performance tanks; UI elements flash
**Why it happens:** setState triggers reconciliation; component tree re-renders
**How to avoid:** Use useRef for all values updated in animation (currentX, eventIndex, etc.)
**Warning signs:** React DevTools Profiler shows constant re-renders; CPU usage spikes

### Pitfall 3: Frame-Rate-Dependent Lerp
**What goes wrong:** Camera moves faster on high-refresh displays, slower on throttled frames
**Why it happens:** `lerp(a, b, 0.1)` moves 10% per frame regardless of frame duration
**How to avoid:** Use exponential smoothing: `current += (target - current) * (1 - Math.exp(-speed * dt))`
**Warning signs:** Animation speed varies between devices or when browser throttles

### Pitfall 4: Camera Bounds Not Applied
**What goes wrong:** Camera scrolls past score edges; shows empty space at start/end
**Why it happens:** Camera X calculated without clamping to valid range
**How to avoid:** Always clamp: `cameraX = Math.max(0, Math.min(cameraX, scoreWidth - viewportWidth))`
**Warning signs:** Empty space visible at score edges during playback

### Pitfall 5: useApplication Outside Application Tree
**What goes wrong:** Hook returns undefined; runtime error
**Why it happens:** useApplication uses React Context provided by Application component
**How to avoid:** Create child component inside Application that uses the hook (see existing ContextLossHandler pattern)
**Warning signs:** "Cannot read property of undefined" errors referencing app

### Pitfall 6: Forgetting isRenderGroup on Camera Container
**What goes wrong:** Transform updates are CPU-bound; performance issues on complex scores
**Why it happens:** Regular containers don't get GPU-accelerated transforms
**How to avoid:** Set `isRenderGroup={true}` on the camera container
**Warning signs:** CPU usage high despite simple scene; FPS drops with large scores

## Code Examples

Verified patterns from official sources:

### Frame-Rate-Independent Exponential Smoothing
```typescript
// Source: https://lisyarus.github.io/blog/posts/exponential-smoothing.html
// Verified mathematical approach for camera smoothing

function exponentialSmooth(
  current: number,
  target: number,
  speed: number,
  deltaTime: number
): number {
  // speed = rate of approach (higher = faster, try 5-15)
  // At speed=10, reaches ~63% of target in 0.1 seconds
  return current + (target - current) * (1 - Math.exp(-speed * deltaTime));
}

// Usage in useTick:
const animate = useCallback((ticker: Ticker) => {
  const dt = ticker.deltaMS / 1000; // PixiJS provides deltaMS
  currentXRef.current = exponentialSmooth(
    currentXRef.current,
    targetXRef.current,
    10, // speed factor
    dt
  );
  cameraRef.current.position.x = -currentXRef.current;
}, []);
```

### Camera Position Calculation with Bounds
```typescript
// Source: Existing SingleLineRenderer.tsx pattern, adapted for PixiJS

function calculateCameraX(
  targetX: number,      // X position to center on
  viewportWidth: number, // Visible area width (scoreRegion?.width)
  scoreWidth: number     // Total score width (totalWidth from useSingleLineVerovio)
): number {
  // Keep targetX at horizontal center (50%)
  let cameraX = targetX - viewportWidth / 2;

  // Clamp to valid range: don't show empty space at edges
  cameraX = Math.max(0, cameraX);
  cameraX = Math.min(cameraX, Math.max(0, scoreWidth - viewportWidth));

  return cameraX;
}
```

### Complete Camera Controller Component
```typescript
// Source: Synthesized from @pixi/react docs + existing SingleLineRenderer patterns

import { useTick, useApplication } from '@pixi/react';
import { Container, Ticker } from 'pixi.js';
import { useCallback, useRef, useEffect } from 'react';

interface CameraControllerProps {
  containerRef: React.RefObject<Container>;
  targetX: number;
  viewportWidth: number;
  scoreWidth: number;
  isPlaying: boolean;
  smoothingSpeed?: number;
}

export function CameraController({
  containerRef,
  targetX,
  viewportWidth,
  scoreWidth,
  isPlaying,
  smoothingSpeed = 10,
}: CameraControllerProps) {
  const currentXRef = useRef(0);

  // Memoized animation callback
  const animate = useCallback((ticker: Ticker) => {
    if (!containerRef.current) return;

    const dt = ticker.deltaMS / 1000;

    // Frame-rate-independent exponential smoothing
    currentXRef.current += (targetX - currentXRef.current) * (1 - Math.exp(-smoothingSpeed * dt));

    // Calculate bounded camera position
    let cameraX = currentXRef.current - viewportWidth / 2;
    cameraX = Math.max(0, Math.min(cameraX, Math.max(0, scoreWidth - viewportWidth)));

    // Apply to container (negative X scrolls content left)
    containerRef.current.position.x = -cameraX;
  }, [containerRef, targetX, viewportWidth, scoreWidth, smoothingSpeed]);

  // useTick with isEnabled option for play/pause
  useTick(animate, { isEnabled: isPlaying });

  return null; // This is a logic-only component
}
```

### Playback Event Interpolation for Smooth Camera
```typescript
// Source: Existing SingleLineRenderer.tsx interpolation pattern

function getInterpolatedTargetX(
  events: InterpolatedEvent[],
  currentTime: number,
  currentEventIndex: number
): number {
  const currentEvent = events[currentEventIndex];
  const nextEvent = events[currentEventIndex + 1];

  if (!nextEvent) {
    return currentEvent.x;
  }

  // Interpolate between current and next event
  const duration = nextEvent.computedTimestamp - currentEvent.computedTimestamp;
  if (duration <= 0) {
    return currentEvent.x;
  }

  const progress = (currentTime - currentEvent.computedTimestamp) / duration;
  const clampedProgress = Math.max(0, Math.min(1, progress));

  // Linear interpolation for target position
  return currentEvent.x + (nextEvent.x - currentEvent.x) * clampedProgress;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| CSS transform: translateX() | container.position.x | PixiJS always | WebGL-native positioning, no DOM manipulation |
| Custom RAF loop | PixiJS Ticker | Always for PixiJS | Coordinated rendering, proper deltaTime |
| Simple lerp(a,b,0.1) | Exponential smoothing with dt | Game dev best practice | Frame-rate independence |
| Regular Container | isRenderGroup: true | PixiJS v8 (2024) | GPU-accelerated transforms |

**Deprecated/outdated:**
- `container.enableRenderGroup()`: Still works but property `isRenderGroup: true` in constructor/JSX is cleaner
- `ticker.deltaTime`: Returns scalar multiplier; prefer `ticker.deltaMS` for direct time in milliseconds

## Open Questions

Things that couldn't be fully resolved:

1. **Optimal smoothing speed value**
   - What we know: Speed of 10 means 63% progress in 0.1s; higher = snappier
   - What's unclear: Best value depends on UX preference and score characteristics
   - Recommendation: Start with 10, make configurable via prop if needed

2. **Reset animation behavior**
   - What we know: Reset should move camera to start position smoothly
   - What's unclear: Should reset be instant or animated? Current SVG renderer is instant.
   - Recommendation: Match existing behavior (instant reset to first event X)

3. **Container ref typing with @pixi/react**
   - What we know: pixiContainer accepts ref prop
   - What's unclear: Exact TypeScript type for ref (Container vs PixiContainer vs specific type)
   - Recommendation: Use `useRef<Container>(null)` from pixi.js, test at implementation

## Sources

### Primary (HIGH confidence)
- [PixiJS Render Groups Guide](https://pixijs.com/8.x/guides/concepts/render-groups) - isRenderGroup usage, GPU acceleration
- [PixiJS Ticker Guide](https://pixijs.com/8.x/guides/components/ticker) - Ticker API, deltaTime, deltaMS
- [PixiJS Render Loop](https://pixijs.com/8.x/guides/concepts/render-loop) - Frame cycle, render order
- [@pixi/react useTick Hook](https://react.pixijs.io/hooks/useTick/) - Hook syntax, memoization requirement
- [Exponential Smoothing Blog](https://lisyarus.github.io/blog/posts/exponential-smoothing.html) - Frame-rate-independent formula

### Secondary (MEDIUM confidence)
- [PixiJS Performance Tips](https://pixijs.com/8.x/guides/concepts/performance-tips) - Optimization strategies
- [Game Camera Systems Guide](https://generalistprogrammer.com/tutorials/game-camera-systems-complete-programming-guide-2025) - Camera smoothing patterns

### Tertiary (LOW confidence)
- Package versions verified via `npm list` in project

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Already installed, versions verified
- Architecture: HIGH - Patterns verified in official docs and existing codebase
- Pitfalls: HIGH - Derived from official docs warnings + existing code patterns

**Research date:** 2026-02-08
**Valid until:** 60 days (PixiJS v8 stable, @pixi/react 8.x stable)
