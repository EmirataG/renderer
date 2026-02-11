# Phase 25: Firebase Storage & File Persistence - Research

**Researched:** 2026-02-11
**Domain:** Firebase Storage (client + admin SDK), file upload workflows, security rules, Next.js API route file handling, Firestore schema extension
**Confidence:** HIGH

## Summary

Phase 25 transitions the app from ephemeral in-memory file handling to persistent cloud storage. Currently, users upload score and audio files during project creation, but these files exist only in browser memory -- a page refresh loses everything. This phase uploads files to Firebase Storage, stores download URLs in Firestore project documents, and loads them back when users revisit a project.

The architecture uses a **server-side upload pattern** via Next.js API Route Handlers with the Firebase Admin SDK. Files are sent from the client as `FormData` to API routes, which upload them to Firebase Storage using `getStorage().bucket()` and store the resulting download URLs in Firestore. This approach keeps file handling on the server where the Admin SDK has privileged access, avoids exposing storage paths to the client, and maintains consistency with the Phase 24 pattern of all mutations flowing through Route Handlers.

The Firebase client SDK (`firebase/storage`) is available and already bundled but NOT recommended as the primary upload path for this app. Direct client-side uploads would require Firebase Storage security rules for enforcement, but since all CRUD already flows through server-side Route Handlers with session cookie verification, adding a parallel client-side upload path would create two security enforcement points. Instead, we route all uploads through the server for a single, consistent security boundary.

**Primary recommendation:** Upload files server-side via API Route Handlers using `firebase-admin/storage`. Store download URLs in Firestore project documents. Use `getDownloadURL()` from `firebase-admin/storage` (available in v13.6.1) for permanent download URLs. Deploy Firestore and Storage security rules as defense-in-depth. Background image uploads use a separate PATCH endpoint since they can be changed after project creation (unlike immutable score/audio files).

## Standard Stack

### Core (Already Installed -- No New Dependencies)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| firebase-admin | 13.6.1 | Server-side Storage upload via `getStorage().bucket()`, `getDownloadURL()` | Already installed. `firebase-admin/storage` exports `getStorage` and `getDownloadURL`. Uses `@google-cloud/storage` Bucket/File API under the hood. |
| firebase | 12.9.0 | Client SDK (NOT used for storage uploads -- but `firebase/storage` module exists if needed) | Already installed. `storageBucket` already configured in `firebase-client.ts`. |
| next | 16.1.6 | API Route Handlers for file upload endpoints, `request.formData()` for multipart handling | Already installed. Next.js built-in FormData parsing in Route Handlers. |

### Supporting (No Install Needed)

| Library | Purpose | When to Use |
|---------|---------|-------------|
| `crypto.randomUUID()` | Generate unique file names to avoid collisions | Platform API, no package needed |
| `server-only` | 0.0.1 | Prevent storage admin module leaking to client | Already installed |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Server-side admin upload | Client-side `firebase/storage` direct upload | Client upload enables progress tracking natively, but creates two security enforcement points (rules + route handlers). For files up to 50MB, server proxy is acceptable. |
| `getDownloadURL()` from admin SDK | `getSignedUrl()` with expiry | Signed URLs expire and need regeneration. `getDownloadURL()` returns permanent Firebase-format URLs with download tokens. Better for persistent storage. |
| `getDownloadURL()` from admin SDK | `firebaseStorageDownloadTokens` metadata hack | The hack is undocumented and fragile. `getDownloadURL()` is an official API in firebase-admin v13+. |
| FormData multipart upload | Base64 JSON upload | Base64 encoding increases payload size by 33%. FormData is the standard for file uploads and Next.js Route Handlers parse it natively. |

**Installation:**
```bash
# No new packages needed -- firebase-admin/storage and firebase/storage already available
```

## Architecture Patterns

### Storage Path Structure

```
Firebase Storage bucket: manuscript-test.firebasestorage.app
  users/
    {uid}/
      projects/
        {projectId}/
          score.xml          # or score.musicxml, score.mei, score.mxl
          audio.mp3          # or audio.wav
          background.jpg     # or background.png, background.webp (optional)
```

**Key decisions:**
- Paths mirror the Firestore subcollection structure: `users/{uid}/projects/{projectId}/...`
- Files are named by type (score, audio, background) not by original filename -- prevents path injection and simplifies retrieval
- Original filename is preserved in Firestore metadata for display purposes
- Extension is preserved from the original file for correct MIME type handling

### Extended Firestore Project Document

```typescript
// src/types/project.ts -- extended with file URLs
export interface Project {
  id: string;
  name: string;
  viewMode: 'page';
  createdAt: string;           // ISO 8601
  updatedAt: string;           // ISO 8601
  // NEW: File URLs (populated after storage upload)
  scoreUrl?: string;           // Firebase Storage download URL
  scoreFileName?: string;      // Original filename for display
  audioUrl?: string;           // Firebase Storage download URL
  audioFileName?: string;      // Original filename for display
  backgroundUrl?: string;      // Firebase Storage download URL (optional)
  backgroundFileName?: string; // Original filename for display (optional)
}
```

### New/Modified API Routes

```
src/app/api/
  projects/
    route.ts              # POST: Create project WITH file uploads (multipart FormData)
    [id]/
      route.ts            # DELETE: Delete project + storage files
      background/
        route.ts          # PUT: Upload/replace background image
```

### Pattern 1: Storage Admin Singleton (Server-Only)

**What:** Extend the existing firebase-admin pattern with a Storage instance.
**When:** All Route Handlers that upload/delete files.

```typescript
// src/lib/storage.ts
import 'server-only';
import { getStorage, getDownloadURL } from 'firebase-admin/storage';
import { adminAuth } from '@/lib/firebase-admin';

// Ensure Firebase Admin app is initialized before accessing storage
void adminAuth;

const bucket = getStorage().bucket();

export { bucket, getDownloadURL };
```

**CRITICAL:** The `getStorage().bucket()` call requires that `initializeApp()` was called with a `storageBucket` option, OR the bucket name must be passed explicitly. The current `firebase-admin.ts` does NOT pass `storageBucket`. Two options:
1. **Preferred:** Pass bucket name explicitly: `getStorage().bucket('manuscript-test.firebasestorage.app')`
2. **Alternative:** Add `storageBucket` to the `initializeApp()` config in `firebase-admin.ts`

Option 1 is preferred because it avoids modifying the existing admin init and keeps the storage concern isolated.

### Pattern 2: Server-Side File Upload via FormData

**What:** Client sends files as FormData to API route; route uploads to Storage.
**When:** Project creation (score + audio) and background image upload.

```typescript
// In API Route Handler:
export async function POST(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const formData = await request.formData();
  const scoreFile = formData.get('score') as File | null;
  const audioFile = formData.get('audio') as File | null;
  const name = formData.get('name') as string;

  // Validate files exist and are correct types
  if (!scoreFile || !audioFile || !name?.trim()) {
    return Response.json({ error: 'Missing required fields' }, { status: 400 });
  }

  // Generate project ID
  const projectId = crypto.randomUUID();
  const basePath = `users/${user.uid}/projects/${projectId}`;

  // Upload score file
  const scoreExt = getExtension(scoreFile.name); // e.g., '.musicxml'
  const scoreStoragePath = `${basePath}/score${scoreExt}`;
  const scoreBuffer = Buffer.from(await scoreFile.arrayBuffer());
  const scoreRef = bucket.file(scoreStoragePath);
  await scoreRef.save(scoreBuffer, {
    metadata: { contentType: scoreFile.type },
  });
  const scoreUrl = await getDownloadURL(scoreRef);

  // Upload audio file
  const audioExt = getExtension(audioFile.name); // e.g., '.mp3'
  const audioStoragePath = `${basePath}/audio${audioExt}`;
  const audioBuffer = Buffer.from(await audioFile.arrayBuffer());
  const audioRef = bucket.file(audioStoragePath);
  await audioRef.save(audioBuffer, {
    metadata: { contentType: audioFile.type },
  });
  const audioUrl = await getDownloadURL(audioRef);

  // Create Firestore document with file URLs
  const db = getDb();
  await db
    .collection('users').doc(user.uid)
    .collection('projects').doc(projectId)
    .set({
      name: name.trim(),
      viewMode: 'page',
      scoreUrl,
      scoreFileName: scoreFile.name,
      audioUrl,
      audioFileName: audioFile.name,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

  return Response.json({ id: projectId }, { status: 201 });
}
```

### Pattern 3: Project Creation Flow (Client-Side Changes)

**What:** Modify CreateProjectModal to send files as FormData instead of JSON.
**When:** User clicks "Create" on step 2 of the modal.

```typescript
// In CreateProjectModal.tsx handleCreate():
const formData = new FormData();
formData.append('name', projectName.trim());
formData.append('viewMode', 'page');
formData.append('score', scoreFile);
formData.append('audio', audioFile);

const res = await fetch('/api/projects', {
  method: 'POST',
  body: formData, // NO Content-Type header -- browser sets multipart boundary
});
```

**IMPORTANT:** Do NOT set `Content-Type: application/json` when sending FormData. The browser automatically sets the correct `multipart/form-data` boundary. Setting the header manually breaks the boundary negotiation.

### Pattern 4: Loading Files When Opening a Project

**What:** When the editor page opens, fetch project metadata (including file URLs) and use them to load the score and audio.
**When:** User navigates to `/project/[id]`.

```typescript
// In the editor page or App component:
// 1. Fetch project metadata from API
const res = await fetch(`/api/projects/${projectId}`);
const { project } = await res.json();

// 2. Load score XML from storage URL
const scoreRes = await fetch(project.scoreUrl);
const scoreXml = await scoreRes.text();

// 3. Audio URL can be passed directly to <audio src={project.audioUrl}>
// Firebase download URLs work directly in <audio> and <img> tags

// 4. Background image URL (if set) can be passed directly to the renderer
```

### Pattern 5: Background Image Upload (Mutable, After Creation)

**What:** Background images can be set/replaced in the inspector after project creation.
**When:** User uploads a background image in the UploadDropZone.

```typescript
// PUT /api/projects/[id]/background
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthenticatedUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const formData = await request.formData();
  const bgFile = formData.get('background') as File | null;
  if (!bgFile) return Response.json({ error: 'No file' }, { status: 400 });

  const basePath = `users/${user.uid}/projects/${id}`;

  // Delete existing background if any (list files with prefix)
  const [existingFiles] = await bucket.getFiles({ prefix: `${basePath}/background` });
  for (const f of existingFiles) await f.delete();

  // Upload new background
  const ext = getExtension(bgFile.name);
  const bgRef = bucket.file(`${basePath}/background${ext}`);
  await bgRef.save(Buffer.from(await bgFile.arrayBuffer()), {
    metadata: { contentType: bgFile.type },
  });
  const backgroundUrl = await getDownloadURL(bgRef);

  // Update Firestore
  const db = getDb();
  await db.collection('users').doc(user.uid).collection('projects').doc(id).update({
    backgroundUrl,
    backgroundFileName: bgFile.name,
    updatedAt: FieldValue.serverTimestamp(),
  });

  return Response.json({ backgroundUrl });
}
```

### Pattern 6: Cascade Delete (Project + Storage Files)

**What:** When deleting a project, also delete all its files from Storage.
**When:** DELETE /api/projects/[id].

```typescript
// In the DELETE handler, after verifying ownership:
const basePath = `users/${user.uid}/projects/${id}`;

// Delete all files under the project prefix
await bucket.deleteFiles({ prefix: `${basePath}/` });

// Delete Firestore document
await db.collection('users').doc(user.uid).collection('projects').doc(id).delete();
```

### Pattern 7: Firestore Security Rules

**What:** Defense-in-depth rules for the `users/{userId}/projects` subcollection.
**When:** Deploy alongside the app. Even though the Admin SDK bypasses rules, these protect against misconfigured clients or future client-side access.

```
// firestore.rules
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // User-scoped project documents
    match /users/{userId}/projects/{projectId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }

    // Deny everything else by default
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

### Pattern 8: Storage Security Rules

**What:** User-scoped storage access rules.
**When:** Deploy alongside the app.

```
// storage.rules
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    // User-scoped project files
    match /users/{userId}/projects/{projectId}/{fileName} {
      // Only the file owner can read
      allow read: if request.auth != null && request.auth.uid == userId;

      // Only the file owner can write, with size and type constraints
      allow write: if request.auth != null
                   && request.auth.uid == userId
                   && request.resource.size < 50 * 1024 * 1024;
    }

    // Deny everything else
    match /{allPaths=**} {
      allow read, write: if false;
    }
  }
}
```

**Note:** These rules are defense-in-depth. The primary security enforcement is the server-side session verification in Route Handlers. The Admin SDK bypasses both Firestore and Storage security rules, so these rules only apply to client-side SDK access (which this app does not currently use for data mutations, but may in the future).

### Anti-Patterns to Avoid

- **Sending files as Base64 in JSON:** Inflates payload by 33%, slower to encode/decode. Use FormData for file uploads.
- **Using `getSignedUrl()` for persistent storage:** Signed URLs expire. Use `getDownloadURL()` from `firebase-admin/storage` for permanent URLs.
- **Setting Content-Type header on FormData requests:** Browser sets the correct multipart boundary automatically. Setting it manually breaks the upload.
- **Uploading files client-side with `firebase/storage`:** Creates a parallel security path. All mutations should flow through server-side Route Handlers for consistency.
- **Storing file content in Firestore documents:** Max document size is 1MB. Score files can be 10MB, audio 50MB. Use Storage for files, Firestore for metadata/URLs.
- **Not deleting storage files on project deletion:** Orphaned files accumulate and incur storage costs. Always cascade-delete storage files when deleting a project.
- **Allowing score/audio re-upload after creation:** Per PROJ-03, these are immutable. Only background images can be changed after project creation.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| File upload to cloud storage | Custom S3/GCS integration | `firebase-admin/storage` `bucket.file().save()` | Already bundled with firebase-admin, zero config, same project as Auth/Firestore |
| Permanent download URLs | Custom token generation or signed URL rotation | `getDownloadURL(file)` from `firebase-admin/storage` | Official API in v13+, returns permanent Firebase download URLs |
| Multipart form parsing in API routes | `formidable`, `multer`, `busboy` | `request.formData()` (built into Next.js) | Next.js Route Handlers parse FormData natively. No middleware needed. |
| File type validation on server | Custom MIME sniffing | Extend existing `fileValidation.ts` + check extension server-side | Already have comprehensive validation logic, reuse it |
| Cascade file deletion | Manual file tracking table | `bucket.deleteFiles({ prefix })` | GCS prefix deletion handles all files under a path in one call |
| Security rules deployment | Manual Firebase Console edits | `firebase deploy --only firestore:rules,storage` | CLI deployment is reproducible, version-controlled, part of CI/CD |

**Key insight:** Zero new npm dependencies needed. `firebase-admin/storage` wraps `@google-cloud/storage` which is already a transitive dependency of `firebase-admin`. The `getDownloadURL()` function is a relatively new addition to firebase-admin (v12+) that eliminates the need for the old `firebaseStorageDownloadTokens` metadata hack.

## Common Pitfalls

### Pitfall 1: Admin SDK Storage Bucket Not Configured

**What goes wrong:** `getStorage().bucket()` throws "Storage bucket not specified" because `initializeApp()` was called without a `storageBucket` option.
**Why it happens:** The current `firebase-admin.ts` only configures `credential` for Auth, not `storageBucket` for Storage.
**How to avoid:** Either add `storageBucket` to `initializeApp()` config, or pass the bucket name explicitly: `getStorage().bucket('manuscript-test.firebasestorage.app')`. The explicit approach is safer and avoids touching existing admin init code.
**Warning signs:** "Storage bucket not specified" or "No default bucket" error on first upload attempt.

### Pitfall 2: FormData Content-Type Header Override

**What goes wrong:** File upload fails with a parsing error. The API route receives malformed data.
**Why it happens:** Developer explicitly sets `Content-Type: application/json` or `Content-Type: multipart/form-data` when sending FormData. The browser needs to set the multipart boundary automatically.
**How to avoid:** When using `fetch()` with FormData body, do NOT set the Content-Type header. Let the browser handle it: `fetch(url, { method: 'POST', body: formData })`.
**Warning signs:** "Unexpected end of form" or "Missing boundary" errors in the API route.

### Pitfall 3: Memory Pressure from Large File Buffers

**What goes wrong:** API route runs out of memory when handling large audio files (up to 50MB).
**Why it happens:** `Buffer.from(await file.arrayBuffer())` loads the entire file into memory. With multiple concurrent uploads, this can exhaust serverless function memory.
**How to avoid:** For this app's file size limits (score: 10MB, audio: 50MB, image: 20MB), buffering is acceptable. But enforce size limits server-side BEFORE creating the buffer. Check `file.size` from the FormData entry and reject oversized files early.
**Warning signs:** Process crashes or 502 errors during large file uploads.

### Pitfall 4: Download URL Becoming Invalid

**What goes wrong:** Stored download URLs stop working after the file is overwritten or the storage token is revoked.
**Why it happens:** `getDownloadURL()` returns a URL containing a download token. If the file is re-uploaded (overwritten), the token changes and the old URL becomes invalid.
**How to avoid:** For immutable files (score, audio), this is not an issue -- they are uploaded once and never overwritten. For background images, which can be replaced, always update the Firestore URL when uploading a new background. Delete the old file first, upload the new one, get a new URL, update Firestore.
**Warning signs:** Previously working project files return 403 or 404 errors.

### Pitfall 5: Race Condition in Undo-Delete with Storage

**What goes wrong:** User deletes a project, storage files are deleted, then user clicks "Undo" -- but files are already gone from Storage.
**Why it happens:** The current Phase 24 pattern delays Firestore deletion by 5 seconds for undo, but if storage deletion is added to the same delayed handler, files are permanently lost on undo.
**How to avoid:** On undo-delete, only delete the Firestore document in the delayed handler. Storage file deletion should happen separately (either immediately if no undo, or as a deferred cleanup). Alternatively, the simplest approach: only delete storage files inside the actual DELETE API route handler that fires after the undo window, not client-side. This is already the pattern -- the delayed `fetch('/api/projects/${id}', { method: 'DELETE' })` call happens after 5 seconds, and the DELETE handler cascades to storage.
**Warning signs:** Undone projects show broken file links.

### Pitfall 6: CORS Issues with Firebase Storage Download URLs

**What goes wrong:** Fetching score XML from a Firebase Storage download URL in the browser fails with a CORS error.
**Why it happens:** Firebase Storage download URLs (the ones with `alt=media&token=...`) are publicly accessible and should not have CORS issues for simple GET requests. However, if the request includes non-simple headers, CORS may apply.
**How to avoid:** For score files, use a simple `fetch(scoreUrl)` without custom headers. For audio/image files, pass the URL directly as `src` attributes on `<audio>` and `<img>` elements (no CORS issues with HTML element loading). If CORS issues arise, configure CORS on the GCS bucket via `gsutil cors set`.
**Warning signs:** "Access to fetch has been blocked by CORS policy" in browser console when loading score files.

### Pitfall 7: Firebase Storage Not Enabled

**What goes wrong:** Upload fails with "Storage bucket does not exist" or permission denied.
**Why it happens:** Firebase Storage may not be enabled in the Firebase Console yet. The storage bucket URL in the config may not correspond to an active bucket.
**How to avoid:** Ensure Firebase Storage is enabled in the Firebase Console before implementing. Navigate to Storage in the console and click "Get started" if it shows a setup prompt. The bucket name `manuscript-test.firebasestorage.app` should already be provisioned if Storage was enabled.
**Warning signs:** "The specified bucket does not exist" or "Caller does not have permission" errors.

## Code Examples

### Storage Singleton Module

```typescript
// src/lib/storage.ts
// Source: firebase-admin v13.6.1 installed package, verified exports
import 'server-only';
import { getStorage, getDownloadURL } from 'firebase-admin/storage';
import { adminAuth } from '@/lib/firebase-admin';

// Trigger admin app initialization via proxy access
void adminAuth;

const STORAGE_BUCKET = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET!;
const bucket = getStorage().bucket(STORAGE_BUCKET);

export { bucket, getDownloadURL };
```

### File Upload Helper

```typescript
// src/lib/storage.ts (continued)
import type { File as GCSFile } from '@google-cloud/storage';

/**
 * Upload a file buffer to Firebase Storage and return the download URL.
 */
export async function uploadFile(
  storagePath: string,
  buffer: Buffer,
  contentType: string
): Promise<{ url: string; ref: GCSFile }> {
  const fileRef = bucket.file(storagePath);
  await fileRef.save(buffer, {
    metadata: { contentType },
  });
  const url = await getDownloadURL(fileRef);
  return { url, ref: fileRef };
}

/**
 * Delete all files under a Storage prefix (e.g., a project folder).
 */
export async function deleteProjectFiles(uid: string, projectId: string): Promise<void> {
  const prefix = `users/${uid}/projects/${projectId}/`;
  await bucket.deleteFiles({ prefix });
}
```

### Modified Project Creation Route (FormData)

```typescript
// src/app/api/projects/route.ts
import { cookies } from 'next/headers';
import { adminAuth } from '@/lib/firebase-admin';
import { getDb, FieldValue } from '@/lib/firestore';
import { uploadFile } from '@/lib/storage';

// POST: Create project with file uploads
export async function POST(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const formData = await request.formData();
  const name = formData.get('name') as string;
  const scoreFile = formData.get('score') as File | null;
  const audioFile = formData.get('audio') as File | null;

  if (!name?.trim() || !scoreFile || !audioFile) {
    return Response.json({ error: 'Missing required fields' }, { status: 400 });
  }

  // Server-side file validation
  // ...validate extensions and sizes...

  const projectId = crypto.randomUUID();
  const basePath = `users/${user.uid}/projects/${projectId}`;

  // Upload files to Storage
  const scoreExt = getExtension(scoreFile.name);
  const { url: scoreUrl } = await uploadFile(
    `${basePath}/score${scoreExt}`,
    Buffer.from(await scoreFile.arrayBuffer()),
    scoreFile.type || 'application/xml'
  );

  const audioExt = getExtension(audioFile.name);
  const { url: audioUrl } = await uploadFile(
    `${basePath}/audio${audioExt}`,
    Buffer.from(await audioFile.arrayBuffer()),
    audioFile.type || 'audio/mpeg'
  );

  // Create Firestore document
  const db = getDb();
  await db
    .collection('users').doc(user.uid)
    .collection('projects').doc(projectId)
    .set({
      name: name.trim(),
      viewMode: 'page',
      scoreUrl,
      scoreFileName: scoreFile.name,
      audioUrl,
      audioFileName: audioFile.name,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

  return Response.json({ id: projectId }, { status: 201 });
}
```

### Project Data Loading in Editor

```typescript
// In App.tsx or a useEffect in the editor:
useEffect(() => {
  if (!projectId) return;

  async function loadProject() {
    const res = await fetch(`/api/projects/${projectId}`);
    if (!res.ok) return;
    const { project } = await res.json();

    // Load score XML from download URL
    if (project.scoreUrl) {
      const scoreRes = await fetch(project.scoreUrl);
      const xml = await scoreRes.text();
      setMusicXMLFile({
        xml,
        name: project.scoreFileName,
        measureCount: 0, // Will be set after Verovio processes it
      });
    }

    // Audio URL can be used directly
    if (project.audioUrl) {
      setAudioFile({
        url: project.audioUrl,
        name: project.audioFileName,
        file: null as any, // No File object when loading from URL
      });
    }

    // Background image URL can be used directly
    if (project.backgroundUrl) {
      setBgUrl(project.backgroundUrl);
      setBgFileName(project.backgroundFileName);
    }
  }

  loadProject();
}, [projectId]);
```

### GET Single Project Route

```typescript
// src/app/api/projects/[id]/route.ts -- add GET handler
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthenticatedUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const db = getDb();
  const doc = await db
    .collection('users').doc(user.uid)
    .collection('projects').doc(id)
    .get();

  if (!doc.exists) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  const data = doc.data()!;
  return Response.json({
    project: {
      id: doc.id,
      ...data,
      createdAt: data.createdAt?.toDate().toISOString(),
      updatedAt: data.updatedAt?.toDate().toISOString(),
    },
  });
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `firebaseStorageDownloadTokens` metadata hack | `getDownloadURL(file)` from `firebase-admin/storage` | firebase-admin v12+ (2024) | Official API, no UUID dependency, no undocumented metadata |
| Signed URLs with expiry for downloads | Permanent download URLs via `getDownloadURL()` | firebase-admin v12+ | No need to refresh URLs, simpler architecture |
| Client-side direct upload with security rules | Server-side upload via API routes | Next.js App Router pattern (2023+) | Single security boundary, consistent with existing CRUD pattern |
| `multer`/`formidable` for multipart parsing | `request.formData()` native API | Next.js 13+ Route Handlers | Zero dependency multipart parsing, built into the platform |
| Manual bucket CORS configuration | Firebase download URLs (no CORS needed) | Firebase Storage | Download URLs with tokens bypass CORS for simple requests |

**Deprecated/outdated:**
- `firebase-admin` `bucket.upload(localPath)`: This uploads from the server filesystem. For Next.js Route Handlers, use `file.save(buffer)` instead since files come as buffers from FormData.
- `makePublic()` + `publicUrl()`: Makes files world-readable without any token. Not appropriate for user-scoped files.
- Custom download token generation via `firebaseStorageDownloadTokens` metadata: Undocumented, fragile. Use `getDownloadURL()` instead.

## Open Questions

1. **Next.js Body Size Limit for File Uploads**
   - What we know: Next.js Route Handlers have a default body size limit. The audio file limit is 50MB.
   - What's unclear: Whether Next.js 16's default body size limit accommodates 50MB uploads. Previous versions had a 4MB default.
   - Recommendation: Configure `next.config.ts` to set a higher body size limit for the projects API route if needed. Check `experimental.serverActions.bodySizeLimit` or route segment config `export const maxDuration = ...` and body size config.

2. **Audio File Type in Firestore**
   - What we know: `audioFile` state currently has a `file: File` property used for exports. When loading from a URL, there is no `File` object.
   - What's unclear: Whether the export functionality still works when `audioFile.file` is null (loaded from URL).
   - Recommendation: The export service already receives the audio file via upload (see `requestExport` in `exportClient.ts`). When loading from a URL, the export flow would need to either fetch the audio from the URL or pass the URL to the export service. This may need adjustment but is likely out of scope for this phase. For now, set `file` to a dummy or refactor the type to allow `url` as an alternative to `file`.

3. **Firebase Storage Activation**
   - What we know: The storage bucket `manuscript-test.firebasestorage.app` is configured in environment variables.
   - What's unclear: Whether Firebase Storage is already enabled in the Firebase Console.
   - Recommendation: Include a setup verification step in the plan.

## Sources

### Primary (HIGH confidence)
- `firebase-admin@13.6.1` installed package: `lib/storage/index.d.ts` -- verified exports of `getStorage`, `getDownloadURL`, `Storage` class with `bucket(name?)` method
- `firebase-admin@13.6.1` installed package: `lib/storage/storage.d.ts` -- verified `Bucket` from `@google-cloud/storage` returned by `bucket()`
- `firebase@12.9.0` installed package: `storage/` submodule exists with `dist/` and `package.json`
- [Firebase Admin Storage docs](https://firebase.google.com/docs/storage/admin/start) -- initialization pattern, bucket access
- [Firebase Storage upload docs](https://firebase.google.com/docs/storage/web/upload-files) -- upload patterns, getDownloadURL
- [Firebase Storage security rules](https://firebase.google.com/docs/storage/security/rules-conditions) -- request.resource.size, request.resource.contentType, path-based ownership
- [Firebase Firestore security rules structure](https://firebase.google.com/docs/firestore/security/rules-structure) -- subcollection match patterns

### Secondary (MEDIUM confidence)
- [Firebase Storage download URLs guide](https://www.sentinelstand.com/article/guide-to-firebase-storage-download-urls-tokens) -- download URL types comparison: permanent, signed, public
- [Next.js file upload patterns](https://www.pronextjs.dev/next-js-file-uploads-server-side-solutions) -- FormData handling in Route Handlers
- [Firebase Admin Storage issue #474](https://github.com/firebase/firebase-admin-node/issues/474) -- community patterns for buffer uploads

### Tertiary (LOW confidence)
- Next.js 16 body size limits -- needs runtime verification, documentation is sparse for v16 specifically
- Firebase Storage CORS behavior with download URLs -- generally works for simple requests, but edge cases may exist

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all dependencies already installed, `getStorage` and `getDownloadURL` verified in installed package type definitions
- Architecture: HIGH -- server-side upload via Route Handlers is consistent with Phase 24 patterns, FormData parsing is native to Next.js
- Security rules: HIGH -- well-documented Firebase feature, standard user-scoped pattern
- Pitfalls: HIGH -- identified from direct codebase analysis (admin init pattern, existing file handling, undo-delete flow)
- File loading flow: MEDIUM -- download URLs should work in `<audio>` and `fetch()`, but CORS edge cases and export integration need runtime verification

**Research date:** 2026-02-11
**Valid until:** 2026-03-11 (stable -- Firebase Admin Storage API is mature, all deps already locked)
