import { cookies } from 'next/headers';
import { adminAuth } from '@/lib/firebase-admin';
import { getDb, FieldValue } from '@/lib/firestore';
import { deleteProjectFiles } from '@/lib/storage';

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

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthenticatedUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const db = getDb();
  const doc = await db
    .collection('users').doc(user.uid)
    .collection('projects').doc(id)
    .get();

  if (!doc.exists) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  const data = doc.data()!;
  return Response.json({
    project: {
      id: doc.id,
      ...data,
      createdAt: data.createdAt?.toDate().toISOString(),
      updatedAt: data.updatedAt?.toDate().toISOString(),
    },
  });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const db = getDb();
  const docRef = db
    .collection('users')
    .doc(user.uid)
    .collection('projects')
    .doc(id);
  const doc = await docRef.get();

  if (!doc.exists) {
    return Response.json({ error: 'Project not found' }, { status: 404 });
  }

  // Delete all files in Firebase Storage before removing the Firestore document
  await deleteProjectFiles(user.uid, id);
  await docRef.delete();

  return Response.json({ status: 'deleted' });
}

const ALLOWED_SETTINGS = [
  'viewMode', 'scoreColor', 'scoreScale', 'musicFont', 'scoreBorder', 'hideLabels',
  'scoreRegion', 'activeNoteheadColor', 'activeNoteheadScale',
  'activeNoteheadEntryMs', 'activeNoteheadHoldMs', 'activeNoteheadExitMs',
  'activeNoteheadUseNoteDuration',
  'colorFullNote', 'fps', 'scoreShadowDistance', 'hideUnplayedNotes', 'smoothReveal',
];

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthenticatedUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const body = await request.json();
  const { settings, anchors, name } = body;

  const db = getDb();
  const docRef = db
    .collection('users')
    .doc(user.uid)
    .collection('projects')
    .doc(id);

  // Build update payload -- flatten settings into top-level fields
  const updateData: Record<string, unknown> = {
    updatedAt: FieldValue.serverTimestamp(),
  };

  if (settings && typeof settings === 'object') {
    for (const key of ALLOWED_SETTINGS) {
      if (key in settings) {
        updateData[key] = settings[key];
      }
    }
  }

  if (anchors !== undefined && typeof anchors === 'object') {
    updateData.anchors = anchors;
  }

  if (typeof name === 'string' && name.trim()) {
    updateData.name = name.trim();
  }

  try {
    await docRef.update(updateData);
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes('NOT_FOUND')) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }
    throw err;
  }

  return Response.json({ status: 'saved' });
}
