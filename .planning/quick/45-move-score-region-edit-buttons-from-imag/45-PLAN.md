---
phase: quick-45
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/App.tsx
  - src/components/ScoreRegionEditor.tsx
autonomous: true
must_haves:
  truths:
    - "When user clicks 'Edit Score Region', the button is replaced in the inspector by 'Use Full Background' and 'Done' buttons"
    - "The ScoreRegionEditor overlay no longer renders its own bottom-bar buttons"
    - "Clicking 'Done' in the inspector exits editing mode"
    - "Clicking 'Use Full Background' in the inspector triggers the reset confirmation dialog"
    - "The confirmation dialog still works (Reset/Cancel)"
  artifacts:
    - path: "src/App.tsx"
      provides: "Inspector panel with conditional Edit/Done+Reset buttons"
    - path: "src/components/ScoreRegionEditor.tsx"
      provides: "Region editor overlay without built-in buttons"
  key_links:
    - from: "src/App.tsx"
      to: "src/components/ScoreRegionEditor.tsx"
      via: "onResetRegion callback prop"
      pattern: "onResetRegion"
---

<objective>
Move the "Use Full Background" and "Done" buttons from the ScoreRegionEditor overlay (fixed bottom bar) into the App.tsx inspector panel. When `isEditingRegion` is true, the "Edit Score Region" button should be replaced by the "Use Full Background" and "Done" buttons inline in the inspector.

Purpose: Improve UX by keeping editing controls in the inspector where the user initiated the action, rather than floating at the bottom of the viewport where they can overlap with content.
Output: Modified inspector panel with conditional button rendering and a cleaner ScoreRegionEditor overlay.
</objective>

<execution_context>
@/Users/emirahmed/.claude/get-shit-done/workflows/execute-plan.md
@/Users/emirahmed/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/App.tsx
@src/components/ScoreRegionEditor.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add onResetRegion callback to ScoreRegionEditor and remove its built-in buttons</name>
  <files>src/components/ScoreRegionEditor.tsx</files>
  <action>
Modify ScoreRegionEditor to externalize the button actions:

1. Add a new prop `onResetRegion: () => void` to the Props interface. This callback will be called when the user confirms the "Use Full Background" reset.

2. Remove the entire "Controls bar" div (lines 82-95 in current code -- the fixed bottom-6 div containing the "Use Full Background" and "Done" buttons). The inspector panel in App.tsx will now own these buttons.

3. Keep the confirmation dialog (`showConfirm` state and the modal) inside ScoreRegionEditor -- it is contextual to the overlay and should remain there. BUT change `handleResetClick` to instead call `onResetRegion()` directly (no confirmation dialog needed here anymore -- the inspector button will be labeled clearly enough). Actually, REMOVE the confirmation dialog entirely from ScoreRegionEditor. The reset logic will move to App.tsx.

4. Remove the `onClose` prop from the Props interface since "Done" is no longer rendered here. Also remove the `showConfirm` state and `handleResetClick`/`handleConfirmReset` handlers.

5. Final Props interface should be:
   ```ts
   interface Props {
     containerWidth: number;
     containerHeight: number;
     initialRegion: ScoreRegion | null;
     onRegionChange: (region: ScoreRegion | null) => void;
     scale?: number;
   }
   ```

6. The component should now ONLY render: the semi-transparent backdrop div and the Rnd draggable/resizable region. No buttons, no dialogs.
  </action>
  <verify>TypeScript compiles without errors: `cd /Users/emirahmed/Desktop/Manuscript/renderer && npx tsc --noEmit 2>&1 | head -30` (expect errors about App.tsx passing removed props -- that's fine, Task 2 fixes it)</verify>
  <done>ScoreRegionEditor renders only the backdrop overlay and draggable region, with no buttons or dialogs</done>
</task>

<task type="auto">
  <name>Task 2: Move buttons into the inspector panel in App.tsx</name>
  <files>src/App.tsx</files>
  <action>
Modify the inspector panel's "Score Region Editor Button" section (around lines 703-718) to conditionally render different content based on `isEditingRegion`:

1. When `isEditingRegion` is FALSE (current behavior, slightly adjusted):
   - Show the existing "Edit Score Region" button as-is
   - Show the existing region dimensions text if scoreRegion exists

2. When `isEditingRegion` is TRUE (new behavior):
   - Replace the "Edit Score Region" button with TWO buttons stacked or side-by-side:
     a. "Use Full Background" button -- `grunge-btn grunge-btn-sm` styling (secondary). On click, show a confirmation: use a local `showResetConfirm` state. If confirmed, call `setSetting("scoreRegion", null)` then `setIsEditingRegion(false)`. Use the same confirmation dialog pattern currently in ScoreRegionEditor (inline modal with "Reset Score Region?" title, explanation text, Cancel/Reset buttons).
     b. "Done" button -- `grunge-btn-primary grunge-btn-sm` styling (primary). On click, call `setIsEditingRegion(false)`.
   - Layout: Use `flex gap-2` to place both buttons side by side, both with `flex-1` so they share width equally within the inspector column.

3. Add a new state: `const [showResetConfirm, setShowResetConfirm] = useState(false);` near the existing `isEditingRegion` state (around line 209).

4. Update the ScoreRegionEditor JSX (around line 1078) to remove the `onClose` prop since it no longer exists on the component.

5. The confirmation dialog for reset should render as a fixed overlay (same as current ScoreRegionEditor implementation):
   ```tsx
   {showResetConfirm && (
     <div className="fixed inset-0 flex items-center justify-center z-[70]">
       <div className="bg-black border border-neutral-700 p-6 max-w-sm mx-4">
         <h3 className="text-sm font-bold text-white mb-2 uppercase tracking-wider" style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}>
           Reset Score Region?
         </h3>
         <p className="text-xs text-neutral-400 mb-4">
           This will reset the score to use the full background area.
         </p>
         <div className="flex gap-2 justify-end">
           <button onClick={() => setShowResetConfirm(false)} className="grunge-btn grunge-btn-sm">
             Cancel
           </button>
           <button onClick={() => { setSetting("scoreRegion", null); setIsEditingRegion(false); setShowResetConfirm(false); }} className="grunge-btn-primary grunge-btn-sm">
             Reset
           </button>
         </div>
       </div>
     </div>
   )}
   ```
   Place this confirmation dialog just before the closing of the main return JSX (before the final `</>`), so it renders as a portal-like overlay.

6. Reset `showResetConfirm` to false whenever `isEditingRegion` becomes false (add cleanup in the Done button handler -- already covered since setShowResetConfirm(false) is called in the reset handler, and Done doesn't trigger it).
  </action>
  <verify>Run `cd /Users/emirahmed/Desktop/Manuscript/renderer && npx tsc --noEmit` -- should compile with zero errors. Then run `npm run build` to verify the production build succeeds.</verify>
  <done>Inspector panel shows "Edit Score Region" when not editing, switches to "Use Full Background" + "Done" buttons when editing. Confirmation dialog works for reset. ScoreRegionEditor overlay no longer has floating buttons. TypeScript compiles cleanly.</done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` passes with zero errors
- `npm run build` succeeds
- Visual check: in the running app, clicking "Edit Score Region" in the inspector replaces it with two buttons
- Visual check: the ScoreRegionEditor overlay shows only the backdrop and draggable region (no floating bottom buttons)
- Clicking "Done" exits editing mode and restores the "Edit Score Region" button
- Clicking "Use Full Background" shows the confirmation dialog; confirming resets the region and exits editing
</verification>

<success_criteria>
- The "Use Full Background" and "Done" buttons appear in the inspector panel (not on the image overlay) when editing score region
- The "Edit Score Region" button is hidden while editing and reappears when done
- The reset confirmation dialog still functions correctly
- No TypeScript compilation errors
</success_criteria>

<output>
After completion, create `.planning/quick/45-move-score-region-edit-buttons-from-imag/45-SUMMARY.md`
</output>
