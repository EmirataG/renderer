---
phase: quick-53
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/App.tsx
autonomous: true
must_haves:
  truths:
    - "When user uploads a new background image, the score region resets to cover the full background"
    - "When user removes the background image, the score region resets to null (full container)"
    - "On initial project load, the saved scoreRegion from Firestore is preserved (not overwritten)"
  artifacts:
    - path: "src/App.tsx"
      provides: "Score region auto-reset on background change"
  key_links:
    - from: "handleImageUpload"
      to: "setSetting('scoreRegion', null)"
      via: "direct call in handler"
      pattern: "setSetting.*scoreRegion.*null"
---

<objective>
Auto-reset score region when background image changes.

Purpose: When a user changes the background image, the old score region (sized for the previous image) becomes invalid. The score region should automatically reset to use the full size of the new background, so the user does not have to manually re-edit it every time.

Output: Modified App.tsx with automatic scoreRegion reset on background change.
</objective>

<execution_context>
@/Users/emirahmed/.claude/get-shit-done/workflows/execute-plan.md
@/Users/emirahmed/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/App.tsx
@src/stores/projectStore.ts
@src/components/ScoreRegionEditor.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Reset scoreRegion to null in handleImageUpload</name>
  <files>src/App.tsx</files>
  <action>
In `handleImageUpload` (around line 318), after updating bgUrl/bgFileName/bgFile, add a call to reset the score region:

```ts
setSetting("scoreRegion", null);
```

This goes AFTER the existing `setBgUrl(imageUrl || null)` call. When scoreRegion is null, both RegularRenderer and SingleLineRenderer already fall back to full container dimensions via `scoreRegion?.width ?? containerWidth` patterns, which is exactly the desired behavior -- the score covers the full background.

Also close the score region editor if it was open by adding:
```ts
setIsEditingRegion(false);
```

This handles both cases:
- **New image uploaded:** scoreRegion resets to null (full background), regionContainerDims recalculates via the existing bgUrl useEffect
- **Image removed:** scoreRegion resets to null (full default 16:9 container)

IMPORTANT: Do NOT modify the useEffect that calculates regionContainerDims (line 241). Do NOT modify the project loading code (line 120-137) -- the initial load must still honor the saved scoreRegion from Firestore. The reset should ONLY happen in handleImageUpload which is exclusively called from user-initiated UploadDropZone actions.
  </action>
  <verify>
1. Read the modified handleImageUpload function and confirm setSetting("scoreRegion", null) is called
2. Read the project load code (lines 120-137) and confirm it still loads scoreRegion from project data
3. Run `npx tsc --noEmit` to verify no type errors
  </verify>
  <done>
- handleImageUpload resets scoreRegion to null when background changes
- handleImageUpload closes score region editor when background changes
- Initial project load still preserves saved scoreRegion from Firestore
- TypeScript compiles without errors
  </done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` passes
- In handleImageUpload: setSetting("scoreRegion", null) is present
- In project load effect: scoreRegion loaded from project.scoreRegion (unchanged)
</verification>

<success_criteria>
When user uploads a new background image, the score region automatically resets to use the full background size. When user removes the background, the region resets to default. On initial project load, the saved score region is still honored.
</success_criteria>

<output>
After completion, create `.planning/quick/53-when-the-background-image-is-changed-the/53-SUMMARY.md`
</output>
