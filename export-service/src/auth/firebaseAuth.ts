import fp from 'fastify-plugin';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth, type DecodedIdToken } from 'firebase-admin/auth';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

// Extend Fastify request with decoded Firebase user
declare module 'fastify' {
  interface FastifyRequest {
    firebaseUser?: DecodedIdToken;
  }
}

function initAdminAuth() {
  const existing = getApps();
  if (existing.length > 0) {
    return getAuth(existing[0]);
  }

  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      'Missing Firebase Admin env vars. Set FIREBASE_ADMIN_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL, and FIREBASE_ADMIN_PRIVATE_KEY.',
    );
  }

  const app = initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey: privateKey.replace(/\\n/g, '\n'),
    }),
  });

  return getAuth(app);
}

// Routes that skip authentication (internal / health)
const PUBLIC_PATHS = new Set(['/health', '/render']);

function isPublicRoute(url: string): boolean {
  const path = url.split('?')[0];
  if (PUBLIC_PATHS.has(path)) return true;
  if (path.startsWith('/static/')) return true;
  if (path === '/favicon.ico') return true;
  return false;
}

async function firebaseAuthPlugin(server: FastifyInstance) {
  const adminAuth = initAdminAuth();

  server.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    if (isPublicRoute(request.url)) return;

    // Accept token from Authorization header or ?token= query param (WebSocket)
    const authHeader = request.headers.authorization;
    const queryToken = (request.query as Record<string, string>).token;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : queryToken;

    if (!token) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
    try {
      request.firebaseUser = await adminAuth.verifyIdToken(token);
    } catch {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
  });
}

export default fp(firebaseAuthPlugin, { name: 'firebase-auth' });
