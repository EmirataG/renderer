---
phase: quick-50
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/renderers/RegularRenderer.tsx
  - src/renderers/SingleLineRenderer.tsx
autonomous: true
must_haves:
  truths:
    - "transportMessage logic uses the original 3-way ternary (no events.length === 0 guard)"
    - "Console logs fire whenever transportMessage is computed, showing events count, first/last IDs, syncAnchors keys, and anchor match status"
  artifacts:
    - path: "src/renderers/RegularRenderer.tsx"
      provides: "Original transportMessage + diagnostic logs"
      contains: "console.log.*TRANSPORT_DEBUG"
    - path: "src/renderers/SingleLineRenderer.tsx"
      provides: "Original transportMessage + diagnostic logs"
      contains: "console.log.*TRANSPORT_DEBUG"
  key_links: []
---

<objective>
Revert the `events.length === 0` guard added to the transportMessage logic in both RegularRenderer.tsx and SingleLineRenderer.tsx, restoring the original 3-way ternary. Then add diagnostic console.log statements to help debug why the "Set first and last sync anchors" message appears when anchors are already present.

Purpose: The events.length guard was masking the real bug rather than fixing it. We need to see the actual state of events, syncAnchors, and anchor matching to find the root cause.
Output: Both renderer files with reverted transportMessage logic and diagnostic logging.
</objective>

<execution_context>
@.planning/quick/50-revert-transport-message-fix-and-add-dia/50-PLAN.md
</execution_context>

<context>
@src/renderers/RegularRenderer.tsx
@src/renderers/SingleLineRenderer.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Revert transportMessage and add diagnostics in both renderers</name>
  <files>
    src/renderers/RegularRenderer.tsx
    src/renderers/SingleLineRenderer.tsx
  </files>
  <action>
In BOTH `src/renderers/RegularRenderer.tsx` and `src/renderers/SingleLineRenderer.tsx`, make two changes:

**Change 1: Revert transportMessage to original logic**

Replace the current 4-way ternary:
```js
const transportMessage = !hasAudio
    ? "Upload audio to enable playback"
    : events.length === 0
      ? null // Events still loading — don't show misleading anchor message
      : (!hasFirstAnchor || !hasLastAnchor)
        ? "Set first and last sync anchors to enable playback"
        : null;
```

With the original 3-way ternary:
```js
const transportMessage = !hasAudio
    ? "Upload audio to enable playback"
    : (!hasFirstAnchor || !hasLastAnchor)
      ? "Set first and last sync anchors to enable playback"
      : null;
```

**Change 2: Add diagnostic console.log block**

Immediately AFTER the `transportMessage` declaration (and before the `play()` function), add the following diagnostic block:

```js
// --- DIAGNOSTIC: remove after debugging transport message issue ---
if (hasAudio && (!hasFirstAnchor || !hasLastAnchor)) {
  console.log('[TRANSPORT_DEBUG]', {
    eventsCount: events.length,
    firstEventId,
    lastEventId,
    syncAnchorsSize: syncAnchors?.size ?? 0,
    syncAnchorsKeys: syncAnchors ? Array.from(syncAnchors.keys()) : [],
    hasFirstAnchor,
    hasLastAnchor,
    firstAnchorLookup: firstEventId ? syncAnchors?.has(firstEventId) : 'no firstEventId',
    lastAnchorLookup: lastEventId ? syncAnchors?.has(lastEventId) : 'no lastEventId',
  });
}
```

This diagnostic only fires when audio exists but anchors appear missing -- the exact condition that produces the misleading message. It logs:
1. Whether events are empty (eventsCount)
2. What the first/last event IDs are
3. What keys are in the syncAnchors map
4. Whether syncAnchors.has() finds the first/last event IDs
  </action>
  <verify>
Run `npx tsc --noEmit` to confirm no type errors. Then grep for `TRANSPORT_DEBUG` in both files to confirm diagnostics are present, and grep for `events.length === 0` in both files to confirm the guard is removed.
  </verify>
  <done>
Both files have the original 3-way transportMessage ternary (no events.length guard), and both files have `[TRANSPORT_DEBUG]` console.log blocks that fire when audio is present but anchors appear missing.
  </done>
</task>

</tasks>

<verification>
- `grep -n "events.length === 0" src/renderers/RegularRenderer.tsx src/renderers/SingleLineRenderer.tsx` returns NO matches in the transportMessage area (the interpolation useEffect still has this check, which is correct)
- `grep -n "TRANSPORT_DEBUG" src/renderers/RegularRenderer.tsx src/renderers/SingleLineRenderer.tsx` returns matches in both files
- `npx tsc --noEmit` passes with no errors
</verification>

<success_criteria>
- The `events.length === 0` guard is removed from transportMessage in both renderers
- The original 3-way ternary is restored in both renderers
- Diagnostic console.log with label `[TRANSPORT_DEBUG]` is present in both renderers
- Diagnostics log: eventsCount, firstEventId, lastEventId, syncAnchorsSize, syncAnchorsKeys, hasFirstAnchor, hasLastAnchor, and explicit .has() lookups
- TypeScript compiles without errors
</success_criteria>

<output>
After completion, create `.planning/quick/50-revert-transport-message-fix-and-add-dia/50-SUMMARY.md`
</output>
