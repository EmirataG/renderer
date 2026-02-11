# Domain Pitfalls: Vite-to-Next.js Migration + Firebase Integration

**Domain:** Migrating a Vite React SPA (with WASM, heavy DOM manipulation) to Next.js and adding Firebase Auth, Firestore, and Storage
**Researched:** 2026-02-11
**Confidence:** HIGH (based on codebase analysis, official Next.js migration guide, Firebase docs, and community post-mortems)

---

## Context

This pitfalls research focuses on migrating the **Manuscript Renderer** from a Vite SPA to Next.js, while simultaneously adding Firebase services. The current app:

1. Uses **Verovio WASM** (`verovio/wasm` + `verovio/esm`) with `vite-plugin-wasm` and `vite-plugin-top-level-await`
2. Has heavy **browser-only code**: `window.__EXPORT_CONFIG__`, `window.animationController`, `document.querySelector` for SVG manipulation, `ResizeObserver`, `new Image()`, `URL.revokeObjectURL`, WebSocket connections
3. Uses **Zustand** stores with `Map<string, number>` (non-serializable) for sync anchors
4. Has a **separate Fastify export service** at `localhost:3001` communicating via REST + WebSocket
5. Uses `import.meta.env.DEV` and `import.meta.env` throughout for environment branching
6. Relies on `react-zoom-pan-pinch` for UI interactions requiring browser APIs

The migration must:
- Move to Next.js App Router with `'use client'` boundaries
- Add Firebase Auth (session management across SSR/client)
- Add Firestore for project data with debounced auto-save
- Add Firebase Storage for file uploads (MusicXML, audio, images)
- Keep the existing Fastify export service working alongside

---

## Critical Pitfalls

Mistakes that cause broken builds, runtime crashes, or fundamental architecture failures.

---

### Pitfall 1: Verovio WASM Crashes SSR -- "WebAssembly is not defined" on Server

**What goes wrong:**
The current `verovioService.ts` imports `createVerovioModule from 'verovio/wasm'` at the module top level. In Vite, this works because `vite-plugin-wasm` handles WASM loading and `vite-plugin-top-level-await` polyfills top-level await. In Next.js, this module is evaluated on the server during SSR, where the WebAssembly global exists but the WASM binary loading path is different.

The specific failure chain:
```
1. Next.js server renders a page that imports a component
2. Component imports useVerovio hook
3. useVerovio imports from verovioService.ts
4. verovioService.ts runs: import createVerovioModule from 'verovio/wasm'
5. The verovio/wasm module tries to load a .wasm binary file
6. Path resolution fails on the server (expects browser fetch, not fs.readFile)
7. Server crashes with: Error: ENOENT or "failed to asynchronously prepare wasm"
```

Additionally, `vite-plugin-wasm` and `vite-plugin-top-level-await` are Vite-specific plugins with no Next.js equivalent. Next.js uses webpack (or Turbopack), which handles WASM differently through `experiments.asyncWebAssembly`.

**Consequences:**
- Build fails entirely if any server-rendered component transitively imports Verovio
- Even with `'use client'`, the module is still evaluated during SSR prerendering
- `next build` crashes, blocking deployment
- Developers waste hours debugging WASM path resolution in webpack vs Vite

**Prevention:**
1. **All Verovio-consuming components must use `dynamic()` with `ssr: false`:**
   ```typescript
   // app/editor/page.tsx (Server Component)
   import dynamic from 'next/dynamic';

   const EditorApp = dynamic(() => import('@/components/EditorApp'), {
     ssr: false,
     loading: () => <div>Loading editor...</div>,
   });

   export default function EditorPage() {
     return <EditorApp />;
   }
   ```

2. **Configure webpack for async WASM in `next.config.mjs`:**
   ```javascript
   const nextConfig = {
     webpack: (config, { isServer }) => {
       config.experiments = {
         ...config.experiments,
         asyncWebAssembly: true,
       };
       // Fix WASM file output paths
       config.output.webassemblyModuleFilename =
         isServer ? '../static/wasm/[modulehash].wasm' : 'static/wasm/[modulehash].wasm';
       return config;
     },
   };
   ```

3. **Remove Vite-specific plugins and replace with webpack equivalents:**
   - Remove `vite-plugin-wasm` and `vite-plugin-top-level-await`
   - The `asyncWebAssembly` experiment in webpack handles both concerns

4. **Keep `verovioService.ts` as a lazy singleton, never imported at module scope by server code:**
   ```typescript
   // lib/verovioService.ts -- only ever imported from 'use client' components
   let modulePromise: Promise<any> | null = null;
   // ... (existing pattern is already correct, just must never be imported server-side)
   ```

**Detection:**
- `next build` fails with WASM-related errors
- Server logs: "WebAssembly module is included in server bundle"
- Runtime: "Failed to asynchronously prepare wasm" errors

**Recovery cost:** MEDIUM (4-8 hours) -- requires restructuring imports, adding dynamic imports, configuring webpack

**Phase to address:** Phase 1 (Vite-to-Next.js migration) -- this is the FIRST thing that will break

---

### Pitfall 2: "window is not defined" Crashes from Pervasive Browser API Usage

**What goes wrong:**
The current codebase accesses browser APIs in at least 8 files: `window.location.search` in `App.tsx` (line 21), `window.__EXPORT_CONFIG__` in `main.tsx`, `document.querySelector` in `noteAnimation.ts`, `new Image()` in `App.tsx` (line 104), `URL.revokeObjectURL` in upload handlers, `WebSocket` in export logic, `ResizeObserver` in `SyncEditor.tsx`, and `window.open` for downloads.

In Next.js, even `'use client'` components are **prerendered on the server** during the initial HTML generation. The `'use client'` directive does NOT mean "client-only" -- it means "this component can use hooks and browser APIs after hydration." During SSR prerendering, `window`, `document`, `navigator`, `WebSocket`, `ResizeObserver`, and `Image` are all undefined.

**Specific code that will crash:**
```typescript
// App.tsx line 21 -- runs during SSR prerender
const useSingleLineRenderer = typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).get('renderer') === 'single-line';
```
This line has a guard (`typeof window !== 'undefined'`), so it survives. But many other usages do not:

```typescript
// App.tsx line 104 -- in useEffect, safe
const img = new Image();  // OK: inside useEffect

// App.tsx line 197 -- in event handler, safe at runtime
const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';

// noteAnimation.ts line 30 -- called from useEffect, safe
root.querySelector(...)  // OK: root is HTMLElement from ref
```

The real danger is transitive imports. If `noteAnimation.ts` had any top-level code accessing `document`, it would crash. Currently the codebase is mostly safe because browser APIs are inside `useEffect` or event handlers, but any refactoring that moves code to module scope will break.

**Consequences:**
- Hydration errors: server renders different output than client
- Build-time crashes if any module-level code accesses browser APIs
- Subtle bugs where SSR output differs from client (e.g., `useSingleLineRenderer` is always false on server)

**Prevention:**
1. **Use `dynamic(() => import(...), { ssr: false })` for the entire app shell initially:**
   The official Next.js Vite migration guide recommends this exact pattern -- wrapping the entire existing app in a client-only dynamic import as Phase 1, then incrementally extracting server components.

2. **Audit every `window`, `document`, `navigator` usage:**
   ```bash
   grep -rn "window\.\|document\.\|navigator\." src/ --include="*.ts" --include="*.tsx"
   ```
   Every hit must be either: (a) inside `useEffect`/event handler, (b) guarded by `typeof window !== 'undefined'`, or (c) in a component loaded with `ssr: false`.

3. **Adopt the `useIsClient` pattern for conditional rendering:**
   ```typescript
   function useIsClient() {
     const [isClient, setIsClient] = useState(false);
     useEffect(() => setIsClient(true), []);
     return isClient;
   }
   ```

4. **Replace `import.meta.env` with `process.env`:**
   - `import.meta.env.DEV` -> `process.env.NODE_ENV !== 'production'`
   - `import.meta.env.VITE_*` -> `process.env.NEXT_PUBLIC_*`
   - The `import.meta.env` syntax does not exist in Next.js

**Detection:**
- "ReferenceError: window is not defined" during `next build` or SSR
- Hydration mismatch warnings in browser console
- Content flashing on page load (server HTML differs from client)

**Recovery cost:** LOW-MEDIUM (2-6 hours depending on how many files need changes)

**Phase to address:** Phase 1 (Vite-to-Next.js migration) -- audit immediately after scaffolding

---

### Pitfall 3: Firebase Admin SDK Leaks into Client Bundle

**What goes wrong:**
Firebase has two SDK families: `firebase` (client, ~100KB) and `firebase-admin` (server, ~5.7MB minified to ~2.8MB). In Next.js, the boundary between server and client code is defined by `'use client'` directives. If a server-side utility file imports `firebase-admin` and that file is transitively imported by a client component, the entire Admin SDK gets bundled into the client JavaScript.

This is especially dangerous because `firebase-admin` requires service account credentials (private keys). If these are referenced in code that leaks to the client, the credentials are exposed to every user.

**Common scenario:**
```typescript
// lib/firebase-admin.ts
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const app = initializeApp({
  credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT!)),  // SECRET
});
export const adminDb = getFirestore(app);

// lib/projects.ts -- shared utility
import { adminDb } from './firebase-admin';  // Server-only import
export async function getProject(id: string) { ... }

// components/ProjectView.tsx
'use client'
import { getProject } from '@/lib/projects';  // LEAKS admin SDK to client
```

**Consequences:**
- Client bundle grows by 2.8MB+ (massive performance hit)
- Service account private key exposed in client JavaScript
- Full admin database access credentials available to any user
- Firebase project can be completely compromised

**Prevention:**
1. **Use the `server-only` package to enforce boundaries:**
   ```bash
   npm install server-only
   ```
   ```typescript
   // lib/firebase-admin.ts
   import 'server-only';  // Build error if imported from client component
   import { initializeApp, cert } from 'firebase-admin/app';
   ```

2. **Separate client and server Firebase configs into distinct files:**
   ```
   lib/
     firebase-client.ts    -- firebase/app, firebase/auth, firebase/firestore (client SDK)
     firebase-admin.ts     -- firebase-admin/app, firebase-admin/firestore (server SDK)
   ```
   Never import from `firebase-admin.ts` in any file that could reach a `'use client'` component.

3. **Use Next.js Server Actions or Route Handlers for server-only operations:**
   ```typescript
   // app/api/projects/[id]/route.ts
   import { adminDb } from '@/lib/firebase-admin';  // Safe: API route is server-only

   export async function GET(req, { params }) {
     const project = await adminDb.collection('projects').doc(params.id).get();
     return Response.json(project.data());
   }
   ```

4. **Environment variable naming convention:**
   - Server-only secrets: `FIREBASE_SERVICE_ACCOUNT` (no `NEXT_PUBLIC_` prefix)
   - Client-safe config: `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
   - Next.js only exposes `NEXT_PUBLIC_*` vars to the client bundle

**Detection:**
- Bundle analysis shows `firebase-admin` in client chunks
- Build warnings about large bundle size
- `process.env.FIREBASE_SERVICE_ACCOUNT` is `undefined` in client code (Next.js strips non-public env vars)

**Recovery cost:** MEDIUM (4-6 hours) -- requires restructuring imports and establishing clear boundaries

**Phase to address:** Phase 2 (Firebase setup) -- establish the client/server boundary BEFORE writing any Firebase code

---

### Pitfall 4: Firebase Auth Session Not Available During SSR

**What goes wrong:**
Firebase Auth client SDK (`onAuthStateChanged`) runs in the browser. It persists auth state to IndexedDB/localStorage. On the server (during SSR or in Server Components), there is no browser -- so `firebase.auth().currentUser` is always `null`.

This means:
- Server Components cannot check if a user is logged in
- Server-side data fetching cannot use Firebase Auth tokens
- Protected pages flash unauthenticated content before client-side auth resolves
- Firestore security rules that check `request.auth` fail for server-side reads

The `onAuthStateChanged` callback fires asynchronously: first with `null` (always), then with the user object once Firebase loads credentials from persistence. This creates a "flash of unauthenticated state" on every page load.

**Consequences:**
- Users see login page briefly before being redirected to authenticated content
- Server-rendered HTML has no user-specific data (personalized content loads late)
- Protected API routes cannot verify the user without extra work
- Firestore reads from server fail security rules

**Prevention:**
1. **Use session cookies for server-side auth verification:**
   ```typescript
   // After client-side login:
   const idToken = await user.getIdToken();
   await fetch('/api/auth/session', {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({ idToken }),
   });

   // API route creates session cookie:
   import { getAuth } from 'firebase-admin/auth';

   export async function POST(req) {
     const { idToken } = await req.json();
     const expiresIn = 60 * 60 * 24 * 5 * 1000; // 5 days
     const sessionCookie = await getAuth().createSessionCookie(idToken, { expiresIn });
     // Set HttpOnly cookie
     const response = new Response(JSON.stringify({ status: 'success' }));
     response.headers.set('Set-Cookie',
       `session=${sessionCookie}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${expiresIn / 1000}`
     );
     return response;
   }
   ```

2. **Use Next.js Middleware (or Proxy in v16) to protect routes:**
   ```typescript
   // middleware.ts
   import { NextResponse } from 'next/server';

   export function middleware(request) {
     const session = request.cookies.get('session')?.value;
     if (!session && request.nextUrl.pathname.startsWith('/editor')) {
       return NextResponse.redirect(new URL('/login', request.url));
     }
     return NextResponse.next();
   }
   ```

3. **Handle the auth loading state explicitly:**
   ```typescript
   // hooks/useAuth.ts
   'use client'
   import { onAuthStateChanged } from 'firebase/auth';

   export function useAuth() {
     const [user, setUser] = useState<User | null>(null);
     const [loading, setLoading] = useState(true);  // TRUE initially

     useEffect(() => {
       return onAuthStateChanged(auth, (user) => {
         setUser(user);
         setLoading(false);
       });
     }, []);

     return { user, loading };
   }
   ```
   Always show a loading state until `loading` is `false`. Never assume `user === null` means "not logged in" -- it might mean "still loading."

4. **Session cookie expiration: 14 days maximum for Firebase session cookies.** Plan for token refresh. The client SDK should refresh the session cookie before it expires:
   ```typescript
   // Periodic token refresh (e.g., every 55 minutes)
   useEffect(() => {
     const interval = setInterval(async () => {
       const user = auth.currentUser;
       if (user) {
         const idToken = await user.getIdToken(true); // Force refresh
         await fetch('/api/auth/session', {
           method: 'POST',
           body: JSON.stringify({ idToken }),
         });
       }
     }, 55 * 60 * 1000);
     return () => clearInterval(interval);
   }, []);
   ```

**Detection:**
- Flash of login page on every page load for authenticated users
- Server Components show "not logged in" content
- `currentUser` is null in server-side code

**Recovery cost:** MEDIUM (6-8 hours) -- requires session cookie infrastructure

**Phase to address:** Phase 2 (Firebase Auth) -- design the auth flow BEFORE building login UI

---

### Pitfall 5: Zustand Store Hydration Mismatch with Next.js SSR

**What goes wrong:**
The current `syncStore.ts` uses `Map<string, number>` for anchors. Zustand stores initialized on the server produce different output than on the client because:

1. Server renders with default store state (empty Map)
2. Client hydrates, restoring persisted state from localStorage or Firestore
3. The HTML from server does not match the client-rendered DOM
4. React throws hydration mismatch errors

This is especially problematic if Zustand persist middleware is added (likely, for saving project state). `Map` and `Set` are not JSON-serializable -- `JSON.stringify(new Map([['a', 1]]))` returns `'{}'`.

**Additional issue:** If the store is used in a Server Component (even transitively), it creates a new store instance per request on the server, not shared across components. Zustand stores are singletons in the browser but NOT on the server.

**Consequences:**
- Hydration errors on every page load
- Persisted anchor data silently lost (Map serializes to empty object)
- Store state differs between server and client renders
- Console flooded with React hydration warnings

**Prevention:**
1. **Convert Map to Record for Firestore/persistence compatibility:**
   ```typescript
   // BEFORE (current)
   anchors: Map<string, number>

   // AFTER (Firestore-compatible)
   anchors: Record<string, number>
   ```
   This is the cleanest solution. `Record<string, number>` serializes naturally to JSON and Firestore documents. All `anchors.get(id)` becomes `anchors[id]`, `anchors.set(id, val)` becomes `{ ...anchors, [id]: val }`, and `anchors.size` becomes `Object.keys(anchors).length`.

2. **If Map must be kept, use custom serialization with Zustand persist:**
   ```typescript
   import { persist, createJSONStorage } from 'zustand/middleware';
   import superjson from 'superjson';

   const useStore = create(
     persist(storeDefinition, {
       name: 'sync-store',
       storage: createJSONStorage(() => localStorage, {
         reviver: (key, value) => superjson.parse(JSON.stringify(value)),
         replacer: (key, value) => JSON.parse(superjson.stringify(value)),
       }),
     })
   );
   ```

3. **Wrap store-dependent UI in a hydration boundary:**
   ```typescript
   function HydrationBoundary({ children }: { children: React.ReactNode }) {
     const [hydrated, setHydrated] = useState(false);
     useEffect(() => setHydrated(true), []);
     if (!hydrated) return <LoadingSkeleton />;
     return <>{children}</>;
   }
   ```

4. **Keep Zustand stores in `'use client'` components only.** Never import store hooks in Server Components.

**Detection:**
- "Text content does not match server-rendered HTML" errors
- Anchor data disappears after page refresh
- `JSON.stringify(store.anchors)` returns `'{}'` instead of anchor data

**Recovery cost:** LOW (2-4 hours) if converting Map to Record early; HIGH (8+ hours) if discovered late after building persistence layer on Map

**Phase to address:** Phase 1 (migration) -- convert Map to Record BEFORE adding Firestore persistence

---

### Pitfall 6: Firestore Auto-Save Race Conditions and Write Rate Limits

**What goes wrong:**
The planned auto-save feature will debounce user edits and write project state to Firestore. Multiple race conditions emerge:

**Race 1: Stale write overwrites newer data.**
```
t=0s:   User changes scoreColor to red
t=0.1s: Debounce timer starts (300ms)
t=0.2s: User changes scoreColor to blue
t=0.3s: First debounce fires, writes {scoreColor: "red"} to Firestore
t=0.5s: Second debounce fires, writes {scoreColor: "blue"} to Firestore
```
If the first write is slow (network latency), it might arrive at Firestore AFTER the second write, overwriting "blue" with "red." The user sees their change reverted.

**Race 2: Concurrent tabs overwrite each other.**
User opens the same project in two tabs. Both tabs write to the same Firestore document. Without conflict resolution, the last write wins, losing changes from the other tab.

**Race 3: Firestore's 1 write/second soft limit per document.**
Debouncing at 300ms means up to 3 writes/second to the same document. Firestore can handle burst writes but will increase latency and eventually return errors if sustained. For a project document that multiple fields update frequently (scoreColor, scoreScale, musicFont, anchors), this limit is easily hit.

**Race 4: onSnapshot listener triggers write loop.**
If the app listens to Firestore for real-time updates (to sync across tabs) AND writes to Firestore on local changes, a feedback loop occurs:
```
Local change -> write to Firestore -> onSnapshot fires -> state updates -> triggers debounce -> write to Firestore -> ...
```

**Consequences:**
- User changes silently lost (stale write overtakes newer write)
- Data corruption from concurrent tab writes
- Firestore write failures under sustained rapid edits
- Infinite write loops consuming Firestore quota and billing

**Prevention:**
1. **Use Firestore's `serverTimestamp()` and version fields for conflict detection:**
   ```typescript
   import { updateDoc, serverTimestamp, increment } from 'firebase/firestore';

   async function saveProject(projectRef, data) {
     await updateDoc(projectRef, {
       ...data,
       updatedAt: serverTimestamp(),
       version: increment(1),
     });
   }
   ```

2. **Debounce at 1-2 seconds minimum (not 300ms) to respect write limits:**
   ```typescript
   const SAVE_DEBOUNCE_MS = 1500; // 1.5 seconds -- safe for Firestore rate limits

   const debouncedSave = useMemo(
     () => debounce((data) => saveProject(projectRef, data), SAVE_DEBOUNCE_MS),
     [projectRef]
   );
   ```

3. **Merge writes: batch all pending changes into a single write:**
   ```typescript
   // Accumulate changes, write all at once
   const pendingChanges = useRef<Partial<ProjectData>>({});

   function queueChange(field: string, value: any) {
     pendingChanges.current[field] = value;
     debouncedSave(pendingChanges.current);
   }

   // On debounce fire:
   async function flush() {
     const changes = { ...pendingChanges.current };
     pendingChanges.current = {};
     await updateDoc(projectRef, changes);
   }
   ```

4. **Distinguish local changes from remote changes to prevent write loops:**
   ```typescript
   const isLocalChange = useRef(false);

   // When user makes a change:
   isLocalChange.current = true;
   store.setScoreColor(newColor);
   debouncedSave();

   // In onSnapshot listener:
   onSnapshot(projectRef, (doc) => {
     if (isLocalChange.current) {
       isLocalChange.current = false;
       return; // Skip: this is our own write echoing back
     }
     // Apply remote changes to local state
     store.setFromFirestore(doc.data());
   });
   ```

5. **Structure data to reduce per-document write frequency:**
   Split the project into subcollections:
   ```
   projects/{id}           -- metadata (name, owner, createdAt)
   projects/{id}/settings  -- scoreColor, scoreScale, musicFont, etc.
   projects/{id}/anchors   -- sync anchor data (can be a single doc with all anchors)
   ```
   This way, changing an anchor doesn't conflict with changing score color.

**Detection:**
- User reports changes "jumping back" to previous values
- Firestore console shows rapid writes to same document
- Console errors about write contention
- Cloud billing spikes from excessive writes

**Recovery cost:** HIGH (8-12 hours) if discovered after building naive auto-save; LOW (2-4 hours) if designed correctly from the start

**Phase to address:** Phase 3 (Firestore integration) -- design the data model and save pattern BEFORE implementing UI persistence

---

## Moderate Pitfalls

Mistakes that cause degraded UX, performance issues, or significant debugging time.

---

### Pitfall 7: Firestore Security Rules Grant Too Much Access

**What goes wrong:**
Developers often start with permissive rules to "get things working" and never tighten them:
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;  // OPEN TO THE WORLD
    }
  }
}
```

Or they check only authentication without authorization:
```
allow read, write: if request.auth != null;  // Any logged-in user can read/write ANY document
```

Firestore security rules are OR-based: if ANY matching rule grants access, access is granted. A broad rule cannot be restricted by a more specific rule. This is the opposite of how most developers expect it to work.

**Consequences:**
- Any authenticated user can read/modify any other user's projects
- Data theft: users can read all project data from all users
- Data destruction: users can delete any document
- If rules are `allow read, write: if true`, unauthenticated users have full access

**Prevention:**
1. **Start with deny-all, add specific allows:**
   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       // Default: deny everything
       match /{document=**} {
         allow read, write: if false;
       }

       // Projects: only owner can access
       match /projects/{projectId} {
         allow read, write: if request.auth != null
           && request.auth.uid == resource.data.ownerId;
         allow create: if request.auth != null
           && request.resource.data.ownerId == request.auth.uid;
       }
     }
   }
   ```

2. **Validate data shape in security rules:**
   ```
   allow update: if request.auth.uid == resource.data.ownerId
     && request.resource.data.keys().hasAll(['updatedAt', 'version'])
     && request.resource.data.scoreColor is string
     && request.resource.data.scoreScale is number
     && request.resource.data.scoreScale >= 0.5
     && request.resource.data.scoreScale <= 1.5;
   ```

3. **Test rules with the Firebase Emulator before deploying:**
   ```bash
   firebase emulators:start --only firestore
   # Run tests against emulator
   ```

4. **Use `get()` and `exists()` sparingly in rules** -- each adds a read operation and can impact performance. Prefer flat data structures where the document path encodes ownership.

**Detection:**
- Firebase Console shows security rules warnings
- Any user can see other users' projects
- Firestore usage dashboard shows unexpected read patterns

**Recovery cost:** LOW (2-4 hours) to write proper rules; HIGH (reputational damage) if exploited before fixing

**Phase to address:** Phase 2 (Firebase setup) -- write and test rules BEFORE storing any real user data

---

### Pitfall 8: Firebase Storage Upload Fails for Large Audio Files

**What goes wrong:**
Firebase Storage client SDK has a 32MB upload limit per write operation (for the web/Node.js SDK). MusicXML files are small (typically <1MB), but audio files (WAV, FLAC) can easily exceed 32MB. A 5-minute WAV file at CD quality is ~50MB.

Additionally, if uploads go through Next.js API routes (e.g., Server Actions), Vercel's serverless function body limit is 4.5MB. Even self-hosted, Next.js Route Handlers buffer the entire request body in memory by default.

**Consequences:**
- Audio upload fails silently or with cryptic error
- Users cannot upload WAV or FLAC files for export
- If routing through API routes, even smaller files fail (4.5MB limit)
- Memory spikes on server from buffering large files

**Prevention:**
1. **Upload directly from the client to Firebase Storage (not through Next.js server):**
   ```typescript
   import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';

   async function uploadAudio(file: File, projectId: string) {
     const storageRef = ref(storage, `projects/${projectId}/audio/${file.name}`);
     const task = uploadBytesResumable(storageRef, file);

     task.on('state_changed',
       (snapshot) => {
         const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
         setUploadProgress(progress);
       },
       (error) => { /* handle error */ },
       async () => {
         const url = await getDownloadURL(task.snapshot.ref);
         // Save URL to Firestore project document
       }
     );
   }
   ```

2. **Use `uploadBytesResumable` (not `uploadBytes`) for large files:**
   Resumable uploads can handle files up to 5TB and recover from network interruptions. `uploadBytes` loads the entire file into memory.

3. **Set Storage security rules to enforce file size limits:**
   ```
   service firebase.storage {
     match /b/{bucket}/o {
       match /projects/{projectId}/audio/{fileName} {
         allow write: if request.auth != null
           && request.resource.size < 100 * 1024 * 1024  // 100MB max
           && request.resource.contentType.matches('audio/.*');
       }
       match /projects/{projectId}/musicxml/{fileName} {
         allow write: if request.auth != null
           && request.resource.size < 10 * 1024 * 1024  // 10MB max
           && (request.resource.contentType == 'application/xml'
               || request.resource.contentType == 'text/xml');
       }
     }
   }
   ```

4. **Show upload progress to the user** (the current app has no upload progress for the export service -- this is a UX improvement opportunity).

**Detection:**
- Large audio uploads fail with "object too large" or timeout errors
- Upload works in development (small test files) but fails in production (real audio files)
- Memory usage spikes during upload

**Recovery cost:** LOW (2-3 hours) if designed for direct client upload from the start; MEDIUM (4-6 hours) if initially built through API routes and must be refactored

**Phase to address:** Phase 3 (Firebase Storage) -- use direct client upload from the beginning

---

### Pitfall 9: Fastify Export Service Cannot Authenticate Firebase Users

**What goes wrong:**
The existing Fastify export service at `localhost:3001` is a separate process from the Next.js app. After adding Firebase Auth, the export service needs to verify that the requesting user is authenticated and authorized to export a specific project. But the Fastify service has no access to:
- Firebase Auth session cookies (set on the Next.js domain)
- The client-side Firebase Auth token
- The Next.js server's session state

If the export service is not protected, anyone who discovers the endpoint can submit export jobs, consuming server resources and potentially accessing other users' project data.

**Additionally:** The current export flow sends files directly from the browser to `localhost:3001`. After migration, files will be in Firebase Storage. The export service needs to download them, which requires either Firebase Admin SDK access or signed URLs.

**Consequences:**
- Export endpoint is unauthenticated (anyone can trigger exports)
- Export service cannot verify project ownership
- Files in Firebase Storage are inaccessible to the export service
- CORS issues between Next.js domain and Fastify service domain

**Prevention:**
1. **Pass Firebase ID token in export requests and verify with Admin SDK:**
   ```typescript
   // Client (Next.js app):
   const idToken = await auth.currentUser.getIdToken();
   const response = await fetch('https://export-service/api/export', {
     method: 'POST',
     headers: {
       'Authorization': `Bearer ${idToken}`,
     },
     body: formData,
   });

   // Fastify export service:
   import { getAuth } from 'firebase-admin/auth';

   fastify.addHook('preHandler', async (request, reply) => {
     const authHeader = request.headers.authorization;
     if (!authHeader?.startsWith('Bearer ')) {
       return reply.status(401).send({ error: 'Missing auth token' });
     }
     const idToken = authHeader.split('Bearer ')[1];
     try {
       const decoded = await getAuth().verifyIdToken(idToken);
       request.user = decoded;
     } catch {
       return reply.status(401).send({ error: 'Invalid auth token' });
     }
   });
   ```

2. **Initialize Firebase Admin SDK in the Fastify service:**
   ```typescript
   import { initializeApp, cert } from 'firebase-admin/app';

   initializeApp({
     credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)),
   });
   ```

3. **Use Firebase Storage signed URLs for file access in the export service:**
   ```typescript
   import { getStorage } from 'firebase-admin/storage';

   // Instead of receiving file uploads directly, receive Storage paths
   const bucket = getStorage().bucket();
   const file = bucket.file(`projects/${projectId}/audio/${audioFileName}`);
   const [buffer] = await file.download();
   ```

4. **Proxy export requests through Next.js API routes (BFF pattern):**
   ```typescript
   // app/api/export/route.ts
   export async function POST(req) {
     // Verify session cookie
     const session = req.cookies.get('session')?.value;
     const decoded = await getAuth().verifySessionCookie(session);

     // Forward to Fastify service with internal auth
     const response = await fetch('http://export-service:3001/api/export', {
       method: 'POST',
       headers: {
         'X-Internal-Auth': process.env.INTERNAL_SERVICE_KEY,
         'X-User-Id': decoded.uid,
       },
       body: await req.blob(),
     });
     return new Response(response.body, { status: response.status });
   }
   ```
   This eliminates CORS issues and centralizes auth verification.

**Detection:**
- Export requests fail with 401 after adding auth
- CORS errors when calling export service from new domain
- Export service cannot download files from Firebase Storage

**Recovery cost:** MEDIUM (4-6 hours) -- requires adding Admin SDK to Fastify, updating client auth flow

**Phase to address:** Phase 2/3 (Firebase Auth + Export service integration) -- plan the auth flow for the export service when designing the auth architecture

---

### Pitfall 10: Firestore onSnapshot Listeners Leak Memory on Next.js Route Changes

**What goes wrong:**
In a Vite SPA, the app mounts once and unmounts when the browser tab closes. Firestore `onSnapshot` listeners set up in `useEffect` are cleaned up on component unmount. In Next.js with the App Router, navigating between routes unmounts and remounts components. If `onSnapshot` cleanup functions are not properly returned from `useEffect`, listeners accumulate:

```
Navigate to /projects/abc -> listener 1 created
Navigate to /projects/def -> listener 1 NOT cleaned up, listener 2 created
Navigate to /projects/ghi -> listeners 1, 2 NOT cleaned up, listener 3 created
...
```

Each listener maintains an open WebSocket connection to Firestore and triggers state updates. After navigating to 10+ projects, the app has 10+ active listeners, all firing callbacks for documents the user is no longer viewing.

**Consequences:**
- Memory grows with each navigation (leaked listeners + their closures)
- CPU usage increases (processing snapshots for invisible documents)
- Stale listeners update state that no component is consuming, causing React warnings
- Firestore billing increases (each active listener is a read)
- Eventually the browser tab becomes sluggish or crashes

**Prevention:**
1. **Always return the unsubscribe function from useEffect:**
   ```typescript
   useEffect(() => {
     const unsubscribe = onSnapshot(
       doc(db, 'projects', projectId),
       (snapshot) => {
         setProjectData(snapshot.data());
       }
     );
     return unsubscribe;  // CRITICAL: clean up on unmount
   }, [projectId]);
   ```

2. **Use a custom hook that enforces cleanup:**
   ```typescript
   function useFirestoreDoc<T>(docRef: DocumentReference) {
     const [data, setData] = useState<T | null>(null);
     const [loading, setLoading] = useState(true);

     useEffect(() => {
       setLoading(true);
       const unsubscribe = onSnapshot(docRef, (snapshot) => {
         setData(snapshot.exists() ? snapshot.data() as T : null);
         setLoading(false);
       });
       return () => {
         unsubscribe();
         setLoading(true);
       };
     }, [docRef.path]); // Re-subscribe when path changes

     return { data, loading };
   }
   ```

3. **Be careful with dependency arrays.** If `docRef` is recreated on every render (common mistake: `doc(db, 'projects', id)` inline), the listener is torn down and recreated every render. Memoize the reference:
   ```typescript
   const projectRef = useMemo(() => doc(db, 'projects', projectId), [projectId]);
   ```

**Detection:**
- Chrome DevTools -> Memory tab shows increasing heap size after navigations
- Network tab shows multiple active WebSocket connections to Firestore
- Console warnings about state updates on unmounted components
- App becomes slower after navigating between multiple projects

**Recovery cost:** LOW (1-2 hours) if caught early; MEDIUM (4 hours) if listeners are scattered across many components

**Phase to address:** Phase 3 (Firestore) -- establish the listener pattern in the first Firestore hook, reuse everywhere

---

### Pitfall 11: Next.js Proxy/BFF Adds Latency to Export Service Communication

**What goes wrong:**
The current app communicates directly with the Fastify export service (`localhost:3001`) via REST for job submission and WebSocket for progress. After Next.js migration, if the export service runs on a different domain, the browser encounters CORS issues. The common fix is to proxy through Next.js API routes.

But proxying adds a network hop:
```
Browser -> Next.js server -> Fastify export service -> Next.js server -> Browser
```

For the REST job submission endpoint, this is fine (single request-response). But for WebSocket progress streaming, proxying WebSocket connections through Next.js adds complexity and latency. Next.js API routes do not natively support WebSocket upgrade.

**Additionally:** If deploying on Vercel, serverless functions have execution time limits (10-60 seconds on free/pro plans). A WebSocket proxy that runs for 15+ minutes during export will be killed.

**Consequences:**
- WebSocket progress streaming breaks when proxied through Next.js
- Vercel serverless functions timeout during long exports
- Double network latency for every progress update
- Complex WebSocket proxy code to maintain

**Prevention:**
1. **Keep the WebSocket connection direct from browser to export service:**
   ```typescript
   // Submit job through Next.js API route (handles auth)
   const { jobId, wsUrl } = await fetch('/api/export', { method: 'POST', body }).then(r => r.json());

   // Connect WebSocket directly to export service (separate domain)
   const ws = new WebSocket(wsUrl); // e.g., wss://export.manuscript.app/ws/job123
   ```

2. **Configure CORS on the Fastify export service instead of proxying:**
   ```typescript
   // Fastify export service
   fastify.register(cors, {
     origin: ['https://manuscript.app', 'http://localhost:3000'],
     credentials: true,
   });
   ```

3. **Use the Next.js API route only for the initial authenticated job submission,** then hand off the WebSocket URL for direct communication:
   ```typescript
   // app/api/export/route.ts
   export async function POST(req) {
     // Verify auth, validate request
     // Forward to export service with internal auth
     const result = await submitToExportService(req);
     return Response.json({
       jobId: result.jobId,
       wsUrl: `wss://export-service.fly.dev/api/export/${result.jobId}/ws`,
     });
   }
   ```

4. **If self-hosting (not Vercel), consider running Next.js and Fastify on the same machine** with different ports, sharing the same domain via reverse proxy (Caddy/nginx). This eliminates CORS entirely.

**Detection:**
- WebSocket connections fail or timeout
- Progress updates stop arriving mid-export
- Vercel function logs show timeout errors
- Double latency visible in progress update frequency

**Recovery cost:** LOW (2-3 hours) if planned upfront; HIGH (8+ hours) if WebSocket proxy is built and then discovered to not work

**Phase to address:** Phase 2/3 -- decide on the export service communication architecture BEFORE implementing

---

## Minor Pitfalls

Mistakes that cause annoyance or minor quality issues but are easily fixable.

---

### Pitfall 12: `import.meta.env` References Break Next.js Build

**What goes wrong:**
The current codebase uses `import.meta.env.DEV` (App.tsx lines 185, 198, 255) and would use `import.meta.env.VITE_*` for any environment variables. Next.js does not support `import.meta.env` -- it uses `process.env` with `NEXT_PUBLIC_` prefix for client-exposed variables.

**Prevention:**
Global find-and-replace:
- `import.meta.env.DEV` -> `process.env.NODE_ENV !== 'production'`
- `import.meta.env.PROD` -> `process.env.NODE_ENV === 'production'`
- `import.meta.env.VITE_` -> `process.env.NEXT_PUBLIC_`
- Remove `vite-env.d.ts`

**Detection:** TypeScript errors during `next build`: "Property 'env' does not exist on type 'ImportMeta'"

**Recovery cost:** LOW (30 minutes)

**Phase to address:** Phase 1 (migration) -- mechanical find-and-replace

---

### Pitfall 13: Static Assets in Wrong Location

**What goes wrong:**
Vite serves static assets from `src/assets/` (with import transforms) and `public/`. Next.js serves static assets from `public/` only. Any asset imports from `src/assets/` will need path updates, and Next.js static image imports return an object `{ src, width, height }` instead of a string URL.

The current app appears to use minimal static assets (SVG borders defined in code, Verovio fonts embedded in WASM), but any future assets added during the migration need to follow Next.js conventions.

**Prevention:**
- Move all static files to `public/`
- Update image imports: `import logo from './logo.png'` returns `{ src: '/logo.png', width: 100, height: 50 }`, so use `logo.src` for `<img>` tags
- Or use Next.js `<Image>` component for automatic optimization

**Recovery cost:** LOW (1 hour)

**Phase to address:** Phase 1 (migration)

---

### Pitfall 14: Tailwind CSS v4 Configuration Differences

**What goes wrong:**
The current app uses Tailwind CSS v4 with `@tailwindcss/postcss`. Next.js has built-in Tailwind support but may expect a different configuration approach (e.g., `tailwind.config.js` for v3, or CSS-first config for v4). The `@tailwindcss/postcss` plugin needs to be configured in `postcss.config.js` which Next.js reads automatically.

**Prevention:**
- Keep `postcss.config.js` with `@tailwindcss/postcss` plugin (Next.js reads it automatically)
- Ensure `index.css` with `@import "tailwindcss"` is imported in the root layout
- Test that Tailwind classes render correctly after migration

**Recovery cost:** LOW (1 hour)

**Phase to address:** Phase 1 (migration) -- verify CSS renders correctly in the first build

---

### Pitfall 15: Development Server Port Conflicts

**What goes wrong:**
Next.js dev server defaults to port 3000. The Fastify export service runs on port 3001. If the developer accidentally runs both on the same port, or if hardcoded URLs reference `localhost:3000` (previously Vite's default port), connections fail.

**Prevention:**
- Document the port allocation: Next.js on 3000, Fastify on 3001
- Use environment variables for service URLs, not hardcoded ports
- Update all hardcoded references from Vite's dev server to Next.js

**Recovery cost:** LOW (15 minutes)

**Phase to address:** Phase 1 (migration) -- update during initial setup

---

### Pitfall 16: Firebase Hosting Strips Cookies Except `__session`

**What goes wrong:**
If deploying to Firebase Hosting (even partially, for CDN), Firebase Hosting strips ALL cookies from incoming requests except the cookie named `__session`. This means session cookies named `session` or `auth-token` will never reach your server-side code.

**Prevention:**
- If using Firebase Hosting: name the session cookie `__session`
- If self-hosting (Vercel, Fly.io, etc.): name it whatever you want
- Decide the hosting platform BEFORE implementing auth cookies

**Recovery cost:** LOW (30 minutes) -- rename the cookie

**Phase to address:** Phase 2 (Firebase Auth) -- choose hosting platform first

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Severity | Mitigation |
|-------------|---------------|----------|------------|
| Vite-to-Next.js migration | Verovio WASM crashes SSR (#1) | Critical | `dynamic()` with `ssr: false`, webpack asyncWebAssembly config |
| Vite-to-Next.js migration | Browser API "window not defined" (#2) | Critical | Wrap entire app in client-only dynamic import initially |
| Vite-to-Next.js migration | `import.meta.env` breaks build (#12) | Minor | Global find-and-replace to `process.env` |
| Vite-to-Next.js migration | Static asset paths wrong (#13) | Minor | Move to `public/`, update import references |
| Vite-to-Next.js migration | Tailwind CSS v4 config differences (#14) | Minor | Keep PostCSS config, verify CSS renders |
| Vite-to-Next.js migration | Zustand Map hydration (#5) | Critical | Convert Map to Record before adding persistence |
| Firebase Auth setup | Admin SDK leaks to client (#3) | Critical | Use `server-only` package, separate client/server files |
| Firebase Auth setup | SSR has no auth session (#4) | Critical | Session cookies, middleware protection |
| Firebase Auth setup | Firebase Hosting strips cookies (#16) | Minor | Name cookie `__session` or don't use Firebase Hosting |
| Firestore integration | Auto-save race conditions (#6) | Critical | 1.5s debounce, merge writes, version field, distinguish local/remote |
| Firestore integration | Security rules too permissive (#7) | Moderate | Start deny-all, test with emulator |
| Firestore integration | onSnapshot listener leaks (#10) | Moderate | Always return unsubscribe from useEffect, custom hook |
| Firebase Storage | Large file upload fails (#8) | Moderate | Direct client upload with `uploadBytesResumable` |
| Export service integration | Export service can't auth users (#9) | Moderate | Pass ID token, verify with Admin SDK in Fastify |
| Export service integration | WebSocket proxy doesn't work (#11) | Moderate | Direct WebSocket, proxy only REST submission |

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| #1 WASM SSR crash | MEDIUM (4-8h) | Add dynamic imports, configure webpack, remove Vite plugins |
| #2 window not defined | LOW-MEDIUM (2-6h) | Audit browser API usage, add guards or dynamic imports |
| #3 Admin SDK leak | MEDIUM (4-6h) | Restructure imports, add server-only package |
| #4 SSR auth missing | MEDIUM (6-8h) | Implement session cookie flow, middleware |
| #5 Zustand hydration | LOW (2-4h) | Convert Map to Record, add hydration boundary |
| #6 Auto-save races | HIGH (8-12h) | Redesign save pattern, add version control |
| #7 Security rules | LOW (2-4h) | Write proper rules, test with emulator |
| #8 Large file upload | LOW (2-3h) | Switch to direct client upload |
| #9 Export auth | MEDIUM (4-6h) | Add Admin SDK to Fastify, update client |
| #10 Listener leaks | LOW (1-2h) | Add unsubscribe to useEffect returns |
| #11 WebSocket proxy | LOW (2-3h) | Direct WebSocket connection |
| #12 import.meta.env | LOW (30min) | Find-and-replace |
| #13 Static assets | LOW (1h) | Move files, update paths |
| #14 Tailwind config | LOW (1h) | Verify PostCSS config |
| #15 Port conflicts | LOW (15min) | Update hardcoded ports |
| #16 Cookie stripping | LOW (30min) | Rename cookie |

---

## Quality Gate Checklist

Before declaring each phase complete, verify:

**Phase 1 -- Vite-to-Next.js Migration:**
- [ ] `next build` succeeds without WASM errors
- [ ] Verovio renders music notation correctly in the browser
- [ ] No "window is not defined" errors in server logs
- [ ] No hydration mismatch warnings in browser console
- [ ] All `import.meta.env` references replaced with `process.env`
- [ ] Zustand stores work without Map serialization issues
- [ ] Tailwind CSS classes render correctly
- [ ] Existing Fastify export service still receives requests

**Phase 2 -- Firebase Auth:**
- [ ] `firebase-admin` NOT present in client bundle (check with bundle analyzer)
- [ ] Login/logout works in the browser
- [ ] Session cookie set on login, cleared on logout
- [ ] Server Components/middleware can verify auth state
- [ ] Protected routes redirect unauthenticated users
- [ ] Export service validates Firebase ID tokens
- [ ] Security rules deny unauthenticated access

**Phase 3 -- Firestore + Storage:**
- [ ] Project data saves to Firestore with debounced auto-save
- [ ] No write loop when onSnapshot fires after local save
- [ ] Audio files >32MB upload successfully via resumable upload
- [ ] Firestore security rules tested with emulator
- [ ] onSnapshot listeners cleaned up on navigation (check Memory tab)
- [ ] File upload shows progress to user
- [ ] Storage security rules enforce file type and size limits

---

## Sources

### Primary Sources (HIGH confidence)

**Official Next.js Migration Guide:**
- [Migrating from Vite to Next.js](https://nextjs.org/docs/app/guides/migrating/from-vite) -- Step-by-step migration, `output: 'export'` SPA mode, `dynamic()` with `ssr: false` pattern

**Official Next.js Documentation:**
- [Dynamic WASM compilation not available in Middlewares](https://nextjs.org/docs/messages/middleware-dynamic-wasm-compilation) -- WASM constraints in Next.js
- [Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components) -- `'use client'` does NOT mean client-only
- [Building APIs with Next.js](https://nextjs.org/blog/building-apis-with-nextjs) -- Route Handlers, proxying

**Official Firebase Documentation:**
- [Manage Session Cookies](https://firebase.google.com/docs/auth/admin/manage-cookies) -- 14-day max expiration, cookie creation
- [Transaction Data Contention](https://firebase.google.com/docs/firestore/transaction-data-contention) -- Write conflicts, serialization
- [Usage and Limits](https://firebase.google.com/docs/firestore/quotas) -- 1 write/second per document soft limit
- [Fix Insecure Rules](https://firebase.google.com/docs/firestore/enterprise/security/insecure-rules) -- Common security rule mistakes
- [Best Practices for Cloud Firestore](https://firebase.google.com/docs/firestore/best-practices) -- Data modeling, rate limits

**Codebase Analysis:**
- `src/lib/verovioService.ts` -- WASM module loading pattern (top-level import of `verovio/wasm`)
- `src/hooks/useVerovio.ts` -- Async toolkit creation, browser-only rendering
- `src/stores/syncStore.ts` -- `Map<string, number>` for anchors (serialization issue)
- `src/App.tsx` -- `window.location.search` access, `import.meta.env.DEV`, WebSocket creation
- `src/main.tsx` -- `window.__EXPORT_CONFIG__` access, `createRoot` (client-only API)
- `src/types/global.d.ts` -- Window API extensions for Puppeteer integration

### Secondary Sources (MEDIUM confidence)

**WASM + Next.js Integration:**
- [Webpack 5 breaks dynamic WASM import for SSR (Issue #25852)](https://github.com/vercel/next.js/issues/25852) -- Known issue, `ssr: false` workaround
- [Next.js WebAssembly Integration](https://www.restack.io/docs/nextjs-knowledge-nextjs-webassembly-integration) -- webpack experiments config
- [Resolving WASM Module Loading Errors in Next.js v16 Turbopack](https://codenote.net/en/posts/resolve-wasm-module-turbopack-nextjs-vercel/) -- Turbopack-specific concerns

**Firebase + Next.js:**
- [Authenticated SSR with Next.js and Firebase](https://colinhacks.com/essays/nextjs-firebase-authentication) -- Session cookie pattern
- [Using Firebase Admin SDK with Next.js](https://www.jamesshopland.com/blog/nextjs-firebase-admin-sdk) -- `server-only` package, import separation
- [Firebase Auth Integration with Next.js](https://firebase.google.com/codelabs/firebase-nextjs) -- Official codelab

**Zustand + Next.js:**
- [Fix Next.js Hydration Error with Zustand](https://medium.com/@koalamango/fix-next-js-hydration-error-with-zustand-state-management-0ce51a0176ad) -- Hydration boundary pattern
- [Zustand Persist Middleware incompatible with Map and Set (Issue #618)](https://github.com/pmndrs/zustand/issues/618) -- Official acknowledgment of serialization issue

**Firestore Patterns:**
- [Race Conditions in Firestore](https://medium.com/quintoandar-tech-blog/race-conditions-in-firestore-how-to-solve-it-5d6ff9e69ba7) -- Concurrent write patterns
- [Firestore Rate Limiting](https://fireship.io/lessons/how-to-rate-limit-writes-firestore/) -- Security rules for rate limiting
- [Snapshot Listener Race Condition (Issue #5768)](https://github.com/firebase/firebase-js-sdk/issues/5768) -- Listener vs write timing

### Tertiary Sources (LOW confidence)

**Next.js Hydration:**
- [Next.js Hydration Errors in 2026](https://medium.com/@blogs-world/next-js-hydration-errors-in-2026-the-real-causes-fixes-and-prevention-checklist-4a8304d53702) -- General hydration troubleshooting
- [How to Use Zustand with Next.js 15](https://www.dimasroger.com/blog/how-to-use-zustand-with-next-js-15) -- Setup patterns

**Firebase Storage:**
- [Upload file larger than 2GB (Issue #6524)](https://github.com/firebase/firebase-js-sdk/issues/6524) -- Client SDK limit discussion
- [Limiting Firebase Storage space per customer](https://makerkit.dev/blog/tutorials/limit-folder-size-firebase-storage) -- Per-user quotas

---

*Research completed: 2026-02-11*
*Domain: Vite SPA to Next.js migration with Firebase Auth, Firestore, and Storage integration*
*Focus: Pitfalls specific to WASM in SSR, Firebase session management, auto-save patterns, file uploads, and separate backend service integration*
