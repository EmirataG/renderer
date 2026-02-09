import { EventEmitter } from 'node:events';
import { join } from 'node:path';
import { unlink } from 'node:fs/promises';
import type { Browser, BrowserContext, Page } from 'puppeteer';
import type { ExportJob, JobProgressEvent, JobStatus } from './types.js';
import type { ExportSettings } from '../shared/exportSettings.js';
import { cleanupTempDir } from '../utils/tempDir.js';
import { browserPool } from '../browser/browserPool.js';
import { buildExportConfig, setupPage } from '../browser/pageSetup.js';
import { captureFrames } from '../browser/captureFrames.js';
import { config } from '../shared/config.js';
import { startVideoEncode } from '../encoding/encodeVideo.js';
import { muxAudio, findAudioFile } from '../encoding/muxAudio.js';

/** Minimum interval between progress event emissions (ms). */
const PROGRESS_INTERVAL_MS = 250;

/**
 * In-memory job store for tracking export jobs.
 * Extends EventEmitter to emit typed progress events on `job:${jobId}` channels.
 * Provides create, get, update, cleanup, cancel, and render operations.
 */
class JobManager extends EventEmitter {
  private jobs = new Map<string, ExportJob>();

  constructor() {
    super();
  }

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
   * Emit a typed progress event on the job-specific channel.
   */
  private emitJobEvent(event: JobProgressEvent): void {
    this.emit(`job:${event.jobId}`, event);
  }

  /**
   * Cancel a running export job by aborting its AbortController.
   */
  cancelJob(jobId: string): void {
    const job = this.jobs.get(jobId);
    if (job?.abortController) {
      job.abortController.abort();
    }
  }

  /**
   * Render an export job: acquire browser, setup page with config injection,
   * capture all frames via async generator, update status, and clean up.
   *
   * Emits throttled progress events on `job:${jobId}` channel.
   * Supports cancellation via AbortController/AbortSignal.
   *
   * Called fire-and-forget from the export route. Status transitions:
   * queued -> preparing -> rendering -> encoding -> complete | error
   */
  async renderJob(jobId: string): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) return;

    const abortController = new AbortController();
    job.abortController = abortController;
    const { signal } = abortController;

    let browser: Browser | undefined;
    let context: BrowserContext | undefined;
    let page: Page | undefined;

    try {
      this.updateStatus(jobId, 'preparing');
      job.stage = 'preparing';
      this.emitJobEvent({ type: 'stage', jobId, stage: 'preparing' });

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

      // Emit rendering stage
      this.updateStatus(jobId, 'rendering');
      job.stage = 'rendering';
      this.emitJobEvent({ type: 'stage', jobId, stage: 'rendering' });

      // Start FFmpeg encode process
      const silentVideoPath = join(job.tempDir, 'video-silent.mp4');
      const encoder = startVideoEncode(silentVideoPath, exportConfig.fps, viewport.width, viewport.height);

      // Pipe captured frames directly to FFmpeg stdin (bounded memory)
      // with throttled progress emission
      let lastProgressTime = 0;

      for await (const { buffer, frame, totalFrames } of captureFrames(page, result.totalFrames, exportConfig.fps, signal)) {
        if (signal.aborted) break;
        await encoder.writeFrame(buffer);

        // Update job progress state (always, for reconnection sync)
        job.currentFrame = frame + 1;
        job.totalFrames = totalFrames;
        job.percent = Math.round(((frame + 1) / totalFrames) * 100);

        // Throttle progress event emission to 250ms intervals
        const now = Date.now();
        if (now - lastProgressTime >= PROGRESS_INTERVAL_MS || frame === totalFrames - 1) {
          lastProgressTime = now;
          this.emitJobEvent({
            type: 'progress',
            jobId,
            frame: frame + 1,
            totalFrames,
            percent: job.percent,
          });
        }
      }

      // Check cancellation after capture loop
      if (signal.aborted) {
        encoder.kill();
        throw new Error('Export cancelled by user');
      }

      // Signal end of frames, wait for FFmpeg to finish encoding
      this.updateStatus(jobId, 'encoding');
      job.stage = 'encoding';
      this.emitJobEvent({ type: 'stage', jobId, stage: 'encoding' });
      await encoder.finish();

      // Check cancellation before muxing
      if (signal.aborted) {
        throw new Error('Export cancelled by user');
      }

      // Mux audio into the silent video
      job.stage = 'muxing';
      this.emitJobEvent({ type: 'stage', jobId, stage: 'muxing' });

      const audioPath = await findAudioFile(job.tempDir);
      const outputPath = join(job.tempDir, 'output.mp4');
      await muxAudio(silentVideoPath, audioPath, outputPath);

      // Clean up intermediate silent video file
      try { await unlink(silentVideoPath); } catch { /* ignore if already gone */ }

      // Store output path on job for download endpoint
      job.outputPath = outputPath;

      this.updateStatus(jobId, 'complete');
      this.emitJobEvent({ type: 'complete', jobId, downloadUrl: `/api/export/${jobId}/download` });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);

      if (signal.aborted) {
        this.updateStatus(jobId, 'error', 'Cancelled by user');
        this.emitJobEvent({ type: 'cancelled', jobId });
      } else {
        this.updateStatus(jobId, 'error', message);
        this.emitJobEvent({ type: 'error', jobId, error: message });
      }
    } finally {
      // Clear abort controller reference
      job.abortController = undefined;

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
