import { join } from 'node:path';

export const config = {
  /** HTTP server port */
  port: parseInt(process.env.PORT ?? '3001', 10),

  /** Frontend URL for Puppeteer to load. In dev, use Next.js dev server /render route; in prod, use FRONTEND_URL env var. */
  frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:3000/render',

  /** HTTP server host (0.0.0.0 = all interfaces) */
  host: '0.0.0.0',

  /** Maximum file size per upload (50MB) */
  maxFileSize: 50 * 1024 * 1024,

  /** Maximum number of files per request */
  maxFiles: 3,

  /** Maximum field size for settings JSON (5MB) */
  maxFieldSize: 5 * 1024 * 1024,

  /** Interval between temp directory cleanup sweeps (1 hour) */
  cleanupIntervalMs: 60 * 60 * 1000,

  /** Maximum age of a job before cleanup (2 hours) */
  jobMaxAgeMs: 2 * 60 * 60 * 1000,

  /** CORS origin setting (true = reflect request origin) */
  corsOrigin: true as const,

  /** Maximum concurrent Puppeteer browser instances */
  maxBrowsers: 3,

  /** Maximum time to wait to acquire a browser from the pool (30s) */
  browserAcquireTimeoutMs: 30_000,

  /** Idle browsers are destroyed after this duration (2 min) */
  browserIdleTimeoutMs: 120_000,

  /** Path to the frontend dist directory. Not used in dev (Next.js serves its own files), but may be relevant for production static export in the future. */
  frontendDistPath: join(import.meta.dirname, '../../../dist'),

  /** Timeout for waiting for renderer to become ready (30s) */
  pageReadyTimeoutMs: 30_000,
} as const;
