import { cookies } from 'next/headers';
import { adminAuth } from '@/lib/firebase-admin';
import { getDb, FieldValue } from '@/lib/firestore';

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

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getDb();
  const snapshot = await db
    .collection('projects')
    .where('userId', '==', user.uid)
    .orderBy('updatedAt', 'desc')
    .get();

  const projects = snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
    createdAt: doc.data().createdAt?.toDate().toISOString(),
    updatedAt: doc.data().updatedAt?.toDate().toISOString(),
  }));

  return Response.json({ projects });
}

export async function POST(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { name, viewMode } = await request.json();

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return Response.json(
      { error: 'Project name is required' },
      { status: 400 }
    );
  }

  const db = getDb();
  const projectId = crypto.randomUUID();

  await db.collection('projects').doc(projectId).set({
    userId: user.uid,
    name: name.trim(),
    viewMode: viewMode || 'page',
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return Response.json({ id: projectId }, { status: 201 });
}
