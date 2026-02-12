'use client';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';

const App = dynamic(() => import('../../../App'), { ssr: false });

export function ClientOnly({ projectId }: { projectId: string }) {
  const router = useRouter();

  return (
    <App projectId={projectId} onNavigateDashboard={() => router.push('/')} />
  );
}
