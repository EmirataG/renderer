# Feature Landscape: Next.js Migration + Firebase Project Persistence

**Domain:** Authentication, project dashboard, and auto-save for a browser-based MusicXML score renderer
**Researched:** 2026-02-11
**Confidence:** HIGH (Firebase auth and Firestore are extremely well-documented; auto-save and dashboard UX patterns are mature and widely validated)

## Executive Summary

This milestone transforms Manuscript from an ephemeral single-session tool into a persistent, multi-project application. The three pillars are: (1) Google sign-in via Firebase Authentication, (2) a project dashboard with preview cards for browsing/creating projects, and (3) debounced auto-save that persists all editor state to Firestore/Storage without a save button.

The key insight is that this is NOT a complex distributed system problem. Manuscript is single-user-per-project (no real-time collaboration), so the auto-save story is dramatically simpler than what Figma or Google Docs face. The pattern is straightforward: dirty-track Zustand store changes, debounce writes by 1500ms, write the settings document to Firestore, show a "Saving..." / "Saved" indicator. Files (MusicXML, audio, background images) upload to Firebase Storage on project creation and do not change during editing sessions.

The dashboard is a standard grid-of-cards pattern. Each card shows the project name, a static thumbnail of the score, the creation date, and last-modified timestamp. Empty state guides the user to create their first project. The project creation flow is a modal with file uploads (MusicXML + audio, optional background) and a view mode selector (regular vs. single-line), which then navigates to the editor.

Firebase Authentication with Google sign-in is the simplest auth integration possible. Use `signInWithPopup` as primary with `signInWithRedirect` as fallback. Wrap `onAuthStateChanged` in a React context provider. Protect routes with a higher-order layout that redirects unauthenticated users.

---

## Table Stakes

Features users expect when a creative tool adds accounts and persistence. Missing any of these makes the product feel broken or untrustworthy.

| Feature | Why Expected | Complexity | Depends On |
|---------|--------------|------------|------------|
| **Google sign-in** | Users expect OAuth with Google for creative tools; no password management | Low | Firebase Auth SDK |
| **Sign-out** | Must be able to log out, especially on shared devices | Low | Firebase Auth SDK |
| **Auth state persistence across tabs/refresh** | Closing browser and reopening should keep user logged in | Low | Firebase default behavior (IndexedDB) |
| **Protected routes** | Editor and dashboard must require auth; unauthenticated users see sign-in | Low | Auth context provider + route guards |
| **Project list / dashboard** | Users need to see all their projects at a glance | Medium | Firestore query on user's projects |
| **Create new project** | Clear action to start a new score project with file uploads | Medium | Firebase Storage + Firestore |
| **Open existing project** | Click a project card to load it into the editor | Medium | Firestore read + Storage download URLs |
| **Delete project** | Users must be able to remove projects they no longer want | Low | Firestore delete + Storage cleanup |
| **Auto-save editor settings** | Changes to colors, fonts, scale, borders, animation settings save automatically | Medium | Firestore writes with debounce |
| **Save indicator** | Users must see "Saving..." and "Saved" status to trust auto-save | Low | UI state derived from save operations |
| **Unsaved changes protection** | Warn before closing tab if a save is in flight | Low | `beforeunload` event listener |
| **Loading states** | Skeleton/spinner while dashboard loads, while project loads into editor | Low | Standard async UI patterns |
| **Empty state for dashboard** | First-time user sees guidance, not a blank page | Low | Conditional rendering |
| **Project metadata display** | Each project card shows name, last modified date, creation date | Low | Firestore document fields |

### Google Sign-In Specification

**Primary flow:** `signInWithPopup(auth, googleProvider)`
- Works on desktop browsers without configuration headaches
- Returns user profile (displayName, email, photoURL, uid) immediately
- No redirect round-trip; popup appears and resolves in the same page context

**Fallback flow:** `signInWithRedirect(auth, googleProvider)`
- Required for mobile browsers and browsers blocking third-party cookies
- Firebase docs state that as of Chrome M115+, redirect sign-in requires hosting-based authDomain configuration or a reverse proxy
- Detect popup failure and fall back to redirect automatically

**Auth state management pattern (React Context):**

```
AuthProvider wraps entire app
  -> useEffect subscribes to onAuthStateChanged
  -> Returns unsubscribe on cleanup
  -> Provides { user, loading, error } to children
  -> While loading: show full-screen skeleton/spinner
  -> When user is null + not loading: show sign-in page
  -> When user exists: show dashboard or editor
```

**Session persistence:** Firebase defaults to `browserLocalPersistence` (IndexedDB), which persists across browser restarts. This is correct for Manuscript -- do not change it.

**Confidence:** HIGH -- Firebase Google sign-in is the most documented auth flow in web development. The `onAuthStateChanged` + React Context pattern is used by virtually every Firebase+React tutorial.

### Save Indicator Specification

Based on GitLab's Pajamas design system and general auto-save UX research, the save indicator must convey three states:

| State | Visual | Trigger |
|-------|--------|---------|
| **Idle** | Nothing shown (or faint "All changes saved") | No pending changes |
| **Saving...** | Subtle spinner + "Saving..." text | Debounced write initiated |
| **Saved** | Checkmark + "Saved" + relative timestamp | Firestore write confirmed |
| **Error** | Red indicator + "Save failed" + retry link | Firestore write rejected |

**Placement:** Top of the sidebar (Inspector panel), near the project name. Small, non-intrusive. Do NOT use a toast for every save -- that would fire every few seconds and become unbearable.

**Key UX principle from ui-patterns.com:** Keep a save button visible even with auto-save. Removing it entirely "creates fear." In Manuscript's case, this manifests as a visible "Saved" indicator rather than a button, because there are no form submissions -- just continuous settings adjustment.

---

## Differentiators

Features that set the product apart. Not expected by users, but valued when present.

| Feature | Value Proposition | Complexity | Depends On |
|---------|-------------------|------------|------------|
| **Project thumbnail preview** | Visual recognition of projects; users scan thumbnails faster than reading names | Medium | SVG-to-image snapshot on save |
| **Duplicate project** | One-click clone of an existing project to experiment with different settings | Low | Deep copy of Firestore doc + Storage files |
| **Project rename inline** | Click project name to edit; no modal needed | Low | Firestore field update |
| **Last opened sorting** | Dashboard sorts by recently opened, not just created date | Low | Firestore timestamp field |
| **Offline draft recovery** | If network drops during editing, changes queue locally and sync when back online | Medium | Firestore offline persistence |
| **Keyboard shortcut for save** | Cmd+S triggers immediate flush of pending changes (bypasses debounce) | Low | Event listener + flush function |
| **Project search/filter** | Search projects by name when the list grows large | Low | Client-side filter (Firestore has limited full-text search) |
| **View mode badge on card** | Project card shows "Regular" or "Single-Line" badge so user knows the mode at a glance | Low | Firestore field |
| **Auto-save sync anchors** | The timing anchors from the Sync Editor persist across sessions | Medium | Serialize Map to Firestore-compatible format |

### Thumbnail Preview Strategy

The thumbnail provides the biggest visual improvement to the dashboard but needs a considered approach:

**Option A (recommended): Client-side SVG snapshot on save**
- When auto-save fires, serialize the current score SVG to a data URL
- Store as a base64 string in the Firestore project document (Firestore documents can hold up to 1MB)
- Render the base64 thumbnail directly in the dashboard card
- Pros: No extra infrastructure, instant, works offline
- Cons: Increases Firestore document size by 20-100KB per project; no background image in thumbnail

**Option B: Firebase Storage thumbnail upload**
- Render a canvas-based screenshot and upload to Storage as a small JPEG
- Store the download URL in the Firestore document
- Pros: Can include background image, smaller Firestore documents
- Cons: More complex, requires canvas rendering of SVG, upload latency on every save

**Recommendation:** Start with Option A (SVG-to-data-URL in Firestore document). It is dramatically simpler and avoids the canvas rendering pipeline. The thumbnail does not need to show the background image -- it just needs to show the score notation so users can visually distinguish projects. Migrate to Option B later if document sizes become a concern.

**Confidence:** MEDIUM -- The SVG snapshot approach is straightforward but the 1MB Firestore document limit means this needs monitoring. A complex multi-page score could produce a large SVG. Compress or crop to first page only.

### Sync Anchor Persistence

The existing `syncStore` uses a `Map<string, number>` (eventId to timestamp). Firestore does not natively support JavaScript Maps. The serialization strategy:

```
Store in Firestore as: { anchors: { "evt-0": 1.5, "evt-1": 3.2, ... } }
Deserialize on load:   new Map(Object.entries(doc.anchors))
```

This is the same pattern already used in `exportClient.ts` (line 71): `Object.fromEntries(request.syncAnchors)`. The round-trip is lossless for string keys and number values.

**Confidence:** HIGH -- This is a trivial serialization and the pattern is already proven in the codebase.

---

## Anti-Features

Features to explicitly NOT build for this milestone. Common mistakes when adding persistence to creative tools.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Real-time collaboration** | Manuscript is a single-user tool; adding CRDTs/OT for concurrent editing is massive complexity for zero user demand | Single-user auto-save with last-write-wins; no presence indicators |
| **Email/password auth** | Adds password reset flow, email verification, security concerns; Google sign-in covers 95%+ of target users (musicians sharing on social media) | Google sign-in only; add more providers later if needed |
| **Manual save button** | Contradicts the auto-save model; creates confusion about what is saved vs. unsaved; doubles the save logic | Auto-save only with a visible "Saved" indicator; Cmd+S flushes pending debounce |
| **Version history / undo across sessions** | Firestore is not a version control system; storing every state change creates unbounded growth and complex diff/merge logic | Single current state; rely on browser undo for in-session undo |
| **Project sharing / public links** | Sharing requires access control rules, link generation, viewer mode, and permission management | All projects are private to the authenticated user; sharing can come in a future milestone |
| **Folder organization** | Over-engineering for a small number of projects; adds navigation complexity | Flat list sorted by last modified; add folders if users accumulate 50+ projects |
| **Full-text search via Algolia/Elastic** | Overkill for project names; adds external service dependency and cost | Client-side `Array.filter` on project names; works for hundreds of projects |
| **File versioning in Storage** | Tracking every audio/image upload version adds complexity for no user benefit | Overwrite files in place; user can re-upload if they want a different file |
| **Optimistic locking / conflict detection** | No concurrent editors means no conflicts to detect; adding etag/version checks is unnecessary overhead | Last-write-wins is correct for single-user auto-save |
| **Import/export project as JSON** | Niche feature that adds attack surface (malicious imports) and maintenance burden for serialization compatibility | Projects live in Firebase; if export is needed later, it is a separate feature |

### Anti-Pattern Deep Dive: Version History

The most tempting anti-feature is version history ("wouldn't it be cool if users could revert to a previous version?"). Here is why it is wrong for this milestone:

1. **Storage cost scales quadratically.** Every debounced save creates a version. At 1500ms debounce, an active 30-minute editing session produces ~1200 versions. That is ~1200 Firestore documents per session per project.
2. **UI complexity is enormous.** A version timeline, diff visualization, selective revert -- each is a feature unto itself.
3. **The value is low for Manuscript's use case.** Users are adjusting visual settings (colors, scale, animation timing), not writing prose. If they over-rotate a color slider, they use the browser's in-session undo (Cmd+Z on the slider). They do not need to revert to "yesterday's settings."
4. **Firestore is not optimized for append-only logs.** Write rates, document limits, and query costs make Firestore a poor version store.

**If version history is ever needed:** Store snapshots at explicit user-triggered "checkpoints," not on every auto-save. But do not build this now.

---

## Feature Dependencies

```
Firebase Auth (Google sign-in)
    |
    v
Auth Context Provider (user state, loading, protected routes)
    |
    +---> Dashboard Page (requires user.uid for Firestore query)
    |         |
    |         +---> Project List (Firestore: /users/{uid}/projects)
    |         |         |
    |         |         +---> Project Cards (name, thumbnail, date, view mode)
    |         |         |
    |         |         +---> Empty State (first-time user guidance)
    |         |
    |         +---> Create Project Modal
    |                   |
    |                   +---> File Uploads (MusicXML + audio -> Firebase Storage)
    |                   |
    |                   +---> View Mode Selection (regular vs single-line)
    |                   |
    |                   +---> Project Metadata (name, created timestamp)
    |                   |
    |                   v
    |               Navigate to Editor with project ID
    |
    +---> Editor Page (requires user.uid + projectId)
              |
              +---> Load Project (Firestore doc -> Zustand stores)
              |         |
              |         +---> Restore settings (colors, fonts, scale, etc.)
              |         |
              |         +---> Restore sync anchors (Map deserialization)
              |         |
              |         +---> Load files via Storage download URLs
              |
              +---> Auto-Save System
                        |
                        +---> Dirty Tracking (subscribe to Zustand store changes)
                        |
                        +---> Debounce Timer (1500ms after last change)
                        |
                        +---> Firestore Write (settings document)
                        |
                        +---> Save Indicator (Saving.../Saved/Error)
                        |
                        +---> beforeunload Guard (warn if save in flight)
```

**Critical dependency chain:**
1. Auth must exist before any Firestore/Storage operations (security rules require `auth.uid`)
2. Dashboard depends on auth to query user's projects
3. Project creation depends on dashboard (entry point) + Firebase Storage (file uploads)
4. Editor loading depends on project existence in Firestore
5. Auto-save depends on editor loading (must know the project ID to write to)
6. Save indicator depends on auto-save system (derives state from save operations)
7. `beforeunload` guard depends on auto-save system (checks pending writes)

---

## Auto-Save Deep Dive

This is the most complex feature in the milestone and warrants detailed specification.

### Debounce Strategy

**Debounce interval: 1500ms** (1.5 seconds after the last change)

Rationale:
- 500ms is too aggressive -- users adjusting sliders (score scale, animation timing) produce rapid changes; 500ms would fire dozens of writes during a single slider drag
- 3000ms feels sluggish -- users finish adjusting and wonder if the change saved
- 1500ms matches the sweet spot found in the existing codebase: `App.tsx` already debounces score scale and score region changes at 300ms for re-rendering; the save debounce should be longer than the render debounce to batch multiple rapid changes
- GitLab's Pajamas design system recommends "3 seconds after typing stops" for text fields; settings sliders should be faster because the interaction is shorter

**Exception: Cmd+S forces immediate flush.** If the user presses Cmd+S, cancel the pending debounce timer and write immediately. This satisfies the muscle memory of users who habitually save.

### What Gets Saved

The Firestore document for a project stores ALL editor state. Based on `App.tsx` state analysis:

| Field | Type | Source |
|-------|------|--------|
| `name` | string | User-provided at creation |
| `viewMode` | "regular" \| "single-line" | Creation modal selection |
| `fps` | number | Playback FPS slider |
| `scoreColor` | string | Color picker hex value |
| `scoreShadowDistance` | number | Shadow slider |
| `hideUnplayedNotes` | boolean | Checkbox |
| `smoothReveal` | boolean | Checkbox |
| `scoreRegion` | object \| null | Region editor output |
| `scoreBorder` | string | Border picker selection |
| `scoreScale` | number | Scale slider |
| `musicFont` | string | Font dropdown |
| `hideLabels` | boolean | Checkbox |
| `activeNoteheadColor` | string \| null | Color picker or null |
| `activeNoteheadScale` | number | Scale slider |
| `activeNoteheadEntryMs` | number | Duration slider |
| `activeNoteheadHoldMs` | number | Duration slider |
| `activeNoteheadExitMs` | number | Duration slider |
| `colorFullNote` | boolean | Checkbox |
| `anchors` | object | Serialized Map from syncStore |
| `musicXmlStoragePath` | string | Firebase Storage reference |
| `audioStoragePath` | string | Firebase Storage reference |
| `bgImageStoragePath` | string \| null | Firebase Storage reference |
| `thumbnailDataUrl` | string \| null | Base64 SVG snapshot |
| `createdAt` | Timestamp | Server timestamp on creation |
| `updatedAt` | Timestamp | Server timestamp on every save |

### What Does NOT Get Auto-Saved

- **File contents** (MusicXML, audio, background image): These are uploaded to Firebase Storage at project creation time. They are immutable during editing. If the user wants to change the audio file, that is a separate "replace file" action that uploads to Storage.
- **Export state** (status, progress, jobId): Ephemeral UI state, not project data.
- **Transport state** (play/pause, current playback position): Ephemeral; resetting on load is correct behavior.
- **UI state** (which panel is open, scroll position, zoom level): Ephemeral; users expect a clean slate when reopening.

### Dirty Tracking Implementation

The auto-save system must detect when saveable state has changed. Two approaches:

**Approach A (recommended): Zustand `subscribe` with shallow comparison**
- Zustand's `subscribe` can watch specific slices of state
- On each change, compare with the last-saved snapshot using shallow equality
- If different, start/reset the debounce timer
- When timer fires, write the current state to Firestore
- On successful write, update the "last-saved snapshot" to the current state

**Approach B: useEffect dependency array**
- List all saveable fields in a useEffect dependency array
- On change, start debounce
- Problem: 20+ dependencies in one useEffect is fragile and hard to maintain

**Recommendation:** Approach A. Zustand's `subscribe` is purpose-built for this. Create a `useAutoSave(projectId)` hook that:
1. Subscribes to the project settings store
2. On change, marks state as dirty
3. Starts a 1500ms debounce timer (resets on subsequent changes)
4. When timer fires, writes to Firestore
5. Returns `{ saveStatus: 'idle' | 'saving' | 'saved' | 'error', lastSavedAt: Date | null }`

### Save Operation Flow

```
User adjusts slider
  -> Zustand store updates immediately (optimistic local state)
  -> Debounce timer starts/resets (1500ms)
  -> [1500ms passes with no further changes]
  -> Save indicator shows "Saving..."
  -> Firestore setDoc(projectRef, settings, { merge: true })
  -> On success: Save indicator shows "Saved" + timestamp
  -> On failure: Save indicator shows "Save failed" + retry button
       -> Retry writes the current state (not the failed state)
```

**Optimistic vs. pessimistic:** This is inherently optimistic. The UI reflects changes instantly (Zustand store is the source of truth for rendering). The Firestore write is a background persistence operation. If it fails, the user's current session is unaffected -- they only lose persistence if they close the tab.

### Edge Cases

| Edge Case | Handling |
|-----------|----------|
| **User closes tab during save** | `beforeunload` shows browser warning if `saveStatus === 'saving'`; Firestore may or may not complete the write |
| **Rapid slider dragging** | Debounce naturally batches; only the final position saves |
| **Network drops during session** | Firestore offline persistence queues writes locally; syncs when reconnected |
| **Two tabs open same project** | Last-write-wins; no conflict detection (anti-feature). The tab that saves last defines the state. This is acceptable for single-user. |
| **Firestore write fails (permission)** | Show error indicator; likely means auth token expired; prompt re-auth |
| **Very large sync anchor map** | Firestore documents max at 1MB; a Map with 10,000 anchors at ~30 bytes each = ~300KB; well within limits for any reasonable score |
| **User navigates away mid-debounce** | Flush pending save before navigation (useEffect cleanup) |

---

## Dashboard Deep Dive

### Layout

**Grid of cards** -- the dominant pattern for creative tool dashboards (Figma, Canva, Google Docs, Notion).

- **Desktop (>1024px):** 3-4 cards per row
- **Tablet (768-1024px):** 2-3 cards per row
- **Mobile (<768px):** 1-2 cards per row

Each card is a fixed-aspect-ratio rectangle (roughly 16:10) containing:
1. **Thumbnail area** (top 60%): Score preview image or placeholder
2. **Metadata area** (bottom 40%): Project name (truncated), last modified relative time ("2 hours ago"), view mode badge

### Card Interactions

| Action | Trigger | Result |
|--------|---------|--------|
| Open project | Click card | Navigate to `/editor/{projectId}` |
| Context menu | Right-click or "..." button | Show: Rename, Duplicate, Delete |
| Rename | Context menu -> Rename | Inline text edit on project name |
| Delete | Context menu -> Delete | Confirmation dialog -> Firestore + Storage deletion |
| Duplicate | Context menu -> Duplicate | Create copy with "(Copy)" suffix |

### Empty State

When the user has zero projects, show:
- A centered illustration or icon (music note or score snippet)
- Heading: "No projects yet"
- Subheading: "Create your first project to start rendering scores"
- Prominent "Create Project" button (same as header button, but larger and centered)

**Key UX principle from SaaS empty state research:** The empty state should be action-oriented, not just informational. The CTA should be the most prominent element on the page.

### Sorting and Filtering

**Default sort:** Last modified (most recent first). This is what Figma, Google Docs, and Canva all default to.

**No explicit sort/filter UI for v1.** With fewer than ~50 projects, scanning the grid is sufficient. Add sort controls (name, date created, last modified) and search only when users report difficulty finding projects.

---

## Project Creation Flow

### Modal Design

A centered modal with three steps in a single view (no multi-step wizard -- the form is small enough):

**Section 1: Project Name**
- Text input, auto-focused
- Placeholder: "Untitled Project"
- If left empty, default to "Untitled Project" with a date suffix

**Section 2: File Uploads**
- MusicXML file (required): Drop zone or file picker, accepts `.xml`, `.musicxml`, `.mxl`
- Audio file (required): Drop zone or file picker, accepts `.mp3`, `.wav`, `.ogg`, `.m4a`
- Background image (optional): Drop zone or file picker, accepts `.png`, `.jpg`, `.jpeg`, `.webp`

Reuse the existing `UploadDropZone` component pattern from the current sidebar.

**Section 3: View Mode**
- Two radio options: "Regular" (multi-page score) and "Single Line" (horizontal scroll)
- Default: Regular
- Brief description under each option

**Footer:**
- "Cancel" button (closes modal)
- "Create Project" button (disabled until MusicXML + audio provided)

### Creation Process

When "Create Project" is clicked:
1. Show loading state on the button ("Creating...")
2. Upload MusicXML to Firebase Storage: `users/{uid}/projects/{newProjectId}/score.xml`
3. Upload audio to Firebase Storage: `users/{uid}/projects/{newProjectId}/audio.{ext}`
4. Upload background image if provided: `users/{uid}/projects/{newProjectId}/bg.{ext}`
5. Create Firestore document at `users/{uid}/projects/{newProjectId}` with default settings + storage paths
6. Navigate to `/editor/{newProjectId}`

**File upload strategy:** Upload all files in parallel using `Promise.all`. Show a single progress indicator. If any upload fails, show error and do not create the Firestore document (atomic: all files succeed or nothing is created).

**Storage path convention:** `users/{uid}/projects/{projectId}/{filename}` keeps files organized per user per project and simplifies security rules (user can only read/write their own path).

---

## Firestore Security Rules

Essential for protecting user data. Every Firestore operation must be guarded.

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/projects/{projectId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

**Storage rules follow the same pattern:**
```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /users/{userId}/projects/{projectId}/{allPaths=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

These rules ensure: (1) only authenticated users can access data, (2) users can only access their own data, (3) no admin SDK needed for basic CRUD.

**Confidence:** HIGH -- These are the standard Firebase security rule patterns from official documentation.

---

## MVP Recommendation

For Auth + Persistence v1.0, prioritize in this order:

### Must Have (Table Stakes)

1. **Firebase Auth with Google sign-in** -- Gate to everything else; without auth, no user identity
2. **Auth context provider + protected routes** -- Structural requirement for the entire app
3. **Firestore project document schema** -- Data model that all features write to/read from
4. **Create project modal with file uploads** -- Entry point for new projects
5. **Firebase Storage file upload** -- MusicXML + audio must persist
6. **Load project into editor** -- Read Firestore doc + Storage URLs into Zustand stores
7. **Project dashboard with card grid** -- Browse existing projects
8. **Auto-save with debounce** -- Core value prop: changes persist without manual saving
9. **Save indicator** -- Trust signal: users must see that auto-save is working
10. **Delete project** -- Basic project management
11. **Empty state** -- First-time user guidance
12. **beforeunload guard** -- Prevent data loss on accidental tab close

### Should Have (High-Value Differentiators)

13. **Project thumbnail preview** -- Visual project identification on dashboard
14. **Auto-save sync anchors** -- The sync editor work should persist too
15. **Cmd+S immediate flush** -- Satisfy muscle memory
16. **Project rename** -- Inline rename on dashboard
17. **Duplicate project** -- Low-effort, high-value for experimentation

### Defer to Later

- **Offline draft recovery** (Firestore offline persistence): Adds testing complexity; most users are online
- **Project search/filter**: Premature for < 50 projects
- **Sort controls**: Default "last modified" sort is sufficient initially
- **Additional auth providers** (Apple, GitHub, email): Google covers target audience
- **Project sharing / public links**: Separate milestone
- **Version history**: Anti-feature (see rationale above)

---

## Sources

### HIGH Confidence (Official Documentation)

- [Firebase Auth: Google Sign-In](https://firebase.google.com/docs/auth/web/google-signin) -- signInWithPopup, signInWithRedirect, GoogleAuthProvider
- [Firebase Auth: Redirect Best Practices](https://firebase.google.com/docs/auth/web/redirect-best-practices) -- Chrome M115+ requirements for redirect flow
- [Firebase Auth: State Persistence](https://firebase.google.com/docs/auth/web/auth-state-persistence) -- browserLocalPersistence default behavior
- [Firebase Storage: Upload Files (Web)](https://firebase.google.com/docs/storage/web/upload-files) -- uploadBytes, uploadBytesResumable, getDownloadURL
- [Firestore Data Model](https://firebase.google.com/docs/firestore/data-model) -- Document structure, 1MB limits, nested objects
- [Firestore Best Practices](https://firebase.google.com/docs/firestore/best-practices) -- Write rates, document size guidance
- [Firestore Offline Persistence](https://firebase.google.com/docs/firestore/manage-data/enable-offline) -- enablePersistence, cache-first behavior

### MEDIUM Confidence (Multiple Sources Agree)

- [GitLab Pajamas: Saving and Feedback](https://design.gitlab.com/patterns/saving-and-feedback/) -- "Saving..." / "Saved" indicator patterns, 3-second debounce for text, auto-save UX states
- [GitHub Primer: Saving Patterns](https://primer.style/ui-patterns/saving/) -- Save status communication patterns
- [ui-patterns.com: Autosave](https://ui-patterns.com/patterns/autosave) -- Keep save button visible, trigger on blur and interval, combine with undo
- [Eleken: Empty State UX](https://www.eleken.co/blog-posts/empty-state-ux) -- Action-oriented CTAs, educational content, minimalist design
- [Pencil & Paper: Empty State Best Practices](https://www.pencilandpaper.io/articles/empty-states) -- Interactive empty states, contextual guidance
- [Uploadcare: File Uploader UX](https://uploadcare.com/blog/file-uploader-ux-best-practices/) -- Drag-and-drop, progress indicators, error messages
- [MDN: beforeunload event](https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeunload_event) -- Best practices, performance considerations

### LOW Confidence (Single Source, Needs Validation)

- [Figma Blog: Behind the Feature - Autosave](https://www.figma.com/blog/behind-the-feature-autosave/) -- Challenges of autosave in collaborative editors (relevant for understanding what NOT to build)
- [Darius Marlowe: useAutoSave Hook](https://darius-marlowe.medium.com/smarter-forms-in-react-building-a-useautosave-hook-with-debounce-and-react-query-d4d7f9bb052e) -- React hook pattern for debounced auto-save with status reporting

### Codebase Analysis (Direct Verification)

- `src/App.tsx` lines 25-73: Complete settings state model that must be persisted (20+ fields)
- `src/stores/syncStore.ts`: Map-based anchor storage, serializable via `Object.fromEntries`
- `src/lib/exportClient.ts` line 71: Existing Map serialization pattern (`Object.fromEntries`)
- `src/components/UploadDropZone.tsx`: Existing file upload component, reusable pattern for project creation
- `src/types/score.ts`: `ScoreRegion` type already Firestore-compatible (plain object)
- `src/borders/index.tsx`: `BorderStyle` is a string union, directly storable in Firestore

---

## Confidence Assessment

| Area | Confidence | Reason |
|------|------------|--------|
| Google sign-in flow | HIGH | Firebase Auth is the most documented auth SDK; Google sign-in is its primary use case |
| Auth context pattern | HIGH | onAuthStateChanged + React Context is a universal pattern with hundreds of verified tutorials |
| Firestore document schema | HIGH | Direct mapping from existing App.tsx state; all types are Firestore-native (strings, numbers, booleans, objects) |
| Auto-save debounce timing | MEDIUM | 1500ms is a reasoned choice but needs empirical validation; may need adjustment based on user testing |
| Dashboard UX patterns | HIGH | Grid-of-cards is the universal standard for project dashboards in creative tools |
| Thumbnail generation | MEDIUM | SVG-to-data-URL is straightforward but document size impact needs monitoring |
| Firebase Storage file paths | HIGH | Standard hierarchical path convention from Firebase docs |
| Security rules | HIGH | Standard owner-only rules from Firebase documentation |
| beforeunload behavior | MEDIUM | Works reliably on desktop browsers; unreliable on mobile (acceptable since mobile is not the primary target) |
