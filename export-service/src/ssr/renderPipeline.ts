/**
 * SSR render pipeline orchestrator.
 *
 * Replaces the Puppeteer-based workflow in jobManager.ts with a fully
 * in-process rendering pipeline:
 *
 *   1. Build ExportConfig from job data (reuses existing buildExportConfig)
 *   2. Start FFmpeg encode process (PNG input mode)
 *   3. Iterate renderFrames() generator, pipe PNG buffers to FFmpeg
 *   4. Finish encoding, mux audio
 *   5. Return output path
 *
 * No browser pool, no page setup, no IPC round-trips.
 */

import { join } from 'node:path';
import { unlink } from 'node:fs/promises';

import { buildExportConfig } from '../shared/exportConfig.js';
import { startVideoEncode } from '../encoding/encodeVideo.js';
import { muxAudio, findAudioFile } from '../encoding/muxAudio.js';
import type { ExportJob, JobProgressEvent } from '../jobs/types.js';
import { renderFrames } from './renderFrames.js';

/** Minimum interval between progress event emissions (ms). */
const PROGRESS_INTERVAL_MS = 250;

/**
 * Run a complete SSR export job.
 *
 * @param job - The export job with settings, syncAnchors, and tempDir
 * @param signal - AbortSignal for cancellation
 * @param onStage - Callback when the job enters a new stage
 * @param onProgress - Callback for frame progress updates
 * @returns Path to the final output MP4 file
 */
export async function renderJobSSR(
  job: ExportJob,
  signal: AbortSignal,
  onStage: (stage: 'preparing' | 'rendering' | 'encoding' | 'muxing') => void,
  onProgress: (frame: number, totalFrames: number, percent: number) => void,
): Promise<string> {
  // 1. Build ExportConfig from job data
  onStage('preparing');
  const exportConfig = await buildExportConfig(job);

  const duration = exportConfig.audioDuration;
  if (duration <= 0) {
    throw new Error(
      `Animation has no duration (got ${duration}) -- check MusicXML and sync anchors`,
    );
  }

  const totalFrames = Math.ceil(duration * exportConfig.fps);
  const viewport = { width: exportConfig.viewportWidth, height: exportConfig.viewportHeight };

  console.log(`[SSR Pipeline] Duration: ${duration}s, ${totalFrames} frames, ${viewport.width}x${viewport.height}`);

  // 2. Start FFmpeg encode process (PNG input mode)
  onStage('rendering');
  const silentVideoPath = join(job.tempDir, 'video-silent.mp4');
  const encoder = startVideoEncode(
    silentVideoPath,
    exportConfig.fps,
    viewport.width,
    viewport.height,
    'rawvideo',
  );

  console.log('[SSR Pipeline] FFmpeg started, beginning frame generation...');

  // 3. Iterate frame generator, pipe to FFmpeg
  let lastProgressTime = 0;

  try {
    for await (const { buffer, frame, totalFrames: total } of renderFrames(exportConfig, signal)) {
      if (signal.aborted) break;

      await encoder.writeFrame(buffer);

      // Throttled progress reporting
      const now = Date.now();
      if (now - lastProgressTime >= PROGRESS_INTERVAL_MS || frame === total - 1) {
        lastProgressTime = now;
        const percent = Math.round(((frame + 1) / total) * 100);
        onProgress(frame + 1, total, percent);
      }
    }

    if (signal.aborted) {
      encoder.kill();
      throw new Error('Export cancelled by user');
    }

    // 4. Finish encoding
    onStage('encoding');
    await encoder.finish();

    if (signal.aborted) {
      throw new Error('Export cancelled by user');
    }

    // 5. Mux audio
    onStage('muxing');
    const audioPath = await findAudioFile(job.tempDir);
    const outputPath = join(job.tempDir, 'output.mp4');
    await muxAudio(silentVideoPath, audioPath, outputPath);

    // Clean up intermediate silent video
    try { await unlink(silentVideoPath); } catch { /* ignore */ }

    console.log(`[SSR Pipeline] Export complete: ${outputPath}`);
    return outputPath;
  } catch (err) {
    // Make sure FFmpeg is killed on error
    try { encoder.kill(); } catch { /* ignore */ }
    throw err;
  }
}
