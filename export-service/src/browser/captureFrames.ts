import type { Page } from 'puppeteer';

/**
 * Async generator that captures each frame of the animation as a PNG buffer.
 *
 * For each frame:
 * 1. Calls animationController.setFrame(frame, fps) to position the animation
 * 2. Takes a screenshot yielding a PNG Uint8Array
 *
 * Consumers iterate this generator to receive frame buffers in order.
 * Accepts an optional AbortSignal to allow prompt cancellation between frames.
 */
export async function* captureFrames(
  page: Page,
  totalFrames: number,
  fps: number,
  signal?: AbortSignal,
): AsyncGenerator<{ buffer: Uint8Array; frame: number; totalFrames: number }> {
  for (let frame = 0; frame < totalFrames; frame++) {
    if (signal?.aborted) break;

    await page.evaluate(
      (f: number, fpsVal: number) => {
        (window as any).animationController.setFrame(f, fpsVal);
      },
      frame,
      fps,
    );

    if (signal?.aborted) break;

    const buffer = await page.screenshot({
      type: 'jpeg',
      quality: 90,
      optimizeForSpeed: true,
      captureBeyondViewport: false,
    });

    yield { buffer, frame, totalFrames };
  }
}
