---
phase: quick-004
plan: 01
subsystem: ui
tags: [verovio, font, ui, inspector]
dependency-graph:
  requires: [quick-003]
  provides: [music-font-selector, clean-single-line-renderer]
  affects: []
tech-stack:
  added: []
  patterns: [prop-drilling-for-options]
key-files:
  created: []
  modified:
    - src/hooks/useSingleLineVerovio.ts
    - src/hooks/useVerovio.ts
    - src/renderers/SingleLineRenderer.tsx
    - src/renderers/RegularRenderer.tsx
    - src/App.tsx
    - src/index.css
decisions:
  - key: revert-staff-alignment
    choice: "Remove quick-003 staff alignment feature entirely"
    why: "Feature didn't work correctly; clean slate for future alignment attempts"
  - key: font-selector-ui
    choice: "Dropdown in Score Appearance section with 5 font options"
    why: "Verovio supports these fonts natively; dropdown is consistent with other settings"
  - key: font-default
    choice: "Bravura as default font"
    why: "Bravura is the SMuFL reference font and Verovio's default"
metrics:
  duration: 3 min
  completed: 2026-02-07
---

# Quick Task 004: Revert Staff Alignment + Add Music Font Selector

Reverted the failed quick-003 staff line alignment feature and added a music font selection dropdown.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Revert quick-003 staff alignment changes | db6d967 | useSingleLineVerovio.ts, SingleLineRenderer.tsx |
| 2 | Add music font selector to inspector | 74a4c6c | App.tsx, useVerovio.ts, useSingleLineVerovio.ts, RegularRenderer.tsx, SingleLineRenderer.tsx, index.css |

## What Was Done

### Task 1: Revert Staff Alignment

Removed all quick-003 staff alignment code:
- Removed `sectionStaffOffsets` from `UseSingleLineVerovioResult` interface
- Removed `extractStaffYOffset` function (regex-based SVG parsing)
- Removed `sectionStaffOffsets` state and all `setSectionStaffOffsets` calls
- Removed `referenceStaffY` computation and `alignmentOffset` in renderer JSX
- Sections now render without vertical `translateY` offsets

### Task 2: Add Music Font Selector

Added music font selection to inspector UI:
- Added `musicFont` state in App.tsx (default: 'Bravura')
- Added `<select>` dropdown with options: Bravura, Petaluma, Leland, Gootville, Leipzig
- Added `musicFont` prop to both `SingleLineRenderer` and `RegularRenderer`
- Updated `useVerovio` and `useSingleLineVerovio` hooks to accept `font` parameter
- Added `font: font.toLowerCase()` to Verovio `setOptions()` calls
- Added `font` to useEffect dependency arrays for re-render on font change
- Added `.grunge-select` CSS styles in index.css

## Verification

- Build passes with no TypeScript errors
- No staff alignment code remains (`grep` returns no results)
- Music font dropdown visible in Score Appearance section
- Font prop flows through: App -> Renderer -> Hook -> Verovio

## Deviations from Plan

None - plan executed exactly as written.
