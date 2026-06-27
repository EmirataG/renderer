import { cookies } from 'next/headers';
import { adminAuth } from '@/lib/firebase-admin';
import { getDb } from '@/lib/firestore';
import { getBucket } from '@/lib/storage';

async function getAuthenticatedUser() {
  const cookieStore = await cookies();
  const session = cookieStore.get('__session')?.value;
  if (!session) return null;
  try {
    return await adminAuth.verifySessionCookie(session, true);
  } catch {
    return null;
  }
}

/**
 * Serves the uncropped original background image (used by the "Re-crop" flow).
 * Mirrors the cropped-background GET route but reads `originalBackgroundUrl`.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthenticatedUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  const { id } = await params;
  const db = getDb();
  const doc = await db
    .collection('users').doc(user.uid)
    .collection('projects').doc(id)
    .get();

  if (!doc.exists) return new Response('Not found', { status: 404 });

  const data = doc.data()!;
  if (!data.originalBackgroundUrl) return new Response('No original background', { status: 404 });

  const file = getBucket().file(data.originalBackgroundUrl);
  const [metadata] = await file.getMetadata();

  const etag = metadata.md5Hash || metadata.etag || '';
  const clientEtag = request.headers.get('If-None-Match');
  if (etag && clientEtag === etag) {
    return new Response(null, {
      status: 304,
      headers: { 'ETag': etag, 'Cache-Control': 'private, no-cache' },
    });
  }

  const [contents] = await file.download();
  return new Response(new Uint8Array(contents), {
    headers: {
      'Content-Type': metadata.contentType || 'image/jpeg',
      'Cache-Control': 'private, no-cache',
      'ETag': etag,
    },
  });
}
