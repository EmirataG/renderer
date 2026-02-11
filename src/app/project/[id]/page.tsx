import { ClientOnly } from './client';

// Prevent static prerendering -- client.tsx imports Firebase client SDK
// which requires runtime env vars (same pattern as login/page.tsx)
export const dynamic = 'force-dynamic';

export default async function EditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ClientOnly projectId={id} />;
}
