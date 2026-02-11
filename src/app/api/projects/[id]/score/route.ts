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

  // Find the score file in Storage by prefix
  const [files] = await getBucket().getFiles({
    prefix: `users/${user.uid}/projects/${id}/score`,
  });
  if (files.length === 0) return new Response('Score not found', { status: 404 });

  const [contents] = await files[0].download();
  return new Response(new Uint8Array(contents), {
    headers: { 'Content-Type': 'application/xml' },
  });
}
