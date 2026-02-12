import { cookies } from 'next/headers';
import { adminAuth } from '@/lib/firebase-admin';
import { getDb, FieldValue } from '@/lib/firestore';
import { getBucket, uploadFile } from '@/lib/storage';
import crypto from 'crypto';

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

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: sourceId } = await params;
  const db = getDb();

  // Read source project
  const sourceDoc = await db
    .collection('users')
    .doc(user.uid)
    .collection('projects')
    .doc(sourceId)
    .get();

  if (!sourceDoc.exists) {
    return Response.json({ error: 'Project not found' }, { status: 404 });
  }

  const sourceData = sourceDoc.data()!;
  const newId = crypto.randomUUID();

  // Copy Storage files for each file type prefix
  const fileTypes = ['score', 'audio', 'background'];
  const newUrls: Record<string, string> = {};

  for (const fileType of fileTypes) {
    const sourceUrlField = `${fileType}Url`;
    if (!sourceData[sourceUrlField]) continue;

    const prefix = `users/${user.uid}/projects/${sourceId}/${fileType}`;
    const [files] = await getBucket().getFiles({ prefix });

    for (const file of files) {
      const fileName = file.name.split('/').pop()!;
      const newPath = `users/${user.uid}/projects/${newId}/${fileType}/${fileName}`;
      const [contents] = await file.download();
      const contentType =
        file.metadata.contentType || 'application/octet-stream';
      await uploadFile(newPath, contents, contentType);
      // Store the new storage path
      newUrls[sourceUrlField] = newPath;
    }
  }

  // Build the new project document
  const now = new Date().toISOString();
  const newName = `Copy of ${sourceData.name}`;

  // Copy all fields except id, createdAt, updatedAt, and file URLs (which we remap)
  const { createdAt, updatedAt, name, scoreUrl, audioUrl, backgroundUrl, ...rest } = sourceData;

  const newProjectData: Record<string, unknown> = {
    ...rest,
    name: newName,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };

  // Set file URL fields only if the source had them
  if (sourceData.scoreUrl) {
    newProjectData.scoreUrl = newUrls.scoreUrl || sourceData.scoreUrl;
  }
  if (sourceData.audioUrl) {
    newProjectData.audioUrl = newUrls.audioUrl || sourceData.audioUrl;
  }
  if (sourceData.backgroundUrl) {
    newProjectData.backgroundUrl = newUrls.backgroundUrl || sourceData.backgroundUrl;
  }

  await db
    .collection('users')
    .doc(user.uid)
    .collection('projects')
    .doc(newId)
    .set(newProjectData);

  // Return the project object with resolved timestamps
  return Response.json(
    {
      project: {
        id: newId,
        ...rest,
        name: newName,
        ...(sourceData.scoreUrl ? { scoreUrl: newUrls.scoreUrl || sourceData.scoreUrl } : {}),
        ...(sourceData.audioUrl ? { audioUrl: newUrls.audioUrl || sourceData.audioUrl } : {}),
        ...(sourceData.backgroundUrl ? { backgroundUrl: newUrls.backgroundUrl || sourceData.backgroundUrl } : {}),
        createdAt: now,
        updatedAt: now,
      },
    },
    { status: 201 }
  );
}
