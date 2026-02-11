'use client';

import dynamic from 'next/dynamic';

const RenderApp = dynamic(() => import('../../RenderApp'), { ssr: false });

export function RenderClient() {
  return <RenderApp />;
}
