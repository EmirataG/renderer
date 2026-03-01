import { EventEmitter } from 'node:events';
import type { ExportJob, JobProgressEvent, JobStatus } from './types.js';
import type { ExportSettings } from '../shared/exportSettings.js';
import { cleanupTempDir } from '../utils/tempDir.js';
import { renderJobSSR } from '../ssr/renderPipeline.js';

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
   * Render an export job using the server-side SVG rendering pipeline.
   *
   * Replaces the previous Puppeteer-based approach with in-process
   * Verovio → SVG manipulation → resvg-js rasterization.
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

    try {
      const outputPath = await renderJobSSR(
        job,
        signal,
        // onStage callback
        (stage) => {
          this.updateStatus(jobId, stage === 'muxing' ? 'rendering' : stage as JobStatus);
          job.stage = stage;
          this.emitJobEvent({ type: 'stage', jobId, stage });
        },
        // onProgress callback
        (frame, totalFrames, percent) => {
          job.currentFrame = frame;
          job.totalFrames = totalFrames;
          job.percent = percent;
          this.emitJobEvent({
            type: 'progress',
            jobId,
            frame,
            totalFrames,
            percent,
          });
        },
      );

      // Store output path for download endpoint
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
      job.abortController = undefined;
    }
  }
}

export const jobManager = new JobManager();
