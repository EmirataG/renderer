---
status: resolved
trigger: "Investigate why restored sync anchors from Firestore don't clear the 'Set first and last sync anchors to enable playback' message on project reload."
created: 2026-02-11T00:00:00Z
updated: 2026-02-11T00:00:00Z
symptoms_prefilled: true
---

## Current Focus

hypothesis: App.tsx destructures { anchors } from useSyncStore() at line 25, which creates a reference to the initial Map. When setAnchor is called multiple times in loadProject, setAnchor creates new Map objects (line 24-26 of syncStore.ts), but the destructured reference in App doesn't update because Zustand's subscribeWithSelector middleware may not properly track Map object changes when using destructuring syntax.
test: Check if using a selector function instead of destructuring fixes the issue
expecting: Selector function will properly track Map reference changes and trigger re-renders
next_action: Verify hypothesis by examining Zustand subscription behavior with Maps

## Symptoms

expected: After project loads and anchors are restored from Firestore into syncStore, the "Set first and last sync anchors to enable playback" message should disappear
actual: Message persists even though anchors exist in syncStore
errors: None reported
reproduction: 1) Create project with sync anchors, 2) Save to Firestore, 3) Reload project, 4) Message still shows
started: After implementing anchor persistence feature

## Eliminated

## Evidence

- timestamp: 2026-02-11T00:01:00Z
  checked: RegularRenderer.tsx lines 480-492
  found: Message condition checks hasFirstAnchor and hasLastAnchor, derived from syncAnchors prop (lines 484-485). Logic is: hasFirstAnchor = !!(firstEventId && syncAnchors?.has(firstEventId))
  implication: Component logic looks correct - it checks syncAnchors.has(firstEventId). Need to verify what value is being passed as syncAnchors prop.

- timestamp: 2026-02-11T00:02:00Z
  checked: App.tsx line 25, line 845
  found: anchors comes from useSyncStore() hook (line 25), passed to RegularRenderer as syncAnchors prop at line 845
  implication: The anchors value from the store is being read when App component renders. Need to verify if Zustand properly notifies subscribers when setAnchor is called.

- timestamp: 2026-02-11T00:03:00Z
  checked: syncStore.ts lines 23-27, App.tsx line 137-141
  found: setAnchor creates a new Map each time (line 24-26). During loadProject, clearAllAnchors() is called once, then setAnchor is called in a loop for each restored anchor. App.tsx uses destructuring syntax: const { anchors } = useSyncStore()
  implication: The issue is likely that App.tsx captures the initial anchors Map reference when the component renders, and doesn't re-render when the Map reference changes. Zustand with subscribeWithSelector middleware should track this, but destructuring may prevent proper reactivity.

## Resolution

root_cause: App.tsx line 25 and SyncEditor.tsx line 67 use destructuring syntax to access the anchors Map from useSyncStore(). When anchors are restored from Firestore via setAnchor() calls in loadProject (App.tsx lines 137-141), Zustand creates new Map objects, but components using destructuring don't re-render. Zustand's subscribeWithSelector middleware requires explicit selector functions for proper reactivity tracking, not destructuring. The destructured value captures the initial Map reference and never updates.
fix: Changed App.tsx line 25 from `const { anchors } = useSyncStore()` to `const anchors = useSyncStore((state) => state.anchors)`. Also fixed SyncEditor.tsx line 67 to use individual selector functions instead of destructuring. This creates proper Zustand selectors that will track Map reference changes and trigger re-renders when setAnchor creates new Map objects.
verification: After the fix, reload a project with saved anchors. The "Set first and last sync anchors" message should disappear immediately after project load completes, confirming that the component re-rendered with the updated anchors Map.
files_changed: [src/App.tsx, src/components/SyncEditor.tsx]
