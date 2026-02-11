# Technology Stack

**Project:** Manuscript Renderer -- Next.js Migration + Firebase Backend
**Researched:** 2026-02-11
**Confidence:** HIGH

## Recommended Stack

### Core Framework

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Next.js | ^16.1.x | Full-stack React framework | Current stable (released Oct 2025). Turbopack default bundler, React 19.2, App Router stable, proxy.ts for auth guards. Aligns with React 19 already in use. |
| React | 19.2.x | UI library | Ships with Next.js 16. Already on React 19 in existing app -- minimal migration pain. React Compiler 1.0 available (opt-in later). |
| TypeScript | ~5.9.x | Type safety | Already at 5.9.3 in existing project. Next.js 16 requires >=5.1. No change needed. |
| Tailwind CSS | 4.x | Styling | Already at 4.1.16. Next.js 16 scaffolds with Tailwind by default. PostCSS config carries over as-is. |

### Authentication and Backend

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| firebase | ^12.9.0 | Client SDK (Auth, Firestore, Storage) | Latest modular SDK. Tree-shakeable imports reduce bundle by up to 80% vs compat mode. Single package for all three Firebase services. |
| firebase-admin | ^13.6.1 | Server SDK (session verification, Firestore admin ops) | Required for server-side auth verification in Next.js server components, API routes, and proxy.ts. Runs only on the server. |

### State Management

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| zustand | ^5.0.10 | Client state | Already in use. Keeps local UI state (score settings, playback controls). No migration needed. Zustand works identically in Next.js client components. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| use-debounce | ^10.1.0 | Debounced auto-save to Firestore | Replace hand-rolled setTimeout debounce patterns. useDebouncedCallback for auto-save triggers after 1500ms of inactivity. |
| verovio | ^6.0.1 | MusicXML rendering (WASM) | Already in use. Client-only -- must use `'use client'` + next/dynamic with `ssr: false` in Next.js. |
| react-rnd | ^10.5.2 | Drag/resize UI | Already in use. No changes needed. |
| react-zoom-pan-pinch | ^3.7.0 | Pan/zoom for score preview | Already in use. No changes needed. |

### Infrastructure and Tooling

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Turbopack | (bundled with Next.js 16) | Dev and build bundler | Default in Next.js 16. 2-5x faster production builds, up to 10x faster Fast Refresh. Client-side WASM imports work (GitHub issue #84972 closed as "not a bug"). |
| Node.js | >=20.9.0 | Runtime | Next.js 16 minimum requirement. Current LTS is 22.x. |

## What NOT to Add

| Library | Why Not |
|---------|---------|
| NextAuth.js / Auth.js | Adds unnecessary abstraction when fully committed to Firebase. Firebase Auth direct with httpOnly session cookies is simpler, avoids adapter/provider indirection, and is the pattern recommended in Firebase's official Next.js codelab. |
| react-firebase-hooks | Last published 3+ years ago (v5.1.1). Stale and unmaintained. Write thin custom hooks around Firebase modular SDK instead -- 10-20 lines each. |
| reactfire | Google's own React-Firebase bindings. Adds Context Provider overhead and abstraction. For this app's scope (auth + a few Firestore collections + storage), direct SDK calls in custom hooks are simpler and more transparent. |
| next-firebase-auth | npm package designed for older Next.js patterns. Not updated for App Router or Next.js 16 proxy.ts. |
| @tanstack/react-query | Unnecessary. Firestore's onSnapshot provides real-time sync natively. Adding React Query creates two competing caching layers. Zustand handles local state fine. |
| lodash or lodash.debounce | use-debounce is 3KB vs lodash.debounce at 5.5KB, purpose-built for React hooks with proper cleanup on unmount. |
| babel-plugin-react-compiler | Optional optimization. Do NOT enable during migration -- adds build time via Babel. Enable only after the migration is stable and profiled. |
| Clerk / Supabase Auth | Paid service or wrong ecosystem. Firebase Auth free tier covers 50K MAU. Single-vendor simplicity with Firestore and Storage. |

## App Router vs Pages Router Decision

**Use App Router.** Rationale:

1. **Next.js 16 defaults to App Router.** Pages Router is legacy and receives no new features.
2. **Server Components** allow firebase-admin calls directly in page components (verify session, fetch project list from Firestore) without separate API routes.
3. **Layouts** naturally express the dashboard shell (sidebar + content) with nested routing that preserves state across navigation.
4. **The entire score renderer is client-only** (`'use client'`), so the server component model does not conflict -- the editor page simply uses a client component boundary.
5. **`proxy.ts`** (formerly middleware.ts in Next.js 15) handles auth guards at the network layer, redirecting unauthenticated users to the sign-in page.

## Turbopack vs Webpack for This Project

**Use Turbopack (the default) with `--webpack` as an escape hatch.**

Turbopack is the default bundler in Next.js 16. For Verovio's client-side WASM loading, Turbopack supports direct WASM imports -- GitHub issue #84972 was closed as "not a bug" (the reporter was using WASM incorrectly). The patterns that work in Turbopack:

1. **Direct import** -- Turbopack handles `import` of `.wasm` modules and returns instantiated modules.
2. **`new URL("module.wasm", import.meta.url)`** -- copies WASM to the static folder, provides a URL for manual instantiation.

Since Verovio uses `import createVerovioModule from 'verovio/wasm'` which internally handles WASM instantiation, and the component is wrapped in `'use client'` + `dynamic({ ssr: false })`, this should work with Turbopack. If any edge case arises during implementation, fall back to `next build --webpack` for production while keeping Turbopack for dev speed.

## Firebase Auth Strategy

**Use Firebase Auth direct (not NextAuth), with httpOnly session cookies.** This is the pattern recommended in Firebase's official Next.js codelab.

Flow:

1. Client signs in via `signInWithPopup(auth, googleProvider)` in a `'use client'` component.
2. On auth state change, call `getIdToken()` and POST it to a Next.js Route Handler (e.g., `/api/auth/session`).
3. Route Handler uses `firebase-admin` to verify the ID token, then creates an httpOnly, secure `__session` cookie.
4. `proxy.ts` reads the `__session` cookie on every request to protect routes. Unauthenticated requests to `/editor/*` or `/dashboard` redirect to `/login`.
5. Server Components read the cookie via `await cookies()` and verify it with firebase-admin to get the current user for data fetching.

Why this approach over alternatives:
- No service worker complexity (service worker approach is harder to maintain and debug).
- httpOnly cookies are immune to XSS attacks (JavaScript cannot read them).
- Works natively with Next.js server components and proxy.ts.
- Firebase's official codelab recommends exactly this pattern.
- No vendor lock-in beyond Firebase (session cookies are a standard pattern).

## Auto-Save Strategy

**Zustand store subscription + `useDebouncedCallback` from use-debounce + Firestore `setDoc` with merge.**

Flow:

1. Zustand store holds project state (all inspector settings, sync anchors, file references).
2. A `useAutoSave` hook subscribes to relevant store slices.
3. On any change, `useDebouncedCallback` fires after 1500ms of inactivity.
4. The debounced callback writes changed fields to `projects/{projectId}` using `setDoc(docRef, data, { merge: true })`.
5. An `onSnapshot` listener on the document provides real-time sync for multi-tab usage.
6. A "saving..." / "saved" indicator in the UI reflects write status.

Why not Zustand `persist` middleware:
- `persist` targets localStorage/sessionStorage/IndexedDB. We need Firestore as the persistence layer.
- A custom `subscribe` + debounced write is more explicit and supports Firestore's `merge` semantics.
- `onSnapshot` for reads + debounced `setDoc` for writes gives bidirectional real-time sync.

## Verovio WASM Migration Strategy

The existing Verovio loading pattern (`import createVerovioModule from 'verovio/wasm'`) must be wrapped in a client-only boundary in Next.js to prevent any server-side execution:

```typescript
// app/editor/[id]/page.tsx (server component)
import dynamic from 'next/dynamic';

const EditorClient = dynamic(() => import('./EditorClient'), { ssr: false });

export default async function EditorPage({ params }: PageProps<'/editor/[id]'>) {
  const { id } = await params;
  // Optionally fetch initial project data server-side here
  return <EditorClient projectId={id} />;
}
```

```typescript
// app/editor/[id]/EditorClient.tsx
'use client';
// ALL existing Verovio + renderer code lives here
// verovioService.ts import works unchanged since this is client-only
```

The existing `verovioService.ts` requires ZERO changes. The `'use client'` directive + `dynamic({ ssr: false })` ensures WASM never attempts to load server-side. All existing hooks (useVerovio, useSingleLineVerovio) and stores (syncStore, eventStore) work as-is inside the client boundary.

## File Storage Strategy

**Firebase Storage with uid-scoped paths.**

```
users/{uid}/projects/{projectId}/musicxml/{filename}
users/{uid}/projects/{projectId}/audio/{filename}
users/{uid}/projects/{projectId}/background/{filename}
users/{uid}/projects/{projectId}/exports/{filename}
```

Upload pattern: `uploadBytesResumable()` for progress tracking on large audio files, `getDownloadURL()` for retrieval. Firestore document stores the download URL references.

Security rules restrict access: `request.auth.uid == uid` in storage rules. Each user can only access their own files.

## Firestore Data Model

```
users/{uid}
  displayName: string
  email: string
  photoURL: string
  createdAt: timestamp
  updatedAt: timestamp

projects/{projectId}
  ownerId: string (uid)
  name: string
  createdAt: timestamp
  updatedAt: timestamp

  // File references (Firebase Storage download URLs)
  musicXmlUrl: string | null
  musicXmlFilename: string | null
  audioUrl: string | null
  audioFilename: string | null
  backgroundUrl: string | null
  backgroundFilename: string | null

  // Score settings (all the inspector state)
  fps: number
  scoreColor: string
  scoreShadowDistance: number
  hideUnplayedNotes: boolean
  smoothReveal: boolean
  scoreScale: number
  musicFont: string
  hideLabels: boolean
  scoreBorder: string
  scoreRegion: { x, y, width, height } | null

  // Note animation settings
  activeNoteheadColor: string | null
  activeNoteheadScale: number
  activeNoteheadEntryMs: number
  activeNoteheadHoldMs: number
  activeNoteheadExitMs: number
  colorFullNote: boolean

  // Sync anchors (Map serialized as object)
  syncAnchors: Record<string, number>
```

Why a flat structure instead of subcollections:
- All project data fits in a single Firestore document (well under 1MB limit).
- Single `setDoc` with merge for auto-save is simpler than multi-document transactions.
- Single `onSnapshot` for real-time sync across all project state.
- Dashboard list query: `query(collection(db, 'projects'), where('ownerId', '==', uid), orderBy('updatedAt', 'desc'))`.

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Framework | Next.js 16 | Next.js 15 | 15 is previous-gen. 16 has Turbopack stable, React 19.2, proxy.ts, better routing. Starting fresh on latest avoids future re-migration. |
| Auth | Firebase Auth direct | NextAuth.js v5 | Unnecessary abstraction when fully committed to Firebase. Adds adapter complexity for zero benefit. |
| Auth | Firebase Auth direct | Clerk | Paid service. Firebase Auth free tier covers 50K MAU -- more than sufficient. |
| Database | Firestore | Supabase Postgres | Already choosing Firebase for auth + storage. Firestore's real-time sync + offline persistence is ideal for auto-save. Single vendor reduces complexity. |
| Database | Firestore | PlanetScale / Neon | Relational DB is overkill for key-value project settings. Firestore's document model maps 1:1 to the existing state shape. |
| State sync | Custom Zustand subscribe | Zustand persist middleware | persist targets localStorage, not Firestore. Custom subscribe gives merge control and bidirectional sync via onSnapshot. |
| Debounce | use-debounce | lodash.debounce | use-debounce is React-hook-native with proper cleanup, smaller, purpose-built for this exact use case. |
| WASM bundling | Turbopack (default) | Webpack (--webpack flag) | Turbopack is 2-5x faster. Client-side WASM works. Keep webpack only as escape hatch. |
| File hooks | Custom hooks | react-firebase-hooks | Unmaintained (3 years stale). 10-20 lines of custom code is more reliable than a dead dependency. |

## Installation

```bash
# Core framework (replaces vite, @vitejs/plugin-react, vite-plugin-wasm, vite-plugin-top-level-await)
npm install next@latest react@latest react-dom@latest

# Firebase (NEW)
npm install firebase firebase-admin

# Auto-save debounce (NEW)
npm install use-debounce

# Dev dependencies (update types for Next.js)
npm install -D @types/react@latest @types/react-dom@latest typescript

# REMOVE these Vite-specific packages (no longer needed with Next.js)
npm uninstall vite @vitejs/plugin-react vite-plugin-wasm vite-plugin-top-level-await @tailwindcss/postcss
```

**Total new production dependencies: 3** (next, firebase, use-debounce)
**Total removed production dependencies: 0** (existing deps carry over)
**Total removed dev dependencies: 4** (vite ecosystem)

## Key Configuration

### next.config.ts

```typescript
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Turbopack is the default -- no explicit bundler config needed

  // If Verovio WASM causes issues with Turbopack, uncomment:
  // turbopack: {
  //   resolveAlias: {
  //     // Add alias overrides if needed for WASM resolution
  //   },
  // },

  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'firebasestorage.googleapis.com',
      },
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com', // Google profile photos
      },
    ],
  },
};

export default nextConfig;
```

### proxy.ts (auth guard, replaces middleware.ts)

```typescript
import { NextRequest, NextResponse } from 'next/server';

export function proxy(request: NextRequest) {
  const session = request.cookies.get('__session');
  const isAuthPage = request.nextUrl.pathname === '/login';
  const isProtectedRoute = request.nextUrl.pathname.startsWith('/editor') ||
                           request.nextUrl.pathname.startsWith('/dashboard');

  if (isProtectedRoute && !session) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  if (isAuthPage && session) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/editor/:path*', '/login'],
};
```

## Environment Variables

```bash
# .env.local

# Client-accessible (prefixed with NEXT_PUBLIC_)
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...

# Server-only (no NEXT_PUBLIC_ prefix -- never exposed to client)
FIREBASE_ADMIN_PROJECT_ID=...
FIREBASE_ADMIN_CLIENT_EMAIL=...
FIREBASE_ADMIN_PRIVATE_KEY=...
```

## Version Compatibility Matrix

| Package | Min Node | TypeScript | Notes |
|---------|----------|------------|-------|
| Next.js 16.1.x | 20.9+ | 5.1+ | Turbopack default, React 19.2 |
| firebase 12.9.x | 20+ | Built-in | ES2020 target, modular tree-shaking |
| firebase-admin 13.6.x | 20+ | Built-in | Server-only, ESM support |
| zustand 5.0.x | 18+ | Built-in | No changes from current setup |
| use-debounce 10.1.x | 16+ | Built-in | React 18+ peer dependency |
| verovio 6.0.x | N/A | @types/verovio | Client-only WASM, browser runtime |

**Node.js 20.9+ LTS satisfies all requirements.**

## Sources

- [Next.js 16 Release Blog](https://nextjs.org/blog/next-16) -- HIGH confidence. Verified: Turbopack default, React 19.2, proxy.ts, breaking changes.
- [Next.js 16 Upgrade Guide](https://nextjs.org/docs/app/guides/upgrading/version-16) -- HIGH confidence. Verified: async params, proxy.ts migration, Turbopack config.
- [Firebase JS SDK npm](https://www.npmjs.com/package/firebase) -- HIGH confidence. v12.9.0 confirmed, last published 6 days ago.
- [Firebase Admin npm](https://www.npmjs.com/package/firebase-admin) -- HIGH confidence. v13.6.1 confirmed, last published 6 days ago.
- [Firebase Next.js Codelab](https://firebase.google.com/codelabs/firebase-nextjs) -- HIGH confidence. Official Google pattern for Auth + App Router + session cookies.
- [Firebase Modular SDK Upgrade Guide](https://firebase.google.com/docs/web/modular-upgrade) -- HIGH confidence. Tree-shaking, modular imports.
- [Firebase Storage Upload Docs](https://firebase.google.com/docs/storage/web/upload-files) -- HIGH confidence. uploadBytesResumable, getDownloadURL.
- [Turbopack WASM Issue #84972](https://github.com/vercel/next.js/issues/84972) -- HIGH confidence. Closed as "not a bug", WASM works with correct patterns.
- [Verovio Reference Book - JS/WASM](https://book.verovio.org/installing-or-building-from-sources/javascript-and-webassembly.html) -- HIGH confidence. ESM import pattern.
- [use-debounce npm](https://www.npmjs.com/package/use-debounce) -- HIGH confidence. v10.1.0 confirmed.
- [Firebase Session Cookies](https://firebase.google.com/docs/auth/admin/manage-cookies) -- HIGH confidence. httpOnly cookie pattern with Admin SDK.
- [Zustand + Firebase Discussion](https://github.com/pmndrs/zustand/discussions/477) -- MEDIUM confidence. Community patterns for Zustand + Firestore integration.
- [WASM in Next.js Turbopack Workaround](https://codenote.net/en/posts/resolve-wasm-module-turbopack-nextjs-vercel/) -- MEDIUM confidence. Server-side WASM resolution; client-side is simpler.
- [Firebase Auth Best Practices for Redirect](https://firebase.google.com/docs/auth/web/redirect-best-practices) -- MEDIUM confidence. signInWithPopup vs signInWithRedirect tradeoffs.
