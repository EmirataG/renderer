import { cookies } from 'next/headers';
import { adminAuth } from '@/lib/firebase-admin';
import { getDb, FieldValue } from '@/lib/firestore';
import { uploadFile } from '@/lib/storage';

// Allowed extensions (server-side validation, duplicated from fileValidation.ts to avoid client imports)
const SCORE_EXTENSIONS = ['.xml', '.musicxml', '.mxl', '.mei'];
const AUDIO_EXTENSIONS = ['.mp3', '.wav'];

// Size limits in bytes
const SCORE_SIZE_LIMIT = 10 * 1024 * 1024; // 10MB
const AUDIO_SIZE_LIMIT = 50 * 1024 * 1024; // 50MB

function getExtension(filename: string): string {
  const lastDot = filename.lastIndexOf('.');
  if (lastDot === -1) return '';
  return filename.slice(lastDot).toLowerCase();
}

async function getAuthenticatedUser() {
  const cookieStore = await cookies();
  const session = cookieStore.get('__session')?.value;
  if (!session) return null;
  try {
    return await adminAuth.verifySessionCookie(session, true);
  } catch (error) {
    console.error('Session verification failed:', error);
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
    .collection('users')
    .doc(user.uid)
    .collection('projects')
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

  const formData = await request.formData();

  const name = formData.get('name');
  const scoreFile = formData.get('score') as File | null;
  const audioFile = formData.get('audio') as File | null;

  // Validate name
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return Response.json(
      { error: 'Project name is required' },
      { status: 400 }
    );
  }

  // Validate score file
  if (!scoreFile || !(scoreFile instanceof File)) {
    return Response.json(
      { error: 'Score file is required' },
      { status: 400 }
    );
  }

  const scoreExt = getExtension(scoreFile.name);
  if (!SCORE_EXTENSIONS.includes(scoreExt)) {
    return Response.json(
      { error: `Invalid score file type. Accepted: ${SCORE_EXTENSIONS.join(', ')}` },
      { status: 400 }
    );
  }

  if (scoreFile.size > SCORE_SIZE_LIMIT) {
    return Response.json(
      { error: 'Score file exceeds 10MB limit' },
      { status: 400 }
    );
  }

  // Validate audio file
  if (!audioFile || !(audioFile instanceof File)) {
    return Response.json(
      { error: 'Audio file is required' },
      { status: 400 }
    );
  }

  const audioExt = getExtension(audioFile.name);
  if (!AUDIO_EXTENSIONS.includes(audioExt)) {
    return Response.json(
      { error: `Invalid audio file type. Accepted: ${AUDIO_EXTENSIONS.join(', ')}` },
      { status: 400 }
    );
  }

  if (audioFile.size > AUDIO_SIZE_LIMIT) {
    return Response.json(
      { error: 'Audio file exceeds 50MB limit' },
      { status: 400 }
    );
  }

  // Generate project ID and storage paths
  const projectId = crypto.randomUUID();
  const scorePath = `users/${user.uid}/projects/${projectId}/score${scoreExt}`;
  const audioPath = `users/${user.uid}/projects/${projectId}/audio${audioExt}`;

  // Upload files to Firebase Storage
  const scoreBuffer = Buffer.from(await scoreFile.arrayBuffer());
  const audioBuffer = Buffer.from(await audioFile.arrayBuffer());

  const [scoreUrl, audioUrl] = await Promise.all([
    uploadFile(scorePath, scoreBuffer, scoreFile.type || 'application/octet-stream'),
    uploadFile(audioPath, audioBuffer, audioFile.type || 'application/octet-stream'),
  ]);

  // Create Firestore document
  const db = getDb();
  await db
    .collection('users')
    .doc(user.uid)
    .collection('projects')
    .doc(projectId)
    .set({
      name: name.trim(),
      viewMode: 'page',
      scoreUrl,
      scoreFileName: scoreFile.name,
      audioUrl,
      audioFileName: audioFile.name,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

  return Response.json({ id: projectId }, { status: 201 });
}
