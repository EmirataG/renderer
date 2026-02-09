# Phase 16: Frontend Render Mode - Research

**Researched:** 2026-02-09
**Domain:** React SPA render mode for headless Chrome frame capture -- config injection, virtualization bypass, transition disabling, readiness signaling
**Confidence:** HIGH

## Summary

Phase 16 modifies the existing frontend SPA so it can run in headless Chrome as a frame-capture target. The backend (Phase 17) will inject a `window.__EXPORT_CONFIG__` object via Puppeteer's `evaluateOnNewDocument` before React loads. The frontend detects this object, bypasses the normal interactive UI, and renders the score directly with all settings applied from the config.

The core changes are: (1) a `RenderApp` component that replaces `App` in render mode, feeding config values directly to `RegularRenderer` without user interaction, (2) a `renderMode` prop on `RegularRenderer` that disables page virtualization (all pages mounted) and disables the camera CSS transition (`transform 200ms ease-out`), (3) injecting sync anchors into the Zustand store programmatically, and (4) exposing a `window.rendererReady` signal that the backend polls before starting frame capture.

The existing codebase already has most of the infrastructure. `RegularRenderer` already exposes `window.animationController` with `setFrame()` and `setTimestamp()` functions that are synchronous, stateless, and force a reflow before returning. The `setTimestamp` callback already computes animation state mathematically without CSS transitions. The only CSS transition that needs disabling is the camera div's `transform 200ms ease-out` and the `noteAnimation.ts` entry/exit transitions (which are irrelevant in render mode since `setTimestamp` handles animation inline). The virtualization gate is already controlled by `extractionDoneRef.current` -- in render mode, simply never enable virtualization after extraction.

**Primary recommendation:** Create a `RenderApp.tsx` component that reads `window.__EXPORT_CONFIG__`, injects settings into Zustand and passes them as props. Add a `renderMode` boolean prop to `RegularRenderer` that skips virtualization activation and removes the camera transition. Signal readiness via `window.rendererReady` once the animation controller is exposed. No new dependencies needed.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | ^19.1.1 | Component rendering, conditional render mode | Already in project |
| Zustand | ^5.0.10 | Sync anchor state injection | Already in project |
| Verovio | ^6.0.1 | Score rendering (unchanged) | Already in project |
| TypeScript | ~5.9.3 | Type safety for config interface | Already in project |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @sinclair/typebox | ^0.34.x | ExportSettings schema (in export-service) | Type reference only -- frontend reads the same shape |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `window.__EXPORT_CONFIG__` | URL query params | URL length limits (~2000 chars), cannot encode MusicXML (50KB-2MB), sync anchors (hundreds of entries), or binary bg images |
| Separate `RenderApp` component | Conditional logic in `App.tsx` | RenderApp keeps App.tsx clean -- no render-mode conditionals scattered throughout |
| `renderMode` prop on RegularRenderer | `useContext` or global state | Single boolean prop is simpler, explicit, and testable |

**Installation:**
```bash
# No new packages needed. All changes are within existing project.
```

## Architecture Patterns

### Recommended Project Structure

No new directories. Changes to existing files + one new component:

```
src/
  main.tsx                  # MODIFIED: detect __EXPORT_CONFIG__, render RenderApp or App
  RenderApp.tsx             # NEW: minimal wrapper for headless render mode
  types/
    global.d.ts             # MODIFIED: add __EXPORT_CONFIG__ and rendererReady declarations
  renderers/
    RegularRenderer.tsx     # MODIFIED: add renderMode prop (virtualization + transition bypass)
  stores/
    syncStore.ts            # UNCHANGED (state set programmatically from RenderApp)
  hooks/
    useVerovio.ts           # UNCHANGED (works with any container width)
  lib/
    animationController.ts  # UNCHANGED
    noteAnimation.ts        # UNCHANGED (not called in render mode -- setTimestamp does inline math)
    exportClient.ts         # UNCHANGED (used by interactive mode, not render mode)
```

### Pattern 1: Config Injection via evaluateOnNewDocument

**What:** The backend (Phase 17) calls `page.evaluateOnNewDocument()` to set `window.__EXPORT_CONFIG__` BEFORE any script runs. The frontend entry point (`main.tsx`) reads this synchronously and decides which root component to render.

**When to use:** Every render-mode page load. This is how Puppeteer passes all settings (MusicXML, sync anchors, colors, fonts, animation params) to the frontend without any UI interaction.

**Key insight:** `evaluateOnNewDocument` runs after the document is created but before any scripts execute. This means `window.__EXPORT_CONFIG__` is available when `main.tsx` runs. There is no race condition.

**Example:**
```typescript
// main.tsx (modified)
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';

// Detect render mode BEFORE importing App (avoids loading unused UI code)
const exportConfig = (window as any).__EXPORT_CONFIG__;

async function bootstrap() {
  const RootComponent = exportConfig
    ? (await import('./RenderApp')).default
    : (await import('./App')).default;

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <RootComponent />
    </StrictMode>,
  );
}

bootstrap();
```

**Source:** [Puppeteer evaluateOnNewDocument API](https://pptr.dev/api/puppeteer.page.evaluateonnewdocument) -- "Invoked after the document was created but before any of its scripts were run."

### Pattern 2: RenderApp Wrapper Component

**What:** A minimal component that reads `window.__EXPORT_CONFIG__`, injects sync anchors into Zustand, and renders `RegularRenderer` with all config values as props. No sidebar, no tabs, no transport bar.

**When to use:** Only in render mode (headless Chrome frame capture).

**Key insight:** RenderApp should set container dimensions to match the Puppeteer viewport exactly (passed via config or inferred from `window.innerWidth`/`innerHeight`). This ensures pixel-perfect frame capture at the target resolution (e.g., 1920x1080).

**Example:**
```typescript
// RenderApp.tsx
import { useEffect, useState } from 'react';
import RegularRenderer from './renderers/RegularRenderer';
import { useSyncStore } from './stores/syncStore';
import type { ScoreRegion } from './types/score';
import type { BorderStyle } from './borders';

export default function RenderApp() {
  const config = (window as any).__EXPORT_CONFIG__;
  const [ready, setReady] = useState(false);

  // Inject sync anchors into Zustand store on mount
  useEffect(() => {
    if (config.syncAnchors) {
      const anchorsMap = new Map<string, number>(
        Object.entries(config.syncAnchors).map(([k, v]) => [k, v as number])
      );
      useSyncStore.setState({ anchors: anchorsMap });
    }
    setReady(true);
  }, []);

  const anchors = useSyncStore((state) => state.anchors);

  if (!ready) return null;

  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      overflow: 'hidden',
      background: config.bgUrl
        ? `url(${config.bgUrl}) center/cover no-repeat`
        : '#000',
    }}>
      <RegularRenderer
        xml={config.musicXml}
        bgUrl={config.bgUrl}
        fps={config.fps}
        scoreColor={config.scoreColor}
        syncAnchors={anchors.size > 0 ? anchors : undefined}
        scoreRegion={config.scoreRegion as ScoreRegion | null}
        scoreBorder={(config.scoreBorder ?? 'none') as BorderStyle}
        scoreScale={config.scoreScale ?? 1}
        musicFont={config.musicFont ?? 'Bravura'}
        activeNoteheadColor={config.activeNoteheadColor ?? undefined}
        activeNoteheadScale={config.activeNoteheadScale ?? 1}
        activeNoteheadAnimationEntryMs={config.activeNoteheadEntryMs ?? 50}
        activeNoteheadAnimationHoldMs={config.activeNoteheadHoldMs ?? 200}
        activeNoteheadAnimationExitMs={config.activeNoteheadExitMs ?? 200}
        colorFullNote={config.colorFullNote ?? false}
        renderMode={true}
      />
    </div>
  );
}
```

### Pattern 3: renderMode Prop in RegularRenderer

**What:** A boolean `renderMode` prop that controls two behaviors: (1) skip virtualization after event extraction, (2) remove camera CSS transition.

**When to use:** Passed as `true` from RenderApp. Default `false` in interactive mode.

**Key insight:** The virtualization logic already has the perfect gate: `extractionDoneRef.current`. In interactive mode, setting this to `true` activates virtualization. In render mode, simply never activate it -- leave `extractionDoneRef.current` as `false` so all pages remain mounted forever. This is a one-line change.

For the camera transition, the `transition: "transform 200ms ease-out"` style on the camera div becomes `transition: "none"` when `renderMode` is true.

**Example:**
```typescript
// In RegularRenderer props:
interface Props {
  // ... existing props ...
  renderMode?: boolean;
}

// Virtualization gate (in the svgPages useEffect):
if (toolkit) {
  // ... extraction logic ...

  // Only activate virtualization in interactive mode
  if (!renderMode) {
    extractionDoneRef.current = true;
    const initialVisible = getVisiblePageRange();
    visiblePagesRef.current = initialVisible;
    setVisiblePages(initialVisible);
  }
}

// Camera div style:
<div
  ref={cameraRef}
  style={{
    display: "flex",
    width: "100%",
    pointerEvents: "none",
    transition: renderMode ? "none" : "transform 200ms ease-out",
  }}
>
```

### Pattern 4: Readiness Signal

**What:** Expose `window.rendererReady` as a boolean that the backend polls with `page.waitForFunction('window.rendererReady === true')` before starting frame capture.

**When to use:** Set to `true` after: (a) Verovio has rendered all SVG pages, (b) events have been extracted, (c) sync anchors have been interpolated, and (d) `window.animationController` is exposed.

**Key insight:** The existing animation controller exposure useEffect in RegularRenderer already gates on `toolkit && svgPages.length > 0 && interpolatedEvents.length > 0`. The `rendererReady` signal should be set at the end of this same block, after `window.animationController` is assigned.

**Example:**
```typescript
// In RegularRenderer, at the end of the animation controller useEffect:
(window as any).animationController = {
  setFrame: (frameNumber: number, fpsValue: number = 30) => {
    const timestamp = frameNumber / fpsValue;
    setTimestamp(timestamp);
  },
  setTimestamp,
  getDuration: () => audioDuration,
  getFps: () => fps,
};

// Signal readiness for backend polling
(window as any).rendererReady = true;

console.log("[RegularRenderer] Animation controller exposed, renderer ready");

return () => {
  delete (window as any).animationController;
  (window as any).rendererReady = false;
  destroyAnimationController();
};
```

### Pattern 5: Audio Duration Without Audio Element

**What:** In render mode, there is no `<audio>` element. The backend provides `audioDuration` in the config. The `getDuration()` function in the animation controller returns this value directly.

**When to use:** Render mode always. The `audioDuration` state in RegularRenderer is set from the config, not from an `<audio>` element.

**Key insight:** RegularRenderer already has `const [audioDuration, setAudioDuration] = useState(0)` which is set from the audio element's `loadedmetadata` event. In render mode, we need to set it from the config instead. RenderApp can pass `audioDuration` as a new prop, or RegularRenderer can read it from the config directly.

**Example:**
```typescript
// In RegularRenderer, add audioDuration prop:
interface Props {
  // ... existing props ...
  renderMode?: boolean;
  audioDuration?: number;  // Provided by backend in render mode
}

// In the component, override the state if provided:
useEffect(() => {
  if (props.audioDuration != null && props.audioDuration > 0) {
    setAudioDuration(props.audioDuration);
  }
}, [props.audioDuration]);
```

### Anti-Patterns to Avoid

- **Scattering `isRenderMode` checks throughout App.tsx:** Phase 14 already removed `isRenderMode` from RegularRenderer. Do NOT re-introduce scattered conditionals. Use a separate `RenderApp` component instead.

- **Using URL query params for config:** The old approach was `?render=true` with some URL params. This was already removed in Phase 14. The new approach is `window.__EXPORT_CONFIG__` via `evaluateOnNewDocument` -- no URL parsing needed.

- **Setting `renderMode` via global/context:** A simple prop is more explicit, testable, and does not require context setup. Pass it as a boolean prop.

- **Trying to use `prefers-reduced-motion` to disable transitions:** While Puppeteer supports `page.emulateMediaFeatures([{name: 'prefers-reduced-motion', value: 'reduce'}])`, the existing CSS does not have `@media (prefers-reduced-motion: reduce)` rules. And the transitions that matter (camera CSS transition, noteAnimation.ts inline transitions) are set via JavaScript `style.transition`, not CSS classes. The `renderMode` prop approach is simpler and more explicit.

- **Mounting the full App with UI then hiding elements:** This wastes rendering time. The `RenderApp` component renders ONLY the RegularRenderer -- no sidebar, no tabs, no upload zone, no SyncEditor. This is faster and avoids React reconciliation overhead.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Config injection to headless Chrome | Custom postMessage / fetch-based config loading | `evaluateOnNewDocument` with `window.__EXPORT_CONFIG__` | Runs before scripts, zero race conditions, no network round-trip |
| Map deserialization | Custom parsing logic | `new Map(Object.entries(config.syncAnchors))` | Standard JavaScript, matches the `Object.fromEntries` serialization from Phase 15 |
| Readiness detection | Custom polling interval from backend | `page.waitForFunction('window.rendererReady === true')` | Puppeteer built-in, configurable timeout, no polling overhead |
| Container sizing for export | Custom dimension calculation | `window.innerWidth` / `window.innerHeight` + Puppeteer `setViewport` | Puppeteer controls the viewport size; the frontend simply fills it |

**Key insight:** This phase is primarily about wiring -- connecting the backend's injected config to the frontend's existing rendering infrastructure. The rendering engine (Verovio, animation controller, event system) does not change at all.

## Common Pitfalls

### Pitfall 1: Sync Anchors Not Ready Before Rendering

**What goes wrong:** `RenderApp` mounts `RegularRenderer` before sync anchors are injected into Zustand. `RegularRenderer` reads `anchors` as empty, computes `interpolatedEvents` as empty, and exposes an animation controller with no events. The backend gets `rendererReady = true` but `setFrame()` does nothing.

**Why it happens:** Zustand state updates are asynchronous with React rendering. If `RenderApp` calls `useSyncStore.setState()` in a useEffect, the child component may render before the state update propagates.

**How to avoid:** RenderApp should gate rendering of RegularRenderer on a `ready` flag set after Zustand injection completes. OR inject anchors synchronously before the first render (Zustand's `setState` is synchronous outside of React -- calling it before `createRoot` works).

**Warning signs:** `window.animationController.getDuration()` returns 0 or `setFrame()` produces no visual change.

### Pitfall 2: Animation Controller Exposed Before Events Interpolated

**What goes wrong:** The animation controller useEffect runs when `toolkit && svgPages.length > 0 && interpolatedEvents.length > 0`. But if sync anchors are injected after svgPages render, there is a brief window where the controller is not exposed. Backend waits for `rendererReady`, times out, and fails.

**Why it happens:** Event interpolation depends on both `events` (from Verovio extraction) AND `syncAnchors` (from Zustand). These become available at different times.

**How to avoid:** Ensure the readiness signal (`window.rendererReady = true`) is only set when `interpolatedEvents.length > 0`, which already implicitly requires both events and anchors to be present. The existing gate in the animation controller useEffect (`interpolatedEvents.length > 0`) handles this correctly.

**Warning signs:** Backend timeout waiting for `rendererReady`. Console logs show "Not exposing controller yet" with `eventsCount: 0`.

### Pitfall 3: Viewport Size Mismatch Between Puppeteer and Frontend

**What goes wrong:** Puppeteer sets viewport to 1920x1080, but `RegularRenderer` uses its internal `WIDTH = 980` constant to scale dimensions. The rendered score appears at 980px wide within a 1920px viewport, with black space around it.

**Why it happens:** RegularRenderer's `setDims()` function normalizes to `WIDTH = 980`. In interactive mode, the rendered area is displayed inline in the sidebar layout. In render mode, it should fill the entire viewport.

**How to avoid:** In render mode, `RenderApp` does NOT need to change WIDTH. The RegularRenderer already sizes correctly based on the background image dimensions or the default 1920x1080. The Puppeteer viewport should be set to match. The `containerWidth` and `containerHeight` are the render dimensions, and the outer div fills the viewport. The key is that the RegularRenderer output should be scaled to fill the viewport. This is the same pattern SingleLineRenderer uses with `renderScale`.

However, looking at the code carefully: RegularRenderer always normalizes to WIDTH=980. A 1920x1080 background gets scaled down to 980x551. The Puppeteer viewport should be set to 980x551 (or whatever the normalized dimensions are). Alternatively, pass the actual viewport dimensions as a new prop and bypass the WIDTH normalization.

**Recommendation:** The simplest approach is to let RegularRenderer render at its normal WIDTH=980 scale, and have Puppeteer set `deviceScaleFactor` to achieve the desired output resolution. For 1080p output: `deviceScaleFactor = 1920/980 ~= 1.96`. This preserves the exact visual output without any rendering logic changes.

**Warning signs:** Black bars around the score in exported frames. Score appears too small in the viewport.

### Pitfall 4: Background Image Loading Race

**What goes wrong:** `bgUrl` in the config is a data: URL or HTTP URL. The background image loads asynchronously via `new Image()` in the dimensions useEffect. If the backend starts frame capture before the image loads, the background is missing in early frames.

**Why it happens:** Image loading is asynchronous. The `rendererReady` signal may fire before the background image has loaded and dimensions have been calculated.

**How to avoid:** Either preload the background image before setting `rendererReady`, or include the container dimensions directly in the config (so the Image load only affects the visual background, not the layout).

**Warning signs:** First few frames have black background, then subsequent frames show the image.

### Pitfall 5: ExportSettings Schema Drift Between Frontend and Backend

**What goes wrong:** The frontend `ExportSettings` interface in `exportClient.ts` and the backend TypeBox schema in `export-service/src/shared/exportSettings.ts` define the same fields independently. A new field added to one but not the other causes silent failures.

**Why it happens:** No shared import -- the frontend duplicates the interface manually.

**How to avoid:** In this phase, the `__EXPORT_CONFIG__` object shape should be documented as a contract. The config should include every field from ExportSettings plus `musicXml`, `syncAnchors`, `audioDuration`, and `bgUrl`. Phase 17 will construct this object on the backend side.

**Warning signs:** A setting changed in the export dialog has no effect in the exported video.

### Pitfall 6: Page Virtualization Prevents Full Score Capture

**What goes wrong:** The camera moves to a position where only 3 pages are mounted. The backend calls `setFrame()` which positions the camera to a specific Y. But if the target page is not mounted (it's a placeholder div), the SVG content is not in the DOM and the screenshot shows blank space.

**Why it happens:** Page virtualization mounts only visible pages + buffer. In render mode with frame capture, the backend can jump to any frame/timestamp, which may require any page to be visible.

**How to avoid:** The `renderMode` prop must disable virtualization entirely. All pages stay mounted at all times. This is the core requirement of RND-03.

**Warning signs:** Exported frames show blank/empty areas where score should be, especially for frames targeting the middle or end of long scores.

## Code Examples

### ExportConfig Interface (Contract Between Backend and Frontend)

```typescript
// Source: Codebase analysis of ExportSettings (exportClient.ts + exportSettings.ts)
// This interface represents what the backend injects via evaluateOnNewDocument

interface ExportConfig {
  // Score data
  musicXml: string;                     // Full MusicXML content
  syncAnchors: Record<string, number>;  // Serialized Map (Object.fromEntries)
  audioDuration: number;                // From ffprobe, in seconds

  // Visual settings (mirrors ExportSettings)
  fps: number;
  scoreColor: string;
  scoreShadowDistance: number;
  hideUnplayedNotes: boolean;
  smoothReveal: boolean;
  scoreRegion: { x: number; y: number; width: number; height: number } | null;
  scoreBorder: string;
  scoreScale: number;
  musicFont: string;
  activeNoteheadColor: string | null;
  activeNoteheadScale: number;
  activeNoteheadEntryMs: number;
  activeNoteheadHoldMs: number;
  activeNoteheadExitMs: number;
  colorFullNote: boolean;

  // Background
  bgUrl: string | null;                 // data: URL or null
}
```

### Window Type Declarations

```typescript
// Source: existing global.d.ts + new additions for Phase 16
declare global {
  interface Window {
    // Existing (from SyncEditor)
    setAnimationFrame?: (frame: number, fps?: number) => void;
    setAnimationTimestamp?: (seconds: number) => void;
    getAnimationDuration?: () => number;
    isAnimationReady?: () => boolean;

    // Phase 16 additions
    __EXPORT_CONFIG__?: ExportConfig;
    rendererReady?: boolean;
    animationController?: {
      setFrame: (frameNumber: number, fps?: number) => void;
      setTimestamp: (seconds: number) => void;
      getDuration: () => number;
      getFps: () => number;
    };
  }
}
```

### Virtualization Bypass in RegularRenderer

```typescript
// Source: Codebase analysis of RegularRenderer.tsx lines 196-214
// The existing extraction logic + virtualization activation

// CURRENT (interactive mode):
if (toolkit) {
  const timemapEvents = extractTimemapEvents(toolkit);
  const containers = pageContainerRefs.current.filter((c): c is HTMLDivElement => c !== null);
  const cachedEvents = computeEventPositions(timemapEvents, toolkit, containers, pageOffsets);
  setEventsInStore(cachedEvents, svgPages);

  // Activate virtualization
  extractionDoneRef.current = true;
  const initialVisible = getVisiblePageRange();
  visiblePagesRef.current = initialVisible;
  setVisiblePages(initialVisible);
}

// MODIFIED (with renderMode check):
if (toolkit) {
  const timemapEvents = extractTimemapEvents(toolkit);
  const containers = pageContainerRefs.current.filter((c): c is HTMLDivElement => c !== null);
  const cachedEvents = computeEventPositions(timemapEvents, toolkit, containers, pageOffsets);
  setEventsInStore(cachedEvents, svgPages);

  // Only activate virtualization in interactive mode
  if (!renderMode) {
    extractionDoneRef.current = true;
    const initialVisible = getVisiblePageRange();
    visiblePagesRef.current = initialVisible;
    setVisiblePages(initialVisible);
  }
}
```

### Camera Transition Disable

```typescript
// Source: RegularRenderer.tsx line 757
// CURRENT:
<div
  ref={cameraRef}
  style={{
    display: "flex",
    width: "100%",
    pointerEvents: "none",
    transition: "transform 200ms ease-out",  // Smooth camera in interactive mode
  }}
>

// MODIFIED:
<div
  ref={cameraRef}
  style={{
    display: "flex",
    width: "100%",
    pointerEvents: "none",
    transition: renderMode ? "none" : "transform 200ms ease-out",
  }}
>
```

### Animation Controller getDuration Fix for Render Mode

```typescript
// Source: RegularRenderer.tsx lines 693-701
// CURRENT: getDuration returns audioDuration from state (set by audio element)
// In render mode, there is no audio element, but audioDuration should be
// set from the config prop.

// Add effect to set audioDuration from prop in render mode:
useEffect(() => {
  if (renderMode && propAudioDuration != null && propAudioDuration > 0) {
    setAudioDuration(propAudioDuration);
  }
}, [renderMode, propAudioDuration]);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `?render=true` URL param | `window.__EXPORT_CONFIG__` via evaluateOnNewDocument | Phase 14 removed URL param, Phase 16 introduces config injection | No URL size limits, full config with MusicXML + sync anchors |
| `isRenderMode` scattered in components | Single `renderMode` prop + separate RenderApp | Phase 14 cleanup + Phase 16 | Clean separation of concerns |
| Audio element required for duration | Backend provides `audioDuration` via config | Phase 16 | No audio element needed in headless Chrome |

**Deprecated/outdated:**
- `isRenderMode` via URL param in RegularRenderer: Removed in Phase 14. SingleLineRenderer and SyncEditor still have it but are not used in render mode.
- `window.setAnimationFrame` / `window.setAnimationTimestamp` (SyncEditor API): Superseded by `window.animationController.setFrame()` / `.setTimestamp()` (RegularRenderer API). Phase 16 should standardize on the latter.

## Open Questions

1. **Should RenderApp handle SingleLineRenderer too?**
   - What we know: SingleLineRenderer still has its own `isRenderMode` logic (lines 163-228). The export mode could theoretically use either renderer.
   - What's unclear: Does the backend need to support both renderers, or only RegularRenderer?
   - Recommendation: Phase 16 targets RegularRenderer only (as specified in requirements). SingleLineRenderer render mode can be added later if needed. The `rendererType` field could be added to ExportConfig in a future phase.

2. **Viewport dimensions and scaling strategy**
   - What we know: RegularRenderer normalizes to WIDTH=980. A 1920x1080 bg becomes 980x551 internally. Puppeteer viewport needs to match.
   - What's unclear: Should the backend set Puppeteer viewport to 980x551 and let the browser render at that size? Or should the backend use a higher viewport with deviceScaleFactor?
   - Recommendation: For Phase 16, let RegularRenderer render at its natural WIDTH=980 scale. Phase 17 (Puppeteer) and Phase 21 (resolution presets) will handle viewport sizing. The `renderMode` prop does not need to change the WIDTH constant. Phase 17 can use `deviceScaleFactor` to upscale: e.g., `deviceScaleFactor = 1920/980 ≈ 1.96` for 1080p output.

3. **Unimplemented settings: scoreShadowDistance, hideUnplayedNotes, smoothReveal**
   - What we know: These are in the ExportSettings schema and App.tsx state but are NOT consumed by RegularRenderer props. They are in the schema but have no rendering effect yet.
   - What's unclear: Should Phase 16 wire these props, or defer?
   - Recommendation: Defer. These settings exist in the schema for future use. Phase 16 should include them in the ExportConfig interface for completeness but does not need to implement their rendering behavior. The config will pass them through; RegularRenderer can ignore them until a future phase implements them.

4. **Background image injection: data URL vs HTTP serving**
   - What we know: The ARCHITECTURE.md recommends data URL for small images and HTTP serving for large ones. Background images are typically 100KB-5MB.
   - What's unclear: Data URLs for 5MB images may be slow to parse. At what size should we switch to HTTP serving?
   - Recommendation: This is a Phase 17 concern (Puppeteer setup). Phase 16 only needs to accept `bgUrl` as a string (either data: URL or http: URL). The RegularRenderer already handles both transparently since it just sets `backgroundImage: url(${bgUrl})`.

## Sources

### Primary (HIGH confidence)
- **Codebase analysis:** `src/renderers/RegularRenderer.tsx` -- complete analysis of virtualization gate (extractionDoneRef), camera transition (line 757), animation controller exposure (lines 670-715), setTimestamp stateless implementation (lines 526-668)
- **Codebase analysis:** `src/App.tsx` -- all useState settings, sync anchor flow, renderer selection
- **Codebase analysis:** `src/main.tsx` -- entry point structure (StrictMode + createRoot)
- **Codebase analysis:** `src/stores/syncStore.ts` -- `useSyncStore.setState()` for programmatic anchor injection
- **Codebase analysis:** `src/types/global.d.ts` -- existing Window augmentations
- **Codebase analysis:** `src/lib/noteAnimation.ts` -- CSS transitions set via inline style.transition
- **Codebase analysis:** `src/lib/exportClient.ts` -- ExportSettings interface (complete field list)
- **Codebase analysis:** `export-service/src/shared/exportSettings.ts` -- TypeBox ExportSettingsSchema (authoritative field definitions)
- **Phase 15 research:** `.planning/phases/15-backend-foundation-settings-transfer/15-RESEARCH.md` -- TypeBox schema, Map serialization patterns
- **Phase 14 research:** `.planning/phases/14-page-virtualization/14-RESEARCH.md` -- virtualization architecture, extractionDoneRef gate
- **Milestone ARCHITECTURE.md:** `.planning/research/ARCHITECTURE.md` -- evaluateOnNewDocument injection, RenderApp pattern, viewport sizing
- [Puppeteer evaluateOnNewDocument](https://pptr.dev/api/puppeteer.page.evaluateonnewdocument) -- Injection timing guarantee

### Secondary (MEDIUM confidence)
- [Puppeteer page.emulateMediaFeatures](https://pptr.dev/api/puppeteer.page.emulatemediafeatures) -- prefers-reduced-motion emulation (evaluated, NOT recommended for this use case)
- [Puppeteer page.waitForFunction](https://pptr.dev/api/puppeteer.page.waitforfunction) -- Readiness polling pattern

### Tertiary (LOW confidence)
- None -- all findings verified against codebase or official docs

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new dependencies, all existing React/Zustand/Verovio
- Architecture: HIGH -- patterns derived from direct codebase analysis, validated against milestone ARCHITECTURE.md recommendations
- Virtualization bypass: HIGH -- `extractionDoneRef` gate verified in RegularRenderer source (line 209-213)
- CSS transition disable: HIGH -- single inline style property on camera div (line 757)
- Config injection: HIGH -- `evaluateOnNewDocument` is a stable Puppeteer API, well-documented
- Readiness signal: HIGH -- extends existing `window.animationController` exposure pattern
- Pitfalls: HIGH -- all identified from concrete codebase analysis with line references

**Research date:** 2026-02-09
**Valid until:** 90+ days (no external dependencies, all patterns are codebase-specific)
