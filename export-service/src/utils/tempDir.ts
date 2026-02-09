import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Create an isolated temp directory for a specific export job.
 * Uses the OS temp directory with a job-specific prefix.
 */
export async function createJobTempDir(jobId: string): Promise<string> {
  const prefix = join(tmpdir(), `manuscript-export-${jobId}-`);
  return mkdtemp(prefix);
}

/**
 * Clean up a job's temp directory.
 * Logs but does not throw on failure (best-effort cleanup).
 */
export async function cleanupTempDir(tempDir: string): Promise<void> {
  try {
    await rm(tempDir, { recursive: true, force: true });
  } catch (err) {
    console.error(`Failed to clean up temp directory ${tempDir}:`, err);
  }
}
