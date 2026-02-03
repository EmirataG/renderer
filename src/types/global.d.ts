/**
 * Global type declarations for window API extensions.
 * These are used by Puppeteer for headless animation frame control.
 */

export {};

declare global {
  interface Window {
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
