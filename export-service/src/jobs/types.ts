import type { ExportSettings } from '../shared/exportSettings.js';

export type JobStatus =
  | 'queued'
  | 'preparing'
  | 'rendering'
  | 'encoding'
  | 'complete'
  | 'error';

export interface ExportJob {
  id: string;
  status: JobStatus;
  createdAt: number;
  completedAt: number | undefined;
  tempDir: string;
  error: string | undefined;
  settings: ExportSettings;
  syncAnchors: Record<string, number>;
  outputPath?: string;
}
