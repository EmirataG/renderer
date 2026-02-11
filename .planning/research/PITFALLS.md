# Domain Pitfalls: Next.js Migration + Firebase Backend

**Domain:** Full-stack migration from Vite SPA to Next.js App Router with Firebase Auth, Firestore, and Storage
**Researched:** 2026-02-11
**Confidence:** HIGH

---

## Critical Pitfalls

Mistakes that cause build failures, security vulnerabilities, data loss, or full rewrites.

---

### Pitfall 1: Verovio WASM Executes Server-Side and Crashes the Build

**What goes wrong:**
Verovio loads via two imports: `import createVerovioModule from 'verovio/wasm'` and `import { VerovioToolkit } from 'verovio/esm'`. The WASM module requires browser APIs (`WebAssembly.instantiate`, `fetch` for the `.wasm` binary). Next.js App Router server components run in Node.js where these browser-specific WASM loading patterns fail. If any server component imports a file that transitively imports `verovioService.ts`, the build crashes with `WebAssembly is not defined` or `ReferenceError: document is not defined`.

**Why it happens:**
Next.js statically analyzes imports to determine which code runs on the server vs client. Without an explicit `'use client'` boundary, the bundler tries to include everything in the server bundle. The editor page's server component fetches project data, then renders the client component. If the import chain from the server component reaches Verovio, the server-side bundler attempts to process the WASM imports.

**Consequences:**
- `next build` fails with WASM-related errors
- Development server crashes on page load
- If the error is intermittent (only on first SSR render), it appears as a hydration mismatch instead of a clear error

**Prevention:**
1. Use `dynamic(() => import('./EditorClient'), { ssr: false })` for the entire editor component. This tells Next.js to never render it on the server.
2. Ensure the `'use client'` directive is on `EditorClient.tsx`, which contains all Verovio-dependent code.
3. Never import `verovioService.ts`, renderer components, or any file that transitively imports Verovio from a server component.
4. Test with `next build` early -- SSR issues only surface during build or first server render, not during client-side navigation.

**Detection:**
- `next build` fails with WASM or browser API errors
- Server-side console shows `ReferenceError: document is not defined`
- Page works on client navigation but crashes on hard refresh (server render)

**Recovery cost:** LOW (1-2 hours) -- add `dynamic({ ssr: false })` and move imports behind the client boundary.

**Phase to address:** Phase 1 (Next.js scaffold) -- validate immediately after moving editor code.

---

### Pitfall 2: firebase-admin Credentials Leak into Client Bundle

**What goes wrong:**
`firebase-admin` is initialized with a service account private key (`FIREBASE_ADMIN_PRIVATE_KEY`). If any client component imports a file that imports `lib/firebase/admin.ts`, Next.js bundles `firebase-admin` into the client JavaScript. This exposes:
- The service account private key (full admin access to Firebase project)
- The `firebase-admin` package itself (depends on Node.js `fs`, `net`, `http2` -- client build fails)

Even if the build fails (likely, due to Node.js API dependencies), the attempt to bundle reveals the import chain problem. In the worst case, with aggressive polyfilling, the private key ships to the browser.

**Why it happens:**
Server components and client components share the same file system. A developer adds a "convenience" re-export: `lib/firebase/index.ts` that exports both client and admin SDKs. A client component imports from this barrel file, pulling in the admin SDK.

**Consequences:**
- Full admin access to Firebase project exposed to any user
- Attacker can read/write/delete any Firestore document, Storage file, or user account
- Build failure with `Module not found: Can't resolve 'fs'` (best case)
- Silent credential exposure (worst case with polyfills)

**Prevention:**
1. Keep `lib/firebase/client.ts` and `lib/firebase/admin.ts` as completely separate files. Never create a barrel `index.ts` that re-exports both.
2. Add `firebase-admin` to `next.config.ts` server-only packages:
   ```typescript
   // next.config.ts
   const nextConfig = {
     serverExternalPackages: ['firebase-admin'],
   };
   ```
3. Use the `server-only` npm package as a guard:
   ```typescript
   // lib/firebase/admin.ts
   import 'server-only'; // Throws build error if imported in client code
   import { initializeApp, cert } from 'firebase-admin/app';
   ```
4. Never use environment variables without `NEXT_PUBLIC_` prefix in client code. Firebase Admin credentials use `FIREBASE_ADMIN_*` (no NEXT_PUBLIC_ prefix), so they are server-only by default.

**Detection:**
- Build error: `Module not found: Can't resolve 'fs'` in client bundle
- Bundle analyzer shows `firebase-admin` in client chunks
- `.env` variables without `NEXT_PUBLIC_` prefix appear in browser DevTools

**Recovery cost:** LOW (1 hour) if caught during development. CRITICAL if credentials are deployed to production.

**Phase to address:** Phase 2 (Firebase Auth) -- establish SDK separation patterns before any Firebase code.

---

### Pitfall 3: Map Serialization Silently Loses syncAnchors Data

**What goes wrong:**
The existing codebase uses `Map<string, number>` for `syncAnchors` (event ID to timestamp mappings). When saving to Firestore, `JSON.stringify(new Map([['a', 1]]))` produces `'{}'` -- an empty object. All sync anchor data is silently lost. When the project is loaded from Firestore, the Map is empty, and the editor has no timing data for note animations.

This also affects the server component to client component data boundary. Next.js serializes props from server components to client components using a React-internal serialization format that also does not support Maps.

**Why it happens:**
`JSON.stringify` does not know how to serialize Map objects. It sees a Map as a plain object with no enumerable properties and produces `{}`. This is a well-known JavaScript gotcha, but it is silent -- no error is thrown, no warning is logged.

**Consequences:**
- All sync anchors lost on save (animation timing data gone)
- User opens project and all note-to-audio synchronization is missing
- No error message -- the save appears to succeed
- Data loss is only discovered when user reopens the project

**Prevention:**
1. Convert Maps to plain objects before Firestore writes:
   ```typescript
   // Serialize
   const data = {
     syncAnchors: Object.fromEntries(syncAnchors),
   };
   await setDoc(projectRef, data, { merge: true });
   ```
2. Convert back on load:
   ```typescript
   // Deserialize
   const syncAnchors = new Map(Object.entries(data.syncAnchors ?? {}));
   ```
3. Add a `getSnapshot()` method to the project store that handles all serialization:
   ```typescript
   getSnapshot: () => ({
     ...get(),
     syncAnchors: Object.fromEntries(get().syncAnchors),
   }),
   ```
4. Add a unit test that round-trips syncAnchors through serialization:
   ```typescript
   test('syncAnchors survives serialization', () => {
     const original = new Map([['note-1', 2.5], ['note-2', 5.0]]);
     const serialized = Object.fromEntries(original);
     const restored = new Map(Object.entries(serialized));
     expect(restored).toEqual(original);
   });
   ```

**Detection:**
- Open a saved project: sync anchors are empty
- `JSON.stringify(store.syncAnchors)` returns `'{}'` or `'{}'`
- Firestore console shows `syncAnchors: {}` for a project that should have data

**Recovery cost:** LOW (1-2 hours) for the fix. HIGH for lost user data if deployed without the fix.

**Phase to address:** Phase 3 (Firestore data model) -- define serialization patterns before first write.

---

### Pitfall 4: Session Cookie Expires with No Refresh Flow

**What goes wrong:**
Firebase session cookies have a maximum lifetime of 14 days (set at creation time, non-extendable). After 14 days, the session cookie is invalid. `verifySessionCookie()` throws, proxy.ts redirects to `/login`, and the user is logged out mid-work. If the user is in the middle of editing, unsaved changes since the last auto-save are lost.

Unlike Firebase Auth ID tokens (which auto-refresh via the client SDK every hour), session cookies cannot be refreshed server-side. The only way to extend the session is to create a new session cookie from a fresh ID token.

**Why it happens:**
Firebase session cookies are created once and have a fixed expiration. There is no refresh mechanism built into the session cookie API. The Firebase client SDK refreshes ID tokens automatically, but the server-side session cookie is independent.

**Consequences:**
- User silently logged out after 14 days
- If auto-save fails due to expired session, data loss
- User sees login page without understanding why
- If multiple tabs are open, all tabs redirect simultaneously

**Prevention:**
1. Check cookie expiration client-side and proactively refresh:
   ```typescript
   // In AuthProvider, periodically check token freshness
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
     }, 24 * 60 * 60 * 1000); // Every 24 hours
     return () => clearInterval(interval);
   }, []);
   ```
2. On any 401 response from the server, redirect to a silent re-auth flow rather than the login page:
   ```typescript
   // In proxy.ts or API route error handling
   if (sessionExpired) {
     // Redirect to /auth/refresh which silently gets new token
     return NextResponse.redirect('/auth/refresh');
   }
   ```
3. Set session cookie to 14 days (maximum) and refresh before expiration:
   ```typescript
   // Create session with maximum duration
   const sessionCookie = await adminAuth.createSessionCookie(idToken, {
     expiresIn: 14 * 24 * 60 * 60 * 1000, // 14 days in ms
   });
   ```
4. Handle auto-save failures gracefully: if a Firestore write fails due to auth, queue the change locally and retry after re-authentication.

**Detection:**
- Users report being logged out unexpectedly after ~2 weeks
- Server logs show `auth/session-cookie-expired` errors
- Auto-save status shows "Error" but no clear user message

**Recovery cost:** MEDIUM (4-6 hours) -- implement refresh flow, handle edge cases.

**Phase to address:** Phase 2 (Firebase Auth) -- design the refresh flow alongside initial session implementation.

---

### Pitfall 5: Firestore Writes Fail Silently When Offline or Rate-Limited

**What goes wrong:**
The auto-save pattern uses `setDoc(ref, data, { merge: true })` which returns a Promise. If the user's internet drops or Firestore rate-limits the client, the write fails. If the failure is not caught and surfaced, the user sees "Saved" (from the debounce completing) but the data never reached Firestore. When they close the browser and reopen, changes are lost.

Firestore's client SDK has offline persistence enabled by default in web apps. This means writes appear to succeed locally (the Promise resolves) but may fail to sync to the server. If the user closes the browser before the offline queue flushes, pending writes are lost.

**Why it happens:**
Firestore's offline persistence stores writes in IndexedDB and syncs when connectivity returns. But IndexedDB data is per-origin and per-browser. If the user switches browsers, clears cache, or the tab crashes, the pending writes are gone. The Promise from `setDoc` resolves when the local cache is updated, NOT when the server confirms the write.

**Consequences:**
- User thinks data is saved but it only exists in local IndexedDB
- Closing browser before sync = data loss
- Auto-save indicator shows "Saved" but server never received the data
- Project appears empty or with old data on next login (different browser/device)

**Prevention:**
1. Use `onSnapshot` with `{ includeMetadataChanges: true }` to detect pending writes:
   ```typescript
   onSnapshot(
     projectRef,
     { includeMetadataChanges: true },
     (snapshot) => {
       if (snapshot.metadata.hasPendingWrites) {
         setSaveStatus('pending'); // "Saving..." or "Offline"
       } else {
         setSaveStatus('saved'); // Confirmed by server
       }
     }
   );
   ```
2. Only show "Saved" when the server confirms (no pending writes).
3. Show a warning when the user tries to close the tab with pending writes:
   ```typescript
   useEffect(() => {
     const handler = (e: BeforeUnloadEvent) => {
       if (hasPendingWrites) {
         e.preventDefault();
         return 'You have unsaved changes.';
       }
     };
     window.addEventListener('beforeunload', handler);
     return () => window.removeEventListener('beforeunload', handler);
   }, [hasPendingWrites]);
   ```
4. Consider disabling offline persistence to make save failures explicit:
   ```typescript
   import { initializeFirestore, memoryLocalCache } from 'firebase/firestore';
   const db = initializeFirestore(app, {
     localCache: memoryLocalCache(),
   });
   ```
   Trade-off: saves fail immediately when offline (clear error) but no offline support.

**Detection:**
- Save indicator says "Saved" but data missing on reload
- `snapshot.metadata.hasPendingWrites` is true for extended periods
- Firestore console shows old data after user reports saving

**Recovery cost:** MEDIUM (4-6 hours) -- implement proper save status tracking with metadata changes.

**Phase to address:** Phase 5 (Auto-save) -- design save status from the start, not as an afterthought.

---

## Moderate Pitfalls

Mistakes that cause degraded UX, significant debugging time, or require non-trivial fixes.

---

### Pitfall 6: import.meta.env Migration Breaks Export Service Integration

**What goes wrong:**
The existing codebase uses Vite's `import.meta.env.DEV` and `import.meta.env.VITE_*` patterns. Next.js uses `process.env.NODE_ENV === 'development'` and `process.env.NEXT_PUBLIC_*`. If these are not migrated, the build fails with `import.meta.env is not defined` or the export service URL resolves to `undefined`.

The `exportClient.ts` file uses `import.meta.env.DEV` to determine whether to connect to `localhost:3001` (dev) or the production export service URL. If this is not migrated, the editor cannot communicate with the export service.

**Why it happens:**
`import.meta.env` is a Vite-specific API. Next.js does not support it. The migration requires a search-and-replace across the codebase, but some uses are subtle (e.g., dynamic import paths based on env vars).

**Consequences:**
- Build failure: `import.meta.env` is not defined
- Export button silently fails (URL is `undefined`)
- Dev/prod environment detection broken (always dev or always prod)

**Prevention:**
1. Global search for `import.meta.env` and replace all occurrences:
   - `import.meta.env.DEV` -> `process.env.NODE_ENV === 'development'`
   - `import.meta.env.PROD` -> `process.env.NODE_ENV === 'production'`
   - `import.meta.env.VITE_*` -> `process.env.NEXT_PUBLIC_*`
2. Update `.env` files to use `NEXT_PUBLIC_` prefix for client-accessible vars.
3. Test export service connectivity in development after migration.

**Detection:**
- Build error mentioning `import.meta.env`
- Export button does nothing (fetch to `undefined` URL)
- Console error: `TypeError: Failed to fetch` with URL `undefined`

**Recovery cost:** LOW (1-2 hours) -- find and replace.

**Phase to address:** Phase 1 (Next.js scaffold) -- migrate during initial code move.

---

### Pitfall 7: Turbopack Fails with Verovio WASM (Fallback to Webpack Needed)

**What goes wrong:**
Next.js 16 uses Turbopack by default for both dev and build. While Turbopack supports client-side WASM imports, Verovio's specific ESM/WASM dual-import pattern (`import createVerovioModule from 'verovio/wasm'` + `import { VerovioToolkit } from 'verovio/esm'`) may not work out of the box. Verovio's package exports map (`verovio/wasm` and `verovio/esm`) must be resolved correctly by Turbopack, and the WASM file must be served correctly in development.

**Why it happens:**
Turbopack is a different bundler than Webpack with different module resolution behavior. While basic WASM support exists (confirmed by closed GitHub issue #84972), complex package export maps and WASM loading patterns are not exhaustively tested. Verovio's specific pattern of loading WASM through an ESM wrapper function is uncommon.

**Consequences:**
- Dev server fails to start or page crashes on editor load
- Build succeeds but WASM file not found at runtime (404)
- Module resolution error for `verovio/wasm` or `verovio/esm`

**Prevention:**
1. Test Verovio with Turbopack immediately in Phase 1. Do not proceed to Phase 2 until WASM loads.
2. Have webpack as fallback ready:
   ```typescript
   // next.config.ts
   const nextConfig = {
     // If Turbopack fails with Verovio WASM:
     // Run: next dev --webpack
     // Run: next build --webpack
     webpack: (config) => {
       config.experiments = { ...config.experiments, asyncWebAssembly: true };
       return config;
     },
   };
   ```
3. If Turbopack works in dev but fails in build (or vice versa), use `--webpack` flag for the failing command only.
4. Document which bundler works for future team members.

**Detection:**
- `next dev` shows WASM-related error
- Score page is blank (WASM failed to load)
- Console: `TypeError: createVerovioModule is not a function`
- Network tab: 404 for `.wasm` file

**Recovery cost:** LOW (30 minutes) -- add `--webpack` flag to scripts.

**Phase to address:** Phase 1 (Next.js scaffold) -- first validation task.

---

### Pitfall 8: Firestore Security Rules Allow Unauthorized Access

**What goes wrong:**
Firestore defaults to deny-all rules in production. Developers often set permissive rules during development (`allow read, write: if true`) and forget to lock them down before deployment. Alternatively, they write rules that check authentication but not ownership:

```
// BAD: Any authenticated user can read/write ANY project
match /projects/{projectId} {
  allow read, write: if request.auth != null;
}
```

This means User A can read and modify User B's projects.

**Why it happens:**
Firestore security rules are separate from application code. They are deployed independently and are easy to forget. During development, permissive rules speed up iteration, but they create a habit of ignoring the rules file.

**Consequences:**
- Any authenticated user can read all projects (privacy violation)
- Any authenticated user can delete or overwrite other users' projects
- Storage files accessible to any authenticated user (if Storage rules are similarly permissive)

**Prevention:**
1. Write ownership-based rules from day one:
   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /projects/{projectId} {
         allow read, write: if request.auth != null
           && request.auth.uid == resource.data.ownerId;
         allow create: if request.auth != null
           && request.auth.uid == request.resource.data.ownerId;
       }
     }
   }
   ```
2. Write matching Storage rules:
   ```
   rules_version = '2';
   service firebase.storage {
     match /b/{bucket}/o {
       match /users/{userId}/projects/{allPaths=**} {
         allow read, write: if request.auth != null
           && request.auth.uid == userId;
       }
     }
   }
   ```
3. Deploy rules as part of the CI/CD pipeline, not manually.
4. Test rules with the Firebase Emulator Suite before deploying.

**Detection:**
- Firebase Console > Firestore > Rules shows permissive rules
- User can access `/editor/{otherUsersProjectId}` and see content
- Firebase sends warning emails about insecure rules

**Recovery cost:** LOW (1-2 hours) for the fix. Potentially catastrophic if exploited before fixing.

**Phase to address:** Phase 3 (Firestore data model) -- deploy strict rules before storing any user data.

---

### Pitfall 9: Auto-Save Writes Storm Firestore (Cost + Rate Limits)

**What goes wrong:**
Without debouncing, every slider adjustment, color picker change, or scroll position update triggers a Firestore write. A user adjusting a slider produces 20-50 intermediate values in a second. At $0.18 per 100K writes, this seems cheap -- but multiply by many users and many editing sessions, and costs escalate. More importantly, Firestore has a per-document write limit of 1 write per second sustained. Exceeding this causes write contention errors.

**Why it happens:**
React state updates are fast. Zustand store changes fire synchronously. Without a debounce, every `set()` call triggers a Firestore write. A 3-second slider drag produces 50+ writes to the same document.

**Consequences:**
- Firestore write contention errors (`ABORTED: Too much contention on these documents`)
- Unexpectedly high Firestore costs
- Auto-save indicator flickers rapidly between "Saving..." and "Saved"
- Potential data inconsistency if writes arrive out of order

**Prevention:**
1. Debounce all auto-save writes with 1500ms delay:
   ```typescript
   import { useDebouncedCallback } from 'use-debounce';

   const saveToFirestore = useDebouncedCallback(async (data) => {
     await setDoc(projectRef, data, { merge: true });
   }, 1500);
   ```
2. Only write changed fields (use `{ merge: true }` or update specific fields):
   ```typescript
   // Instead of writing the entire document every time
   await updateDoc(projectRef, {
     scoreColor: newColor,
     updatedAt: serverTimestamp(),
   });
   ```
3. Batch related changes into a single write:
   ```typescript
   // Subscribe to entire store, debounce, write snapshot
   useProjectStore.subscribe((state, prevState) => {
     saveToFirestore(state.getSnapshot());
   });
   ```
4. Monitor Firestore usage in Firebase Console > Usage tab.

**Detection:**
- Firebase Console shows unexpectedly high write counts
- Console errors: `ABORTED: Too much contention`
- Auto-save status flickers
- Firebase billing alerts

**Recovery cost:** LOW (2-3 hours) -- add debounce.

**Phase to address:** Phase 5 (Auto-save) -- debounce is mandatory from the first implementation.

---

### Pitfall 10: Next.js 16 async params Break Page Components

**What goes wrong:**
Next.js 16 changed `params` and `searchParams` to be async (Promises). Code written for Next.js 15 or earlier that destructures params synchronously breaks:

```typescript
// BROKEN in Next.js 16
export default function EditorPage({ params }: { params: { id: string } }) {
  const project = await getProject(params.id); // params.id is undefined
}

// CORRECT in Next.js 16
export default async function EditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await getProject(id);
}
```

**Why it happens:**
Next.js 16 made `params` async to support future streaming and partial rendering optimizations. The change was announced in the upgrade guide, but many tutorials, blog posts, and AI coding assistants still generate the old synchronous pattern.

**Consequences:**
- `params.id` is `undefined` (accessing `.id` on a Promise)
- Page renders with wrong data or shows "not found"
- TypeScript may not catch this if types are not updated

**Prevention:**
1. Always `await params` before accessing properties.
2. Use the correct type signature: `{ params: Promise<{ id: string }> }`.
3. Follow the Next.js 16 upgrade guide for all dynamic routes.
4. If using a codemod, run `npx @next/codemod@latest upgrade` to auto-fix.

**Detection:**
- Dynamic route pages show "not found" or render with undefined data
- `console.log(params)` shows a Promise object, not an object with route segments
- TypeScript error if types are correctly configured

**Recovery cost:** LOW (30 minutes) -- add `await` to params access.

**Phase to address:** Phase 1 (Next.js scaffold) -- use correct patterns from the start.

---

## Minor Pitfalls

Mistakes that cause annoyance or minor quality issues but are quickly fixed.

---

### Pitfall 11: NEXT_PUBLIC_ Prefix Missing on Client Environment Variables

**What goes wrong:**
Next.js requires the `NEXT_PUBLIC_` prefix for environment variables accessible in client-side code. Firebase client config (API key, auth domain, project ID, etc.) must use this prefix. Without it, `process.env.FIREBASE_API_KEY` is `undefined` in the browser, and Firebase initialization fails silently (or with a cryptic "No Firebase App" error).

**Prevention:**
```
# .env.local
NEXT_PUBLIC_FIREBASE_API_KEY=AIza...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=project-id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456
NEXT_PUBLIC_FIREBASE_APP_ID=1:123456:web:abc

# Server-only (no NEXT_PUBLIC_ prefix)
FIREBASE_ADMIN_PROJECT_ID=project-id
FIREBASE_ADMIN_CLIENT_EMAIL=firebase-adminsdk@project.iam.gserviceaccount.com
FIREBASE_ADMIN_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n..."
```

**Detection:** Firebase SDK logs `FirebaseError: No Firebase App '[DEFAULT]' has been created`.

**Recovery cost:** LOW (15 minutes).

**Phase to address:** Phase 1 (Next.js scaffold).

---

### Pitfall 12: Firebase __session Cookie Name Required on Firebase Hosting

**What goes wrong:**
If deploying to Firebase Hosting (even via a Cloud Run backend), Firebase's CDN strips all cookies EXCEPT those named `__session`. If the session cookie is named anything else (e.g., `session`, `token`, `auth`), it is stripped by the CDN and never reaches the server.

**Why it happens:**
Firebase Hosting's CDN caches responses aggressively. To prevent user-specific data from being cached, it only forwards the `__session` cookie. This is documented but easy to miss.

**Prevention:**
- Always name the session cookie `__session`.
- If not using Firebase Hosting, any cookie name works, but `__session` is a safe default regardless.

**Detection:** Auth works in dev (localhost, no CDN) but fails in production (cookie stripped).

**Recovery cost:** LOW (15 minutes) -- rename the cookie.

**Phase to address:** Phase 2 (Firebase Auth).

---

### Pitfall 13: Firestore Timestamps Serialize as Objects, Not Dates

**What goes wrong:**
Firestore `serverTimestamp()` stores timestamps as Firestore Timestamp objects. When read back, they are `{ seconds: number, nanoseconds: number }` objects, not JavaScript `Date` objects. If code expects `createdAt` to be a Date (e.g., `project.createdAt.toLocaleDateString()`), it fails.

When passing Firestore data from server components to client components, Timestamp objects must be serialized to plain values because React serialization does not support Firestore Timestamp class instances.

**Prevention:**
```typescript
// Convert Timestamp to ISO string before passing as props
const project = {
  ...projectSnap.data(),
  createdAt: projectSnap.data().createdAt?.toDate().toISOString(),
  updatedAt: projectSnap.data().updatedAt?.toDate().toISOString(),
};
```

**Detection:** `TypeError: project.createdAt.toLocaleDateString is not a function`.

**Recovery cost:** LOW (30 minutes).

**Phase to address:** Phase 3 (Firestore data model).

---

### Pitfall 14: Zustand Store Hydration Flicker on Client

**What goes wrong:**
The editor page server component passes initial project data as props. The client component hydrates the Zustand store with this data on mount. But during the first render, the Zustand store has default values (not the server data). This causes a brief flash of default settings before the store is hydrated.

**Prevention:**
Hydrate the store synchronously in the component body, not in a useEffect:
```typescript
function EditorClient({ initialData }: { initialData: ProjectData }) {
  // Hydrate BEFORE first render
  const [hydrated] = useState(() => {
    useProjectStore.getState().hydrate(initialData);
    return true;
  });

  // ... rest of component
}
```

**Detection:** Brief flash of default colors/settings when opening a project.

**Recovery cost:** LOW (30 minutes).

**Phase to address:** Phase 3 (Firestore data model) or Phase 5 (Auto-save).

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Severity | Mitigation |
|-------------|---------------|----------|------------|
| Next.js scaffold (Phase 1) | Verovio WASM fails with Turbopack (#1, #7) | Critical | Test WASM immediately; have `--webpack` fallback |
| Next.js scaffold (Phase 1) | import.meta.env not migrated (#6) | Moderate | Global search-replace before first build |
| Next.js scaffold (Phase 1) | Async params wrong pattern (#10) | Moderate | Follow Next.js 16 upgrade guide |
| Firebase Auth (Phase 2) | Admin SDK credentials in client bundle (#2) | Critical | Use `server-only` package, separate files |
| Firebase Auth (Phase 2) | Session cookie expiration without refresh (#4) | Critical | Design refresh flow upfront |
| Firebase Auth (Phase 2) | Wrong cookie name on Firebase Hosting (#12) | Minor | Always use `__session` |
| Firestore data model (Phase 3) | Map serialization loses syncAnchors (#3) | Critical | Object.fromEntries/Object.entries |
| Firestore data model (Phase 3) | Security rules too permissive (#8) | Moderate | Write ownership rules from day one |
| Firestore data model (Phase 3) | Timestamp serialization (#13) | Minor | Convert to ISO strings for props |
| Firebase Storage (Phase 4) | No additional pitfalls unique to Phase 4 | -- | Standard Firebase Storage patterns |
| Auto-save (Phase 5) | Offline writes appear saved but are lost (#5) | Critical | Use metadata changes for save status |
| Auto-save (Phase 5) | Write storms without debounce (#9) | Moderate | 1500ms debounce mandatory |
| Auto-save (Phase 5) | Zustand hydration flicker (#14) | Minor | Synchronous hydration in component body |

---

## Sources

### Primary Sources (HIGH confidence)

**Official documentation:**
- [Next.js 16 Upgrade Guide](https://nextjs.org/docs/app/guides/upgrading/version-16) -- async params, proxy.ts, Turbopack default
- [Firebase Auth Session Cookies](https://firebase.google.com/docs/auth/admin/manage-cookies) -- Session cookie creation, verification, expiration limits
- [Firestore Security Rules](https://firebase.google.com/docs/firestore/security/get-started) -- Rule syntax, ownership patterns
- [Firebase Hosting Cookie Behavior](https://firebase.google.com/docs/hosting/manage-cache#using_cookies) -- `__session` cookie requirement
- [Firestore Offline Persistence](https://firebase.google.com/docs/firestore/manage-data/enable-offline) -- IndexedDB caching, hasPendingWrites
- [server-only Package](https://www.npmjs.com/package/server-only) -- Prevent server code from being imported in client
- [Next.js Dynamic Import](https://nextjs.org/docs/app/building-your-application/optimizing/lazy-loading) -- `dynamic({ ssr: false })` for client-only components
- [Firestore Quotas and Limits](https://firebase.google.com/docs/firestore/quotas) -- 1 write per second per document sustained

**Codebase analysis:**
- `src/lib/verovioService.ts` -- WASM loading pattern with `createVerovioModule` + `VerovioToolkit`
- `src/stores/syncStore.ts` -- `syncAnchors` as `Map<string, number>`
- `src/App.tsx` -- All state fields that need persistence, `import.meta.env` usage

### Secondary Sources (MEDIUM confidence)

- [Turbopack WASM Support (GitHub Issue #84972)](https://github.com/vercel/next.js/issues/84972) -- Closed as "not a bug", confirms client-side WASM works
- [Firebase Next.js Codelab](https://firebase.google.com/codelabs/firebase-nextjs) -- Full auth + Firestore integration pattern
- [Zustand Subscribe API](https://zustand.docs.pmnd.rs/apis/store-api#subscribe) -- Store subscription for auto-save

---

*Research completed: 2026-02-11*
*Domain: Next.js migration + Firebase backend for music notation renderer*
*Focus: Pitfalls when migrating from Vite SPA to Next.js App Router with Firebase Auth, Firestore, Storage, and auto-save*
