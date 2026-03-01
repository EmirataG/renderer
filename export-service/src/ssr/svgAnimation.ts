/**
 * Server-side SVG animation module.
 *
 * Port of standalone/animation.ts that operates on SVG DOM elements
 * (via linkedom) instead of HTML DOM elements in a browser.
 *
 * Key differences from browser animation:
 * - Camera: modifies SVG <g> transform attribute (not CSS style.transform)
 * - Notehead scale: uses explicit translate/scale/translate SVG transform
 *   (replaces CSS transform-box: fill-box; transform-origin: center)
 * - Notehead color: sets inline style attribute (overrides CSS rules)
 * - Reset: removes inline styles and restores original transforms
 *
 * Reuses the pure-math functions from animation.ts:
 * - cssEaseOut, interpolateColor (easing + color)
 * - AnimationState, AnimationConfig, AnimationEvent (types + state)
 * - createAnimationState (factory)
 */

import {
  cssEaseOut,
  interpolateColor,
  type AnimationState,
  type AnimationConfig,
  type AnimationEvent,
} from '../standalone/animation.js';

// Re-export for convenience
export { createAnimationState } from '../standalone/animation.js';
export type { AnimationState, AnimationConfig, AnimationEvent };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FULL_NOTE_SELECTORS = 'g.stem, g.accid, g.flag, g.dots, g.artic';

// ---------------------------------------------------------------------------
// SVG-specific reset
// ---------------------------------------------------------------------------

/**
 * Reset notehead/stem/accid/flag/dots/artic styles for a single event's
 * SVG elements. SVG version of resetEventNoteheads from animation.ts.
 *
 * Removes inline style attributes (fill/stroke) and restores original
 * transforms on notehead groups.
 */
export function resetEventNoteheadsSvg(
  pageDocs: Document[],
  svgIds: string[],
  colorFullNote: boolean,
  originalTransforms: Map<Element, string | null>,
): void {
  for (const id of svgIds) {
    const stavenote = findElementById(pageDocs, id);
    if (!stavenote) continue;

    // Reset noteheads: transform and color
    const noteheads = stavenote.querySelectorAll('g.notehead');
    for (const nh of noteheads) {
      // Restore original transform
      const original = originalTransforms.get(nh);
      if (original) {
        nh.setAttribute('transform', original);
      } else {
        nh.removeAttribute('transform');
      }

      // Remove color overrides on <use> children
      for (const use of nh.querySelectorAll('use')) {
        use.removeAttribute('style');
      }
    }

    // Reset full-note coloring
    if (colorFullNote) {
      const extras = stavenote.querySelectorAll(FULL_NOTE_SELECTORS);
      for (const group of extras) {
        group.removeAttribute('style');
        for (const child of group.querySelectorAll('path, use, polygon, line')) {
          child.removeAttribute('style');
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Core frame-by-frame setTimestamp (SVG version)
// ---------------------------------------------------------------------------

/**
 * Advance the animation to a given timestamp (seconds).
 *
 * SVG-adapted version of setTimestamp from animation.ts.
 * Instead of CSS style properties, this modifies SVG attributes directly.
 *
 * @param cameraTransformCb - Callback to set the camera Y value
 *   (the compositor uses this to set the camera group's transform)
 */
export function setTimestampSvg(
  seconds: number,
  events: AnimationEvent[],
  state: AnimationState,
  config: AnimationConfig,
  pageDocs: Document[],
  noteheadCenters: Map<Element, { cx: number; cy: number }>,
  originalTransforms: Map<Element, string | null>,
): { cameraY: number } {
  const totalEvents = events.length;
  if (totalEvents === 0) return { cameraY: state.cameraY };

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
  if (currentIndex < 0) return { cameraY: state.cameraY };
  const currentEvent = events[currentIndex];

  // --- Camera: simulate preview's CSS "transform 200ms ease-out" ---
  const eventY = currentEvent.y;
  const scoreHeight = config.totalHeight;
  const viewportHeight = config.scoreRegionHeight ?? config.containerHeight;

  let newTargetCameraY = eventY - viewportHeight / 2;
  newTargetCameraY = Math.max(0, newTargetCameraY);
  newTargetCameraY = Math.min(
    newTargetCameraY,
    Math.max(0, scoreHeight - viewportHeight),
  );

  // Detect target change → start a new transition
  if (Math.abs(newTargetCameraY - state.transitionTarget) > 0.5) {
    state.transitionFrom = state.cameraY;
    state.transitionTarget = newTargetCameraY;
    state.transitionStart = seconds;
  }

  // Simulate 200ms ease-out
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

  state.cameraY = visualCameraY;
  state.eventIndex = currentIndex;
  state.currentY = eventY;

  // --- Notehead animation: delta-based per-frame ---
  const holdSeconds = config.activeNoteheadHoldMs / 1000;
  const exitSeconds = config.activeNoteheadExitMs / 1000;
  const animDuration = holdSeconds + exitSeconds;

  // Find firstActiveIndex
  let firstActiveIndex = currentIndex;
  while (firstActiveIndex > 0) {
    const prevEvent = events[firstActiveIndex - 1];
    const timeSincePrev = seconds - prevEvent.computedTimestamp;
    if (timeSincePrev >= animDuration || !prevEvent.svgIds?.length) {
      break;
    }
    firstActiveIndex--;
  }
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
        resetEventNoteheadsSvg(
          pageDocs,
          evt.svgIds,
          config.colorFullNote,
          originalTransforms,
        );
      }
    }
  }

  // Apply/update styles for the active window
  for (let i = firstActiveIndex; i <= currentIndex; i++) {
    const event = events[i];
    const eventTime = event.computedTimestamp;
    const timeSinceEvent = seconds - eventTime;

    if (timeSinceEvent < 0 || !event.svgIds?.length) continue;

    let scale: number;
    let color: string | undefined;

    if (timeSinceEvent < holdSeconds) {
      scale = config.activeNoteheadScale;
      color = config.activeNoteheadColor;
    } else if (timeSinceEvent < animDuration) {
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
      resetEventNoteheadsSvg(
        pageDocs,
        event.svgIds,
        config.colorFullNote,
        originalTransforms,
      );
      continue;
    }

    // Apply animation to SVG elements
    for (const id of event.svgIds) {
      const stavenote = findElementById(pageDocs, id);
      if (!stavenote) continue;

      const noteheads = stavenote.querySelectorAll('g.notehead');
      for (const nh of noteheads) {
        // Scale using explicit center-based SVG transform
        // Replaces: transform-box: fill-box; transform-origin: center; transform: scale(s)
        const center = noteheadCenters.get(nh);
        if (center && scale !== 1) {
          const { cx, cy } = center;
          nh.setAttribute(
            'transform',
            `translate(${cx}, ${cy}) scale(${scale}) translate(${-cx}, ${-cy})`,
          );
        } else if (scale === 1) {
          const original = originalTransforms.get(nh);
          if (original) {
            nh.setAttribute('transform', original);
          } else {
            nh.removeAttribute('transform');
          }
        }

        // Color via inline style on <use> children
        if (color) {
          for (const use of nh.querySelectorAll('use')) {
            use.setAttribute('style', `fill: ${color}; stroke: ${color}; color: ${color}`);
          }
        }
      }

      // Full-note coloring (stems, accidentals, flags, dots, artics)
      if (color && config.colorFullNote) {
        const extras = stavenote.querySelectorAll(FULL_NOTE_SELECTORS);
        for (const group of extras) {
          group.setAttribute('style', `fill: ${color}; stroke: ${color}; color: ${color}`);
          for (const child of group.querySelectorAll('path, use, polygon, line')) {
            child.setAttribute('style', `fill: ${color}; stroke: ${color}; color: ${color}`);
          }
        }
      }
    }
  }

  // Store current active range for next frame's delta
  state.prevActiveRange = { start: firstActiveIndex, end: currentIndex };

  return { cameraY: visualCameraY };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Find an element by ID across multiple parsed page Documents.
 */
function findElementById(pageDocs: Document[], id: string): Element | null {
  for (const doc of pageDocs) {
    const el = doc.getElementById(id);
    if (el) return el;
  }
  return null;
}

/**
 * Save original transform attributes for all notehead groups that may be
 * animated. Called once during setup, before any animation is applied.
 */
export function saveOriginalTransforms(
  pageDocs: Document[],
  events: AnimationEvent[],
): Map<Element, string | null> {
  const originals = new Map<Element, string | null>();

  for (const event of events) {
    for (const id of event.svgIds) {
      const stavenote = findElementById(pageDocs, id);
      if (!stavenote) continue;

      const noteheads = stavenote.querySelectorAll('g.notehead');
      for (const nh of noteheads) {
        if (!originals.has(nh)) {
          originals.set(nh, nh.getAttribute('transform'));
        }
      }
    }
  }

  return originals;
}
