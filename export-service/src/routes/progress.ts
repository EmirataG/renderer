import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import '@fastify/websocket';
import { jobManager } from '../jobs/jobManager.js';
import type { JobProgressEvent } from '../jobs/types.js';

export default async function progressRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  fastify.get('/export/:jobId/ws', { websocket: true }, (socket: WebSocket, request) => {
    const { jobId } = request.params as { jobId: string };
    const job = jobManager.getJob(jobId);

    if (!job || job.userId !== request.firebaseUser!.uid) {
      socket.send(JSON.stringify({ type: 'error', error: 'Job not found' }));
      socket.close(4004, 'Job not found');
      return;
    }

    // Immediate state-sync for reconnection support
    socket.send(JSON.stringify({
      type: 'sync',
      status: job.status,
      stage: job.stage ?? null,
      frame: job.currentFrame ?? 0,
      totalFrames: job.totalFrames ?? 0,
      percent: job.percent ?? 0,
      error: job.error ?? null,
      downloadUrl: job.status === 'complete' ? `/api/export/${jobId}/download` : null,
    }));

    // Event forwarding -- only send if socket is still open
    const onProgress = (event: JobProgressEvent): void => {
      if (socket.readyState === socket.OPEN) {
        socket.send(JSON.stringify(event));
      }
    };
    jobManager.on(`job:${jobId}`, onProgress);

    // Cancel handling -- parse incoming messages
    socket.on('message', (data) => {
      try {
        const msg = JSON.parse(String(data));
        if (msg.type === 'cancel') {
          jobManager.cancelJob(jobId);
        }
      } catch {
        // Ignore malformed messages
      }
    });

    // Heartbeat: 30-second ping interval for keepalive
    const heartbeatInterval = setInterval(() => {
      if (socket.readyState === socket.OPEN) {
        socket.ping();
      }
    }, 30_000);

    // Cleanup on disconnect
    socket.on('close', () => {
      jobManager.off(`job:${jobId}`, onProgress);
      clearInterval(heartbeatInterval);
    });

    // Error handling -- close event follows and handles cleanup
    socket.on('error', () => {
      // Intentionally empty: close event handles cleanup
    });
  });
}
