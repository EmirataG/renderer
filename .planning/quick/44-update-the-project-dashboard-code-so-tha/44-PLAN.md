---
phase: quick-44
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/ProjectCard.tsx
autonomous: true
must_haves:
  truths:
    - "Projects with a background image display that image in the card thumbnail area"
    - "Projects without a background image still show the MusicNoteIcon placeholder"
    - "Card dimensions remain unchanged (aspect-[4/3])"
  artifacts:
    - path: "src/components/ProjectCard.tsx"
      provides: "Background image rendering in project card"
  key_links:
    - from: "src/components/ProjectCard.tsx"
      to: "/api/projects/[id]/background"
      via: "img src using project.id"
      pattern: "/api/projects/.*/background"
---

<objective>
Display the project's background image (if any) in the dashboard ProjectCard thumbnail area instead of the placeholder music note icon. Card dimensions must not change.

Purpose: Give users a visual preview of their project's background directly from the dashboard.
Output: Updated ProjectCard.tsx with conditional background image rendering.
</objective>

<execution_context>
@/Users/emirahmed/.claude/get-shit-done/workflows/execute-plan.md
@/Users/emirahmed/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/components/ProjectCard.tsx
@src/types/project.ts
@src/app/api/projects/[id]/background/route.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add conditional background image to ProjectCard thumbnail</name>
  <files>src/components/ProjectCard.tsx</files>
  <action>
In the ProjectCard component, update the thumbnail placeholder area (the `div.aspect-[4/3].bg-neutral-900` at line 41) to conditionally render the project's background image when `project.backgroundUrl` is truthy.

When `project.backgroundUrl` exists:
- Render an `<img>` tag inside the existing `aspect-[4/3]` container with `src={/api/projects/${project.id}/background}` (the API proxy endpoint, same pattern used in App.tsx line 120).
- Style the img with `className="w-full h-full object-cover"` so it fills the container without changing dimensions.
- Keep `bg-neutral-900` on the container as a loading/fallback color behind the image.
- Do NOT use Next.js `<Image>` component here since the image comes from an API proxy route (not a static asset), and we want simplicity. A plain `<img>` with `alt={project.name}` is sufficient.

When `project.backgroundUrl` is falsy (undefined):
- Keep the existing MusicNoteIcon placeholder exactly as-is.

The outer container div must keep its existing classes unchanged: `aspect-[4/3] bg-neutral-900 flex items-center justify-center`. When showing the image, you can conditionally omit `flex items-center justify-center` or simply let the img fill the space (the flex centering won't affect a w-full h-full img).

Do NOT change any other part of the card (metadata section, menu, outer wrapper, dimensions).
  </action>
  <verify>
Run `npx tsc --noEmit` to confirm no TypeScript errors. Visually inspect that the conditional rendering logic is correct: ternary on `project.backgroundUrl` showing either img or MusicNoteIcon.
  </verify>
  <done>
ProjectCard displays the background image (via /api/projects/{id}/background) when project.backgroundUrl is set, and the MusicNoteIcon placeholder when it is not. Card dimensions (aspect-[4/3]) are unchanged.
  </done>
</task>

</tasks>

<verification>
- TypeScript compiles without errors (`npx tsc --noEmit`)
- ProjectCard conditionally renders `<img src="/api/projects/${project.id}/background">` when backgroundUrl exists
- ProjectCard falls back to MusicNoteIcon when backgroundUrl is undefined
- The `aspect-[4/3]` container is preserved, card layout unchanged
</verification>

<success_criteria>
- Projects with background images show that image as the card thumbnail
- Projects without background images show the music note placeholder
- No change to card dimensions or layout
</success_criteria>

<output>
After completion, create `.planning/quick/44-update-the-project-dashboard-code-so-tha/44-SUMMARY.md`
</output>
