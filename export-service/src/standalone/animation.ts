/**
 * Shared animation module for frame-by-frame rendering.
 *
 * Extracted from RegularRenderer.tsx -- pure DOM + math logic with
 * ZERO React/Zustand dependencies. Used by the standalone export
 * render page and can be imported by the frontend if needed.
 */

// ---------------------------------------------------------------------------
// Easing
// ---------------------------------------------------------------------------

/**
 * Evaluate a CSS cubic-bezier(x1, y1, x2, y2) curve at time t.
 * Uses Newton-Raphson to solve for the curve parameter on the X axis,
 * then evaluates Y (progress) at that parameter.
 */
function cubicBezierEase(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  t: number,
): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;

  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;

  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;

  // Newton-Raphson: solve X(s) = t for s
  let s = t;
  for (let i = 0; i < 8; i++) {
    const xVal = ((ax * s + bx) * s + cx) * s - t;
    const dxVal = (3 * ax * s + 2 * bx) * s + cx;
    if (Math.abs(dxVal) < 1e-6) break;
    s -= xVal / dxVal;
  }
  s = Math.max(0, Math.min(1, s));

  return ((ay * s + by) * s + cy) * s;
}

/** CSS ease-out = cubic-bezier(0, 0, 0.58, 1) */
export function cssEaseOut(t: number): number {
  return cubicBezierEase(0, 0, 0.58, 1, t);
}

// ---------------------------------------------------------------------------
// Color interpolation
// ---------------------------------------------------------------------------

function parseColor(color: string): { r: number; g: number; b: number } {
  // Handle hex colors
  const hexMatch = color.match(
    /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i,
  );
  if (hexMatch) {
    return {
      r: parseInt(hexMatch[1], 16),
      g: parseInt(hexMatch[2], 16),
      b: parseInt(hexMatch[3], 16),
    };
  }
  // Handle rgb/rgba colors
  const rgbMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (rgbMatch) {
    return {
      r: parseInt(rgbMatch[1]),
      g: parseInt(rgbMatch[2]),
      b: parseInt(rgbMatch[3]),
    };
  }
  return { r: 0, g: 0, b: 0 };
}

/**
 * Linearly interpolate between two colors (hex or rgb string).
 * Returns an `rgb(r, g, b)` string.
 */
export function interpolateColor(
  color1: string,
  color2: string,
  progress: number,
): string {
  const c1 = parseColor(color1);
  const c2 = parseColor(color2);

  const r = Math.round(c1.r + (c2.r - c1.r) * progress);
  const g = Math.round(c1.g + (c2.g - c1.g) * progress);
  const b = Math.round(c1.b + (c2.b - c1.b) * progress);

  return `rgb(${r}, ${g}, ${b})`;
}

// ---------------------------------------------------------------------------
// Animation state
// ---------------------------------------------------------------------------

export interface AnimationState {
  eventIndex: number;
  currentY: number;
  cameraY: number;
  transitionFrom: number;
  transitionTarget: number;
  transitionStart: number;
  prevActiveRange: { start: number; end: number } | null;
}

export function createAnimationState(): AnimationState {
  return {
    eventIndex: -1,
    currentY: 0,
    cameraY: 0,
    transitionFrom: 0,
    transitionTarget: 0,
    transitionStart: -Infinity,
    prevActiveRange: null,
  };
}

// ---------------------------------------------------------------------------
// Animation config
// ---------------------------------------------------------------------------

export interface AnimationConfig {
  scoreColor: string;
  activeNoteheadColor: string;
  activeNoteheadScale: number;
  activeNoteheadHoldMs: number;
  activeNoteheadExitMs: number;
  colorFullNote: boolean;
  scoreRegionHeight: number | null;
  containerHeight: number;
  totalHeight: number;
}

// ---------------------------------------------------------------------------
// Reset event noteheads (per-event inverse of the apply block)
// ---------------------------------------------------------------------------

const FULL_NOTE_SELECTORS = 'g.stem, g.accid, g.flag, g.dots, g.artic';

/**
 * Reset notehead/stem/accid/flag/dots/artic styles for a single event's
 * SVG elements. Ported from src/lib/noteAnimation.ts resetEventNoteheads.
 */
export function resetEventNoteheads(
  root: HTMLElement,
  svgIds: string[],
  colorFullNote: boolean,
): void {
  for (const id of svgIds) {
    const stavenote = root.querySelector<SVGGElement>(`#${CSS.escape(id)}`);
    if (!stavenote) continue;

    // Reset noteheads: scale and color
    const noteheads = stavenote.querySelectorAll<SVGGElement>('g.notehead');
    noteheads.forEach((nh) => {
      nh.style.transform = 'scale(1)';
      nh.style.transition = '';

      nh.querySelectorAll<SVGGraphicsElement>('use').forEach((shape) => {
        shape.style.removeProperty('fill');
        shape.style.removeProperty('stroke');
        shape.style.removeProperty('color');
      });
    });

    // Reset full-note coloring (stems, accidentals, etc.)
    if (colorFullNote) {
      const extras = stavenote.querySelectorAll<SVGGraphicsElement>(
        FULL_NOTE_SELECTORS,
      );
      extras.forEach((group) => {
        group.style.removeProperty('fill');
        group.style.removeProperty('stroke');
        group.style.removeProperty('color');
        group.style.transition = '';

        group
          .querySelectorAll<SVGGraphicsElement>('path, use, polygon, line')
          .forEach((child) => {
            child.style.removeProperty('fill');
            child.style.removeProperty('stroke');
            child.style.removeProperty('color');
          });
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Core frame-by-frame setTimestamp
// ---------------------------------------------------------------------------

/**
 * Event shape expected by setTimestamp.
 * Matches the output of interpolateTimestamps merged with globalY.
 */
export interface AnimationEvent {
  computedTimestamp: number;
  y: number;
  svgIds: string[];
}

/**
 * Advance the animation to a given timestamp (seconds).
 *
 * Ported directly from RegularRenderer.tsx lines 586-780.
 * Operates on a mutable AnimationState instead of React refs.
 * Camera: binary search -> clamp -> 200ms ease-out transition simulation.
 * Noteheads: delta-based per-frame scale + color animation.
 */
export function setTimestamp(
  seconds: number,
  events: AnimationEvent[],
  state: AnimationState,
  config: AnimationConfig,
  cameraEl: HTMLElement,
  scoreEl: HTMLElement,
): void {
  const totalEvents = events.length;
  if (totalEvents === 0) return;

  // Binary search for current event at timestamp
  let low = 0;
  let high = totalEvents - 1;
  let currentIndex = -1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (events[mid].computedTimestamp <= seconds) {
      currentIndex = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  if (currentIndex < 0) return;
  const currentEvent = events[currentIndex];

  // --- Camera: simulate preview's CSS "transform 200ms ease-out" ---
  const eventY = currentEvent.y;
  const scoreHeight = config.totalHeight || scoreEl.scrollHeight;
  const viewportHeight = config.scoreRegionHeight ?? config.containerHeight;

  // Compute what applyCamera would produce for this event's Y
  let newTargetCameraY = eventY - viewportHeight / 2;
  newTargetCameraY = Math.max(0, newTargetCameraY);
  newTargetCameraY = Math.min(
    newTargetCameraY,
    Math.max(0, scoreHeight - viewportHeight),
  );

  // Detect target change -- start a new transition
  if (Math.abs(newTargetCameraY - state.transitionTarget) > 0.5) {
    state.transitionFrom = state.cameraY; // from current visual position
    state.transitionTarget = newTargetCameraY;
    state.transitionStart = seconds;
  }

  // Simulate 200ms ease-out (matching CSS transition)
  const TRANSITION_SEC = 0.2;
  const elapsed = seconds - state.transitionStart;
  let visualCameraY: number;
  if (elapsed >= 0 && elapsed < TRANSITION_SEC) {
    const t = elapsed / TRANSITION_SEC;
    const eased = cssEaseOut(t);
    visualCameraY =
      state.transitionFrom +
      (state.transitionTarget - state.transitionFrom) * eased;
  } else {
    visualCameraY = state.transitionTarget;
  }

  // Apply camera directly
  state.cameraY = visualCameraY;
  cameraEl.style.transform = `translateY(${-visualCameraY}px)`;

  state.eventIndex = currentIndex;
  state.currentY = eventY;

  // --- Notehead animation: delta-based per-frame ---
  const holdSeconds = config.activeNoteheadHoldMs / 1000;
  const exitSeconds = config.activeNoteheadExitMs / 1000;
  const animDuration = holdSeconds + exitSeconds;

  // Find firstActiveIndex: scan backwards from currentIndex to find the
  // earliest event still within the animation window
  let firstActiveIndex = currentIndex;
  while (firstActiveIndex > 0) {
    const prevEvent = events[firstActiveIndex - 1];
    const timeSincePrev = seconds - prevEvent.computedTimestamp;
    if (timeSincePrev >= animDuration || !prevEvent.svgIds?.length) {
      break;
    }
    firstActiveIndex--;
  }
  // Also skip forward past events with no svgIds at the start
  while (
    firstActiveIndex < currentIndex &&
    !events[firstActiveIndex].svgIds?.length
  ) {
    firstActiveIndex++;
  }

  const prev = state.prevActiveRange;

  // Reset events that fell out of the active window
  if (prev !== null) {
    const resetEnd = Math.min(prev.end, firstActiveIndex - 1);
    for (let i = prev.start; i <= resetEnd; i++) {
      const evt = events[i];
      if (evt.svgIds?.length) {
        resetEventNoteheads(scoreEl, evt.svgIds, config.colorFullNote);
      }
    }
  }

  // Apply/update styles for the active window [firstActiveIndex, currentIndex]
  for (let i = firstActiveIndex; i <= currentIndex; i++) {
    const event = events[i];
    const eventTime = event.computedTimestamp;
    const timeSinceEvent = seconds - eventTime;

    if (timeSinceEvent < 0 || !event.svgIds?.length) continue;

    let scale: number;
    let color: string | undefined;

    if (timeSinceEvent < holdSeconds) {
      // Hold period: full scale and color
      scale = config.activeNoteheadScale;
      color = config.activeNoteheadColor;
    } else if (timeSinceEvent < animDuration) {
      // Exit period: interpolate scale and color using ease-in curve
      const exitProgress = (timeSinceEvent - holdSeconds) / exitSeconds;
      const easedProgress = Math.pow(exitProgress, 1.675);
      scale =
        config.activeNoteheadScale +
        (1 - config.activeNoteheadScale) * easedProgress;
      color = interpolateColor(
        config.activeNoteheadColor,
        config.scoreColor,
        easedProgress,
      );
    } else {
      // Animation complete -- reset defensively
      resetEventNoteheads(scoreEl, event.svgIds, config.colorFullNote);
      continue;
    }

    // Apply animation directly to SVG elements (no CSS transitions)
    for (const id of event.svgIds) {
      const stavenote = scoreEl.querySelector<SVGGElement>(
        `#${CSS.escape(id)}`,
      );
      if (!stavenote) continue;

      const noteheads =
        stavenote.querySelectorAll<SVGGElement>('g.notehead');
      noteheads.forEach((nh) => {
        nh.style.transformBox = 'fill-box';
        nh.style.transformOrigin = 'center';
        nh.style.transition = '';
        nh.style.transform = `scale(${scale})`;

        if (color) {
          const shapes = nh.querySelectorAll<SVGGraphicsElement>('use');
          shapes.forEach((shape) => {
            shape.style.fill = color!;
            shape.style.stroke = color!;
            shape.style.color = color!;
          });
        }
      });

      if (color && config.colorFullNote) {
        const extras = stavenote.querySelectorAll<SVGGraphicsElement>(
          FULL_NOTE_SELECTORS,
        );
        extras.forEach((group) => {
          group.style.fill = color!;
          group.style.stroke = color!;
          group.style.color = color!;
          group
            .querySelectorAll<SVGGraphicsElement>(
              'path, use, polygon, line',
            )
            .forEach((child) => {
              child.style.fill = color!;
              child.style.stroke = color!;
              child.style.color = color!;
            });
        });
      }
    }
  }

  // Store current active range for next frame's delta
  state.prevActiveRange = { start: firstActiveIndex, end: currentIndex };

  // Force reflow to ensure CSS styles are applied synchronously
  // before Puppeteer takes the screenshot
  void scoreEl.offsetHeight;
}
