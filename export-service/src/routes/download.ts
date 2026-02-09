import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import type { FastifyInstance } from 'fastify';
import { jobManager } from '../jobs/jobManager.js';

export default async function downloadRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  fastify.get<{
    Params: { jobId: string };
  }>('/export/:jobId/download', async (request, reply) => {
    const { jobId } = request.params;
    const job = jobManager.getJob(jobId);

    if (!job) {
      return reply.status(404).send({ error: 'Job not found' });
    }

    if (job.status !== 'complete' || !job.outputPath) {
      return reply.status(409).send({ error: 'Export not complete' });
    }

    let fileStat: Awaited<ReturnType<typeof stat>>;
    try {
      fileStat = await stat(job.outputPath);
    } catch (err: unknown) {
      if (err instanceof Error && 'code' in err && err.code === 'ENOENT') {
        return reply.status(410).send({ error: 'Export file no longer available' });
      }
      throw err;
    }

    const stream = createReadStream(job.outputPath);

    return reply
      .header('Content-Type', 'video/mp4')
      .header('Content-Disposition', `attachment; filename="export-${jobId}.mp4"`)
      .header('Content-Length', fileStat.size)
      .send(stream);
  });
}
