---
phase: quick
plan: 006
type: execute
wave: 1
depends_on: []
files_modified:
  - src/stores/unplayedStyleStore.ts
  - src/lib/unplayedStyling.ts
  - src/renderers/SingleLineRenderer.tsx
  - src/renderers/RegularRenderer.tsx
  - src/App.tsx
  - .planning/STATE.md
autonomous: true

must_haves:
  truths:
    - "Unplayed styling feature is completely removed"
    - "Renderers work without clip-path overlays"
    - "App.tsx has no unplayed styling controls"
  artifacts:
    - path: "src/renderers/SingleLineRenderer.tsx"
      provides: "Clean renderer without unplayed styling"
    - path: "src/renderers/RegularRenderer.tsx"
      provides: "Clean renderer without unplayed styling"
---

<objective>
Revert Phase 13.1 (Unplayed Score Styling) completely.

Purpose: The unplayed styling feature (clip-path for continuous elements, direct styles for discrete) doesn't work correctly and needs to be removed entirely.
Output: Clean codebase without any Phase 13.1 changes.
</objective>

<execution_context>
@/Users/emirahmed/.claude/get-shit-done/workflows/execute-plan.md
@/Users/emirahmed/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/PROJECT.md

Reference commits to revert (most recent first):
- 40b0564 fix(13.1): fix unplayed styling issues
- 9cd45e9 feat(13.1-03): integrate unplayed styling in RegularRenderer
- a6a6a3d feat(13.1-02): integrate unplayed styling in SingleLineRenderer
- 7cdf0a5 feat(13.1-02): create unplayedStyling.ts core logic
- d4ac1b5 feat(13.1-01): add unplayed styling controls to Inspector
- 63bbfd0 feat(13.1-01): create unplayedStyleStore with Zustand
</context>

<tasks>

<task type="auto">
  <name>Task 1: Delete Phase 13.1 files</name>
  <files>
    src/stores/unplayedStyleStore.ts
    src/lib/unplayedStyling.ts
  </files>
  <action>
    Delete the two files created by Phase 13.1:
    - `src/stores/unplayedStyleStore.ts` (Zustand store for unplayed styling settings)
    - `src/lib/unplayedStyling.ts` (clip-path and styling logic)

    Use `rm` to delete both files.
  </action>
  <verify>
    Both files no longer exist:
    - `ls src/stores/unplayedStyleStore.ts` returns "No such file"
    - `ls src/lib/unplayedStyling.ts` returns "No such file"
  </verify>
  <done>Phase 13.1 specific files are removed from codebase</done>
</task>

<task type="auto">
  <name>Task 2: Restore modified files to pre-13.1 state</name>
  <files>
    src/renderers/SingleLineRenderer.tsx
    src/renderers/RegularRenderer.tsx
    src/App.tsx
  </files>
  <action>
    Restore three files to their state at commit e097324 (before Phase 13.1):

    ```bash
    git checkout e097324 -- src/renderers/SingleLineRenderer.tsx
    git checkout e097324 -- src/renderers/RegularRenderer.tsx
    git checkout e097324 -- src/App.tsx
    ```

    This removes:
    - Unplayed styling imports and hooks from renderers
    - Clip-path overlay SVG elements
    - Inspector controls for unplayed styling in App.tsx
  </action>
  <verify>
    - `grep -c "unplayedStyling" src/renderers/SingleLineRenderer.tsx` returns 0
    - `grep -c "unplayedStyling" src/renderers/RegularRenderer.tsx` returns 0
    - `grep -c "unplayedStyleStore" src/App.tsx` returns 0
  </verify>
  <done>All three files restored to clean pre-13.1 state</done>
</task>

<task type="auto">
  <name>Task 3: Update STATE.md and commit revert</name>
  <files>
    .planning/STATE.md
  </files>
  <action>
    1. Update STATE.md:
       - Change "Current Position" from Phase 13.1 back to Phase 12
       - Remove Phase 13.1 decisions from Accumulated Context
       - Update "Last activity" and "Stopped at"
       - Update Session Continuity section

    2. Commit the revert:
       ```bash
       git add -A
       git commit -m "revert(13.1): remove unplayed styling feature

       Phase 13.1 (Unplayed Score Styling) didn't work correctly.
       Reverting to state after Phase 12 completion.

       Removed:
       - src/stores/unplayedStyleStore.ts
       - src/lib/unplayedStyling.ts
       - Unplayed styling integration in SingleLineRenderer
       - Unplayed styling integration in RegularRenderer
       - Inspector controls for unplayed styling"
       ```
  </action>
  <verify>
    - `git log -1 --oneline` shows revert commit
    - `git status` shows clean working tree
    - Application runs without errors: `npm run dev` starts successfully
  </verify>
  <done>Revert is committed and codebase is in clean state</done>
</task>

</tasks>

<verification>
- Both unplayedStyleStore.ts and unplayedStyling.ts are deleted
- SingleLineRenderer.tsx has no unplayedStyling imports or usage
- RegularRenderer.tsx has no unplayedStyling imports or usage
- App.tsx has no unplayedStyleStore imports or UI controls
- Application builds and runs without errors
- Git history shows clean revert commit
</verification>

<success_criteria>
- Zero references to "unplayedStyling" or "unplayedStyleStore" in src/
- npm run dev starts without errors
- Renderers display score without clip-path overlays
- STATE.md reflects current position as Phase 12 complete
</success_criteria>

<output>
After completion, create `.planning/quick/006-revert-phase-13-1/006-SUMMARY.md`
</output>
