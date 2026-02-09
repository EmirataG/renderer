import { join } from 'node:path';
import { unlink } from 'node:fs/promises';
import type { Browser, BrowserContext, Page } from 'puppeteer';
import type { ExportJob, JobStatus } from './types.js';
import type { ExportSettings } from '../shared/exportSettings.js';
import { cleanupTempDir } from '../utils/tempDir.js';
import { browserPool } from '../browser/browserPool.js';
import { buildExportConfig, setupPage } from '../browser/pageSetup.js';
import { captureFrames } from '../browser/captureFrames.js';
import { config } from '../shared/config.js';
import { startVideoEncode } from '../encoding/encodeVideo.js';
import { muxAudio, findAudioFile } from '../encoding/muxAudio.js';

/**
 * In-memory job store for tracking export jobs.
 * Provides create, get, update, and cleanup operations.
 */
class JobManager {
  private jobs = new Map<string, ExportJob>();

  /**
   * Create a new export job and store it.
   */
  createJob(
    jobId: string,
    tempDir: string,
    settings: ExportSettings,
    syncAnchors: Record<string, number>,
  ): ExportJob {
    const job: ExportJob = {
      id: jobId,
      status: 'queued',
      createdAt: Date.now(),
      completedAt: undefined,
      tempDir,
      error: undefined,
      settings,
      syncAnchors,
    };
    this.jobs.set(jobId, job);
    return job;
  }

  /**
   * Get a job by ID, or undefined if not found.
   */
  getJob(id: string): ExportJob | undefined {
    return this.jobs.get(id);
  }

  /**
   * Update a job's status. Sets completedAt on terminal states.
   */
  updateStatus(id: string, status: JobStatus, error?: string): void {
    const job = this.jobs.get(id);
    if (!job) return;

    job.status = status;
    if (error !== undefined) {
      job.error = error;
    }

    if (status === 'complete' || status === 'error') {
      job.completedAt = Date.now();
    }
  }

  /**
   * Clean up a job's temp directory and remove it from the store.
   */
  async cleanupJob(id: string): Promise<void> {
    const job = this.jobs.get(id);
    if (!job) return;

    await cleanupTempDir(job.tempDir);
    this.jobs.delete(id);
  }

  /**
   * Clean up stale jobs older than maxAgeMs.
   */
  async cleanupStaleJobs(maxAgeMs: number): Promise<void> {
    const now = Date.now();
    const staleIds: string[] = [];

    for (const [id, job] of this.jobs) {
      if (job.createdAt + maxAgeMs < now) {
        staleIds.push(id);
      }
    }

    for (const id of staleIds) {
      await this.cleanupJob(id);
    }
  }

  /**
   * Render an export job: acquire browser, setup page with config injection,
   * capture all frames via async generator, update status, and clean up.
   *
   * Called fire-and-forget from the export route. Status transitions:
   * queued -> rendering -> complete | error
   */
  async renderJob(jobId: string): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) return;

    let browser: Browser | undefined;
    let context: BrowserContext | undefined;
    let page: Page | undefined;

    try {
      this.updateStatus(jobId, 'rendering');

      // Build ExportConfig from job data
      const exportConfig = await buildExportConfig(job);

      // Acquire browser from pool
      browser = await browserPool.acquire();

      // Setup page with config injection, readiness wait, duration verification
      const frontendUrl = `http://localhost:${config.port}/`;
      const viewport = { width: 1920, height: 1080 };
      const result = await setupPage(browser, frontendUrl, exportConfig, viewport);
      context = result.context;
      page = result.page;

      // Step 1: Start FFmpeg encode process
      const silentVideoPath = join(job.tempDir, 'video-silent.mp4');
      const encoder = startVideoEncode(silentVideoPath, exportConfig.fps, viewport.width, viewport.height);

      // Pipe captured frames directly to FFmpeg stdin (bounded memory)
      let frameCount = 0;
      for await (const { buffer } of captureFrames(page, result.totalFrames, exportConfig.fps)) {
        await encoder.writeFrame(buffer);
        frameCount++;
      }

      // Signal end of frames, wait for FFmpeg to finish encoding
      await encoder.finish();

      // Step 2: Mux audio into the silent video
      const audioPath = await findAudioFile(job.tempDir);
      const outputPath = join(job.tempDir, 'output.mp4');
      await muxAudio(silentVideoPath, audioPath, outputPath);

      // Clean up intermediate silent video file
      try { await unlink(silentVideoPath); } catch { /* ignore if already gone */ }

      // Store output path on job for download endpoint (Phase 19)
      job.outputPath = outputPath;

      this.updateStatus(jobId, 'complete');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.updateStatus(jobId, 'error', message);
    } finally {
      // Close page and context in reverse order, then release browser
      // Each step in its own try/catch to ensure subsequent cleanup runs
      if (page) {
        try { await page.close(); } catch { /* ignore */ }
      }
      if (context) {
        try { await context.close(); } catch { /* ignore */ }
      }
      if (browser) {
        try { await browserPool.release(browser); } catch { /* ignore */ }
      }
    }
  }
}

export const jobManager = new JobManager();
