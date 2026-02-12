import 'server-only';
import { getStorage } from 'firebase-admin/storage';
import { adminAuth } from '@/lib/firebase-admin';

const STORAGE_BUCKET = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET!;

// Lazy singleton -- same pattern as firestore.ts getDb()
let _bucket: ReturnType<ReturnType<typeof getStorage>['bucket']> | null = null;

export function getBucket() {
  if (!_bucket) {
    // Access a property on adminAuth Proxy to trigger getAdminAuth() → initializeApp()
    void adminAuth.app;
    _bucket = getStorage().bucket(STORAGE_BUCKET);
  }
  return _bucket;
}

/**
 * Upload a file buffer to Firebase Storage and return the storage path.
 */
export async function uploadFile(
  storagePath: string,
  buffer: Buffer,
  contentType: string
): Promise<string> {
  const fileRef = getBucket().file(storagePath);
  await fileRef.save(buffer, { metadata: { contentType } });
  return storagePath;
}

/**
 * Delete all files under a project prefix in Storage.
 */
export async function deleteProjectFiles(uid: string, projectId: string): Promise<void> {
  const prefix = `users/${uid}/projects/${projectId}/`;
  await getBucket().deleteFiles({ prefix });
}
