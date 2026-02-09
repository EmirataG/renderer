import type { FastifyInstance } from 'fastify';
import { jobManager } from '../jobs/jobManager.js';

export default async function statusRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  fastify.get<{
    Params: { jobId: string };
  }>('/export/:jobId/status', async (request, reply) => {
    const { jobId } = request.params;
    const job = jobManager.getJob(jobId);

    if (!job) {
      return reply.status(404).send({ error: 'Job not found' });
    }

    return {
      jobId: job.id,
      status: job.status,
      createdAt: job.createdAt,
      completedAt: job.completedAt,
      error: job.error,
    };
  });
}
