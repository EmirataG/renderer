import { cookies } from 'next/headers';
import { adminAuth } from '@/lib/firebase-admin';
import { getDb, FieldValue } from '@/lib/firestore';
import { uploadFile, getBucket } from '@/lib/storage';

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

const ALLOWED_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];
const MAX_IMAGE_SIZE = 20 * 1024 * 1024; // 20MB

function getExtension(filename: string): string {
  const lastDot = filename.lastIndexOf('.');
  if (lastDot === -1) return '';
  return filename.slice(lastDot).toLowerCase();
}

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
  if (!data.backgroundUrl) return new Response('No background', { status: 404 });

  const file = getBucket().file(data.backgroundUrl);
  const [metadata] = await file.getMetadata();

  // ETag from storage metadata (md5Hash or etag)
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

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthenticatedUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  // Verify project exists and belongs to user
  const db = getDb();
  const docRef = db.collection('users').doc(user.uid).collection('projects').doc(id);
  const doc = await docRef.get();
  if (!doc.exists) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  const formData = await request.formData();
  const bgFile = formData.get('background') as File | null;
  if (!bgFile) {
    return Response.json({ error: 'No background file provided' }, { status: 400 });
  }

  // Validate extension
  const ext = getExtension(bgFile.name);
  if (!ALLOWED_IMAGE_EXTENSIONS.includes(ext)) {
    return Response.json(
      { error: `Invalid image type. Allowed: ${ALLOWED_IMAGE_EXTENSIONS.join(', ')}` },
      { status: 400 }
    );
  }

  // Validate size
  if (bgFile.size > MAX_IMAGE_SIZE) {
    return Response.json({ error: 'Image too large. Maximum 20MB.' }, { status: 400 });
  }

  const basePath = `users/${user.uid}/projects/${id}`;

  // Delete old files and upload new one in parallel
  const [, backgroundUrl] = await Promise.all([
    getBucket().getFiles({ prefix: `${basePath}/background` })
      .then(([files]) => Promise.all(files.map(f => f.delete()))),
    bgFile.arrayBuffer()
      .then(ab => uploadFile(`${basePath}/background${ext}`, Buffer.from(ab), bgFile.type || 'image/jpeg')),
  ]);

  // Update Firestore document
  await docRef.update({
    backgroundUrl,
    backgroundFileName: bgFile.name,
    updatedAt: FieldValue.serverTimestamp(),
  });

  return Response.json({ backgroundUrl: `/api/projects/${id}/background` });
}
