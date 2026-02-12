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
  _request: Request,
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

  // Find background file in Storage by prefix
  const [files] = await getBucket().getFiles({
    prefix: `users/${user.uid}/projects/${id}/background`,
  });
  if (files.length === 0) return new Response('No background', { status: 404 });

  const file = files[0];
  const [metadata] = await file.getMetadata();
  const [contents] = await file.download();
  return new Response(new Uint8Array(contents), {
    headers: { 'Content-Type': metadata.contentType || 'image/jpeg' },
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

  // Delete existing background files (any extension)
  const [existingFiles] = await getBucket().getFiles({ prefix: `${basePath}/background` });
  for (const f of existingFiles) await f.delete();

  // Upload new background
  const buffer = Buffer.from(await bgFile.arrayBuffer());
  const backgroundUrl = await uploadFile(
    `${basePath}/background${ext}`,
    buffer,
    bgFile.type || 'image/jpeg'
  );

  // Update Firestore document
  await docRef.update({
    backgroundUrl,
    backgroundFileName: bgFile.name,
    updatedAt: FieldValue.serverTimestamp(),
  });

  return Response.json({ backgroundUrl: `/api/projects/${id}/background` });
}
