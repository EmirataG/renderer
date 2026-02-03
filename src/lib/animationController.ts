import type { OpenSheetMusicDisplay } from 'opensheetmusicdisplay';
import type { InterpolatedEvent } from './interpolation';

/**
 * Configuration for initializing the animation controller.
 */
export interface AnimationControllerConfig {
  /** Audio element for duration information (optional in render mode) */
  audioElement: HTMLAudioElement | null;
  /** OSMD instance for DOM access to notes */
  osmdInstance: OpenSheetMusicDisplay;
  /** Function to get current interpolated events */
  getInterpolatedEvents: () => InterpolatedEvent[];
  /** Container element where OSMD rendered (for DOM queries) */
  containerElement: HTMLElement;
}

/**
 * Animation controller interface for Puppeteer frame control.
 */
export interface AnimationController {
  /** Set animation to specific frame (frame / fps = timestamp) */
  setFrame: (frameNumber: number, fps?: number) => void;
  /** Set animation to specific timestamp in seconds */
  setTimestamp: (seconds: number) => void;
  /** Get total audio duration in seconds */
  getDuration: () => number;
  /** Get default FPS */
  getFps: () => number;
}

// Store for controller internals
let config: AnimationControllerConfig | null = null;

// Track currently highlighted svgIds for cleanup
let currentHighlightedSvgIds: string[] = [];

// Default FPS for animation
const DEFAULT_FPS = 30;

// Highlight color for currently playing notes (orange)
const PLAYING_COLOR = '#f59e0b';

/**
 * Apply color to notehead shapes for given SVG IDs.
 * Uses inline styles for immediate, synchronous updates.
 */
function applyNoteColor(container: HTMLElement, svgIds: string[], color: string): void {
  svgIds.forEach(svgId => {
    const stavenote = container.querySelector(`#${CSS.escape(svgId)}`);
    if (!stavenote) return;
    const shapes = stavenote.querySelectorAll<SVGGraphicsElement>('.vf-notehead path, .vf-notehead ellipse');
    shapes.forEach(shape => {
      shape.style.fill = color;
      shape.style.stroke = color;
    });
  });
}

/**
 * Clear color from notehead shapes (restore to default).
 */
function clearNoteColor(container: HTMLElement, svgIds: string[]): void {
  svgIds.forEach(svgId => {
    const stavenote = container.querySelector(`#${CSS.escape(svgId)}`);
    if (!stavenote) return;
    const shapes = stavenote.querySelectorAll<SVGGraphicsElement>('.vf-notehead path, .vf-notehead ellipse');
    shapes.forEach(shape => {
      shape.style.removeProperty('fill');
      shape.style.removeProperty('stroke');
    });
  });
}

/**
 * Set animation to a specific timestamp.
 * Finds the event at or before the timestamp and highlights it.
 * This is synchronous so Puppeteer can screenshot immediately after.
 */
function setTimestamp(seconds: number): void {
  if (!config) {
    console.warn('AnimationController not initialized');
    return;
  }

  const events = config.getInterpolatedEvents();
  if (events.length === 0) return;

  // Find the event that should be highlighted at this timestamp
  // (last event whose computedTimestamp <= seconds)
  let targetEventIndex = -1;
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].computedTimestamp <= seconds) {
      targetEventIndex = i;
      break;
    }
  }

  // Clear previous highlighting
  if (currentHighlightedSvgIds.length > 0) {
    clearNoteColor(config.containerElement, currentHighlightedSvgIds);
    currentHighlightedSvgIds = [];
  }

  // Apply highlighting to current event
  if (targetEventIndex >= 0) {
    const targetEvent = events[targetEventIndex];
    applyNoteColor(config.containerElement, targetEvent.svgIds, PLAYING_COLOR);
    currentHighlightedSvgIds = [...targetEvent.svgIds];
  }
}

/**
 * Set animation to a specific frame number.
 * Converts frame to timestamp using: timestamp = frameNumber / fps
 */
function setFrame(frameNumber: number, fps: number = DEFAULT_FPS): void {
  const timestamp = frameNumber / fps;
  setTimestamp(timestamp);
}

/**
 * Get total audio duration in seconds.
 * Returns 0 if audio element is not available (render mode).
 */
function getDuration(): number {
  if (!config) {
    console.warn('AnimationController not initialized');
    return 0;
  }
  // In render mode, audioElement may be null
  return config.audioElement?.duration || 0;
}

/**
 * Get default FPS value.
 */
function getFps(): number {
  return DEFAULT_FPS;
}

/**
 * Initialize the animation controller with required references.
 * Call this after OSMD instance is ready and audio is loaded.
 *
 * @param controllerConfig - Configuration with audio, OSMD, and event getter
 * @returns AnimationController interface for frame control
 */
export function initAnimationController(
  controllerConfig: AnimationControllerConfig
): AnimationController {
  config = controllerConfig;
  currentHighlightedSvgIds = [];

  return {
    setFrame,
    setTimestamp,
    getDuration,
    getFps,
  };
}

/**
 * Clean up the animation controller.
 * Call this when unmounting to clear references.
 */
export function destroyAnimationController(): void {
  if (config && currentHighlightedSvgIds.length > 0) {
    clearNoteColor(config.containerElement, currentHighlightedSvgIds);
  }
  config = null;
  currentHighlightedSvgIds = [];
}
