# Phase 26: Auto-Save & Data Persistence - Research

**Researched:** 2026-02-11
**Domain:** Zustand state management + Firestore server-side persistence via Next.js API routes
**Confidence:** HIGH

## Summary

This phase adds auto-save and full project loading for the Manuscript editor. All project settings (score color, scale, font, border, animation options, score region) and sync anchors currently live as ephemeral React/Zustand state in `App.tsx` and `syncStore.ts`. They must persist to Firestore and reload when a project is reopened from the dashboard.

The architecture is straightforward: the project already uses server-side Firestore via `firebase-admin` through Next.js API routes (no client-side Firestore SDK). The auto-save pattern is: **client detects state changes -> debounce 1500ms -> PATCH to `/api/projects/[id]` -> server writes to Firestore**. No new libraries are needed. The sync anchors `Map<string, number>` serializes cleanly via `Object.fromEntries()` / `new Map(Object.entries())` -- a pattern already proven in the export client.

**Primary recommendation:** Consolidate all saveable settings into a single Zustand store (`useProjectStore`) with `subscribeWithSelector` middleware. Subscribe to saveable state slices outside React, debounce with a simple `setTimeout`, and POST changes to an existing API route that calls `docRef.update()`. Load settings from the existing `GET /api/projects/[id]` response. Add a small `SaveIndicator` component driven by store state.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| zustand | ^5.0.10 | State management with subscribeWithSelector | Already in use, supports external subscriptions |
| firebase-admin | ^13.6.1 | Server-side Firestore writes | Already in use for all API routes |
| next | ^16.1.6 | API routes for client-server communication | Already the framework |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| zustand/middleware (subscribeWithSelector) | built-in | Subscribe to state slices outside React | For the auto-save subscription |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Manual setTimeout debounce | lodash.debounce | Extra dependency for trivial function; not worth it |
| Server-side Firestore via API routes | Client-side Firestore SDK | Would require adding firestore to firebase-client.ts, managing auth tokens client-side, and dealing with offline persistence conflicts. Server-side is simpler and already established |
| zustand persist middleware | Custom subscription + API call | Persist middleware targets localStorage/sessionStorage. Our target is Firestore via API, so custom subscription is more appropriate |
| zustand-debounce library | Manual debounce in subscribe | Extra dependency for a 5-line setTimeout/clearTimeout pattern |

**Installation:**
```bash
# No new packages needed -- all libraries already installed
```

## Architecture Patterns

### Recommended Project Structure
```
src/
  stores/
    projectStore.ts       # NEW: All saveable project settings + save status + auto-save logic
    syncStore.ts           # MODIFY: Add subscribeWithSelector, wire into auto-save
    eventStore.ts          # UNCHANGED
  app/
    api/projects/[id]/
      route.ts             # MODIFY: Add PATCH handler for partial updates
  components/
    SaveIndicator.tsx      # NEW: Shows "Saving...", "Saved", "Error" status
  App.tsx                  # MODIFY: Lift settings state into projectStore, load from API on mount
```

### Pattern 1: Centralized Project Settings Store
**What:** Move all saveable settings from `App.tsx` local state into a single Zustand store.
**When to use:** When multiple pieces of state need to be persisted together and observed for changes.
**Example:**
```typescript
// src/stores/projectStore.ts
import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { ScoreRegion } from '../types/score';
import type { BorderStyle } from '../borders';

interface ProjectSettings {
  // Score appearance
  scoreColor: string;
  scoreScale: number;
  musicFont: string;
  scoreBorder: BorderStyle;
  hideLabels: boolean;
  scoreRegion: ScoreRegion | null;

  // Note animation
  activeNoteheadColor: string | null;
  activeNoteheadScale: number;
  activeNoteheadEntryMs: number;
  activeNoteheadHoldMs: number;
  activeNoteheadExitMs: number;
  colorFullNote: boolean;

  // Playback
  fps: number;
  scoreShadowDistance: number;
  hideUnplayedNotes: boolean;
  smoothReveal: boolean;
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface ProjectStore extends ProjectSettings {
  // Meta
  projectId: string | null;
  saveStatus: SaveStatus;
  lastSaveError: string | null;

  // Actions
  setSetting: <K extends keyof ProjectSettings>(key: K, value: ProjectSettings[K]) => void;
  loadSettings: (settings: Partial<ProjectSettings>) => void;
  setProjectId: (id: string | null) => void;
  setSaveStatus: (status: SaveStatus, error?: string) => void;
}

const DEFAULT_SETTINGS: ProjectSettings = {
  scoreColor: '#000000',
  scoreScale: 1.0,
  musicFont: 'Bravura',
  scoreBorder: 'none',
  hideLabels: false,
  scoreRegion: null,
  activeNoteheadColor: '#000000',
  activeNoteheadScale: 1.2,
  activeNoteheadEntryMs: 50,
  activeNoteheadHoldMs: 200,
  activeNoteheadExitMs: 500,
  colorFullNote: false,
  fps: 30,
  scoreShadowDistance: 0,
  hideUnplayedNotes: true,
  smoothReveal: true,
};

export const useProjectStore = create<ProjectStore>()(
  subscribeWithSelector((set) => ({
    ...DEFAULT_SETTINGS,
    projectId: null,
    saveStatus: 'idle' as SaveStatus,
    lastSaveError: null,

    setSetting: (key, value) => set({ [key]: value }),
    loadSettings: (settings) => set(settings),
    setProjectId: (id) => set({ projectId: id }),
    setSaveStatus: (status, error) => set({
      saveStatus: status,
      lastSaveError: error ?? null,
    }),
  }))
);
```

### Pattern 2: External Subscription with Debounced Auto-Save
**What:** Subscribe to the store outside React to trigger auto-save on any settings change.
**When to use:** When you need to react to state changes without coupling to component lifecycle.
**Example:**
```typescript
// src/lib/autoSave.ts
import { useProjectStore } from '../stores/projectStore';
import { useSyncStore } from '../stores/syncStore';

const SAVE_DEBOUNCE_MS = 1500;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

// Extract only the saveable settings slice
function getSaveableSettings(state: ReturnType<typeof useProjectStore.getState>) {
  const { projectId, saveStatus, lastSaveError, setSetting, loadSettings,
          setProjectId, setSaveStatus, ...settings } = state;
  return settings;
}

async function performSave(projectId: string) {
  const { setSaveStatus } = useProjectStore.getState();
  setSaveStatus('saving');

  try {
    const settings = getSaveableSettings(useProjectStore.getState());
    const anchors = useSyncStore.getState().anchors;

    const res = await fetch(`/api/projects/${projectId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        settings,
        anchors: Object.fromEntries(anchors),
      }),
    });

    if (!res.ok) throw new Error('Save failed');
    setSaveStatus('saved');
  } catch (err) {
    setSaveStatus('error', (err as Error).message);
  }
}

function scheduleSave() {
  const { projectId } = useProjectStore.getState();
  if (!projectId) return;

  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => performSave(projectId), SAVE_DEBOUNCE_MS);
}

// Subscribe to project settings changes
export function initAutoSave() {
  // Watch all settings via a serialized snapshot
  const unsub1 = useProjectStore.subscribe(
    (state) => getSaveableSettings(state),
    () => scheduleSave(),
    { equalityFn: (a, b) => JSON.stringify(a) === JSON.stringify(b) }
  );

  // Watch sync anchors
  const unsub2 = useSyncStore.subscribe(
    (state) => state.anchors,
    () => scheduleSave()
  );

  return () => {
    unsub1();
    unsub2();
    if (saveTimer) clearTimeout(saveTimer);
  };
}
```

### Pattern 3: Server-Side Partial Update via PATCH
**What:** A PATCH endpoint that accepts partial project settings and writes them to Firestore.
**When to use:** For auto-save where only changed fields need to persist.
**Example:**
```typescript
// In src/app/api/projects/[id]/route.ts - add PATCH handler
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthenticatedUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const body = await request.json();
  const { settings, anchors } = body;

  const db = getDb();
  const docRef = db.collection('users').doc(user.uid)
    .collection('projects').doc(id);

  const doc = await docRef.get();
  if (!doc.exists) return Response.json({ error: 'Not found' }, { status: 404 });

  await docRef.update({
    ...(settings ?? {}),
    ...(anchors !== undefined ? { anchors } : {}),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return Response.json({ status: 'saved' });
}
```

### Pattern 4: Map Serialization for Sync Anchors
**What:** Convert `Map<string, number>` to/from plain objects for Firestore storage.
**When to use:** Firestore does not store JS Maps natively. Use `Object.fromEntries()` to serialize and `new Map(Object.entries())` to deserialize.
**Example:**
```typescript
// Serialize (client -> server)
const anchorsPlain = Object.fromEntries(anchors); // { "evt-0": 1.5, "evt-3": 4.2 }

// Deserialize (server -> client)
const anchorsMap = new Map<string, number>(
  Object.entries(anchorsPlain).map(([k, v]) => [k, Number(v)])
);
```

### Anti-Patterns to Avoid
- **Saving on every keystroke/slider tick:** Always debounce. The 1500ms debounce is critical for sliders that fire onChange on every pixel of movement.
- **Using client-side Firestore SDK for writes:** The project uses server-side firebase-admin exclusively. Adding client SDK would create two auth paths and the offline persistence conflict flagged in STATE.md.
- **Storing Map objects directly in Firestore:** Firestore stores them as empty objects. Always convert via `Object.fromEntries()`.
- **Persisting transient UI state:** Export state, drag state, loading state, selected event -- these should NOT be saved.
- **Reading settings from Firestore on every state change:** Load once on project open, then write-only during the session.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Debouncing | Debounce library or complex queue | Simple setTimeout/clearTimeout | 5 lines of code, no edge cases for this use case |
| Map serialization | Custom serializer | Object.fromEntries/Object.entries | Standard JS, already used in exportClient.ts |
| State subscriptions | useEffect watching every field | zustand subscribeWithSelector | Works outside React, fires only on actual changes |
| Save status UI | Complex state machine | Three-state enum ('saving'/'saved'/'error') | Sufficient for this UX |

**Key insight:** This feature is fundamentally simple: watch state, debounce, POST, update indicator. The complexity risk is in over-engineering (real-time sync, conflict resolution, optimistic updates) none of which are needed for a single-user editor.

## Common Pitfalls

### Pitfall 1: Firestore Offline Persistence Conflict
**What goes wrong:** The STATE.md flags: "Firestore offline persistence could conflict with auto-save debounce." If client-side Firestore SDK with offline persistence is enabled, writes queue locally and may conflict with server-side writes.
**Why it happens:** The client SDK can be initialized with `enablePersistence()` which caches writes locally.
**How to avoid:** Do NOT use client-side Firestore SDK for writes. The current architecture (all Firestore access through server-side API routes) completely avoids this issue. The client-side `firebase-client.ts` only initializes Auth, not Firestore.
**Warning signs:** If someone imports `getFirestore` from `firebase/firestore` in client code.

### Pitfall 2: Save Triggered During Initial Load
**What goes wrong:** When a project loads, `loadSettings()` updates the store, which triggers the auto-save subscription, causing an unnecessary save of the same data that was just loaded.
**Why it happens:** The subscription fires on any state change, including programmatic loads.
**How to avoid:** Use a guard flag: set `isLoading = true` before loading, skip save while loading. Or better: only initialize the auto-save subscription AFTER the initial load completes.
**Warning signs:** Network tab shows a PATCH request immediately after the initial GET on project load.

### Pitfall 3: Stale Save Overwrites Fresh Data
**What goes wrong:** User makes change A, then change B within the debounce window. Timer fires for A but sends the state at fire-time (which includes B). This is actually fine -- but if save A was already in-flight and save B triggers before A completes, we might show incorrect status.
**Why it happens:** Concurrent saves with debounce.
**How to avoid:** Cancel the previous save's status update if a new save is triggered. The simple approach: always read current state at save-time (not at schedule-time), so the latest state always wins.
**Warning signs:** "Saved" indicator flickers between states.

### Pitfall 4: Anchors Map Equality Check
**What goes wrong:** Zustand subscription fires on every render because `Map` objects are compared by reference, not value.
**Why it happens:** `new Map()` always creates a new reference even with identical content.
**How to avoid:** Use a serialized key for comparison. The existing codebase already uses `anchorsKey = Array.from(anchors.entries()).map(([k,v]) => \`${k}:${v}\`).join(',')` in SyncEditor.tsx. Use similar approach in the subscription equalityFn, or subscribe to the serialized form.
**Warning signs:** Continuous "Saving..." indicator even when nothing changed.

### Pitfall 5: ScoreRegion Objects Trigger Unnecessary Saves
**What goes wrong:** `scoreRegion` is an object `{x, y, width, height}` that gets new references on every drag tick.
**Why it happens:** App.tsx already debounces scoreRegion for Verovio re-renders (300ms), but auto-save needs its own debounce too.
**How to avoid:** The 1500ms auto-save debounce naturally handles this -- many intermediate values are collapsed into one save. But the subscription equality check must use deep comparison (JSON.stringify) not reference equality.
**Warning signs:** Dozens of PATCH requests while dragging the score region editor.

### Pitfall 6: Project Type Mismatch After Schema Extension
**What goes wrong:** The `Project` interface in `types/project.ts` currently has minimal fields. After adding settings fields to Firestore, the GET response returns fields the type doesn't know about.
**Why it happens:** TypeScript type doesn't match Firestore document shape.
**How to avoid:** Extend the `Project` interface (or create a `ProjectDocument` type) to include all saveable settings. Keep the types in sync with the Firestore schema.
**Warning signs:** TypeScript errors or missing fields when loading projects.

## Code Examples

### Loading Settings on Project Open
```typescript
// In App.tsx loadProject() effect -- extend existing fetch
useEffect(() => {
  if (!projectId) return;

  async function loadProject() {
    setIsLoadingProject(true);
    try {
      const res = await fetch(`/api/projects/${projectId}`);
      if (!res.ok) return;
      const { project } = await res.json();

      // Load settings into store
      const { loadSettings, setProjectId } = useProjectStore.getState();
      setProjectId(projectId);
      loadSettings({
        scoreColor: project.scoreColor ?? '#000000',
        scoreScale: project.scoreScale ?? 1.0,
        musicFont: project.musicFont ?? 'Bravura',
        scoreBorder: project.scoreBorder ?? 'none',
        hideLabels: project.hideLabels ?? false,
        scoreRegion: project.scoreRegion ?? null,
        activeNoteheadColor: project.activeNoteheadColor ?? '#000000',
        activeNoteheadScale: project.activeNoteheadScale ?? 1.2,
        activeNoteheadEntryMs: project.activeNoteheadEntryMs ?? 50,
        activeNoteheadHoldMs: project.activeNoteheadHoldMs ?? 200,
        activeNoteheadExitMs: project.activeNoteheadExitMs ?? 500,
        colorFullNote: project.colorFullNote ?? false,
        fps: project.fps ?? 30,
        scoreShadowDistance: project.scoreShadowDistance ?? 0,
        hideUnplayedNotes: project.hideUnplayedNotes ?? true,
        smoothReveal: project.smoothReveal ?? true,
      });

      // Load sync anchors
      if (project.anchors && typeof project.anchors === 'object') {
        const { clearAllAnchors, setAnchor } = useSyncStore.getState();
        clearAllAnchors();
        for (const [eventId, timestamp] of Object.entries(project.anchors)) {
          setAnchor(eventId, Number(timestamp));
        }
      }

      // THEN initialize auto-save (after load completes)
      initAutoSave();

      // ... existing file loading code ...
    } finally {
      setIsLoadingProject(false);
    }
  }

  loadProject();
}, [projectId]);
```

### Save Status Indicator Component
```typescript
// src/components/SaveIndicator.tsx
import { useProjectStore } from '../stores/projectStore';

export function SaveIndicator() {
  const saveStatus = useProjectStore((s) => s.saveStatus);

  if (saveStatus === 'idle') return null;

  return (
    <div className="flex items-center gap-1.5 text-xs">
      {saveStatus === 'saving' && (
        <span className="text-neutral-400">Saving...</span>
      )}
      {saveStatus === 'saved' && (
        <span className="text-green-500">Saved</span>
      )}
      {saveStatus === 'error' && (
        <span className="text-red-400">Save error</span>
      )}
    </div>
  );
}
```

### Firestore Document Schema (Extended)
```typescript
// What a full project document looks like in Firestore
// Collection: users/{uid}/projects/{id}
{
  // Existing fields (from Phase 24-25)
  name: "My Project",
  viewMode: "page",
  scoreUrl: "https://storage...",
  scoreFileName: "score.xml",
  audioUrl: "https://storage...",
  audioFileName: "audio.mp3",
  backgroundUrl: "https://storage...",
  backgroundFileName: "background.jpg",
  createdAt: Timestamp,
  updatedAt: Timestamp,

  // NEW: Project settings (Phase 26)
  scoreColor: "#000000",
  scoreScale: 1.0,
  musicFont: "Bravura",
  scoreBorder: "none",
  hideLabels: false,
  scoreRegion: null,  // or { x: 0, y: 0, width: 980, height: 551 }
  activeNoteheadColor: "#000000",  // or null
  activeNoteheadScale: 1.2,
  activeNoteheadEntryMs: 50,
  activeNoteheadHoldMs: 200,
  activeNoteheadExitMs: 500,
  colorFullNote: false,
  fps: 30,
  scoreShadowDistance: 0,
  hideUnplayedNotes: true,
  smoothReveal: true,

  // NEW: Sync anchors (Phase 26)
  anchors: {           // Plain object, NOT a Map
    "evt-0": 0,
    "evt-5": 2.35,
    "evt-12": 5.1
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual save button | Auto-save with debounce | Standard for 5+ years | Users never lose work, no save button needed |
| Client-side Firestore SDK with offline | Server-side via API routes | Project decision (Phase 24) | Simpler auth, no offline persistence conflicts |
| zustand persist middleware to localStorage | Custom subscription to server API | N/A (project choice) | Settings persist across devices, not just browser |

**Deprecated/outdated:**
- `enablePersistence()` on web Firestore: Not needed since we don't use client-side Firestore
- Zustand v3 `subscribe` API (no selector): v5 uses `subscribeWithSelector` middleware for selector-based subscriptions

## Open Questions

1. **Should `fps` persist per-project or stay as a session-only setting?**
   - What we know: fps is listed in requirements as a project setting. The export also uses it.
   - What's unclear: Users might want different fps per project or always use the same default.
   - Recommendation: Persist it per-project per the requirements. Default to 30.

2. **Should the "Saved" indicator auto-dismiss or persist?**
   - What we know: Requirements say show "Saving...", "Saved", or "Error".
   - What's unclear: Should "Saved" fade after a few seconds?
   - Recommendation: Show "Saved" for 3 seconds, then return to idle. Keep "Error" visible until next save attempt.

3. **What happens to existing projects (created before Phase 26) that have no settings fields?**
   - What we know: Firestore returns undefined for missing fields. Loading code uses `??` fallback to defaults.
   - What's unclear: Nothing -- the defaults handle this gracefully.
   - Recommendation: Use `?? defaultValue` pattern when loading. No migration needed.

## Sources

### Primary (HIGH confidence)
- **Codebase analysis** - Read all relevant source files: App.tsx (settings state), syncStore.ts (anchors Map), project types, API routes, firestore.ts, firebase-admin.ts, exportClient.ts (Map serialization pattern)
- **STATE.md** - Firestore offline persistence concern flagged for Phase 26 investigation

### Secondary (MEDIUM confidence)
- [Zustand subscribeWithSelector docs](https://zustand.docs.pmnd.rs/middlewares/subscribe-with-selector) - Verified selector-based subscription API
- [Zustand persist middleware docs](https://zustand.docs.pmnd.rs/middlewares/persist) - Confirmed custom storage adapter not needed
- [Firebase Firestore add data docs](https://firebase.google.com/docs/firestore/manage-data/add-data) - Verified `update()` for partial fields, `set({merge:true})` for upsert
- [Zustand GitHub discussions on debounce](https://github.com/pmndrs/zustand/discussions/1179) - Community patterns for debounced subscriptions

### Tertiary (LOW confidence)
- None -- all findings verified against codebase or official docs

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - No new libraries needed, all patterns verified in existing codebase
- Architecture: HIGH - Extends existing patterns (API routes, Zustand stores, firebase-admin)
- Pitfalls: HIGH - Identified through codebase analysis and STATE.md concern investigation

**Research date:** 2026-02-11
**Valid until:** 2026-03-11 (stable -- no rapidly changing dependencies)
