---
phase: "30"
plan: 1
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/SyncEditor.tsx
autonomous: true
must_haves:
  truths:
    - "Reset button is the same size as the play button (w-12 h-12) with matching icon size (w-7 h-7)"
    - "When a note is selected, anchor action buttons appear in the header bar"
    - "Anchor ? button sets anchor to the value currently shown in the TimestampInput"
    - "Anchor to current time button appears only when audio is paused and sets anchor to current audio playhead time"
    - "Remove Anchor button appears only when selected note already has an anchor"
    - "Anchor validation prevents setting a timestamp earlier than the previous anchored event or later than the next anchored event"
  artifacts:
    - path: "src/components/SyncEditor.tsx"
      provides: "Reset button resize, anchor action buttons with validation"
  key_links:
    - from: "Anchor buttons in header"
      to: "useSyncStore setAnchor/removeAnchor"
      via: "onClick handlers with validation"
      pattern: "setAnchor|removeAnchor"
---

<objective>
Resize the reset button to match the play button dimensions and add anchor action buttons for the selected note in the sync editor header.

Purpose: The reset button currently looks undersized next to play. The anchor buttons provide a direct UI for anchoring notes to timestamps without manually editing the timestamp input, and validation prevents impossible anchor orderings.

Output: Updated SyncEditor.tsx with resized reset button and new anchor action buttons.
</objective>

<execution_context>
@/Users/emirahmed/.claude/get-shit-done/workflows/execute-plan.md
@/Users/emirahmed/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/components/SyncEditor.tsx
@src/stores/syncStore.ts
@src/lib/interpolation.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Resize reset button to match play button</name>
  <files>src/components/SyncEditor.tsx</files>
  <action>
In SyncEditor.tsx, find the reset button (around line 642). Change:
- Button classes from `grunge-btn grunge-btn-sm w-8 h-8` to `grunge-btn w-12 h-12` (matching play button)
- Icon SVG classes from `w-4 h-4` to `w-7 h-7` (matching play button icon size)

This makes the reset (stop) button visually identical in size to the play/pause button.
  </action>
  <verify>Visual inspection: reset button is same dimensions as play button in the audio controls bar.</verify>
  <done>Reset button renders at w-12 h-12 with w-7 h-7 icon, matching the play button.</done>
</task>

<task type="auto">
  <name>Task 2: Add anchor action buttons with validation for selected notes</name>
  <files>src/components/SyncEditor.tsx</files>
  <action>
In SyncEditor.tsx, add anchor action buttons in the header bar next to the existing TimestampInput when a note is selected (inside the `selectedEvent` conditional block, around lines 564-589).

**Add a validation helper function** before the return statement:

```typescript
// Validate that a proposed anchor timestamp doesn't violate ordering
// Returns true if valid, false if it would be out of order
const validateAnchorTimestamp = useCallback((eventId: string, proposedTime: number): boolean => {
  // Find the event's position in the sorted interpolated events
  const eventIndex = interpolatedEvents.findIndex(e => e.id === eventId);
  if (eventIndex === -1) return false;

  // Find previous anchored event (scanning backward from eventIndex)
  for (let i = eventIndex - 1; i >= 0; i--) {
    const prevAnchor = anchors.get(interpolatedEvents[i].id);
    if (prevAnchor !== undefined) {
      if (proposedTime <= prevAnchor) return false; // Must be strictly after previous anchor
      break;
    }
  }

  // Find next anchored event (scanning forward from eventIndex)
  for (let i = eventIndex + 1; i < interpolatedEvents.length; i++) {
    const nextAnchor = anchors.get(interpolatedEvents[i].id);
    if (nextAnchor !== undefined) {
      if (proposedTime >= nextAnchor) return false; // Must be strictly before next anchor
      break;
    }
  }

  return true;
}, [interpolatedEvents, anchors]);
```

**Also update handleTimestampChange** to use validation:

```typescript
const handleTimestampChange = useCallback((seconds: number) => {
  if (selectedEventId && validateAnchorTimestamp(selectedEventId, seconds)) {
    setAnchor(selectedEventId, seconds);
  }
}, [selectedEventId, setAnchor, validateAnchorTimestamp]);
```

**Add anchor action buttons** inside the `selectedEvent` block, after the existing anchor badge span. Place them in a flex row alongside the existing timestamp controls:

1. **"Anchor" button** (always visible when a note is selected):
   - Text label: "Anchor" (compact grunge-btn-sm style)
   - onClick: reads the current value from TimestampInput (use `selectedAnchorTime ?? selectedEvent.computedTimestamp`) and calls `setAnchor` with validation
   - If validation fails, do nothing (button could be disabled if the current displayed timestamp would be invalid, but simplest approach: just attempt and skip if invalid)

2. **"Anchor to Current Time" button** (visible only when `!isPlaying && audioUrl`):
   - Text label: "Anchor to Playhead"
   - onClick: calls `setAnchor(selectedEventId, currentTime)` after validating with `validateAnchorTimestamp`
   - This anchors the selected note to wherever the audio scrubber is currently positioned

3. **"Remove Anchor" button** (visible only when `selectedEvent.isAnchor` is true):
   - Text label: "Remove Anchor"
   - onClick: calls `removeAnchor(selectedEventId)` from useSyncStore
   - Style: use a distinct style (e.g., `grunge-btn grunge-btn-sm text-red-400 border-red-400`) to indicate destructive action

Add `removeAnchor` to the destructured useSyncStore call at the top (line 66). It is already used via `useSyncStore.getState()` in the keyboard handler, but for the button we need it from the hook.

The buttons should appear in a row with small gaps. Use existing grunge-btn styling with grunge-btn-sm for compact size. Layout example:

```tsx
<div className="flex items-center gap-2">
  <span className="text-sm text-neutral-400">Timestamp:</span>
  <TimestampInput
    value={selectedAnchorTime ?? selectedEvent.computedTimestamp}
    onChange={handleTimestampChange}
    className="grunge-input w-28"
  />
  <button
    onClick={() => {
      if (selectedEventId) {
        const time = selectedAnchorTime ?? selectedEvent.computedTimestamp;
        if (validateAnchorTimestamp(selectedEventId, time)) {
          setAnchor(selectedEventId, time);
        }
      }
    }}
    className="grunge-btn grunge-btn-sm"
  >
    Anchor
  </button>
  {audioUrl && !isPlaying && (
    <button
      onClick={() => {
        if (selectedEventId && validateAnchorTimestamp(selectedEventId, currentTime)) {
          setAnchor(selectedEventId, currentTime);
        }
      }}
      className="grunge-btn grunge-btn-sm"
    >
      Anchor to Playhead
    </button>
  )}
  {selectedEvent.isAnchor && selectedEventId && (
    <button
      onClick={() => removeAnchor(selectedEventId)}
      className="grunge-btn grunge-btn-sm text-red-400 border-red-400 hover:bg-red-400 hover:text-black"
    >
      Remove Anchor
    </button>
  )}
  {selectedEvent.isAnchor && (
    <span className="text-xs border border-white text-white px-2 py-0.5 font-bold uppercase tracking-wider">
      Anchor
    </span>
  )}
</div>
```

Note: Keep the existing "Anchor" badge span that shows when the event is anchored -- it serves as a visual indicator separate from the action buttons.
  </action>
  <verify>
1. `npm run build` succeeds with no type errors
2. Manual check: select a note in sync view, see "Anchor" button; click it to set anchor
3. Pause audio, see "Anchor to Playhead" button appears; play audio, button disappears
4. When note has anchor, "Remove Anchor" button appears in red; clicking removes the anchor
5. Try anchoring a note to a time before its previous anchor -- should be rejected (no anchor set)
  </verify>
  <done>
- Anchor action buttons render conditionally based on selection state, playback state, and anchor existence
- Validation prevents out-of-order anchor timestamps
- Remove Anchor button removes anchors from selected notes
- handleTimestampChange also validates before setting
  </done>
</task>

</tasks>

<verification>
1. `npm run build` completes with zero errors
2. Reset button visually matches play button size
3. Selecting a note shows "Anchor" button; clicking anchors it to displayed timestamp
4. Pausing audio shows "Anchor to Playhead"; clicking anchors note to current audio time
5. Anchored notes show "Remove Anchor" in red; clicking removes the anchor
6. Attempting to anchor a note to a timestamp that violates ordering (before previous anchor or after next anchor) is silently rejected
</verification>

<success_criteria>
- Reset button is w-12 h-12 with w-7 h-7 icon (matching play button)
- Three conditional anchor buttons appear for selected notes
- Anchor validation enforces monotonic timestamp ordering
- All existing functionality (keyboard shortcuts, score clicking, playback) unaffected
</success_criteria>

<output>
After completion, create `.planning/quick/30-resize-reset-button-anchor-buttons-for-s/30-SUMMARY.md`
</output>
