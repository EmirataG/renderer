---
status: diagnosed
phase: 26-auto-save-data-persistence
source: [26-01-SUMMARY.md, 26-02-SUMMARY.md]
started: 2026-02-12T01:15:00Z
updated: 2026-02-12T01:35:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Settings Auto-Save
expected: Open a project from the dashboard. Change a setting (e.g., score color). After ~1.5 seconds, "Saving..." appears briefly in the Inspector header next to "Score Controls", then changes to "Saved".
result: pass

### 2. Saved Auto-Dismiss
expected: After "Saved" appears, it automatically disappears after about 3 seconds, returning to no indicator shown.
result: pass

### 3. Settings Persist on Reopen
expected: After changing a setting and seeing "Saved", refresh the page or navigate back to dashboard and reopen the project. The changed setting loads with the value you set (not the default).
result: pass

### 4. Sync Anchors Persist
expected: Open SyncEditor and set or move some sync anchors. After ~1.5 seconds, "Saving..." then "Saved" appears. Refresh the page and reopen the project. The anchors are restored at their saved positions.
result: issue
reported: "anchors persist, but when I reload, it still says Set first and last sync anchors to enable playback (even though they are there)"
severity: major

### 5. No Spurious Save on Load
expected: Open a project from the dashboard. Watch the Inspector header — no "Saving..." indicator should appear during initial load. Open browser DevTools Network tab and confirm no PATCH request fires on project open.
result: pass

### 6. Background Image Persists
expected: If the project has a background image set, it loads visually when the project is reopened. The background appears behind the score as expected.
result: pass

### 7. Error State Display
expected: If a save fails (e.g., disconnect from network temporarily), "Save error" appears in red in the Inspector header. Hovering over it shows the error detail.
result: pass

## Summary

total: 7
passed: 6
issues: 1 (fixed)
pending: 0
skipped: 0

## Gaps

- truth: "Sync anchors restore and UI recognizes them (no stale 'Set first and last sync anchors' message)"
  status: fixed
  reason: "User reported: anchors persist, but when I reload, it still says Set first and last sync anchors to enable playback (even though they are there)"
  severity: major
  test: 4
  root_cause: "App.tsx and SyncEditor.tsx used destructuring const { anchors } = useSyncStore() instead of selector functions. With subscribeWithSelector middleware, destructuring captures the initial Map reference and doesn't re-render when setAnchor() creates new Maps during anchor restoration."
  artifacts:
    - path: "src/App.tsx"
      issue: "Destructured anchors from useSyncStore() instead of using selector"
    - path: "src/components/SyncEditor.tsx"
      issue: "Destructured all state from useSyncStore() instead of using individual selectors"
  missing:
    - "Use useSyncStore((state) => state.anchors) selector pattern for proper Map reactivity"
  debug_session: ".planning/debug/resolved/sync-anchor-message-not-clearing.md"
  fix_commits: ["7d2caec", "975e36b"]
