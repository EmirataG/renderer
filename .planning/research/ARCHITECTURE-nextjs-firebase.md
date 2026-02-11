# Architecture: Next.js Migration + Firebase Integration

**Domain:** Migrating Vite SPA to Next.js App Router, adding Firebase Auth/Firestore/Storage with debounced auto-save
**Researched:** 2026-02-11
**Confidence:** MEDIUM-HIGH

---

## Executive Summary

The Manuscript Renderer is a 100% client-side React app. Every component uses `useState`, `useEffect`, `useRef`, DOM APIs, WASM, or browser audio. This means the Next.js migration is architecturally a **client-component-dominant SPA with server shells** -- not a traditional Next.js app that leverages Server Components for data fetching. The migration adds routing and infrastructure (auth, persistence, dashboard) around the existing unchanged renderer core.

The critical integration constraint is Verovio WASM: it cannot run during SSR. The entire renderer subtree must be loaded via `dynamic(() => import(...), { ssr: false })`. This is the single most important architectural decision and is well-supported by the official Next.js migration guide.

Firebase integration is client-side only (no Admin SDK on the server). Auth uses `onAuthStateChanged` in a client-side `AuthProvider`. Firestore queries run client-side with security rules protecting per-user data. Auto-save uses debounced `setDoc` with `{ merge: true }` -- UI updates remain instantaneous via local state (optimistic by default).

---

## Recommended Architecture

### System Diagram

```
                     Next.js App (App Router)
                    +--------------------------+
                    |  layout.tsx (RSC)         |
                    |  - <html>, <body>         |
                    |  - Metadata API           |
                    |  - AuthProvider (CC)      |
                    +-----------+--------------+
                                |
          +---------------------+---------------------+
          |                     |                     |
  /login                 /dashboard           /project/[id]
  page.tsx (RSC)         page.tsx (RSC)        page.tsx (RSC)
  GoogleSignIn (CC)      ProjectGrid (CC)      client.tsx (CC)
                         CreateModal (CC)           |
                                              dynamic import
                                              ssr: false
                                                    |
                                            ProjectEditor (CC)
                                            - useProject hook
                                            - useAutoSave hook
                                                    |
                                              App.tsx (CC, existing)
                                              - RegularRenderer
                                              - SyncEditor
                                              - Inspector sidebar
                                              - All current state
                                                    |
                                    +---------------+---------------+
                                    |               |               |
                              Verovio WASM    Zustand stores   Export service
                              (browser only)  (browser only)   (separate Fastify)

CC = Client Component ("use client")
RSC = React Server Component
```

### Production Deployment Topology

```
  Vercel / hosting            Fly.io / VPS
  +-----------------+        +-------------------+
  | Next.js App     |  HTTP  | Export Service     |
  | (Static + SSR)  | -----> | (Fastify)          |
  |                 |  WS    | Puppeteer + FFmpeg |
  +-----------------+        +-------------------+
         |
    Firebase SDK (client-side)
         |
  +-----------------+
  | Firebase         |
  | - Auth           |
  | - Firestore      |
  | - Storage        |
  +-----------------+
```

---

## Component Classification: Server vs Client

**Confidence: HIGH** (based on official Next.js migration guide + codebase analysis)

Every existing component uses `useState`, `useEffect`, `useRef`, DOM APIs, or browser APIs (Audio, Image, WebSocket, WASM). Every existing component must be a Client Component with `"use client"`. There are zero candidates for Server Components among existing code.

New Server Components are limited to:
- `layout.tsx` (root layout, HTML shell, metadata)
- `page.tsx` files (thin shells that render Client Components)
- Route-specific loading/error boundaries

| Component | Classification | Reason |
|-----------|---------------|--------|
| `App.tsx` | Client (`"use client"`) | useState, useRef, useEffect, WebSocket, Audio API |
| `RegularRenderer` | Client | useVerovio (WASM), requestAnimationFrame, DOM queries |
| `SingleLineRenderer` | Client | useVerovio (WASM), DOM queries |
| `SyncEditor` | Client | useVerovio (WASM), audio playback, DOM events |
| `ScoreRegionEditor` | Client | react-rnd (drag/resize), DOM measurement |
| `UploadDropZone` | Client | File API, drag events |
| `BorderPicker` | Client | useState |
| `TimestampInput` | Client | useState, controlled input |
| `Toast/ToastProvider` | Client | useState, context |
| Zustand stores | Client-only | In-memory state management |
| Verovio service | Client-only | WASM module, must not run on server |
| **NEW: AuthProvider** | Client | Firebase Auth, onAuthStateChanged |
| **NEW: ProjectGrid** | Client | Firestore queries, real-time updates |
| **NEW: ProjectEditor** | Client | Wraps App.tsx, adds auto-save |
| **NEW: GoogleSignInButton** | Client | Firebase Auth signInWithPopup |
| **NEW: layout.tsx** | **Server** | HTML shell, metadata |
| **NEW: page.tsx files** | **Server** | Thin shells, render Client Components |

---

## Critical Integration Point: Verovio WASM + Next.js

**Confidence: HIGH** (verified against Next.js official migration guide + WASM ecosystem documentation)

Verovio loads a WASM binary via `createVerovioModule()` from `verovio/wasm`. This uses dynamic `import()` and instantiates WebAssembly, which cannot run during SSR (Node.js server-side environment does not match the browser WASM hosting model that Verovio expects).

### Solution: Dynamic Import with `ssr: false`

The project editor page dynamically imports the main App component with SSR disabled. This is the pattern recommended by the official Next.js Vite migration guide.

```typescript
// src/app/project/[id]/client.tsx
"use client";

import dynamic from "next/dynamic";

// Prevent Next.js from attempting to render App on the server.
// Verovio WASM, Audio API, and DOM manipulation all require browser environment.
const App = dynamic(() => import("@/components/App"), { ssr: false });

export function ProjectEditorClient({ projectId }: { projectId: string }) {
  return <App projectId={projectId} />;
}
```

### Next.js Webpack Configuration for WASM

The existing Vite app uses `vite-plugin-wasm` and `vite-plugin-top-level-await`. In Next.js, enable webpack's async WASM experiments instead.

```javascript
// next.config.mjs
/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { isServer }) => {
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
      layers: true,
    };

    // Control where WASM files are output
    config.output.webassemblyModuleFilename =
      isServer
        ? "./../static/wasm/[modulehash].wasm"
        : "static/wasm/[modulehash].wasm";

    return config;
  },
};

export default nextConfig;
```

### verovioService.ts: No Changes Needed

The existing `verovioService.ts` uses lazy initialization (`ensureModule()`) and runs entirely in the browser. Since the component tree containing it is dynamically imported with `ssr: false`, the WASM module will never be loaded during SSR. No modifications required.

### What NOT To Do

- Do NOT try to make Verovio work in Server Components
- Do NOT attempt server-side rendering of scores (WASM + DOM queries required)
- Do NOT use `vite-plugin-wasm` or `vite-plugin-top-level-await` (Vite-specific, removed during migration)
- Do NOT use Turbopack during development (WASM support is less mature than webpack; use `next dev --webpack` if issues arise)

---

## Firebase SDK Integration Architecture

**Confidence: MEDIUM-HIGH** (based on Firebase official docs + verified community patterns)

### Initialization Pattern: Singleton Client-Side Module

Firebase SDK is initialized once as a module singleton. Only imported from Client Components.

```typescript
// src/lib/firebase.ts
import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET!,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID!,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
};

// Prevent duplicate initialization (hot reload, multiple imports)
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
```

**Why client-side only (no Admin SDK):**
- The user's browser already has the auth token for Firestore security rules
- Client-side queries go directly to Firestore (no server hop)
- Server-side queries would require Firebase Admin SDK + service account credentials
- For this app, there is no data that needs server-side fetching before render

### Environment Variables

All Firebase config values use `NEXT_PUBLIC_` prefix to be available client-side:

```bash
# .env.local
NEXT_PUBLIC_FIREBASE_API_KEY=AIza...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=manuscript-xxx.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=manuscript-xxx
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=manuscript-xxx.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
NEXT_PUBLIC_FIREBASE_APP_ID=1:123456789:web:abc123
```

### Authentication Flow

```
User visits /login
  -> GoogleSignInButton (CC) renders
  -> User clicks "Sign in with Google"
  -> signInWithPopup(auth, new GoogleAuthProvider())
  -> onAuthStateChanged fires in AuthProvider
  -> AuthProvider sets user state
  -> Router redirects to /dashboard

User visits any protected route (unauthenticated)
  -> AuthProvider detects no user (loading complete, user is null)
  -> Redirect to /login

User visits /project/[id]
  -> AuthProvider confirms user is authenticated
  -> ProjectEditor loads project data from Firestore
  -> App.tsx renders with project data as initial state
```

### AuthProvider Component

```typescript
// src/components/AuthProvider.tsx
"use client";

import { useEffect, useState, createContext, useContext } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useRouter, usePathname } from "next/navigation";

interface AuthContextType {
  user: User | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({ user: null, loading: true });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);

      if (!firebaseUser && pathname !== "/login") {
        router.push("/login");
      }
    });
    return unsubscribe;
  }, [router, pathname]);

  if (loading) {
    return null; // Or a loading skeleton
  }

  return (
    <AuthContext.Provider value={{ user, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
```

---

## Data Model: Firestore Document Structure

**Confidence: MEDIUM** (designed from codebase analysis of existing state; Firestore patterns well-established)

### Collection: `projects`

Each project document stores all settings currently held as `useState` in `App.tsx`. Files (MusicXML, audio, background image) are stored in Firebase Storage with references in the document.

```typescript
// Firestore document: /projects/{projectId}
interface ProjectDocument {
  // Metadata
  uid: string;                    // Owner's Firebase Auth UID
  name: string;                   // User-facing project name
  createdAt: Timestamp;
  updatedAt: Timestamp;

  // File references (Firebase Storage paths)
  files: {
    musicXml: {
      storagePath: string;        // e.g., "projects/{projectId}/score.musicxml"
      fileName: string;           // Original filename
      measureCount: number;
    };
    audio: {
      storagePath: string;        // e.g., "projects/{projectId}/audio.mp3"
      fileName: string;
    };
    bgImage?: {
      storagePath: string;        // e.g., "projects/{projectId}/bg.png"
      fileName: string;
    };
  };

  // View mode (chosen at creation, immutable)
  viewMode: "page" | "single-line";

  // Settings (all auto-saved on change)
  settings: {
    fps: number;                          // Default: 30
    scoreColor: string;                   // Default: "#000000"
    scoreShadowDistance: number;           // Default: 0
    hideUnplayedNotes: boolean;           // Default: true
    smoothReveal: boolean;                // Default: true
    scoreScale: number;                   // Default: 1.0
    musicFont: string;                    // Default: "Bravura"
    scoreBorder: string;                  // Default: "none"
    hideLabels: boolean;                  // Default: false
    scoreRegion: {                        // null = full frame
      x: number;
      y: number;
      width: number;
      height: number;
    } | null;
    activeNoteheadColor: string | null;   // Default: "#000000"
    activeNoteheadScale: number;          // Default: 1.2
    activeNoteheadEntryMs: number;        // Default: 50
    activeNoteheadHoldMs: number;         // Default: 200
    activeNoteheadExitMs: number;         // Default: 500
    colorFullNote: boolean;               // Default: false
  };

  // Sync anchors: eventId -> timestampSeconds
  // Firestore doesn't support JS Map; store as plain object
  syncAnchors: Record<string, number>;
}
```

### Why a Single Document (Not Subcollections)

The total data per project is small: ~50 fields of settings + a few hundred sync anchors (at most a few KB). Firestore charges per read, not per document size. A single document means one read to load the project and one write per auto-save. Subcollections would multiply reads and add complexity.

The one concern is sync anchors: a large score could have 500+ anchors. Serialized as a Record (JSON object), this is still well under Firestore's 1MB document limit. A 500-anchor map is approximately 10KB of JSON.

### Firebase Storage Structure

```
projects/
  {projectId}/
    score.musicxml        (or .xml, .mxl, .mei)
    audio.mp3             (or .wav)
    bg.png                (optional, changeable after creation)
```

### Security Rules

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /projects/{projectId} {
      allow read, write: if request.auth != null
                         && request.auth.uid == resource.data.uid;
      allow create: if request.auth != null
                    && request.auth.uid == request.resource.data.uid;
    }
  }
}
```

```javascript
service firebase.storage {
  match /b/{bucket}/o {
    match /projects/{projectId}/{allPaths=**} {
      allow read, write: if request.auth != null;
      // Note: In production, validate that the user owns the project.
      // This requires either a custom claim or a Firestore lookup.
      // For MVP, any authenticated user can access their storage path.
    }
  }
}
```

---

## Debounced Auto-Save Architecture

**Confidence: HIGH** (standard React pattern, well-suited to existing state management)

### Pattern: Watch Local State + Debounce + Firestore setDoc(merge)

The existing app holds all mutable state in `App.tsx` useState variables and `syncStore` (Zustand). The auto-save layer observes changes and writes to Firestore after a debounce period.

```
User changes setting (e.g., drags color slider)
  -> useState setter fires
  -> Component re-renders (immediate visual feedback)
  -> useAutoSave hook detects change in data prop
  -> Debounce timer starts (1500ms)
  -> If another change comes within 1500ms, timer resets
  -> Timer expires -> setDoc(projectRef, { settings: {...} }, { merge: true })
  -> updatedAt timestamp refreshed server-side
```

### Critical Design Decision: Do NOT Move useState to Zustand

**Why not:** App.tsx has 20+ useState calls. Moving them all to Zustand would be a massive refactor with high regression risk. The existing component works. The auto-save layer should observe state, not own it.

**Instead:** The `useAutoSave` hook accepts a data object built from existing useState values. It compares serialized snapshots and writes deltas when they change.

```typescript
// src/hooks/useAutoSave.ts
"use client";

import { useEffect, useRef, useCallback } from "react";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";

interface AutoSaveOptions {
  projectId: string;
  data: Record<string, unknown>;
  debounceMs?: number;
  enabled?: boolean;    // false during initial load from Firestore
}

export function useAutoSave({
  projectId,
  data,
  debounceMs = 1500,
  enabled = true,
}: AutoSaveOptions) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFirstRender = useRef(true);
  const lastSavedRef = useRef<string>("");

  const save = useCallback(
    async (dataToSave: Record<string, unknown>) => {
      try {
        const projectRef = doc(db, "projects", projectId);
        await setDoc(
          projectRef,
          { ...dataToSave, updatedAt: serverTimestamp() },
          { merge: true }
        );
      } catch (error) {
        console.error("[useAutoSave] Failed to save:", error);
      }
    },
    [projectId]
  );

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      lastSavedRef.current = JSON.stringify(data);
      return;
    }
    if (!enabled) return;

    const serialized = JSON.stringify(data);
    if (serialized === lastSavedRef.current) return;

    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(() => {
      lastSavedRef.current = serialized;
      save(data);
    }, debounceMs);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [data, debounceMs, enabled, save]);
}
```

### Sync Anchors Auto-Save (Zustand Subscription)

The `syncStore` stores anchors as a `Map<string, number>`. Subscribe to Zustand changes separately:

```typescript
// In ProjectEditor wrapper component
useEffect(() => {
  if (!projectId || !enabled) return;

  const unsubscribe = useSyncStore.subscribe(
    (state) => state.anchors,
    (anchors) => {
      if (anchorTimerRef.current) clearTimeout(anchorTimerRef.current);
      anchorTimerRef.current = setTimeout(() => {
        const projectRef = doc(db, "projects", projectId);
        setDoc(
          projectRef,
          {
            syncAnchors: Object.fromEntries(anchors),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      }, 1500);
    }
  );

  return unsubscribe;
}, [projectId, enabled]);
```

### What Gets Auto-Saved vs What Doesn't

| Data | Auto-Save? | Rationale |
|------|-----------|-----------|
| Settings (fps, color, font, scale, etc.) | YES | User expects persistence |
| Score region (x, y, w, h) | YES | User-configured layout |
| Sync anchors (Map) | YES | Core project data, labor-intensive to create |
| Background image | YES (on upload) | Uploaded immediately to Storage, ref saved to Firestore |
| MusicXML file | NO (immutable) | Set at project creation only |
| Audio file | NO (immutable) | Set at project creation only |
| Playback state (isPlaying) | NO | Ephemeral, session-only |
| Export state | NO | Ephemeral, session-only |
| Current view (preview/sync) | NO | Ephemeral, session-only |
| Zoom/pan transform | NO | Ephemeral, session-only |
| Score region editor (isEditingRegion) | NO | Ephemeral UI state |

---

## Component Boundaries: New vs Modified vs Unchanged

### New Components

| Component | Location | Purpose |
|-----------|----------|---------|
| `AuthProvider` | `src/components/AuthProvider.tsx` | Firebase Auth listener, redirect logic |
| `GoogleSignInButton` | `src/components/GoogleSignInButton.tsx` | Sign-in UI + Firebase popup auth |
| `ProjectGrid` | `src/components/ProjectGrid.tsx` | Dashboard grid of project cards |
| `ProjectCard` | `src/components/ProjectCard.tsx` | Individual card with thumbnail, name, date |
| `CreateProjectModal` | `src/components/CreateProjectModal.tsx` | Upload score + audio, set name, choose view mode |
| `ProjectEditor` | `src/components/ProjectEditor.tsx` | Wrapper: loads from Firestore, hydrates App, auto-saves |
| `useAutoSave` | `src/hooks/useAutoSave.ts` | Debounced Firestore persistence |
| `useProject` | `src/hooks/useProject.ts` | Load project data + files from Firestore/Storage |
| `firebase.ts` | `src/lib/firebase.ts` | Firebase SDK singleton initialization |

### Modified Components

| Component | Change | Scope of Change |
|-----------|--------|-----------------|
| `App.tsx` | Accept initial state as props (optional), accept `projectId` prop | Add props interface, use props as useState initial values when provided |
| `App.tsx` | Hide score/audio upload when in project mode (files are immutable) | Conditional rendering on `projectId` presence |
| `UploadDropZone` | Allow background-image-only mode when score/audio are immutable | Add `mode` prop or conditional |
| `syncStore.ts` | Add `hydrate` action to load anchors from Firestore data | One new action: `hydrate(record)` |
| `exportClient.ts` | Replace `import.meta.env.DEV` with `process.env.NODE_ENV` | Two line changes |
| `main.tsx` | DELETED (replaced by Next.js app directory) | Full removal |
| `vite.config.ts` | DELETED (replaced by next.config.mjs) | Full removal |
| `vite-env.d.ts` | DELETED (Vite-specific types) | Full removal |

### Unchanged Components (Zero Modifications)

- `RegularRenderer.tsx` -- all existing functionality preserved
- `SingleLineRenderer.tsx`
- `SyncEditor.tsx` -- receives xml and audioUrl as props, unchanged
- `ScoreRegionEditor.tsx`
- `BorderPicker.tsx`
- `TimestampInput.tsx`
- `Toast.tsx` / `ToastProvider`
- `verovioService.ts`
- `useVerovio.ts`
- `useSingleLineVerovio.ts`
- `getEvents.ts`
- `interpolation.ts`
- `animationController.ts`
- `noteAnimation.ts`
- `fileValidation.ts`
- `musicxmlValidation.ts`
- `eventStore.ts`
- `borders/index.tsx`
- `types/score.ts`
- `RenderApp.tsx` -- used by export service, unchanged

---

## Data Flow: Project Loading

```
1. User clicks project card on dashboard
   -> router.push(`/project/${projectId}`)

2. /project/[id]/page.tsx (Server Component)
   -> Extracts projectId from route params
   -> Renders ProjectEditorClient with projectId

3. ProjectEditorClient (Client Component, dynamic import ssr:false)
   -> Calls useProject(projectId) hook

4. useProject hook:
   a. getDoc(doc(db, "projects", projectId))     -> settings, syncAnchors, file refs
   b. Verify uid matches current user             -> security check
   c. getDownloadURL(ref(storage, files.musicXml.storagePath))  -> musicXmlUrl
   d. fetch(musicXmlUrl).then(r => r.text())     -> musicXml string content
   e. getDownloadURL(ref(storage, files.audio.storagePath))     -> audioUrl
   f. (if exists) getDownloadURL(ref(storage, files.bgImage.storagePath))  -> bgUrl
   g. Return { settings, syncAnchors, musicXml, audioUrl, bgUrl, loading, error }

5. ProjectEditor hydrates:
   a. useSyncStore.getState().hydrate(syncAnchors)   -> loads anchors into Zustand
   b. Pass settings + file data as initial props to App.tsx
   c. Set enabled=true on useAutoSave after hydration

6. App.tsx renders with initial state from props
   -> All subsequent changes are local (useState) + debounced auto-save to Firestore
```

### Data Flow: Project Creation

```
1. User clicks "New Project" on dashboard
   -> CreateProjectModal opens

2. User fills form:
   - Project name (text input)
   - Score file (MusicXML upload, validated)
   - Audio file (MP3/WAV upload)
   - View mode: "Page view" (default) or "Single line" (disabled/coming soon)

3. On submit:
   a. Generate projectId (Firestore auto-ID or UUID)
   b. Upload score file to Storage: projects/{projectId}/score.{ext}
   c. Upload audio file to Storage: projects/{projectId}/audio.{ext}
   d. Create Firestore document with default settings + file refs
   e. Navigate to /project/{projectId}

4. ProjectEditor loads, finds project in Firestore
   -> Normal project loading flow
```

### Data Flow: Background Image Change (Post-Creation)

```
1. User drops new image on UploadDropZone (in project mode)

2. Local state updates immediately (optimistic):
   -> setBgUrl(URL.createObjectURL(file))
   -> UI shows new background instantly

3. Upload to Firebase Storage:
   uploadBytes(ref(storage, `projects/${projectId}/bg.${ext}`), file)
   -> Overwrites previous background if exists

4. Update Firestore document:
   setDoc(projectRef, {
     files: { bgImage: { storagePath, fileName } },
     updatedAt: serverTimestamp(),
   }, { merge: true })
```

---

## File System Layout: Next.js App Directory

```
src/
  app/
    layout.tsx                    # Root layout (RSC) - HTML shell, AuthProvider
    page.tsx                      # Redirect: / -> /dashboard or /login
    login/
      page.tsx                    # Login page (RSC shell)
    dashboard/
      page.tsx                    # Dashboard page (RSC shell)
    project/
      [id]/
        page.tsx                  # Project page (RSC shell)
        client.tsx                # Client wrapper with dynamic import ssr:false

  components/
    AuthProvider.tsx              # NEW
    GoogleSignInButton.tsx        # NEW
    ProjectGrid.tsx               # NEW
    ProjectCard.tsx               # NEW
    CreateProjectModal.tsx        # NEW
    ProjectEditor.tsx             # NEW: project loader + auto-save wrapper
    App.tsx                       # MODIFIED: accept props for initial state
    SyncEditor.tsx                # UNCHANGED
    ScoreRegionEditor.tsx         # UNCHANGED
    UploadDropZone.tsx            # MODIFIED: conditional for project mode
    BorderPicker.tsx              # UNCHANGED
    TimestampInput.tsx            # UNCHANGED
    Toast.tsx                     # UNCHANGED

  renderers/
    RegularRenderer.tsx           # UNCHANGED
    SingleLineRenderer.tsx        # UNCHANGED
    RenderApp.tsx                 # UNCHANGED (used by export service)

  hooks/
    useAutoSave.ts                # NEW
    useProject.ts                 # NEW
    useVerovio.ts                 # UNCHANGED
    useSingleLineVerovio.ts       # UNCHANGED
    useToast.ts                   # UNCHANGED

  stores/
    syncStore.ts                  # MODIFIED: add hydrate action
    eventStore.ts                 # UNCHANGED

  lib/
    firebase.ts                   # NEW
    verovioService.ts             # UNCHANGED
    exportClient.ts               # MODIFIED: env var syntax
    getEvents.ts                  # UNCHANGED
    interpolation.ts              # UNCHANGED
    animationController.ts        # UNCHANGED
    noteAnimation.ts              # UNCHANGED
    fileValidation.ts             # UNCHANGED
    musicxmlValidation.ts         # UNCHANGED

  borders/
    index.tsx                     # UNCHANGED

  types/
    score.ts                      # UNCHANGED
    global.d.ts                   # UNCHANGED (or minor env type updates)
    project.ts                    # NEW: ProjectDocument interface

  index.css                       # UNCHANGED (Tailwind entry)

next.config.mjs                   # NEW (replaces vite.config.ts)
```

---

## Zustand Stores in Next.js: Keep Global Pattern

**Confidence: HIGH** (verified against official Zustand Next.js guide)

The official Zustand docs recommend per-request stores with Context providers in Next.js. However, this is important when:
1. Stores are accessed from Server Components (our stores are not)
2. SSR reads/writes store state (ours does not)

Since **all** Manuscript renderer components using stores are Client Components loaded via `dynamic(() => import(...), { ssr: false })`, the stores only exist in the browser, never on the server.

**Keep the existing global store pattern.** Do NOT refactor to per-request stores. The overhead is not justified since SSR never touches the stores.

One modification needed -- add a `hydrate` action to `syncStore`:

```typescript
// syncStore.ts - add this action to the store
hydrate: (anchorsRecord: Record<string, number>) => set({
  anchors: new Map(Object.entries(anchorsRecord)),
  selectedEventId: null,
}),
```

---

## Export Service Connection

**Confidence: HIGH** (existing architecture preserved)

The export service (`export-service/`) is a separate Fastify process. It remains completely separate from Next.js. The only change is how the frontend resolves the backend URL.

### Current (Vite)

```typescript
const backendUrl = import.meta.env.DEV ? 'http://localhost:3001' : '';
```

### After Migration (Next.js)

```typescript
const backendUrl = process.env.NODE_ENV === 'development'
  ? 'http://localhost:3001'
  : (process.env.NEXT_PUBLIC_EXPORT_SERVICE_URL || '');
```

The WebSocket URL resolution in `App.tsx` also needs the same `import.meta.env` -> `process.env` change.

### Why NOT Convert to Next.js API Routes

The export service must remain separate because:
- **WebSocket support:** Next.js API routes do not natively support WebSocket connections
- **Long-running processes:** API routes have timeout limits; export jobs run for minutes
- **Puppeteer browser pool:** Requires a persistent Node.js process with Chrome instances
- **FFmpeg child processes:** Need direct access to spawn and pipe between processes

---

## Patterns to Follow

### Pattern 1: Thin Server Shell + Heavy Client Component

**What:** Server Component page files are minimal shells that pass route params to Client Components.
**When:** Every route in this app.
**Why:** All interactive logic requires browser APIs.

```typescript
// src/app/project/[id]/page.tsx (Server Component)
import { ProjectEditorClient } from "./client";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ProjectEditorClient projectId={id} />;
}
```

### Pattern 2: Optimistic Local State + Background Persistence

**What:** UI updates immediately via useState/Zustand. Firestore write happens in background after debounce.
**When:** Any setting change (color, font, region, anchors, etc.).
**Why:** Verovio re-renders on setting changes. Waiting for Firestore round-trip would make the UI sluggish.

```
User drags slider -> useState updates -> component re-renders -> Verovio re-renders
                                      -> debounce timer starts (1500ms)
                                      -> (timer expires) Firestore write in background
```

The user never waits for persistence. If the write fails, log the error but do NOT revert the UI. On next page load, Firestore has the last successfully saved state.

### Pattern 3: File Upload at Creation, Download URL at Load

**What:** Score + audio files uploaded to Firebase Storage during project creation. On project open, fetch download URLs and retrieve file content for existing components.
**When:** Project creation (upload) and project open (download URL + fetch).

```typescript
// In useProject hook:
const musicXmlUrl = await getDownloadURL(
  ref(storage, project.files.musicXml.storagePath)
);
const response = await fetch(musicXmlUrl);
const musicXml = await response.text();
// Pass `musicXml` string to App.tsx as prop (same format as file upload)
```

### Pattern 4: Props as Initial State in App.tsx

**What:** App.tsx accepts optional props for initial state values. When props are provided (project mode), useState uses them as defaults. When no props (standalone mode, export service), useState uses hardcoded defaults.

```typescript
interface AppProps {
  projectId?: string;
  initialSettings?: Partial<ProjectSettings>;
  initialMusicXml?: { xml: string; name: string; measureCount: number };
  initialAudioUrl?: string;
  initialBgUrl?: string;
}

export default function App({
  projectId,
  initialSettings,
  initialMusicXml,
  initialAudioUrl,
  initialBgUrl,
}: AppProps = {}) {
  const [fps, setFps] = useState(initialSettings?.fps ?? 30);
  const [scoreColor, setScoreColor] = useState(initialSettings?.scoreColor ?? "#000000");
  // ... etc for all settings
  const [musicXMLFile, setMusicXMLFile] = useState(initialMusicXml ?? null);
  const [audioFile, setAudioFile] = useState(
    initialAudioUrl ? { url: initialAudioUrl, name: "loaded", file: null as any } : null
  );
  // ...
}
```

This preserves backward compatibility: App.tsx still works standalone (no props = defaults), for the export service's RenderApp.tsx, and for any future standalone use.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Moving All State to Zustand for Auto-Save

**What:** Refactoring every `useState` in App.tsx into Zustand stores.
**Why bad:** App.tsx has 20+ useState calls across playback, appearance, animation, export, and view state. Moving them all to Zustand would be a massive refactor touching every component, with high regression risk and no user-visible benefit.
**Instead:** `useAutoSave` hook observes existing useState values via a data object. The hook is additive, not restructuring.

### Anti-Pattern 2: Server-Side Firestore Queries for Project Data

**What:** Using Server Components to fetch project data from Firestore before rendering.
**Why bad:** Requires Firebase Admin SDK on the server, adds complexity, and introduces a server hop (server -> Firestore -> server -> client) vs direct (client -> Firestore). The client already has the user's auth token.
**Instead:** All Firestore queries happen client-side using the Firebase JS SDK. The page.tsx Server Component is just a shell that passes route params.

### Anti-Pattern 3: Converting Export Service to Next.js API Routes

**What:** Moving the Fastify export service into Next.js API route handlers.
**Why bad:** Export jobs are long-running (minutes), use Puppeteer browser pools, WebSockets for progress, and FFmpeg child processes. Next.js API routes have timeout limits and lack native WebSocket support.
**Instead:** Keep the export service as a separate Fastify process. Update the connection URL via environment variable.

### Anti-Pattern 4: Per-Request Zustand Stores

**What:** Following the official Zustand Next.js guide to create per-request stores with Context providers.
**Why bad in this specific case:** The guide targets apps where stores are read during SSR. All Manuscript stores are used exclusively in `ssr: false` Client Components. Adding Context providers and store factories would be boilerplate for zero benefit.
**Instead:** Keep existing global `create<Store>()` pattern.

### Anti-Pattern 5: Real-Time Firestore Listeners for Project Data

**What:** Using `onSnapshot` to subscribe to real-time updates on the project document.
**Why bad:** This app is single-user-per-project. There is no collaborative editing. Real-time listeners create unnecessary Firestore read charges and complexity (handling server-initiated state changes that conflict with local changes during auto-save debounce).
**Instead:** Load once on mount with `getDoc()`. All subsequent state is local. Auto-save writes to Firestore in the background. If the user opens the project in another tab, they see the last-saved state on load.

---

## Suggested Build Order

Dependencies flow downward. Each phase requires the previous one.

### Phase 1: Next.js Shell Migration (No Firebase)

Migrate from Vite to Next.js while keeping all existing functionality working. Zero new features.

1. Install `next`, create `next.config.mjs` with webpack WASM config
2. Create `src/app/layout.tsx` (root layout with HTML shell)
3. Create `src/app/[[...slug]]/page.tsx` + `client.tsx` (catch-all SPA route)
4. Move existing components into `src/components/`, `src/renderers/`, etc.
5. Replace all `import.meta.env` with `process.env` equivalents
6. Update `package.json` scripts to `next dev` / `next build`
7. Remove Vite-specific files: `vite.config.ts`, `vite-env.d.ts`, `main.tsx`, `index.html`
8. Verify: app works identically to the Vite version

**Deliverable:** Next.js app running as SPA, identical to current Vite app. All existing tests pass.

### Phase 2: Firebase Auth + Route Structure

Add authentication and real routing. Still no data persistence.

1. `npm install firebase`
2. Create `src/lib/firebase.ts` (SDK initialization)
3. Create `AuthProvider` component
4. Create `/login` page with `GoogleSignInButton`
5. Create `/dashboard` page (placeholder: "Welcome, {user.displayName}")
6. Create `/project/[id]` page with dynamic import of App
7. Add route protection (redirect unauthenticated to /login)
8. Remove catch-all `[[...slug]]` route (replaced by real routes)

**Deliverable:** Google sign-in works, routes exist, App renders at /project/[id].

### Phase 3: Project Creation + File Storage

Add project creation flow with file uploads to Firebase Storage.

1. Define `ProjectDocument` TypeScript interface
2. Set up Firestore security rules
3. Set up Firebase Storage security rules
4. Create `CreateProjectModal` component (name, score upload, audio upload, view mode)
5. Implement file upload to Firebase Storage
6. Create project document in Firestore on submission
7. Implement `useProject` hook (load project data from Firestore/Storage)
8. Modify `App.tsx` to accept initial state as optional props
9. Add `hydrate` action to `syncStore`
10. Create `ProjectEditor` wrapper that hydrates App from Firestore data

**Deliverable:** Users can create projects with uploaded files and re-open them.

### Phase 4: Dashboard + Project Listing

Build the dashboard UI showing user's projects.

1. Create `ProjectGrid` component
2. Create `ProjectCard` component (name, last edited, thumbnail placeholder)
3. Query Firestore for user's projects (`where("uid", "==", auth.currentUser.uid)`)
4. Sort by `updatedAt` descending
5. Link cards to `/project/[id]`
6. Add delete project functionality (Firestore doc + Storage files)

**Deliverable:** Users see all their projects on the dashboard and can navigate to them.

### Phase 5: Auto-Save + Background Image Management

Add debounced auto-save and post-creation background image changes.

1. Implement `useAutoSave` hook
2. Wire auto-save to App.tsx settings state (build data object from useState values)
3. Wire auto-save to syncStore anchors (Zustand subscribe)
4. Implement background image upload/change in project mode (upload to Storage, update Firestore)
5. Add save status indicator UI (saved / saving / error)
6. Handle edge cases: save on unmount, failed saves, offline detection

**Deliverable:** All project changes persist automatically to Firebase.

### Phase Ordering Rationale

- **Phase 1 first:** Everything else depends on Next.js being functional. This is the highest-risk phase (WASM compatibility).
- **Phase 2 before Phase 3:** Auth is needed before Firestore security rules can validate ownership.
- **Phase 3 before Phase 4:** Dashboard needs projects to exist in Firestore to display.
- **Phase 4 before Phase 5:** Auto-save needs projects to be fully loadable first.
- **Phase 5 last:** Auto-save is the most complex feature and benefits from a stable foundation.

---

## Risk Assessment

| Risk | Severity | Likelihood | Mitigation |
|------|----------|-----------|------------|
| Verovio WASM fails to load in Next.js webpack | HIGH | LOW | `ssr: false` dynamic import avoids SSR; webpack asyncWebAssembly is well-documented |
| Next.js Turbopack incompatible with WASM | MEDIUM | MEDIUM | Use `next dev --webpack` flag to force webpack during development |
| Firestore document size exceeds 1MB (many anchors) | LOW | VERY LOW | 500 anchors = ~10KB; would need 50,000+ anchors to approach limit |
| Auto-save race condition (rapid changes overwrite) | MEDIUM | MEDIUM | `setDoc` with `{ merge: true }` is idempotent; last write wins; debounce prevents rapid writes |
| Export service URL resolution breaks after migration | LOW | LOW | Single env var change; easy to test |
| RenderApp.tsx (export service) broken by migration | MEDIUM | LOW | RenderApp is used by Puppeteer which loads the built app; ensure `next build` output includes RenderApp path |

---

## Sources

### HIGH Confidence
- [Next.js Official Migration Guide: Vite to Next.js](https://nextjs.org/docs/app/guides/migrating/from-vite) -- Step-by-step migration, dynamic import pattern, `ssr: false`
- [Next.js SPA Guide](https://nextjs.org/docs/app/guides/single-page-applications) -- Catch-all route pattern
- [Zustand Official Next.js Guide](https://zustand.docs.pmnd.rs/guides/nextjs) -- Per-request stores vs global stores, when each applies
- [Firebase: Add Data to Firestore](https://firebase.google.com/docs/firestore/manage-data/add-data) -- `setDoc` with `{ merge: true }` pattern
- [Firebase: Upload Files (Web)](https://firebase.google.com/docs/storage/web/upload-files) -- `uploadBytes` API
- [Verovio JavaScript/WASM Documentation](https://book.verovio.org/installing-or-building-from-sources/javascript-and-webassembly.html) -- WASM module loading pattern
- Codebase analysis: `App.tsx`, `RegularRenderer.tsx`, `syncStore.ts`, `verovioService.ts`, `main.tsx`, `RenderApp.tsx`, `exportClient.ts`

### MEDIUM Confidence
- [Firebase Hosting + Next.js](https://firebase.google.com/docs/hosting/frameworks/nextjs) -- Hosting integration
- [Firebase Next.js Codelab](https://firebase.google.com/codelabs/firebase-nextjs) -- Integration patterns
- [Lee Robinson: Next.js + Vercel + Firebase](https://github.com/leerob/nextjs-vercel-firebase) -- Firebase initialization pattern
- [WASM in Next.js Example](https://github.com/gthb/try-to-use-wasm-in-next.js/blob/main/README.md) -- asyncWebAssembly config, gotchas
- [Next.js WASM Server-Side Issues](https://github.com/vercel/next.js/issues/83046) -- Known issues with WASM in SSR
- [Next.js Webpack WASM Discussion](https://github.com/vercel/next.js/discussions/75430) -- Turbopack limitations, webpack config

### LOW Confidence
- Firebase Storage security rules for per-user project paths (may need custom claims for production hardening)
- Turbopack WASM compatibility status (evolving rapidly; may work by time of implementation)

---

*Architecture research completed: 2026-02-11*
*Domain: Next.js migration + Firebase integration for Manuscript Renderer v2.0*
*Focus: Integration with existing React SPA, Verovio WASM compatibility, Firebase Auth/Firestore/Storage, auto-save*
