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
  currentX: number;
  cameraX: number;
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
    currentX: 0,
    cameraX: 0,
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
  activeNoteheadUseNoteDuration: boolean;
  colorExtrasSelector: string;
  scoreRegionHeight: number | null;
  containerHeight: number;
  totalHeight: number;
  totalWidth?: number;
  regionWidth?: number;
  viewMode?: 'page' | 'single-line';
}

export interface AnimationEvent {
  computedTimestamp: number;
  y: number;
  x?: number;
  svgIds: string[];
  tiedContinuationIds?: string[];
  tiedStartIds?: string[];
  holdSeconds?: number;
  tiedHoldSeconds?: number;
}

// ---------------------------------------------------------------------------
// Reset noteheads
// ---------------------------------------------------------------------------

const ALL_EXTRAS_SELECTORS = 'g.stem, g.accid, g.flag, g.dots, g.artic, g.mordent, g.trill, g.turn';

/**
 * Reset notehead colors and transforms using SVG ATTRIBUTES (not CSS).
 *
 * Using setAttribute/removeAttribute instead of style.fill because
 * CSS fill on SVG <use> elements doesn't work reliably in SVG-as-image
 * rendering or in Safari.
 */
function resetEventNoteheads(
  root: HTMLElement, svgIds: string[], colorExtrasSelector: string, scoreColor: string,
): void {
  for (const id of svgIds) {
    const stavenote = root.querySelector<SVGGElement>(`#${CSS.escape(id)}`);
    if (!stavenote) continue;
    stavenote.querySelectorAll<SVGGElement>('g.notehead').forEach((nh) => {
      nh.removeAttribute('transform');
      nh.querySelectorAll<SVGGraphicsElement>('use').forEach((shape) => {
        shape.setAttribute('fill', scoreColor);
        shape.setAttribute('stroke', scoreColor);
      });
    });
    if (colorExtrasSelector) {
      stavenote.querySelectorAll<SVGGraphicsElement>(colorExtrasSelector || ALL_EXTRAS_SELECTORS).forEach((group) => {
        group.removeAttribute('fill');
        group.removeAttribute('stroke');
        group.querySelectorAll<SVGGraphicsElement>('path, use, polygon, line, ellipse').forEach((child) => {
          child.removeAttribute('fill');
          child.removeAttribute('stroke');
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
  const isSingleLine = config.viewMode === 'single-line';

  if (isSingleLine) {
    // Horizontal camera for single-line mode
    const scoreWidth = config.totalWidth || scoreEl.scrollWidth;
    const viewportWidth = config.regionWidth ?? config.scoreRegionHeight ?? config.containerHeight;

    // Interpolate X between current and next event for smooth scrolling
    const currentX = currentEvent.x ?? 0;
    const nextEvent = events[currentIndex + 1];
    let targetX: number;
    if (nextEvent) {
      const dur = nextEvent.computedTimestamp - currentEvent.computedTimestamp;
      if (dur > 0) {
        const progress = Math.max(0, Math.min(1, (seconds - currentEvent.computedTimestamp) / dur));
        targetX = currentX + ((nextEvent.x ?? 0) - currentX) * progress;
      } else {
        targetX = currentX;
      }
    } else {
      targetX = currentX;
    }

    let cameraX = targetX - viewportWidth / 2;
    cameraX = Math.max(0, cameraX);
    cameraX = Math.min(cameraX, Math.max(0, scoreWidth - viewportWidth));

    state.cameraX = cameraX;
    state.currentX = targetX;
    cameraEl.style.transform = `translateX(${-cameraX}px)`;
  } else {
    // Vertical camera for page mode
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
  }

  state.eventIndex = currentIndex;
  state.currentY = currentEvent.y;

  // Notehead animation
  const globalHoldSeconds = config.activeNoteheadHoldMs / 1000;
  const exitSeconds = config.activeNoteheadExitMs / 1000;
  const useNoteDur = config.activeNoteheadUseNoteDuration;

  // Helper: get per-event hold seconds for untied notes
  const getEventHoldSeconds = (evt: AnimationEvent) =>
    useNoteDur && evt.holdSeconds !== undefined ? evt.holdSeconds : globalHoldSeconds;

  // Helper: get max hold seconds across both untied and tied groups (for active window)
  const getEventMaxHoldSeconds = (evt: AnimationEvent) =>
    Math.max(getEventHoldSeconds(evt), useNoteDur && evt.tiedHoldSeconds !== undefined ? evt.tiedHoldSeconds : 0);

  // Helper: get all SVG IDs to animate (include tied continuation IDs in note duration mode)
  const getEventIds = (evt: AnimationEvent) =>
    useNoteDur && evt.tiedContinuationIds?.length
      ? [...evt.svgIds, ...evt.tiedContinuationIds]
      : evt.svgIds;

  // Helper: get per-note hold seconds (tied chain notes use tiedHoldSeconds)
  const getNoteHoldSeconds = (evt: AnimationEvent, id: string) => {
    if (!useNoteDur) return globalHoldSeconds;
    if (evt.tiedStartIds?.includes(id) || evt.tiedContinuationIds?.includes(id)) {
      return evt.tiedHoldSeconds ?? getEventHoldSeconds(evt);
    }
    return getEventHoldSeconds(evt);
  };

  let firstActiveIndex = currentIndex;
  while (firstActiveIndex > 0) {
    const prevEvent = events[firstActiveIndex - 1];
    const prevAnimDuration = getEventMaxHoldSeconds(prevEvent) + exitSeconds;
    if (seconds - prevEvent.computedTimestamp >= prevAnimDuration || !prevEvent.svgIds?.length) break;
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
        resetEventNoteheads(scoreEl, getEventIds(events[i]), config.colorExtrasSelector, config.scoreColor);
      }
    }
  }

  for (let i = firstActiveIndex; i <= currentIndex; i++) {
    const event = events[i];
    const timeSinceEvent = seconds - event.computedTimestamp;
    if (timeSinceEvent < 0 || !event.svgIds?.length) continue;

    const eventMaxHold = getEventMaxHoldSeconds(event);
    if (timeSinceEvent >= eventMaxHold + exitSeconds) {
      resetEventNoteheads(scoreEl, getEventIds(event), config.colorExtrasSelector, config.scoreColor);
      continue;
    }

    // Apply animation using SVG ATTRIBUTES (not CSS style properties).
    // Each note uses its own holdSeconds (untied vs tied chain).
    const idsToAnimate = getEventIds(event);
    for (const id of idsToAnimate) {
      const stavenote = scoreEl.querySelector<SVGGElement>(`#${CSS.escape(id)}`);
      if (!stavenote) continue;

      // Per-note hold: untied notes use their duration, tied chain notes use chain duration
      const noteHold = getNoteHoldSeconds(event, id);
      const noteAnimDur = noteHold + exitSeconds;
      let scale: number;
      let color: string | undefined;

      if (timeSinceEvent < noteHold) {
        scale = config.activeNoteheadScale;
        color = config.activeNoteheadColor;
      } else if (timeSinceEvent < noteAnimDur) {
        const exitProgress = (timeSinceEvent - noteHold) / exitSeconds;
        const easedProgress = Math.pow(exitProgress, 1.675);
        scale = config.activeNoteheadScale + (1 - config.activeNoteheadScale) * easedProgress;
        color = interpolateColor(config.activeNoteheadColor, config.scoreColor, easedProgress);
      } else {
        // This note's animation is done — reset it
        resetEventNoteheads(scoreEl, [id], config.colorExtrasSelector, config.scoreColor);
        continue;
      }

      stavenote.querySelectorAll<SVGGElement>('g.notehead').forEach((nh) => {
        // Scale via SVG transform attribute (with manual center-point)
        if (scale !== 1) {
          try {
            const bbox = (nh as unknown as SVGGraphicsElement).getBBox();
            const cx = bbox.x + bbox.width / 2;
            const cy = bbox.y + bbox.height / 2;
            nh.setAttribute('transform', `translate(${cx},${cy}) scale(${scale}) translate(${-cx},${-cy})`);
          } catch { /* getBBox can fail */ }
        } else {
          nh.removeAttribute('transform');
        }

        if (color) {
          nh.querySelectorAll<SVGGraphicsElement>('use').forEach((shape) => {
            shape.setAttribute('fill', color!);
            shape.setAttribute('stroke', color!);
          });
        }
      });

      if (color && config.colorExtrasSelector) {
        stavenote.querySelectorAll<SVGGraphicsElement>(config.colorExtrasSelector).forEach((group) => {
          group.setAttribute('fill', color!);
          group.setAttribute('stroke', color!);
          group.querySelectorAll<SVGGraphicsElement>('path, use, polygon, line, ellipse').forEach((child) => {
            child.setAttribute('fill', color!);
            child.setAttribute('stroke', color!);
          });
        });
      }
    }
  }

  state.prevActiveRange = { start: firstActiveIndex, end: currentIndex };
}
