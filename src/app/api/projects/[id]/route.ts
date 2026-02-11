import { cookies } from 'next/headers';
import { adminAuth } from '@/lib/firebase-admin';
import { getDb } from '@/lib/firestore';

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

  await docRef.delete();

  return Response.json({ status: 'deleted' });
}
