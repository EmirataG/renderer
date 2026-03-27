import type { ExportSettings } from '../shared/exportSettings.js';

export type JobStatus =
  | 'queued'
  | 'preparing'
  | 'rendering'
  | 'encoding'
  | 'complete'
  | 'error';

export type JobProgressEvent =
  | { type: 'stage'; jobId: string; stage: 'preparing' | 'rendering' | 'encoding' | 'muxing' }
  | { type: 'progress'; jobId: string; frame: number; totalFrames: number; percent: number }
  | { type: 'complete'; jobId: string; downloadUrl: string }
  | { type: 'error'; jobId: string; error: string }
  | { type: 'cancelled'; jobId: string };

export interface ExportJob {
  id: string;
  userId: string;
  status: JobStatus;
  createdAt: number;
  completedAt: number | undefined;
  tempDir: string;
  error: string | undefined;
  settings: ExportSettings;
  syncAnchors: Record<string, number>;
  outputPath?: string;
  // Progress tracking (for reconnection state sync)
  currentFrame?: number;
  totalFrames?: number;
  percent?: number;
  stage?: string;
  // Cancellation
  abortController?: AbortController;
}
