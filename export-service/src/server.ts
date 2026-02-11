import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import websocket from '@fastify/websocket';
import exportRoutes from './routes/export.js';
import statusRoutes from './routes/status.js';
import progressRoutes from './routes/progress.js';
import downloadRoutes from './routes/download.js';
import { config } from './shared/config.js';
import { jobManager } from './jobs/jobManager.js';
import { shutdownPool } from './browser/browserPool.js';

async function main() {
  const server = Fastify({ logger: true });

  // Pre-load standalone render page HTML at startup
  const renderHtml = readFileSync(join(import.meta.dirname, '../standalone-dist/render.html'), 'utf-8');

  // Register plugins
  await server.register(cors, { origin: config.corsOrigin });
  await server.register(multipart, {
    limits: {
      fileSize: config.maxFileSize,
      files: config.maxFiles,
      fieldSize: config.maxFieldSize,
    },
  });

  // Serve standalone render page assets (animation bundle + verovio WASM)
  await server.register(fastifyStatic, {
    root: join(import.meta.dirname, '../standalone-dist'),
    prefix: '/static/',
  });

  // Standalone render page route (served to Puppeteer for frame capture)
  server.get('/render', async (_request, reply) => {
    return reply.type('text/html').send(renderHtml);
  });

  // WebSocket support (must register before websocket routes)
  await server.register(websocket);

  // Health check
  server.get('/health', async () => ({ status: 'ok' }));

  // API routes
  await server.register(exportRoutes, { prefix: '/api' });
  await server.register(statusRoutes, { prefix: '/api' });
  await server.register(progressRoutes, { prefix: '/api' });
  await server.register(downloadRoutes, { prefix: '/api' });

  // Periodic cleanup of stale jobs
  const cleanupTimer = setInterval(() => {
    jobManager.cleanupStaleJobs(config.jobMaxAgeMs).catch((err) => {
      server.log.error(err, 'Failed to clean up stale jobs');
    });
  }, config.cleanupIntervalMs);

  // Clean up timer and browser pool on server close
  server.addHook('onClose', async () => {
    clearInterval(cleanupTimer);
    await shutdownPool();
  });

  // Start server
  await server.listen({ port: config.port, host: config.host });

  // Graceful shutdown for Fly.io auto-stop (SIGTERM) and local dev (SIGINT)
  const shutdown = async () => {
    await server.close(); // Triggers onClose hooks (cleanup timer, browser pool)
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error('Server startup failed:', err);
  process.exit(1);
});
