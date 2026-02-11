'use client';

import dynamic from 'next/dynamic';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase-client';
import { useRouter } from 'next/navigation';

const App = dynamic(() => import('../../App'), { ssr: false });

export function ClientOnly() {
  const router = useRouter();

  async function handleSignOut() {
    await fetch('/api/auth/session', { method: 'DELETE' });
    await signOut(auth);
    router.push('/login');
  }

  return (
    <>
      <button
        onClick={handleSignOut}
        className="fixed top-3 right-3 z-50 px-3 py-1.5 text-xs bg-neutral-800 text-neutral-300 rounded hover:bg-neutral-700 transition-colors"
      >
        Sign out
      </button>
      <App />
    </>
  );
}
