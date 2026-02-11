# Phase 24: Project Dashboard & CRUD - Context

**Gathered:** 2026-02-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Users can create, browse, open, and delete projects from a dashboard. Creation modal lets users upload a score file and audio file, name the project, and choose a view mode. Dashboard shows a grid of project cards. Clicking opens the editor. Deleting removes the project permanently. File persistence and auto-save are separate phases.

</domain>

<decisions>
## Implementation Decisions

### Creation modal flow
- Two-step modal: Step 1 uploads files, Step 2 sets name + view mode
- Drag-and-drop zones for file upload (click also opens file picker)
- Separate drop zones for score and audio files
- Score accepts: .musicxml, .mxl, .mei
- Audio accepts: .mp3, .wav
- Project name is a required field — user must provide it (no auto-fill from filename)
- View mode shows "Page view" as active and "Single line" as disabled with "coming soon" label

### Delete experience
- Three-dot context menu on each project card reveals "Delete" option
- Confirmation dialog before deletion: "Delete '[project name]'? This cannot be undone."
- Toast notification after deletion: "Project deleted — Undo"
- Undo available in toast for ~5 seconds; actual deletion delayed until timeout expires
- Card disappears from grid immediately on delete action

### Claude's Discretion
- Dashboard grid layout, card sizing, and responsive behavior
- Project card design (thumbnail, metadata shown, hover states)
- Empty dashboard state (no projects yet)
- Toast styling and animation
- Drag-and-drop zone visual design (icons, hover states, file validation feedback)
- Modal transitions and animations
- Sorting/ordering of projects on the dashboard

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 24-project-dashboard-crud*
*Context gathered: 2026-02-11*
