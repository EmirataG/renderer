import { ClientOnly } from './client';

// TEST ROUTE: same as /project/[id] but renders the editor WITHOUT
// react-zoom-pan-pinch (noZoom) to test the reveal mask without GPU compositing.
export const dynamic = 'force-dynamic';

export default async function EditorNoTransformPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ClientOnly projectId={id} />;
}
