export const dynamic = 'force-dynamic';

import { GoogleSignInButton } from './client';

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-950">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-white mb-8">Manuscript</h1>
        <GoogleSignInButton />
      </div>
    </div>
  );
}
