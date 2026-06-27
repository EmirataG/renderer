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
  // `background` = the displayed/cropped image (required).
  // `original`   = the uncropped source (optional), retained so the placement
  //               crop can be redone later without re-selecting the file.
  const bgFile = formData.get('background') as File | null;
  const originalFile = formData.get('original') as File | null;
  if (!bgFile) {
    return Response.json({ error: 'No background file provided' }, { status: 400 });
  }

  const validateImage = (file: File): string | null => {
    const e = getExtension(file.name);
    if (!ALLOWED_IMAGE_EXTENSIONS.includes(e)) {
      return `Invalid image type. Allowed: ${ALLOWED_IMAGE_EXTENSIONS.join(', ')}`;
    }
    if (file.size > MAX_IMAGE_SIZE) return 'Image too large. Maximum 20MB.';
    return null;
  };

  const bgErr = validateImage(bgFile);
  if (bgErr) return Response.json({ error: bgErr }, { status: 400 });
  if (originalFile) {
    const oErr = validateImage(originalFile);
    if (oErr) return Response.json({ error: oErr }, { status: 400 });
  }

  const ext = getExtension(bgFile.name);
  const basePath = `users/${user.uid}/projects/${id}`;

  // Delete the previous cropped image and upload the new one. The "original"
  // is stored under a distinct prefix so this never clobbers it.
  const ops: Promise<unknown>[] = [
    getBucket().getFiles({ prefix: `${basePath}/background` })
      .then(([files]) => Promise.all(files.map(f => f.delete()))),
    bgFile.arrayBuffer()
      .then(ab => uploadFile(`${basePath}/background${ext}`, Buffer.from(ab), bgFile.type || 'image/jpeg')),
  ];
  if (originalFile) {
    const oext = getExtension(originalFile.name);
    ops.push(
      getBucket().getFiles({ prefix: `${basePath}/original` })
        .then(([files]) => Promise.all(files.map(f => f.delete()))),
      originalFile.arrayBuffer()
        .then(ab => uploadFile(`${basePath}/original${oext}`, Buffer.from(ab), originalFile.type || 'image/jpeg')),
    );
  }

  const results = await Promise.all(ops);
  const backgroundUrl = results[1] as string;
  const originalBackgroundUrl = originalFile ? (results[3] as string) : undefined;

  // Update Firestore document
  await docRef.update({
    backgroundUrl,
    backgroundFileName: bgFile.name,
    ...(originalFile
      ? { originalBackgroundUrl, originalBackgroundFileName: originalFile.name }
      : {}),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return Response.json({
    backgroundUrl: `/api/projects/${id}/background`,
    ...(originalFile ? { originalBackgroundUrl: `/api/projects/${id}/background-original` } : {}),
  });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthenticatedUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  const db = getDb();
  const docRef = db.collection('users').doc(user.uid).collection('projects').doc(id);
  const doc = await docRef.get();
  if (!doc.exists) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  const basePath = `users/${user.uid}/projects/${id}`;

  // Remove the cropped + original stored files and clear the Firestore fields.
  await Promise.all(
    ['background', 'original'].map((prefix) =>
      getBucket()
        .getFiles({ prefix: `${basePath}/${prefix}` })
        .then(([files]) => Promise.all(files.map((f) => f.delete())))
        .catch(() => { /* tolerate already-missing files */ }),
    ),
  );

  await docRef.update({
    backgroundUrl: FieldValue.delete(),
    backgroundFileName: FieldValue.delete(),
    originalBackgroundUrl: FieldValue.delete(),
    originalBackgroundFileName: FieldValue.delete(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return Response.json({ status: 'deleted' });
}
