import 'server-only';
import { getStorage, getDownloadURL } from 'firebase-admin/storage';
import { adminAuth } from '@/lib/firebase-admin';

// Trigger admin app initialization via proxy access (same pattern as firestore.ts)
void adminAuth;

const STORAGE_BUCKET = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET!;
const bucket = getStorage().bucket(STORAGE_BUCKET);

/**
 * Upload a file buffer to Firebase Storage and return the permanent download URL.
 */
export async function uploadFile(
  storagePath: string,
  buffer: Buffer,
  contentType: string
): Promise<string> {
  const fileRef = bucket.file(storagePath);
  await fileRef.save(buffer, { metadata: { contentType } });
  return await getDownloadURL(fileRef);
}

/**
 * Delete all files under a project prefix in Storage.
 */
export async function deleteProjectFiles(uid: string, projectId: string): Promise<void> {
  const prefix = `users/${uid}/projects/${projectId}/`;
  await bucket.deleteFiles({ prefix });
}
