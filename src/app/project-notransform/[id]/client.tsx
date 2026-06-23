'use client';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';

const App = dynamic(() => import('../../../App'), { ssr: false });

// TEST ROUTE: identical to /project/[id] but with `noZoom` so the preview is
// NOT wrapped in react-zoom-pan-pinch — used to verify the reveal mask works
// without the GPU-composited TransformWrapper.
export function ClientOnly({ projectId }: { projectId: string }) {
  const router = useRouter();

  return (
    <App projectId={projectId} noZoom onNavigateDashboard={() => router.push('/')} />
  );
}
