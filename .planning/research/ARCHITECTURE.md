# Architecture: Next.js Migration + Firebase Backend

**Domain:** Full-stack migration from Vite SPA to Next.js App Router with Firebase Auth, Firestore, and Storage
**Researched:** 2026-02-11
**Confidence:** HIGH

---

## Recommended Architecture

### Directory Structure

```
renderer/
  app/                          # Next.js App Router
    layout.tsx                  # Root layout (html, body, AuthProvider)
    page.tsx                    # Landing/marketing page (or redirect to /dashboard)
    login/
      page.tsx                  # Sign-in page (server component shell)
      LoginClient.tsx           # 'use client' -- Firebase signInWithPopup
    dashboard/
      layout.tsx                # Dashboard layout (nav, sidebar)
      page.tsx                  # Project list (server component -- Firestore query)
      DashboardClient.tsx       # 'use client' -- project cards, create modal
    editor/
      [id]/
        page.tsx                # Editor page (server component shell -- fetch project)
        EditorClient.tsx        # 'use client' -- entire existing App.tsx lives here
    api/
      auth/
        session/
          route.ts              # POST: create session cookie from ID token
          DELETE route.ts       # DELETE: clear session cookie (sign out)
  lib/
    firebase/
      client.ts                 # Firebase client SDK initialization
      admin.ts                  # Firebase Admin SDK initialization (server-only)
      auth.ts                   # Auth helpers (signIn, signOut, onAuthStateChanged)
      firestore.ts              # Firestore helpers (getProject, saveProject, etc.)
      storage.ts                # Storage helpers (uploadFile, getDownloadUrl)
    hooks/
      useAuth.ts                # Auth state hook (wraps onAuthStateChanged)
      useAutoSave.ts            # Debounced auto-save to Firestore
      useProject.ts             # Load project from Firestore into Zustand
    verovioService.ts           # UNCHANGED -- client-only WASM loading
  components/                   # Shared UI components
    AuthProvider.tsx             # React context for auth state
    SaveIndicator.tsx            # "Saving..." / "Saved" UI
    ProjectCard.tsx              # Dashboard project card
    CreateProjectModal.tsx       # New project creation form
  stores/                       # Zustand stores (UNCHANGED)
    syncStore.ts
    eventStore.ts
    projectStore.ts             # NEW -- project settings state for auto-save
  renderers/                    # UNCHANGED
    RegularRenderer.tsx
    SingleLineRenderer.tsx
  proxy.ts                      # Auth guard (replaces middleware.ts)
  next.config.ts
  export-service/               # UNCHANGED -- separate Fastify service
```

### Why This Structure

1. **Server components for data fetching.** Dashboard page fetches project list from Firestore server-side using firebase-admin. No loading spinners for the initial project list.

2. **Client boundaries at the page level.** Each page has a thin server component shell that fetches data, then passes it to a `'use client'` component. The editor page is entirely client-rendered because of Verovio WASM.

3. **Firebase SDKs in lib/.** Client SDK (`firebase/client.ts`) and Admin SDK (`firebase/admin.ts`) are separate files. The Admin SDK must NEVER be imported in client code -- it contains credentials and runs only on the server.

4. **Existing code migrates with minimal changes.** The current `App.tsx` becomes `EditorClient.tsx` with a `'use client'` directive. The renderer components, hooks, stores, and utilities move as-is into the new structure.

5. **Export service stays independent.** The Fastify export service is not migrated to Next.js. It continues as a separate process. The Next.js app communicates with it the same way it does now (HTTP + WebSocket).

---

## Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| **proxy.ts** | Auth guard: check __session cookie, redirect unauthenticated users | Next.js router, cookies |
| **AuthProvider** | React context providing { user, loading } to all client components | Firebase Auth SDK, children components |
| **LoginClient** | Google sign-in UI, popup flow, POST token to session API | Firebase Auth, /api/auth/session |
| **Session Route Handler** | Verify ID token, set/clear httpOnly __session cookie | firebase-admin, cookies |
| **Dashboard page** | Server-side Firestore query for project list | firebase-admin, DashboardClient |
| **DashboardClient** | Render project cards, create/delete/rename projects | Firestore client SDK, Firebase Storage |
| **Editor page** | Server-side project data fetch, render EditorClient | firebase-admin, EditorClient |
| **EditorClient** | All existing App.tsx functionality + auto-save | Zustand stores, Verovio, Firestore |
| **useAutoSave hook** | Subscribe to Zustand, debounce writes to Firestore | Zustand stores, Firestore client SDK |
| **useProject hook** | Load project from Firestore into Zustand on mount | Firestore client SDK, Zustand stores |
| **projectStore** | Hold all saveable project state | useAutoSave, EditorClient |

---

## Data Flow

### 1. Authentication Flow

```
User clicks "Sign in with Google"
  |
  v
LoginClient: signInWithPopup(auth, googleProvider)
  |
  | Returns: UserCredential with idToken
  v
LoginClient: POST /api/auth/session { idToken }
  |
  v
Session Route Handler:
  1. admin.auth().verifyIdToken(idToken)
  2. admin.auth().createSessionCookie(idToken, { expiresIn: 14 days })
  3. Set httpOnly cookie: __session = sessionCookie
  4. Return 200 OK
  |
  v
LoginClient: router.push('/dashboard')
  |
  v
proxy.ts: sees __session cookie -> allows request through
  |
  v
Dashboard page renders
```

### 2. Project Load Flow

```
User clicks project card in dashboard
  |
  v
Navigate to /editor/{projectId}
  |
  v
Editor page.tsx (server component):
  1. Read __session cookie via await cookies()
  2. Verify session with firebase-admin -> get uid
  3. Fetch project doc from Firestore (admin SDK)
  4. Pass project data as props to EditorClient
  |
  v
EditorClient (client component):
  1. Hydrate projectStore with server-provided data
  2. Fetch file download URLs from Firestore
  3. Load MusicXML content from Storage URL
  4. Load audio URL into state
  5. Restore all settings from project data
  6. Restore sync anchors: new Map(Object.entries(data.syncAnchors))
  7. Initialize useAutoSave(projectId)
  8. Render existing App UI (renderers, inspector, sync editor)
```

### 3. Auto-Save Flow

```
User adjusts slider in Inspector
  |
  v
Zustand projectStore updates immediately
  |
  v
useAutoSave detects change via store.subscribe()
  |
  | Resets 1500ms debounce timer
  |
  v [1500ms with no further changes]
  |
  v
useAutoSave: setDoc(doc(db, 'projects', projectId), {
  ...changedFields,
  updatedAt: serverTimestamp(),
}, { merge: true })
  |
  +-- saveStatus = 'saving'
  |
  v [Firestore write completes]
  |
  +-- saveStatus = 'saved'
  |
  v
SaveIndicator shows "Saved" with checkmark
```

### 4. File Upload Flow (Project Creation)

```
User fills in Create Project modal
  |
  v
CreateProjectModal: uploadBytesResumable(
  ref(storage, `users/${uid}/projects/${newId}/score.xml`),
  musicXmlFile
)
  |
  | Shows upload progress bar
  v
On upload complete: getDownloadURL(uploadRef)
  |
  v
Repeat for audio file and optional background image
  |
  v
All uploads complete:
  setDoc(doc(db, 'projects', newId), {
    ownerId: uid,
    name: projectName,
    musicXmlUrl: musicXmlDownloadUrl,
    musicXmlFilename: file.name,
    audioUrl: audioDownloadUrl,
    ...defaultSettings,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  |
  v
router.push(`/editor/${newId}`)
```

---

## Patterns to Follow

### Pattern 1: Firebase Client SDK Singleton

**What:** Initialize Firebase client SDK once, export the instances.

```typescript
// lib/firebase/client.ts
import { initializeApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Prevent re-initialization in hot reload
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
```

**When:** Every file that needs Firebase client SDK imports from this single module.

### Pattern 2: Firebase Admin SDK Singleton (Server-Only)

**What:** Initialize Admin SDK for server-side operations.

```typescript
// lib/firebase/admin.ts
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const app = getApps().length === 0
  ? initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
        clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
    })
  : getApps()[0];

export const adminAuth = getAuth(app);
export const adminDb = getFirestore(app);
```

**When:** Server components, Route Handlers, and proxy.ts. NEVER import this in client code.

### Pattern 3: Thin Server Component + Fat Client Component

**What:** Server components fetch data and pass it as props. Client components own all interactivity.

```typescript
// app/editor/[id]/page.tsx (server component)
import { cookies } from 'next/headers';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import dynamic from 'next/dynamic';

const EditorClient = dynamic(() => import('./EditorClient'), { ssr: false });

export default async function EditorPage({ params }: PageProps<'/editor/[id]'>) {
  const { id } = await params;
  const session = (await cookies()).get('__session')?.value;

  if (!session) redirect('/login');

  const decoded = await adminAuth.verifySessionCookie(session);
  const projectSnap = await adminDb.collection('projects').doc(id).get();
  const project = projectSnap.data();

  if (!project || project.ownerId !== decoded.uid) notFound();

  return <EditorClient projectId={id} initialData={project} />;
}
```

**When:** Every page that needs authenticated data fetching.

### Pattern 4: Zustand Store for Project State

**What:** A dedicated Zustand store for all saveable project fields, separate from ephemeral UI state.

```typescript
// stores/projectStore.ts
import { create } from 'zustand';

interface ProjectState {
  // Saveable fields (synced with Firestore)
  fps: number;
  scoreColor: string;
  scoreScale: number;
  musicFont: string;
  // ... all other settings
  syncAnchors: Map<string, number>;

  // Actions
  setFps: (fps: number) => void;
  setScoreColor: (color: string) => void;
  // ... setters for each field
  hydrate: (data: Record<string, any>) => void;
  getSnapshot: () => Record<string, any>;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  fps: 30,
  scoreColor: '#000000',
  // ... defaults

  setFps: (fps) => set({ fps }),
  setScoreColor: (scoreColor) => set({ scoreColor }),

  hydrate: (data) => set({
    fps: data.fps ?? 30,
    scoreColor: data.scoreColor ?? '#000000',
    syncAnchors: new Map(Object.entries(data.syncAnchors ?? {})),
    // ...
  }),

  getSnapshot: () => {
    const state = get();
    return {
      fps: state.fps,
      scoreColor: state.scoreColor,
      syncAnchors: Object.fromEntries(state.syncAnchors),
      // ...
    };
  },
}));
```

**When:** Any component that reads or writes project settings.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Importing firebase-admin in Client Code

**What:** Importing `firebase-admin` or `lib/firebase/admin.ts` in any file with `'use client'`.
**Why bad:** firebase-admin contains server credentials. Next.js will attempt to bundle it for the client, exposing the private key. Also, firebase-admin depends on Node.js APIs (fs, net, http2) that do not exist in the browser.
**Instead:** Use the client SDK (`firebase`) for all client-side operations. Use firebase-admin only in server components, Route Handlers, and proxy.ts.

### Anti-Pattern 2: SSR Rendering the Editor

**What:** Attempting to server-side render the score editor page.
**Why bad:** Verovio's WASM module, react-rnd, react-zoom-pan-pinch, and the existing renderer components all depend on browser APIs (DOM, window, Web Audio). SSR will fail or produce hydration mismatches.
**Instead:** Use `dynamic(() => import('./EditorClient'), { ssr: false })` to ensure the entire editor is client-only. The server component just fetches project data and renders a loading shell.

### Anti-Pattern 3: Storing Files in Firestore Documents

**What:** Storing MusicXML content or audio data directly in Firestore documents as base64 strings.
**Why bad:** Firestore documents are limited to 1MB. A MusicXML file can be 50KB-2MB. Audio files are 1-50MB. Reads of the project document would download the entire file content on every load.
**Instead:** Store files in Firebase Storage. Store only the download URL and filename in the Firestore document.

### Anti-Pattern 4: Multiple onSnapshot Listeners Per Project

**What:** Creating separate onSnapshot listeners for different parts of the project document.
**Why bad:** Each listener is a separate Firestore connection with separate reads. For a single document, one listener is sufficient.
**Instead:** One `onSnapshot` listener per project document. Distribute updates to relevant Zustand store slices from a single listener callback.

### Anti-Pattern 5: Using Pages Router for New Features

**What:** Adding new pages in the `pages/` directory instead of `app/`.
**Why bad:** Pages Router is legacy in Next.js 16. It does not support server components, layouts, or proxy.ts. Mixing App Router and Pages Router in the same project creates confusing routing behavior.
**Instead:** All new pages go in `app/`. The entire migration uses App Router exclusively.

---

## Integration with Export Service

The existing Fastify export service (`export-service/`) continues to run independently. The integration strategy:

**Development:** Next.js dev server runs on port 3000. Export service runs on port 3001 (as today). The editor communicates with the export service via direct HTTP/WebSocket to `localhost:3001`.

**Production:** Two deployment options:
1. **Same origin (recommended):** Next.js rewrites `/api/export/*` to the export service URL. No CORS needed.
2. **Separate origins:** Export service has its own domain. CORS configured on the Fastify server (already done via @fastify/cors).

The `exportClient.ts` migration requires replacing `import.meta.env.DEV` (Vite-specific) with `process.env.NODE_ENV === 'development'` (Next.js standard).

---

## Scalability Considerations

| Concern | At 10 users | At 1K users | At 100K users |
|---------|------------|-------------|---------------|
| **Auth sessions** | Firebase free tier | Firebase free tier (50K MAU) | Firebase Blaze plan (~$275/month at 100K MAU) |
| **Firestore reads** | Negligible cost | ~$0.06/100K reads | Monitor read counts; consider caching project lists |
| **Firestore writes** | Negligible cost | ~$0.18/100K writes | Debounce is critical; 1500ms prevents write storms |
| **Storage** | Firebase free tier (5GB) | ~$0.026/GB/month | Audio files dominate; consider compression |
| **Next.js hosting** | Vercel free tier | Vercel Pro (~$20/month) | Consider self-hosting or Vercel Enterprise |
| **Real-time sync** | No concern | Firestore handles concurrent listeners well | Consider limiting onSnapshot to active projects only |

---

## Sources

- [Next.js 16 App Router Docs](https://nextjs.org/docs/app) -- HIGH confidence. Route structure, server components, layouts.
- [Next.js 16 Upgrade Guide](https://nextjs.org/docs/app/guides/upgrading/version-16) -- HIGH confidence. proxy.ts, async params.
- [Firebase Next.js Codelab](https://firebase.google.com/codelabs/firebase-nextjs) -- HIGH confidence. Session cookie pattern, FirebaseServerApp.
- [Firebase Auth Admin SDK](https://firebase.google.com/docs/auth/admin/manage-cookies) -- HIGH confidence. Session cookie creation/verification.
- [Firestore Data Model](https://firebase.google.com/docs/firestore/data-model) -- HIGH confidence. Document structure, limits.
- [Firebase Storage Web](https://firebase.google.com/docs/storage/web/upload-files) -- HIGH confidence. Upload/download patterns.
- [Zustand Documentation](https://zustand.docs.pmnd.rs/) -- HIGH confidence. subscribe API, middleware patterns.
- Codebase analysis: `src/App.tsx`, `src/stores/syncStore.ts`, `src/lib/verovioService.ts`, `src/main.tsx` -- Direct verification of migration compatibility.
