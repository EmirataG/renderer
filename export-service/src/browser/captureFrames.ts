import type { Page } from 'puppeteer';

/**
 * Async generator that captures each frame of the animation as a PNG buffer.
 *
 * For each frame:
 * 1. Calls animationController.setFrame(frame, fps) to position the animation
 * 2. Takes a screenshot yielding a PNG Uint8Array
 *
 * Consumers iterate this generator to receive frame buffers in order.
 * Phase 18 will pipe these directly to FFmpeg stdin.
 */
export async function* captureFrames(
  page: Page,
  totalFrames: number,
  fps: number,
): AsyncGenerator<{ buffer: Uint8Array; frame: number; totalFrames: number }> {
  for (let frame = 0; frame < totalFrames; frame++) {
    await page.evaluate(
      (f: number, fpsVal: number) => {
        (window as any).animationController.setFrame(f, fpsVal);
      },
      frame,
      fps,
    );

    const buffer = await page.screenshot({
      type: 'png',
      optimizeForSpeed: true,
      captureBeyondViewport: false,
    });

    yield { buffer, frame, totalFrames };
  }
}
