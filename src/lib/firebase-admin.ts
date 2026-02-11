import 'server-only';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';

let _adminAuth: Auth | null = null;

function getAdminAuth(): Auth {
  if (_adminAuth) return _adminAuth;

  const existingApps = getApps();
  let app;

  if (existingApps.length > 0) {
    app = existingApps[0];
  } else {
    const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY;

    if (!projectId || !clientEmail || !privateKey) {
      throw new Error(
        'Missing Firebase Admin env vars. Set FIREBASE_ADMIN_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL, and FIREBASE_ADMIN_PRIVATE_KEY in .env.local'
      );
    }

    app = initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey: privateKey.replace(/\\n/g, '\n'),
      }),
    });
  }

  _adminAuth = getAuth(app);
  return _adminAuth;
}

export const adminAuth = new Proxy({} as Auth, {
  get(_, prop) {
    return (getAdminAuth() as any)[prop];
  },
});
