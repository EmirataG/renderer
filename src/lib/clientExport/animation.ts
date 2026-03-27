/**
 * Animation engine for frame-by-frame rendering.
 * Ported from export-service/src/standalone/animation.ts
 *
 * Pure DOM + math logic. Handles camera scrolling and notehead animation.
 */

// ---------------------------------------------------------------------------
// Easing
// ---------------------------------------------------------------------------

function cubicBezierEase(
  x1: number, y1: number, x2: number, y2: number, t: number,
): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
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

function cssEaseOut(t: number): number {
  return cubicBezierEase(0, 0, 0.58, 1, t);
}

// ---------------------------------------------------------------------------
// Color interpolation
// ---------------------------------------------------------------------------

function parseColor(color: string): { r: number; g: number; b: number } {
  const hexMatch = color.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
  if (hexMatch) {
    return {
      r: parseInt(hexMatch[1], 16),
      g: parseInt(hexMatch[2], 16),
      b: parseInt(hexMatch[3], 16),
    };
  }
  const rgbMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (rgbMatch) {
    return { r: parseInt(rgbMatch[1]), g: parseInt(rgbMatch[2]), b: parseInt(rgbMatch[3]) };
  }
  return { r: 0, g: 0, b: 0 };
}

function interpolateColor(color1: string, color2: string, progress: number): string {
  const c1 = parseColor(color1);
  const c2 = parseColor(color2);
  const r = Math.round(c1.r + (c2.r - c1.r) * progress);
  const g = Math.round(c1.g + (c2.g - c1.g) * progress);
  const b = Math.round(c1.b + (c2.b - c1.b) * progress);
  return `rgb(${r}, ${g}, ${b})`;
}

// ---------------------------------------------------------------------------
// Types
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

export interface AnimationEvent {
  computedTimestamp: number;
  y: number;
  svgIds: string[];
}

// ---------------------------------------------------------------------------
// Reset noteheads
// ---------------------------------------------------------------------------

const FULL_NOTE_SELECTORS = 'g.stem, g.accid, g.flag, g.dots, g.artic';

function resetEventNoteheads(
  root: HTMLElement, svgIds: string[], colorFullNote: boolean,
): void {
  for (const id of svgIds) {
    const stavenote = root.querySelector<SVGGElement>(`#${CSS.escape(id)}`);
    if (!stavenote) continue;
    stavenote.querySelectorAll<SVGGElement>('g.notehead').forEach((nh) => {
      nh.style.transform = 'scale(1)';
      nh.style.transition = '';
      nh.querySelectorAll<SVGGraphicsElement>('use').forEach((shape) => {
        shape.style.removeProperty('fill');
        shape.style.removeProperty('stroke');
        shape.style.removeProperty('color');
      });
    });
    if (colorFullNote) {
      stavenote.querySelectorAll<SVGGraphicsElement>(FULL_NOTE_SELECTORS).forEach((group) => {
        group.style.removeProperty('fill');
        group.style.removeProperty('stroke');
        group.style.removeProperty('color');
        group.style.transition = '';
        group.querySelectorAll<SVGGraphicsElement>('path, use, polygon, line').forEach((child) => {
          child.style.removeProperty('fill');
          child.style.removeProperty('stroke');
          child.style.removeProperty('color');
        });
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Core setTimestamp
// ---------------------------------------------------------------------------

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

  // Binary search for current event
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
  const scoreHeight = config.totalHeight || scoreEl.scrollHeight;
  const viewportHeight = config.scoreRegionHeight ?? config.containerHeight;

  let newTargetCameraY = currentEvent.y - viewportHeight / 2;
  newTargetCameraY = Math.max(0, newTargetCameraY);
  newTargetCameraY = Math.min(newTargetCameraY, Math.max(0, scoreHeight - viewportHeight));

  if (Math.abs(newTargetCameraY - state.transitionTarget) > 0.5) {
    if (state.eventIndex === -1) {
      state.transitionFrom = newTargetCameraY;
    } else {
      state.transitionFrom = state.cameraY;
    }
    state.transitionTarget = newTargetCameraY;
    state.transitionStart = seconds;
  }

  const TRANSITION_SEC = 0.2;
  const elapsed = seconds - state.transitionStart;
  let visualCameraY: number;
  if (elapsed >= 0 && elapsed < TRANSITION_SEC) {
    const t = elapsed / TRANSITION_SEC;
    visualCameraY = state.transitionFrom + (state.transitionTarget - state.transitionFrom) * cssEaseOut(t);
  } else {
    visualCameraY = state.transitionTarget;
  }

  state.cameraY = visualCameraY;
  cameraEl.style.transform = `translateY(${-visualCameraY}px)`;
  state.eventIndex = currentIndex;
  state.currentY = currentEvent.y;

  // Notehead animation
  const holdSeconds = config.activeNoteheadHoldMs / 1000;
  const exitSeconds = config.activeNoteheadExitMs / 1000;
  const animDuration = holdSeconds + exitSeconds;

  let firstActiveIndex = currentIndex;
  while (firstActiveIndex > 0) {
    const prevEvent = events[firstActiveIndex - 1];
    if (seconds - prevEvent.computedTimestamp >= animDuration || !prevEvent.svgIds?.length) break;
    firstActiveIndex--;
  }
  while (firstActiveIndex < currentIndex && !events[firstActiveIndex].svgIds?.length) {
    firstActiveIndex++;
  }

  const prev = state.prevActiveRange;
  if (prev !== null) {
    const resetEnd = Math.min(prev.end, firstActiveIndex - 1);
    for (let i = prev.start; i <= resetEnd; i++) {
      if (events[i].svgIds?.length) {
        resetEventNoteheads(scoreEl, events[i].svgIds, config.colorFullNote);
      }
    }
  }

  for (let i = firstActiveIndex; i <= currentIndex; i++) {
    const event = events[i];
    const timeSinceEvent = seconds - event.computedTimestamp;
    if (timeSinceEvent < 0 || !event.svgIds?.length) continue;

    let scale: number;
    let color: string | undefined;

    if (timeSinceEvent < holdSeconds) {
      scale = config.activeNoteheadScale;
      color = config.activeNoteheadColor;
    } else if (timeSinceEvent < animDuration) {
      const exitProgress = (timeSinceEvent - holdSeconds) / exitSeconds;
      const easedProgress = Math.pow(exitProgress, 1.675);
      scale = config.activeNoteheadScale + (1 - config.activeNoteheadScale) * easedProgress;
      color = interpolateColor(config.activeNoteheadColor, config.scoreColor, easedProgress);
    } else {
      resetEventNoteheads(scoreEl, event.svgIds, config.colorFullNote);
      continue;
    }

    for (const id of event.svgIds) {
      const stavenote = scoreEl.querySelector<SVGGElement>(`#${CSS.escape(id)}`);
      if (!stavenote) continue;

      stavenote.querySelectorAll<SVGGElement>('g.notehead').forEach((nh) => {
        nh.style.transformBox = 'fill-box';
        nh.style.transformOrigin = 'center';
        nh.style.transition = '';
        nh.style.transform = `scale(${scale})`;
        if (color) {
          nh.querySelectorAll<SVGGraphicsElement>('use').forEach((shape) => {
            shape.style.fill = color!;
            shape.style.stroke = color!;
            shape.style.color = color!;
          });
        }
      });

      if (color && config.colorFullNote) {
        stavenote.querySelectorAll<SVGGraphicsElement>(FULL_NOTE_SELECTORS).forEach((group) => {
          group.style.fill = color!;
          group.style.stroke = color!;
          group.style.color = color!;
          group.querySelectorAll<SVGGraphicsElement>('path, use, polygon, line').forEach((child) => {
            child.style.fill = color!;
            child.style.stroke = color!;
            child.style.color = color!;
          });
        });
      }
    }
  }

  state.prevActiveRange = { start: firstActiveIndex, end: currentIndex };
  void scoreEl.offsetHeight;
}
