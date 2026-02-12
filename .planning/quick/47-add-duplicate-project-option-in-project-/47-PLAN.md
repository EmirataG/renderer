---
phase: quick-47
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/app/api/projects/[id]/duplicate/route.ts
  - src/components/ProjectCard.tsx
  - src/components/Dashboard.tsx
autonomous: true
must_haves:
  truths:
    - "Duplicate button appears above Delete in the project card three-dot menu"
    - "Clicking Duplicate creates a new project named 'Copy of [original name]'"
    - "Duplicated project appears at the top of the dashboard immediately"
    - "Duplicated project has all files (score, audio, background) and settings from the original"
  artifacts:
    - path: "src/app/api/projects/[id]/duplicate/route.ts"
      provides: "POST endpoint that copies Firestore doc + Storage files to new project"
      exports: ["POST"]
    - path: "src/components/ProjectCard.tsx"
      provides: "Duplicate button in dropdown menu"
    - path: "src/components/Dashboard.tsx"
      provides: "onDuplicate handler that calls API and prepends new project"
  key_links:
    - from: "src/components/ProjectCard.tsx"
      to: "Dashboard.handleDuplicate"
      via: "onDuplicate prop callback"
      pattern: "onDuplicate"
    - from: "src/components/Dashboard.tsx"
      to: "/api/projects/[id]/duplicate"
      via: "fetch POST"
      pattern: "fetch.*duplicate"
    - from: "src/app/api/projects/[id]/duplicate/route.ts"
      to: "Firebase Storage"
      via: "getBucket().file().download() + uploadFile()"
      pattern: "download.*uploadFile"
---

<objective>
Add a "Duplicate" option to the project card three-dot menu that creates a full copy of the project (Firestore document + all Storage files) with the name "Copy of [original name]".

Purpose: Let users quickly duplicate existing projects as starting points for variations.
Output: Working duplicate feature end-to-end.
</objective>

<execution_context>
@/Users/emirahmed/.claude/get-shit-done/workflows/execute-plan.md
@/Users/emirahmed/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@src/components/ProjectCard.tsx
@src/components/Dashboard.tsx
@src/app/api/projects/[id]/route.ts
@src/app/api/projects/route.ts
@src/lib/storage.ts
@src/lib/firestore.ts
@src/types/project.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create POST /api/projects/[id]/duplicate endpoint</name>
  <files>src/app/api/projects/[id]/duplicate/route.ts</files>
  <action>
Create a new route file at `src/app/api/projects/[id]/duplicate/route.ts` with a POST handler.

Follow the exact auth pattern from the existing `src/app/api/projects/[id]/route.ts`:
- Import `cookies` from `next/headers`, `adminAuth` from `@/lib/firebase-admin`, `getDb`/`FieldValue` from `@/lib/firestore`, `getBucket`/`uploadFile` from `@/lib/storage`.
- `getAuthenticatedUser()` helper using `__session` cookie and `adminAuth.verifySessionCookie(session, true)`.
- Return 401 if not authenticated, 404 if source project not found.

POST handler logic:
1. Authenticate user, get source project `id` from params.
2. Read source Firestore doc at `users/{uid}/projects/{id}`.
3. Generate new project ID via `crypto.randomUUID()`.
4. Copy Storage files: For each file type prefix (`score`, `audio`, `background`), use `getBucket().getFiles({ prefix: 'users/{uid}/projects/{sourceId}/{type}' })` to find files. For each file found, download with `file.download()` and re-upload with `uploadFile()` to the new project path, preserving the filename (just replacing the project ID segment). Extract the content type from `file.metadata.contentType` (fall back to `'application/octet-stream'`).
5. Create new Firestore doc at `users/{uid}/projects/{newId}` with all fields from the source doc EXCEPT: set `name` to `"Copy of {originalName}"`, set `createdAt` and `updatedAt` to `FieldValue.serverTimestamp()`, use new ID, and update `scoreUrl`/`audioUrl`/`backgroundUrl` to the new storage paths (or keep them undefined if the source didn't have them).
6. Return the full new project object as JSON (with ISO date strings for createdAt/updatedAt -- use `new Date().toISOString()` for the response since serverTimestamp is not yet resolved): `{ project: { id: newId, name: "Copy of ...", ...allFields, createdAt: now, updatedAt: now } }` with status 201.

Important: The storage URL fields (`scoreUrl`, `audioUrl`, `backgroundUrl`) store storage paths (not download URLs). When copying, build the new path from the new project ID and the original file's name segment after the last `/`. Only include a URL field if the source has one.
  </action>
  <verify>
Build passes: `cd /Users/emirahmed/Desktop/Manuscript/renderer && npx next build 2>&1 | tail -20` (or at minimum `npx tsc --noEmit`).
  </verify>
  <done>POST /api/projects/[id]/duplicate endpoint exists, authenticates, copies all Firestore fields and Storage files to a new project named "Copy of [name]", returns the new project object.</done>
</task>

<task type="auto">
  <name>Task 2: Add Duplicate button to ProjectCard and wire up in Dashboard</name>
  <files>src/components/ProjectCard.tsx, src/components/Dashboard.tsx</files>
  <action>
**ProjectCard.tsx changes:**

1. Add `onDuplicate: (id: string) => void` to the `ProjectCardProps` interface.
2. In the dropdown menu div (the `w-36 bg-black border-2 border-neutral-700` container), add a Duplicate button ABOVE the existing Delete button:
```tsx
<button
  onClick={(e) => {
    e.stopPropagation();
    setMenuOpen(false);
    onDuplicate(project.id);
  }}
  className="w-full text-left px-3 py-2 text-xs font-bold uppercase tracking-wider text-neutral-300 hover:bg-neutral-800 transition-colors"
>
  Duplicate
</button>
```
The styling matches Delete but uses `text-neutral-300` instead of `text-red-400` (it's a non-destructive action).

**Dashboard.tsx changes:**

1. Add a `handleDuplicate` callback (wrap in `useCallback`):
   - Accept `projectId: string`.
   - Call `fetch(`/api/projects/${projectId}/duplicate`, { method: 'POST' })`.
   - Parse response JSON to get `{ project }`.
   - On success: prepend the returned project to state via `setProjects(prev => [project, ...prev])` and show a toast: `showToast('"Copy of {name}" created', 'success')`.
   - On error: show `showToast('Failed to duplicate project', 'error')`.
   - Add `[showToast]` as the dependency array.

2. Pass `onDuplicate={handleDuplicate}` to each `<ProjectCard>` alongside the existing `onDelete` prop (line ~168).
  </action>
  <verify>
TypeScript compiles: `cd /Users/emirahmed/Desktop/Manuscript/renderer && npx tsc --noEmit`.
Visually confirm by inspecting the ProjectCard code that Duplicate appears above Delete in the menu.
  </verify>
  <done>Duplicate button appears in project card menu above Delete. Clicking it calls the API, creates the duplicate, and the new project appears at the top of the dashboard with a success toast.</done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` passes with no errors.
2. The duplicate route file exists at `src/app/api/projects/[id]/duplicate/route.ts`.
3. ProjectCard dropdown contains Duplicate button above Delete.
4. Dashboard passes `onDuplicate` to ProjectCard and handles the API response.
</verification>

<success_criteria>
- Duplicate button visible in project card three-dot menu, positioned above Delete
- Clicking Duplicate calls POST /api/projects/[id]/duplicate
- API copies all Firestore fields (settings, anchors, file references) to a new doc named "Copy of [name]"
- API copies all Storage files (score, audio, background) to new project paths
- New project appears at top of dashboard immediately after duplication
- Toast confirms successful duplication
</success_criteria>

<output>
After completion, create `.planning/quick/47-add-duplicate-project-option-in-project-/47-SUMMARY.md`
</output>
