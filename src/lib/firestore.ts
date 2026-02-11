import 'server-only';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { adminAuth } from '@/lib/firebase-admin';

// Lazy singleton -- getFirestore() uses the default app initialized in firebase-admin.ts
let _db: ReturnType<typeof getFirestore> | null = null;

export function getDb() {
  if (!_db) {
    // Access adminAuth to ensure the Firebase Admin app is initialized
    // before calling getFirestore() which requires a default app
    void adminAuth;
    _db = getFirestore();
  }
  return _db;
}

export { FieldValue };
