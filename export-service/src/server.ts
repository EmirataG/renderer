import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import exportRoutes from './routes/export.js';
import statusRoutes from './routes/status.js';
import { config } from './shared/config.js';
import { jobManager } from './jobs/jobManager.js';
import { shutdownPool } from './browser/browserPool.js';

async function main() {
  const server = Fastify({ logger: true });

  // Register plugins
  await server.register(cors, { origin: config.corsOrigin });
  await server.register(multipart, {
    limits: {
      fileSize: config.maxFileSize,
      files: config.maxFiles,
      fieldSize: config.maxFieldSize,
    },
  });

  // Serve the Vite-built frontend for Puppeteer to load
  await server.register(fastifyStatic, {
    root: config.frontendDistPath,
    prefix: '/',
    decorateReply: false,
  });

  // Health check
  server.get('/health', async () => ({ status: 'ok' }));

  // API routes
  await server.register(exportRoutes, { prefix: '/api' });
  await server.register(statusRoutes, { prefix: '/api' });

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
}

main().catch((err) => {
  console.error('Server startup failed:', err);
  process.exit(1);
});
