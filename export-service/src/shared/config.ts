export const config = {
  /** HTTP server port */
  port: parseInt(process.env.PORT ?? '3001', 10),

  /** URL for Puppeteer to load the standalone render page. The export service serves its own /render route; override via FRONTEND_URL for production. */
  frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:3001/render',

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

  /** Timeout for waiting for renderer to become ready (30s) */
  pageReadyTimeoutMs: 30_000,
} as const;
