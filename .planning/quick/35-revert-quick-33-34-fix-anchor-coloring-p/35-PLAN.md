---
phase: "35"
plan: 1
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/SyncEditor.tsx
autonomous: true
---

<objective>
Revert quick-33/34, then properly fix anchor coloring and container width.

Root cause: Two separate coloring effects (anchor + selection) had timing bugs with the async
Verovio render. The anchor effect and selection effect raced with SVG DOM updates.

Fix approach:
1. Revert quick-33 and quick-34 (ineffective patches)
2. Replace TWO separate coloring effects with ONE unified effect that applies ALL colors from scratch
3. Measure container width once (disconnect ResizeObserver) so Verovio never re-renders on resize
4. Score container uses scrolling for overflow (already overflow-auto)
</objective>
