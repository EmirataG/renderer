import { ClientOnly } from './client';

// Prevent static prerendering -- client.tsx imports Firebase client SDK
// which requires runtime env vars (same pattern as login/page.tsx)
export const dynamic = 'force-dynamic';

export default function Page() {
  return <ClientOnly />;
}
