import { cookies } from 'next/headers';
import { adminAuth } from '@/lib/firebase-admin';
import { getDb } from '@/lib/firestore';
import { Dashboard } from '@/components/Dashboard';
import { ToastProvider } from '@/components/Toast';
import type { Project } from '@/types/project';

// Prevent static prerendering -- dashboard requires runtime auth check
export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  let projects: Project[] = [];

  try {
    const cookieStore = await cookies();
    const session = cookieStore.get('__session')?.value;

    if (session) {
      const decoded = await adminAuth.verifySessionCookie(session, true);
      const db = getDb();
      const snapshot = await db
        .collection('users')
        .doc(decoded.uid)
        .collection('projects')
        .orderBy('updatedAt', 'desc')
        .get();

      projects = snapshot.docs.map((doc) => ({
        id: doc.id,
        name: doc.data().name,
        viewMode: doc.data().viewMode || 'page',
        createdAt: doc.data().createdAt?.toDate().toISOString() ?? new Date().toISOString(),
        updatedAt: doc.data().updatedAt?.toDate().toISOString() ?? new Date().toISOString(),
        backgroundUrl: doc.data().backgroundUrl || undefined,
      }));
    }
  } catch (error) {
    console.error('Dashboard fetch failed:', error);
    projects = [];
  }

  return (
    <ToastProvider>
      <Dashboard initialProjects={projects} />
    </ToastProvider>
  );
}
