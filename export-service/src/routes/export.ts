import { pipeline } from 'node:stream/promises';
import { createWriteStream } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { jobManager } from '../jobs/jobManager.js';
import {
  validateExportSettings,
  validateSyncAnchors,
} from '../shared/validation.js';
import { createJobTempDir, cleanupTempDir } from '../utils/tempDir.js';

/**
 * Map common MIME types to file extensions.
 */
function mimeToExt(mimetype: string): string {
  const map: Record<string, string> = {
    'audio/mpeg': '.mp3',
    'audio/wav': '.wav',
    'audio/ogg': '.ogg',
    'audio/mp4': '.m4a',
    'application/xml': '.xml',
    'text/xml': '.xml',
    'image/png': '.png',
    'image/jpeg': '.jpg',
  };
  return map[mimetype] ?? '';
}

export default async function exportRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  fastify.post('/export', async (request, reply) => {
    let settingsRaw: string | null = null;
    let syncAnchorsRaw: string | null = null;
    const uploadedFiles = new Map<
      string,
      { path: string; mimetype: string }
    >();

    const jobId = randomUUID();
    const tempDir = await createJobTempDir(jobId);

    try {
      const parts = request.parts();

      for await (const part of parts) {
        if (part.type === 'field') {
          const value =
            typeof part.value === 'string'
              ? part.value
              : String(part.value);

          if (part.fieldname === 'settings') {
            settingsRaw = value;
          } else if (part.fieldname === 'syncAnchors') {
            syncAnchorsRaw = value;
          }
        } else if (part.type === 'file') {
          // Determine file extension from filename or MIME type
          let ext = extname(part.filename);
          if (!ext) {
            ext = mimeToExt(part.mimetype);
          }

          const destPath = join(tempDir, `${part.fieldname}${ext}`);

          // Audio files: stream to disk to avoid buffering large files in memory
          if (part.mimetype.startsWith('audio/')) {
            await pipeline(part.file, createWriteStream(destPath));
          } else {
            // Small files (musicXml, etc.): buffer then write
            const buf = await part.toBuffer();
            await writeFile(destPath, buf);
          }

          uploadedFiles.set(part.fieldname, {
            path: destPath,
            mimetype: part.mimetype,
          });
        }
      }

      // Validate required fields
      if (!settingsRaw) {
        return reply
          .status(400)
          .send({ error: 'Missing required field: settings' });
      }

      if (!syncAnchorsRaw) {
        return reply
          .status(400)
          .send({ error: 'Missing required field: syncAnchors' });
      }

      if (!uploadedFiles.has('musicXml')) {
        return reply
          .status(400)
          .send({ error: 'Missing required file: musicXml' });
      }

      if (!uploadedFiles.has('audio')) {
        return reply
          .status(400)
          .send({ error: 'Missing required file: audio' });
      }

      // Parse JSON fields
      let settings: unknown;
      let syncAnchors: unknown;

      try {
        settings = JSON.parse(settingsRaw);
      } catch {
        return reply
          .status(400)
          .send({ error: 'Invalid JSON in settings field' });
      }

      try {
        syncAnchors = JSON.parse(syncAnchorsRaw);
      } catch {
        return reply
          .status(400)
          .send({ error: 'Invalid JSON in syncAnchors field' });
      }

      // Validate settings against schema
      const settingsErrors = validateExportSettings(settings);
      if (settingsErrors.length > 0) {
        return reply
          .status(400)
          .send({ error: settingsErrors.join('; ') });
      }

      // Validate sync anchors
      const anchorsErrors = validateSyncAnchors(syncAnchors);
      if (anchorsErrors.length > 0) {
        return reply
          .status(400)
          .send({ error: anchorsErrors.join('; ') });
      }

      // Create job (associate with authenticated user)
      const userId = request.firebaseUser!.uid;
      const job = jobManager.createJob(
        jobId,
        userId,
        tempDir,
        settings as import('../shared/exportSettings.js').ExportSettings,
        syncAnchors as Record<string, number>,
      );

      // Fire-and-forget: start rendering in background
      // Do NOT await -- the route returns immediately with jobId
      jobManager.renderJob(job.id).catch((err) => {
        fastify.log.error(err, `Render job ${job.id} failed unexpectedly`);
      });

      return reply.status(201).send({ jobId: job.id, status: job.status });
    } catch (err) {
      // Clean up temp dir on any error
      await cleanupTempDir(tempDir);
      throw err;
    }
  });
}
