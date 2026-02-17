---
phase: quick-56
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/UploadDropZone.tsx
autonomous: true
requirements: [FIX-BG-DOUBLE-LOAD]

must_haves:
  truths:
    - "Selecting a new background image in a project renders the image exactly once"
    - "Toast notification appears after upload without triggering a second image load"
    - "Background image is still available for export after upload"
    - "Background image loads correctly from server URL on project reload"
  artifacts:
    - path: "src/components/UploadDropZone.tsx"
      provides: "Fixed processImage that avoids double bgUrl update"
  key_links:
    - from: "src/components/UploadDropZone.tsx"
      to: "src/App.tsx (handleImageUpload)"
      via: "onImageUpload callback"
      pattern: "onImageUpload"
---

<objective>
Fix background image loading twice when selecting a new image in a project.

Purpose: When a user selects a new background image, the current code calls `onImageUpload` twice -- once with an optimistic blob URL (immediate preview), then again with the server proxy URL after the Firebase upload completes. Each call updates `bgUrl` state in App.tsx, which triggers the renderers and the region-dimensions useEffect to reload the image. The second load coincides with the toast notification appearing, causing a visible flash/reload.

Output: Modified UploadDropZone.tsx where the optimistic blob URL is the only one set, and the post-upload success path no longer replaces it with the server URL.
</objective>

<execution_context>
@/Users/emirahmed/.claude/get-shit-done/workflows/execute-plan.md
@/Users/emirahmed/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/components/UploadDropZone.tsx
@src/App.tsx (handleImageUpload at line 317, bgUrl state at line 67, region dims useEffect at line 241)
@src/renderers/RegularRenderer.tsx (bgUrl useEffect and CSS background-image usage)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix processImage to avoid double bgUrl update</name>
  <files>src/components/UploadDropZone.tsx</files>
  <action>
In the `processImage` callback (line 86-123), fix the double-load issue:

**Current problematic flow (when projectId exists):**
1. Line 91: `onImageUpload(blobUrl, file.name)` -- sets bgUrl to blob URL (image loads FIRST time)
2. Line 106: `URL.revokeObjectURL(blobUrl)` -- revokes the blob URL
3. Line 107: `onImageUpload(backgroundUrl, file.name)` -- sets bgUrl to server URL (image loads SECOND time)

**Fixed flow:**
1. Pass the `file` object in the optimistic call so that `bgFile` is set in App.tsx for export: `onImageUpload(blobUrl, file.name, file)`
2. After upload succeeds, do NOT call `onImageUpload` again and do NOT revoke the blob URL. The blob URL remains valid for the entire page session and is perfectly usable for both rendering and export (via the `bgFile` File object now stored in state).
3. Still show the success toast after upload completes.
4. On upload failure, keep the existing revert logic (`URL.revokeObjectURL(blobUrl)` and `onImageUpload('', '')`).

The resulting `processImage` success path should be:
```typescript
const blobUrl = URL.createObjectURL(file);
onImageUpload(blobUrl, file.name, file);

const formData = new FormData();
formData.append('background', file);
try {
  const res = await fetch(`/api/projects/${projectId}/background`, {
    method: 'PUT',
    body: formData,
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || 'Failed to upload background');
  }
  // Upload succeeded -- blob URL stays as display source, file is in bgFile for export
  showToast(`Background uploaded: ${file.name}`, 'success');
} catch (err) {
  // Revert optimistic preview on failure
  URL.revokeObjectURL(blobUrl);
  onImageUpload('', '');
  showToast(err instanceof Error ? err.message : 'Failed to upload background', 'error');
}
```

Key points:
- The `await res.json()` call for `backgroundUrl` is no longer needed on success (remove it to avoid unnecessary parsing)
- The blob URL is never revoked on success -- it stays valid until the page unloads
- The File object passed via `onImageUpload(blobUrl, file.name, file)` ensures App.tsx sets `bgFile` so the export handler can use the File directly instead of fetching from bgUrl
  </action>
  <verify>
1. `npx tsc --noEmit` passes with no type errors
2. Manual test: Open a project, select a new background image. Confirm image appears once without a second flash/reload when the toast shows.
3. Manual test: After uploading a new background, reload the page. Confirm the background loads correctly from the server URL.
  </verify>
  <done>Background image renders exactly once when selected. Toast appears without triggering a second image load. Export still works (File object is stored in bgFile state).</done>
</task>

</tasks>

<verification>
- Select a new background image in a project -- image should appear once and stay stable
- Toast notification should appear 1-2 seconds later (after upload completes) without any visual change to the background
- Reload the page -- background should load from server proxy URL as before
- Try export with a background image -- should still include the background
</verification>

<success_criteria>
- Background image loads exactly once when user selects a new image
- No visible flash, flicker, or reload when toast notification appears
- Background persists correctly to Firebase Storage (upload still happens)
- Background loads correctly on page reload from server URL
- Export still includes background image
</success_criteria>

<output>
After completion, create `.planning/quick/56-fix-background-image-loading-twice-when-/56-SUMMARY.md`
</output>
