import { Readable } from 'stream';
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

  // Find the audio file in Storage by prefix
  const [files] = await getBucket().getFiles({
    prefix: `users/${user.uid}/projects/${id}/audio`,
  });
  if (files.length === 0) return new Response('Audio not found', { status: 404 });

  const file = files[0];
  const [metadata] = await file.getMetadata();
  const contentType = metadata.contentType || 'audio/mpeg';
  const fileSize = Number(metadata.size);

  // Handle range requests for audio seeking
  const rangeHeader = request.headers.get('range');
  if (rangeHeader) {
    const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
    if (match) {
      const start = parseInt(match[1], 10);
      const end = match[2] ? parseInt(match[2], 10) : fileSize - 1;
      const chunkSize = end - start + 1;

      try {
        const nodeStream = file.createReadStream({ start, end });
        const webStream = Readable.toWeb(nodeStream) as ReadableStream;

        return new Response(webStream, {
          status: 206,
          headers: {
            'Content-Type': contentType,
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Content-Length': String(chunkSize),
            'Accept-Ranges': 'bytes',
          },
        });
      } catch {
        return new Response('Stream error', { status: 500 });
      }
    }
  }

  // Full request — stream entire file without loading into memory
  try {
    const nodeStream = file.createReadStream();
    const webStream = Readable.toWeb(nodeStream) as ReadableStream;

    return new Response(webStream, {
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(fileSize),
        'Accept-Ranges': 'bytes',
      },
    });
  } catch {
    return new Response('Stream error', { status: 500 });
  }
}
