---
phase: quick-46
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/lib/storage.ts
  - src/app/api/projects/[id]/background/route.ts
autonomous: true
must_haves:
  truths:
    - "Project creation no longer calls getDownloadURL (eliminates 2-10 sec delay)"
    - "Background upload no longer calls getDownloadURL"
    - "All existing functionality works identically (score/audio load, background display)"
  artifacts:
    - path: "src/lib/storage.ts"
      provides: "uploadFile returns storage path instead of download URL"
      contains: "return storagePath"
    - path: "src/app/api/projects/[id]/background/route.ts"
      provides: "Background PUT returns proxy URL instead of Firebase download URL"
      contains: "/api/projects/"
  key_links:
    - from: "src/lib/storage.ts"
      to: "src/app/api/projects/route.ts"
      via: "uploadFile return value stored as scoreUrl/audioUrl"
      pattern: "uploadFile"
    - from: "src/app/api/projects/[id]/background/route.ts"
      to: "src/components/UploadDropZone.tsx"
      via: "backgroundUrl in JSON response used as img src"
      pattern: "backgroundUrl"
---

<objective>
Remove unnecessary getDownloadURL() calls from uploadFile() that add 1-5 seconds PER CALL during file uploads. During project creation, two calls add 2-10 seconds of pure overhead.

Purpose: The download URLs stored in Firestore are never used for actual file downloads -- files are always served through API proxy endpoints. The stored URLs only serve as boolean flags (truthy = file exists). Returning the storage path achieves the same purpose with zero network overhead.

Output: Faster project creation (eliminates 2-10 second delay), faster background uploads.
</objective>

<execution_context>
@/Users/emirahmed/.claude/get-shit-done/workflows/execute-plan.md
@/Users/emirahmed/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@src/lib/storage.ts
@src/app/api/projects/route.ts
@src/app/api/projects/[id]/background/route.ts
@src/App.tsx
@src/components/UploadDropZone.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Remove getDownloadURL from uploadFile, return storage path</name>
  <files>src/lib/storage.ts</files>
  <action>
In `src/lib/storage.ts`:

1. Remove `getDownloadURL` from the import on line 2. The import should become:
   ```typescript
   import { getStorage } from 'firebase-admin/storage';
   ```

2. Update the `uploadFile` function (lines 22-30):
   - Change the JSDoc comment from "return the permanent download URL" to "return the storage path"
   - Remove the `getDownloadURL(fileRef)` call on line 29
   - Instead, return `storagePath` directly (the first parameter, already available)
   - The return type remains `Promise<string>` -- no change needed

The function should become:
```typescript
export async function uploadFile(
  storagePath: string,
  buffer: Buffer,
  contentType: string
): Promise<string> {
  const fileRef = getBucket().file(storagePath);
  await fileRef.save(buffer, { metadata: { contentType } });
  return storagePath;
}
```

WHY this works:
- `src/app/api/projects/route.ts` stores the return value as `scoreUrl`/`audioUrl` in Firestore, but these are only checked as boolean flags in `App.tsx:94` and `App.tsx:110` (truthy = file exists, then proxy endpoint is used). A storage path like `users/uid/projects/id/score.xml` is truthy, so the boolean check still works.
- The background route needs a separate fix (Task 2) since its return value flows to the frontend as an image src.
  </action>
  <verify>
Run `npx tsc --noEmit` to confirm no type errors from removing the import.
Grep for `getDownloadURL` in the codebase to confirm it is fully removed.
  </verify>
  <done>uploadFile returns storagePath directly without any network call to Google Cloud Storage. The getDownloadURL import is removed entirely from storage.ts.</done>
</task>

<task type="auto">
  <name>Task 2: Fix background route to return proxy URL instead of Firebase URL</name>
  <files>src/app/api/projects/[id]/background/route.ts</files>
  <action>
In `src/app/api/projects/[id]/background/route.ts`, the PUT handler (line 56-115):

After Task 1, `uploadFile` returns a storage path like `users/uid/projects/id/background.jpg`. This path is:
1. Stored in Firestore as `backgroundUrl` -- FINE, only used as boolean flag in `App.tsx:119` and `ProjectCard.tsx:42`
2. Returned in the JSON response as `{ backgroundUrl }` -- PROBLEM, `UploadDropZone.tsx:101-102` passes it to `handleImageUpload` which sets it as `bgUrl`, used as `img.src`

Fix the PUT handler:
1. Keep storing the storage path in Firestore (line 108-112) -- no change needed, it serves as a boolean flag
2. Change the JSON response (line 114) to return the proxy URL instead:
   ```typescript
   return Response.json({ backgroundUrl: `/api/projects/${id}/background` });
   ```

This way, after uploading a background:
- Firestore stores the storage path (boolean flag, same as scoreUrl/audioUrl)
- Frontend receives the proxy URL and uses it as `img.src`, which correctly serves the image through the GET handler

No other files need changes.
  </action>
  <verify>
Run `npx tsc --noEmit` to confirm no type errors.
Run `npm run build` to confirm the app builds cleanly.
  </verify>
  <done>Background PUT route returns proxy URL `/api/projects/{id}/background` in its JSON response. Firestore stores the storage path. The entire codebase has zero calls to getDownloadURL.</done>
</task>

</tasks>

<verification>
1. `grep -r "getDownloadURL" src/` returns no results
2. `npx tsc --noEmit` passes with no errors
3. `npm run build` succeeds
</verification>

<success_criteria>
- getDownloadURL is completely removed from the codebase
- uploadFile returns the storage path synchronously (no network call)
- Project creation is faster by 2-10 seconds (no getDownloadURL round-trips)
- Background upload returns proxy URL for immediate frontend display
- All stored URLs in Firestore continue to work as boolean flags
- TypeScript compilation passes
</success_criteria>

<output>
After completion, create `.planning/quick/46-investigate-why-creating-a-project-takes/46-SUMMARY.md`
</output>
