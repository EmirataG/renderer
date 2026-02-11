# Phase 23: Firebase Authentication - Research

**Researched:** 2026-02-11
**Domain:** Firebase Auth with Google sign-in, httpOnly session cookies, route protection in Next.js 16 App Router
**Confidence:** HIGH

## Summary

Phase 23 adds Firebase Authentication to the Next.js 16 app built in Phase 22. The requirements are focused and well-scoped: Google sign-in (AUTH-01), httpOnly session cookie persistence (AUTH-02), route protection with redirect (AUTH-03), and sign-out (AUTH-04). No Firestore, no Storage, no project persistence -- just auth.

The auth flow uses two Firebase SDKs: the client SDK (`firebase`) for `signInWithPopup` in the browser, and the server SDK (`firebase-admin`) for creating and verifying httpOnly session cookies. The client signs in via Google popup, obtains an ID token, POSTs it to a Next.js Route Handler, which uses `firebase-admin.auth().createSessionCookie()` to mint an httpOnly session cookie (up to 14 days). The `proxy.ts` file (Next.js 16's replacement for middleware.ts) checks for the session cookie on every request to protected routes and redirects unauthenticated users to `/login`.

There are two distinct approaches in the Firebase ecosystem for server-side auth: (1) `initializeServerApp` with ID token in a non-httpOnly cookie (the Firebase Codelab pattern), and (2) `firebase-admin` with `createSessionCookie` for httpOnly session cookies. Since AUTH-02 explicitly requires httpOnly session cookies, the Admin SDK approach is the correct choice. The `initializeServerApp` approach stores the raw ID token in a cookie accessible to JavaScript, which does not meet the httpOnly requirement.

The current app has a catch-all `[[...slug]]` route serving the editor and a `/render` route for the export service. This phase must restructure routes: create a `/login` page, protect the editor route, and keep `/render` unprotected (the export service needs it without auth). The catch-all route remains for the editor but gains auth protection via proxy.ts.

**Primary recommendation:** Use `firebase-admin` with `createSessionCookie` for httpOnly session cookies. Create a `/login` route with Google sign-in, a `/api/auth/session` Route Handler for cookie management, and `proxy.ts` for route protection. Keep `/render` unprotected for the export service.

## Standard Stack

### Core (Phase 23 Only)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| firebase | ^12.9.0 | Client SDK -- Google sign-in via `signInWithPopup` | Latest modular SDK. Tree-shakeable. Only `firebase/auth` subpath needed this phase. |
| firebase-admin | ^13.6.1 | Server SDK -- `createSessionCookie`, `verifySessionCookie` | Required for httpOnly session cookies. Runs server-side only (Route Handlers, proxy.ts). |
| server-only | ^0.0.1 | Import guard -- prevents `firebase-admin` from leaking into client bundle | npm package that causes build error if imported from client component. Zero runtime cost. |

### Retained (No Changes)

| Library | Version | Impact |
|---------|---------|--------|
| next | ^16.1.6 | Gains `proxy.ts`, Route Handlers, `cookies()` API |
| react | ^19.1.1 | No changes |
| zustand | ^5.0.10 | No changes |
| All other existing deps | Current | No changes |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| firebase-admin createSessionCookie | initializeServerApp with ID token cookie | ID token cookie is NOT httpOnly (accessible to JS). Expires every hour. Does not meet AUTH-02. |
| firebase-admin createSessionCookie | NextAuth.js / Auth.js | Adds unnecessary abstraction over Firebase. Requires adapter, provider config. More moving parts for no benefit when fully committed to Firebase. |
| Direct cookie checks in proxy.ts | Server Layout Guards (layout.tsx auth checks) | proxy.ts is faster (network layer, before rendering). Layout guards add latency. proxy.ts is the recommended Next.js 16 pattern for auth redirects. |
| signInWithPopup | signInWithRedirect | Popup works on desktop (this app's target). Redirect has mobile browser issues and more complex state management. |

**Installation:**
```bash
npm install firebase firebase-admin server-only
```

## Architecture Patterns

### Route Structure After Phase 23

```
src/
  app/
    layout.tsx                    # Root layout (RSC) - HTML shell, no auth logic
    login/
      page.tsx                    # Login page (RSC shell)
      client.tsx                  # 'use client' -- GoogleSignInButton
    api/
      auth/
        session/
          route.ts                # POST: create session cookie, DELETE: clear cookie
    [[...slug]]/
      page.tsx                    # Editor (protected by proxy.ts)
      client.tsx                  # Existing dynamic({ ssr: false }) App wrapper
    render/
      page.tsx                    # Export service route (UNPROTECTED)
      client.tsx                  # Existing RenderApp wrapper
  lib/
    firebase-client.ts            # NEW: Client SDK init (firebase/auth)
    firebase-admin.ts             # NEW: Admin SDK init (firebase-admin/auth)
proxy.ts                          # NEW: Auth guard at network layer
```

### Pattern 1: Firebase Client SDK Initialization (Singleton)

**What:** Initialize the Firebase client SDK once as a module singleton. Use `getApps()` guard for HMR safety.
**When:** Any client component that needs auth.

```typescript
// src/lib/firebase-client.ts
import { initializeApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET!,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID!,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
export const auth = getAuth(app);
```

**Source:** [Firebase Next.js Codelab](https://firebase.google.com/codelabs/firebase-nextjs), [Firebase Modular SDK Docs](https://firebase.google.com/docs/web/modular-upgrade)

### Pattern 2: Firebase Admin SDK Initialization (Server-Only Singleton)

**What:** Initialize the Admin SDK once on the server. Protected by `server-only` import.
**When:** Route Handlers and proxy.ts that verify or create session cookies.

```typescript
// src/lib/firebase-admin.ts
import 'server-only';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const app = getApps().length === 0
  ? initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_ADMIN_PROJECT_ID!,
        clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL!,
        privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY!.replace(/\\n/g, '\n'),
      }),
    })
  : getApps()[0];

export const adminAuth = getAuth(app);
```

**Source:** [Firebase Admin SDK Setup](https://firebase.google.com/docs/admin/setup), [server-only package](https://www.npmjs.com/package/server-only)

### Pattern 3: Session Cookie Flow (createSessionCookie)

**What:** Client signs in, gets ID token, POSTs to Route Handler, server creates httpOnly session cookie.
**When:** On sign-in and token refresh.

```
1. User clicks "Sign in with Google"
   -> signInWithPopup(auth, new GoogleAuthProvider())
   -> Firebase returns user + ID token

2. Client POSTs ID token to /api/auth/session
   -> Route Handler receives ID token
   -> adminAuth.createSessionCookie(idToken, { expiresIn })
   -> Set httpOnly cookie named "__session"
   -> Return 200

3. On every request, proxy.ts checks for "__session" cookie
   -> If missing on protected route -> redirect to /login
   -> If present -> allow through

4. On sign-out, client calls DELETE /api/auth/session
   -> Route Handler clears the "__session" cookie
   -> Client calls signOut(auth) locally
   -> Redirect to /login
```

**Source:** [Firebase Manage Session Cookies](https://firebase.google.com/docs/auth/admin/manage-cookies)

### Pattern 4: Route Handler for Session Management

**What:** A single Route Handler manages session creation (POST) and destruction (DELETE).

```typescript
// src/app/api/auth/session/route.ts
import { cookies } from 'next/headers';
import { adminAuth } from '@/lib/firebase-admin';

const SESSION_COOKIE_NAME = '__session';
const SESSION_EXPIRY_MS = 60 * 60 * 24 * 5 * 1000; // 5 days

export async function POST(request: Request) {
  const { idToken } = await request.json();

  try {
    const sessionCookie = await adminAuth.createSessionCookie(idToken, {
      expiresIn: SESSION_EXPIRY_MS,
    });

    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE_NAME, sessionCookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_EXPIRY_MS / 1000,
    });

    return Response.json({ status: 'success' });
  } catch (error) {
    return Response.json({ status: 'error' }, { status: 401 });
  }
}

export async function DELETE() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
  return Response.json({ status: 'success' });
}
```

**Source:** [Next.js cookies() API](https://nextjs.org/docs/app/api-reference/functions/cookies), [Firebase Manage Session Cookies](https://firebase.google.com/docs/auth/admin/manage-cookies)

### Pattern 5: proxy.ts for Route Protection

**What:** Network-layer auth guard. Runs on Node.js runtime before rendering. Checks for session cookie.
**When:** Every request to protected routes.

```typescript
// proxy.ts (project root or src/)
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PUBLIC_PATHS = ['/login', '/render', '/api/auth'];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths
  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Check for session cookie
  const session = request.cookies.get('__session');

  if (!session?.value) {
    // Redirect unauthenticated users to login
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Match everything except static files and Next.js internals
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
```

**Key detail:** proxy.ts does a lightweight cookie-existence check only. It does NOT verify the cookie's JWT signature (that would require async Admin SDK call on every request, adding latency). Full verification happens in Route Handlers or Server Components when needed.

**Source:** [Next.js proxy.ts File Convention](https://nextjs.org/docs/app/api-reference/file-conventions/proxy)

### Pattern 6: Google Sign-In Client Component

**What:** Client component with signInWithPopup + session cookie creation.

```typescript
// src/app/login/client.tsx
'use client';

import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { auth } from '@/lib/firebase-client';
import { useRouter } from 'next/navigation';

export function GoogleSignInButton() {
  const router = useRouter();

  const handleSignIn = async () => {
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const idToken = await result.user.getIdToken();

      // Create httpOnly session cookie
      const response = await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      });

      if (response.ok) {
        router.push('/');  // Redirect to editor/dashboard
      }
    } catch (error) {
      console.error('Sign-in failed:', error);
    }
  };

  return (
    <button onClick={handleSignIn}>
      Sign in with Google
    </button>
  );
}
```

**Source:** [Firebase Google Sign-In](https://firebase.google.com/docs/auth/web/google-signin)

### Anti-Patterns to Avoid

- **Importing firebase-admin in client components:** Admin SDK is 5.7MB+ and contains server-only code. Use `server-only` package to enforce boundary. NEVER import `firebase-admin` or `@/lib/firebase-admin` from any `'use client'` file.
- **Verifying session cookie in proxy.ts:** proxy.ts should do lightweight checks only (cookie exists?). Full JWT verification with `adminAuth.verifySessionCookie()` adds latency to every request. Do it only in Route Handlers or Server Components that actually need the user's claims.
- **Using initializeServerApp for httpOnly cookies:** `initializeServerApp` expects the raw ID token, which must be in a JS-accessible cookie. This contradicts the httpOnly requirement. Use `firebase-admin` + `createSessionCookie` instead.
- **Protecting the /render route:** The export service (Puppeteer) loads `/render` without auth. This route MUST remain unprotected.
- **Using signInWithRedirect instead of signInWithPopup:** Desktop app. Popup is simpler and avoids the redirect-chain issues documented in Firebase mobile auth bugs.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Session cookie creation | Manual JWT signing | `adminAuth.createSessionCookie()` | Firebase handles token verification, claim propagation, expiry, and revocation checking |
| Session cookie verification | Manual JWT parsing | `adminAuth.verifySessionCookie()` | Validates signature, expiry, revocation status |
| Route protection | Custom auth checking in every page | `proxy.ts` with cookie check | Network-layer guard, runs before rendering, single location |
| Google OAuth flow | Custom OAuth2 implementation | `signInWithPopup(auth, new GoogleAuthProvider())` | Firebase handles the entire OAuth flow, token exchange, user creation |
| httpOnly cookie management | Manual Set-Cookie header building | `(await cookies()).set(name, value, { httpOnly: true })` | Next.js cookies() API handles encoding, security flags correctly |
| Admin SDK client bundle leak prevention | Import auditing | `import 'server-only'` at top of firebase-admin.ts | Build-time error if client component imports this file |

## Common Pitfalls

### Pitfall 1: Firebase Admin SDK Leaks into Client Bundle

**What goes wrong:** `firebase-admin` is imported (directly or transitively) from a `'use client'` component. The 5.7MB admin SDK and service account credentials end up in the client JavaScript.
**Why it happens:** Easy to accidentally import a shared utility that uses the admin SDK.
**How to avoid:** Add `import 'server-only'` as the first line in `firebase-admin.ts`. This causes a build error if any client component imports it. Keep client and admin SDKs in separate files: `firebase-client.ts` and `firebase-admin.ts`.
**Warning signs:** Bundle size spike, build warnings about large chunks, `process.env.FIREBASE_ADMIN_PRIVATE_KEY` is undefined in client code.

### Pitfall 2: Cookie Not Sent to Server (Missing Config)

**What goes wrong:** Session cookie exists in browser but proxy.ts/Route Handlers don't see it.
**Why it happens:** Cookie set with wrong `path`, wrong `sameSite`, or `secure: true` in development (localhost is http, not https).
**How to avoid:** Set `path: '/'`, `sameSite: 'lax'`, and `secure: process.env.NODE_ENV === 'production'` (false in dev, true in prod).
**Warning signs:** User is authenticated but keeps getting redirected to login.

### Pitfall 3: Firebase Auth State Loading Flash

**What goes wrong:** `onAuthStateChanged` fires first with `null` (always), then with the user object. If the login page checks client-side auth state, the user briefly sees the login page before being redirected.
**Why it happens:** Firebase Auth client SDK loads credentials from IndexedDB asynchronously.
**How to avoid:** The login page should NOT check client-side auth state for redirection. proxy.ts handles the redirect at the network layer by checking the session cookie, which is available immediately. The login page only needs client-side auth for the sign-in button.
**Warning signs:** Authenticated user sees login page flash before redirect.

### Pitfall 4: ID Token Expiry Before Session Cookie Creation

**What goes wrong:** User signs in, but the POST to `/api/auth/session` is delayed (slow network). By the time it arrives, the ID token is stale (though unlikely -- ID tokens are valid for 1 hour). More practically, `createSessionCookie` requires the ID token to be recent (within the last 5 minutes by default).
**Why it happens:** `createSessionCookie` validates that the ID token was issued recently to prevent replay attacks.
**How to avoid:** Call `user.getIdToken()` immediately before POSTing. Don't cache or delay. The sign-in flow should be: popup -> getIdToken -> POST -> set cookie, all in one synchronous user action.
**Warning signs:** `auth/session-cookie-creation-failed` error from createSessionCookie.

### Pitfall 5: Cookie Named Wrong for Firebase Hosting

**What goes wrong:** If the app is ever deployed to Firebase Hosting, it strips all cookies except `__session`.
**Why it happens:** Firebase Hosting CDN only passes through the `__session` cookie.
**How to avoid:** Always name the session cookie `__session`. This is compatible with all hosting platforms and future-proofs for Firebase Hosting.
**Warning signs:** Cookie disappears in production but works in development.

### Pitfall 6: Private Key Newlines in Environment Variable

**What goes wrong:** Firebase service account private key contains literal `\n` characters. When stored as an environment variable, the `\n` is stored as two characters (backslash + n) instead of actual newlines.
**Why it happens:** Environment variable parsers treat the value as a literal string.
**How to avoid:** In the Admin SDK init, use `.replace(/\\n/g, '\n')` on the private key value. Alternatively, base64-encode the entire service account JSON and decode it at runtime.
**Warning signs:** `Error: error:1E08010C:DECODER routines::unsupported` or `Invalid PEM` errors from firebase-admin.

## Code Examples

### Complete Auth Flow

#### 1. Environment Variables (.env.local)

```bash
# Client-side (NEXT_PUBLIC_ prefix)
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSy...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
NEXT_PUBLIC_FIREBASE_APP_ID=1:123456789:web:abc123

# Server-only (no NEXT_PUBLIC_ prefix)
FIREBASE_ADMIN_PROJECT_ID=your-project
FIREBASE_ADMIN_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com
FIREBASE_ADMIN_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEv...\n-----END PRIVATE KEY-----\n"
```

#### 2. Login Page (Server Component Shell)

```typescript
// src/app/login/page.tsx
import { GoogleSignInButton } from './client';

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-bold mb-8">Manuscript</h1>
        <GoogleSignInButton />
      </div>
    </div>
  );
}
```

#### 3. Sign-Out Flow

```typescript
// In any client component with sign-out button:
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase-client';
import { useRouter } from 'next/navigation';

async function handleSignOut() {
  // Clear server-side session cookie
  await fetch('/api/auth/session', { method: 'DELETE' });
  // Clear client-side Firebase auth state
  await signOut(auth);
  // Redirect to login
  router.push('/login');
}
```

#### 4. Verifying Session in Server Component (for future phases)

```typescript
// Example: reading user info server-side (useful in Phase 24+)
import { cookies } from 'next/headers';
import { adminAuth } from '@/lib/firebase-admin';

export async function getCurrentUser() {
  const cookieStore = await cookies();
  const session = cookieStore.get('__session')?.value;
  if (!session) return null;

  try {
    const decoded = await adminAuth.verifySessionCookie(session, true);
    return decoded;
  } catch {
    return null;
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| middleware.ts | proxy.ts | Next.js 16 (Oct 2025) | Rename + clarified purpose. Same API. Node.js runtime only. |
| firebase v9 compat imports | firebase v12 modular imports | Ongoing | Tree-shakeable. `import { getAuth } from 'firebase/auth'` not `firebase.auth()` |
| firebase-admin v11 | firebase-admin v13.6.1 | 2025-2026 | Modular imports: `import { getAuth } from 'firebase-admin/auth'` |
| initializeServerApp (Firebase Codelab) | Still valid but NOT for httpOnly | May 2024 | Uses raw ID token in cookie. Fine for read-only SSR, not for httpOnly session requirement. |
| Custom JWT verification | adminAuth.verifySessionCookie | Stable since 2018 | Firebase-managed validation with revocation checking |

**Deprecated/outdated:**
- `firebase.auth()` (compat mode): Use modular `getAuth(app)` instead
- `middleware.ts`: Renamed to `proxy.ts` in Next.js 16. Codemod available: `npx @next/codemod@canary middleware-to-proxy .`

## Open Questions

1. **Firebase Project Setup**
   - What we know: The app needs a Firebase project with Auth (Google provider) enabled.
   - What's unclear: Does the user already have a Firebase project? Do they have a service account key?
   - Recommendation: The plan should include a manual step for the user to create the Firebase project, enable Google sign-in, and download the service account key. This cannot be automated.

2. **Post-login Redirect Destination**
   - What we know: After sign-in, the user should see the editor/dashboard. Currently there's only the catch-all editor route.
   - What's unclear: Should sign-in redirect to `/` (the editor, current behavior) or to `/dashboard` (Phase 24's route)?
   - Recommendation: Redirect to `/` for now. Phase 24 will add the dashboard route and update the redirect. Keep it simple.

3. **Session Cookie Expiry Duration**
   - What we know: Firebase allows 5 minutes to 14 days for session cookies.
   - What's unclear: How long should sessions last? Frequent re-authentication is annoying; long sessions are less secure.
   - Recommendation: 5 days (the Firebase docs default example). This balances convenience and security for a creative tool where users work in extended sessions.

4. **Token Refresh Strategy**
   - What we know: Session cookies expire after the set duration. Firebase ID tokens expire hourly but are auto-refreshed by the client SDK. Session cookies are NOT auto-refreshed.
   - What's unclear: Should the session cookie be refreshed before expiry?
   - Recommendation: For Phase 23 (MVP auth), do NOT implement token refresh. 5-day session cookies are long enough. If the session expires, the user signs in again. Token refresh can be added later if needed.

## Sources

### Primary (HIGH confidence)
- [Next.js proxy.ts File Convention](https://nextjs.org/docs/app/api-reference/file-conventions/proxy) -- Complete API for proxy.ts, matcher patterns, cookie access, runtime details. Doc version 16.1.6.
- [Next.js cookies() API](https://nextjs.org/docs/app/api-reference/functions/cookies) -- set/get/delete cookies with httpOnly, secure, sameSite options. Doc version 16.1.6.
- [Firebase Manage Session Cookies](https://firebase.google.com/docs/auth/admin/manage-cookies) -- createSessionCookie, verifySessionCookie, 14-day max, httpOnly pattern.
- [Firebase Google Sign-In (Web)](https://firebase.google.com/docs/auth/web/google-signin) -- signInWithPopup, GoogleAuthProvider.
- [Firebase Admin SDK Setup](https://firebase.google.com/docs/admin/setup) -- initializeApp with cert credentials.
- [Firebase Next.js Codelab](https://firebase.google.com/codelabs/firebase-nextjs) -- End-to-end auth integration pattern (initializeServerApp variant). Updated February 2026.
- [FirebaseServerApp SSR Blog Post](https://firebase.blog/posts/2024/05/firebase-serverapp-ssr/) -- initializeServerApp API details and limitations.

### Secondary (MEDIUM confidence)
- [Auth0: Next.js 16 Auth Changes](https://auth0.com/blog/whats-new-nextjs-16/) -- proxy.ts migration, auth guard patterns.
- [Stackademic: Next.js 14 Server-side Auth with Firebase Admin](https://stackademic.com/blog/next-js-14-server-side-authentication-using-cookies-with-firebase-admin-sdk) -- createSessionCookie + cookies() pattern (pre-16 but same API).
- [Colin Hacks: Authenticated SSR with Next.js and Firebase](https://colinhacks.com/essays/nextjs-firebase-authentication) -- Session cookie architecture.
- [Firebase JS SDK Issue #8403](https://github.com/firebase/firebase-js-sdk/issues/8403) -- Confirms createSessionCookie tokens are NOT compatible with initializeServerApp. Critical for choosing the right approach.
- [npm firebase v12.9.0](https://www.npmjs.com/package/firebase) -- Current version verified Feb 2026.
- [npm firebase-admin v13.6.1](https://www.npmjs.com/package/firebase-admin) -- Current version verified Feb 2026.

### Tertiary (LOW confidence)
- [MakerKit: Firebase Auth Flow](https://makerkit.dev/docs/next-fire/auth-flow) -- Community implementation reference.
- [Ben Ilegbodu: Firebase Admin Init with Env Vars](https://www.benmvp.com/blog/initializing-firebase-admin-node-sdk-env-vars/) -- Private key newline handling.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- firebase v12.9.0 and firebase-admin v13.6.1 verified on npm. Versions confirmed current.
- Architecture: HIGH -- Session cookie pattern is documented in official Firebase docs and the Firebase Next.js Codelab. proxy.ts API verified from official Next.js 16.1.6 docs.
- Pitfalls: HIGH -- Admin SDK leak prevention verified via `server-only` package. Cookie configuration options verified from Next.js cookies() docs. Firebase Hosting cookie stripping documented officially.
- Auth flow: HIGH -- createSessionCookie is a stable Firebase API (since 2018). Incompatibility with initializeServerApp confirmed via GitHub issue #8403.

**Research date:** 2026-02-11
**Valid until:** 2026-03-11 (stable -- Firebase Auth API is mature, Next.js 16 is current)
