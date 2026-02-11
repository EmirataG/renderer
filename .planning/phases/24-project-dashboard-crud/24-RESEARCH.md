# Phase 24: Project Dashboard & CRUD - Research

**Researched:** 2026-02-11
**Domain:** Firestore project data model, Next.js App Router dashboard/editor routing, file upload UI, in-memory state management with Zustand
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Two-step modal: Step 1 uploads files, Step 2 sets name + view mode
- Drag-and-drop zones for file upload (click also opens file picker)
- Separate drop zones for score and audio files
- Score accepts: .musicxml, .mxl, .mei
- Audio accepts: .mp3, .wav
- Project name is a required field -- user must provide it (no auto-fill from filename)
- View mode shows "Page view" as active and "Single line" as disabled with "coming soon" label
- Three-dot context menu on each project card reveals "Delete" option
- Confirmation dialog before deletion: "Delete '[project name]'? This cannot be undone."
- Toast notification after deletion: "Project deleted -- Undo"
- Undo available in toast for ~5 seconds; actual deletion delayed until timeout expires
- Card disappears from grid immediately on delete action

### Claude's Discretion
- Dashboard grid layout, card sizing, and responsive behavior
- Project card design (thumbnail, metadata shown, hover states)
- Empty dashboard state (no projects yet)
- Toast styling and animation
- Drag-and-drop zone visual design (icons, hover states, file validation feedback)
- Modal transitions and animations
- Sorting/ordering of projects on the dashboard

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope.
</user_constraints>

## Summary

Phase 24 adds a project dashboard and CRUD operations to the existing authenticated Next.js 16 app. Users create projects through a two-step modal (upload files, then name + view mode), browse them on a grid dashboard, open them in the editor, and delete them with an undo-capable soft-delete pattern. The phase builds on Phase 23's Firebase Authentication (session cookies, proxy.ts route protection) and the existing editor in `src/App.tsx`.

The core data layer uses **Firestore** (already bundled in firebase v12.9.0 and firebase-admin v13.6.1 -- no new npm installs needed) for server-side CRUD via Next.js Route Handlers. The project data model is minimal: project metadata (name, view mode, timestamps) stored in Firestore, while file content (score XML, audio blob) is held **only in browser memory** for this phase (file persistence is a separate future phase). The Firestore document stores just enough to show the dashboard card: project ID, name, view mode, created/updated timestamps, and the user's UID for ownership scoping.

The routing architecture requires restructuring the current catch-all `[[...slug]]` route. The dashboard becomes the root `/` route (what users see after login), and the editor moves to `/project/[id]`. This is a clean separation: dashboard is a Server Component that fetches project list from Firestore, while the editor page is the existing `dynamic({ ssr: false })` client-side App component. The existing proxy.ts already protects all routes except `/login` and `/api/auth`, so `/project/[id]` is automatically protected.

**Primary recommendation:** Use Firestore Admin SDK in Route Handlers for all CRUD operations. Store project metadata only (no file content) in Firestore. Dashboard is a Server Component that reads projects. Editor loads at `/project/[id]`. File content lives in browser memory only. Extend the existing Toast system for the undo-delete pattern.

## Standard Stack

### Core (Already Installed -- No New Dependencies)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| firebase-admin | 13.6.1 | Server-side Firestore CRUD via `firebase-admin/firestore` | Already installed for auth. `getFirestore()` available. No extra install. |
| firebase | 12.9.0 | Client SDK (auth only this phase -- Firestore read done server-side) | Already installed. |
| next | 16.1.6 | App Router, Route Handlers, Server Components, `cookies()` API | Already installed. |
| zustand | 5.0.11 | Client-side state for current project data in editor | Already installed. Pattern established in syncStore.ts. |
| tailwindcss | 4.1.16 | Styling dashboard, modal, cards | Already installed. Grunge theme classes in index.css. |

### Supporting (No Install Needed)

| Library | Purpose | When to Use |
|---------|---------|-------------|
| `crypto.randomUUID()` | Generate project IDs client-side | Web Crypto API -- available in all modern browsers and Node.js. No npm package needed. |
| `server-only` | 0.0.1 | Prevent firebase-admin leaking to client | Already installed from Phase 23. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Firestore Admin in Route Handlers | Firestore Client SDK in client components | Admin SDK gives server-side security rules enforcement. Client SDK would bypass route handler and require Firestore security rules. Admin SDK is simpler for this CRUD pattern since we already have it. |
| Route Handlers for CRUD | Server Actions (use server) | Server Actions are fine for mutations but Route Handlers are more explicit, easier to test, and this project already has the Route Handler pattern from Phase 23. Consistency wins. |
| `crypto.randomUUID()` | uuid npm package | No need for an extra dependency. randomUUID is built into the platform. |
| Firestore for file storage | Browser memory only | File persistence is explicitly a future phase. Storing file blobs in Firestore is not recommended (max 1MB doc size). This phase stores metadata only. |

**Installation:**
```bash
# No new packages needed -- all dependencies already installed
```

## Architecture Patterns

### Route Structure After Phase 24

```
src/
  app/
    layout.tsx                      # Root layout (RSC) - HTML shell
    page.tsx                        # Dashboard page (Server Component, fetches projects)
    login/
      page.tsx                      # Login page (unchanged from Phase 23)
      client.tsx                    # GoogleSignInButton (unchanged)
    project/
      [id]/
        page.tsx                    # Editor page (RSC shell, force-dynamic)
        client.tsx                  # 'use client' - dynamic import of App
    api/
      auth/
        session/
          route.ts                  # Session cookie management (unchanged)
      projects/
        route.ts                    # GET: list user's projects, POST: create project
        [id]/
          route.ts                  # GET: single project, DELETE: delete project
  lib/
    firebase-client.ts              # Client SDK init (unchanged)
    firebase-admin.ts               # Admin SDK init (unchanged)
    firestore.ts                    # NEW: Firestore singleton + helper functions
    fileValidation.ts               # Extended with .mxl, .mei support
  stores/
    syncStore.ts                    # Existing sync anchor store (unchanged)
  components/
    Toast.tsx                       # Extended with action button support (for Undo)
    UploadDropZone.tsx              # Existing (reusable in creation modal)
    CreateProjectModal.tsx          # NEW: Two-step creation modal
    ProjectCard.tsx                 # NEW: Dashboard project card
    Dashboard.tsx                   # NEW: Dashboard grid layout (client component for interactions)
  hooks/
    useToast.ts                     # Extended with action callback support
  types/
    project.ts                      # NEW: Project type definitions
```

**Key routing change:** The current `[[...slug]]` catch-all route at `/` becomes the dashboard. The editor moves to `/project/[id]`. The `[[...slug]]` directory is removed and replaced with a simple `page.tsx` for the dashboard.

### Pattern 1: Firestore Admin Singleton (Server-Only)

**What:** Extend the existing firebase-admin.ts pattern with a Firestore instance.
**When:** All Route Handlers that read/write project data.

```typescript
// src/lib/firestore.ts
import 'server-only';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

// Lazy singleton -- getFirestore() uses the default app initialized in firebase-admin.ts
let _db: FirebaseFirestore.Firestore | null = null;

function getDb() {
  if (!_db) {
    // Importing firebase-admin.ts triggers app initialization
    require('@/lib/firebase-admin');
    _db = getFirestore();
  }
  return _db;
}

export { getDb, FieldValue };
```

**Source:** [Firebase Admin Firestore docs](https://firebase.google.com/docs/reference/admin/node/firebase-admin.firestore), verified from installed `firebase-admin/lib/firestore/index.d.ts`

**IMPORTANT:** The firebase-admin Firestore API uses the `@google-cloud/firestore` style (NOT the client SDK modular API). Operations use `db.collection('x').doc('y').set({...})`, NOT `addDoc(collection(db, 'x'), {...})`.

### Pattern 2: Project Data Model

**What:** Minimal Firestore document for project metadata.
**When:** Stored on project creation, read for dashboard and editor loading.

```typescript
// src/types/project.ts
export interface Project {
  id: string;               // Document ID (crypto.randomUUID())
  userId: string;           // Firebase Auth UID (ownership)
  name: string;             // User-provided project name
  viewMode: 'page';         // Only "page" for now ("single-line" is "coming soon")
  createdAt: string;        // ISO 8601 timestamp
  updatedAt: string;        // ISO 8601 timestamp
}

// For creating a new project (server-side, Firestore FieldValue timestamps)
export interface CreateProjectInput {
  name: string;
  viewMode: 'page';
}
```

**Firestore collection:** `projects` -- documents keyed by project ID, scoped by `userId` field.

```
/projects/{projectId}
  - userId: string (Firebase UID)
  - name: string
  - viewMode: "page"
  - createdAt: Timestamp (Firestore server timestamp)
  - updatedAt: Timestamp (Firestore server timestamp)
```

### Pattern 3: Route Handler with Auth Verification

**What:** Route Handler that verifies the session cookie and extracts the user ID before performing Firestore operations.
**When:** All `/api/projects/*` routes.

```typescript
// src/app/api/projects/route.ts
import { cookies } from 'next/headers';
import { adminAuth } from '@/lib/firebase-admin';
import { getDb, FieldValue } from '@/lib/firestore';

async function getAuthenticatedUser() {
  const cookieStore = await cookies();
  const session = cookieStore.get('__session')?.value;
  if (!session) return null;
  try {
    return await adminAuth.verifySessionCookie(session, true);
  } catch {
    return null;
  }
}

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const db = getDb();
  const snapshot = await db.collection('projects')
    .where('userId', '==', user.uid)
    .orderBy('updatedAt', 'desc')
    .get();

  const projects = snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
    createdAt: doc.data().createdAt?.toDate().toISOString(),
    updatedAt: doc.data().updatedAt?.toDate().toISOString(),
  }));

  return Response.json({ projects });
}

export async function POST(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { name, viewMode } = await request.json();

  const db = getDb();
  const projectId = crypto.randomUUID();

  await db.collection('projects').doc(projectId).set({
    userId: user.uid,
    name,
    viewMode: viewMode || 'page',
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return Response.json({ id: projectId });
}
```

**Source:** Pattern follows Phase 23's session Route Handler. `verifySessionCookie(session, true)` -- the `true` parameter checks for token revocation.

### Pattern 4: Undo-Delete with Delayed Firestore Deletion

**What:** Optimistic UI removal with a 5-second undo window. The actual Firestore deletion is delayed.
**When:** User clicks Delete on a project card.

```
1. User clicks Delete -> confirmation dialog appears
2. User confirms -> card removed from local state immediately (optimistic)
3. Toast shown: "Project deleted -- Undo" with 5-second timer
4. If no undo: after 5s, DELETE /api/projects/[id] fires
5. If undo clicked: card restored to local state, no API call made
```

**Implementation approach:** The delete is NOT sent to the server immediately. A timeout ID is stored. If the user clicks Undo within 5 seconds, the timeout is cleared and the project is restored to the local state. Only after the timeout expires does the actual DELETE API call fire.

```typescript
// Toast system needs to support an action callback:
interface Toast {
  id: string;
  message: string;
  type: ToastType;
  action?: {
    label: string;
    onClick: () => void;
  };
}
```

### Pattern 5: Two-Step Creation Modal

**What:** Modal with two steps: file upload, then project name + view mode.
**When:** User clicks "New Project" on the dashboard.

```
Step 1: Upload Files
  - Score drop zone (accepts .musicxml, .mxl, .mei)
  - Audio drop zone (accepts .mp3, .wav)
  - Both required before proceeding to Step 2
  - "Next" button enabled only when both files uploaded

Step 2: Project Details
  - Project name text input (required)
  - View mode cards:
    - "Page view" card (active, selected by default)
    - "Single line" card (disabled, shows "Coming soon" label)
  - "Back" button returns to Step 1
  - "Create" button enabled only when name is non-empty
  - On create: POST /api/projects -> redirect to /project/[id]
```

**File handling in the modal:** Files are read into browser memory (same as current UploadDropZone pattern). The score XML is read via `file.text()`, audio via `URL.createObjectURL()`. These stay in memory during the editor session. The files are NOT uploaded to a server -- file persistence is a future phase.

### Pattern 6: Dashboard as Server Component with Client Interaction Layer

**What:** Dashboard page fetches projects server-side, renders a client component for interactivity.
**When:** User visits `/` (root route).

```typescript
// src/app/page.tsx (Server Component)
import { cookies } from 'next/headers';
import { adminAuth } from '@/lib/firebase-admin';
import { getDb } from '@/lib/firestore';
import { Dashboard } from '@/components/Dashboard';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const cookieStore = await cookies();
  const session = cookieStore.get('__session')?.value;

  let projects: Project[] = [];
  if (session) {
    try {
      const decoded = await adminAuth.verifySessionCookie(session, true);
      const db = getDb();
      const snapshot = await db.collection('projects')
        .where('userId', '==', decoded.uid)
        .orderBy('updatedAt', 'desc')
        .get();
      projects = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate().toISOString(),
        updatedAt: doc.data().updatedAt?.toDate().toISOString(),
      }));
    } catch {
      // Invalid session -- proxy.ts should have caught this, but handle gracefully
    }
  }

  return <Dashboard initialProjects={projects} />;
}
```

The `Dashboard` client component receives `initialProjects` as props and manages local state for optimistic updates (delete with undo, new project appearing after creation).

### Pattern 7: Editor Page at /project/[id]

**What:** Dynamic route that loads the editor for a specific project.
**When:** User clicks a project card on the dashboard.

```typescript
// src/app/project/[id]/page.tsx
export const dynamic = 'force-dynamic';

import { ClientOnly } from './client';

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ClientOnly projectId={id} />;
}
```

```typescript
// src/app/project/[id]/client.tsx
'use client';

import dynamic from 'next/dynamic';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase-client';
import { useRouter } from 'next/navigation';

const App = dynamic(() => import('../../../App'), { ssr: false });

export function ClientOnly({ projectId }: { projectId: string }) {
  const router = useRouter();

  async function handleSignOut() {
    await fetch('/api/auth/session', { method: 'DELETE' });
    await signOut(auth);
    router.push('/login');
  }

  return (
    <>
      <button
        onClick={() => router.push('/')}
        className="fixed top-3 left-3 z-50 px-3 py-1.5 text-xs bg-neutral-800 text-neutral-300 rounded hover:bg-neutral-700 transition-colors"
      >
        Dashboard
      </button>
      <button
        onClick={handleSignOut}
        className="fixed top-3 right-3 z-50 px-3 py-1.5 text-xs bg-neutral-800 text-neutral-300 rounded hover:bg-neutral-700 transition-colors"
      >
        Sign out
      </button>
      <App projectId={projectId} />
    </>
  );
}
```

**Key:** The `App` component receives a `projectId` prop. For this phase, the projectId is used to fetch project metadata from the API on mount (name, view mode) but the actual file content must be re-uploaded each session (file persistence is a future phase).

### Anti-Patterns to Avoid

- **Storing file blobs in Firestore:** Firestore documents have a 1MB size limit. MusicXML files can be up to 10MB, audio up to 50MB. File storage is a future phase (likely Firebase Storage). This phase stores metadata only.
- **Using Firestore client SDK for CRUD:** The Admin SDK in Route Handlers is more secure (no Firestore security rules needed) and consistent with the Phase 23 auth pattern. Don't add `firebase/firestore` client imports.
- **Rendering Verovio server-side for thumbnails:** Verovio requires WASM and runs in the browser. Generating thumbnails server-side would require a headless browser. For this phase, project cards show a simple placeholder or the project name -- not a rendered score preview.
- **Implementing file persistence:** This phase scope explicitly excludes file persistence and auto-save. Files exist only in browser memory during the editor session.
- **Blocking on delete confirmation:** The undo pattern means deletion is optimistic. Don't make the user wait for the server response before the card disappears.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Project ID generation | Auto-increment counter or custom hash | `crypto.randomUUID()` | Cryptographically secure, globally unique, zero dependencies, available in Node.js and all modern browsers |
| Firestore CRUD | Custom REST API to a database | `firebase-admin/firestore` with `getFirestore()` | Already installed, zero config, scales automatically, integrates with Firebase Auth |
| Session verification in Route Handlers | Custom JWT parsing | `adminAuth.verifySessionCookie(session, true)` | Firebase handles signature validation, expiry check, revocation check |
| User ownership scoping | Custom middleware or decorators | Firestore `.where('userId', '==', uid)` query | Simple, fast, built into Firestore query API |
| File type detection | Manual MIME parsing | Extend existing `fileValidation.ts` with `.mxl` and `.mei` | Proven pattern already in codebase |
| Toast with undo | Custom notification system | Extend existing `Toast.tsx` + `useToast.ts` with `action` prop | Existing system works well, just needs action button support |
| Confirmation dialog | Third-party dialog library | Native HTML `<dialog>` element or simple React component | Small enough to build in a few lines. No library needed for a single confirmation dialog. |

**Key insight:** This phase requires zero new npm dependencies. Everything needed is already installed or available as platform APIs.

## Common Pitfalls

### Pitfall 1: Firestore Composite Index Required for orderBy with where

**What goes wrong:** Querying `projects` with `.where('userId', '==', uid).orderBy('updatedAt', 'desc')` fails with "The query requires an index" error.
**Why it happens:** Firestore requires a composite index when combining a `where` clause on one field with an `orderBy` on a different field.
**How to avoid:** When the error occurs, Firestore provides a direct URL in the error message to create the required index. Click the URL to create it in the Firebase Console. Alternatively, create the index proactively: Collection `projects`, Fields: `userId` (Ascending) + `updatedAt` (Descending).
**Warning signs:** "9 FAILED_PRECONDITION: The query requires an index" error in the Route Handler.

### Pitfall 2: Firestore Timestamps Serialization

**What goes wrong:** Firestore `Timestamp` objects are not JSON-serializable. Passing them directly to `Response.json()` produces `{"_seconds":...,"_nanoseconds":...}` instead of a readable date string.
**Why it happens:** Firestore stores timestamps as `Timestamp` objects with internal `_seconds` and `_nanoseconds` fields, not ISO strings.
**How to avoid:** Always convert timestamps before sending to client: `doc.data().createdAt?.toDate().toISOString()`. Define a clear serialization boundary in the Route Handler.
**Warning signs:** Dashboard shows `[object Object]` or `{"_seconds":1707654321}` instead of a formatted date.

### Pitfall 3: Catch-All Route Conflicts with New Routes

**What goes wrong:** The existing `[[...slug]]` catch-all route at the root conflicts with new routes like `/project/[id]` because the catch-all matches everything.
**Why it happens:** Next.js optional catch-all `[[...slug]]` matches `/`, `/anything`, `/anything/else`, etc. It will match before more specific routes if not restructured.
**How to avoid:** Remove the `[[...slug]]` directory entirely. Replace it with a simple `page.tsx` for the dashboard at root, and create `project/[id]/page.tsx` for the editor. The catch-all was originally for the SPA pattern; now that we have real routes, it must go.
**Warning signs:** Navigating to `/project/abc123` loads the dashboard instead of the editor, or vice versa.

### Pitfall 4: Optimistic Delete Without Proper Cleanup

**What goes wrong:** User deletes a project (card removed optimistically), then navigates away before the 5-second undo window expires. The actual DELETE API call never fires.
**Why it happens:** The timeout for the delayed delete is set up in a React component. When the component unmounts (navigation away), the timeout is cleared by useEffect cleanup, but the delete is never sent.
**How to avoid:** When the component unmounts with a pending delete, fire the DELETE API call immediately in the useEffect cleanup function. The undo window is effectively over once the user navigates away.
**Warning signs:** Projects that were "deleted" reappear on the dashboard after navigation.

### Pitfall 5: File Content Lost on Page Refresh

**What goes wrong:** User creates a project, uploads files in the modal, opens the editor -- then refreshes the page. All file content is gone because it was only in browser memory.
**Why it happens:** This phase explicitly does not implement file persistence. Files exist only as in-memory state.
**How to avoid:** This is expected behavior for this phase. Show a clear message when the editor opens without file content, prompting the user to re-upload. Do NOT try to silently recover -- that would mask the issue and complicate the future file persistence phase.
**Warning signs:** (Expected) Editor shows empty state after page refresh on `/project/[id]`.

### Pitfall 6: firebase-admin App Not Initialized When Firestore Accessed

**What goes wrong:** `getFirestore()` throws "The default Firebase app does not exist" because `firebase-admin.ts` hasn't been imported yet.
**Why it happens:** The existing `firebase-admin.ts` uses a lazy proxy pattern. If `firestore.ts` calls `getFirestore()` before any code has triggered the admin auth proxy, the Firebase app hasn't been initialized.
**How to avoid:** In `firestore.ts`, explicitly import `@/lib/firebase-admin` (which triggers app initialization as a side effect of the Proxy access) before calling `getFirestore()`. Or refactor firebase-admin.ts to eagerly initialize and export the app.
**Warning signs:** "The default Firebase app does not exist" error when the first Firestore operation runs.

## Code Examples

### Firestore Admin SDK CRUD Operations

```typescript
// Source: firebase-admin v13.6.1 installed package + official docs
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const db = getFirestore();

// CREATE: Set document with specific ID
await db.collection('projects').doc('project-id').set({
  userId: 'user-uid',
  name: 'My Project',
  viewMode: 'page',
  createdAt: FieldValue.serverTimestamp(),
  updatedAt: FieldValue.serverTimestamp(),
});

// READ: Get all documents for a user
const snapshot = await db.collection('projects')
  .where('userId', '==', 'user-uid')
  .orderBy('updatedAt', 'desc')
  .get();

const projects = snapshot.docs.map(doc => ({
  id: doc.id,
  ...doc.data(),
}));

// READ: Get single document
const docRef = await db.collection('projects').doc('project-id').get();
if (docRef.exists) {
  const project = { id: docRef.id, ...docRef.data() };
}

// DELETE: Remove document
await db.collection('projects').doc('project-id').delete();

// UPDATE: Touch updatedAt timestamp
await db.collection('projects').doc('project-id').update({
  updatedAt: FieldValue.serverTimestamp(),
});
```

### Extended Toast with Undo Action

```typescript
// Extended useToast hook
export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  action?: {
    label: string;
    onClick: () => void;
  };
  duration?: number; // default 4000, undo toast uses 5000
}

// Usage for undo-delete:
const { show } = useToast();

function handleDelete(projectId: string, projectName: string) {
  // Remove from local state immediately
  setProjects(prev => prev.filter(p => p.id !== projectId));

  // Set up delayed actual deletion
  let deleted = false;
  const timeoutId = setTimeout(() => {
    deleted = true;
    fetch(`/api/projects/${projectId}`, { method: 'DELETE' });
  }, 5000);

  // Show toast with undo action
  show(`Project deleted`, 'info', {
    label: 'Undo',
    onClick: () => {
      if (!deleted) {
        clearTimeout(timeoutId);
        // Restore project to local state
        setProjects(prev => [...prev, deletedProject]);
      }
    },
    duration: 5000,
  });
}
```

### File Validation Extension for .mxl and .mei

```typescript
// Extension to existing fileValidation.ts
// Add .mxl and .mei to ALLOWED_EXTENSIONS.musicxml:
const ALLOWED_EXTENSIONS: Record<FileCategory, string[]> = {
  musicxml: [".xml", ".musicxml", ".mxl", ".mei"],
  audio: [".mp3", ".wav"],  // Scoped down per user decision
  image: [".jpg", ".jpeg", ".png", ".webp"],
};
```

**Note on .mxl files:** .mxl is a compressed (ZIP) MusicXML format. The existing `processMusicXML` function reads files via `file.text()`, which won't work for binary .mxl files. The .mxl handling requires reading the file as an ArrayBuffer and decompressing it. Verovio's `loadData()` can accept MusicXML and MEI directly, but .mxl needs decompression first. This may require a small ZIP library (like `fflate` or `JSZip`) or can be deferred if .mxl support is complex.

### Dashboard Grid with Responsive Layout

```typescript
// Recommended grid using Tailwind
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
  {projects.map(project => (
    <ProjectCard key={project.id} project={project} />
  ))}
</div>
```

### Project Card Design Recommendation

```typescript
// Card structure recommendation
<div className="group relative bg-neutral-900 border border-neutral-800 rounded-lg overflow-hidden hover:border-neutral-600 transition-colors cursor-pointer">
  {/* Thumbnail area - placeholder gradient for now */}
  <div className="aspect-video bg-gradient-to-br from-neutral-800 to-neutral-900 flex items-center justify-center">
    <MusicNoteIcon className="w-12 h-12 text-neutral-700" />
  </div>

  {/* Metadata */}
  <div className="p-4">
    <h3 className="text-sm font-medium text-neutral-200 truncate">{project.name}</h3>
    <p className="text-xs text-neutral-500 mt-1">
      {formatRelativeDate(project.updatedAt)}
    </p>
  </div>

  {/* Three-dot menu */}
  <button className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity ...">
    ...
  </button>
</div>
```

### Empty Dashboard State

```typescript
<div className="flex flex-col items-center justify-center py-24">
  <MusicNoteIcon className="w-16 h-16 text-neutral-700 mb-6" />
  <h2 className="text-lg font-medium text-neutral-300 mb-2">No projects yet</h2>
  <p className="text-sm text-neutral-500 mb-6 max-w-xs text-center">
    Create your first project to start visualizing sheet music with audio.
  </p>
  <button onClick={openCreateModal} className="grunge-btn-primary">
    New Project
  </button>
</div>
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Client-side Firestore with security rules | Admin SDK in Route Handlers | Next.js App Router (2023+) | Server-side data access is more secure, no client bundle size increase for Firestore |
| `middleware.ts` | `proxy.ts` | Next.js 16 (Oct 2025) | Same API, renamed file. Already done in Phase 23. |
| Custom modal libraries (react-modal) | Native `<dialog>` element or simple portal | 2023+ | `<dialog>` has full browser support. No library needed for simple modals. |
| `uuid` npm package | `crypto.randomUUID()` | 2022+ | Platform API, no dependency needed |

**Deprecated/outdated:**
- `firebase.firestore()` (compat mode): Use modular `getFirestore()` from `firebase-admin/firestore`
- `[[...slug]]` catch-all for SPA: Replace with specific routes now that we have proper App Router routing

## Open Questions

1. **Firestore Project Setup**
   - What we know: The Firebase project already has Auth enabled from Phase 23. Firestore may or may not be enabled yet.
   - What's unclear: Has the user enabled Firestore in the Firebase Console?
   - Recommendation: Include a setup step in the plan: "Enable Cloud Firestore in the Firebase Console (Native mode, any region)." This is a one-click action.

2. **.mxl (Compressed MusicXML) Handling**
   - What we know: The user specified .mxl as an accepted score format. .mxl is a ZIP file containing MusicXML.
   - What's unclear: Does Verovio's `loadData()` handle .mxl directly, or does it need pre-decompression?
   - Recommendation: Test Verovio's loadData with .mxl input. If it doesn't work natively, either add `fflate` (3KB gzipped) for decompression or initially accept .mxl in the file picker but show an error if it fails validation, with a note to convert to .musicxml. The safest approach for this phase is to accept the extension but validate through Verovio and show a helpful error if it fails.

3. **MEI Format Handling**
   - What we know: The user specified .mei as an accepted score format. MEI (Music Encoding Initiative) is an XML format different from MusicXML.
   - What's unclear: Does the existing `isLikelyMusicXML` pre-flight check work for MEI files? (It checks for `<score-partwise>` or `<score-timewise>` which are MusicXML-specific tags.)
   - Recommendation: Verovio natively supports MEI. Update the pre-flight check to also accept MEI root elements (`<mei>` or `<music>`). The full validation via `toolkit.loadData()` will handle the rest.

4. **Project Thumbnail on Dashboard Cards**
   - What we know: Success criteria says "background image thumbnail" on project cards. But this phase does not persist files.
   - What's unclear: Where does the thumbnail come from if files are not persisted?
   - Recommendation: For this phase, use a placeholder (gradient + music note icon) as the card thumbnail. Real thumbnails require either: (a) generating a Verovio SVG snapshot on creation and storing it, or (b) file persistence so the score can be re-rendered. Both are future phase concerns. The placeholder approach is clean and avoids scope creep.

5. **Handling Editor Without Files (After Refresh)**
   - What we know: Files are only in memory. Refreshing `/project/[id]` loses them.
   - What's unclear: What should the editor show when it has project metadata but no files?
   - Recommendation: Show a "Re-upload files" prompt in the editor. The existing "No Score Loaded" empty state in App.tsx already handles this case -- just needs the UploadDropZone accessible. This is already the current behavior when no files are loaded.

## Sources

### Primary (HIGH confidence)
- [Firebase Admin Firestore reference](https://firebase.google.com/docs/reference/admin/node/firebase-admin.firestore) -- `getFirestore`, `FieldValue`, collection/doc API
- [Firebase Add Data docs](https://firebase.google.com/docs/firestore/manage-data/add-data) -- set, add, serverTimestamp patterns
- [Firebase Get Data docs](https://firebase.google.com/docs/firestore/query-data/get-data) -- query, where, orderBy, get
- Installed `firebase-admin@13.6.1` package: `lib/firestore/index.d.ts` -- verified exports of `getFirestore`, `FieldValue`, `Timestamp`
- Installed `firebase@12.9.0` package: verified `firebase/firestore` submodule exists (not used this phase, but available)
- [Next.js Route Groups](https://nextjs.org/docs/app/api-reference/file-conventions/route-groups) -- route organization patterns
- [Next.js Dynamic Routes](https://nextjs.org/docs/app/api-reference/file-conventions/dynamic-routes) -- `[id]` segment params
- [MDN crypto.randomUUID](https://developer.mozilla.org/en-US/docs/Web/API/Crypto/randomUUID) -- platform UUID generation
- Phase 23 RESEARCH.md and 23-01-SUMMARY.md -- established Firebase Auth patterns, admin SDK init, session cookies

### Secondary (MEDIUM confidence)
- [Firebase Manage Session Cookies](https://firebase.google.com/docs/auth/admin/manage-cookies) -- `verifySessionCookie` for extracting user ID
- [Stackademic: Next.js Server-side Auth with Firebase Admin](https://stackademic.com/blog/next-js-14-server-side-authentication-using-cookies-with-firebase-admin-sdk) -- Route Handler + verifySessionCookie pattern
- [Can I use: crypto.randomUUID](https://caniuse.com/mdn-api_crypto_randomuuid) -- browser support (96%+ global)

### Tertiary (LOW confidence)
- .mxl decompression handling -- needs runtime verification with Verovio
- MEI format pre-flight validation -- needs verification of Verovio's MEI root element expectations

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all dependencies already installed and verified. Zero new installs.
- Architecture: HIGH -- Route Handler + Firestore Admin pattern verified from installed packages and official docs. Routing restructure is straightforward Next.js App Router.
- Pitfalls: HIGH -- Firestore index requirement, timestamp serialization, and catch-all route conflict are well-documented issues with known solutions.
- File format support (.mxl, .mei): MEDIUM -- Verovio supports both formats, but the integration with existing validation code needs runtime verification.

**Research date:** 2026-02-11
**Valid until:** 2026-03-11 (stable -- Firestore Admin API is mature, Next.js 16 is current, all deps already locked)
