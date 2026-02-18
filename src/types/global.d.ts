/**
 * Global type declarations for window API extensions.
 * These are used by Puppeteer for headless animation frame control.
 */

export {};

declare global {
  /**
   * Export configuration injected by Puppeteer's evaluateOnNewDocument.
   * Mirrors ExportSettings schema plus musicXml, syncAnchors, audioDuration, and bgUrl.
   */
  interface ExportConfig {
    musicXml: string;
    syncAnchors: Record<string, number>;
    audioDuration: number;
    fps: number;
    scoreColor: string;
    scoreShadowDistance: number;
    hideUnplayedNotes: boolean;
    smoothReveal: boolean;
    scoreRegion: { x: number; y: number; width: number; height: number; rotation?: number; perspective?: { topLeft: { x: number; y: number }; topRight: { x: number; y: number }; bottomRight: { x: number; y: number }; bottomLeft: { x: number; y: number } } } | null;
    scoreBorder: string;
    scoreScale: number;
    musicFont: string;
    activeNoteheadColor: string | null;
    activeNoteheadScale: number;
    activeNoteheadEntryMs: number;
    activeNoteheadHoldMs: number;
    activeNoteheadExitMs: number;
    colorFullNote: boolean;
    hideLabels: boolean;
    bgUrl: string | null;
    viewportWidth: number;
    viewportHeight: number;
  }

  interface Window {
    /**
     * Export config injected by Puppeteer's evaluateOnNewDocument before page load.
     * When present, main.tsx routes to RenderApp instead of App.
     */
    __EXPORT_CONFIG__?: ExportConfig;

    /**
     * Readiness signal for backend polling.
     * Set to true when animation controller is exposed with interpolated events.
     */
    rendererReady?: boolean;

    /**
     * Animation control API exposed by RegularRenderer for Puppeteer frame capture.
     */
    animationController?: {
      setFrame: (frameNumber: number, fps?: number) => void;
      setTimestamp: (seconds: number) => void;
      getDuration: () => number;
      getFps: () => number;
    };

    /**
     * Set animation to specific frame number.
     * Puppeteer calls this via page.evaluate() to position the animation for screenshot.
     * @param frame - Frame number (0-based)
     * @param fps - Frames per second (default 30)
     */
    setAnimationFrame?: (frame: number, fps?: number) => void;

    /**
     * Set animation to specific timestamp in seconds.
     * Alternative to setAnimationFrame for timestamp-based control.
     * @param seconds - Timestamp in seconds
     */
    setAnimationTimestamp?: (seconds: number) => void;

    /**
     * Get total animation duration in seconds.
     * Returns the audio file's duration.
     * @returns Duration in seconds
     */
    getAnimationDuration?: () => number;

    /**
     * Check if animation controller is ready.
     * Puppeteer should wait for this to return true before calling other methods.
     * @returns true if controller is initialized
     */
    isAnimationReady?: () => boolean;
  }
}
